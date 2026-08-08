import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// GET /api/plans-eau[?bbox=lonMin,latMin,lonMax,latMax]
// → lakes, ponds and reservoirs (GeoJSON), drawn above the aquifers and under
// the markers on /carte. A plan d'eau is frequently the actual abstraction
// point of an industrial or agricultural site, and a reservoir is storage for
// the dry season — which is why it belongs to "where the water is".
//
// Filters like /api/cours-eau, for the same measured reason: the embedded file
// holds the national layer (34 513 water bodies) and shipping it whole would
// cost megabytes per page load.
//   - with `bbox`  → every water body intersecting the box, at any size
//   - without      → the largest ones only (≥ MAJOR_HA), a national skeleton
//
// ⚠️ next.config.ts must list the data file in outputFileTracingIncludes, or
// the route 503s in production while working perfectly in dev.

/** Area in hectares from which a water body is drawn on the France-wide view. */
const MAJOR_HA = 100;

interface PlanEauFeature {
  type: "Feature";
  properties: { nom?: string; code?: string; nature?: string; surfaceHa?: number };
  geometry: { type: string; coordinates: unknown };
}

let cache: { features: PlanEauFeature[] } | null | undefined;

async function load(): Promise<{ features: PlanEauFeature[] } | null> {
  if (cache !== undefined) return cache;
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "data", "refdata", "plans-eau.geojson"),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as { features?: PlanEauFeature[] };
    cache = { features: Array.isArray(parsed.features) ? parsed.features : [] };
  } catch {
    cache = null;
  }
  return cache;
}

/** Bounds of a geometry, walking nested coordinate arrays of any depth. */
function bounds(coords: unknown, acc: number[]): void {
  if (Array.isArray(coords)) {
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lon, lat] = coords as [number, number];
      if (lon < acc[0]!) acc[0] = lon;
      if (lat < acc[1]!) acc[1] = lat;
      if (lon > acc[2]!) acc[2] = lon;
      if (lat > acc[3]!) acc[3] = lat;
      return;
    }
    for (const c of coords) bounds(c, acc);
  }
}

/**
 * Bounding-box overlap, not true intersection: a water body touching the corner
 * of the view is kept even when only its box overlaps. Cheap, and erring
 * towards showing water is the right way to err on a locator map.
 */
function overlaps(f: PlanEauFeature, box: number[]): boolean {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  bounds(f.geometry?.coordinates, b);
  return b[0]! <= box[2]! && b[2]! >= box[0]! && b[1]! <= box[3]! && b[3]! >= box[1]!;
}

function parseBbox(value: string | null): number[] | null {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lonMin, latMin, lonMax, latMax] = parts as [number, number, number, number];
  return [Math.min(lonMin, lonMax), Math.min(latMin, latMax), Math.max(lonMin, lonMax), Math.max(latMin, latMax)];
}

export async function GET(request: NextRequest) {
  const data = await load();
  if (!data) {
    // An empty collection with a 503: the map draws no water body rather than
    // suggesting the area has none.
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const box = parseBbox(request.nextUrl.searchParams.get("bbox"));
  const features = box
    ? data.features.filter((f) => overlaps(f, box))
    : data.features.filter((f) => (f.properties?.surfaceHa ?? 0) >= MAJOR_HA);

  return NextResponse.json(
    { type: "FeatureCollection", features },
    {
      headers: {
        "content-type": "application/geo+json; charset=utf-8",
        "cache-control": "public, max-age=86400, s-maxage=604800",
      },
    },
  );
}
