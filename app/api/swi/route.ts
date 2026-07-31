import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  distanceKm,
  latestForCell,
  nearestCell,
  swiReading,
  type SwiCell,
  type SwiQuantiles,
} from "@/lib/swi";

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
// The decade file is ~22 MB uncompressed; a cold cache needs room to fetch it.
const UPSTREAM_TIMEOUT_MS = 45000;

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
    // The decade files are published as .csv.gz — the gzip is part of the
    // payload, not a transfer encoding, so fetch does not unwrap it and
    // res.text() would hand back binary. Sniffed rather than assumed, since the
    // host could start serving it uncompressed.
    const buf = Buffer.from(await res.arrayBuffer());
    const csv =
      buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b
        ? gunzipSync(buf).toString("utf-8")
        : buf.toString("utf-8");
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
