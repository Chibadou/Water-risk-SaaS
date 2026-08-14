import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// GET /api/grands-bassins → the DCE river-basin circumscriptions (GeoJSON),
// the coarsest layer of /carte.
//
// Why a second watershed scale rather than one: these nine perimeters are the
// ones that carry a decision. Each is run by an agence de l'eau, which sets its
// own redevance rates, adopts its own SDAGE and funds its own aid programmes —
// lib/bassins.ts already maps `CdBassinDCE` to that agency, and the popup names
// it. The fine layer answers "where does my water come from"; this one answers
// "who decides here".
//
// Fourteen polygons after simplification, so there is nothing to filter — the
// whole file goes out, like /api/nappes and unlike /api/bassins-versants.
//
// ⚠️ next.config.ts must list the data file in outputFileTracingIncludes, or
// the route 503s in production while working perfectly in dev.

let cache: string | null | undefined;

export async function GET() {
  if (cache === undefined) {
    try {
      cache = await fs.readFile(
        path.join(process.cwd(), "data", "refdata", "grands-bassins.geojson"),
        "utf-8",
      );
    } catch {
      cache = null;
    }
  }
  if (!cache) {
    // An empty collection with a 503: no basin drawn, rather than a map that
    // suggests this place belongs to no basin district.
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
