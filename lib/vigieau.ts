// Shared VigiEau client used by /api/zones, the alert cron and the public API.

import { GRAVITE } from "./gravite";
import type { NiveauGravite, VigieauZone, ZonesResponse } from "./types";

// Overridable for tests (e.g. VIGIEAU_BASE_URL=http://localhost:9999)
const VIGIEAU_BASE = process.env.VIGIEAU_BASE_URL ?? "https://api.vigieau.gouv.fr";

// VigiEau data is refreshed daily (j-1 situation): cache upstream calls for 1 h.
const REVALIDATE_SECONDS = 3600;

export async function fetchZonesForPoint(
  lat: number,
  lon: number,
  profil: string,
): Promise<{ status: number; body: ZonesResponse }> {
  const url = new URL(`${VIGIEAU_BASE}/api/zones`);
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("profil", profil);

  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });

    // 404: department not covered by VigiEau, or no alert zone at this point.
    if (res.status === 404) {
      return { status: 200, body: { zones: [], notCovered: true } };
    }
    // 409: commune spans several alert zones — only possible for commune-only
    // queries; we always send lon/lat.
    if (res.status === 409) {
      return {
        status: 409,
        body: {
          zones: [],
          notCovered: false,
          message:
            "Cette commune est couverte par plusieurs zones d'alerte : précisez une adresse complète.",
        },
      };
    }
    if (!res.ok) {
      return {
        status: 502,
        body: { zones: [], notCovered: false, message: `Service VigiEau indisponible (${res.status})` },
      };
    }
    const data = (await res.json()) as VigieauZone[] | VigieauZone;
    const zones = Array.isArray(data) ? data : [data];
    return { status: 200, body: { zones, notCovered: false } };
  } catch {
    return {
      status: 502,
      body: { zones: [], notCovered: false, message: "Service VigiEau injoignable" },
    };
  }
}

/** worst gravity level across zones, or null when no restriction */
export function worstLevel(zones: VigieauZone[]): NiveauGravite | null {
  let best: NiveauGravite | null = null;
  for (const z of zones) {
    const n = z.niveauGravite as NiveauGravite | undefined;
    if (n && GRAVITE[n] && (!best || GRAVITE[n].rank > GRAVITE[best].rank)) best = n;
  }
  return best;
}
