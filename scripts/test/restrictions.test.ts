// Unit tests for the prefectural restriction reader (lib/restrictions).
// npx tsx scripts/test/restrictions.test.ts
//
// Every string in sections 1, 2 and 6 is a VERBATIM measure observed in the
// VigiEau "Restrictions" resource (74 974 rows; probe runs 30586667807 and
// 31356782500). Calibrating on invented phrasings would prove nothing about the
// real file.
//
// ⚠️ Section 6 exists because that principle was not enough. The suite was
// verbatim-calibrated and still missed three defects, for one reason: none of
// those three phrasings had been put in it. A verbatim corpus only protects the
// cases someone thought to include, so the three that were found in production
// at Sprint 38 are pinned here with their measured values.

import {
  restrictionSeverity,
  exposureForProfil,
  isPoint,
  RHO_MAX_UNQUANTIFIED,
  RHO_MIN_CONDITIONAL_BAN,
  type RestrictionRow,
} from "../../lib/restrictions";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9;
/** A quantified reading: interval collapsed to a point at the expected value. */
const pointAt = (r: ReturnType<typeof restrictionSeverity>, v: number) =>
  isPoint(r.rho) && near(r.rho.min, v);

// ---- 1. Real measures, verbatim from the published file ----
{
  const total = restrictionSeverity("Interdiction totale");
  check("verbatim: 'Interdiction totale' → 1.0", pointAt(total, 1) && total.rho.type === "total_ban");

  const bare = restrictionSeverity("Interdit");
  check("verbatim: 'Interdit' → 1.0", pointAt(bare, 1));

  const span = restrictionSeverity("Interdiction de 8h à 20h.");
  check(
    "verbatim: 'Interdiction de 8h à 20h.' → 12 h/24 measured, not a guess",
    pointAt(span, 0.5) && span.rho.type === "time_window",
  );

  const span2 = restrictionSeverity("Interdiction de 11h à 18h.");
  check("verbatim: 'de 11h à 18h' → 7 h/24", pointAt(span2, 7 / 24));

  const exempted = restrictionSeverity("Interdiction totale sauf autorisation administrative");
  check(
    "verbatim: ban with exemption → interval [0.85, 1], not a point",
    exempted.rho.type === "total_ban" &&
      near(exempted.rho.min, RHO_MIN_CONDITIONAL_BAN) &&
      near(exempted.rho.max, 1) &&
      !isPoint(exempted.rho),
  );

  const sanitary = restrictionSeverity("Interdiction totale sauf impératif sanitaire");
  check("verbatim: ban with sanitary exemption → same interval", near(sanitary.rho.min, RHO_MIN_CONDITIONAL_BAN));

  const noLimit = restrictionSeverity("Pas de limitation sauf arrêté spécifique");
  check(
    "verbatim: 'Pas de limitation sauf arrêté spécifique' → 0, not read as a ban",
    pointAt(noLimit, 0) && noLimit.rho.type === "none",
  );

  const allowed = restrictionSeverity("Autorisé");
  check("verbatim: bare 'Autorisé' → 0", pointAt(allowed, 0) && allowed.rho.type === "none");

  for (const s of [
    "Sensibiliser le grand public et les collectivités aux règles de bon usage d’économie d’eau.",
    "Information via communiqué de presse",
    "Application des règles de bon usage d’économie d’eau par les usagers. ",
    "Incitation des particuliers et des professionnels à économiser l’eau. (Sensibilisation mais pas de restriction",
    "Il est recommandé à l’ensemble des usagers d’adopter une gestion économe de l’eau afin de préserver la ressource",
    "Prévenir les agriculteurs",
  ]) {
    const r = restrictionSeverity(s);
    check(
      `verbatim awareness → 0 volume lost: « ${s.slice(0, 42)}… »`,
      pointAt(r, 0) && r.rho.type === "recommendation",
    );
  }
}

// ---- 2. Quantities win over coarse wording ----
{
  const r = restrictionSeverity("Interdiction de 9h à 20h.");
  check("quantified beats coarse: hour span preferred over the word 'interdiction'", r.rho.type === "time_window");
  check("quantified: 9h→20h is 11 h/24", pointAt(r, 11 / 24));

  const pct = restrictionSeverity("Réduction de 50 % des prélèvements");
  check("quantified: explicit percentage → 0.5", pointAt(pct, 0.5) && pct.rho.type === "percentage");

  const overnight = restrictionSeverity("Interdiction de 20h à 8h");
  check("quantified: overnight window wraps midnight → 12 h/24", pointAt(overnight, 0.5));
}

// ---- 3. Unquantified measures carry the full interval, never a point ----
{
  const empty = restrictionSeverity(undefined);
  check("missing measure → interval [0, 1], not a point", empty.rho.type === "unquantified" && !isPoint(empty.rho));
  check("missing measure spans the full range", near(empty.rho.min, 0) && near(empty.rho.max, RHO_MAX_UNQUANTIFIED));

  const opaque = restrictionSeverity("Se référer à l'annexe 3 du présent arrêté");
  check("unparseable prose → unquantified interval", opaque.rho.type === "unquantified" && !isPoint(opaque.rho));
  check("unparseable prose is NOT 0", opaque.rho.max > 0);
}

// ---- 4. Aggregation over the usages that concern a profile ----
{
  const rows: RestrictionRow[] = [
    { usage: "Lavage de véhicules par des professionnels", description: "Interdiction totale",
      concerne: { concerne_entreprise: true, concerne_particulier: true } },
    { usage: "Arrosage des espaces verts", description: "Interdiction de 8h à 20h.",
      concerne: { concerne_entreprise: true } },
    { usage: "Exploitation des ICPE", description: "Sensibiliser aux règles de bon usage",
      concerne: { concerne_entreprise: true } },
    { usage: "Irrigation agricole des cultures", description: "Interdiction totale",
      concerne: { concerne_exploitation: true } },
  ];

  const ent = exposureForProfil(rows, "concerne_entreprise");
  check("aggregate: only the usages flagged for the profile are counted", ent.usages.length === 3);
  check("aggregate: mean of 1.0, 0.5 and 0 → 0.5", near(ent.exposure?.min, (1 + 0.5 + 0) / 3));
  check("aggregate: all quantified ⇒ min === max", near(ent.exposure?.min, ent.exposure?.max ?? -1));
  check("aggregate: worst usage listed first (auditable)", ent.usages[0].usage.startsWith("Lavage"));

  const exp = exposureForProfil(rows, "concerne_exploitation");
  check("aggregate: farm profile sees only its own usage", exp.usages.length === 1 && near(exp.exposure?.min, 1));

  check("aggregate: one banned usage does not stop the whole site", (ent.exposure?.max ?? 1) < 1);

  const none = exposureForProfil(rows, "concerne_collectivite");
  check("aggregate: no matching usage → undefined exposure, not 0", none.exposure === undefined);

  check("aggregate: awareness counted apart from volume loss", ent.recommendation === 1);
}

// ---- 5. Unquantified rows widen the interval instead of vanishing ----
{
  const rows: RestrictionRow[] = [
    { usage: "A", description: "Interdiction totale", concerne: { concerne_entreprise: true } },
    { usage: "B", description: "Voir annexe", concerne: { concerne_entreprise: true } },
  ];
  const r = exposureForProfil(rows, "concerne_entreprise");
  // Old behaviour dropped B and reported 1.0. That read as "we know it is 1.0",
  // when the truth is "somewhere between 0.5 and 1.0".
  check("unquantified row widens the interval: min = 0.5", near(r.exposure?.min, 0.5));
  check("unquantified row widens the interval: max = 1.0", near(r.exposure?.max, 1));
  check("unquantified rows are counted", r.unquantified === 1);
  check("an interval is returned, not a point", (r.exposure?.max ?? 0) > (r.exposure?.min ?? 0));
}

// ---- 6. The three defects found in production at Sprint 38 ----
// Verbatim, all flagged concerne_entreprise, levels alerte → crise.
{
  // Defect 3: `^autorise` swallowed a quantified measure and returned 0.
  const swallowed = restrictionSeverity(
    "Autorisé 3 jours par semaine : lundi, mercredi, vendredi entre 20h et 9h.",
  );
  check(
    "defect 3: quantified measure starting with 'Autorisé' is NOT read as no restriction",
    swallowed.rho.min > 0.5,
  );
  // 3/7 of days, and 13 h of each of those days: 3/7 × 13/24 ≈ 0.1607 allowed.
  check("defect 3: composed value ≈ 0.839 blocked", near(swallowed.rho.min, 1 - (3 / 7) * (13 / 24)));
  check("defect 3: both dimensions were read", swallowed.dimensions.length === 2);

  // Defect 2: no composition — the old reader returned 0.125 here.
  const factorOf8 = restrictionSeverity(
    "Arrosage autorisé 2 jours par semaines : lundi et jeudi entre 20h et 23h.",
  );
  check("defect 2: days × hours compose", near(factorOf8.rho.min, 1 - (2 / 7) * (3 / 24)));
  check("defect 2: the answer is ~0.96, not ~0.125", factorOf8.rho.min > 0.9);

  // Defect 1: polarity — "autorisé entre 20h et 9h" states the PERMITTED window.
  const polarity = restrictionSeverity(
    "Interdiction sauf arrosage localisé des arbres et arbustes plantés en pleine terre depuis " +
      "moins de 2 ans (arrosage autorisé 3 jours par semaine (lundi, mercredi et vendredi) entre 20h et 9h)",
  );
  check("defect 1: nearest keyword wins — 'autorisé' governs, not the opening 'Interdiction'", polarity.rho.min > 0.5);
  check("defect 1: audit trail says 'autorisées', not 'Interdiction 13 h sur 24'", /autoris/.test(polarity.detail));

  // And the forbidden-window phrasing must keep working.
  const forbidden = restrictionSeverity("Interdiction de 8h à 20h.");
  check("defect 1: a stated FORBIDDEN window is still read as forbidden", pointAt(forbidden, 0.5));

  // "7 jours sur 7" is a total ban, not a rotation (a Sprint 38 false positive).
  const sevenOnSeven = restrictionSeverity(
    "Réduction des volumes de 60 % et interdiction d’arroser les fairways 7 jours sur 7.",
  );
  check("7 jours sur 7 is not a rotation — the 60 % governs", near(sevenOnSeven.rho.min, 0.6));
}

// ---- 7. reporting_only is a burden, not a volume loss ----
{
  const r = restrictionSeverity("Un registre de prélèvement devra être rempli hebdomadairement");
  check("reporting: declaration duty → ρ = 0", pointAt(r, 0));
  check("reporting: counted under its own type, not as awareness", r.rho.type === "reporting_only");

  const rows: RestrictionRow[] = [
    { usage: "A", description: "Un registre de prélèvement devra être rempli hebdomadairement",
      concerne: { concerne_entreprise: true } },
  ];
  check("reporting: surfaced in its own counter", exposureForProfil(rows, "concerne_entreprise").reportingOnly === 1);
}

console.log(failures === 0 ? "restrictions: all checks pass" : `restrictions: ${failures} FAILED`);
if (failures > 0) process.exit(1);
