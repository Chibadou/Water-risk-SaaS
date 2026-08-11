// Unit tests for lib/rattachement — ADR-003 and the end of anti-pattern n°1.
// npx tsx scripts/test/rattachement.test.ts
//
// The demonstration this module exists for is one comparison: a site drawing 99 %
// of its water from a network under vigilance and 1 % from a river in crisis must
// NOT come out in crisis. If that test ever passes trivially, the module is doing
// nothing and the maximum is back.
//
// Section 6 reads the repository's own source to prove `maxGravite` is no longer
// called from the site sheet, the dashboard or the map API — the three call sites
// SPRINTS.md named. That is a shape constraint: a value test cannot see the
// difference between a weighted level and a maximum when only one resource exists.

import { readFileSync } from "fs";
import { resolveRattachement, niveauEffectif, ZONE_TYPES } from "../../lib/rattachement";
import { GRAVITE } from "../../lib/gravite";
import type { SiteUsage } from "../../lib/sites";
import type { NiveauGravite, VigieauZone, ZoneType } from "../../lib/types";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number | undefined, b: number, tol = 0.02) =>
  a !== undefined && Math.abs(a - b) <= tol;

const zone = (
  type: ZoneType,
  niveau: NiveauGravite,
  code = `${type}-1`,
  nom = `Zone ${type}`,
): VigieauZone => ({ code, nom, type, niveauGravite: niveau });

/**
 * ⚠️ `part` is a FRACTION (0-1), not a percentage: `resolveUsageVolume` clamps
 * with `Math.min(1, part)`, so `part: 99` would silently become 100 % and every
 * share would come out equal. The form asks for percentages and divides.
 *
 * ⚠️ `sourceType` uses the SAME three symbols as ZoneType ("SUP" | "SOU" | "AEP").
 * Writing "reseau" here compiles under a loose cast and matches nothing.
 */
const usage = (
  sourceType: SiteUsage["sourceType"],
  part: number,
  extra: Partial<SiteUsage> = {},
): SiteUsage => ({ id: `u-${sourceType}`, usageCode: `usage ${sourceType}`, sourceType, part, ...extra });

// ---- 1. The comparison the module exists for ----
{
  const zones = [zone("AEP", "vigilance"), zone("SUP", "crise")];

  // ⚠️ The old behaviour: max(vigilance, crise) = crise. A factory on the mains
  // declared in crisis because of a fire pond carrying 1 % of its withdrawals.
  const maximum = resolveRattachement(zones, {});
  check("no declaration: the fallback IS the maximum — the conservative default",
    maximum.niveauEffectif === "crise");
  check("no declaration: but it is flagged as degraded, not as a reading",
    maximum.degrade && maximum.base === "maximum");
  check("no declaration: and the detail says a network site may not be subject to it",
    /raccordé au réseau/.test(maximum.detail));

  // The vector: 99 % network, 1 % river.
  const pondere = resolveRattachement(zones, {
    usages: [usage("AEP", 0.99), usage("SUP", 0.01)],
  });
  check("vector: 99 % network under vigilance + 1 % river in crisis is NOT in crisis",
    pondere.niveauEffectif !== "crise");
  // 0.99 × rank(vigilance)=1 + 0.01 × rank(crise)=4 → 1.03.
  check("vector: the effective rank is a real number, not a named level",
    near(pondere.rangEffectif, 1 * 0.99 + 4 * 0.01));
  check("vector: it is not degraded — it is a reading of this site",
    !pondere.degrade && pondere.base === "vecteur");
  // ⚠️ And the 1 % is NOT lost: the rank is strictly above pure vigilance.
  check("vector: the 1 % in crisis still moves the figure — it is not rounded away",
    pondere.rangEffectif > GRAVITE.vigilance.rank);
}

// ---- 2. Reversing the shares reverses the answer ----
{
  const zones = [zone("AEP", "vigilance"), zone("SUP", "crise")];
  const majoriteRiviere = resolveRattachement(zones, {
    usages: [usage("AEP", 0.05), usage("SUP", 0.95)],
  });
  check("shares: 95 % from the river in crisis lands near crisis",
    near(majoriteRiviere.rangEffectif, 1 * 0.05 + 4 * 0.95));
  check("shares: … and the named level follows", majoriteRiviere.niveauEffectif === "crise");
  // The module is doing work: the same zones, opposite answers.
  const majoriteReseau = resolveRattachement(zones, {
    usages: [usage("AEP", 0.95), usage("SUP", 0.05)],
  });
  check("shares: the SAME zones give opposite levels by share alone",
    majoriteReseau.niveauEffectif !== majoriteRiviere.niveauEffectif);
}

// ---- 3. Exempt volume does not dilute the level ----
{
  const zones = [zone("AEP", "vigilance"), zone("SUP", "crise")];
  // A large exempt network usage (sanitary water, never restricted) must not
  // water down the river share: exempt water CANNOT be restricted, so it has no
  // business weighting a restriction level.
  const r = resolveRattachement(zones, {
    usages: [usage("AEP", 0.9, { isExempt: true }), usage("SUP", 0.1)],
  });
  check("exempt: an exempt usage is excluded from the weighting",
    near(r.rangEffectif, GRAVITE.crise.rank));
  check("exempt: … so the only restrictable source governs", r.niveauEffectif === "crise");
}

// ---- 4. The JS vector: always three entries, absences visible ----
{
  const r = resolveRattachement([zone("SUP", "alerte")], {});
  check("vector: all three resources are listed", r.parRessource.length === ZONE_TYPES.length);
  const aep = r.parRessource.find((x) => x.type === "AEP");
  // ⚠️ "no zone of this type here" and "a zone with no restriction" are DIFFERENT
  // facts and only one of them says something about the site.
  check("vector: an uncovered resource has no level, rather than a calm one",
    aep?.niveau === undefined);
  check("vector: the covered one carries its zone identity",
    r.parRessource.find((x) => x.type === "SUP")?.zoneCode === "SUP-1");
}

// ---- 5. rattachement_ambigu: listed, never resolved silently (ADR-003) ----
{
  // Two SUP zones covering one point — VigiEau's referential overlaps in places.
  const r = resolveRattachement(
    [zone("SUP", "alerte", "SUP-A", "Eure aval"), zone("SUP", "crise", "SUP-B", "Eure amont")],
    {},
  );
  check("ambiguous: flagged", r.ambigu);
  check("ambiguous: both candidates are listed for a human to decide",
    r.candidats[0]?.zones.length === 2);
  check("ambiguous: the candidates keep their codes",
    r.candidats[0]?.zones.map((z) => z.code).join(",") === "SUP-A,SUP-B");
  check("ambiguous: the reason is stated in words", /plusieurs zones/.test(r.motifAmbiguite ?? ""));
  // ⚠️ Within ONE resource the maximum is legitimate: the site really is subject
  // to both arrêtés on the water it takes from that resource. This is not
  // anti-pattern n°1, which is about maxing ACROSS resources.
  check("ambiguous: within one resource the worst of the two governs",
    r.parRessource.find((x) => x.type === "SUP")?.niveau === "crise");

  // A declared source with no zone at all: a gap, not a zero.
  const orpheline = resolveRattachement([zone("AEP", "alerte")], {
    usages: [usage("AEP", 0.5), usage("SOU", 0.5)],
  });
  check("ambiguous: a declared source with no covering zone is flagged", orpheline.ambigu);
  check("ambiguous: and named in the reason", /sans zone d'alerte/.test(orpheline.motifAmbiguite ?? ""));

  const net = resolveRattachement([zone("SUP", "alerte")], {});
  check("unambiguous: one zone per type raises no flag", !net.ambigu && net.candidats.length === 0);
}

// ---- 6. The single declared origin is the middle rung, and says so ----
{
  const zones = [zone("AEP", "vigilance"), zone("SUP", "crise")];
  const r = resolveRattachement(zones, { origine: "aep" });
  check("origine: a single declared origin selects its resource",
    r.niveauEffectif === "vigilance");
  check("origine: it is NOT presented as a weighting",
    r.base === "origine_unique" && /Pas une pondération/.test(r.detail));
  // ⚠️ It is still degraded: one resource carries 100 % of a site that may draw
  // from two. The Sprint 21 behaviour, now labelled.
  check("origine: and it is marked degraded, because 100 % on one source is a guess",
    r.degrade);
}

// ---- 7. Nothing readable is "cannot say", never a level ----
{
  const r = resolveRattachement([], {});
  check("empty: no effective level at all", r.niveauEffectif === undefined);
  check("empty: rank 0 with base 'aucune', so no caller reads it as calm",
    r.rangEffectif === 0 && r.base === "aucune");
  check("empty: the detail says the zones are unreadable", /Aucune zone/.test(r.detail));

  // A zone with an unreadable level contributes nothing.
  const illisible = resolveRattachement(
    [{ code: "X", type: "SUP", niveauGravite: undefined }],
    {},
  );
  check("unreadable level: no effective level invented", illisible.niveauEffectif === undefined);
}

// ---- 8. niveauEffectif always hands back the provenance ----
{
  const zones = [zone("AEP", "vigilance"), zone("SUP", "crise")];
  const r = niveauEffectif(zones, {});
  check("api: the helper returns the level", r.niveau === "crise");
  // ⚠️ The signature is the point. `maxGravite(zones)` returned a bare level and
  // no caller could know whether it was a reading or a fallback — which is how
  // anti-pattern n°1 survived being "fixed" at Sprint 21.
  check("api: … and cannot return it without its provenance",
    r.degrade === true && r.base === "maximum");
}

// ---- 9. maxGravite is gone from the three call sites SPRINTS.md named ----
{
  const files = [
    "components/HomeClient.tsx",
    "components/SitesDashboard.tsx",
    "app/api/carte/etat/route.ts",
    "components/ResultPanel.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(f, "utf-8");
    const code = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*|\s*\{\/\*)/.test(l))
      .join("\n");
    check(`${f} no longer calls maxGravite`, !/\bmaxGravite\s*\(/.test(code));
  }

  // ⚠️ The function itself SURVIVES, deliberately. It is the honest fallback when
  // there is genuinely nothing to weight with, and lib/rattachement calls that
  // path `maximum`. What must not come back is an unlabelled call in a component.
  const rat = readFileSync("lib/rattachement.ts", "utf-8");
  check("the fallback rung is named in the module, not hidden", /"maximum"/.test(rat));
}

console.log(failures === 0 ? "rattachement: all checks pass" : `rattachement: ${failures} FAILED`);
if (failures > 0) process.exit(1);
