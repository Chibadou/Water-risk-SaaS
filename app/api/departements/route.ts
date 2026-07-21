import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// GET /api/departements → simplified department polygons (GeoJSON), used by the
// portfolio choropleth. Static reference data fetched via Actions; cached hard.

let cache: string | null | undefined;

export async function GET() {
  if (cache === undefined) {
    try {
      cache = await fs.readFile(
        path.join(process.cwd(), "data", "refdata", "departements.geojson"),
        "utf-8",
      );
    } catch {
      cache = null;
    }
  }
  if (!cache) {
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
