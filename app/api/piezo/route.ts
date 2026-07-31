import { NextRequest, NextResponse } from "next/server";
import { piezoIndicators } from "@/lib/hubeau";
import { parseEntities, type AquiferEntity } from "@/lib/bdlisa";

// The aquifers beneath the site, used to prefer a hydrogeologically relevant
// piezometer over a merely closer one. Resolved here rather than in the client
// so the station list arrives already ranked; a failure is non-fatal and simply
// falls back to distance ordering.
const SANDRE =
  "https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature" +
  "&TYPENAMES=sa%3AEntiteHydroGeol&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&COUNT=20";

async function siteAquifers(lat: number, lon: number): Promise<AquiferEntity[] | undefined> {
  const d = 0.005;
  try {
    const res = await fetch(
      `${SANDRE}&BBOX=${lat - d},${lon - d},${lat + d},${lon + d},EPSG:4326`,
      { next: { revalidate: 30 * 24 * 3600 }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return undefined;
    const text = await res.text();
    if (text.trimStart().startsWith("<")) return undefined;
    const entities = parseEntities(JSON.parse(text));
    return entities.length > 0 ? entities : undefined;
  } catch {
    return undefined;
  }
}

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
  const aquifers = await siteAquifers(lat, lon);
  const result = await piezoIndicators(lat, lon, station, aquifers);
  return NextResponse.json({
    ...result,
    aquiferes: aquifers?.map((a) => ({ code: a.code, label: a.label })),
  });
}
