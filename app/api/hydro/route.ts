import { NextRequest, NextResponse } from "next/server";
import { hydroIndicators } from "@/lib/hubeau";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  const lat = latRaw === null || latRaw === "" ? NaN : Number(latRaw);
  const lon = lonRaw === null || lonRaw === "" ? NaN : Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { stations: [], message: "Paramètres lat/lon requis" },
      { status: 400 },
    );
  }
  const station = params.get("station")?.slice(0, 40) || undefined;
  const result = await hydroIndicators(lat, lon, station);
  return NextResponse.json(result);
}
