import { NextRequest, NextResponse } from "next/server";
import { clampRadiusKm, fetchMapLayers } from "@/lib/carteEau";

// GET /api/carte?lat=&lon=&rayon= → the water objects around a point
// (flow stations, piezometers, ONDE observations, BNPE withdrawal structures).
// Feeds the /carte page. Purely descriptive: nothing here enters any score.
//
// The radius is clamped server-side rather than trusted: the client can be
// panned to a continental viewport, and an unbounded bbox would ask Hub'Eau for
// the whole country on every mouse-up.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  const lat = latRaw === null || latRaw === "" ? NaN : Number(latRaw);
  const lon = lonRaw === null || lonRaw === "" ? NaN : Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { message: "Paramètres lat/lon requis" },
      { status: 400 },
    );
  }

  const radiusKm = clampRadiusKm(params.get("rayon"));
  const layers = await fetchMapLayers({ lat, lon, radiusKm });
  return NextResponse.json(layers);
}
