// Sprint 46 — N3 scenarios, variance decomposition, batch import.
// npx tsx scripts/test/n3.test.ts
//
// Two deliverables, two different kinds of test.
//
// The variance decomposition is tested by CONSTRUCTION: series are built where one
// axis is deliberately made to dominate, and the decomposition must name that axis.
// A decomposition that always answers "hydro-climatic" would pass a single-case test
// and be worthless, so each term gets its own case.
//
// The batch import is tested on the failure modes that make a geocode SILENTLY
// wrong — the comma inside a French address, the French Excel semicolon, the Excel
// BOM, two candidates within a rounding error. Every one of them produces a
// plausible result rather than an error, which is why they need tests rather than
// error handling.

import { readFileSync } from "fs";
import {
  SCENARIOS_POLITIQUES,
  croiserScenarios,
  decomposerVariance,
  restituerN3,
  rhoMoyen,
  type NarratifClimatique,
} from "../../lib/scenarios";
import {
  ECART_AMBIGUITE,
  MAX_LIGNES,
  SEUIL_SCORE_ACCEPTE,
  adresseDeLigne,
  construireRapport,
  decouperLigneCsv,
  detecterSeparateur,
  normaliserEntete,
  parserCsv,
  rapportEnCsv,
  verdictPour,
  type CandidatBan,
} from "../../lib/importLot";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number | undefined, b: number, tol: number) =>
  a !== undefined && Math.abs(a - b) <= tol;

const narratif = (id: string, dtBE: number): NarratifClimatique => ({
  id,
  label: id,
  dtBE: [dtBE - 5, dtBE, dtBE + 5],
  vcn10: [-30, -20, -10],
});

// ---- 1. The second axis exists, and it acts on V_ref not on the days ----
{
  check("policy: three scenarios, statu quo included as a reference bracket",
    SCENARIOS_POLITIQUES.length === 3 &&
      SCENARIOS_POLITIQUES.some((s) => s.id === "statu_quo" && s.facteurVref === 1));
  // ⚠️ Every coefficient must state what it assumes. A bare 0.75 is a number
  // somebody will quote; "a plausible bracket, no instrument announces it" is not.
  check("policy: every scenario states its assumption in words",
    SCENARIOS_POLITIQUES.every((s) => s.hypothese.length > 60));
  check("policy: the ones with no published instrument say so",
    SCENARIOS_POLITIQUES.filter((s) => s.source.startsWith("aucun")).length === 2);
  check("policy: the Plan Eau scenario cites its instrument",
    /Plan d'action/.test(SCENARIOS_POLITIQUES.find((s) => s.id === "plan_eau_2030")!.source));
  check("policy: statu quo is labelled a reference, not the likely case",
    /pas\s+le plus probable/.test(SCENARIOS_POLITIQUES[0].hypothese));

  // The axis is genuinely independent of the climate: same days, different VNP.
  const cellules = croiserScenarios({
    narratifs: [narratif("n1", 20)],
    joursReference: 40,
    vrefM3: 365_000,
    rho: 1,
  });
  check("policy: the cross has one cell per (narrative × policy)", cellules.length === 3);
  check("policy: every cell shares the same day total — the climate axis is fixed",
    new Set(cellules.map((c) => c.joursTotal)).size === 1);
  // ⚠️ This is the point of the second axis: the VNP moves without one extra dry day.
  check("policy: … yet the VNP differs across them, with no extra dry day",
    new Set(cellules.map((c) => Math.round(c.vnpM3))).size === 3);
  // 365 000 m³/an = 1 000 m³/day; 60 days at ρ=1 → 60 000, times 0.9 → 54 000.
  check("policy: −10 % on V_ref is −10 % on the VNP",
    near(cellules.find((c) => c.politique === "plan_eau_2030")?.vnpM3, 54_000, 1));
}

// ---- 2. The decomposition names the axis that actually dominates ----
{
  const commun = { joursReference: 40, vrefM3: 365_000, rho: 0.5 };

  // (a) Climate dominates: narratives far apart, policy pinned to one scenario.
  const climat = decomposerVariance({
    cellules: croiserScenarios({
      ...commun,
      narratifs: [narratif("sec", 5), narratif("tres_sec", 120)],
      politiques: [SCENARIOS_POLITIQUES[0]],
    }),
    rhoMin: 0.5,
    rhoMax: 0.5,
    rhoUtilise: 0.5,
  });
  check("variance: with one policy and two far-apart narratives, climate dominates",
    climat.dominante === "hydroClimatique");
  // ⚠️ And §6.4's hypothesis is then NOT verified — which the module must say
  // rather than assume. A decomposition that always confirms the note is not a test.
  check("variance: … so §6.4's hypothesis is reported as NOT verified",
    climat.hypotheseVerifiee === false);
  check("variance: … and the journal says which way to invest instead",
    climat.hypotheses.some((h) => /Améliorer les projections y rapporterait plus/.test(h)));

  // (b) Policy dominates: one narrative, three policies.
  const politique = decomposerVariance({
    cellules: croiserScenarios({ ...commun, narratifs: [narratif("n1", 20)] }),
    rhoMin: 0.5,
    rhoMax: 0.5,
    rhoUtilise: 0.5,
  });
  check("variance: with one narrative and three policies, the decisional term dominates",
    politique.dominante === "decisionnelle");
  check("variance: … and §6.4's hypothesis is verified", politique.hypotheseVerifiee);
  check("variance: … with the steering conclusion spelled out",
    politique.hypotheses.some((h) => /mieux typer les arrêtés rapporte davantage/.test(h)));

  // (c) Translation dominates: everything pinned, ρ wide open — an arrêté whose
  // measures could not be quantified.
  const traduction = decomposerVariance({
    cellules: croiserScenarios({
      ...commun,
      narratifs: [narratif("n1", 20)],
      politiques: [SCENARIOS_POLITIQUES[0]],
    }),
    rhoMin: 0,
    rhoMax: 1,
    rhoUtilise: 0.5,
  });
  check("variance: with a fully unquantified ρ, the translational term dominates",
    traduction.dominante === "traductionnelle");
  check("variance: the three shares sum to 1",
    near(
      traduction.parts.hydroClimatique +
        traduction.parts.decisionnelle +
        traduction.parts.traductionnelle,
      1,
      1e-9,
    ));
  check("variance: the method is journalled, including what it is NOT",
    traduction.hypotheses.some((h) => /PAS la variance de toutes les cellules/.test(h)));
  check("variance: the translational term is described as unread width, not a scenario",
    traduction.hypotheses.some((h) => /qu'on n'a pas su lire/.test(h)));
}

// ---- 3. §6.3 — never a bare number ----
{
  const cellules = croiserScenarios({
    narratifs: [narratif("a", 10), narratif("b", 40), narratif("c", 80)],
    joursReference: 40,
    vrefM3: 365_000,
    rho: 0.5,
  });
  const mediane = restituerN3({ cellules, convention: "mediane", etiquette: "+2,7 °C × Plan Eau" });
  const haut = restituerN3({ cellules, convention: "quantile_haut", etiquette: "+2,7 °C × Plan Eau" });

  check("N3: a figure always comes with its interval", mediane !== undefined && mediane.min < mediane.max);
  // ⚠️ The label is mandatory: an N3 number without its scenario is not a
  // conservative estimate, it is an unfalsifiable one.
  check("N3: … and with its scenario label", (mediane?.etiquette ?? "").length > 0);
  check("N3: the high quantile exceeds the median", (haut?.valeur ?? 0) > (mediane?.valeur ?? 0));
  // The wrong quantile for the decision is the expensive mistake, so each says so.
  check("N3: the median warns against sizing a tank with it",
    /NE PAS utiliser pour dimensionner/.test(mediane?.detail ?? ""));
  check("N3: the high quantile warns against publishing it as expected",
    /NE PAS.*publier/.test(haut?.detail ?? ""));
  check("N3: an empty scenario set yields nothing rather than a zero",
    restituerN3({ cellules: [], convention: "mediane", etiquette: "x" }) === undefined);

  // Anti-pattern n°4: no ensemble mean anywhere in the module.
  const src = readFileSync("lib/scenarios.ts", "utf-8");
  const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  check("N3: the module never averages the narratives together",
    !/moyenneEnsemble|ensembleMean/.test(code));
}

// ---- 4. rhoMoyen: an unreadable level contributes nothing, not zero ----
{
  const r = rhoMoyen(
    { alerte: 30, crise: 10 },
    { alerte: { min: 0.4, max: 0.6 }, crise: { min: 1, max: 1 } },
  );
  check("rho: weighted by days — (30×0.4 + 10×1)/40 = 0.55", near(r.min, 0.55, 1e-9));
  check("rho: the upper bound follows the same weighting", near(r.max, 0.7, 1e-9));
  check("rho: the covered day count is returned", r.jours === 40);

  const partiel = rhoMoyen({ alerte: 30, crise: 10 }, { alerte: { min: 0.4, max: 0.6 } });
  // ⚠️ The ten crisis days are EXCLUDED, not counted at ρ=0. Counting them at zero
  // would dilute the mean and understate the site.
  check("rho: a level with no readable measure is excluded from the denominator",
    partiel.jours === 30 && near(partiel.min, 0.4, 1e-9));
}

// ---- 5. Batch import: the parser's silent-wrongness cases ----
{
  check("csv: headers are normalised past accents and spacing",
    normaliserEntete(" Code Postal ") === "code_postal" &&
      normaliserEntete("Libellé") === "libelle");

  // ⚠️ The failure that shifts every following column by one. A French address
  // contains a comma as a matter of course.
  const avecVirgule = decouperLigneCsv('Usine A;"12, rue de la Paix";28000;Chartres', ";");
  check("csv: a comma inside a quoted field does not split it",
    avecVirgule.length === 4 && avecVirgule[1] === "12, rue de la Paix");
  check("csv: doubled quotes are unescaped",
    decouperLigneCsv('"dit ""le vieux moulin""";x', ";")[0] === 'dit "le vieux moulin"');

  // ⚠️ French Excel writes semicolons, because the decimal comma forbids commas.
  check("csv: the French Excel semicolon is detected",
    detecterSeparateur("label;adresse;code_postal;ville") === ";");
  check("csv: a comma-separated file is detected too",
    detecterSeparateur("label,adresse,code_postal,ville") === ",");
  check("csv: tabs too", detecterSeparateur("label\tadresse\tville") === "\t");

  // ⚠️ Excel prepends a BOM, which corrupts the FIRST header only — so `label`
  // stops matching and every site is named "Ligne N" with no visible cause.
  const bom = parserCsv("﻿label;adresse;ville\nUsine A;12 rue X;Chartres");
  check("csv: an Excel BOM does not break the first column",
    bom.colonnesReconnues.includes("label") && bom.lignes[0].champs.label === "Usine A");

  const p = parserCsv(
    "label;adresse;code_postal;ville;chiffre_affaires\n" +
      'Usine A;"12, rue de la Paix";28000;Chartres;1000000\n' +
      "Dépôt B;3 av. du Port;34000;Montpellier;500000\n",
  );
  check("csv: rows are parsed with 1-based file line numbers",
    p.lignes.length === 2 && p.lignes[0].ligne === 2 && p.lignes[1].ligne === 3);
  check("csv: unrecognised columns are reported, not silently dropped",
    p.colonnesIgnorees.includes("chiffre_affaires"));
  check("csv: the address is assembled from the columns present",
    adresseDeLigne(p.lignes[0]) === "12, rue de la Paix 28000 Chartres");
  check("csv: an empty file says so rather than throwing",
    parserCsv("").message === "Fichier vide.");

  // Truncation must be announced: silently importing 500 of 800 rows is the worst
  // outcome, because the user has no reason to look.
  const gros = parserCsv(
    "label;ville\n" + Array.from({ length: MAX_LIGNES + 20 }, (_, i) => `S${i};Chartres`).join("\n"),
  );
  check("csv: over the cap, the file is truncated AND the shortfall is named",
    gros.lignes.length === MAX_LIGNES && /tronqué/.test(gros.message ?? ""));
  check("csv: … and the message tells the user to relaunch rather than assume",
    /relancez/.test(gros.message ?? ""));
}

// ---- 6. Verdicts: an ambiguous geocode is NEVER auto-resolved ----
{
  const ligne = { ligne: 2, champs: { label: "Usine A", adresse: "12 rue X", ville: "Chartres" } };
  const cand = (label: string, score: number, lat = 48.44, lon = 1.49): CandidatBan => ({
    label,
    score,
    lat,
    lon,
    citycode: "28085",
  });
  const enFrance = () => true;

  const net = verdictPour(ligne, [cand("12 rue X 28000 Chartres", 0.95)], enFrance);
  check("verdict: a strong single match resolves", net.verdict === "resolu" && net.citycode === "28085");

  // ⚠️ 0.92 against 0.91: the two are indistinguishable, and picking the first is
  // picking at random.
  const proches = verdictPour(
    ligne,
    [cand("12 rue Xavier, Chartres", 0.92), cand("12 rue Xénophon, Chartres", 0.91)],
    enFrance,
  );
  check("verdict: two near-equal candidates are AMBIGUOUS, not resolved",
    proches.verdict === "ambigu");
  check("verdict: both candidates are handed back for arbitration",
    (proches.candidats?.length ?? 0) === 2);
  check("verdict: … and the message says the tool refuses to draw lots",
    /tirer au sort/.test(proches.message));

  const faible = verdictPour(ligne, [cand("quelque chose", SEUIL_SCORE_ACCEPTE - 0.01)], enFrance);
  check("verdict: a weak match is ambiguous", faible.verdict === "ambigu");
  check("verdict: … and states the rule that justifies refusing it",
    /pire qu'un rattachement manquant/.test(faible.message));

  check("verdict: no candidate at all is 'not resolved', and the site is not created",
    verdictPour(ligne, [], enFrance).verdict === "non_resolu");
  check("verdict: a row with no address says which columns were read",
    verdictPour({ ligne: 3, champs: { label: "X" } }, [], enFrance).verdict === "adresse_absente");

  // G15 inside the import: created, counted, marked.
  const hors = verdictPour(ligne, [cand("Barcelona", 0.98, 41.39, 2.17)], () => false);
  check("verdict: an out-of-France match is created and MARKED, not dropped",
    hors.verdict === "hors_perimetre" && hors.lat === 41.39);
  check("verdict: … and never counted as zero", /jamais un zéro/.test(hors.message));

  // The two thresholds are judgements and must be labelled as uncalibrated.
  check("thresholds: the acceptance threshold is a documented judgement",
    /JUGEMENTS?, non calibré/.test(
      construireRapport({
        parse: { lignes: [], colonnesReconnues: [], colonnesIgnorees: [], separateur: ";" },
        resultats: [],
      }).hypotheses.join(" "),
    ));
  check("thresholds: and the ambiguity gap is exported so it can be checked later",
    ECART_AMBIGUITE > 0 && ECART_AMBIGUITE < 0.2);
}

// ---- 7. The report: ambiguous rows are neither imported nor discarded ----
{
  const parse = parserCsv("label;adresse;ville\nA;1 rue X;Chartres\nB;2 rue Y;Chartres\nC;;\n");
  const resultats = [
    { ligne: 2, label: "A", verdict: "resolu" as const, message: "ok", lat: 48.4, lon: 1.4 },
    { ligne: 3, label: "B", verdict: "ambigu" as const, message: "à arbitrer" },
    { ligne: 4, label: "C", verdict: "adresse_absente" as const, message: "pas d'adresse" },
  ];
  const r = construireRapport({ parse, resultats });
  check("report: counts per verdict are published", r.compte.resolu === 1 && r.compte.ambigu === 1);
  // ⚠️ THE rule of the whole feature: importables excludes the ambiguous ones, and
  // `aArbitrer` names them separately from the failures. Three buckets, not two.
  check("report: an ambiguous row is NOT importable", r.importables === 1);
  check("report: … and is counted apart from the failures", r.aArbitrer === 1);
  check("report: the ignored columns are named", Array.isArray(r.colonnesIgnorees));
  check("report: the separator choice is explained, with its reason",
    r.hypotheses.some((h) => /virgule décimale/.test(h)));

  const csv = rapportEnCsv(r);
  check("report: the CSV starts with a BOM so Excel FR opens it correctly",
    csv.startsWith("﻿"));
  check("report: one line per row, plus the header", csv.trim().split(/\r\n/).length === 4);
  check("report: the CSV carries the per-row verdict and message",
    csv.includes("ambigu") && csv.includes("à arbitrer"));
  // An out-of-perimeter site IS importable — G15 says counted and marked.
  const g15 = construireRapport({
    parse,
    resultats: [{ ligne: 2, label: "X", verdict: "hors_perimetre" as const, message: "hors" }],
  });
  check("report: an out-of-perimeter row is importable, because G15 counts it",
    g15.importables === 1 && g15.aArbitrer === 0);
}

console.log(failures === 0 ? "n3: all checks pass" : `n3: ${failures} FAILED`);
if (failures > 0) process.exit(1);
