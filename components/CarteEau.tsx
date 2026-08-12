"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { Map as MaplibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  LAYERS,
  LAYER_BY_ID,
  POINT_LAYERS,
  type LayerId,
  type MapFeature,
  type MapLayers,
} from "@/lib/carteEau";
import { BASSINS, bassinInfo } from "@/lib/bassins";
import { GRAVITE } from "@/lib/gravite";
import { scoreColor } from "@/lib/score";
import { sparklineSvg } from "@/lib/sparkline";

const FRANCE_CENTER: [number, number] = [2.5, 46.6];
const FRANCE_ZOOM = 4.8;

const COLOR = Object.fromEntries(LAYERS.map((l) => [l.id, l.color])) as Record<LayerId, string>;

/** ONDE marker colour by observed flow severity — the one layer whose points
 *  carry a state, not just a position. Same palette as the gravity scale so a
 *  reader of the site sheet is not learning a second colour language. */
const ONDE_COLOR: maplibregl.ExpressionSpecification = [
  "case",
  ["!", ["has", "severity"]],
  "#94a3b8", // unreadable observation: grey, never the colour of a healthy stream
  [">=", ["get", "severity"], 100],
  "#8e24aa", // assec
  [">=", ["get", "severity"], 65],
  "#e53935", // écoulement non visible
  [">=", ["get", "severity"], 30],
  "#fb8c00", // faible
  "#16a34a", // visible
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Popup body for one map object. Everything here is escaped: the labels come
 * from public APIs, i.e. from text this app does not control.
 *
 * MapLibre serialises GeoJSON properties, so nested objects arrive as JSON
 * strings — hence the parse helpers rather than a direct property read.
 */
function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== "string") return (value as T) ?? undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

const T = {
  title: 'font:600 13px system-ui;color:#0f172a',
  sub: 'font:12px system-ui;color:#64748b;margin-top:2px',
  body: 'font:12px system-ui;color:#475569;margin-top:6px',
  key: 'color:#94a3b8',
  link: 'display:inline-block;margin-top:8px;font:600 12px system-ui;color:#0369a1;text-decoration:underline',
};

/**
 * The placeholder the state lands in. The identity of an object is known the
 * instant it is clicked; its state costs an upstream call, so the popup opens
 * immediately and fills in.
 */
const ETAT_SLOT = `<div data-etat style="${T.body};border-top:1px solid #e2e8f0;margin-top:8px;padding-top:6px">` +
  `<span style="${T.key}">Chargement de l'état…</span></div>`;

/** Trend as an arrow AND a label — never a symbol alone, and never a colour
 *  alone. `higherIsBetter` flips the meaning: for a groundwater DEPTH, a rise
 *  is a degradation (same inversion as SiteIndicators.resourceTrend). */
function trendHtml(trend: string | undefined, higherIsBetter: boolean): string {
  if (!trend) return "";
  const t = higherIsBetter ? trend : trend === "hausse" ? "baisse" : trend === "baisse" ? "hausse" : trend;
  const map: Record<string, [string, string]> = {
    hausse: ["↗", "en hausse sur 14 j"],
    baisse: ["↘", "en baisse sur 14 j"],
    stable: ["→", "stable sur 14 j"],
  };
  const found = map[t];
  if (!found) return "";
  return `<span style="${T.key}"> · ${found[0]} ${escapeHtml(found[1])}</span>`;
}

function nombreFr(value: number, unit: string): string {
  // Groundwater metres deserve centimetres; flows scale with magnitude — the
  // same rule as the site sheet, so both read alike.
  const piezo = unit.includes("NGF") || unit.includes("profondeur");
  const digits = piezo ? 2 : Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: digits })} ${unit}`.trim();
}

/** Build the state block from what /api/carte/etat answered. */
function etatHtml(data: Record<string, unknown>, couleur: string): string {
  if (!data.disponible) {
    return `<span style="${T.key}">${escapeHtml(String(data.message ?? "État indisponible."))}</span>`;
  }

  if (data.type === "station") {
    const latest = data.latest as { date: string; value: number };
    const unit = String(data.unit ?? "");
    const higherIsBetter = data.higherIsBetter !== false;
    const reference = data.reference as { score: number; label: string; detail: string; years: number } | undefined;
    const series = (data.series as Array<{ date: string; value: number }>) ?? [];
    return (
      `<div style="font:600 13px system-ui;color:#0f172a">${escapeHtml(nombreFr(latest.value, unit))}` +
        trendHtml(data.trend as string | undefined, higherIsBetter) +
      `</div>` +
      `<div style="${T.key};margin-top:1px">${escapeHtml(String(data.grandeur ?? ""))} · ${escapeHtml(latest.date)}</div>` +
      (data.secondary
        ? `<div style="${T.key};margin-top:2px">⚠️ Signal secondaire : hauteur d'eau, moins comparable qu'un débit.</div>`
        : "") +
      (reference
        ? `<div style="margin-top:6px">` +
          `<span style="display:inline-block;padding:1px 6px;border-radius:9px;color:#fff;font:600 11px system-ui;background:${scoreColor(reference.score)}">${reference.score}/100</span> ` +
          `<span style="font:600 12px system-ui;color:#0f172a">${escapeHtml(reference.label)}</span>` +
          `<div style="${T.key};margin-top:1px">${escapeHtml(reference.detail)} · ${reference.years} ans de recul</div>` +
          `</div>`
        : `<div style="${T.key};margin-top:4px">${escapeHtml(String(data.referenceMessage ?? "Référence non disponible."))}</div>`) +
      (series.length > 1
        ? `<div style="margin-top:4px">${sparklineSvg(series, couleur, "35 derniers jours")}</div>`
        : "")
    );
  }

  if (data.type === "prelevement") {
    const v = data.volume as { annee: number; volumeM3: number; usage?: string };
    return (
      `<div style="font:600 13px system-ui;color:#0f172a">${v.volumeM3.toLocaleString("fr-FR")} m³` +
      `<span style="${T.key}"> en ${v.annee}</span></div>` +
      (v.usage ? `<div style="${T.key};margin-top:1px">${escapeHtml(v.usage)}</div>` : "") +
      // ⚠️ Said in the popup, not only in the docs: a volume is a pressure on
      // the resource, and a declared one is years old.
      `<div style="${T.key};margin-top:3px">Volume déclaré : une pression sur la ressource, pas son état — et la déclaration a plusieurs années de retard.</div>`
    );
  }

  if (data.type === "reglementaire") {
    const niveau = data.niveau as string | null;
    const info = niveau ? GRAVITE[niveau as keyof typeof GRAVITE] : undefined;
    return (
      (info
        ? `<div><span style="display:inline-block;padding:1px 6px;border-radius:9px;font:600 11px system-ui;color:#0f172a;background:${info.color}">${escapeHtml(info.label)}</span></div>` +
          `<div style="${T.key};margin-top:2px">${escapeHtml(info.description)}</div>`
        : `<div style="font:600 13px system-ui;color:#0f172a">Aucune restriction en vigueur</div>`) +
      // ⚠️ The distinction that matters: this is the state of the ZONE under an
      // arrêté, not the physical state of the water body — which has no
      // national open-data equivalent (Sprint 27).
      `<div style="${T.key};margin-top:3px">État réglementaire de la zone au point cliqué, pas l'état physique de la masse d'eau.</div>` +
      // ⚠️ Anti-pattern n°1, on the map. A point has no usage vector, so the
      // colour IS the most severe of the covering zones — a legitimate default,
      // and one the popup must not let pass for a reading of a given abstraction.
      // A factory on the mains here is coloured by an aquifer it may never pump.
      (data.degrade
        ? `<div style="${T.key};margin-top:3px">Niveau le <b>plus sévère</b> des zones couvrantes (superficielle, souterraine, eau potable). Un site raccordé au réseau n'est pas forcément soumis à celui de la nappe : la fiche site pondère par la répartition des usages.</div>`
        : "") +
      (data.ambigu
        ? `<div style="${T.key};margin-top:3px">⚠️ Plusieurs zones d'alerte du même type couvrent ce point : le rattachement est ambigu et n'est pas tranché ici.</div>`
        : "")
    );
  }

  return `<span style="${T.key}">État indisponible.</span>`;
}

function popupHtml(p: Record<string, unknown>, lon: number, lat: number): string {
  const label = String(p.label ?? p.code ?? "");
  const caracteristiques =
    parseJson<Array<{ label: string; valeur: string }>>(p.caracteristiques) ?? [];
  const groupe = parseJson<{
    total: number;
    membres: Array<{ code: string; label: string; detail?: string }>;
  }>(p.groupe);
  const fiche = typeof p.fiche === "string" && p.fiche ? p.fiche : undefined;

  const rows = caracteristiques
    .map(
      (c) =>
        `<div style="margin-top:2px"><span style="${T.key}">${escapeHtml(c.label)}</span> : ${escapeHtml(c.valeur)}</div>`,
    )
    .join("");

  // A grouped marker stands for several objects published at one position.
  // Listing them is the whole point: the count alone would say "something is
  // hidden here" without saying what.
  const members = groupe
    ? `<div style="${T.body}">` +
      `<div style="font-weight:600;color:#0f172a">${groupe.total} objets à cette position</div>` +
      `<div style="${T.key};margin-top:2px">Position publiée au centre de la commune : le référentiel ne situe pas ces objets individuellement.</div>` +
      `<ul style="margin:6px 0 0 0;padding-left:16px;max-height:150px;overflow:auto">` +
      groupe.membres
        .map(
          (m) =>
            `<li style="margin-bottom:3px">${escapeHtml(m.label)}<br><span style="${T.key}">${escapeHtml(m.code)}</span></li>`,
        )
        .join("") +
      `</ul></div>`
    : "";

  const detail = !groupe && p.detail ? String(p.detail) : "";
  const analyse = `/?lat=${lat}&lon=${lon}&label=${encodeURIComponent(label)}`;

  return (
    `<div style="${T.title}">${escapeHtml(label)}</div>` +
    `<div style="${T.sub}">${escapeHtml(String(p.code ?? ""))} · à ${escapeHtml(String(p.distanceKm ?? "?"))} km</div>` +
    (rows ? `<div style="${T.body}">${rows}</div>` : detail ? `<div style="${T.body}">${escapeHtml(detail)}</div>` : "") +
    members +
    ETAT_SLOT +
    `<div><a href="${analyse}" style="${T.link}">Analyser ce point →</a></div>` +
    (fiche
      ? `<div><a href="${escapeHtml(fiche)}" target="_blank" rel="noopener noreferrer" style="${T.link}">Fiche officielle ↗</a></div>`
      : "")
  );
}

/** Popup for a groundwater body polygon. Several can overlap on a shared edge:
 *  all of them are listed rather than one being picked at random. */
function nappePopupHtml(features: Array<Record<string, unknown>>): string {
  return features
    .slice(0, 3)
    .map((p) => {
      const surface = Number(p.surfaceKm2);
      const affleurante = Number(p.surfaceAffleuranteKm2);
      const lignes = [
        Number.isFinite(surface)
          ? `<div style="margin-top:2px"><span style="${T.key}">Surface totale</span> : ${surface.toLocaleString("fr-FR")} km²</div>`
          : "",
        Number.isFinite(affleurante)
          ? `<div style="margin-top:2px"><span style="${T.key}">Dont affleurante</span> : ${affleurante.toLocaleString("fr-FR")} km²</div>`
          : "",
      ].join("");
      return (
        `<div style="${T.title}">${escapeHtml(String(p.nom ?? "Masse d'eau souterraine"))}</div>` +
        `<div style="${T.sub}">Masse d'eau ${escapeHtml(String(p.code ?? ""))}</div>` +
        `<div style="${T.body}">${lignes}</div>`
      );
    })
    .join(`<hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0">`);
}

/** Popup section for the watershed under the click. */
function bassinVersantHtml(p: Record<string, unknown>): string {
  const nom = String(p.nom ?? "").trim();
  const surface = Number(p.surfaceKm2);
  return (
    // ⚠️ The name is that of the REACH this basin drains, not a name given to
    // the basin itself — the referential publishes one toponym per hydrographic
    // object (measured: 6 190 / 6 190 basins named). Saying so is the
    // difference between a reader who understands the label and one who thinks
    // the map has mixed up rivers and territories.
    `<div style="${T.title}">${escapeHtml(nom || "Bassin versant")}</div>` +
    `<div style="${T.sub}">Bassin versant du tronçon nommé ci-dessus</div>` +
    (Number.isFinite(surface)
      ? `<div style="${T.body}"><span style="${T.key}">Surface drainée</span> : ${surface.toLocaleString("fr-FR")} km²</div>`
      : "") +
    `<div style="${T.body};${T.key}">Le territoire dont toutes les eaux convergent vers ce tronçon. ` +
    `Découpage topographique : ce n'est pas le périmètre d'application d'un arrêté sécheresse.</div>`
  );
}

/** Popup section for the DCE basin district, i.e. the agence de l'eau. */
function grandBassinHtml(p: Record<string, unknown>): string {
  const code = String(p.code ?? "").trim();
  const info = bassinInfo(code);
  const nom = String(p.nom ?? "").trim() || info?.nom || "Bassin";
  return (
    `<div style="${T.title}">${escapeHtml(nom)}</div>` +
    `<div style="${T.sub}">Circonscription de bassin ${escapeHtml(code)}</div>` +
    // The whole point of this layer: the perimeter that carries a decision.
    // ⚠️ When the code is not one of the nine metropolitan basins (the DOM
    // districts are in the same referential), no agency is named rather than a
    // wrong one — bassinInfo returns nothing and this block simply disappears.
    // ⚠️ No explanatory sentence here. Three stacked sections already fill the
    // popup's 240 px on a phone — measured at 390×844, the block reached the
    // bottom edge of the map, which is the defect sprints 31 and 32 were both
    // reported for. What the agency does is written under the map, where it
    // hides nothing.
    (info
      ? `<div style="${T.body}"><span style="${T.key}">Agence de l'eau</span> : ${escapeHtml(info.agence)}</div>` +
        `<div><a href="${escapeHtml(info.url)}" target="_blank" rel="noopener noreferrer" style="${T.link}">Programme d'aides ↗</a></div>`
      : // The only codes the table does not carry are the five overseas
        // districts (I, J, K, L, M) of the same referential — and there, the
        // body is not an agence de l'eau at all. Saying which is missing beats
        // an empty « inconnu ».
        `<div style="${T.body};${T.key}">Pas d'agence de l'eau pour ce bassin : les bassins d'outre-mer relèvent d'un office de l'eau départemental.</div>`)
  );
}

/**
 * Label for a basin district: its usual short name, from the same table the
 * popup reads. Drawn with the referential's own wording, « La Loire, les cours
 * d'eau côtiers vendéens et bretons » wrapped over five lines and covered the
 * basin it was naming — measured on the France-wide view.
 *
 * Codes outside the table are the five overseas districts; they keep the full
 * name rather than lose their label.
 */
function grandBassinLabelExpression(): maplibregl.ExpressionSpecification {
  const cas: string[] = [];
  for (const [code, info] of Object.entries(BASSINS)) cas.push(code, info.nomCourt);
  return ["match", ["get", "code"], ...cas, ["get", "nom"]] as unknown as maplibregl.ExpressionSpecification;
}

const SEPARATOR = `<hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0">`;

/**
 * The popup for a click that landed on no point, no river and no lake: what
 * COVERS this spot, from the smallest footprint to the largest — aquifer, then
 * watershed, then basin district. Before the watersheds existed this handler
 * only knew how to name an aquifer; the reading order is what makes three
 * nested objects a sentence rather than a pile.
 */
function couverturePopupHtml(sections: string[]): string {
  return sections.filter(Boolean).join(SEPARATOR);
}

function toCollection(features: MapFeature[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.lon, f.lat] },
      properties: {
        kind: f.kind,
        code: f.code,
        label: f.label,
        detail: f.detail ?? "",
        distanceKm: f.distanceKm,
        ...(f.severity !== undefined ? { severity: f.severity } : {}),
        ...(f.approximate ? { approximate: 1 } : {}),
        // Nested values are serialised: MapLibre only carries scalars through
        // feature properties, so objects come back as strings on click.
        ...(f.caracteristiques ? { caracteristiques: JSON.stringify(f.caracteristiques) } : {}),
        ...(f.groupe ? { groupe: JSON.stringify(f.groupe), total: f.groupe.total } : {}),
        ...(f.fiche ? { fiche: f.fiche } : {}),
        ...(f.altCode ? { altCode: f.altCode } : {}),
      },
    })),
  };
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface Props {
  layers: MapLayers | null;
  /** address marker, when a search has been made */
  centre?: { lat: number; lon: number; label: string };
  /** one entry per registry layer, milieux included */
  visible: Record<LayerId, boolean>;
  /** called with the centre of the current viewport when the user asks to search here */
  onSearchHere: (lat: number, lon: number) => void;
}

export default function CarteEau({ layers, centre, visible, onSearchHere }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  /**
   * ⚠️ ONE popup for the whole map. MapLibre happily opens several at once, and
   * on a phone two overlapping popups reproduce exactly the defect this sprint
   * set out to fix — the second hides the first. Reusing a single instance
   * makes "one object described at a time" structural rather than hoped for.
   */
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [ready, setReady] = useState(false);
  const [moved, setMoved] = useState(false);
  /** The floating button and a popup compete for the top of the map. */
  const [popupOpen, setPopupOpen] = useState(false);
  /**
   * The embedded reference layers that answered nothing. Each is built by an
   * Actions run and can be absent from the repo; the map must SAY so, or a
   * missing file reads as « il n'y a pas de nappe ici » — and now as « il n'y a
   * pas de bassin versant ici », which is never true anywhere.
   */
  const [couchesInjoignables, setCouchesInjoignables] = useState<string[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: FRANCE_CENTER,
      zoom: FRANCE_ZOOM,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a> · Stations : Hub\'Eau · Nappes : Sandre',
          },
        },
        layers: [{ id: "basemap", type: "raster", source: "basemap" }],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    // ⚠️ NOT `map.on("load")`, and NOT `map.isStyleLoaded()` either. Both wait
    // for every source to settle, the raster basemap included — so when the
    // tile host is unreachable neither ever becomes true and the map installs
    // nothing at all. Measured here with egress blocked: no layer was created
    // and /api/nappes was never even requested, although the aquifer file is
    // served locally and needs no network whatsoever.
    //
    // `styledata` fires once the inline style itself is parsed, which is the
    // real precondition for adding sources. The map then draws whatever it can
    // reach instead of waiting on what it cannot — which is also what the PWA
    // offline mode needs. Adding sources re-fires the event, hence the guard.
    const popup = new maplibregl.Popup({ offset: 12, maxWidth: "300px", closeButton: true });
    popup.on("close", () => {
      setPopupOpen(false);
      clearHighlights();
    });
    popupRef.current = popup;
    /**
     * Sequence token. A click on another object while the previous state is
     * still loading must not write that state into the new popup — the fetch
     * that comes back late simply finds a stale token and gives up.
     */
    let etatToken = 0;

    /**
     * Wash the one basin whose popup is open, and only that one. The basin
     * layers are drawn as outlines; without this, a click on the middle of a
     * basin would open a popup naming something the reader cannot see. The
     * comparison falls back to the toponym because the referential does not
     * guarantee a code column on every layer.
     */
    const highlight = (prefix: string, value: string | null) => {
      if (!map.getLayer(`${prefix}-fill`)) return;
      map.setPaintProperty(
        `${prefix}-fill`,
        "fill-opacity",
        value === null
          ? 0
          : ([
              "case",
              ["==", ["coalesce", ["get", "code"], ["get", "nom"], ""], value],
              0.12,
              0,
            ] as maplibregl.ExpressionSpecification),
      );
    };
    const clearHighlights = () => {
      highlight("bassins-versants", null);
      highlight("grands-bassins", null);
    };

    /** Show the single popup at a point, replacing whatever it held. */
    const showPopup = (lngLat: maplibregl.LngLatLike, html: string) => {
      etatToken += 1;
      // ⚠️ Bounded height with internal scrolling. Adding the state block made
      // popups three times taller, and on a phone one overflowed the map and
      // slid under the floating button — the very defect reported in Sprint 31,
      // coming back through a different door. 240 px is what fits inside the
      // map container once MapLibre has anchored the bubble above a marker
      // sitting high in the view; measured, not guessed.
      popup
        .setLngLat(lngLat)
        .setHTML(`<div style="max-height:min(40vh,240px);overflow-y:auto">${html}</div>`)
        .addTo(map);
      setPopupOpen(true);
    };

    /** Fill the popup's state slot, if it has one. */
    const loadEtat = (query: string, couleur: string) => {
      const mine = etatToken;
      const slot = () => popup.getElement()?.querySelector("[data-etat]") as HTMLElement | null;
      if (!slot()) return;
      void (async () => {
        let html: string;
        try {
          const res = await fetch(`/api/carte/etat?${query}`);
          html = etatHtml((await res.json()) as Record<string, unknown>, couleur);
        } catch {
          // Expected whenever the upstream services are unreachable (the
          // development sandbox, an offline phone). The slot must SAY so — a
          // popup left on "Chargement…" forever is the worst of both.
          html = `<span style="${T.key}">État indisponible : services de données injoignables.</span>`;
        }
        if (mine !== etatToken) return;
        const el = slot();
        if (el) el.innerHTML = html;
      })();
    };

    let installed = false;
    const install = () => {
      if (installed) return;
      installed = true;

      // Watersheds at the very bottom: they are the largest objects on the map,
      // and they are context for everything drawn above them.
      //
      // Outlines only, never a wash. The map already carries two translucent
      // fills (aquifers, lakes) and a third would turn it into a soup of blues
      // — the same readability failure the floating legend was removed for. So
      // each basin layer gets: a fully transparent fill that exists ONLY to
      // catch clicks (`fill-opacity: 0` is still hit-tested, unlike
      // `visibility: none`), a line for the divide, and labels. The clicked
      // basin is the one that gets a wash, for as long as its popup is open.
      for (const [prefix, source, route, minzoomLabel] of [
        ["grands-bassins", "grands-bassins", "/api/grands-bassins", 0],
        ["bassins-versants", "bassins-versants", "/api/bassins-versants", 7],
      ] as const) {
        const spec = LAYER_BY_ID[prefix === "grands-bassins" ? "grandsBassins" : "bassinsVersants"];
        map.addSource(source, { type: "geojson", data: route });
        // ⚠️ The grands-bassins file carries BOTH the outlines and one label
        // POINT per district, so each name is written once instead of once per
        // island. Every layer of that source therefore filters by geometry
        // type — `geometry-type` answers "Polygon" for a multipolygon too.
        const surfaces: maplibregl.FilterSpecification = ["==", ["geometry-type"], "Polygon"];
        const points: maplibregl.FilterSpecification = ["==", ["geometry-type"], "Point"];
        map.addLayer({
          id: `${prefix}-fill`,
          type: "fill",
          source,
          filter: surfaces,
          paint: { "fill-color": spec.color, "fill-opacity": 0 },
        });
        map.addLayer({
          id: `${prefix}-line`,
          type: "line",
          source,
          filter: surfaces,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": spec.color,
            "line-opacity": 0.75,
            ...(spec.trait === "tirets" ? { "line-dasharray": [3, 2] as [number, number] } : {}),
            "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 9, 1.6, 13, 2.6],
          },
        });
        map.addLayer({
          id: `${prefix}-label`,
          type: "symbol",
          source,
          // The fine watersheds have no label points: they are elementary
          // catchments, drawn from a single polygon each.
          ...(prefix === "grands-bassins" ? { filter: points } : {}),
          minzoom: minzoomLabel,
          layout: {
            // ⚠️ A watershed's name is the name of the REACH it drains, and the
            // referential writes it in full: « La Boutonne du confluent de la
            // Trézence au confluent de la Charente ». Measured on the embedded
            // file: median 53 characters, maximum 120. Drawn whole, one label
            // covers its own basin. So the map shows the head of the name and
            // the popup gives it in full — truncating what is displayed, never
            // what is stored.
            "text-field":
              prefix === "grands-bassins"
                ? grandBassinLabelExpression()
                : ["concat", ["slice", ["get", "nom"], 0, 24], "…"],
            "text-size": prefix === "grands-bassins" ? 12 : 11,
            "text-transform": prefix === "grands-bassins" ? "uppercase" : "none",
            "text-letter-spacing": prefix === "grands-bassins" ? 0.08 : 0,
            "text-max-width": 8,
          },
          paint: {
            "text-color": spec.color,
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.4,
          },
        });
      }

      // Groundwater bodies next, so every marker sits above them.
      map.addSource("nappes", { type: "geojson", data: "/api/nappes" });
      map.addLayer({
        id: "nappes-fill",
        type: "fill",
        source: "nappes",
        paint: { "fill-color": "#38bdf8", "fill-opacity": 0.13 },
      });
      map.addLayer({
        id: "nappes-line",
        type: "line",
        source: "nappes",
        paint: { "line-color": "#0ea5e9", "line-width": 0.6, "line-opacity": 0.5 },
      });

      // Rivers above the aquifers, below every marker: they are context for
      // reading the points, not objects competing with them.
      // No bbox at first: the route then answers with the major rivers only,
      // which is the right amount of context for the France-wide default view.
      // A search swaps in the local network (effect below).
      map.addSource("cours-eau", { type: "geojson", data: "/api/cours-eau" });
      map.addLayer({
        id: "cours-eau-line",
        type: "line",
        source: "cours-eau",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#0369a1",
          "line-opacity": 0.75,
          // Thin at national zoom where the whole network is on screen, thicker
          // once zoomed into a site's surroundings.
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 9, 1.4, 13, 3],
        },
      });
      map.addLayer({
        id: "cours-eau-label",
        type: "symbol",
        source: "cours-eau",
        minzoom: 8,
        layout: {
          "text-field": ["get", "nom"],
          "text-size": 11,
          "symbol-placement": "line",
          "text-max-angle": 40,
        },
        paint: { "text-color": "#075985", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
      });

      map.on("click", "cours-eau-line", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, unknown>;
        // ⚠️ `longueurKm` is NOT displayed. The source column is named
        // `LongueurTotKm`, but its values are internally inconsistent: median
        // 38 (plausible in km) against a maximum of 180 748 (plausible only in
        // metres, and impossible in km). A figure whose unit cannot be pinned
        // down is not shown — the property stays in the file for a future
        // sprint that establishes it.
        const lignes = [
          p.strahler !== undefined && p.strahler !== null
            ? `<div style="margin-top:2px"><span style="${T.key}">Ordre de Strahler</span> : ${escapeHtml(String(p.strahler))}</div>`
            : "",
        ].join("");
        showPopup(
          e.lngLat,
          `<div style="${T.title}">${escapeHtml(String(p.nom ?? "Cours d'eau"))}</div>` +
            `<div style="${T.sub}">Masse d'eau cours d'eau ${escapeHtml(String(p.code ?? ""))}</div>` +
            (lignes ? `<div style="${T.body}">${lignes}</div>` : "") +
            `<div style="${T.body};${T.key}">Tracé indicatif : une masse d'eau cours d'eau est un tronçon au sens de la directive cadre sur l'eau, pas le lit exact.</div>` +
            ETAT_SLOT,
        );
        loadEtat(`kind=coursEau&lat=${e.lngLat.lat}&lon=${e.lngLat.lng}`, COLOR.coursEau);
      });
      // Surface water bodies above the aquifers, below the rivers and markers:
      // a lake is a milieu like a groundwater body, but a visible one.
      map.addSource("plans-eau", { type: "geojson", data: "/api/plans-eau" });
      map.addLayer({
        id: "plans-eau-fill",
        type: "fill",
        source: "plans-eau",
        paint: { "fill-color": "#0891b2", "fill-opacity": 0.45 },
      });
      map.addLayer({
        id: "plans-eau-line",
        type: "line",
        source: "plans-eau",
        paint: { "line-color": "#0e7490", "line-width": 0.7 },
      });
      map.on("click", "plans-eau-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, unknown>;
        // ⚠️ Most water bodies have no toponym (measured on the referential):
        // the popup then leads with the nature rather than inventing a name.
        const nom = String(p.nom ?? "").trim();
        const nature = String(p.nature ?? "Plan d'eau");
        const surface = Number(p.surfaceHa);
        showPopup(
          e.lngLat,
          `<div style="${T.title}">${escapeHtml(nom || nature)}</div>` +
            `<div style="${T.sub}">${escapeHtml(nom ? nature : "Sans toponyme au référentiel")}</div>` +
            (Number.isFinite(surface)
              ? `<div style="${T.body}"><span style="${T.key}">Surface</span> : ${surface.toLocaleString("fr-FR")} ha</div>`
              : "") +
            `<div style="${T.body};${T.key}">Surface calculée à partir du contour, le référentiel ne la publie pas.</div>` +
            ETAT_SLOT,
        );
        loadEtat(`kind=plansEau&lat=${e.lngLat.lat}&lon=${e.lngLat.lng}`, COLOR.plansEau);
      });
      map.on("mouseenter", "plans-eau-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "plans-eau-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("mouseenter", "cours-eau-line", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "cours-eau-line", () => {
        map.getCanvas().style.cursor = "";
      });

      // A click on nothing in particular answers « qu'est-ce qui couvre ce
      // point ? ». Registered on the MAP, not on a layer: a watershed is drawn
      // as an outline, and an outline is far too thin a target for a finger —
      // what gets hit is the transparent fill covering the whole basin.
      //
      // The layers that sit above are the more specific target and own the
      // click; otherwise two popups open at once on the same spot.
      map.on("click", (e) => {
        const overSpecific = map.queryRenderedFeatures(e.point, {
          layers: [...POINT_LAYERS.map((l) => `${l.id}-circle`), "cours-eau-line", "plans-eau-fill"].filter((id) =>
            map.getLayer(id),
          ),
        });
        if (overSpecific.length > 0) return;

        // A layer switched off is not rendered, so it is not queried either:
        // an unchecked box makes its object disappear from the popup too, which
        // is the only reading of a toggle that does not lie.
        const covering = (id: string) =>
          map.getLayer(id) ? map.queryRenderedFeatures(e.point, { layers: [id] }) : [];
        const nappes = covering("nappes-fill");
        const bassinsVersants = covering("bassins-versants-fill");
        const grandsBassins = covering("grands-bassins-fill");
        if (nappes.length === 0 && bassinsVersants.length === 0 && grandsBassins.length === 0) return;

        // The 6 190 elementary watersheds TILE the territory rather than nest
        // inside one another (6 190 × 89 km² ≈ the surface of France), so two
        // only turn up under one click on a shared divide. Electing the
        // smallest is a deterministic tie-break, and it is the local answer.
        const smallest = [...bassinsVersants].sort(
          (a, b) =>
            (Number(a.properties?.surfaceKm2) || Infinity) -
            (Number(b.properties?.surfaceKm2) || Infinity),
        )[0];
        const identite = (f: maplibregl.MapGeoJSONFeature | undefined) =>
          f ? String(f.properties?.code ?? f.properties?.nom ?? "") : null;

        showPopup(
          e.lngLat,
          couverturePopupHtml([
            // Aquifers share edges, so several can sit under one click: listing
            // them beats electing one at random.
            nappes.length
              ? nappePopupHtml(nappes.map((h) => h.properties as Record<string, unknown>))
              : "",
            smallest ? bassinVersantHtml(smallest.properties as Record<string, unknown>) : "",
            grandsBassins.length
              ? grandBassinHtml(grandsBassins[0]!.properties as Record<string, unknown>)
              : "",
          ]) +
            // ⚠️ The state block belongs to the aquifer alone. A watershed has
            // no measured state to fetch, and an empty « Chargement de l'état… »
            // that never resolves is worse than no block at all.
            (nappes.length ? ETAT_SLOT : ""),
        );
        if (nappes.length) loadEtat(`kind=nappes&lat=${e.lngLat.lat}&lon=${e.lngLat.lng}`, COLOR.nappes);
        highlight("bassins-versants", identite(smallest));
        highlight("grands-bassins", identite(grandsBassins[0]));
      });
      map.on("mouseenter", "nappes-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "nappes-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      for (const { id: kind } of POINT_LAYERS) {
        map.addSource(kind, { type: "geojson", data: EMPTY });
        map.addLayer({
          id: `${kind}-circle`,
          type: "circle",
          source: kind,
          paint: {
            // A marker standing for several objects grows with the count, so a
            // crowded commune reads as crowded before anything is clicked.
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "total"], 1],
              1,
              6,
              5,
              9,
              25,
              13,
            ],
            "circle-color": kind === "onde" ? ONDE_COLOR : COLOR[kind],
            // ONDE points are the only ones carrying a state, so their fill is
            // the observed flow — which collides with the identity colour of
            // the other layers (an assec is purple, so is a piezometer). The
            // ring keeps the layer readable: fill = what was observed, ring =
            // which layer it belongs to.
            "circle-stroke-width": kind === "onde" ? 2.5 : 1.5,
            "circle-stroke-color": kind === "onde" ? COLOR.onde : "#ffffff",
            // A BNPE structure positioned on the commune centroid is drawn
            // hollow: the reader sees at a glance that the dot is a village,
            // not a borehole.
            "circle-opacity": ["case", ["==", ["get", "approximate"], 1], 0.35, 0.9],
          },
        });

        map.on("click", `${kind}-circle`, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const props = f.properties as Record<string, unknown>;
          showPopup([lon, lat], popupHtml(props, lon, lat));
          loadEtat(
            `kind=${kind}&code=${encodeURIComponent(String(props.code ?? ""))}` +
              `&altCode=${encodeURIComponent(String(props.altCode ?? ""))}`,
            COLOR[kind],
          );
        });
        // The count, drawn on the marker itself. Without it a grouped marker is
        // just a slightly bigger dot, and "something is hidden here" is exactly
        // what the reader could not see before.
        map.addLayer({
          id: `${kind}-count`,
          type: "symbol",
          source: kind,
          filter: [">", ["coalesce", ["get", "total"], 1], 1],
          layout: {
            "text-field": ["to-string", ["get", "total"]],
            "text-size": 10,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            // A grouped BNPE marker is drawn translucent (its position is a
            // commune centroid), so white-on-pale would be unreadable there
            // while dark-on-solid would be unreadable everywhere else.
            "text-color": ["case", ["==", ["get", "approximate"], 1], "#0f172a", "#ffffff"],
            "text-halo-color": ["case", ["==", ["get", "approximate"], 1], "#ffffff", "#0f172a"],
            "text-halo-width": 1,
          },
        });

        map.on("mouseenter", `${kind}-circle`, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", `${kind}-circle`, () => {
          map.getCanvas().style.cursor = "";
        });
      }
      setReady(true);
      // Marks that the sources and layers really were installed. The basemap
      // tiles are unreachable from the development sandbox, so a screenshot
      // cannot distinguish "map built, nothing to draw" from "map never
      // initialised" — this flag can, and the e2e suite asserts it.
      containerRef.current?.setAttribute("data-map-ready", "true");
    };
    map.on("styledata", install);

    // The embedded reference files are absent until their Actions build has
    // run; the map must say so rather than let the user believe the ground is
    // empty here.
    map.on("error", (e) => {
      const msg = String((e as unknown as { error?: Error }).error?.message ?? "");
      const routes: Array<[string, string]> = [
        ["/api/nappes", "nappes"],
        ["/api/bassins-versants", "bassins versants"],
        ["/api/grands-bassins", "grands bassins"],
      ];
      for (const [route, label] of routes) {
        if (msg.includes(route)) {
          setCouchesInjoignables((prev) => (prev.includes(label) ? prev : [...prev, label]));
        }
      }
    });

    map.on("moveend", () => setMoved(true));

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Feed each layer its features.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const { id: kind } of POINT_LAYERS) {
      const src = map.getSource(kind) as maplibregl.GeoJSONSource | undefined;
      src?.setData(layers ? toCollection(layers.features[kind]) : EMPTY);
    }
  }, [layers, ready]);

  // Toggles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const { id: kind } of POINT_LAYERS) {
      const on = visible[kind] ? "visible" : "none";
      map.setLayoutProperty(`${kind}-circle`, "visibility", on);
      // The count labels ride with their markers, or a hidden layer would leave
      // its numbers floating over the map.
      map.setLayoutProperty(`${kind}-count`, "visibility", on);
    }
    // Milieux: several map layers per registry entry (a fill and its outline,
    // a line and its labels) all follow the single toggle of that entry.
    const milieux: Array<[LayerId, string[]]> = [
      ["nappes", ["nappes-fill", "nappes-line"]],
      ["coursEau", ["cours-eau-line", "cours-eau-label"]],
      ["plansEau", ["plans-eau-fill", "plans-eau-line"]],
      // The transparent fill rides with the outline: left visible, it would
      // keep catching clicks for a basin the reader has switched off.
      ["bassinsVersants", ["bassins-versants-fill", "bassins-versants-line", "bassins-versants-label"]],
      ["grandsBassins", ["grands-bassins-fill", "grands-bassins-line", "grands-bassins-label"]],
    ];
    for (const [id, ids] of milieux) {
      for (const layerId of ids) {
        map.setLayoutProperty(layerId, "visibility", visible[id] ? "visible" : "none");
      }
    }
  }, [visible, ready]);

  // The searched address: a marker, and a fly-to that frames the radius.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centre) return;
    markerRef.current?.remove();
    // No popup on this marker: the searched address is already written in the
    // field above the map, and its popup was the second box overlapping the
    // first on a phone.
    markerRef.current = new maplibregl.Marker({ color: "#0f172a" })
      .setLngLat([centre.lon, centre.lat])
      .addTo(map);
    // Frame the disc that was actually queried, rather than a zoom guessed from
    // the radius: a 10 km search and a 60 km one must not land on the same view.
    if (layers) {
      const dLat = layers.radiusKm / 111;
      const dLon = layers.radiusKm / (111 * Math.max(0.2, Math.cos((centre.lat * Math.PI) / 180)));
      map.fitBounds(
        [
          [centre.lon - dLon, centre.lat - dLat],
          [centre.lon + dLon, centre.lat + dLat],
        ],
        { padding: 40, duration: 1000 },
      );
    } else {
      map.flyTo({ center: [centre.lon, centre.lat], zoom: 10, duration: 1000 });
    }
    setMoved(false);
  }, [centre, layers]);

  // Rivers follow the query: the embedded file holds all 9 746 river water
  // bodies, so the route is asked for a bounding box rather than the lot. The
  // box is the queried disc, widened a little so a river leaving the circle
  // still enters the frame.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !centre || !layers) return;
    const pad = 1.3;
    const dLat = (layers.radiusKm * pad) / 111;
    const dLon = (layers.radiusKm * pad) / (111 * Math.max(0.2, Math.cos((centre.lat * Math.PI) / 180)));
    const bbox = [
      (centre.lon - dLon).toFixed(3),
      (centre.lat - dLat).toFixed(3),
      (centre.lon + dLon).toFixed(3),
      (centre.lat + dLat).toFixed(3),
    ].join(",");
    for (const [source, route] of [
      ["cours-eau", "/api/cours-eau"],
      ["plans-eau", "/api/plans-eau"],
      // Same trade as the rivers: the national view gets the largest basins
      // only, a search swaps in every divide of the area — including the small
      // headwater basins, which are precisely the ones a site sits in.
      ["bassins-versants", "/api/bassins-versants"],
    ] as const) {
      const src = map.getSource(source) as maplibregl.GeoJSONSource | undefined;
      src?.setData(`${route}?bbox=${bbox}`);
    }
  }, [centre, layers, ready]);

  const searchHere = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    setMoved(false);
    onSearchHere(c.lat, c.lng);
  }, [onSearchHere]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-140 w-full rounded-xl border border-line shadow-sm" />

      {moved && !popupOpen && (
        <button
          type="button"
          onClick={searchHere}
          className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-sky-700"
        >
          Rechercher dans cette zone
        </button>
      )}

      {/*
        ⚠️ NO legend overlay here. It used to sit bottom-left, and on a phone it
        covered a third of the map AND collided with every popup — reported from
        a real device. It also duplicated the toggle bar above the map, which
        already carries the same swatches, the same labels and the counts. The
        reading notes it held moved into « Comprendre la carte », below the map,
        where they are readable without hiding anything.
      */}
      {couchesInjoignables.length > 0 && (
        <p className="absolute right-3 bottom-3 z-10 rounded-lg bg-white/95 px-3 py-2 text-xs text-ink-subtle shadow">
          Contours indisponibles : {couchesInjoignables.join(", ")}.
        </p>
      )}
    </div>
  );
}
