// Unit tests for the BNPE aggregation (lib/bnpe). Offline, synthetic rows.
// npx tsx scripts/test/bnpe.test.ts

import { aggregateBnpe, normalizeUsage } from "../../lib/bnpe";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// --- usage normalization ---
check("irrigation → Agriculture", normalizeUsage("Irrigation") === "Agriculture");
check("AEP → Eau potable", normalizeUsage("Alimentation en eau potable") === "Eau potable");
check("industrie → Industrie", normalizeUsage("Industrie et activités économiques") === "Industrie");
check("refroidissement → Énergie", normalizeUsage("Énergie (refroidissement)") === "Énergie");
check("unknown → Autres", normalizeUsage("Truc inconnu") === "Autres");
check("empty → Autres", normalizeUsage(undefined) === "Autres");

// --- aggregation: latest year, by usage, ouvrage count ---
const rows = [
  // 2019 (older, must be ignored in favor of 2021)
  { annee: 2019, volume: 1000, libelle_usage: "Irrigation", code_ouvrage: "A" },
  // 2021 (latest)
  { annee: 2021, volume: 500000, libelle_usage: "Irrigation", code_ouvrage: "A" },
  { annee: 2021, volume: 300000, libelle_usage: "Irrigation", code_ouvrage: "B" },
  { annee: 2021, volume: 200000, libelle_usage: "Alimentation en eau potable", code_ouvrage: "C" },
  { annee: 2021, volume: 0, libelle_usage: "Industrie", code_ouvrage: "D" }, // zero contributes nothing
  { annee: 2021, volume: -5, libelle_usage: "Industrie", code_ouvrage: "E" }, // negative skipped
];
const agg = aggregateBnpe(rows)!;
check("latest year selected", agg.annee === 2021);
check("total volume summed", agg.totalM3 === 1000000);
check("distinct ouvrages counted (A,B,C only)", agg.ouvrages === 3);
check("agriculture aggregated across ouvrages", agg.parUsage[0].usage === "Agriculture" && agg.parUsage[0].volumeM3 === 800000);
check("second usage is Eau potable", agg.parUsage[1].usage === "Eau potable" && agg.parUsage[1].volumeM3 === 200000);
check("zero/negative usages dropped", agg.parUsage.every((u) => u.usage !== "Industrie"));

// --- empty input → null ---
check("no rows → null", aggregateBnpe([]) === null);
check("only invalid rows → null", aggregateBnpe([{ annee: 2020 }, { volume: 5 }]) === null);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("bnpe: all checks pass");
