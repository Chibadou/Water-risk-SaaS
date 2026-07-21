// Unit tests for the ESG report builder (lib/report).
// npx tsx scripts/test/report.test.ts

import { buildMarkdownReport, reportFilename, type ReportInput } from "../../lib/report";
import type { ProjectionPayload } from "../../lib/projectionsShared";

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

console.log(failures === 0 ? "report: all checks pass" : `report: ${failures} FAILED`);
if (failures > 0) process.exit(1);
