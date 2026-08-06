// Tests for lib/synthese.ts — the written synthesis of ONE site.
// Run: npx tsx scripts/test/synthese.test.ts
//
// As in executive.test.ts, the property under test is not the wording but the
// DISCIPLINE, and on a single site it matters more: there is no second site to
// relativise a gap, so a missing history must never read as a calm site.
//
//   1. A sentence exists if and only if the fact behind it was computed.
//   2. "Ce que cette synthèse ne sait pas" is never dropped when something is.
//   3. An unreachable VigiEau is never rendered as "aucune restriction".

import { buildSiteSummary, type SyntheseInput } from "../../lib/synthese";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

type Summary = ReturnType<typeof buildSiteSummary>;
const has = (s: Summary, id: string) => s.lignes.some((l) => l.id === id);
const line = (s: Summary, id: string) => s.lignes.find((l) => l.id === id);
const text = (s: Summary, id: string) => line(s, id)?.texte ?? "";

/** A site with every fact available. */
const rich: SyntheseInput = {
  worst: "alerte_renforcee",
  arreteDepuis: "2026-06-12",
  score: 72,
  classeRisque: "Élevé",
  joursMoyen: 46,
  anneesCompletes: 9,
  interruption: { anneeType: 34, finSaison: 12, horizon2050: 51, arret: 8 },
  anticipation: { label: "Probable", index: 68 },
  vcn10Delta2050: -28.4,
  physique: {
    nappe: { label: "Nappe proche des normales (IPS)", score: 55 },
    debit: { label: "Débit proche de l'étiage quinquennal", score: 30 },
    sol: { label: "Sols très secs" },
    onde: { score: 40, stations: 3 },
  },
  interne: { volumeM3: 365_000, coutJourEuros: 12_000 },
};

// --- 1. A complete site produces every line ---------------------------------
{
  const s = buildSiteSummary(rich);
  check("situation line present", has(s, "situation"));
  check("impact line present", has(s, "impact"));
  check("anticipation line present", has(s, "anticipation"));
  check("2050 line present", has(s, "trajectoire"));
  check("physical-state line present", has(s, "physique"));
  check("a complete site has nothing to declare as unknown", !has(s, "inconnu"));

  check("situation names the level", text(s, "situation").includes("Alerte renforcée"));
  check("situation dates the decree in force", text(s, "situation").includes("12 juin 2026"));
  check("impact states constrained days", text(s, "impact").includes("34 jour"));
  check("impact separates outright suspension", text(s, "impact").includes("8 jour"));
  check("impact converts to m³ when a volume was declared", /m³/.test(text(s, "impact")));
  check("impact converts to € when a daily cost was declared", /€/.test(text(s, "impact")));
  check("2050 mentions the trajectory is not a forecast",
    text(s, "trajectoire").includes("pas une prévision"));
  check("anticipation says conditions, not a forecast of the decree",
    text(s, "anticipation").includes("pas une prévision de l'arrêté"));

  check("headline exists and names the level",
    (s.accroche ?? "").includes("Alerte renforcée"));
  check("every line that summarises a chapter carries its anchor",
    s.lignes.filter((l) => l.id !== "inconnu").every((l) => typeof l.ancre === "string"));
}

// --- 2. Rule 1: no fact, no sentence ----------------------------------------
{
  const s = buildSiteSummary({ worst: "vigilance" });
  check("no interruption fact -> no impact line", !has(s, "impact"));
  check("no anticipation fact -> no anticipation line", !has(s, "anticipation"));
  check("no projection fact -> no 2050 line", !has(s, "trajectoire"));
  check("no measurement -> no physical-state line", !has(s, "physique"));
  check("but the situation is still stated", has(s, "situation"));
  check("and the gaps are enumerated", has(s, "inconnu"));
}

// --- 3. Rule 3: an outage is not an absence of restriction ------------------
{
  const s = buildSiteSummary({ statutIndisponible: true });
  const t = text(s, "situation");
  check("an unreachable VigiEau is reported as unknown", t.includes("inconnu"));
  check("and explicitly not as 'no restriction'",
    t.includes("ne veut pas dire") && !/^Aucune restriction n'est en vigueur/.test(t));
  check("an outage never produces a reassuring headline", s.accroche === undefined);
  check("the outage is listed among the gaps",
    text(s, "inconnu").includes("statut réglementaire n'a pas pu être lu"));
}
{
  // Not covered by VigiEau is a DIFFERENT statement from an outage, and must
  // not borrow its wording.
  const s = buildSiteSummary({ nonCouvert: true });
  check("an uncovered territory is not reported as an outage",
    !text(s, "situation").includes("n'a pas répondu"));
  check("an uncovered territory says why it has no zone",
    text(s, "situation").includes("pas couvert par VigiEau"));
}

// --- 4. Rule 2: the gap line is never dropped -------------------------------
{
  const s = buildSiteSummary({});
  check("an empty input still declares what it does not know", has(s, "inconnu"));
  check("the gap line closes on 'jamais comme l'absence de risque'",
    text(s, "inconnu").includes("jamais comme l'absence de risque"));
  check("an empty input invents no headline", s.accroche === undefined);
  check("the gap line is always last",
    s.lignes[s.lignes.length - 1]?.id === "inconnu");
}
{
  // A declared volume must not be reported as missing — this is the failure
  // mode that sends an operator to re-fill a field already filled.
  const s = buildSiteSummary({ ...rich, vcn10Delta2050: undefined });
  check("only the actually missing fact is listed",
    text(s, "inconnu").includes("projection 2050") &&
      !text(s, "inconnu").includes("volume prélevé"));
}

// --- 5. Money: the turnover fallback is flagged as generic ------------------
{
  const s = buildSiteSummary({
    ...rich,
    interne: { volumeM3: 365_000, caAnnuelEuros: 8_000_000 },
  });
  check("turnover is used when no daily cost was given", /€/.test(text(s, "impact")));
  check("and the fallback says it is a generic order of magnitude",
    text(s, "impact").includes("ordre de grandeur générique"));
}
{
  const s = buildSiteSummary({ ...rich, interne: {} });
  check("nothing declared -> no euro figure at all", !/€/.test(text(s, "impact")));
  check("nothing declared -> no m³ figure at all", !/m³/.test(text(s, "impact")));
}

// --- 6. The fallback impact line does not pass decree days off as lost days --
{
  const s = buildSiteSummary({
    worst: "alerte",
    joursMoyen: 46,
    anneesCompletes: 9,
    interruption: undefined,
  });
  check("without exposure, days are called 'sous arrêté'",
    text(s, "impact").includes("sous arrêté"));
  check("and the missing weighting is stated, not hidden",
    text(s, "impact").includes("n'a pas pu être calculée"));
}

// --- 6b. Wording defects the rendered page exposed --------------------------
// Both were found by looking at the page with stubbed data, not by any check
// above: the sentences were grammatically built and factually right, and still
// read wrong.
{
  // "dont 1 jours" — the figure was rounded for display but the plural agreed
  // on the raw value.
  const s = buildSiteSummary({ interruption: { anneeType: 28, arret: 1.2, finSaison: 1.4 } });
  const t = text(s, "impact");
  check("a rounded 1 agrees in the singular", t.includes("1 jour d'arrêt"));
  check("and never renders '1 jours'", !t.includes("1 jours"));
  check("the end-of-season figure agrees too", t.includes("étiage : 1 jour."));
}
{
  // "nappe : nappe proche des normales (ips)" — prefixing a label that already
  // names its subject, then lower-casing an acronym.
  const s = buildSiteSummary({
    physique: {
      nappe: { label: "Nappe proche des normales (IPS)" },
      debit: { label: "Débit proche de l'étiage quinquennal" },
      sol: { label: "Sols très secs" },
      onde: { score: 40, stations: 3 },
    },
  });
  const t = text(s, "physique");
  check("the IPS acronym survives", t.includes("(IPS)"));
  check("the subject is not repeated", !t.includes("nappe : Nappe"));
  check("labels are quoted as published", t.includes("Nappe proche des normales (IPS)"));
  check("a single Onde station stays singular",
    text(buildSiteSummary({ physique: { onde: { score: 10, stations: 1 } } }), "physique")
      .includes("1 station du réseau"));
}

// --- 6c. A pending source is not a missing one ------------------------------
// Found by watching the page load with delayed stubs: three seconds in, the
// gap line asserted "la projection 2050 n'est pas disponible pour ce bassin",
// then contradicted itself when the answer landed. Same rule the map made
// structural at Sprint 32 — a service still answering is not a silent one.
{
  const loading = buildSiteSummary({
    worst: "alerte",
    enAttente: ["historique", "interruption", "projection", "mesures"],
    interne: { volumeM3: 365_000 },
  });
  check("a pending source produces no gap line at all", !has(loading, "inconnu"));

  const settled = buildSiteSummary({ worst: "alerte", interne: { volumeM3: 365_000 } });
  check("the same input, once settled, does report the gaps", has(settled, "inconnu"));
  check("and names the projection among them",
    text(settled, "inconnu").includes("projection 2050"));
}
{
  // Suppression is per-source, not global.
  const s = buildSiteSummary({
    worst: "alerte",
    enAttente: ["projection"],
    anneesCompletes: 9,
    interruption: { anneeType: 20 },
    physique: { nappe: { label: "Nappe basse" } },
  });
  check("only the pending source is suppressed",
    !text(s, "inconnu").includes("projection 2050") &&
      text(s, "inconnu").includes("volume prélevé"));
}
{
  // A field the reader fills themselves never depends on a request, so waiting
  // must not hide it — otherwise it would appear only at the very end.
  const s = buildSiteSummary({
    worst: "alerte",
    enAttente: ["historique", "interruption", "projection", "mesures"],
  });
  check("the declared volume is reported as missing even mid-load",
    text(s, "inconnu").includes("volume prélevé"));
}

// --- 7. Tone tracks severity, since the UI colours from it ------------------
{
  const calme = buildSiteSummary({ worst: "vigilance" });
  const grave = buildSiteSummary({ worst: "crise" });
  check("vigilance is neutral", line(calme, "situation")?.ton === "neutre");
  check("crise is alerte", line(grave, "situation")?.ton === "alerte");
  check("a heavy year is toned up",
    line(buildSiteSummary({ interruption: { anneeType: 40 } }), "impact")?.ton === "alerte");
  check("a quiet year is not",
    line(buildSiteSummary({ interruption: { anneeType: 0 } }), "impact")?.ton === "neutre");
}

// --- 8. Headline: never generic reassurance --------------------------------
{
  const s = buildSiteSummary({
    worst: undefined,
    interruption: { anneeType: 22 },
  });
  check("an unrestricted-today site with a heavy history still gets a headline",
    (s.accroche ?? "").includes("22 jours par an"));

  const quiet = buildSiteSummary({ worst: "vigilance", interruption: { anneeType: 2 } });
  check("a genuinely quiet site gets no headline at all", quiet.accroche === undefined);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("synthese: all checks pass");
