// Unit tests for the soil-moisture precursor (lib/swi).
// npx tsx scripts/test/swi.test.ts

import {
  ageInMonths,
  distanceKm,
  latestForCell,
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

// ---- 4b. Freshness: a months-old reading must not pass as current ----
// Observed on prod (2026-07): the published decade file stops at 2025-12, so
// the newest available value can be over half a year old.
{
  const cell = { n: 7, lat: 44, lon: 3 };
  const q: SwiQuantiles = [0.1, 0.3, 0.5, 0.7, 0.9];
  const july2026 = new Date(Date.UTC(2026, 6, 15));

  check("age: same month is 0", ageInMonths("202607", july2026) === 0);
  check("age: December 2025 read in July 2026 is 7 months", ageInMonths("202512", july2026) === 7);
  check("age: malformed period is treated as infinitely old",
    ageInMonths("xxxx", july2026) === Number.POSITIVE_INFINITY);

  const fresh = swiReading(cell, 3, "202606", 0.12, q, july2026)!;
  check("fresh: a recent reading is not stale", fresh.stale === false && fresh.ageMonths === 1);

  const old = swiReading(cell, 3, "202512", 0.12, q, july2026)!;
  check("stale: a 7-month-old reading is flagged", old.stale === true && old.ageMonths === 7);
  check("stale: the score is still computed, so the value can be shown", old.score > 85);
  check("stale: the detail says why it is set aside",
    old.detail.includes("trop ancienne") && old.detail.includes("2025"));
  check("stale: a fresh reading carries no such warning", !fresh.detail.includes("trop ancienne"));
}

// ---- 5. Parsing the published decade file ----
// Regression cover for a bug prod caught: SWI_UNIF_MENS is the LAST column, so
// with the file's CRLF line endings an untrimmed value is "0.949\r", Number()
// returns NaN, every row is discarded and the endpoint reports "no recent
// measure" while looking perfectly healthy.
{
  const HEADER = "NUMERO;LAMBX;LAMBY;DATE;SWI_UNIF_MENS";
  const crlf =
    `# commentaire de tête
${HEADER}
` +
    `2164;641374;7106309;202505;0.312
` +
    `2164;641374;7106309;202506;0.208
` +
    `9999;000000;0000000;202506;0.900
`;

  const got = latestForCell(crlf, 2164);
  check("csv: CRLF file yields a reading at all", got !== null);
  check("csv: latest period wins", got?.period === "202506");
  check("csv: value parsed despite the trailing CR", got?.value === 0.208);
  check("csv: other cells are ignored", got?.value !== 0.9);

  // Same content with plain LF must behave identically.
  const lf = crlf.replace(/\r/g, "");
  check("csv: LF file parses the same", latestForCell(lf, 2164)?.value === 0.208);

  // Comma-delimited variant, in case the publisher switches.
  const comma = lf.replace(/;/g, ",");
  check("csv: comma delimiter also parses", latestForCell(comma, 2164)?.value === 0.208);

  // Rows out of chronological order must not defeat the max.
  const shuffled = `${HEADER}\n2164;0;0;202506;0.208\n2164;0;0;202503;0.500\n`;
  check("csv: newest wins regardless of row order", latestForCell(shuffled, 2164)?.period === "202506");

  check("csv: unknown cell yields null, not a zero reading", latestForCell(lf, 12345) === null);
  check("csv: empty input yields null", latestForCell("", 2164) === null);
}

console.log(failures === 0 ? "swi: all checks pass" : `swi: ${failures} FAILED`);
if (failures > 0) process.exit(1);
