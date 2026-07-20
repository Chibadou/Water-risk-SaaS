// Onde (ONDE — Observatoire National Des Étiages, OFB) via Hub'Eau
// `/v1/ecoulement`. Volunteer observers visually rate summer flow at ~3 200
// sentinel stream stations in headwater basins. Categories run from visible
// flow to dry (assec) — an early-warning signal that degrades *before* arrêtés
// escalate, so it complements the regulatory and physical components.
//
// Observations are seasonal (mainly May–September, monthly "campagnes
// usuelles" plus crisis campaigns). Off-season there is nothing recent nearby,
// in which case we return null and the score renormalizes without this
// component rather than inventing a value.

const HUBEAU_ROOT = process.env.HUBEAU_BASE_URL ?? "https://hubeau.eaufrance.fr";
const ONDE_BASE = `${HUBEAU_ROOT}/api/v1/ecoulement`;

const SEARCH_RADIUS_KM = 60;
const RECENT_DAYS = 45; // only count a campaign this fresh
const REVALIDATE = 6 * 3600;
const UPSTREAM_TIMEOUT_MS = 8000;

export interface OndeResult {
  /** nearby sentinel stations with an observation in the last RECENT_DAYS */
  stations: number;
  assec: number; // dry
  nonVisible: number; // flow stopped but not dry
  faible: number; // weak visible flow
  visible: number; // normal visible flow
  /** most recent observation date seen (YYYY-MM-DD) */
  derniereObservation?: string;
  /** 0-100 risk from the severity mix (assec worst) */
  score: number;
  radiusKm: number;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bboxAround(lat: number, lon: number): string {
  const dLat = SEARCH_RADIUS_KM / 111;
  const dLon = SEARCH_RADIUS_KM / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const r = (n: number) => n.toFixed(2);
  return [r(lon - dLon), r(lat - dLat), r(lon + dLon), r(lat + dLat)].join(",");
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

type FlowClass = "assec" | "nonVisible" | "faible" | "visible";

// Severity weight per class (0-100). Assec = maximum stress.
const SEVERITY: Record<FlowClass, number> = {
  assec: 100,
  nonVisible: 65,
  faible: 30,
  visible: 0,
};

/** Classify an observation from its label (robust to code-scheme changes) and
 *  code as a fallback. Returns undefined when it can't be interpreted. */
export function classifyEcoulement(libelle?: string, code?: string): FlowClass | undefined {
  const l = (libelle ?? "").toLowerCase();
  if (l) {
    if (l.includes("assec") || l.includes("assèchement") || l.includes("assechement")) return "assec";
    if (l.includes("non visible") || l.includes("pas d'écoulement") || l.includes("pas d'ecoulement"))
      return "nonVisible";
    if (l.includes("faible")) return "faible";
    if (l.includes("visible") || l.includes("écoulement") || l.includes("ecoulement")) return "visible";
  }
  // Fallback on the ONDE code (1 visible, 1f faible, 2 non-visible, 3 assec).
  const c = (code ?? "").trim().toLowerCase();
  if (c === "3") return "assec";
  if (c === "2") return "nonVisible";
  if (c === "1f") return "faible";
  if (c === "1" || c === "1a") return "visible";
  return undefined;
}

async function ondeJson(url: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (res.status !== 200 && res.status !== 206) return null;
    const json = (await res.json()) as { data?: unknown[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return null;
  }
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

/** Nearby Onde observations from the last recent campaign → risk 0-100.
 *  null when the service is unreachable or no fresh observation is nearby. */
export async function ondeIndicator(lat: number, lon: number): Promise<OndeResult | null> {
  const url =
    `${ONDE_BASE}/observations?bbox=${bboxAround(lat, lon)}` +
    `&date_observation_min=${daysAgoIso(RECENT_DAYS)}` +
    `&grandeur_hydro=ecoulement&size=1000` +
    `&fields=code_station,libelle_ecoulement,code_ecoulement,date_observation,longitude,latitude`;
  const rows = await ondeJson(url);
  if (rows === null) return null;

  // Keep the most recent observation per station within the radius.
  const perStation = new Map<string, { date: string; cls: FlowClass }>();
  let derniere: string | undefined;
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const code = str(r.code_station);
    const date = str(r.date_observation)?.slice(0, 10);
    const la = num(r.latitude);
    const lo = num(r.longitude);
    if (!code || !date || la === undefined || lo === undefined) continue;
    if (haversineKm(lat, lon, la, lo) > SEARCH_RADIUS_KM) continue;
    const cls = classifyEcoulement(str(r.libelle_ecoulement), str(r.code_ecoulement));
    if (!cls) continue;
    const prev = perStation.get(code);
    if (!prev || date > prev.date) perStation.set(code, { date, cls });
    if (!derniere || date > derniere) derniere = date;
  }

  if (perStation.size === 0) return null;

  const counts = { assec: 0, nonVisible: 0, faible: 0, visible: 0 };
  let severitySum = 0;
  for (const { cls } of perStation.values()) {
    counts[cls]++;
    severitySum += SEVERITY[cls];
  }
  return {
    stations: perStation.size,
    ...counts,
    derniereObservation: derniere,
    score: Math.round(severitySum / perStation.size),
    radiusKm: SEARCH_RADIUS_KM,
  };
}
