import { NextRequest, NextResponse } from "next/server";
import { ondeIndicator } from "@/lib/onde";

// GET /api/onde?lat=..&lon=.. → nearby Onde (dry-stream) summary + risk 0-100,
// or { available:false } when no recent campaign is nearby (off-season).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return NextResponse.json({ available: false, message: "Paramètres lat/lon requis" }, { status: 400 });
  }
  const result = await ondeIndicator(lat, lon);
  if (!result) {
    return NextResponse.json({
      available: false,
      message: "Pas d'observation Onde récente à proximité (réseau saisonnier, mai–septembre).",
    });
  }
  return NextResponse.json({ available: true, ...result });
}
