// Unit tests for the ESG report builder (lib/report).
// npx tsx scripts/test/report.test.ts

import {
  buildMarkdownReport,
  buildPortfolioMarkdownReport,
  portfolioReportFilename,
  reportFilename,
  type PortfolioReportSite,
  type ReportInput,
} from "../../lib/report";
import type { ProjectionPayload } from "../../lib/projectionsShared";
import { markdownToHtml, reportPrintHtml } from "../../lib/reportHtml";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

const projection: ProjectionPayload = {
  available: true,
  meta: {
    demo: false,
    source: "Explore2",
    reference: "1976-2005",
    aggregation: "commune",
    warming_levels: ["+2°C France", "+2.7°C France", "+4°C France"],
    indicators: {
      VCN10_ete: { label: "Étiage estival (VCN10)", unit: "%" },
      QA_yr: { label: "Débit moyen annuel (QA)", unit: "%" },
    },
    stats: {
      VCN10_ete: { median: "q50", lo: "q05", hi: "q95" },
      QA_yr: { median: "q50", lo: "q05", hi: "q95" },
    },
  },
  commune: { code: "34172", nom: "Montpellier" },
  data: {
    "+2.7°C France": {
      VCN10_ete: [-43, -20, 5],
      QA_yr: [-10, 2, 15],
    },
  },
  benchmark: {
    indicator: "VCN10_ete",
    level: "+2.7°C France",
    value: -20,
    national: { n: 34418, severityPercentile: 78 },
    department: { code: "34", n: 340, severityPercentile: 65 },
  },
};

const input: ReportInput = {
  generatedAt: new Date("2026-07-21T10:00:00Z"),
  label: "Usine Montpellier Sud",
  lat: 43.58,
  lon: 3.9,
  citycode: "34172",
  profil: "entreprise",
  secteur: "industrie",
  scoreInputs: {
    worst: "alerte",
    joursAlertePlus: 30,
    joursAlertePlusMoyen: 25,
    anneesCompletes: 4,
    onde: { score: 40, stations: 3 },
    hydro: null,
    piezo: null,
  },
  zonesByType: [
    { type: "SUP", niveau: "alerte" },
    { type: "SOU", niveau: "vigilance" },
    { type: "AEP", niveau: undefined },
  ],
  stationDistanceKm: 8,
  history: {
    moyen: 25,
    annees: 4,
    parMois: { "2022": { 6: 10, 7: 20 }, "2023": { 7: 15, 8: 12 } },
  },
  projection,
};

// French number formatting uses non-breaking spaces as thousands separators;
// normalize them so assertions can use plain ASCII spaces.
const raw = buildMarkdownReport(input);
const md = raw.replace(/[\u00a0\u202f]/g, " ");

check("has a top-level title with the label", md.includes("# Rapport de risque hydrique — Usine Montpellier Sud"));
check("shows the composite score /100", /Score composite : \d+\/100/.test(md));
check("names a risk class", /classe « (Négligeable|Faible|Modéré|Élevé|Très élevé|Critique) »/.test(md));
check("includes the score decomposition table", md.includes("| Composante | Poids | Score | Détail |"));
check("includes the regulatory section", md.includes("Statut réglementaire en vigueur"));
check("maps zone types to labels", md.includes("Eaux superficielles"));
check("includes structural history", md.includes("25 jours/an") || md.includes("25 jours"));
check("names a seasonal peak month", /Pic saisonnier : \*\*(Jan|Fév|Mar|Avr|Mai|Juin|Juil|Août|Sep|Oct|Nov|Déc)\*\*/.test(md));
check("includes the 2050 projection section", md.includes("Projection climatique — horizon 2050"));
check("shows the reference warming level", md.includes("+2,7 °C"));
check("shows the VCN10 median in the table", md.includes("Étiage estival (VCN10)"));
check("includes the national benchmark percentile", md.includes("78 %") && md.includes("34 418"));
check("includes the departmental benchmark", md.includes("65 %"));
check("includes the ESRS E3 mapping section", md.includes("Correspondance ESRS E3"));
check("ESRS section renumbered to 7 after the three-outputs section",
  md.includes("## 7. Correspondance ESRS E3"));

// --- section 6: the note's three outputs, side by side ---
{
  const withOutputs = buildMarkdownReport({
    ...input,
    js: {
      available: true,
      hypotheses: ["Année type moyennée sur les 9 années COMPLÈTES de la fenêtre."],
      avertissement: "Les jours sous statut décrivent la zone d'alerte.",
      anneeType: { alerte: 60, crise: 20 },
      horizons: [
        { id: "annee_type", label: "Année type", available: true, preuve: "N1",
          joursTotal: 80, joursAlertePlus: 80, detail: "" },
        { id: "fin_saison", label: "Fin de saison", available: false, detail: "hors saison" },
        { id: "horizon_2050", label: "Horizon 2050", available: true, preuve: "N3",
          joursTotal: 95, joursAlertePlus: 95, lo: 88, hi: 104, detail: "" },
      ],
    },
    vnp: {
      available: true,
      crise: { min: 22_000, max: 31_000, detail: "80 jours pondérés." },
      structurel: { min: 36_500, max: 36_500, detail: "Réduction de 10 % — ne s'additionne pas." },
      kappa: 1,
      hypotheses: ["κ = 1 : VNP NOMINAL, hypothèse prudentielle."],
      vrefDetail: "Volume déclaré par l'exploitant.",
    },
    ia: {
      available: true,
      jeaMin: 12,
      jeaMax: 19,
      episodesRetenus: 4,
      episodesEcartes: 1,
      maxJoursConsecutifs: 22,
      distribution: [{ duree: 3, nombre: 2 }, { duree: 22, nombre: 1 }],
      reponse: "linear",
      hypotheses: ["Besoin supposé PLAT sur l'année."],
    },
  });

  check("outputs: section present and numbered 6",
    withOutputs.includes("## 6. Jours sous statut, volume non prélevable, interruption d'activité"));
  // Each output gets its OWN subsection and its own unit named in the heading.
  // A single "impact" figure would have had to pick one unit and hide two.
  check("outputs: JS has its own subsection, in days",
    withOutputs.includes("### 6.1 JS — jours sous statut (unité : jours)"));
  check("outputs: VNP has its own, in m³",
    withOutputs.includes("### 6.2 VNP — volume non prélevable (unité : m³/an)"));
  check("outputs: IA has its own, in JEA",
    withOutputs.includes("### 6.3 IA — interruption d'activité (unité : jours-équivalents d'arrêt)"));

  check("outputs: JS states the days under arrêté", withOutputs.includes("80 j"));
  check("outputs: JS labels its evidence level per horizon (§0.1, G8)",
    withOutputs.includes("| N1 |") && withOutputs.includes("| N3 |"));
  check("outputs: JS carries §4.1's own warning that it is the least durable",
    withOutputs.includes("décrivent la zone d'alerte"));
  check("outputs: 2050 band rendered as a range, never a point",
    withOutputs.includes("(88–104)"));
  check("outputs: unavailable horizon renders as a dash row",
    withOutputs.includes("| Fin de saison | — |"));

  // ⚠️ anti-pattern n°3, in the export this time. A report is exactly where
  // someone would add the two VNP components together to get a headline.
  // fr-FR groups with a narrow no-break space (U+202F), so a literal " " fails
  // for the wrong reason.
  const plain = withOutputs.replace(/[\u00a0\u202f]/g, " ");
  check("outputs: both VNP components are present",
    plain.includes("22 000") && plain.includes("36 500"));
  check("outputs: the report states in words that they must not be added",
    withOutputs.includes("ne s'additionnent pas"));
  check("outputs: no total of the two appears anywhere", !plain.includes("58 500"));
  check("outputs: the V_ref trail travels with the volume",
    withOutputs.includes("Origine du volume de référence"));

  check("outputs: the JEA is rendered as an interval", withOutputs.includes("12 à 19 JEA/an"));
  check("outputs: the JEA says how many REAL episodes it rests on",
    withOutputs.includes("4 épisodes réels"));
  check("outputs: the observed duration distribution is published (§5.5)",
    withOutputs.includes("22 j × 1"));

  // ADR-006: the journal is part of the document, not a note kept elsewhere.
  check("outputs: the assumption journal is a subsection of the report",
    withOutputs.includes("### 6.4 Ce que ces chiffres supposent"));
  check("outputs: it carries assumptions from all three engines",
    withOutputs.includes("années COMPLÈTES") &&
      withOutputs.includes("κ = 1") &&
      withOutputs.includes("supposé PLAT"));
  check("outputs: and says it was produced at computation time",
    withOutputs.includes("au moment du calcul"));

  // Without any of the three the report must omit the section, not render an
  // empty one.
  check("outputs: omitted entirely when none is available",
    !md.includes("## 6. Jours sous statut"));
}
check("includes the sources & disclaimer", md.includes("Sources & limites") && md.includes("ne se substituent pas aux arrêtés"));
check("commune name rendered", md.includes("Montpellier (34172)"));
check("sector rendered", md.includes("Industrie"));

// Projection absent → section skipped gracefully.
const noProj = buildMarkdownReport({ ...input, projection: undefined });
check("no projection → no 2050 section", !noProj.includes("Projection climatique"));
check("no projection → still has score", noProj.includes("Score composite"));

// Filename slug.
check("filename slug is clean", reportFilename("Usine Montpellier Sud", new Date("2026-07-21T00:00:00Z")) === "hydrovigie-rapport-usine-montpellier-sud-2026-07-21.md");
check("filename strips accents", reportFilename("Métropole Éléctrique", new Date("2026-01-02T00:00:00Z")) === "hydrovigie-rapport-metropole-electrique-2026-01-02.md");
check("filename fallback when empty", reportFilename("!!!", new Date("2026-01-02T00:00:00Z")) === "hydrovigie-rapport-site-2026-01-02.md");

// --- Portfolio report -------------------------------------------------------
const portfolioSites: PortfolioReportSite[] = [
  { label: "Site A Perpignan", dept: "66", secteur: "industrie", score: 82, worst: "alerte_renforcee" },
  { label: "Site B Chartres", dept: "28", secteur: "agriculture", score: 45, worst: "alerte" },
  { label: "Site C Lyon", dept: "69", secteur: "services", score: 20, worst: "vigilance" },
  { label: "Site D (non évalué)", dept: "66", secteur: "autre" },
];
const pRaw = buildPortfolioMarkdownReport({ generatedAt: new Date("2026-07-21T00:00:00Z"), sites: portfolioSites });
const p = pRaw.replace(/[\u00a0\u202f]/g, " ");

check("portfolio: title", p.includes("# Rapport de risque hydrique — portefeuille"));
check("portfolio: counts sites", p.includes("4 (3 évalués)"));
check("portfolio: has synthesis section", p.includes("## 1. Synthèse du portefeuille"));
check("portfolio: risk-class distribution table", p.includes("Répartition par classe de risque"));
check("portfolio: geographic breakdown (>1 dept)", p.includes("## 2. Répartition géographique"));
check("portfolio: department names resolved", p.includes("Pyrénées-Orientales (66)"));
check("portfolio: per-site table", p.includes("## 3. Détail par site"));
check("portfolio: the JS and IA columns are both present, and distinct",
  p.includes("| Jours sous arrêté | JEA | 2050 |"));
{
  const withDays = buildPortfolioMarkdownReport({
    generatedAt: new Date("2026-07-21T10:00:00Z"),
    sites: [
      { label: "Site A", dept: "34", secteur: "industrie", score: 60, worst: "alerte",
        joursSousArrete: 25, jea: 11, jours2050: 34 },
      { label: "Site B", dept: "34", secteur: "services", score: 20 },
    ],
  });
  check("portfolio: days and JEA rendered for an estimated site",
    withDays.includes("| 25 j | 11 JEA | 34 j |"));
  check("portfolio: unestimated site shows dashes, never zero days",
    withDays.includes("| — | — | — |"));
}
check("portfolio: lists each site", ["Site A Perpignan", "Site B Chartres", "Site C Lyon", "Site D"].every((n) => p.includes(n)));
check("portfolio: unscored site marked n/d", p.includes("n/d"));
check("portfolio: sorted worst-first (A before C)", p.indexOf("Site A Perpignan") < p.indexOf("Site C Lyon"));
check("portfolio: disclaimer present", p.includes("ne se substituent pas aux arrêtés"));
check("portfolio filename", portfolioReportFilename(new Date("2026-07-21T00:00:00Z")) === "hydrovigie-portefeuille-2026-07-21.md");

// Empty portfolio degrades gracefully.
const emptyP = buildPortfolioMarkdownReport({ generatedAt: new Date("2026-07-21T00:00:00Z"), sites: [] });
check("portfolio: empty → no crash, states none evaluated", emptyP.includes("Aucun site évalué"));

// --- Executive summary + correlation, injected rather than rebuilt ----------
// Both come from lib/executive.ts and lib/portefeuille.ts, whose own suites
// test their content. What matters here is that the report places them and
// renumbers around them instead of quietly dropping a section.
{
  const withSynthese = buildPortfolioMarkdownReport({
    generatedAt: new Date("2026-07-21T00:00:00Z"),
    sites: portfolioSites,
    executiveSummary: "**Accroche de test.**\n\n- **Situation** — deux sites sous restriction.",
    correlation: "- **Pic de simultanéité** : 3 sites contraints en même temps.",
  });
  check("portfolio: synthesis sits before the evidence",
    withSynthese.indexOf("## Synthèse") < withSynthese.indexOf("## 1. Synthèse du portefeuille"));
  check("portfolio: executive summary content is carried through",
    withSynthese.includes("**Accroche de test.**"));
  check("portfolio: correlation gets its own numbered section",
    withSynthese.includes("## 3. Corrélation entre sites"));
  check("portfolio: per-site detail renumbers to 4 when correlation is present",
    withSynthese.includes("## 4. Détail par site"));
  check("portfolio: per-site detail stays at 3 without correlation",
    p.includes("## 3. Détail par site") && !p.includes("## 4. Détail par site"));
  check("portfolio: no empty synthesis heading when nothing was passed",
    !p.includes("## Synthèse\n"));
  // The report is printed to PDF, so the injected Markdown must survive the
  // converter — a section that renders as raw asterisks is a broken deliverable.
  const html = markdownToHtml(withSynthese);
  check("portfolio: injected sections survive the HTML conversion",
    html.includes("<h2>3. Corrélation entre sites</h2>") &&
      html.includes("<strong>Accroche de test.</strong>"));
}

// --- PDF export: Markdown → printable HTML (lib/reportHtml) -----------------
// Real report content: headings, tables, bold/italic, disclaimer.
{
  const html = markdownToHtml(md);
  check("html: h1 title", html.includes("<h1>Rapport de risque hydrique"));
  check("html: h2 sections", html.includes("<h2>1. Identification du site</h2>"));
  // ⚠️ `[\s\S]*` and not `.*` with the `s` flag: the project targets ES2017, where that flag
  // is a TS1501 error. It was the ONLY error standing between this repo and a working
  // `npx tsc --noEmit`, which covers `scripts/` — and its absence is what let a test fixture
  // omit a required record key and fail at runtime instead of at compile time (sprint 48).
  check("html: score table rendered", /<table>[\s\S]*Poids[\s\S]*<\/table>/.test(html));
  check("html: table has header + body rows", (html.match(/<tr>/g) ?? []).length > 3);
  check("html: bold score line converted", html.includes("<strong>Score composite"));
  // The site report no longer emits bullets — the ESRS mapping became a table —
  // so exercise the converter's list branch directly rather than through a
  // report that would make this assertion pass for the wrong reason.
  check("html: bullet list converted", markdownToHtml("- un\n- deux").includes("<ul><li>"));
  check("html: ESRS mapping is now a table", html.includes("<td>") && /ESRS E3/.test(html));
  check("html: no leftover markdown table pipes", !html.includes("| ---"));
  check("html: no raw ** left over", !html.includes("**"));
}

// Portfolio report round-trips too (different table shapes, empty-state text).
{
  const html = markdownToHtml(p);
  check("html: portfolio title", html.includes("portefeuille"));
  check("html: portfolio per-site table", html.includes("Site A Perpignan"));
}

// User-controlled text (site label) must be escaped, never interpreted as HTML.
{
  const evil: ReportInput = {
    ...input,
    label: '<img src=x onerror=alert(1)> & "quotes" & *italic* not bold',
  };
  const evilHtml = markdownToHtml(buildMarkdownReport(evil));
  check("html: site label HTML-escaped, not executable", !evilHtml.includes("<img"));
  check("html: ampersand escaped", evilHtml.includes("&amp;"));
  check("html: raw quote character escaped", evilHtml.includes("&quot;"));
}

// Full standalone document: valid shell, print button, print-only CSS.
{
  const doc = reportPrintHtml(md, "Rapport HydroVigie — Test <site>");
  check("doc: starts with doctype", doc.startsWith("<!doctype html>"));
  check("doc: title present and escaped", doc.includes("<title>Rapport HydroVigie — Test &lt;site&gt;</title>"));
  check("doc: has a print trigger", doc.includes("onclick=\"window.print()\""));
  check("doc: print CSS hides the toolbar", doc.includes("@media print") && doc.includes(".print-bar { display: none; }"));
  check("doc: report body embedded", doc.includes("Rapport de risque hydrique"));
}

console.log(failures === 0 ? "report: all checks pass" : `report: ${failures} FAILED`);
if (failures > 0) process.exit(1);
