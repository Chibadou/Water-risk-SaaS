// Shared VigiEau client used by /api/zones, the alert cron and the public API.

import { GRAVITE } from "./gravite";
import type { OrigineEau } from "./sites";
import type { NiveauGravite, VigieauZone, ZonesResponse, ZoneType } from "./types";

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

const ORIGIN_ZONE_TYPE: Partial<Record<OrigineEau, ZoneType>> = {
  aep: "AEP",
  superficiel: "SUP",
  souterrain: "SOU",
};

export interface LevelForOrigin {
  /** gravity of the zone the site actually depends on, null = no restriction */
  level: NiveauGravite | null;
  /** which zone the level was read from, undefined when falling back to the max */
  zoneType?: ZoneType;
  /** true when the requested zone type had no match and the max was used instead */
  fellBack: boolean;
}

/**
 * Gravity level of the zone a site is actually exposed to, given where it draws
 * its water.
 *
 * `worstLevel` takes the maximum across SUP/SOU/AEP, which is the right default
 * for a general risk score but wrong for estimating operational disruption: a
 * site on the mains would inherit the gravity of an aquifer it never pumps.
 * Deliberately kept separate rather than folded into `worstLevel`, so the
 * existing composite score and the dashboard keep their current behaviour.
 *
 * "mixte" and "inconnu" fall back to the maximum on purpose — with no stated
 * origin, the conservative reading is the right one. Same when the requested
 * zone type is simply absent from VigiEau's answer, which is flagged so the UI
 * can say the figure is not origin-specific.
 */
export function levelForOrigin(
  zones: VigieauZone[],
  origine: OrigineEau | undefined,
): LevelForOrigin {
  const wanted = origine ? ORIGIN_ZONE_TYPE[origine] : undefined;
  if (wanted) {
    const matching = zones.filter((z) => z.type === wanted);
    if (matching.length > 0) {
      return { level: worstLevel(matching), zoneType: wanted, fellBack: false };
    }
  }
  return { level: worstLevel(zones), fellBack: Boolean(wanted) };
}
