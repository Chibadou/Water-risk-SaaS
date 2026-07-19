import { NextRequest, NextResponse } from "next/server";
import { loadMeta, projectionForCommune } from "@/lib/projections";
import type { ProjectionPayload } from "@/lib/projectionsShared";

// GET /api/projection?citycode=INSEE  (or lat/lon fallback, reverse-geocoded
// via geo.api.gouv.fr). Returns the commune's Explore2 TRACC change statistics.

async function reverseCommune(lat: number, lon: number): Promise<{ code: string; nom?: string } | null> {
  try {
    const url = `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=code,nom&format=json`;
    const res = await fetch(url, {
      next: { revalidate: 30 * 24 * 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ code?: string; nom?: string }>;
    const first = arr?.[0];
    return first?.code ? { code: first.code, nom: first.nom } : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let citycode = params.get("citycode")?.trim() || null;
  let nom: string | undefined;

  const meta = await loadMeta();
  if (!meta) {
    const body: ProjectionPayload = {
      available: false,
      message: "Données de projection non chargées sur ce déploiement.",
    };
    return NextResponse.json(body, { status: 503 });
  }

  if (!citycode) {
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
      return NextResponse.json(
        { available: false, message: "Paramètre citycode ou lat/lon requis" },
        { status: 400 },
      );
    }
    const commune = await reverseCommune(lat, lon);
    if (!commune) {
      const body: ProjectionPayload = {
        available: false,
        message: "Commune du site non identifiable (service de géographie indisponible).",
      };
      return NextResponse.json(body);
    }
    citycode = commune.code;
    nom = commune.nom;
  }

  const result = await projectionForCommune(citycode);
  const metaSubset = {
    demo: meta.demo,
    source: meta.source,
    reference: meta.reference,
    aggregation: meta.aggregation,
    warming_levels: meta.warming_levels,
    indicators: meta.indicators,
    stats: meta.stats,
  };
  if (!result) {
    const body: ProjectionPayload = {
      available: false,
      meta: metaSubset,
      commune: { code: citycode, nom },
      message: "Pas de projection disponible pour cette commune (hors couverture Explore2).",
    };
    return NextResponse.json(body);
  }
  const body: ProjectionPayload = {
    available: true,
    meta: metaSubset,
    commune: { code: result.code, nom },
    data: result.data,
  };
  return NextResponse.json(body);
}
