import { NextRequest, NextResponse } from "next/server";
import { nearestPiezoIndicator } from "@/lib/hubeau";

export async function GET(request: NextRequest) {
  const latRaw = request.nextUrl.searchParams.get("lat");
  const lonRaw = request.nextUrl.searchParams.get("lon");
  const lat = latRaw === null || latRaw === "" ? NaN : Number(latRaw);
  const lon = lonRaw === null || lonRaw === "" ? NaN : Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { available: false, message: "Paramètres lat/lon requis" },
      { status: 400 },
    );
  }
  const result = await nearestPiezoIndicator(lat, lon);
  return NextResponse.json(result);
}
