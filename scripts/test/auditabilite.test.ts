// Sprint 44 — auditability, jurisdiction, evidence levels.
// npx tsx scripts/test/auditabilite.test.ts
//
// Auditability is almost entirely a set of SHAPE constraints, which is why this
// suite reads sources and structures rather than comparing numbers. Anti-pattern
// n°7 is "adding auditability afterwards", and the way it comes back is not a
// wrong value — it is a note that stopped matching the code, a level array that
// one module kept its own copy of, or a trail that stops one link short.

import { readFileSync } from "fs";
import { CONFIANCES, HORIZONS_CSRD, PREUVES, confiancePour } from "../../lib/confiance";
import { NIVEAUX, contraignant, couverture, juridiction, rang } from "../../lib/juridiction";
import { CHANGEMENTS_METHODE, MODELE_VERSION, changementsPour, modeleLigne } from "../../lib/modele";
import { noteMethodologique } from "../../lib/noteMethodologique";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// ---- 1. The jurisdiction owns the ordered levels (G3) ----
{
  const j = juridiction();
  check("jurisdiction: the four French levels, in order",
    j.niveaux.join(",") === "vigilance,alerte,alerte_renforcee,crise");
  check("jurisdiction: ranks are 1-based and monotone",
    NIVEAUX.every((n, i) => rang(n) === i + 1));
  check("jurisdiction: vigilance is NOT binding — it is an appeal", !contraignant("vigilance"));
  check("jurisdiction: alerte is where an obligation starts", contraignant("alerte"));
  check("jurisdiction: an unknown level ranks 0 rather than throwing", rang(undefined) === 0);

  // ⚠️ The measurement that justified the work: eight literal copies of the four
  // levels existed before this sprint. Only ONE may remain, in the jurisdiction.
  const files = [
    "lib/js.ts", "lib/vnp.ts", "lib/restrictionsData.ts",
    "app/api/restrictions/route.ts", "components/ImpactPanel.tsx",
    "components/RestrictionHistory.tsx", "components/SectorImpactPanel.tsx",
    "scripts/diag/replay-anticipation.ts",
  ];
  for (const f of files) {
    const src = readFileSync(f, "utf-8");
    check(`${f} no longer keeps its own copy of the level list`,
      !/\[\s*"vigilance"\s*,/.test(src));
  }
  const jur = readFileSync("lib/juridiction.ts", "utf-8");
  check("the single remaining literal is in the jurisdiction layer",
    /\[\s*"vigilance"\s*,/.test(jur));

  // ADR-002's warning must stay visible: G3 accepts the cost, it does not remove it.
  check("jurisdiction: ADR-002's warning is recopied, not paraphrased away",
    /l'abstraction sera fictive/.test(jur));
  check("jurisdiction: the cadence field exists even with one value",
    juridiction().cadence === "event_driven");
}

// ---- 2. The 2021 reform is a declared break in comparability ----
{
  const j = juridiction();
  check("reforms: the 2021 decree is recorded",
    j.reformes.some((r) => r.date.startsWith("2021") && /2021-795/.test(r.quoi)));
  check("reforms: … and says a count across it is not comparable",
    j.reformes.some((r) => /pas comparable/i.test(r.quoi)));
  check("reforms: the unimplemented ICPE reference volume is disclosed here too",
    j.reformes.some((r) => /Non implémenté/.test(r.quoi)));
}

// ---- 3. G15: a site outside France is marked, never zeroed ----
{
  const chartres = couverture(48.44, 1.49);
  check("G15: a French point is covered",
    chartres.couvert && chartres.emprise?.includes("métropolitaine") === true);
  check("G15: overseas départements are covered too",
    couverture(-20.9, 55.5).couvert && couverture(16.2, -61.5).couvert);

  // Far-field foreign points ARE rejected.
  const madrid = couverture(40.42, -3.7);
  check("G15: Madrid is outside the perimeter", !madrid.couvert);
  check("G15: Berlin too", !couverture(52.52, 13.4).couvert);
  check("G15: Casablanca too", !couverture(33.57, -7.59).couvert);
  // ⚠️ The sentence is the deliverable. VigiEau answers an out-of-France point
  // with an EMPTY zone list, which is indistinguishable from "covered, nothing in
  // force" — so this used to read "aucune restriction en vigueur".
  check("G15: … and the reason says the site is counted, not absent",
    /compté dans votre portefeuille/.test(madrid.detail));
  check("G15: … and that it does not count as zero", /ne compte pas pour zéro/.test(madrid.detail));
  check("G15: … and refuses to substitute a foreign source",
    /Aucune source étrangère/.test(madrid.detail));

  // ⚠️⚠️ THE RESIDUAL HOLE, asserted rather than hidden. A bounding box around
  // metropolitan France contains Catalonia: Barcelona passes the guard. This test
  // exists so the limitation is a KNOWN property of the code and not a surprise —
  // and so that the day someone ships a real polygon, it fails and gets updated.
  const barcelone = couverture(41.39, 2.17);
  check("G15: ⚠️ a near-border foreign point still passes — bounding box, documented limit",
    barcelone.couvert === true);
  check("G15: … and the limitation is written where a reader will find it",
    /Barcelona/.test(readFileSync("lib/juridiction.ts", "utf-8")));
  // ✅ Arbitrage 2026-08-11: no France polygon. The address-search path is already
  // protected by construction, and only a hand-built lat/lon deep link falls in.
  check("G15: the decision NOT to embed a polygon is recorded with its motive",
    /on s'en tient au code INSEE/.test(readFileSync("lib/juridiction.ts", "utf-8")));

  // The positive proof: an INSEE commune code can only come from the French
  // referential, so a site added through the address search is French by
  // construction — which is the path that matters in practice.
  check("G15: an INSEE commune code is positive proof of coverage",
    couverture(41.39, 2.17, "28085").couvert &&
      couverture(0, 0, "28085").emprise === "France (code INSEE)");
  check("G15: … and Corsican 2A/2B codes are accepted", couverture(0, 0, "2A004").couvert);
  check("G15: a malformed code falls back to the bounding box rather than passing",
    !couverture(40.42, -3.7, "not-a-code").couvert);

  const nulle = couverture(Number.NaN, 0);
  check("G15: unreadable coordinates are 'we do not know where', not 'outside'",
    !nulle.couvert && /on ne sait pas où/.test(nulle.detail));

  // The guard must live in the endpoint, before the upstream call.
  const route = readFileSync("app/api/zones/route.ts", "utf-8");
  check("G15: the zones endpoint checks coverage before calling upstream",
    route.indexOf("couverture(") < route.indexOf("fetchZonesForPoint("));
  check("G15: and answers with a distinct field, not by reusing notCovered",
    /horsPerimetre: true/.test(route));
}

// ---- 4. Confidence is per OUTPUT, and the order is the message (ADR-004) ----
{
  check("ADR-004: the ranking is the most trustworthy output",
    CONFIANCES[0].sortie === "classement" && CONFIANCES[0].niveau === "haute");
  check("ADR-004: euros are the least", CONFIANCES.at(-1)?.niveau === "basse");
  check("ADR-004: the two physical magnitudes sit in the middle",
    confiancePour("magnitude_vnp")?.niveau === "moyenne" &&
      confiancePour("magnitude_ia")?.niveau === "moyenne");
  // ⚠️ JS is HIGH confidence and yet the least durable indicator. Both are true,
  // and the motive has to say so or the two readings contradict each other.
  check("ADR-004: JS is high confidence but its durability caveat is stated",
    confiancePour("magnitude_js")?.niveau === "haute" &&
      /DURABILITÉ/.test(confiancePour("magnitude_js")?.motif ?? ""));
  // G4: the composite score is a declared divergence from the note, not an oversight.
  check("G4: the score is documented as an assumed divergence",
    /[Dd]ivergence assumée/.test(confiancePour("score")?.motif ?? ""));
  check("G4: … with the reason it was kept",
    /INCLASSABLE/.test(confiancePour("score")?.motif ?? ""));
  check("ADR-004: every output states a legitimate use, not only a caveat",
    CONFIANCES.every((c) => c.usage.length > 30));
  // Anti-pattern n°10, in the confidence table this time.
  check("euros: the removed revenue fallback is named as anti-pattern n°10",
    /anti-pattern n°10/.test(confiancePour("euros")?.motif ?? ""));
}

// ---- 5. Evidence levels are defined, and N3 is not a forecast ----
{
  check("preuve: three levels, no more", Object.keys(PREUVES).length === 3);
  check("preuve: N1 is named as an opposable fact", /OPPOSABLE/.test(PREUVES.N1.quoi));
  check("preuve: N2 must be read as a range", /fourchette/.test(PREUVES.N2.quoi));
  // The single most misread label in the product.
  check("preuve: N3 explicitly denies being a forecast", /N'est PAS.*prévision/.test(PREUVES.N3.quoi));
  check("preuve: … and says scenarios are not averaged",
    /ne se moyennent pas/.test(PREUVES.N3.quoi));
}

// ---- 6. CSRD horizons: the table is published (§11.2) ----
{
  check("CSRD: the four product horizons are mapped", HORIZONS_CSRD.length === 4);
  check("CSRD: the 2050 horizon maps to long term and is labelled N3",
    HORIZONS_CSRD.some((h) => /2050/.test(h.produit) && h.csrd === "long terme" && h.preuve === "N3"));
  check("CSRD: the typical year is medium term and N1",
    HORIZONS_CSRD.some((h) => /Année type/.test(h.produit) && h.csrd === "moyen terme" && h.preuve === "N1"));
  check("CSRD: every row carries an ESRS definition, not just a label",
    HORIZONS_CSRD.every((h) => /an/.test(h.esrs)));
}

// ---- 7. The model version, and change entries that state a DIRECTION ----
{
  check("modele: a version exists and is date-shaped", /^\d{4}\.\d{2}\.\d$/.test(MODELE_VERSION));
  check("modele: the current version heads the log", CHANGEMENTS_METHODE[0].version === MODELE_VERSION);
  // ⚠️ The direction is the point. "The method changed" without a direction leaves
  // the reader to interpret a drop as an improvement in their own risk.
  check("modele: every entry states which way already-published figures moved",
    CHANGEMENTS_METHODE.every((c) => c.sens !== undefined && c.sens.length > 0));
  check("modele: the weighted-level change is recorded as a DROP",
    changementsPour("score").some((c) => c.sens === "baisse"));
  check("modele: and its motive says it is not an improvement in risk",
    changementsPour("score").some((c) => /correction de méthode/.test(c.motif)));
  check("modele: every entry names the outputs it touches",
    CHANGEMENTS_METHODE.every((c) => c.sorties.length > 0));
  check("modele: the printable line carries the version and a real date",
    modeleLigne().includes(MODELE_VERSION) && /\d{4}/.test(modeleLigne()));
}

// ---- 8. The methodology note is GENERATED from the engines' own structures ----
{
  const note = noteMethodologique();

  // If it were hand-written, none of these would be guaranteed to agree with the code.
  check("note: carries the model version", note.includes(MODELE_VERSION));
  check("note: says it is generated, so a reader knows it cannot drift",
    /est \*\*générée\*\*/.test(note));
  check("note: reproduces the confidence table for every output",
    CONFIANCES.every((c) => note.includes(c.label)));
  check("note: reproduces the three evidence levels",
    Object.values(PREUVES).every((p) => note.includes(p.label)));
  check("note: reproduces the jurisdiction's reforms",
    juridiction().reformes.every((r) => note.includes(new Date(r.date).toLocaleDateString("fr-FR"))));
  check("note: reproduces every method change with its direction",
    CHANGEMENTS_METHODE.every((c) => note.includes(c.version)));
  check("note: publishes the CSRD horizon table", note.includes("Correspondance des horizons"));

  // The declared assumptions the note must never omit.
  check("note: κ = 1 is named as a prudential assumption", /κ = 1/.test(note));
  check("note: the [0, ρ_max] interval rule is stated", /n'est jamais imputée/.test(note));
  check("note: the 'absent is never zero' rule is stated",
    /jamais un zéro/.test(note));
  check("note: the anti-pattern n°3 ban on adding the VNP components is stated",
    /ne s'additionnent pas/.test(note));
  check("note: the unimplemented ICPE reference volume is admitted",
    /n'est pas implémenté/.test(note));
  // ✅ Arbitrage 2026-08-11: the trail is a CITABLE REFERENCE, not a link. The note
  // must say the "one click to the PDF" criterion is not met — a criterion silently
  // dropped is worse than one openly declined.
  check("note: the traceability stops at the decree NUMBER, and says so",
    /référence citable/.test(note) && /n'est donc \*\*pas tenu\*\*/.test(note));
  // ⚠️ Anti-pattern n°6, admitted rather than hidden. A methodology note that only
  // lists strengths is a sales document.
  check("note: the absence of a backtest on the final metric is admitted",
    /Aucun contrôle a posteriori/.test(note));
  check("note: heading level is configurable so it nests under a report",
    noteMethodologique({ niveauTitre: 3 }).startsWith("### "));
}

// ---- 9. The note is attached to BOTH exports, and it is the same note ----
{
  const report = readFileSync("lib/report.ts", "utf-8");
  const calls = report.match(/noteMethodologique\(/g) ?? [];
  check("exports: the note is appended twice — site report and portfolio report",
    calls.length === 2);
  // ⚠️ A shorter "portfolio variant" would be a second note to keep in step, and
  // the one nobody reads is the one that drifts.
  check("exports: no separate portfolio variant of the note exists",
    !/notePortefeuille|noteCourte/.test(report));
}

// ---- 10. Measure → decree trail (anti-pattern n°7) ----
{
  // The builder must carry arrete.id through, and the reader must expose it.
  const builder = readFileSync("scripts/restrictions/build_restrictions.py", "utf-8");
  check("trail: the builder reads arrete.id from the source CSV",
    /r\.get\("arrete\.id"\)/.test(builder));
  check("trail: … and arrete.numero, so an id resolves to a document",
    /arrete\.numero/.test(builder));
  check("trail: ids are stored sorted, so an unchanged rebuild yields an identical file",
    /sorted\(extra\["arretes"\]\)/.test(builder));
  check("trail: the decree table is namespaced so it cannot collide with a zone type",
    /_arretes/.test(builder));

  const api = readFileSync("app/api/restrictions/route.ts", "utf-8");
  check("trail: the API returns the decree table", /arretes: lookup\.arretes/.test(api));
  const panel = readFileSync("components/ImpactPanel.tsx", "utf-8");
  check("trail: the evidence panel renders the decree numbers", /u\.arretes/.test(panel));

  // ⚠️ The honest part: the shards on disk PREDATE this change. The build needs
  // egress and only runs in the GitHub Actions workflow, so the trail is wired
  // end to end and carries no data until that workflow runs.
  const shard = JSON.parse(readFileSync("data/restrictions/zones/28.json", "utf-8")) as Record<
    string,
    unknown
  >;
  const aDejaLesArretes = "_arretes" in shard;
  console.log(
    aDejaLesArretes
      ? "INFO le shard 28 porte déjà la table d'arrêtés — le workflow a tourné"
      : "INFO le shard 28 ne porte PAS encore la table d'arrêtés : le câblage est fait, la donnée attend le workflow Actions (egress bloqué en bac à sable)",
  );
  // Whatever the state, readers must not assume the field is there.
  const dataReader = readFileSync("lib/restrictionsData.ts", "utf-8");
  check("trail: the reader treats the decree table as optional, for pre-rebuild shards",
    /_arretes\?:/.test(dataReader));
}

console.log(failures === 0 ? "auditabilite: all checks pass" : `auditabilite: ${failures} FAILED`);
if (failures > 0) process.exit(1);
