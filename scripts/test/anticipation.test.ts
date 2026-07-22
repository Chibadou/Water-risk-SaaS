// Unit tests for the restriction anticipation index (lib/anticipation).
// npx tsx scripts/test/anticipation.test.ts

import { computeAnticipation, anticipationLevel, type AnticipationInput } from "../../lib/anticipation";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// A zone with a clear summer restriction pattern (Jun–Sep), three complete years.
const summerParMois = (): Record<string, Record<number, number>> => ({
  "2023": { 5: 10, 6: 28, 7: 30, 8: 18 },
  "2024": { 5: 8, 6: 25, 7: 29, 8: 15 },
  "2025": { 6: 22, 7: 27, 8: 12 },
});

const july = new Date(Date.UTC(2026, 6, 15));
const january = new Date(Date.UTC(2026, 0, 15));

// ---- Level thresholds ----
check("level thresholds", anticipationLevel(10).id === "peu_probable" &&
  anticipationLevel(30).id === "possible" &&
  anticipationLevel(55).id === "probable" &&
  anticipationLevel(80).id === "tres_probable");

// ---- 1. Off-season stays low despite degraded physical signals ----
{
  const r = computeAnticipation({
    now: january,
    worst: undefined,
    parMois: summerParMois(),
    anneesCompletes: 3,
    nappe: { score: 90, trend: "baisse", higherIsBetter: false },
    debit: { score: 85, trend: "baisse", higherIsBetter: true },
    onde: null, // seasonal network off
    stationDistanceKm: 8,
  });
  check("off-season: available", r.available);
  check("off-season: low level despite stressed nappe/débit", r.level.rank <= 2);
  check("off-season: index below possible/probable boundary", r.index < 45);
}

// ---- 2. Peak season + low falling nappe + year ahead → high ----
{
  const parMois = summerParMois();
  // This year already ahead of the seasonal norm at mid-July.
  parMois["2026"] = { 5: 20, 6: 30 };
  const r = computeAnticipation({
    now: july,
    worst: "alerte",
    parMois,
    anneesCompletes: 3,
    nappe: { score: 88, trend: "baisse", higherIsBetter: false },
    debit: { score: 80, trend: "baisse", higherIsBetter: true },
    onde: { score: 65 },
    stationDistanceKm: 6,
  });
  check("peak+stressed: high level", r.level.rank >= 3);
  check("peak+stressed: index elevated", r.index >= 60);
  check("peak+stressed: trajectory driver present", r.drivers.some((d) => d.label.startsWith("Trajectoire")));
  check("peak+stressed: trajectory reads 'en avance'", r.drivers.some((d) => d.detail.includes("en avance")));
  check("peak+stressed: high confidence", r.confidence === "haute");
}

// ---- 3. Graceful degradation: history only, no physical signals ----
{
  const r = computeAnticipation({
    now: july,
    worst: null, // VigiEau unknown
    parMois: summerParMois(),
    anneesCompletes: 3,
    nappe: null,
    debit: null,
    onde: null,
  });
  check("history-only: available", r.available);
  check("history-only: driven by seasonal base", r.drivers.some((d) => d.label.startsWith("Base saisonnière")));
  check("history-only: reduced coverage", r.coverage <= 0.6);
  check("history-only: not high confidence", r.confidence !== "haute");
}

// ---- 4. Already in alerte → floor raises the level (persistence) ----
{
  const r = computeAnticipation({
    now: july,
    worst: "alerte",
    parMois: {}, // no history at all
    nappe: null,
    debit: null,
    onde: null,
  });
  check("already-restricted: flagged", r.alreadyRestricted === true);
  check("already-restricted: floored to at least probable", r.level.rank >= 3);
}

// ---- 5. Crise floors higher than alerte ----
{
  const base: AnticipationInput = { now: july, parMois: {}, nappe: null, debit: null, onde: null };
  const alerte = computeAnticipation({ ...base, worst: "alerte" });
  const crise = computeAnticipation({ ...base, worst: "crise" });
  check("crise floor >= alerte floor", crise.index >= alerte.index);
  check("crise → très probable", crise.level.id === "tres_probable");
}

// ---- 6. Weight renormalization: nappe carries the most state weight ----
{
  const r = computeAnticipation({
    now: july,
    worst: "vigilance",
    parMois: summerParMois(),
    anneesCompletes: 3,
    nappe: { score: 70 },
    debit: { score: 70 },
    onde: { score: 70 },
    stationDistanceKm: 5,
  });
  const nappeDriver = r.drivers.find((d) => d.label === "État de la nappe");
  const debitDriver = r.drivers.find((d) => d.label === "État du débit");
  check("nappe weight share > débit weight share", (nappeDriver?.weightPct ?? 0) > (debitDriver?.weightPct ?? 0));
  check("state weight shares sum to ~100%", Math.abs(
    r.drivers.filter((d) => d.weightPct !== undefined).reduce((s, d) => s + (d.weightPct ?? 0), 0) - 100,
  ) <= 2);
}

// ---- 7. No data at all → unavailable, not a crash ----
{
  const r = computeAnticipation({ now: july, worst: null, parMois: {}, nappe: null, debit: null, onde: null });
  check("no data: unavailable", r.available === false);
  check("no data: has a message", typeof r.message === "string" && r.message.length > 0);
}

// ---- 8. Horizon label wraps across the year end ----
{
  const r = computeAnticipation({ now: new Date(Date.UTC(2026, 10, 10)), worst: undefined, parMois: summerParMois(), anneesCompletes: 3 });
  check("horizon label wraps Nov→Jan", r.horizonLabel === "novembre à janvier");
}

console.log(failures === 0 ? "anticipation: all checks pass" : `anticipation: ${failures} FAILED`);
if (failures > 0) process.exit(1);
