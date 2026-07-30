// Unit tests for the prefectural restriction reader (lib/restrictions).
// npx tsx scripts/test/restrictions.test.ts
//
// Every string in section 1 is a VERBATIM measure observed in the VigiEau
// "Restrictions" resource (77 056 rows, probe run 30586667807). Calibrating on
// invented phrasings would prove nothing about the real file.

import {
  restrictionSeverity,
  exposureForProfil,
  type RestrictionRow,
} from "../../lib/restrictions";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9;

// ---- 1. Real measures, verbatim from the published file ----
{
  const total = restrictionSeverity("Interdiction totale");
  check("verbatim: 'Interdiction totale' → 1.0", near(total.coefficient, 1) && total.kind === "interdiction");

  const bare = restrictionSeverity("Interdit");
  check("verbatim: 'Interdit' → 1.0", near(bare.coefficient, 1));

  const span = restrictionSeverity("Interdiction de 8h à 20h.");
  check(
    "verbatim: 'Interdiction de 8h à 20h.' → 12 h/24 measured, not a guess",
    near(span.coefficient, 0.5) && span.kind === "plage_horaire",
  );

  const span2 = restrictionSeverity("Interdiction de 11h à 18h.");
  check("verbatim: 'de 11h à 18h' → 7 h/24", near(span2.coefficient, 7 / 24));

  const exempted = restrictionSeverity("Interdiction totale sauf autorisation administrative");
  check(
    "verbatim: ban with administrative exemption → 0.85, below a flat ban",
    near(exempted.coefficient, 0.85) && exempted.kind === "interdiction_conditionnelle",
  );

  const sanitary = restrictionSeverity("Interdiction totale sauf impératif sanitaire");
  check("verbatim: ban with sanitary exemption → 0.85", near(sanitary.coefficient, 0.85));

  const noLimit = restrictionSeverity("Pas de limitation sauf arrêté spécifique");
  check(
    "verbatim: 'Pas de limitation sauf arrêté spécifique' → 0, not read as a ban",
    near(noLimit.coefficient, 0) && noLimit.kind === "aucune",
  );

  const allowed = restrictionSeverity("Autorisé");
  check("verbatim: 'Autorisé' → 0", near(allowed.coefficient, 0) && allowed.kind === "aucune");

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
      near(r.coefficient, 0) && r.kind === "sensibilisation",
    );
  }
}

// ---- 2. Quantities win over coarse wording ----
{
  // A ban that states hours must be read as the hours, not as a total ban:
  // this is the whole point of deriving rather than assuming.
  const r = restrictionSeverity("Interdiction de 9h à 20h.");
  check("quantified beats coarse: hour span is preferred over the word 'interdiction'", r.kind === "plage_horaire");
  check("quantified: 9h→20h is 11 h/24", near(r.coefficient, 11 / 24));

  const pct = restrictionSeverity("Réduction de 50 % des prélèvements");
  check("quantified: explicit percentage → 0.5", near(pct.coefficient, 0.5) && pct.kind === "reduction");

  const overnight = restrictionSeverity("Interdiction de 20h à 8h");
  check("quantified: overnight window wraps midnight → 12 h/24", near(overnight.coefficient, 0.5));
}

// ---- 3. Unreadable measures stay undefined, never 0 ----
{
  const empty = restrictionSeverity(undefined);
  check("undefined ≠ 0: missing measure has no coefficient", empty.coefficient === undefined);
  check("undefined ≠ 0: missing measure is flagged indetermine", empty.kind === "indetermine");

  const opaque = restrictionSeverity("Se référer à l'annexe 3 du présent arrêté");
  check("undefined ≠ 0: unparseable prose has no coefficient", opaque.coefficient === undefined);
}

// ---- 4. Aggregation over the usages that concern a profile ----
{
  const rows: RestrictionRow[] = [
    // Concerns companies, fully banned.
    { usage: "Lavage de véhicules par des professionnels", description: "Interdiction totale",
      concerne: { concerne_entreprise: true, concerne_particulier: true } },
    // Concerns companies, half a day.
    { usage: "Arrosage des espaces verts", description: "Interdiction de 8h à 20h.",
      concerne: { concerne_entreprise: true } },
    // Concerns companies, awareness only.
    { usage: "Exploitation des ICPE", description: "Sensibiliser aux règles de bon usage",
      concerne: { concerne_entreprise: true } },
    // Farms only — must not enter the company mean.
    { usage: "Irrigation agricole des cultures", description: "Interdiction totale",
      concerne: { concerne_exploitation: true } },
  ];

  const ent = exposureForProfil(rows, "concerne_entreprise");
  check("aggregate: only the usages flagged for the profile are counted", ent.usages.length === 3);
  check("aggregate: mean of 1.0, 0.5 and 0 → 0.5", near(ent.exposure, (1 + 0.5 + 0) / 3));
  check("aggregate: worst usage listed first (auditable)", ent.usages[0].usage.startsWith("Lavage"));

  const exp = exposureForProfil(rows, "concerne_exploitation");
  check("aggregate: farm profile sees only its own usage", exp.usages.length === 1 && near(exp.exposure, 1));

  // A company is NOT fully stopped just because one listed usage is banned —
  // the point the mean encodes, and the answer to "can a firm in crise still
  // draw water?".
  check("aggregate: one banned usage does not stop the whole site", (ent.exposure ?? 1) < 1);

  const none = exposureForProfil(rows, "concerne_collectivite");
  check("aggregate: no matching usage → undefined exposure, not 0", none.exposure === undefined);
}

// ---- 5. Unreadable rows are excluded from the mean, and counted ----
{
  const rows: RestrictionRow[] = [
    { usage: "A", description: "Interdiction totale", concerne: { concerne_entreprise: true } },
    { usage: "B", description: "Voir annexe", concerne: { concerne_entreprise: true } },
  ];
  const r = exposureForProfil(rows, "concerne_entreprise");
  check("unread rows do not drag the mean toward 0", near(r.exposure, 1));
  check("unread rows are reported", r.unread === 1);
}

console.log(failures === 0 ? "restrictions: all checks pass" : `restrictions: ${failures} FAILED`);
if (failures > 0) process.exit(1);
