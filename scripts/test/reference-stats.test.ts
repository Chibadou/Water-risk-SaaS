// Unit tests for the empirical reference statistics in lib/hubeau
// (IPS-nappes and VCN10/QMNA5 low-flow). Offline, synthetic series.
// npx tsx scripts/test/reference-stats.test.ts

import { computeIps, computeLowFlow, quantile, type SeriesPoint } from "../../lib/hubeau";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

// --- quantile ---------------------------------------------------------------
check("quantile p=0 → min", quantile([1, 2, 3, 4, 5], 0) === 1);
check("quantile p=1 → max", quantile([1, 2, 3, 4, 5], 1) === 5);
check("quantile p=0.5 → median", quantile([1, 2, 3, 4, 5], 0.5) === 3);
check("quantile interpolates", near(quantile([0, 10], 0.2), 2));

// --- IPS (groundwater level, higherIsBetter = true) -------------------------
// 15 years of July means climbing 100..114; the latest July (year 15) = the
// lowest value → should read "très basse", high risk.
const julyLow: SeriesPoint[] = [];
for (let y = 0; y < 15; y++) julyLow.push({ date: `${2010 + y}-07-15`, value: y === 14 ? 99 : 100 + y });
const ipsLow = computeIps(julyLow, true);
check("IPS computed with ≥10 years", ipsLow !== undefined);
check("IPS years counted", ipsLow?.years === 15);
check("lowest-ever July → high risk (>80)", (ipsLow?.score ?? 0) > 80);
check("lowest-ever July → 'très basse'", ipsLow?.label.includes("très basse") === true);

// Latest July = the highest value → low risk.
const julyHigh: SeriesPoint[] = [];
for (let y = 0; y < 15; y++) julyHigh.push({ date: `${2010 + y}-07-15`, value: y === 14 ? 130 : 100 + y });
const ipsHigh = computeIps(julyHigh, true);
check("highest-ever July → low risk (<20)", (ipsHigh?.score ?? 100) < 20);

// Depth series (higherIsBetter = false): deepest latest = least water = high risk.
const depthDeep: SeriesPoint[] = [];
for (let y = 0; y < 12; y++) depthDeep.push({ date: `${2010 + y}-08-10`, value: y === 11 ? 20 : 10 - y * 0.1 });
const ipsDepth = computeIps(depthDeep, false);
check("deepest-ever depth → high risk (>80)", (ipsDepth?.score ?? 0) > 80);

// Too little history → undefined (never invented).
check("IPS undefined under 10 same-month years", computeIps(julyLow.slice(0, 5), true) === undefined);

// --- Low-flow (VCN10 / QMNA5) ----------------------------------------------
// 10 years of daily flow. Build a yearly cycle: high in winter, low in summer.
// One recent year has a much deeper drought than the reference distribution.
function yearDaily(year: number, summerMin: number): SeriesPoint[] {
  const pts: SeriesPoint[] = [];
  const start = Date.UTC(year, 0, 1);
  for (let d = 0; d < 365; d++) {
    const date = new Date(start + d * 86400_000).toISOString().slice(0, 10);
    // seasonal: min around day 210 (late July)
    const seasonal = 1 + Math.cos(((d - 210) / 365) * 2 * Math.PI); // 0..2
    pts.push({ date, value: summerMin + seasonal * 3 });
  }
  return pts;
}
const flow: SeriesPoint[] = [];
for (let y = 2010; y <= 2018; y++) flow.push(...yearDaily(y, 2)); // baseline summers
// current partial year with a severe low flow at the end
const cur = yearDaily(2019, 2);
for (const p of cur.slice(-15)) p.value = 0.4; // recent 10-day mean well below VCN10
flow.push(...cur);
const lf = computeLowFlow(flow);
check("low-flow computed with ≥6 years", lf !== undefined);
check("low-flow references ≥8 years", (lf?.years ?? 0) >= 8);
check("severe recent drought → high risk (>70)", (lf?.score ?? 0) > 70);
check("low-flow detail mentions VCN10", lf?.detail.includes("VCN10") === true);

// Comfortable recent flow → low risk.
const flow2: SeriesPoint[] = [];
for (let y = 2010; y <= 2019; y++) flow2.push(...yearDaily(y, 2));
const lf2 = computeLowFlow(flow2);
check("normal recent flow → lower risk than drought", (lf2?.score ?? 100) < (lf?.score ?? 0));

// Too few years → undefined.
check("low-flow undefined under 6 years", computeLowFlow(yearDaily(2020, 2)) === undefined);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("reference stats: all checks pass");
