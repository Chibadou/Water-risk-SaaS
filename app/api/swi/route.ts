import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { distanceKm, nearestCell, swiReading, type SwiCell, type SwiQuantiles } from "@/lib/swi";

// GET /api/swi?lat=..&lon=..
//
// Soil wetness for the site's SAFRAN cell, standardised against that cell's own
// 1990-2019 distribution for the same calendar month.
//
// The climatology is embedded (built offline, stable by construction). The
// current month is fetched live and cached: embedding it would go stale within
// weeks, which is the trap already identified for the MétéEAU forecast. Same
// pattern as the arrêtés CSV, which is larger and refreshed daily.

export const maxDuration = 60;

const DATA_DIR = path.join(process.cwd(), "data", "swi");
const BUCKETS = 40;
const REVALIDATE = 24 * 3600;
const UPSTREAM_TIMEOUT_MS = 30000;

interface Meta {
  current_file?: { title?: string; url?: string };
  climatology_period?: string;
  source?: string;
}

let cellsCache: SwiCell[] | null | undefined;
let metaCache: Meta | null | undefined;
const bucketCache = new Map<number, Record<string, Record<string, SwiQuantiles>> | null>();

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function loadCells(): Promise<SwiCell[] | null> {
  if (cellsCache === undefined) cellsCache = await readJson<SwiCell[]>(path.join(DATA_DIR, "cells.json"));
  return cellsCache;
}

async function loadMeta(): Promise<Meta | null> {
  if (metaCache === undefined) metaCache = await readJson<Meta>(path.join(DATA_DIR, "meta.json"));
  return metaCache;
}

async function loadBucket(n: number) {
  const b = n % BUCKETS;
  if (!bucketCache.has(b)) {
    bucketCache.set(b, await readJson(path.join(DATA_DIR, "clim", `${b}.json`)));
  }
  return bucketCache.get(b) ?? null;
}

/**
 * Latest monthly value for one cell, from the live decade file.
 *
 * Scans line by line and keeps only the newest row for the requested cell
 * rather than parsing 650 000 rows into memory — the file is ~22 MB and only a
 * single cell is ever needed.
 */
function latestForCell(csv: string, cellNumber: number): { period: string; value: number } | null {
  const wanted = String(cellNumber);
  let bestPeriod = "";
  let bestValue = Number.NaN;
  let start = 0;
  let headerSeen = false;
  let numIdx = 0;
  let dateIdx = 3;
  let swiIdx = 4;

  while (start < csv.length) {
    let end = csv.indexOf("\n", start);
    if (end === -1) end = csv.length;
    const line = csv.slice(start, end);
    start = end + 1;
    if (!line || line.startsWith("#")) continue;

    const cols = line.split(";").length > 1 ? line.split(";") : line.split(",");
    if (!headerSeen) {
      const upper = cols.map((c) => c.trim().toUpperCase());
      if (upper.includes("NUMERO")) {
        numIdx = upper.indexOf("NUMERO");
        dateIdx = upper.indexOf("DATE");
        swiIdx = upper.findIndex((c) => c.startsWith("SWI"));
        headerSeen = true;
        continue;
      }
    }
    if (cols[numIdx]?.trim() !== wanted) continue;
    const period = cols[dateIdx]?.trim() ?? "";
    if (period <= bestPeriod) continue;
    const value = Number(cols[swiIdx]);
    if (!Number.isFinite(value)) continue;
    bestPeriod = period;
    bestValue = value;
  }
  return bestPeriod ? { period: bestPeriod, value: bestValue } : null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return NextResponse.json({ available: false, message: "Coordonnées requises" }, { status: 400 });
  }

  const [cells, meta] = await Promise.all([loadCells(), loadMeta()]);
  if (!cells || cells.length === 0 || !meta?.current_file?.url) {
    return NextResponse.json({
      available: false,
      message: "Référentiel d'humidité des sols non chargé sur ce déploiement.",
    });
  }

  const cell = nearestCell(cells, lat, lon);
  if (!cell) {
    return NextResponse.json({ available: false, message: "Aucune maille SAFRAN à proximité." });
  }
  const distance = distanceKm(lat, lon, cell.lat, cell.lon);
  // The SAFRAN grid is 8 km; anything much beyond that is outside its coverage
  // (overseas in particular) rather than merely far from a cell centre.
  if (distance > 25) {
    return NextResponse.json({
      available: false,
      message: "Hors couverture de la grille SAFRAN (France métropolitaine).",
    });
  }

  try {
    const res = await fetch(meta.current_file.url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      return NextResponse.json({
        available: false,
        message: `Service Météo-France indisponible (${res.status})`,
      });
    }
    const csv = await res.text();
    const latest = latestForCell(csv, cell.n);
    if (!latest) {
      return NextResponse.json({ available: false, message: "Aucune mesure récente pour cette maille." });
    }
    const bucket = await loadBucket(cell.n);
    const month = String(Number(latest.period.slice(4, 6)));
    const quantiles = bucket?.[String(cell.n)]?.[month];
    const reading = swiReading(cell, distance, latest.period, latest.value, quantiles);
    if (!reading) {
      return NextResponse.json({
        available: false,
        message: "Climatologie indisponible pour cette maille.",
      });
    }
    return NextResponse.json(
      { available: true, ...reading, reference: meta.climatology_period, source: meta.source },
      { headers: { "cache-control": "public, max-age=3600, s-maxage=43200" } },
    );
  } catch {
    return NextResponse.json({ available: false, message: "Service Météo-France injoignable." });
  }
}
