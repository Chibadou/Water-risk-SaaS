import { NextRequest, NextResponse } from "next/server";
import { overlaps, parseBbox } from "@/lib/geoBbox";
import { chargerBassins } from "@/lib/bassinsData";
import type { BassinFeature } from "@/lib/bassinVersant";

// GET /api/bassins-versants[?bbox=lonMin,latMin,lonMax,latMax]
// → watershed outlines (GeoJSON), drawn under everything else on /carte.
//
// A watershed is the territory whose every drop converges on one outlet: the
// answer to "where does the water arriving here come from", which none of the
// other layers gives. The other layers show the water, this one shows what
// produces it.
//
// Filters like /api/cours-eau and /api/plans-eau, for the same measured reason:
// the embedded file is the national layer, and shipping it whole would cost
// megabytes on every page load.
//   - with `bbox`  → every watershed whose box meets the view, at any size
//   - without      → the largest ones only (≥ MAJOR_KM2), because the France-wide
//                    view of every divide is a plate of spaghetti, not a map
//
// ⚠️ next.config.ts must list the data file in outputFileTracingIncludes, or
// the route 503s in production while working perfectly in dev.

/**
 * Area in km² from which a watershed is drawn on the France-wide view.
 *
 * Measured on the embedded file (6 190 basins, median 67 km², max 1 333 km²),
 * not guessed — the manifest carries the same quantiles:
 *
 *   ≥ 200 km²  →  462 basins, 0,57 MB on the wire
 *   ≥ 250 km²  →  244 basins, 0,33 MB      ← retained
 *   ≥ 300 km²  →  117 basins, 0,17 MB
 *
 * 244 is the same order as the national river skeleton (569 rivers at Strahler
 * ≥ 5): enough divides to read the country as a set of basins, few enough that
 * the outlines do not become hatching.
 */
const MAJOR_KM2 = 250;

export async function GET(request: NextRequest) {
  // Shared with /api/bassin-versant: same 4,35 MB, parsed once for both.
  const features: BassinFeature[] | null = await chargerBassins();
  if (!features) {
    // An empty collection with a 503: the map draws no divide rather than
    // suggesting this address belongs to no watershed — every address does.
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const box = parseBbox(request.nextUrl.searchParams.get("bbox"));
  const enVue = box
    ? features.filter((f) => overlaps(f, box))
    : features.filter((f) => (f.properties?.surfaceKm2 ?? 0) >= MAJOR_KM2);

  return NextResponse.json(
    { type: "FeatureCollection", features: enVue },
    {
      headers: {
        "content-type": "application/geo+json; charset=utf-8",
        "cache-control": "public, max-age=86400, s-maxage=604800",
      },
    },
  );
}
