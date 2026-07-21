// Types and pure helpers for the 2050 projections — safe to import from
// client components (no fs). The server-side loader lives in lib/projections.ts.

/** warming → indicator → [lo, median, hi] (nulls when a stat is absent) */
export type CommuneProjection = Record<string, Record<string, [number | null, number | null, number | null]>>;

export interface ProjectionsMeta {
  demo: boolean;
  generated: string;
  source: string;
  reference: string;
  aggregation: string;
  warming_levels: string[];
  indicators: Record<string, { label: string; unit: string; source_name?: string | null }>;
  stats: Record<string, { median: string; lo: string; hi: string }>;
}

/** One scope's distribution: sample size + 101 ascending percentile breakpoints. */
export interface BenchmarkScope {
  n: number;
  q: number[];
}

/** Site placement within the national / departmental projection distribution. */
export interface ProjectionBenchmark {
  indicator: string;
  level: string;
  /** the site's own median VCN10 change at the reference level (%) */
  value: number;
  /** share (0-100) of communes whose projected decline is *less* severe */
  national: { n: number; severityPercentile: number };
  department?: { code: string; n: number; severityPercentile: number };
}

export interface ProjectionPayload {
  available: boolean;
  meta?: Pick<ProjectionsMeta, "demo" | "source" | "reference" | "aggregation" | "warming_levels" | "indicators" | "stats">;
  commune?: { code: string; nom?: string };
  data?: CommuneProjection;
  benchmark?: ProjectionBenchmark;
  message?: string;
}

/**
 * Severity percentile of a projected low-flow change `v` against ascending
 * percentile breakpoints `q` (q[k] = value at the k-th percentile). More
 * negative = more severe, so the result is the share of communes (0-100) whose
 * decline is *less* severe than `v` — i.e. "this site is worse than N %".
 */
export function severityPercentile(q: number[], v: number): number {
  if (q.length === 0) return 0;
  if (v <= q[0]) return 100;
  if (v >= q[q.length - 1]) return 0;
  // find k such that q[k] <= v < q[k+1], then interpolate the percentile rank
  let rank = q.length - 1;
  for (let k = 0; k < q.length - 1; k++) {
    if (v >= q[k] && v < q[k + 1]) {
      const span = q[k + 1] - q[k];
      const frac = span > 0 ? (v - q[k]) / span : 0;
      rank = k + frac; // percentile rank (0-100) of value <= v
      break;
    }
  }
  return Math.round(100 - rank);
}

/** numeric degree of a warming-level label like "+2.7°C France" (99 if unknown) */
export function levelDegree(level: string): number {
  const m = /([0-9]+(?:[.,][0-9]+)?)/.exec(level);
  return m ? Number(m[1].replace(",", ".")) : 99;
}

export function levelLabel(level: string): { label: string; sub: string } {
  const deg = levelDegree(level);
  const label = `+${deg.toLocaleString("fr-FR")} °C`;
  if (deg <= 2.1) return { label, sub: "≈ 2030" };
  if (deg <= 3) return { label, sub: "trajectoire de référence ≈ 2050" };
  return { label, sub: "stress test ≈ 2100" };
}

/** the warming level closest to the +2.7 °C 2050 reference trajectory */
export function referenceLevel(levels: string[]): string | undefined {
  return [...levels].sort((a, b) => Math.abs(levelDegree(a) - 2.7) - Math.abs(levelDegree(b) - 2.7))[0];
}

/**
 * Prospective 2050 score (v1): severity of the projected summer low-flow
 * decline (median VCN10 delta at the +2.7 °C level, 0 → 0 … -40 % → 100),
 * blended with the current-year restriction frequency when known (70 % / 30 %).
 */
export function prospectiveScore(
  vcn10Median: number,
  historiqueScore?: number,
): { score: number; parts: { delta: number; historique?: number } } {
  const delta = Math.round(Math.max(0, Math.min(1, -vcn10Median / 40)) * 100);
  if (historiqueScore === undefined) {
    return { score: delta, parts: { delta } };
  }
  return {
    score: Math.round(0.7 * delta + 0.3 * historiqueScore),
    parts: { delta, historique: historiqueScore },
  };
}
