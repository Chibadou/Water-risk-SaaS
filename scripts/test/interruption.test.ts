// Unit tests for the constrained-activity day model (lib/interruption).
// npx tsx scripts/test/interruption.test.ts

import { computeInterruption, type InterruptionInput } from "../../lib/interruption";
import type { YearHistory } from "../../lib/history";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number | undefined, b: number, eps = 0.05) =>
  a !== undefined && Math.abs(a - b) < eps;

const year = (v: Partial<Record<string, number>>): YearHistory => {
  const joursParNiveau = v as YearHistory["joursParNiveau"];
  const joursAlertePlus =
    (v.alerte ?? 0) + (v.alerte_renforcee ?? 0) + (v.crise ?? 0);
  return { joursParNiveau, joursAlertePlus };
};

// A zone with a steady 60 days a year under an arrêté.
const PAR_ANNEE = {
  "2021": year({ vigilance: 999 }), // outside the window: must be ignored
  "2023": year({ vigilance: 20, alerte: 30, alerte_renforcee: 20, crise: 10 }),
  "2024": year({ vigilance: 20, alerte: 30, alerte_renforcee: 20, crise: 10 }),
  "2025": year({ vigilance: 20, alerte: 30, alerte_renforcee: 20, crise: 10 }),
  "2026": year({ vigilance: 500 }), // partial current year: must be ignored
};

const EXPOSURE = { vigilance: 0, alerte: 0.2, alerte_renforcee: 0.5, crise: 0.9 };

const base: InterruptionInput = {
  now: new Date(Date.UTC(2026, 6, 1)), // 1 July 2026
  parAnnee: PAR_ANNEE,
  anneesCompletes: 3,
  exposure: EXPOSURE,
  exposureSource: "restrictions",
};

const horizon = (r: ReturnType<typeof computeInterruption>, id: string) =>
  r.horizons.find((h) => h.id === id)!;

// ---- 1. Typical year averages exactly the complete years ----
{
  const r = computeInterruption(base);
  const h = horizon(r, "annee_type");
  check("typical year: available", r.available && h.available);
  // Only 2023-2025 count; 2021 (outside window) and 2026 (partial) are excluded.
  check("typical year: ignores years outside [now-n, now-1]", h.joursSousArrete === 80);
  // 20x0 + 30x0.2 + 20x0.5 + 10x0.9 = 25
  check("typical year: exposure-weighted days", near(h.joursContraints, 25));
  check("typical year: 'dont arrêt' is the crise subset", near(h.joursArret, 9));
  check("typical year: constrained days never exceed days under an arrêté",
    (h.joursContraints ?? 0) <= (h.joursSousArrete ?? 0));
}

// ---- 2. Vigilance carries no obligation, so it costs no day ----
{
  const r = computeInterruption({
    ...base,
    parAnnee: { "2025": year({ vigilance: 90 }) },
    anneesCompletes: 1,
  });
  const h = horizon(r, "annee_type");
  check("vigilance: 90 days under arrêté", h.joursSousArrete === 90);
  check("vigilance: but 0 constrained day", near(h.joursContraints, 0));
}

// ---- 3. Dependence scales exposure, product capped at 1 ----
{
  const weak = computeInterruption({ ...base, dependance: "faible" });
  const strong = computeInterruption({ ...base, dependance: "critique" });
  check("dependence: low dependence lowers the figure",
    horizon(weak, "annee_type").joursContraints! < 25);
  check("dependence: critical dependence raises it",
    horizon(strong, "annee_type").joursContraints! > 25);
  // crise exposure 0.9 x 1.8 = 1.62, must clamp to 1 → arrêt days = the 10 crise days.
  check("dependence: exposure x dependence is capped at 1 (no day invented)",
    near(horizon(strong, "annee_type").joursArret, 10));
}

// ---- 4. Rest of season: gated, adjusted, and closed after October ----
{
  const parMois = { "2023": { 6: 20, 7: 20 }, "2024": { 6: 20, 7: 20 }, "2025": { 6: 20, 7: 20 } };
  const calm = computeInterruption({ ...base, parMois, anticipationIndex: 0 });
  const tense = computeInterruption({ ...base, parMois, anticipationIndex: 100 });
  check("season: available in July", horizon(calm, "fin_saison").available);
  check("season: a tense anticipation index yields more days than a calm one",
    horizon(tense, "fin_saison").joursContraints! > horizon(calm, "fin_saison").joursContraints!);
  check("season: label names the horizon",
    horizon(calm, "fin_saison").label.includes("juillet"));

  const winter = computeInterruption({ ...base, parMois, now: new Date(Date.UTC(2026, 10, 15)) });
  check("season: closed once the low-water season is over",
    !horizon(winter, "fin_saison").available);
}

// ---- 5. 2050: extension and intensification, monotone, conservative ----
{
  const mild = computeInterruption({
    ...base,
    projection: { dtBE: [0, 0, 0], vcn10: [0, 0, 0] },
  });
  const longer = computeInterruption({
    ...base,
    projection: { dtBE: [0, 30, 60], vcn10: [0, 0, 0] },
  });
  const deeper = computeInterruption({
    ...base,
    projection: { dtBE: [0, 0, 0], vcn10: [-40, -40, -40] },
  });

  check("2050: no change projected → same as the typical year",
    near(horizon(mild, "horizon_2050").joursContraints, 25));
  check("2050: monotone in low-water duration (more days → more constraint)",
    horizon(longer, "horizon_2050").joursContraints! > 25);
  check("2050: monotone in low-water severity (deeper étiage → more constraint)",
    horizon(deeper, "horizon_2050").joursContraints! > 25);

  // Intensification must move days between levels, never create them.
  check("2050: intensification conserves the day total",
    horizon(deeper, "horizon_2050").joursSousArrete === 80);
  check("2050: deeper étiage shifts days toward crise",
    horizon(deeper, "horizon_2050").joursArret! > 9);

  const h = horizon(longer, "horizon_2050");
  check("2050: uncertainty band brackets the median", h.lo! <= h.joursContraints! && h.joursContraints! <= h.hi!);
  check("2050: band is not degenerate when the model spread is", h.hi! > h.lo!);
}

// ---- 6. Missing inputs degrade honestly, never to 0 ----
{
  const noExposure = computeInterruption({ ...base, exposure: {} });
  check("degrade: no published restrictions → unavailable, not 0 days", !noExposure.available);
  check("degrade: and says why", (noExposure.message ?? "").includes("Restrictions par usage"));

  const noHistory = computeInterruption({ ...base, parAnnee: undefined, anneesCompletes: 0 });
  check("degrade: no complete year of arrêtés → unavailable", !noHistory.available);

  const noProjection = computeInterruption(base);
  check("degrade: missing projection only disables the 2050 horizon",
    noProjection.available && !horizon(noProjection, "horizon_2050").available);
  check("degrade: the other horizons still stand",
    horizon(noProjection, "annee_type").available);

  // A level with unknown exposure must not be silently counted as unrestricted.
  const partial = computeInterruption({ ...base, exposure: { crise: 0.9 } });
  check("degrade: unknown level exposure is flagged, not counted as 0",
    (horizon(partial, "annee_type").message ?? "").includes("partielle"));
}

console.log(failures === 0 ? "interruption: all checks pass" : `interruption: ${failures} FAILED`);
if (failures > 0) process.exit(1);
