// Unit tests for the projection severity percentile (lib/projectionsShared)
// and a sanity check on the generated benchmark file.
// npx tsx scripts/test/benchmark.test.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import { severityPercentile } from "../../lib/projectionsShared";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// Ascending breakpoints q[0..100]: value at each percentile. Here a simple
// linear ramp from -50 (p0, most severe) to +50 (p100, least severe).
const q = Array.from({ length: 101 }, (_, k) => -50 + k);

// A value at the very bottom = most severe = worse than ~100 % of communes.
check("most negative → ~100 %", severityPercentile(q, -50) === 100);
// A value at the very top = least severe = worse than ~0 %.
check("most positive → ~0 %", severityPercentile(q, 50) === 0);
// The median value (0, at p50) → worse than ~50 %.
check("median value → ~50 %", Math.abs(severityPercentile(q, 0) - 50) <= 1);
// Below the floor clamps to 100, above the ceiling clamps to 0.
check("below floor clamps to 100", severityPercentile(q, -999) === 100);
check("above ceiling clamps to 0", severityPercentile(q, 999) === 0);
// More severe (more negative) always ranks >= less severe.
check(
  "monotonic: more negative is more severe",
  severityPercentile(q, -30) >= severityPercentile(q, -10),
);
check("empty breakpoints → 0", severityPercentile([], -20) === 0);

// --- generated benchmark file sanity ---------------------------------------
async function main() {
  const file = path.join(process.cwd(), "data", "projections", "benchmark.json");
  const raw = await fs.readFile(file, "utf-8").catch(() => null);
  if (!raw) {
    check("benchmark.json present", false);
  } else {
    const b = JSON.parse(raw) as {
      indicator: string;
      level: string;
      national: { n: number; q: number[] };
      departments: Record<string, { n: number; q: number[] }>;
    };
    check("indicator is VCN10_ete", b.indicator === "VCN10_ete");
    check("reference level is +2.7 °C", b.level.includes("2.7"));
    check("national has 101 breakpoints", b.national.q.length === 101);
    check("national breakpoints ascending", b.national.q.every((v, i, a) => i === 0 || v >= a[i - 1]));
    check("national sample is large", b.national.n > 10000);
    check("has departments", Object.keys(b.departments).length > 50);
    // Every department scope must also carry 101 ascending breakpoints.
    const allDeptsOk = Object.values(b.departments).every(
      (d) => d.q.length === 101 && d.q.every((v, i, a) => i === 0 || v >= a[i - 1]),
    );
    check("all departments have 101 ascending breakpoints", allDeptsOk);
  }

  console.log(failures === 0 ? "benchmark: all checks pass" : `benchmark: ${failures} FAILED`);
  if (failures > 0) process.exit(1);
}

void main();
