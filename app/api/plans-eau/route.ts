import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { overlaps, parseBbox } from "@/lib/geoBbox";

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
