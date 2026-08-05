import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// GET /api/cours-eau → simplified river water-body lines (GeoJSON), drawn under
// the station markers on /carte so a flow station can be read against the river
// it gauges.
//
// Twin of /api/nappes, and for the same measured reason: the Sandre WFS filters
// which features it returns, never their resolution, so simplification happens
// once offline (scripts/refdata/fetch_cours_eau.py).
//
// ⚠️ next.config.ts must list this file in outputFileTracingIncludes, or the
// route 503s in production while working perfectly in dev.

let cache: string | null | undefined;

export async function GET() {
  if (cache === undefined) {
    try {
      cache = await fs.readFile(
        path.join(process.cwd(), "data", "refdata", "cours-eau.geojson"),
        "utf-8",
      );
    } catch {
      cache = null;
    }
  }
  if (!cache) {
    // An empty collection with a 503: the map draws no river rather than
    // suggesting the area has none.
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
