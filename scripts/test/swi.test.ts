// Unit tests for the soil-moisture precursor (lib/swi).
// npx tsx scripts/test/swi.test.ts

import {
  distanceKm,
  nearestCell,
  percentileIn,
  swiReading,
  type SwiCell,
  type SwiQuantiles,
} from "../../lib/swi";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number, b: number, eps = 0.51) => Math.abs(a - b) < eps;

// ---- 1. Cell attachment ----
{
  const cells: SwiCell[] = [
    { n: 1, lat: 48.85, lon: 2.35 }, // Paris
    { n: 2, lat: 43.6, lon: 3.88 }, // Montpellier
    { n: 3, lat: 48.11, lon: -1.68 }, // Rennes
  ];
  const c = nearestCell(cells, 43.61, 3.87)!;
  check("nearest cell: picks the closest, not the first", c.n === 2);
  check("nearest cell: empty grid yields nothing", nearestCell([], 48, 2) === undefined);
  // Paris-Montpellier is ~595 km; a wrong unit or formula shows up immediately.
  check("distance: Paris→Montpellier ≈ 595 km", near(distanceKm(48.85, 2.35, 43.6, 3.88), 595, 15));
  check("distance: zero for the same point", distanceKm(48.85, 2.35, 48.85, 2.35) < 1e-9);
}

// ---- 2. Percentile within the five-point distribution ----
{
  const q: SwiQuantiles = [0.1, 0.3, 0.5, 0.7, 0.9];
  check("percentile: at the median → 50", near(percentileIn(q, 0.5), 50));
  check("percentile: at q25 → 25", near(percentileIn(q, 0.3), 25));
  check("percentile: at q75 → 75", near(percentileIn(q, 0.7), 75));
  check("percentile: below the record minimum → 0", percentileIn(q, 0.01) === 0);
  check("percentile: above the record maximum → 100", percentileIn(q, 1.5) === 100);
  check("percentile: interpolates between breakpoints", near(percentileIn(q, 0.4), 37.5, 1));

  // Monotonicity is what the score depends on; assert it across the range.
  let mono = true;
  let prev = -1;
  for (let v = 0; v <= 1.0001; v += 0.01) {
    const p = percentileIn(q, v);
    if (p < prev - 1e-9) mono = false;
    prev = p;
  }
  check("percentile: monotone in the value", mono);

  // A degenerate distribution (a cell that never varies) must not divide by zero.
  const flat: SwiQuantiles = [0.5, 0.5, 0.5, 0.5, 0.5];
  const p = percentileIn(flat, 0.5);
  check("percentile: flat distribution stays finite", Number.isFinite(p));
}

// ---- 3. Standardised reading: dry soil is a HIGH stress score ----
{
  const cell: SwiCell = { n: 7, lat: 44, lon: 3 };
  const q: SwiQuantiles = [0.1, 0.3, 0.5, 0.7, 0.9];

  const dry = swiReading(cell, 3.2, "202608", 0.12, q)!;
  const wet = swiReading(cell, 3.2, "202608", 0.88, q)!;
  const normal = swiReading(cell, 3.2, "202608", 0.5, q)!;

  check("reading: dry soil scores high", dry.score > 85);
  check("reading: wet soil scores low", wet.score < 15);
  check("reading: normal soil sits mid-scale", near(normal.score, 50, 2));
  check("reading: score is the inverse of the percentile",
    dry.score === Math.round(100 - dry.percentile));
  check("reading: label matches the severity", dry.label.includes("secs") && wet.label.includes("humides"));
  check("reading: detail names the month, not the number", dry.detail.includes("août"));
  check("reading: raw value kept for checking against the source", dry.value === 0.12);
  check("reading: distance rounded, not dropped", dry.distanceKm === 3.2);
}

// ---- 4. Missing or malformed inputs yield nothing, never a zero score ----
{
  const cell: SwiCell = { n: 7, lat: 44, lon: 3 };
  check("degrade: no climatology → no reading",
    swiReading(cell, 1, "202608", 0.5, undefined) === undefined);
  check("degrade: truncated climatology → no reading",
    swiReading(cell, 1, "202608", 0.5, [0.1, 0.2, 0.3] as unknown as SwiQuantiles) === undefined);
  check("degrade: non-finite value → no reading",
    swiReading(cell, 1, "202608", Number.NaN, [0.1, 0.3, 0.5, 0.7, 0.9]) === undefined);
}

console.log(failures === 0 ? "swi: all checks pass" : `swi: ${failures} FAILED`);
if (failures > 0) process.exit(1);
