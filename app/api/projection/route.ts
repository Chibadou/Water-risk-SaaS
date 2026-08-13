import { NextRequest, NextResponse } from "next/server";
import { situerPoint } from "@/lib/communes";
import { benchmarkForCommune, loadMeta, projectionForCommune } from "@/lib/projections";
import type { ProjectionPayload } from "@/lib/projectionsShared";

// GET /api/projection?citycode=INSEE  (or lat/lon fallback, reverse-geocoded
// via geo.api.gouv.fr). Returns the commune's Explore2 TRACC change statistics.

async function communeName(code: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://geo.api.gouv.fr/communes/${code}?fields=nom&format=json`, {
      next: { revalidate: 30 * 24 * 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const obj = (await res.json()) as { nom?: string };
    return obj?.nom || undefined;
  } catch {
    return undefined;
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
    // ⚠️ Deux échecs, deux phrases. Ce point rendait `null` dans les deux cas —
    // référentiel muet et point hors terre — et le message accusait le service
    // même quand le service avait parfaitement répondu « il n'y a aucune
    // commune ici ». Trouvé en production le 2026-08-13 sur un point en mer.
    const situation = await situerPoint(lat, lon);
    if (situation.etat !== "commune") {
      const body: ProjectionPayload = {
        available: false,
        message:
          situation.etat === "hors-terre"
            ? "Ce point n'est sur aucune commune française : il n'y a pas de projection à " +
              "produire ici. ⚠️ Ce n'est pas une donnée manquante, c'est un point hors du territoire."
            : "Commune du site non identifiable (service de géographie indisponible). " +
              "⚠️ Ce n'est PAS « hors du territoire ».",
      };
      return NextResponse.json(body);
    }
    citycode = situation.code;
    nom = situation.nom;
  }

  const result = await projectionForCommune(citycode);
  // Direct-citycode callers skip the reverse geocode, so resolve the display
  // name here (normalized code first: 75116 → 75056 "Paris").
  if (!nom) nom = await communeName(result?.code ?? citycode);
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
  const benchmark = (await benchmarkForCommune(result.code, result.data, meta)) ?? undefined;
  const body: ProjectionPayload = {
    available: true,
    meta: metaSubset,
    commune: { code: result.code, nom },
    data: result.data,
    benchmark,
  };
  return NextResponse.json(body);
}
