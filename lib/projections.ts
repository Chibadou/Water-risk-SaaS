// 2050 water-availability projections per simulation point, read from the
// static dataset produced by scripts/projections/extract_explore2.py.
// Site ↔ point matching is nearest-distance for now (like the measurement
// stations, hydrographic sub-basin matching comes with the referential work).

import dataset from "@/data/projections.json";

export type ScenarioKey = "tracc27" | "rcp85";
export type IndicatorKey = "module" | "qmna5" | "vcn10" | "recharge";

export interface DeltaStat {
  /** % change vs the 1976-2005 reference; negative = less water */
  median: number;
  q10: number;
  q90: number;
}

export interface ProjectionPoint {
  id: string;
  lat: number;
  lon: number;
  scenarios: Record<ScenarioKey, Record<IndicatorKey, DeltaStat>>;
}

export interface ProjectionMeta {
  demo: boolean;
  generated: string;
  source: string;
  reference: string;
  horizon: string;
}

export interface ProjectionPayload {
  available: boolean;
  meta?: ProjectionMeta;
  point?: ProjectionPoint & { distanceKm: number };
  message?: string;
}

const META = (dataset as { meta: ProjectionMeta }).meta;
const POINTS = (dataset as unknown as { points: ProjectionPoint[] }).points;

const MAX_DISTANCE_KM = 120;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function projectionForSite(lat: number, lon: number): ProjectionPayload {
  if (POINTS.length === 0) {
    return { available: false, message: "Aucune donnée de projection chargée." };
  }
  let best: ProjectionPoint | null = null;
  let bestD = Infinity;
  for (const p of POINTS) {
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (!best || bestD > MAX_DISTANCE_KM) {
    return {
      available: false,
      meta: META,
      message: "Site hors de la zone couverte par les points de simulation.",
    };
  }
  return {
    available: true,
    meta: META,
    point: { ...best, distanceKm: Math.round(bestD * 10) / 10 },
  };
}

/**
 * Prospective 2050 score (v1): severity of the projected low-flow decline
 * (median QMNA5 delta, 0 → 0 … -40 % → 100), blended with the current-year
 * restriction frequency when known (70 % / 30 %).
 */
export function prospectiveScore(
  qmna5Median: number,
  historiqueScore?: number,
): { score: number; parts: { delta: number; historique?: number } } {
  const delta = Math.round(Math.max(0, Math.min(1, -qmna5Median / 40)) * 100);
  if (historiqueScore === undefined) {
    return { score: delta, parts: { delta } };
  }
  return {
    score: Math.round(0.7 * delta + 0.3 * historiqueScore),
    parts: { delta, historique: historiqueScore },
  };
}
