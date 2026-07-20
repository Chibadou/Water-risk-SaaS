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
const REF_REVALIDATE = 24 * 3600; // long reference history moves slowly
const SEARCH_RADIUS_KM = 60;
const MAX_CANDIDATES = 8;
const UPSTREAM_TIMEOUT_MS = 8000;
const REF_TIMEOUT_MS = 15000; // long history responses are larger
const SERIES_DAYS = 35;

// Reference-statistics horizons and minimum sample sizes.
const REF_HYDRO_YEARS = 18;
const REF_PIEZO_YEARS = 25;
const MIN_YEARS_LOWFLOW = 6; // years needed for a VCN10/QMNA5 quinquennile
const MIN_YEARS_IPS = 10; // years needed for a same-month piezo distribution

export type Trend = "hausse" | "stable" | "baisse";
export type Confidence = "bonne" | "moyenne" | "faible";

/** Standardized state of the resource vs its own long record (IPS for
 *  groundwater, VCN10/QMNA5 low-flow ratio for rivers). Higher score = more
 *  stressed. Present only when enough history exists. */
export interface ResourceReference {
  /** 0-100 risk (high = low / stressed vs the historical record) */
  score: number;
  method: "ips" | "lowflow";
  /** short qualitative label, e.g. "Nappe très basse (IPS)" */
  label: string;
  /** human-readable basis, e.g. "décile le plus bas pour un mois de juillet" */
  detail: string;
  /** number of years of record the statistic is built on */
  years: number;
}

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
  /** aquifer code (BDLISA) for piezometers, when the referential provides it */
  aquifer?: string;
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
  /** standardized state vs the station's own long record, when computable */
  reference?: ResourceReference;
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

async function hubeauJson(
  url: string,
  revalidate: number,
  timeoutMs: number = UPSTREAM_TIMEOUT_MS,
): Promise<unknown[] | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate },
      signal: AbortSignal.timeout(timeoutMs),
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
  /** aquifer code (BDLISA) for piezometers — helps judge hydrogeological fit */
  aquifer?: string;
}

function rankCandidates(
  rows: unknown[],
  lat: number,
  lon: number,
  extract: (row: Record<string, unknown>) => { code?: string; label?: string; lat?: number; lon?: number; altCode?: string; aquifer?: string } | null,
): Candidate[] {
  const out: Candidate[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const e = extract(row as Record<string, unknown>);
    if (!e?.code || e.lat === undefined || e.lon === undefined) continue;
    const distanceKm = haversineKm(lat, lon, e.lat, e.lon);
    if (distanceKm > SEARCH_RADIUS_KM) continue;
    out.push({ code: e.code, label: e.label ?? e.code, distanceKm, altCode: e.altCode, aquifer: e.aquifer });
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
    aquifer: cand.aquifer,
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
// Reference statistics — standardized state vs the station's own long record.
// We compute the references empirically from Hub'Eau history rather than
// scraping Hydroportail/BRGM published values (no clean open JSON API), which
// keeps everything local and self-contained.
// ---------------------------------------------------------------------------

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** linear-interpolated quantile of an ascending-sorted array */
export function quantile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

/** mean value per calendar month, keyed YYYY-MM */
function monthlyMeans(points: SeriesPoint[]): Map<string, number> {
  const acc = new Map<string, { s: number; n: number }>();
  for (const p of points) {
    const key = p.date.slice(0, 7);
    const cur = acc.get(key) ?? { s: 0, n: 0 };
    cur.s += p.value;
    cur.n += 1;
    acc.set(key, cur);
  }
  const out = new Map<string, number>();
  for (const [k, v] of acc) out.set(k, v.s / v.n);
  return out;
}

/**
 * Empirical piezometric standing (IPS-like): where the latest month's mean
 * level sits within the distribution of that same calendar month across the
 * record. Oriented to water availability, so a low percentile → low water →
 * high risk. `higherIsBetter` is false for depth-below-ground series.
 */
export function computeIps(points: SeriesPoint[], higherIsBetter: boolean): ResourceReference | undefined {
  const mm = monthlyMeans(points);
  if (mm.size < 12) return undefined;
  const keys = [...mm.keys()].sort();
  const latestKey = keys[keys.length - 1];
  const latestMonth = latestKey.slice(5, 7);
  const latest = mm.get(latestKey)!;
  const sameMonth = keys.filter((k) => k.slice(5, 7) === latestMonth).map((k) => mm.get(k)!);
  const years = sameMonth.length;
  if (years < MIN_YEARS_IPS) return undefined;

  // Orient to availability (higher = more water) then take a mid-rank percentile.
  const avail = (v: number) => (higherIsBetter ? v : -v);
  const a = avail(latest);
  const hist = sameMonth.map(avail);
  let below = 0;
  let equal = 0;
  for (const v of hist) {
    if (v < a) below++;
    else if (v === a) equal++;
  }
  const p = (below + equal / 2) / hist.length; // 0 = lowest water, 1 = highest
  const score = Math.max(0, Math.min(100, Math.round((1 - p) * 100)));
  const classe =
    p < 0.1 ? "très basse" : p < 0.3 ? "basse" : p <= 0.7 ? "proche des normales" : p < 0.9 ? "haute" : "très haute";
  const moisFr = MONTHS_FR[Number(latestMonth) - 1] ?? latestMonth;
  return {
    score,
    method: "ips",
    label: `Nappe ${classe} (IPS)`,
    detail: `niveau ${classe} pour un mois de ${moisFr}, sur ${years} ans d'historique`,
    years,
  };
}

/** minimum 10-day rolling mean over a daily series (VCN10 of one year) */
function minRolling10(values: number[]): number | undefined {
  if (values.length < 10) return undefined;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += values[i];
  let min = sum / 10;
  for (let i = 10; i < values.length; i++) {
    sum += values[i] - values[i - 10];
    min = Math.min(min, sum / 10);
  }
  return min;
}

function ratioRisk(ratio: number): number {
  // Anchors: at 0.5× reference → 100, at the reference (1×) → 60, at 3× → 0.
  if (ratio <= 0.5) return 100;
  if (ratio >= 3) return 0;
  if (ratio <= 1) return Math.round(100 + ((ratio - 0.5) * (60 - 100)) / (1 - 0.5));
  return Math.round(60 + ((ratio - 1) * (0 - 60)) / (3 - 1));
}

function fmtFlow(v: number): string {
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: digits })} m³/s`;
}

/**
 * Empirical low-flow standing: recent 10-day mean flow against the station's
 * own VCN10 (quinquennial dry, quantile 0.2 of the annual VCN10 series), with
 * QMNA5 shown as context. Below the reference → high risk.
 */
export function computeLowFlow(points: SeriesPoint[]): ResourceReference | undefined {
  const byYear = new Map<number, SeriesPoint[]>();
  for (const p of points) {
    const y = Number(p.date.slice(0, 4));
    const arr = byYear.get(y) ?? [];
    arr.push(p);
    byYear.set(y, arr);
  }
  const vcn10s: number[] = [];
  const qmnas: number[] = [];
  for (const [, pts] of byYear) {
    if (pts.length < 60) continue; // skip sparse / partial years
    pts.sort((a, b) => a.date.localeCompare(b.date));
    const vcn = minRolling10(pts.map((p) => p.value));
    if (vcn !== undefined && Number.isFinite(vcn)) vcn10s.push(vcn);
    const mm = [...monthlyMeans(pts).values()];
    if (mm.length >= 6) qmnas.push(Math.min(...mm));
  }
  if (vcn10s.length < MIN_YEARS_LOWFLOW) return undefined;

  const vcn10ref = quantile([...vcn10s].sort((a, b) => a - b), 0.2);
  const qmna5 =
    qmnas.length >= MIN_YEARS_LOWFLOW ? quantile([...qmnas].sort((a, b) => a - b), 0.2) : undefined;
  if (!(vcn10ref > 0)) return undefined;

  const recent = points.slice(-10);
  const current = recent.reduce((s, p) => s + p.value, 0) / recent.length;
  const ratio = current / vcn10ref;
  const score = ratioRisk(ratio);
  const qmnaTxt = qmna5 !== undefined ? `, QMNA5 ${fmtFlow(qmna5)}` : "";
  const rel = ratio < 1 ? "sous" : "au-dessus du";
  return {
    score,
    method: "lowflow",
    label: ratio < 1 ? "Débit sous l'étiage de référence" : "Débit au-dessus de l'étiage",
    detail: `débit récent ${fmtFlow(current)} ${rel} VCN10 quinquennal ${fmtFlow(vcn10ref)}${qmnaTxt} (${vcn10s.length} ans)`,
    years: vcn10s.length,
  };
}

/** Long QmJ history → low-flow reference for the selected hydro station. */
async function flowReference(code: string): Promise<ResourceReference | undefined> {
  const url =
    `${HYDRO_BASE}/obs_elab?code_entite=${encodeURIComponent(code)}` +
    `&grandeur_hydro_elab=QmJ&date_debut_obs_elab=${daysAgoIso(REF_HYDRO_YEARS * 365)}` +
    `&size=20000&sort=asc&fields=date_obs_elab,resultat_obs_elab`;
  const obs = await hubeauJson(url, REF_REVALIDATE, REF_TIMEOUT_MS);
  if (!obs || obs.length === 0) return undefined;
  const points: SeriesPoint[] = [];
  for (const row of obs) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const date = str(r.date_obs_elab);
    const value = num(r.resultat_obs_elab);
    if (date && value !== undefined && value >= 0) points.push({ date: date.slice(0, 10), value: value / 1000 });
  }
  return computeLowFlow(points);
}

/** Long chronicle → IPS reference for the selected piezometer. */
async function piezoReference(code: string, higherIsBetter: boolean): Promise<ResourceReference | undefined> {
  const field = higherIsBetter ? "niveau_nappe_eau" : "profondeur_nappe";
  const url =
    `${PIEZO_BASE}/chroniques?code_bss=${encodeURIComponent(code)}` +
    `&date_debut_mesure=${daysAgoIso(REF_PIEZO_YEARS * 365)}` +
    `&size=20000&sort=asc&fields=date_mesure,${field}`;
  const obs = await hubeauJson(url, REF_REVALIDATE, REF_TIMEOUT_MS);
  if (!obs || obs.length === 0) return undefined;
  const points: SeriesPoint[] = [];
  for (const row of obs) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const date = str(r.date_mesure);
    const value = num(r[field]);
    if (date && value !== undefined) points.push({ date: date.slice(0, 10), value });
  }
  return computeIps(points, higherIsBetter);
}

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

  const payload = assemble(
    candidates,
    probes,
    requestedCode,
    "Stations proches sans données récentes de débit ni de hauteur.",
  );
  // Low-flow reference only makes sense for actual flow (not the height fallback).
  if (payload.selected && !payload.selected.secondary) {
    const ref = await flowReference(payload.selected.station.code);
    if (ref) payload.selected.reference = ref;
  }
  return payload;
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
    `&format=json&size=300&fields=code_bss,bss_id,libelle_pe,longitude,latitude,date_fin_mesure,codes_bdlisa`;
  const rows = await hubeauJson(stationsUrl, STATIONS_REVALIDATE);
  if (rows === null) return SERVICE_ERROR;

  const recentCutoff = daysAgoIso(90);
  const candidates = rankCandidates(rows, lat, lon, (r) => {
    // skip piezometers that stopped reporting months ago
    const end = str(r.date_fin_mesure);
    if (end && end.slice(0, 10) < recentCutoff) return null;
    // codes_bdlisa is an array of aquifer codes; keep the first.
    const bdlisa = Array.isArray(r.codes_bdlisa) ? r.codes_bdlisa.map(String)[0] : str(r.codes_bdlisa);
    return {
      code: str(r.code_bss),
      altCode: str(r.bss_id),
      label: str(r.libelle_pe),
      lat: num(r.latitude),
      lon: num(r.longitude),
      aquifer: bdlisa,
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

  const payload = assemble(candidates, probes, requestedCode, "Piézomètres proches sans données récentes.");
  if (payload.selected) {
    const ref = await piezoReference(payload.selected.station.code, payload.selected.higherIsBetter);
    if (ref) payload.selected.reference = ref;
  }
  return payload;
}
