// Server-side helpers for Hub'Eau APIs (hydrometry + piezometry).
// Free public APIs, no key, fair-use ~20 req/s. We only query around client
// sites, and Next's fetch cache (revalidate) keeps upstream traffic low.
//
// Sprint 3.5 behavior: candidates within 60 km are probed in parallel and
// returned as a ranked list (available or not, with last-measurement date) so
// the user can pick the station they know is relevant. Selection remains
// distance-based by default, qualified by a confidence indicator; matching by
// sub-basin / aquifer (code_bdlisa) is planned with the database sprint.
// When no station publishes daily flow (QmJ), water height (H) is offered as a
// clearly-labeled secondary signal.

// Overridable for tests (e.g. HUBEAU_BASE_URL=http://localhost:9999)
const HUBEAU_ROOT = process.env.HUBEAU_BASE_URL ?? "https://hubeau.eaufrance.fr";
const HYDRO_BASE = `${HUBEAU_ROOT}/api/v2/hydrometrie`;
const PIEZO_BASE = `${HUBEAU_ROOT}/api/v1/niveaux_nappes`;

const STATIONS_REVALIDATE = 24 * 3600; // referentials move rarely
const SERIES_REVALIDATE = 6 * 3600; // daily data, refreshed a few times a day
const SEARCH_RADIUS_KM = 60;
const MAX_CANDIDATES = 8;
const UPSTREAM_TIMEOUT_MS = 8000;
const SERIES_DAYS = 35;

export type Trend = "hausse" | "stable" | "baisse";
export type Confidence = "bonne" | "moyenne" | "faible";

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface StationOption {
  code: string;
  label: string;
  distanceKm: number;
  confidence: Confidence;
  available: boolean;
  /** date of the most recent measurement we saw (any freshness) */
  lastDate?: string;
  /** true when the available data is the secondary signal (water height) */
  secondary?: boolean;
}

export interface IndicatorResult {
  station: StationOption;
  /** daily points, ascending by date, last ~35 days */
  series: SeriesPoint[];
  latest: SeriesPoint;
  unit: string;
  grandeur: string;
  trend?: Trend;
  /** true when a rising value means more available water */
  higherIsBetter: boolean;
  /** true for the water-height fallback (less comparable than flow) */
  secondary?: boolean;
}

export interface IndicatorsPayload {
  stations: StationOption[];
  selected?: IndicatorResult;
  message?: string;
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

/** bbox rounded to 2 decimals so identical sites hit the same upstream cache entry */
function bboxAround(lat: number, lon: number): string {
  const dLat = SEARCH_RADIUS_KM / 111;
  const dLon = SEARCH_RADIUS_KM / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const r = (n: number) => n.toFixed(2);
  return [r(lon - dLon), r(lat - dLat), r(lon + dLon), r(lat + dLat)].join(",");
}

function daysAgoIso(days: number): string {
  const d = new Date(Date.now() - days * 86400_000);
  return d.toISOString().slice(0, 10);
}

function confidenceForDistance(km: number): Confidence {
  if (km <= 10) return "bonne";
  if (km <= 20) return "moyenne";
  return "faible";
}

/**
 * Last 7 daily values vs the 7 before, scaled by the observed range of the
 * window (not the mean: an NGF groundwater level around 100 m would otherwise
 * always read "stable"). Dead band: 10% of the range.
 */
function computeTrend(series: SeriesPoint[]): Trend | undefined {
  if (series.length < 10) return undefined;
  const values = series.map((p) => p.value);
  const recent = values.slice(-7);
  const before = values.slice(-14, -7);
  if (before.length < 3) return undefined;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const range = Math.max(...values) - Math.min(...values);
  if (range < 1e-9) return "stable";
  const delta = (mean(recent) - mean(before)) / range;
  if (delta > 0.1) return "hausse";
  if (delta < -0.1) return "baisse";
  return "stable";
}

async function hubeauJson(url: string, revalidate: number): Promise<unknown[] | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    // Hub'Eau uses 200 (complete) and 206 (partial page) as success codes.
    if (res.status !== 200 && res.status !== 206) return null;
    const json = (await res.json()) as { data?: unknown[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return null;
  }
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Keep the last value per calendar day, ascending by date. */
function toDailySeries(points: Array<{ date: string; value: number }>): SeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const p of [...points].sort((a, b) => a.date.localeCompare(b.date))) {
    byDay.set(p.date.slice(0, 10), p.value);
  }
  return [...byDay.entries()].map(([date, value]) => ({ date, value }));
}

function isFresh(series: SeriesPoint[], maxAgeDays: number): boolean {
  const last = series[series.length - 1];
  if (!last) return false;
  return Date.now() - new Date(last.date).getTime() < maxAgeDays * 86400_000;
}

interface Candidate {
  code: string;
  label: string;
  distanceKm: number;
  altCode?: string;
}

function rankCandidates(
  rows: unknown[],
  lat: number,
  lon: number,
  extract: (row: Record<string, unknown>) => { code?: string; label?: string; lat?: number; lon?: number; altCode?: string } | null,
): Candidate[] {
  const out: Candidate[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const e = extract(row as Record<string, unknown>);
    if (!e?.code || e.lat === undefined || e.lon === undefined) continue;
    const distanceKm = haversineKm(lat, lon, e.lat, e.lon);
    if (distanceKm > SEARCH_RADIUS_KM) continue;
    out.push({ code: e.code, label: e.label ?? e.code, distanceKm, altCode: e.altCode });
  }
  return out
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_CANDIDATES);
}

function toOption(cand: Candidate, probe: ProbeOutcome | undefined): StationOption {
  return {
    code: cand.code,
    label: cand.label,
    distanceKm: Math.round(cand.distanceKm * 10) / 10,
    confidence: confidenceForDistance(cand.distanceKm),
    available: probe?.available ?? false,
    lastDate: probe?.lastDate,
    secondary: probe?.secondary,
  };
}

interface ProbeOutcome {
  available: boolean;
  lastDate?: string;
  series?: SeriesPoint[];
  unit?: string;
  grandeur?: string;
  higherIsBetter?: boolean;
  secondary?: boolean;
}

function buildResult(option: StationOption, probe: ProbeOutcome): IndicatorResult | undefined {
  if (!probe.series || probe.series.length === 0) return undefined;
  return {
    station: option,
    series: probe.series,
    latest: probe.series[probe.series.length - 1],
    unit: probe.unit ?? "",
    grandeur: probe.grandeur ?? "",
    trend: computeTrend(probe.series),
    higherIsBetter: probe.higherIsBetter ?? true,
    secondary: probe.secondary,
  };
}

/** Assemble the payload: options list + the selected (requested or nearest available) result. */
function assemble(
  candidates: Candidate[],
  probes: Map<string, ProbeOutcome>,
  requestedCode: string | undefined,
  emptyMessage: string,
): IndicatorsPayload {
  const stations = candidates.map((c) => toOption(c, probes.get(c.code)));
  const pick =
    (requestedCode && stations.find((s) => s.code === requestedCode && s.available)) ||
    stations.find((s) => s.available);
  if (!pick) return { stations, message: emptyMessage };
  const probe = probes.get(pick.code);
  const selected = probe ? buildResult(pick, probe) : undefined;
  return selected ? { stations, selected } : { stations, message: emptyMessage };
}

const SERVICE_ERROR: IndicatorsPayload = {
  stations: [],
  message: "Service Hub'Eau injoignable pour le moment.",
};

// ---------------------------------------------------------------------------
// Hydrometry
// ---------------------------------------------------------------------------

async function probeHydroFlow(code: string): Promise<ProbeOutcome | null> {
  const url =
    `${HYDRO_BASE}/obs_elab?code_entite=${encodeURIComponent(code)}` +
    `&grandeur_hydro_elab=QmJ&date_debut_obs_elab=${daysAgoIso(SERIES_DAYS)}` +
    `&size=100&fields=date_obs_elab,resultat_obs_elab`;
  const obs = await hubeauJson(url, SERIES_REVALIDATE);
  if (obs === null) return null;
  const points: Array<{ date: string; value: number }> = [];
  for (const row of obs) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const date = str(r.date_obs_elab);
    const value = num(r.resultat_obs_elab); // l/s
    if (date && value !== undefined && value >= 0) points.push({ date, value: value / 1000 });
  }
  const series = toDailySeries(points);
  const usable = series.length >= 5 && isFresh(series, 10);
  return {
    available: usable,
    lastDate: series[series.length - 1]?.date,
    series: usable ? series : undefined,
    unit: "m³/s",
    grandeur: "Débit moyen journalier (QmJ)",
    higherIsBetter: true,
  };
}

/** Secondary signal: real-time water height when no station has flow data. */
async function probeHydroHeight(code: string): Promise<ProbeOutcome | null> {
  const url =
    `${HYDRO_BASE}/observations_tr?code_entite=${encodeURIComponent(code)}` +
    `&grandeur_hydro=H&date_debut_obs=${daysAgoIso(30)}` +
    `&size=2000&sort=desc&fields=date_obs,resultat_obs`;
  const obs = await hubeauJson(url, SERIES_REVALIDATE);
  if (obs === null) return null;
  const points: Array<{ date: string; value: number }> = [];
  for (const row of obs) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const date = str(r.date_obs);
    const value = num(r.resultat_obs); // mm
    if (date && value !== undefined) points.push({ date, value: value / 1000 });
  }
  const series = toDailySeries(points);
  const usable = series.length >= 5 && isFresh(series, 5);
  return {
    available: usable,
    lastDate: series[series.length - 1]?.date,
    series: usable ? series : undefined,
    unit: "m",
    grandeur: "Hauteur d'eau",
    higherIsBetter: true,
    secondary: true,
  };
}

export async function hydroIndicators(
  lat: number,
  lon: number,
  requestedCode?: string,
): Promise<IndicatorsPayload> {
  const stationsUrl =
    `${HYDRO_BASE}/referentiel/stations?bbox=${bboxAround(lat, lon)}` +
    `&format=json&size=300&fields=code_station,libelle_station,longitude_station,latitude_station,en_service`;
  const rows = await hubeauJson(stationsUrl, STATIONS_REVALIDATE);
  if (rows === null) return SERVICE_ERROR;

  const candidates = rankCandidates(rows, lat, lon, (r) => {
    if (r.en_service === false) return null;
    return {
      code: str(r.code_station),
      label: str(r.libelle_station),
      lat: num(r.latitude_station),
      lon: num(r.longitude_station),
    };
  });
  if (candidates.length === 0) {
    return {
      stations: [],
      message: `Aucune station hydrométrique à moins de ${SEARCH_RADIUS_KM} km.`,
    };
  }

  const probes = new Map<string, ProbeOutcome>();
  const flowResults = await Promise.all(candidates.map((c) => probeHydroFlow(c.code)));
  candidates.forEach((c, i) => {
    const p = flowResults[i];
    if (p) probes.set(c.code, p);
  });

  // Height fallback only when no station at all publishes usable flow.
  if (![...probes.values()].some((p) => p.available)) {
    const top = candidates.slice(0, 4);
    const heightResults = await Promise.all(top.map((c) => probeHydroHeight(c.code)));
    top.forEach((c, i) => {
      const p = heightResults[i];
      if (p && (p.available || !probes.has(c.code))) probes.set(c.code, p);
    });
  }

  return assemble(
    candidates,
    probes,
    requestedCode,
    "Stations proches sans données récentes de débit ni de hauteur.",
  );
}

// ---------------------------------------------------------------------------
// Piezometry
// ---------------------------------------------------------------------------

async function probePiezo(cand: Candidate): Promise<ProbeOutcome | null> {
  const parse = (obs: unknown[]) => {
    const niveau: Array<{ date: string; value: number }> = [];
    const prof: Array<{ date: string; value: number }> = [];
    for (const row of obs) {
      if (typeof row !== "object" || row === null) continue;
      const r = row as Record<string, unknown>;
      const date = str(r.date_mesure) ?? str(r.timestamp_mesure);
      if (!date) continue;
      const n = num(r.niveau_nappe_eau);
      if (n !== undefined) niveau.push({ date, value: n });
      const p = num(r.profondeur_nappe);
      if (p !== undefined) prof.push({ date, value: p });
    }
    return { niveau, prof };
  };

  // near-real-time hourly chronicle first (bss_id), archive chronicle as fallback
  const urls = [
    cand.altCode
      ? `${PIEZO_BASE}/chroniques_tr?bss_id=${encodeURIComponent(cand.altCode)}` +
        `&date_debut_mesure=${daysAgoIso(SERIES_DAYS)}&size=2000&fields=date_mesure,timestamp_mesure,niveau_nappe_eau,profondeur_nappe`
      : null,
    `${PIEZO_BASE}/chroniques?code_bss=${encodeURIComponent(cand.code)}` +
      `&date_debut_mesure=${daysAgoIso(SERIES_DAYS)}&size=200&fields=date_mesure,niveau_nappe_eau,profondeur_nappe`,
  ].filter((u): u is string => u !== null);

  let sawService = false;
  for (const url of urls) {
    const obs = await hubeauJson(url, SERIES_REVALIDATE);
    if (obs === null) continue;
    sawService = true;
    if (obs.length === 0) continue;
    const { niveau, prof } = parse(obs);
    // Prefer the NGF water level (higher = more water); fall back to depth
    // below ground (higher = less water).
    const useNiveau = niveau.length >= prof.length;
    const series = toDailySeries(useNiveau ? niveau : prof);
    const usable = series.length >= 5 && isFresh(series, 15);
    return {
      available: usable,
      lastDate: series[series.length - 1]?.date,
      series: usable ? series : undefined,
      unit: useNiveau ? "m NGF" : "m (profondeur)",
      grandeur: useNiveau ? "Niveau de nappe" : "Profondeur de nappe",
      higherIsBetter: useNiveau,
    };
  }
  return sawService ? { available: false } : null;
}

export async function piezoIndicators(
  lat: number,
  lon: number,
  requestedCode?: string,
): Promise<IndicatorsPayload> {
  const stationsUrl =
    `${PIEZO_BASE}/stations?bbox=${bboxAround(lat, lon)}` +
    `&format=json&size=300&fields=code_bss,bss_id,libelle_pe,longitude,latitude,date_fin_mesure`;
  const rows = await hubeauJson(stationsUrl, STATIONS_REVALIDATE);
  if (rows === null) return SERVICE_ERROR;

  const recentCutoff = daysAgoIso(90);
  const candidates = rankCandidates(rows, lat, lon, (r) => {
    // skip piezometers that stopped reporting months ago
    const end = str(r.date_fin_mesure);
    if (end && end.slice(0, 10) < recentCutoff) return null;
    return {
      code: str(r.code_bss),
      altCode: str(r.bss_id),
      label: str(r.libelle_pe),
      lat: num(r.latitude),
      lon: num(r.longitude),
    };
  });
  if (candidates.length === 0) {
    return {
      stations: [],
      message: `Aucun piézomètre actif à moins de ${SEARCH_RADIUS_KM} km.`,
    };
  }

  const probes = new Map<string, ProbeOutcome>();
  const results = await Promise.all(candidates.map((c) => probePiezo(c)));
  candidates.forEach((c, i) => {
    const p = results[i];
    if (p) probes.set(c.code, p);
  });

  return assemble(candidates, probes, requestedCode, "Piézomètres proches sans données récentes.");
}
