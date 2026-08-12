import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { overlaps, parseBbox } from "@/lib/geoBbox";

// GET /api/cours-eau[?bbox=lonMin,latMin,lonMax,latMax]
// → river water-body lines (GeoJSON), drawn under the station markers on /carte
// so a flow station can be read against the river it gauges.
//
// Unlike /api/nappes, this route FILTERS. The embedded file holds all 9 746
// river water bodies of metropolitan France (~6 MB): far too much to send to a
// browser, and far too useful to trim at build time — the first attempt kept
// only Strahler ≥ 5 and left most addresses with no river at all.
//
// So the file is a disk cost and the response is a viewport:
//   - with `bbox`  → every river intersecting the box, at any size
//   - without      → the major rivers only (Strahler ≥ MAJOR), a national
//                    skeleton light enough for the France-wide default view
//
// ⚠️ next.config.ts must list the data file in outputFileTracingIncludes, or
// the route 503s in production while working perfectly in dev.

/** Strahler order from which a river is drawn on the France-wide view. */
const MAJOR = 5;

interface RiverFeature {
  type: "Feature";
  properties: { nom?: string; code?: string; strahler?: number; longueurKm?: number };
  geometry: { type: string; coordinates: unknown };
}

let cache: { features: RiverFeature[] } | null | undefined;

async function load(): Promise<{ features: RiverFeature[] } | null> {
  if (cache !== undefined) return cache;
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "data", "refdata", "cours-eau.geojson"),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as { features?: RiverFeature[] };
    cache = { features: Array.isArray(parsed.features) ? parsed.features : [] };
  } catch {
    cache = null;
  }
  return cache;
}

export async function GET(request: NextRequest) {
  const data = await load();
  if (!data) {
    // An empty collection with a 503: the map draws no river rather than
    // suggesting the area has none.
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const box = parseBbox(request.nextUrl.searchParams.get("bbox"));
  const features = box
    ? data.features.filter((f) => overlaps(f, box))
    : data.features.filter((f) => (f.properties?.strahler ?? 0) >= MAJOR);

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
