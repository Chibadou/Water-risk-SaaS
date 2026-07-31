import { NextRequest, NextResponse } from "next/server";
import { parseEntities } from "@/lib/bdlisa";

// GET /api/bdlisa?lat=..&lon=..
//
// The hydrogeological entities (BDLISA) beneath a point, from the Sandre WFS.
//
// Queried live rather than embedded: the national polygon set is large, changes
// with each BDLISA release, and only one point is ever needed. A small bounding
// box around the point stands in for a true intersects filter, which WFS 2.0
// servers spell inconsistently.

const SANDRE = "https://services.sandre.eaufrance.fr/geo/sandre";
const LAYER = "sa:EntiteHydroGeol";
const REVALIDATE = 30 * 24 * 3600; // a hydrogeological referential moves slowly
const UPSTREAM_TIMEOUT_MS = 15000;
const BOX = 0.005; // ~500 m, enough to hit the containing polygons

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return NextResponse.json({ available: false, message: "Coordonnées requises" }, { status: 400 });
  }

  const url =
    `${SANDRE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=${encodeURIComponent(LAYER)}&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&COUNT=20` +
    `&BBOX=${lat - BOX},${lon - BOX},${lat + BOX},${lon + BOX},EPSG:4326`;

  try {
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      return NextResponse.json({
        available: false,
        message: `Référentiel BDLISA indisponible (${res.status})`,
      });
    }
    const text = await res.text();
    // The service answers errors as XML with a 200, so parsing is guarded.
    if (text.trimStart().startsWith("<")) {
      return NextResponse.json({ available: false, message: "Réponse BDLISA illisible." });
    }
    const entities = parseEntities(JSON.parse(text));
    return NextResponse.json(
      {
        available: entities.length > 0,
        entities,
        message: entities.length === 0 ? "Aucune entité hydrogéologique à ce point." : undefined,
      },
      { headers: { "cache-control": "public, max-age=86400, s-maxage=604800" } },
    );
  } catch {
    return NextResponse.json({ available: false, message: "Référentiel BDLISA injoignable." });
  }
}
