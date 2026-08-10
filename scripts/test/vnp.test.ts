// Unit tests for the volume non prélevable (lib/vnp).
// npx tsx scripts/test/vnp.test.ts
//
// Section 5 is the unusual one: it reads the module's own source to prove that
// no code path aggregates the crisis and structural components. Anti-pattern n°3
// is a shape constraint, not a value one, so a value test cannot catch it — the
// day someone adds a convenient `total`, the suite must fail rather than a
// reviewer having to notice.

import { readFileSync } from "fs";
import {
  computeVnp,
  resolveVref,
  vnpComponents,
  PLAN_EAU_2030,
  type VnpInput,
} from "../../lib/vnp";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number | undefined, b: number, tol = 1) =>
  a !== undefined && Math.abs(a - b) <= tol;

const base = (over: Partial<VnpInput> = {}): VnpInput => ({
  daysByLevel: { alerte: 30, crise: 10 },
  exposure: { alerte: { min: 0.5, max: 0.5 }, crise: { min: 0.7, max: 0.7 } },
  vref: resolveVref({ volumeDeclareM3: 365_000 }),
  ...over,
});

// ---- 1. V_ref is typed by regime, and a missing one is refused ----
{
  const none = resolveVref({});
  check("vref: nothing declared → indisponible", none.regime === "indisponible");
  check("vref: and the refusal is motivated, not silent", /pas calculé/.test(none.detail));
  check("vref: no volume is invented", none.volumeM3 === undefined);

  const declared = resolveVref({ volumeDeclareM3: 100_000 });
  check("vref: a declared volume outside ICPE is labelled as internal", declared.regime === "declare");
  check("vref: and says no regulatory definition applies", /aucune définition réglementaire/.test(declared.detail));

  const icpe = resolveVref({ volumeDeclareM3: 100_000, icpe: true });
  check("vref: an ICPE site is labelled as such", icpe.regime === "icpe");
  check("vref: and the trail names the arrêté", /30 juin 2023/.test(icpe.detail));
  // ⚠️ The honest part: the ICPE branch does NOT implement the formula.
  check("vref: the unimplemented regulatory definition is disclosed in the trail",
    /n'est pas encore appliquée/.test(icpe.detail));

  check("vref: zero is not a volume", resolveVref({ volumeDeclareM3: 0 }).regime === "indisponible");
}

// ---- 2. A missing input yields no VNP, never a zero ----
{
  const r = computeVnp(base({ vref: resolveVref({}) }));
  check("missing vref: not available", !r.available);
  check("missing vref: says why", /non déclaré/.test(r.message ?? ""));
  check("missing vref: no crisis component at all — not a 0 m³ one", r.crise === undefined);

  const noDays = computeVnp(base({ daysByLevel: {} }));
  check("no restriction days: nothing to compute, and it says so", !noDays.available);
}

// ---- 3. The formula, and its three requirements ----
{
  // 365 000 m³/an = 1 000 m³/day. 30 days at ρ=0.5 → 15 000; 10 days at ρ=0.7 → 7 000.
  const r = computeVnp(base());
  check("formula: 30 j × 0.5 + 10 j × 0.7 on 1 000 m³/j → 22 000 m³", near(r.crise?.min, 22_000));
  check("formula: all quantified ⇒ min === max", r.crise?.min === r.crise?.max);

  // (b) exempt volume is deducted BEFORE ρ is applied.
  const exempt = computeVnp(base({ exemptM3: 36_500 }));
  check("exempt: deducting 10 % of the reference cuts the VNP by 10 %", near(exempt.crise?.min, 19_800));

  // (c) restitution turns withdrawal into consumption.
  const openCircuit = computeVnp(base({ tauxRestitution: 0.95 }));
  check("restitution: 95 % returned → the VNP falls to 5 %", near(openCircuit.crise?.min, 1_100));
  const evaporative = computeVnp(base({ tauxRestitution: 0.05 }));
  check("restitution: 5 % returned → 95 % of the volume", near(evaporative.crise?.min, 20_900));
  check("restitution: the two differ by a factor of 19, as §4.2c warns",
    near((evaporative.crise?.min ?? 0) / (openCircuit.crise?.min ?? 1), 19, 0.1));
}

// ---- 4. The interval survives all the way to cubic metres (G2) ----
{
  const r = computeVnp(
    base({
      // An unquantified measure at crise: [0, 1].
      exposure: { alerte: { min: 0.5, max: 0.5 }, crise: { min: 0, max: 1 } },
    }),
  );
  check("interval: 30 j quantified + 10 j unquantified → min 15 000", near(r.crise?.min, 15_000));
  check("interval: … and max 25 000", near(r.crise?.max, 25_000));
  check("interval: the range is real, not a point", (r.crise?.max ?? 0) > (r.crise?.min ?? 0));
}

// ---- 5. Anti-pattern n°3: the components cannot be aggregated ----
{
  const r = computeVnp(base({ trajectoire: PLAN_EAU_2030 }));
  check("structural: the Plan Eau component is computed", r.structurel !== undefined);
  check("structural: 10 % of 365 000 m³ → 36 500", near(r.structurel?.min, 36_500));
  check("structural: its detail says it must not be added", /ne s'additionne pas/.test(r.structurel?.detail ?? ""));

  // The shape constraint: no field combines them.
  const keys = Object.keys(r);
  check("shape: no `total` field on the result", !keys.includes("total"));
  check("shape: no `vnp` catch-all field either", !keys.includes("vnp"));

  // And no code path in the module adds them. Reading the source is the only way
  // to test a shape constraint; the mirror-test pattern already used for
  // DEPENDANCE_FACTOR in portefeuille.test.ts.
  const src = readFileSync("lib/vnp.ts", "utf-8");
  const sums = [
    /crise\s*\+\s*structurel/,
    /structurel\s*\+\s*crise/,
    /crise\.min\s*\+\s*structurel/,
    /total\s*[:=]\s*.*structurel/,
  ];
  check("shape: no expression in lib/vnp.ts adds the two components",
    !sums.some((re) => re.test(src)));

  // The only exported way to read both keeps them apart.
  const parts = vnpComponents(r);
  check("shape: vnpComponents returns them as two labelled entries", parts.length === 2);
  check("shape: with distinct ids", parts[0].id !== parts[1].id);
}

// ---- 6. κ = 1 is named, not implied (ADR-005) ----
{
  const r = computeVnp(base());
  check("kappa: defaults to 1", r.kappa === 1);
  check("kappa: the assumption is stated in words",
    r.hypotheses.some((h) => h.includes("κ = 1") && h.includes("NOMINAL")));
  check("kappa: and called conservative", r.hypotheses.some((h) => /conservatrice/.test(h)));

  const withKappa = computeVnp(base({ kappa: 0.8 }));
  check("kappa: applying 0.8 scales the VNP", near(withKappa.crise?.min, 22_000 * 0.8));
}

// ---- 7. The assumption journal records what is missing (ADR-006) ----
{
  const r = computeVnp(base());
  check("journal: an undeclared restitution rate is journalled",
    r.hypotheses.some((h) => /Taux de restitution non déclaré/.test(h)));
  check("journal: … and names the order-of-magnitude risk",
    r.hypotheses.some((h) => /ordre de grandeur/.test(h)));
  check("journal: the flat monthly profile is journalled (G19)",
    r.hypotheses.some((h) => /supposé PLAT/.test(h)));
  check("journal: … and names the direction of the error",
    r.hypotheses.some((h) => /SOUS-ESTIMÉ/.test(h)));
  const withProfile = computeVnp(base({ profilMensuel: new Array(12).fill(1 / 12) }));
  check("journal: a declared profile is not journalled as an assumption",
    !withProfile.hypotheses.some((h) => /supposé PLAT/.test(h)));
  check("journal: an undeclared exempt volume is journalled",
    r.hypotheses.some((h) => /Aucun volume exempté/.test(h)));
  check("journal: the V_ref trail travels with the figure", r.vrefDetail.length > 0);

  // A level whose measures could not be read contributes nothing, and says so.
  const partial = computeVnp(
    base({ exposure: { alerte: { min: 0.5, max: 0.5 } } }), // crise missing
  );
  check("journal: days at an unreadable level are excluded, not zeroed",
    partial.hypotheses.some((h) => /ne comptent pas 0 m³/.test(h)));
  check("journal: and only the covered days are counted", near(partial.crise?.min, 15_000));
}

console.log(failures === 0 ? "vnp: all checks pass" : `vnp: ${failures} FAILED`);
if (failures > 0) process.exit(1);
