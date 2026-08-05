import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// GET /api/nappes → simplified outcropping groundwater-body polygons (GeoJSON),
// drawn under the station markers on /carte.
//
// Why the file is embedded rather than proxied live: measured on the real
// Sandre WFS (diag mode `carte`), the national layer is 237 MB and even a
// single-viewport BBOX query weighs 19.5 MB — the service filters which
// features it returns, never their resolution. Simplification has to happen
// once, offline (scripts/refdata/fetch_nappes.py), which is also why this route
// is a twin of /api/departements rather than of /api/pmtiles.
//
// ⚠️ next.config.ts must list this file in outputFileTracingIncludes, or the
// route 503s in production while working perfectly in dev.

let cache: string | null | undefined;

export async function GET() {
  if (cache === undefined) {
    try {
      cache = await fs.readFile(
        path.join(process.cwd(), "data", "refdata", "nappes.geojson"),
        "utf-8",
      );
    } catch {
      cache = null;
    }
  }
  if (!cache) {
    // An empty collection with a 503: the map draws no aquifer rather than
    // suggesting there is none here.
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  return new NextResponse(cache, {
    headers: {
      "content-type": "application/geo+json; charset=utf-8",
      "cache-control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
