// Map layers for the /carte page (Sprint 29): the physical water objects around
// a point — flow-gauging stations, piezometers, ONDE sentinel stations and
// declared withdrawal structures.
//
// ⚠️ This module is a LOCATOR, not a model. Nothing it returns enters
// `computeScore` or any other figure of the product — same no-double-counting
// rule as `secteur` / `origine` / `dependance`. It answers "what is around
// here?", never "how bad is it?".
//
// Why it does not reuse /api/hydro or /api/piezo: those attach ONE station to a
// site and probe each candidate's chronicle to do so (8 candidates × 1-2 calls).
// A map needs the opposite — every station in view, coordinates included, no
// chronicle. `StationOption` does not even carry lon/lat.

import { bboxAround, haversineKm, hubeauJson, num, str } from "./hubeau";
import { classifyEcoulement } from "./onde";

const HUBEAU_ROOT = process.env.HUBEAU_BASE_URL ?? "https://hubeau.eaufrance.fr";
const HYDRO_BASE = `${HUBEAU_ROOT}/api/v2/hydrometrie`;
const PIEZO_BASE = `${HUBEAU_ROOT}/api/v1/niveaux_nappes`;
const ONDE_BASE = `${HUBEAU_ROOT}/api/v1/ecoulement`;
const BNPE_BASE = `${HUBEAU_ROOT}/api/v1/prelevements`;

/** Referentials move rarely; the map can serve a day-old station list. */
const REFERENTIAL_REVALIDATE = 24 * 3600;
/** ONDE observations are campaign-based — a few hours is plenty. */
const OBSERVATION_REVALIDATE = 6 * 3600;

const UPSTREAM_TIMEOUT_MS = 10_000;
/** Upstream page size. Beyond this a viewport is too wide to be readable anyway. */
const MAX_ROWS = 500;
/** Points kept per layer after ranking by distance — protects the browser. */
export const MAX_FEATURES_PER_LAYER = 300;

export const MIN_RADIUS_KM = 5;
export const MAX_RADIUS_KM = 100;
export const DEFAULT_RADIUS_KM = 30;

/** Piezometers reporting nothing for this long are past sites, not live ones. */
const PIEZO_STALE_DAYS = 365;
/** ONDE campaigns are seasonal (May–Sept): a whole year keeps the last one. */
const ONDE_LOOKBACK_DAYS = 365;

export type LayerKind = "hydro" | "piezo" | "onde" | "bnpe";

export const LAYERS: Array<{ kind: LayerKind; label: string; color: string; hint: string }> = [
  {
    kind: "hydro",
    label: "Stations de débit",
    color: "#0284c7",
    hint: "Stations hydrométriques (Hub'Eau) : elles mesurent le débit des cours d'eau.",
  },
  {
    kind: "piezo",
    label: "Piézomètres (nappes)",
    color: "#7c3aed",
    hint: "Piézomètres (Hub'Eau / ADES) : ils suivent le niveau des nappes souterraines.",
  },
  {
    kind: "onde",
    label: "Observations d'assecs",
    color: "#ea580c",
    hint: "Réseau ONDE (OFB) : observation visuelle de l'écoulement des petits cours d'eau en été.",
  },
  {
    kind: "bnpe",
    label: "Ouvrages de prélèvement",
    color: "#0f766e",
    hint: "Ouvrages déclarés à la BNPE : points où de l'eau est prélevée (usage et milieu).",
  },
];

export interface MapFeature {
  kind: LayerKind;
  code: string;
  label: string;
  lon: number;
  lat: number;
  /** distance to the query centre, km, one decimal */
  distanceKm: number;
  /** one line of context shown in the popup — never a computed indicator */
  detail?: string;
  /** ONDE only: 0-100 flow severity, drives the marker colour */
  severity?: number;
}

export interface MapLayers {
  centre: { lat: number; lon: number };
  radiusKm: number;
  features: Record<LayerKind, MapFeature[]>;
  /** per-layer French message when a layer could not be served */
  messages: Partial<Record<LayerKind, string>>;
}

/** Clamp a requested radius into the range the upstream APIs answer sanely. */
export function clampRadiusKm(value: unknown): number {
  const n = num(value);
  if (n === undefined) return DEFAULT_RADIUS_KM;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(n)));
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

function row(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/**
 * Common tail of every parser: drop features without usable coordinates,
 * enforce the radius (a bbox is a square, the user asked for a disc), dedupe on
 * code and keep the closest ones.
 *
 * ⚠️ A row without coordinates is DROPPED, never defaulted to 0/0 — that would
 * put a station in the Gulf of Guinea and read as real.
 */
function finalize(features: MapFeature[]): MapFeature[] {
  const byCode = new Map<string, MapFeature>();
  for (const f of features) {
    const seen = byCode.get(f.code);
    if (!seen || f.distanceKm < seen.distanceKm) byCode.set(f.code, f);
  }
  return [...byCode.values()]
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_FEATURES_PER_LAYER);
}

function place(
  kind: LayerKind,
  code: string | undefined,
  label: string | undefined,
  lon: number | undefined,
  lat: number | undefined,
  centre: { lat: number; lon: number },
  radiusKm: number,
  extra?: { detail?: string; severity?: number },
): MapFeature | undefined {
  if (!code || lon === undefined || lat === undefined) return undefined;
  // Hub'Eau occasionally carries 0/0 for an unpositioned object; it is the
  // Atlantic, not a station.
  if (lon === 0 && lat === 0) return undefined;
  const distanceKm = haversineKm(centre.lat, centre.lon, lat, lon);
  if (distanceKm > radiusKm) return undefined;
  return {
    kind,
    code,
    label: label ?? code,
    lon,
    lat,
    distanceKm: Math.round(distanceKm * 10) / 10,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Parsers — pure, so they are testable without the network (egress is blocked
// in the development sandbox; see HANDBOOK §3).
// ---------------------------------------------------------------------------

export function parseHydroStations(
  rows: unknown[],
  centre: { lat: number; lon: number },
  radiusKm: number,
): MapFeature[] {
  const out: MapFeature[] = [];
  for (const raw of rows) {
    const r = row(raw);
    if (!r) continue;
    // Decommissioned stations would show a gauge where none reports any more.
    if (r.en_service === false) continue;
    const f = place(
      "hydro",
      str(r.code_station),
      str(r.libelle_station),
      num(r.longitude_station),
      num(r.latitude_station),
      centre,
      radiusKm,
      { detail: str(r.libelle_cours_eau) ?? str(r.libelle_site) },
    );
    if (f) out.push(f);
  }
  return finalize(out);
}

export function parsePiezoStations(
  rows: unknown[],
  centre: { lat: number; lon: number },
  radiusKm: number,
): MapFeature[] {
  const cutoff = daysAgoIso(PIEZO_STALE_DAYS);
  const out: MapFeature[] = [];
  for (const raw of rows) {
    const r = row(raw);
    if (!r) continue;
    const end = str(r.date_fin_mesure);
    if (end && end.slice(0, 10) < cutoff) continue;
    // ⚠️ The piezometry referential has NO longitude/latitude columns (verified
    // in Sprint 9): coordinates live in `geometry` (filled in format=geojson,
    // empty in format=json) with x/y as the WGS84 fallback. Getting this wrong
    // silently emptied the groundwater map once already.
    const geom = row(r.geometry);
    const coords = Array.isArray(geom?.coordinates) ? geom.coordinates : undefined;
    const lon = (coords ? num(coords[0]) : undefined) ?? num(r.x);
    const lat = (coords ? num(coords[1]) : undefined) ?? num(r.y);
    const aquifers = Array.isArray(r.codes_bdlisa) ? r.codes_bdlisa.map(String) : [];
    const f = place("piezo", str(r.code_bss), str(r.libelle_pe), lon, lat, centre, radiusKm, {
      detail: aquifers.length > 0 ? `Aquifère BDLISA ${aquifers[0]}` : undefined,
    });
    if (f) out.push(f);
  }
  return finalize(out);
}

/**
 * ONDE observations rather than the station referential: an observation carries
 * the flow class, which is the only thing that makes this layer worth showing.
 * Only the most recent observation per station is kept.
 */
export function parseOndeObservations(
  rows: unknown[],
  centre: { lat: number; lon: number },
  radiusKm: number,
): MapFeature[] {
  const SEVERITY = { assec: 100, nonVisible: 65, faible: 30, visible: 0 } as const;
  const latest = new Map<string, { date: string; raw: Record<string, unknown> }>();
  for (const raw of rows) {
    const r = row(raw);
    if (!r) continue;
    const code = str(r.code_station);
    const date = str(r.date_observation)?.slice(0, 10);
    if (!code || !date) continue;
    const seen = latest.get(code);
    if (!seen || date > seen.date) latest.set(code, { date, raw: r });
  }

  const out: MapFeature[] = [];
  for (const [code, { date, raw: r }] of latest) {
    const cls = classifyEcoulement(str(r.libelle_ecoulement), str(r.code_ecoulement));
    const f = place(
      "onde",
      code,
      str(r.libelle_station) ?? str(r.libelle_cours_eau) ?? code,
      num(r.longitude),
      num(r.latitude),
      centre,
      radiusKm,
      {
        // Unclassifiable label ⇒ no severity, never 0 ("visible") by default.
        severity: cls ? SEVERITY[cls] : undefined,
        detail: `${str(r.libelle_ecoulement) ?? "Écoulement non renseigné"} — observé le ${date}`,
      },
    );
    if (f) out.push(f);
  }
  return finalize(out);
}

/**
 * BNPE withdrawal structures. The coordinate columns were verified on the real
 * referential by the `carte` diagnostics mode before this was written — see the
 * HANDBOOK entry. Rows without coordinates are dropped rather than approximated
 * by a commune centroid, which would be an invented borehole.
 */
export function parseBnpeOuvrages(
  rows: unknown[],
  centre: { lat: number; lon: number },
  radiusKm: number,
): MapFeature[] {
  const out: MapFeature[] = [];
  for (const raw of rows) {
    const r = row(raw);
    if (!r) continue;
    const geom = row(r.geometry);
    const coords = Array.isArray(geom?.coordinates) ? geom.coordinates : undefined;
    const lon = num(r.longitude) ?? (coords ? num(coords[0]) : undefined);
    const lat = num(r.latitude) ?? (coords ? num(coords[1]) : undefined);
    const milieu = str(r.libelle_type_milieu);
    const usage = str(r.libelle_usage_principal) ?? str(r.libelle_usage);
    const detail = [usage, milieu].filter(Boolean).join(" · ") || undefined;
    const f = place(
      "bnpe",
      str(r.code_ouvrage),
      str(r.nom_ouvrage) ?? str(r.libelle_ouvrage),
      lon,
      lat,
      centre,
      radiusKm,
      { detail },
    );
    if (f) out.push(f);
  }
  return finalize(out);
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

interface LayerSpec {
  kind: LayerKind;
  url: (bbox: string) => string;
  revalidate: number;
  parse: (rows: unknown[], centre: { lat: number; lon: number }, radiusKm: number) => MapFeature[];
  /** message when the upstream service does not answer */
  down: string;
}

const SPECS: LayerSpec[] = [
  {
    kind: "hydro",
    url: (bbox) =>
      `${HYDRO_BASE}/referentiel/stations?bbox=${bbox}&format=json&size=${MAX_ROWS}` +
      `&fields=code_station,libelle_station,libelle_site,libelle_cours_eau,longitude_station,latitude_station,en_service`,
    revalidate: REFERENTIAL_REVALIDATE,
    parse: parseHydroStations,
    down: "Référentiel hydrométrique Hub'Eau indisponible.",
  },
  {
    kind: "piezo",
    url: (bbox) =>
      `${PIEZO_BASE}/stations?bbox=${bbox}&format=json&size=${MAX_ROWS}` +
      `&fields=code_bss,bss_id,libelle_pe,geometry,x,y,date_fin_mesure,codes_bdlisa`,
    revalidate: REFERENTIAL_REVALIDATE,
    parse: parsePiezoStations,
    down: "Référentiel piézométrique Hub'Eau indisponible.",
  },
  {
    kind: "onde",
    // Field list kept identical to the call proven in lib/onde.ts: Hub'Eau
    // answers 400 on an unknown `fields` entry, so this is not the place to
    // guess column names.
    url: (bbox) =>
      `${ONDE_BASE}/observations?bbox=${bbox}&date_observation_min=${daysAgoIso(ONDE_LOOKBACK_DAYS)}` +
      `&grandeur_hydro=ecoulement&size=${MAX_ROWS}&format=json` +
      `&fields=code_station,libelle_station,libelle_cours_eau,libelle_ecoulement,code_ecoulement,date_observation,longitude,latitude`,
    revalidate: OBSERVATION_REVALIDATE,
    parse: parseOndeObservations,
    down: "Observations ONDE indisponibles.",
  },
  {
    kind: "bnpe",
    url: (bbox) =>
      `${BNPE_BASE}/referentiel/ouvrages?bbox=${bbox}&size=${MAX_ROWS}&format=json` +
      `&fields=code_ouvrage,nom_ouvrage,longitude,latitude,libelle_type_milieu,code_type_milieu,libelle_usage_principal`,
    revalidate: REFERENTIAL_REVALIDATE,
    parse: parseBnpeOuvrages,
    down: "Référentiel BNPE des ouvrages indisponible.",
  },
];

/**
 * Fetch every layer around a point. Layers are independent on purpose: one
 * upstream outage must not empty the map. A layer that fails says so, in
 * French, next to the layers that succeeded — the same rule as the composite
 * score, where a missing component is absent and never a zero.
 */
export async function fetchMapLayers(input: {
  lat: number;
  lon: number;
  radiusKm: number;
}): Promise<MapLayers> {
  const centre = { lat: input.lat, lon: input.lon };
  const radiusKm = clampRadiusKm(input.radiusKm);
  const bbox = bboxAround(input.lat, input.lon, radiusKm);

  const results = await Promise.all(
    SPECS.map(async (spec) => {
      const rows = await hubeauJson(spec.url(bbox), spec.revalidate, UPSTREAM_TIMEOUT_MS);
      if (rows === null) return { spec, features: [] as MapFeature[], message: spec.down };
      try {
        return { spec, features: spec.parse(rows, centre, radiusKm), message: undefined };
      } catch {
        // An unexpected payload shape must cost its own layer, not the map.
        return { spec, features: [] as MapFeature[], message: spec.down };
      }
    }),
  );

  const features = { hydro: [], piezo: [], onde: [], bnpe: [] } as Record<LayerKind, MapFeature[]>;
  const messages: Partial<Record<LayerKind, string>> = {};
  for (const r of results) {
    features[r.spec.kind] = r.features;
    if (r.message) messages[r.spec.kind] = r.message;
  }
  return { centre, radiusKm, features, messages };
}
