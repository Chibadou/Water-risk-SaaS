import { NextRequest, NextResponse } from "next/server";
import type { VigieauZone, ZonesResponse } from "@/lib/types";

const VIGIEAU_ZONES_URL = "https://api.vigieau.gouv.fr/api/zones";

const PROFILS = new Set(["particulier", "entreprise", "collectivite", "exploitation"]);

// VigiEau data is refreshed daily (j-1 situation): cache upstream calls for 1 h.
const REVALIDATE_SECONDS = 3600;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lon = params.get("lon");
  const lat = params.get("lat");
  const commune = params.get("commune");
  const profil = params.get("profil") ?? "entreprise";

  if ((!lon || !lat) && !commune) {
    return NextResponse.json(
      { zones: [], notCovered: false, message: "Paramètres lon/lat ou commune requis" },
      { status: 400 },
    );
  }
  if (!PROFILS.has(profil)) {
    return NextResponse.json(
      { zones: [], notCovered: false, message: "Profil invalide" },
      { status: 400 },
    );
  }

  const url = new URL(VIGIEAU_ZONES_URL);
  if (lon && lat) {
    url.searchParams.set("lon", lon);
    url.searchParams.set("lat", lat);
  } else if (commune) {
    url.searchParams.set("commune", commune);
  }
  url.searchParams.set("profil", profil);

  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });

    // 404: department not covered by VigiEau, or no alert zone at this point.
    if (res.status === 404) {
      const body: ZonesResponse = { zones: [], notCovered: true };
      return NextResponse.json(body);
    }

    // 409: commune spans several alert zones — the caller must provide lon/lat.
    // We always send lon/lat when available, so this only happens for commune-only queries.
    if (res.status === 409) {
      const body: ZonesResponse = {
        zones: [],
        notCovered: false,
        message:
          "Cette commune est couverte par plusieurs zones d'alerte : précisez une adresse complète.",
      };
      return NextResponse.json(body, { status: 409 });
    }

    if (!res.ok) {
      const body: ZonesResponse = {
        zones: [],
        notCovered: false,
        message: `Service VigiEau indisponible (${res.status})`,
      };
      return NextResponse.json(body, { status: 502 });
    }

    const data = (await res.json()) as VigieauZone[] | VigieauZone;
    const zones = Array.isArray(data) ? data : [data];
    const body: ZonesResponse = { zones, notCovered: false };
    return NextResponse.json(body);
  } catch {
    const body: ZonesResponse = {
      zones: [],
      notCovered: false,
      message: "Service VigiEau injoignable",
    };
    return NextResponse.json(body, { status: 502 });
  }
}
