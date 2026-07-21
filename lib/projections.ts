// Server-side loader for the real Explore2 TRACC projections, produced by
// scripts/projections/extract_explore2.py into data/projections/ (meta.json +
// per-department commune shards). Keyed by commune INSEE code — the
// aggregation is hydrological (the commune's watershed), so no distance
// matching is needed.

import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  BenchmarkScope,
  CommuneProjection,
  ProjectionBenchmark,
  ProjectionsMeta,
} from "./projectionsShared";
import { referenceLevel, severityPercentile } from "./projectionsShared";

const DATA_DIR = path.join(process.cwd(), "data", "projections");

let metaCache: ProjectionsMeta | null | undefined;
const shardCache = new Map<string, Record<string, CommuneProjection> | null>();

interface BenchmarkFile {
  indicator: string;
  level: string;
  national: BenchmarkScope;
  departments: Record<string, BenchmarkScope>;
}
let benchmarkCache: BenchmarkFile | null | undefined;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function loadMeta(): Promise<ProjectionsMeta | null> {
  if (metaCache === undefined) {
    metaCache = await readJson<ProjectionsMeta>(path.join(DATA_DIR, "meta.json"));
  }
  return metaCache;
}

function shardKey(insee: string): string {
  return insee.startsWith("97") ? insee.slice(0, 3) : insee.slice(0, 2);
}

// Paris / Marseille / Lyon: addresses geocode to arrondissement codes while
// the dataset is keyed by the commune code.
function normalizeInsee(insee: string): string {
  if (/^751\d\d$/.test(insee)) return "75056";
  if (/^132\d\d$/.test(insee)) return "13055";
  if (/^6938\d$/.test(insee)) return "69123";
  return insee;
}

export async function projectionForCommune(
  citycode: string,
): Promise<{ code: string; data: CommuneProjection } | null> {
  const insee = normalizeInsee(citycode.trim());
  if (!/^\d[0-9AB]\d{3}$/i.test(insee)) return null;
  const key = shardKey(insee);
  if (!shardCache.has(key)) {
    shardCache.set(
      key,
      await readJson<Record<string, CommuneProjection>>(
        path.join(DATA_DIR, "communes", `${key}.json`),
      ),
    );
  }
  const shard = shardCache.get(key);
  const data = shard?.[insee];
  return data ? { code: insee, data } : null;
}

async function loadBenchmark(): Promise<BenchmarkFile | null> {
  if (benchmarkCache === undefined) {
    benchmarkCache = await readJson<BenchmarkFile>(path.join(DATA_DIR, "benchmark.json"));
  }
  return benchmarkCache;
}

/**
 * Place a commune's projected summer low-flow decline within the national and
 * departmental distributions. Uses the reference warming level (+2.7 °C) and
 * the median (q50) VCN10 change — the same figure the prospective score builds
 * on — so the benchmark and the score tell a consistent story.
 */
export async function benchmarkForCommune(
  code: string,
  data: CommuneProjection,
  meta: ProjectionsMeta,
): Promise<ProjectionBenchmark | null> {
  const bench = await loadBenchmark();
  if (!bench) return null;
  const level = referenceLevel(meta.warming_levels) ?? bench.level;
  const median = data[level]?.[bench.indicator]?.[1];
  if (median === null || median === undefined) return null;

  const dept = code.startsWith("97") ? code.slice(0, 3) : code.slice(0, 2);
  const deptScope = bench.departments[dept];
  return {
    indicator: bench.indicator,
    level,
    value: median,
    national: {
      n: bench.national.n,
      severityPercentile: severityPercentile(bench.national.q, median),
    },
    department: deptScope
      ? { code: dept, n: deptScope.n, severityPercentile: severityPercentile(deptScope.q, median) }
      : undefined,
  };
}
