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

// --- usage x milieu: the join that answers "who takes the water I depend on" ---
{
  const rows = [
    { annee: 2023, volume: 700000, libelle_usage: "IRRIGATION", code_ouvrage: "OPR1" },
    { annee: 2023, volume: 300000, libelle_usage: "INDUSTRIE", code_ouvrage: "OPR2" },
    { annee: 2023, volume: 100000, libelle_usage: "INDUSTRIE", code_ouvrage: "OPR3" },
  ];
  const milieux = new Map<string, "souterrain" | "superficiel" | "littoral" | "inconnu">([
    ["OPR1", "superficiel"],
    ["OPR2", "souterrain"],
    // OPR3 deliberately absent: an unjoined ouvrage must not vanish.
  ]);
  const agg = aggregateBnpe(rows, milieux)!;
  check("milieu: split reported as available", agg.milieuAvailable === true);
  check("milieu: groundwater total", agg.parMilieu?.souterrain === 300000);
  check("milieu: surface total", agg.parMilieu?.superficiel === 700000);
  check("milieu: unjoined ouvrage kept as inconnu, not dropped", agg.parMilieu?.inconnu === 100000);
  check("milieu: totals still add up to the overall volume", agg.totalM3 === 1100000);

  const industrie = agg.parUsage.find((u) => u.usage === "Industrie")!;
  check("milieu: per-usage split (industry draws 300k underground)",
    industrie.parMilieu?.souterrain === 300000);
  check("milieu: per-usage split keeps the unjoined share visible",
    industrie.parMilieu?.inconnu === 100000);
}

// --- without the referential, the split is reported as unavailable ---
{
  const agg = aggregateBnpe([
    { annee: 2023, volume: 500, libelle_usage: "INDUSTRIE", code_ouvrage: "X" },
  ])!;
  check("milieu: no referential → flagged unavailable, not asserted", agg.milieuAvailable === false);
  check("milieu: volume still counted", agg.totalM3 === 500);
}

// --- empty input → null ---
check("no rows → null", aggregateBnpe([]) === null);
check("only invalid rows → null", aggregateBnpe([{ annee: 2020 }, { volume: 5 }]) === null);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("bnpe: all checks pass");
