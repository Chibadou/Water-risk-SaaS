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
// Reused rather than rewritten: the drinking-water test must agree with the
// aggregation lib/bnpe.ts already does elsewhere in the product.
import { normalizeUsage } from "./bnpe";

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
/** Default upstream page size. Overridden per layer where the network is denser. */
const MAX_ROWS = 500;
/**
 * ⚠️ Withdrawal structures are FAR denser than measurement networks — measured
 * end to end on the runner: a 10 km radius on Lyon already saturated a 500-row
 * page, so every single query came back truncated. `lib/bnpe.ts` has been
 * asking this same referential for `size=5000` since Sprint 10, so the page
 * size is known to be accepted.
 */
const BNPE_MAX_ROWS = 5000;
/**
 * ⚠️ The chronicles are one row PER YEAR AND PER STRUCTURE, so they are an order
 * of magnitude longer than the referential — measured: 16 566 rows around
 * Chartres and 18 214 around Perpignan, against 1 820 and 3 143 structures.
 * Asking for BNPE_MAX_ROWS here would silently lose the use of most structures,
 * which would then read "usage non renseigné" while their use is perfectly
 * published. No year filter: a structure that stopped declaring in 2015 still
 * has a known use.
 */
const BNPE_USAGE_MAX_ROWS = 20000;
/** Points kept per layer after ranking by distance — protects the browser. */
export const MAX_FEATURES_PER_LAYER = 300;

export const MIN_RADIUS_KM = 5;
export const MAX_RADIUS_KM = 100;
export const DEFAULT_RADIUS_KM = 30;

/**
 * Two very different kinds of incompleteness, which must not be worded the
 * same way:
 *
 * - UPSTREAM truncation — the referential filled a whole page and stopped on
 *   ITS ordering, which is not distance. We do not know what is missing, and
 *   points nearer than the ones displayed may be absent. Measured on a real
 *   60 km bbox around Chartres: the piezometry referential returned exactly
 *   500 rows. This one is a warning.
 * - OUR cap — more points were returned than a browser should draw, so we kept
 *   the closest `MAX_FEATURES_PER_LAYER`. Nothing is unknown here: everything
 *   dropped is farther than everything shown. This one is just a statement.
 */
const TRUNCATED_UPSTREAM =
  "trop de points dans cette zone pour être tous listés — réduisez le rayon pour une vue complète.";
const CAPPED_LOCAL = (n: number) => `${n} points les plus proches affichés.`;

/** Piezometers reporting nothing for this long are past sites, not live ones. */
const PIEZO_STALE_DAYS = 365;
/** ONDE campaigns are seasonal (May–Sept): a whole year keeps the last one. */
const ONDE_LOOKBACK_DAYS = 365;

/** Layers whose content is fetched per query (points around the address). */
export type LayerKind = "hydro" | "piezo" | "onde" | "bnpe" | "aep";
/** Layers served from embedded reference data (the milieux themselves). */
export type MilieuKind =
  | "nappes"
  | "coursEau"
  | "plansEau"
  | "bassinsVersants"
  | "grandsBassins";
export type LayerId = LayerKind | MilieuKind;

/**
 * The three questions the map answers, in the order a reader asks them. This
 * grouping is the point of the page: a station is not a source, and a borehole
 * is not a source either — one measures, the other takes.
 */
export type LayerGroup = "ressource" | "observation" | "prelevement";

export const LAYER_GROUPS: Array<{ id: LayerGroup; titre: string; sousTitre: string }> = [
  { id: "ressource", titre: "Où est l'eau", sousTitre: "les milieux qui portent la ressource" },
  { id: "observation", titre: "Qui la mesure", sousTitre: "les réseaux de suivi publics" },
  { id: "prelevement", titre: "Qui la prélève", sousTitre: "les ouvrages déclarés" },
];

export interface LayerSpecUi {
  id: LayerId;
  groupe: LayerGroup;
  label: string;
  color: string;
  /** how it is drawn — decides the legend swatch and the map layer type */
  forme: "point" | "ligne" | "surface";
  /**
   * Stroke style for a line layer. Read BOTH by the legend swatch and by the
   * map's `line-dasharray`: the pastille has to stay the actual drawing of the
   * layer, or the reader learns a legend that does not match the map.
   */
  trait?: "plein" | "tirets";
  /**
   * One or two sentences saying what the object IS. Shown in the page, not only
   * as a `title` attribute: a tooltip does not exist on a touch screen, which
   * is where the question « c'est quoi un piézomètre ? » actually gets asked.
   */
  description: string;
}

/**
 * Single registry for every layer, milieux included. Before this, groundwater
 * and rivers were two ad-hoc booleans threaded through the components while
 * points lived in a list — adding two layers that way would have made four.
 */
export const LAYERS: LayerSpecUi[] = [
  {
    id: "nappes",
    groupe: "ressource",
    label: "Nappes souterraines",
    color: "#38bdf8",
    forme: "surface",
    description:
      "L'eau contenue dans les roches sous vos pieds, dans laquelle on puise par forage. La carte montre les masses d'eau qui affleurent, c'est-à-dire celles qui touchent la surface quelque part ; les nappes profondes, situées sous d'autres couches, ne sont pas représentées.",
  },
  {
    id: "coursEau",
    groupe: "ressource",
    label: "Cours d'eau",
    color: "#0369a1",
    forme: "ligne",
    description:
      "Les rivières, au découpage de la directive européenne sur l'eau : chaque tronçon nommé est une « masse d'eau ». Le tracé est indicatif et non le lit exact ; les petits ruisseaux non découpés en masses d'eau n'y figurent pas.",
  },
  {
    id: "plansEau",
    groupe: "ressource",
    label: "Plans d'eau",
    color: "#0891b2",
    forme: "surface",
    description:
      "Lacs, étangs et retenues. Un plan d'eau est souvent le point de prélèvement réel d'un site industriel ou agricole, et une retenue stocke de l'eau pour la saison sèche. Seuls ceux d'au moins 5 hectares sont affichés, et 4 sur 10 n'ont pas de nom au référentiel.",
  },
  {
    id: "bassinsVersants",
    groupe: "ressource",
    label: "Bassins versants",
    color: "#a16207",
    forme: "ligne",
    trait: "plein",
    description:
      "Le territoire dont toutes les eaux de pluie convergent vers un même exutoire : c'est de cette surface-là que vient l'eau qui passe devant vous. La ligne dessinée est la ligne de partage des eaux, au sommet du relief — de part et d'autre, l'eau part vers deux rivières différentes. Les 6 190 bassins du référentiel BD Topage pavent le pays (médiane 67 km²) ; chacun porte le nom du tronçon de cours d'eau qu'il alimente. En vue France, seuls les plus grands sont tracés ; cherchez une adresse pour voir les petits.",
  },
  {
    id: "grandsBassins",
    groupe: "ressource",
    label: "Grands bassins",
    color: "#334155",
    forme: "ligne",
    trait: "tirets",
    description:
      "Les grandes circonscriptions de bassin (Seine-Normandie, Loire-Bretagne, Rhône-Méditerranée…). C'est le découpage qui décide : chaque bassin a son agence de l'eau, qui perçoit les redevances de prélèvement, finance les aides à la sobriété et adopte son SDAGE. Cliquer nomme l'agence dont dépend le point et donne son programme d'aides.",
  },
  {
    id: "hydro",
    groupe: "observation",
    label: "Stations de débit",
    color: "#0284c7",
    forme: "point",
    description:
      "Points de rivière équipés pour mesurer le débit, c'est-à-dire le volume d'eau qui passe par seconde. C'est la donnée qui dit si une rivière est basse. Une station proche de votre site ne mesure pas forcément l'eau que vous utilisez.",
  },
  {
    id: "piezo",
    groupe: "observation",
    label: "Piézomètres",
    color: "#7c3aed",
    forme: "point",
    description:
      "Tubes forés jusqu'à une nappe, où l'on mesure la hauteur de l'eau souterraine. Ils disent si la nappe se recharge ou se vide, ce qu'aucune observation de surface ne montre.",
  },
  {
    id: "onde",
    groupe: "observation",
    label: "Observations d'assecs",
    color: "#ea580c",
    forme: "point",
    description:
      "Réseau ONDE : chaque été, des observateurs de terrain notent à l'œil si un petit cours d'eau coule encore ou s'il est à sec. Le remplissage du point va du vert (écoulement visible) au violet (assec).",
  },
  {
    id: "aep",
    groupe: "prelevement",
    label: "Captages d'eau potable",
    color: "#2563eb",
    forme: "point",
    description:
      "Les ouvrages dont l'eau prélevée part vers le réseau d'eau potable. Si votre site est raccordé au réseau plutôt qu'à son propre forage, c'est de là que vient son eau. Un captage reste un point de prélèvement, pas une source : il puise dans une nappe ou une rivière voisine.",
  },
  {
    id: "bnpe",
    groupe: "prelevement",
    label: "Autres prélèvements",
    color: "#0f766e",
    forme: "point",
    description:
      "Les autres ouvrages déclarés à la BNPE — forages industriels, irrigation, refroidissement. Un ouvrage déclaré n'est pas un volume prélevé, et un ouvrage dessiné en translucide est positionné au centre de sa commune, pas sur l'ouvrage.",
  },
];

/** Registry entry by id — the legend and the map both read the same spec. */
export const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l])) as Record<
  LayerId,
  LayerSpecUi
>;

/** The per-query layers, in registry order — used to drive the fetches. */
export const POINT_LAYERS = LAYERS.filter(
  (l): l is LayerSpecUi & { id: LayerKind } => l.forme === "point",
);

export interface MapFeature {
  kind: LayerKind;
  code: string;
  /**
   * Secondary identifier, when the referential has two. Piezometry keys its
   * near-real-time chronicle on `bss_id` and its archive on `code_bss`: without
   * this, the popup state falls back to the slower, staler series.
   */
  altCode?: string;
  label: string;
  lon: number;
  lat: number;
  /** distance to the query centre, km, one decimal */
  distanceKm: number;
  /** one line of context shown in the popup — never a computed indicator */
  detail?: string;
  /**
   * Named characteristics for the popup. Every entry here comes from a column
   * observed in a real response (diag mode `carte2`) — Hub'Eau answers 400 on
   * an unknown `fields=` entry, and a plausible column name is not a column.
   */
  caracteristiques?: Array<{ label: string; valeur: string }>;
  /**
   * URL of the object's official record, when the referential publishes one.
   * ⚠️ Never built from a URL pattern: only fields actually seen in a response
   * (`urn_bss` for piezometers — an http URL despite its name, `uri_station`
   * for ONDE, `uri_ouvrage` for BNPE). Hydrometry publishes no station URI, so
   * flow stations simply have no link.
   */
  fiche?: string;
  /** ONDE only: 0-100 flow severity, drives the marker colour */
  severity?: number;
  /**
   * BNPE only: true when the published position is the COMMUNE CENTROID rather
   * than the structure itself. The referential says so in
   * `libelle_precision_coord`, and a third of the sampled rows around Chartres
   * are in that case. Drawing them like surveyed points would put a borehole in
   * a town square and let the reader believe it.
   */
  approximate?: boolean;
  /**
   * Objects published at this EXACT same position. The BNPE gives a share of
   * its structures the centroid of their commune, so every structure of one
   * commune lands on one pixel and hides the others — measured on the real
   * payload, and the reason this field exists.
   *
   * They are merged into one marker carrying the count rather than spread out
   * in a petal: the position is administrative, and scattering it would draw
   * positions the referential does not publish. Present only when > 1 object
   * shares the spot.
   */
  groupe?: {
    total: number;
    membres: Array<{ code: string; label: string; detail?: string }>;
  };
}

export interface MapLayers {
  centre: { lat: number; lon: number };
  radiusKm: number;
  features: Record<LayerKind, MapFeature[]>;
  /**
   * Objects found per layer, BEFORE merging co-located ones into single
   * markers. The UI counter reads structures, not markers — after grouping,
   * `features[kind].length` would silently turn "300 ouvrages" into
   * "120 marqueurs" and the reader would never know.
   */
  totals: Record<LayerKind, number>;
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
 * Position key for merging co-located objects. 5 decimals ≈ 1 m: two surveyed
 * structures never land on the same metre, two centroids of the same commune
 * always do. Coarser rounding would merge genuinely distinct neighbours.
 */
function positionKey(f: MapFeature): string {
  return `${f.lon.toFixed(5)},${f.lat.toFixed(5)}`;
}

/**
 * Common tail of every parser: drop features without usable coordinates,
 * enforce the radius (a bbox is a square, the user asked for a disc), dedupe on
 * code, merge objects sharing one position, and keep the closest markers.
 *
 * ⚠️ A row without coordinates is DROPPED, never defaulted to 0/0 — that would
 * put a station in the Gulf of Guinea and read as real.
 *
 * ⚠️ Order matters: grouping happens BEFORE the cap. Capping first would spend
 * the 300 slots on duplicates of a few communes and drop whole communes that
 * are nearer — the cap must count markers, not hidden objects.
 */
function finalize(features: MapFeature[]): MapFeature[] {
  const byCode = new Map<string, MapFeature>();
  for (const f of features) {
    const seen = byCode.get(f.code);
    if (!seen || f.distanceKm < seen.distanceKm) byCode.set(f.code, f);
  }
  const unique = [...byCode.values()].sort((a, b) => a.distanceKm - b.distanceKm);

  const byPosition = new Map<string, MapFeature[]>();
  for (const f of unique) {
    const key = positionKey(f);
    const bucket = byPosition.get(key);
    if (bucket) bucket.push(f);
    else byPosition.set(key, [f]);
  }

  const markers: MapFeature[] = [];
  for (const bucket of byPosition.values()) {
    // The bucket inherits the closest object's identity (unique is sorted), so
    // a grouped marker still reads as a real object rather than a blank pin.
    const head = bucket[0]!;
    if (bucket.length === 1) {
      markers.push(head);
      continue;
    }
    markers.push({
      ...head,
      groupe: {
        total: bucket.length,
        membres: bucket.map((f) => ({ code: f.code, label: f.label, detail: f.detail })),
      },
    });
  }

  return markers.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, MAX_FEATURES_PER_LAYER);
}

/**
 * How many OBJECTS these markers stand for — a grouped marker counts for all
 * its members. This is what the layer counter must show: the reader of
 * "Ouvrages de prélèvement (312)" is counting structures, not pins.
 */
export function countObjects(features: MapFeature[]): number {
  return features.reduce((sum, f) => sum + (f.groupe?.total ?? 1), 0);
}

function place(
  kind: LayerKind,
  code: string | undefined,
  label: string | undefined,
  lon: number | undefined,
  lat: number | undefined,
  centre: { lat: number; lon: number },
  radiusKm: number,
  extra?: {
    detail?: string;
    severity?: number;
    approximate?: boolean;
    caracteristiques?: Array<{ label: string; valeur: string | undefined }>;
    fiche?: string;
    altCode?: string;
  },
): MapFeature | undefined {
  if (!code || lon === undefined || lat === undefined) return undefined;
  // Hub'Eau occasionally carries 0/0 for an unpositioned object; it is the
  // Atlantic, not a station.
  if (lon === 0 && lat === 0) return undefined;
  const distanceKm = haversineKm(centre.lat, centre.lon, lat, lon);
  if (distanceKm > radiusKm) return undefined;
  // A characteristic whose value is missing is DROPPED, never rendered as an
  // empty row or a dash: "Profondeur : —" reads like a measured absence.
  const caracteristiques = extra?.caracteristiques
    ?.filter((c): c is { label: string; valeur: string } => Boolean(c.valeur))
    .slice(0, 6);
  return {
    kind,
    code,
    label: label ?? code,
    lon,
    lat,
    distanceKm: Math.round(distanceKm * 10) / 10,
    ...extra,
    caracteristiques: caracteristiques && caracteristiques.length > 0 ? caracteristiques : undefined,
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
      {
        detail: str(r.libelle_cours_eau) ?? str(r.libelle_site),
        // ⚠️ Hydrometry publishes `uri_cours_eau` (the river) but NO station
        // URI — so these markers get no "official record" link rather than a
        // fabricated hydro.eaufrance.fr URL.
        caracteristiques: [
          { label: "Cours d'eau", valeur: str(r.libelle_cours_eau) },
          { label: "Commune", valeur: str(r.libelle_commune) },
          { label: "Département", valeur: str(r.libelle_departement) },
          { label: "Type de station", valeur: str(r.type_station) },
          { label: "En service depuis", valeur: str(r.date_ouverture_station)?.slice(0, 10) },
          { label: "Altitude", valeur: fmtNumber(num(r.altitude_ref_alti_station), "m") },
        ],
      },
    );
    if (f) out.push(f);
  }
  return finalize(out);
}

/** `${value} ${unit}` with a French decimal comma, or undefined when absent. */
function fmtNumber(value: number | undefined, unit: string, digits = 0): string | undefined {
  if (value === undefined) return undefined;
  return `${value.toFixed(digits).replace(".", ",")} ${unit}`;
}

/**
 * Keep only values that really are http(s) links. Some referentials name a
 * column `urn_*` while publishing a URL, and others do the reverse — the value
 * decides, not the column name. Anything else yields no link at all.
 */
function httpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : undefined;
}

/** "du 1963-01-01 au 2026-07-30" → a readable French measurement period. */
function fmtPeriode(debut?: string, fin?: string): string | undefined {
  const d = debut?.slice(0, 10);
  const f = fin?.slice(0, 10);
  if (!d && !f) return undefined;
  if (d && f) return `${d} → ${f}`;
  return d ?? f;
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
    // The referential names the groundwater body the piezometer monitors — the
    // single most useful thing to show next to a code like "121AS01".
    const masses = Array.isArray(r.noms_masse_eau_edl) ? r.noms_masse_eau_edl.map(String) : [];
    const f = place("piezo", str(r.code_bss), str(r.libelle_pe), lon, lat, centre, radiusKm, {
      altCode: str(r.bss_id),
      detail: masses[0] ?? (aquifers.length > 0 ? `Aquifère BDLISA ${aquifers[0]}` : undefined),
      caracteristiques: [
        { label: "Masse d'eau", valeur: masses[0] },
        { label: "Aquifère BDLISA", valeur: aquifers[0] },
        { label: "Commune", valeur: str(r.nom_commune) },
        { label: "Profondeur d'investigation", valeur: fmtNumber(num(r.profondeur_investigation), "m", 1) },
        { label: "Altitude", valeur: fmtNumber(num(r.altitude_station), "m") },
        { label: "Mesures", valeur: fmtPeriode(str(r.date_debut_mesure), str(r.date_fin_mesure)) },
      ],
      // ⚠️ Named `urn_bss`, but the observed value is an http URL to the ADES
      // record — verified in a real response, not assumed from the name.
      fiche: httpUrl(str(r.urn_bss)),
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
        caracteristiques: [
          { label: "Écoulement observé", valeur: str(r.libelle_ecoulement) },
          { label: "Date d'observation", valeur: date },
          { label: "Cours d'eau", valeur: str(r.libelle_cours_eau) },
          { label: "Commune", valeur: str(r.libelle_commune) },
          { label: "Bassin", valeur: str(r.libelle_bassin) },
          { label: "Réseau", valeur: str(r.libelle_reseau) },
        ],
        fiche: httpUrl(str(r.uri_station)),
      },
    );
    if (f) out.push(f);
  }
  return finalize(out);
}

/**
 * BNPE withdrawal structures.
 *
 * ⚠️ Two things measured on the real referential (diag mode `carte`, Chartres)
 * before a line of this was written — HANDBOOK item 8 bis said the endpoint had
 * never been investigated:
 *   1. `longitude`/`latitude` DO exist, plus a CRS84 `geometry`. The layer is
 *      buildable, and the item is closed.
 *   2. The referential grades its own positions in `libelle_precision_coord`,
 *      and value "5" is literally « Coordonnées du centroïde de la commune ».
 *      Those points say where the town hall is, not where the pump is. They are
 *      kept — hiding a declared withdrawal is worse — but flagged, so the map
 *      can draw them differently and the popup can say it.
 * There is no usage column here (verified against the full key list): usage
 * lives on the chronicles, which lib/bnpe.ts already aggregates elsewhere.
 */
/**
 * Usage of each withdrawal structure, read off the BNPE CHRONICLES.
 *
 * ⚠️ The ouvrages referential carries no usage column (verified in Sprint 30):
 * the use is published per year of abstraction, so it is reached by joining on
 * `code_ouvrage`. A structure absent from this map has an **unknown** use — not
 * "another" use. That distinction is the whole reason this returns a Map with
 * holes rather than a default.
 */
export function parseUsageByOuvrage(rows: unknown[]): Map<string, string> {
  const byCode = new Map<string, { annee: number; usage: string }>();
  for (const raw of rows) {
    const r = row(raw);
    if (!r) continue;
    const code = str(r.code_ouvrage);
    const usage = str(r.libelle_usage);
    if (!code || !usage) continue;
    const annee = num(r.annee) ?? 0;
    const seen = byCode.get(code);
    // The most recent declared year wins: a borehole can change use over time.
    if (!seen || annee > seen.annee) byCode.set(code, { annee, usage });
  }
  return new Map([...byCode].map(([code, v]) => [code, v.usage]));
}

/**
 * Last declared abstraction of ONE structure, from its BNPE chronicles.
 *
 * ⚠️ A volume is a PRESSURE on the resource, not a state of it — and the
 * declaration lags: the most recent year published nationally is typically two
 * to three years old (2023 at the time of writing, measured by the `carte3`
 * diag). The year therefore travels with the volume and is never dropped, so an
 * old figure cannot be mistaken for a current one.
 * ⚠️ A volume ≤ 0 is ignored — the same rule `lib/bnpe.ts` already applies — and
 * no chronicle at all means ABSENT, never 0 m³.
 */
export interface VolumeOuvrage {
  annee: number;
  volumeM3: number;
  usage?: string;
}

export function parseVolumesOuvrage(rows: unknown[]): VolumeOuvrage | undefined {
  let best: VolumeOuvrage | undefined;
  for (const raw of rows) {
    const r = row(raw);
    if (!r) continue;
    const annee = num(r.annee);
    const volumeM3 = num(r.volume);
    if (annee === undefined || volumeM3 === undefined || volumeM3 <= 0) continue;
    if (!best || annee > best.annee) best = { annee, volumeM3, usage: str(r.libelle_usage) };
  }
  return best;
}

/** True when the raw BNPE label designates drinking water. */
function isEauPotable(usage: string | undefined): boolean {
  if (!usage) return false;
  // `normalizeUsage` answers "Autres" on an empty label, so it is only ever
  // called on a label we actually have.
  return normalizeUsage(usage) === "Eau potable";
}

export function parseBnpeOuvrages(
  rows: unknown[],
  centre: { lat: number; lon: number },
  radiusKm: number,
  /** usage per `code_ouvrage`, from `parseUsageByOuvrage`; absent = unknown */
  usageByCode?: Map<string, string>,
): { aep: MapFeature[]; autres: MapFeature[] } {
  const out: MapFeature[] = [];
  for (const raw of rows) {
    const r = row(raw);
    if (!r) continue;
    const geom = row(r.geometry);
    const coords = Array.isArray(geom?.coordinates) ? geom.coordinates : undefined;
    const lon = num(r.longitude) ?? (coords ? num(coords[0]) : undefined);
    const lat = num(r.latitude) ?? (coords ? num(coords[1]) : undefined);
    const milieu = str(r.libelle_type_milieu);
    const precision = str(r.libelle_precision_coord);
    const approximate = str(r.code_precision_coord) === "5" || /centro[iï]de/i.test(precision ?? "");
    const code = str(r.code_ouvrage);
    const usage = code ? usageByCode?.get(code) : undefined;
    const potable = isEauPotable(usage);
    const detail = [milieu, approximate ? `⚠️ position approchée : ${precision}` : undefined]
      .filter(Boolean)
      .join(" · ") || undefined;
    const f = place(
      potable ? "aep" : "bnpe",
      code,
      str(r.nom_ouvrage),
      lon,
      lat,
      centre,
      radiusKm,
      {
        detail,
        approximate: approximate || undefined,
        caracteristiques: [
          // ⚠️ « Usage non renseigné » and never « autre usage » : the join
          // reaches only part of the referential, and an unreached structure
          // has an unknown use, not a different one.
          { label: "Usage", valeur: usage ?? "non renseigné" },
          { label: "Milieu prélevé", valeur: milieu },
          { label: "Commune", valeur: str(r.nom_commune) },
          { label: "Département", valeur: str(r.libelle_departement) },
          { label: "Exploité depuis", valeur: str(r.date_exploitation_debut)?.slice(0, 10) },
          { label: "Précision de la position", valeur: precision },
        ],
        fiche: httpUrl(str(r.uri_ouvrage)),
      },
    );
    if (f) out.push(f);
  }
  // ⚠️ Split BEFORE grouping: a drinking-water catchment and an industrial
  // borehole published at the same commune centroid are two different answers
  // to "where does my water come from", and merging them would erase that.
  return {
    aep: finalize(out.filter((f) => f.kind === "aep")),
    autres: finalize(out.filter((f) => f.kind === "bnpe")),
  };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

interface LayerSpec {
  kind: LayerKind;
  /** French name, reused in the truncation message */
  label: string;
  /** upstream page size for this layer */
  maxRows: number;
  url: (bbox: string) => string;
  revalidate: number;
  parse: (rows: unknown[], centre: { lat: number; lon: number }, radiusKm: number) => MapFeature[];
  /** message when the upstream service does not answer */
  down: string;
}

/**
 * BNPE is handled apart from SPECS: it is the only layer needing a second call
 * (the chronicles, for the use) and the only one producing TWO layers from one
 * fetch. Folding that into the generic list would have made the list lie about
 * itself.
 */
const BNPE_SPEC = {
  label: "Ouvrages de prélèvement",
  maxRows: BNPE_MAX_ROWS,
  url: (bbox: string) =>
    `${BNPE_BASE}/referentiel/ouvrages?bbox=${bbox}&size=${BNPE_MAX_ROWS}&format=json` +
    `&fields=code_ouvrage,nom_ouvrage,longitude,latitude,geometry,libelle_type_milieu,code_type_milieu,` +
    `code_precision_coord,libelle_precision_coord,nom_commune,libelle_departement,` +
    `date_exploitation_debut,date_exploitation_fin,uri_ouvrage`,
  // The chronicles carry the use. Asked for the same bbox, minimal fields.
  usageUrl: (bbox: string) =>
    `${BNPE_BASE}/chroniques?bbox=${bbox}&size=${BNPE_USAGE_MAX_ROWS}&format=json` +
    `&fields=code_ouvrage,libelle_usage,annee`,
  down: "Référentiel BNPE des ouvrages indisponible.",
};

const SPECS: LayerSpec[] = [
  {
    kind: "hydro",
    label: "Stations de débit",
    maxRows: MAX_ROWS,
    url: (bbox) =>
      `${HYDRO_BASE}/referentiel/stations?bbox=${bbox}&format=json&size=${MAX_ROWS}` +
      `&fields=code_station,libelle_station,libelle_site,libelle_cours_eau,libelle_commune,libelle_departement,` +
      `type_station,date_ouverture_station,altitude_ref_alti_station,longitude_station,latitude_station,en_service`,
    revalidate: REFERENTIAL_REVALIDATE,
    parse: parseHydroStations,
    down: "Référentiel hydrométrique Hub'Eau indisponible.",
  },
  {
    kind: "piezo",
    label: "Piézomètres",
    maxRows: MAX_ROWS,
    url: (bbox) =>
      `${PIEZO_BASE}/stations?bbox=${bbox}&format=json&size=${MAX_ROWS}` +
      `&fields=code_bss,bss_id,libelle_pe,geometry,x,y,date_debut_mesure,date_fin_mesure,codes_bdlisa,` +
      `noms_masse_eau_edl,nom_commune,nom_departement,altitude_station,profondeur_investigation,urn_bss`,
    revalidate: REFERENTIAL_REVALIDATE,
    parse: parsePiezoStations,
    down: "Référentiel piézométrique Hub'Eau indisponible.",
  },
  {
    kind: "onde",
    label: "Observations ONDE",
    maxRows: MAX_ROWS,
    // ⚠️ NO `fields=` here on purpose. Hub'Eau answers 400 on an unknown field,
    // and the diag only enumerated the columns of `/ecoulement/stations`, not
    // of `/observations`. The map needs a station label, which the proven call
    // in lib/onde.ts does not request — so rather than guess a column name, we
    // take the full record. The cost is server-side bandwidth only: the client
    // receives parsed features either way.
    url: (bbox) =>
      `${ONDE_BASE}/observations?bbox=${bbox}&date_observation_min=${daysAgoIso(ONDE_LOOKBACK_DAYS)}` +
      `&grandeur_hydro=ecoulement&size=${MAX_ROWS}&format=json`,
    revalidate: OBSERVATION_REVALIDATE,
    parse: parseOndeObservations,
    down: "Observations ONDE indisponibles.",
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

  // Withdrawal structures need two calls (referential + chronicles for the use)
  // and yield two layers, so they run alongside the generic ones rather than
  // inside them.
  const bnpePromise = (async () => {
    const [rows, usageRows] = await Promise.all([
      hubeauJson(BNPE_SPEC.url(bbox), REFERENTIAL_REVALIDATE, UPSTREAM_TIMEOUT_MS),
      hubeauJson(BNPE_SPEC.usageUrl(bbox), REFERENTIAL_REVALIDATE, UPSTREAM_TIMEOUT_MS),
    ]);
    if (rows === null) return null;
    // ⚠️ A failed chronicles call costs the USE, not the layer: every structure
    // then reads "usage non renseigné" and none is claimed to be a catchment.
    const usageByCode = usageRows === null ? undefined : parseUsageByOuvrage(usageRows);
    return {
      truncated: rows.length >= BNPE_SPEC.maxRows,
      // A full chronicles page means some structures lost their use to
      // truncation, not that they have none.
      usageTruncated: usageRows !== null && usageRows.length >= BNPE_USAGE_MAX_ROWS,
      split: parseBnpeOuvrages(rows, centre, radiusKm, usageByCode),
      usageKnown: usageByCode !== undefined,
    };
  })();

  const results = await Promise.all(
    SPECS.map(async (spec) => {
      const rows = await hubeauJson(spec.url(bbox), spec.revalidate, UPSTREAM_TIMEOUT_MS);
      if (rows === null) return { spec, features: [] as MapFeature[], message: spec.down };
      const truncatedUpstream = rows.length >= spec.maxRows;
      try {
        const features = spec.parse(rows, centre, radiusKm);
        // Upstream truncation hides unknown points; our own cap only hides
        // farther ones. Two different facts, two different sentences.
        const message = truncatedUpstream
          ? `${spec.label} : ${TRUNCATED_UPSTREAM}`
          : features.length >= MAX_FEATURES_PER_LAYER
            ? `${spec.label} : ${CAPPED_LOCAL(MAX_FEATURES_PER_LAYER)}`
            : undefined;
        // The cap counts MARKERS; the counter shown to the reader counts
        // objects. Both are true, and they differ as soon as a commune
        // publishes several structures at one centroid.
        return { spec, features, message };
      } catch {
        // An unexpected payload shape must cost its own layer, not the map.
        return { spec, features: [] as MapFeature[], message: spec.down };
      }
    }),
  );

  const features = { hydro: [], piezo: [], onde: [], bnpe: [], aep: [] } as Record<
    LayerKind,
    MapFeature[]
  >;
  const totals = { hydro: 0, piezo: 0, onde: 0, bnpe: 0, aep: 0 } as Record<LayerKind, number>;
  const messages: Partial<Record<LayerKind, string>> = {};
  for (const r of results) {
    features[r.spec.kind] = r.features;
    totals[r.spec.kind] = countObjects(r.features);
    if (r.message) messages[r.spec.kind] = r.message;
  }

  const bnpe = await bnpePromise;
  if (bnpe === null) {
    messages.bnpe = BNPE_SPEC.down;
  } else {
    features.aep = bnpe.split.aep;
    features.bnpe = bnpe.split.autres;
    totals.aep = countObjects(bnpe.split.aep);
    totals.bnpe = countObjects(bnpe.split.autres);
    if (bnpe.truncated) {
      messages.bnpe = `${BNPE_SPEC.label} : ${TRUNCATED_UPSTREAM}`;
    } else if (bnpe.split.autres.length >= MAX_FEATURES_PER_LAYER) {
      messages.bnpe = `${BNPE_SPEC.label} : ${CAPPED_LOCAL(MAX_FEATURES_PER_LAYER)}`;
    }
    if (!bnpe.usageKnown) {
      messages.aep =
        "Usage des ouvrages indisponible : aucun captage d'eau potable ne peut être distingué ici.";
    } else if (bnpe.usageTruncated) {
      messages.aep =
        "Usages trop nombreux dans cette zone : certains ouvrages apparaissent sans usage alors qu'ils en ont un.";
    }
  }

  return { centre, radiusKm, features, totals, messages };
}
