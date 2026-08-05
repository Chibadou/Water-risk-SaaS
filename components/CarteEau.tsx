"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { Map as MaplibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LAYERS, type LayerKind, type MapFeature, type MapLayers } from "@/lib/carteEau";

const FRANCE_CENTER: [number, number] = [2.5, 46.6];
const FRANCE_ZOOM = 4.8;

const COLOR = Object.fromEntries(LAYERS.map((l) => [l.kind, l.color])) as Record<LayerKind, string>;

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
      },
    })),
  };
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface Props {
  layers: MapLayers | null;
  /** address marker, when a search has been made */
  centre?: { lat: number; lon: number; label: string };
  visible: Record<LayerKind, boolean>;
  showNappes: boolean;
  showCoursEau: boolean;
  /** called with the centre of the current viewport when the user asks to search here */
  onSearchHere: (lat: number, lon: number) => void;
}

export default function CarteEau({
  layers,
  centre,
  visible,
  showNappes,
  showCoursEau,
  onSearchHere,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [moved, setMoved] = useState(false);
  const [nappesFailed, setNappesFailed] = useState(false);

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
    let installed = false;
    const install = () => {
      if (installed) return;
      installed = true;
      // Groundwater bodies first, so every marker sits above them.
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
        const lignes = [
          p.longueurKm !== undefined && p.longueurKm !== null
            ? `<div style="margin-top:2px"><span style="${T.key}">Longueur</span> : ${escapeHtml(String(p.longueurKm))} km</div>`
            : "",
          p.strahler !== undefined && p.strahler !== null
            ? `<div style="margin-top:2px"><span style="${T.key}">Ordre de Strahler</span> : ${escapeHtml(String(p.strahler))}</div>`
            : "",
        ].join("");
        new maplibregl.Popup({ offset: 4, maxWidth: "300px" })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="${T.title}">${escapeHtml(String(p.nom ?? "Cours d'eau"))}</div>` +
              `<div style="${T.sub}">Masse d'eau cours d'eau ${escapeHtml(String(p.code ?? ""))}</div>` +
              (lignes ? `<div style="${T.body}">${lignes}</div>` : "") +
              `<div style="${T.body};${T.key}">Tracé indicatif : une masse d'eau cours d'eau est un tronçon au sens de la directive cadre sur l'eau, pas le lit exact.</div>`,
          )
          .addTo(map);
      });
      map.on("mouseenter", "cours-eau-line", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "cours-eau-line", () => {
        map.getCanvas().style.cursor = "";
      });

      // Clicking an aquifer names it. Registered on the fill layer but read
      // through queryRenderedFeatures, because bodies share edges and several
      // can sit under one click — listing them beats electing one at random.
      map.on("click", "nappes-fill", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ["nappes-fill"] });
        if (hits.length === 0) return;
        // A click that also landed on a marker belongs to the marker: the point
        // layers are drawn on top and are the more specific target.
        const overPoint = map.queryRenderedFeatures(e.point, {
          layers: LAYERS.map((l) => `${l.kind}-circle`).filter((id) => map.getLayer(id)),
        });
        if (overPoint.length > 0) return;
        new maplibregl.Popup({ offset: 4, maxWidth: "300px" })
          .setLngLat(e.lngLat)
          .setHTML(nappePopupHtml(hits.map((h) => h.properties as Record<string, unknown>)))
          .addTo(map);
      });
      map.on("mouseenter", "nappes-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "nappes-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      for (const { kind } of LAYERS) {
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
          new maplibregl.Popup({ offset: 12, maxWidth: "300px" })
            .setLngLat([lon, lat])
            .setHTML(popupHtml(f.properties as Record<string, unknown>, lon, lat))
            .addTo(map);
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
          paint: { "text-color": "#ffffff", "text-halo-color": "#0f172a", "text-halo-width": 0.6 },
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

    // The embedded aquifer file is absent until the Actions build has run; the
    // map must say so rather than let the user believe there is no aquifer here.
    map.on("error", (e) => {
      const msg = String((e as unknown as { error?: Error }).error?.message ?? "");
      if (msg.includes("/api/nappes")) setNappesFailed(true);
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
    for (const { kind } of LAYERS) {
      const src = map.getSource(kind) as maplibregl.GeoJSONSource | undefined;
      src?.setData(layers ? toCollection(layers.features[kind]) : EMPTY);
    }
  }, [layers, ready]);

  // Toggles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const { kind } of LAYERS) {
      const on = visible[kind] ? "visible" : "none";
      map.setLayoutProperty(`${kind}-circle`, "visibility", on);
      // The count labels ride with their markers, or a hidden layer would leave
      // its numbers floating over the map.
      map.setLayoutProperty(`${kind}-count`, "visibility", on);
    }
    for (const id of ["nappes-fill", "nappes-line"]) {
      map.setLayoutProperty(id, "visibility", showNappes ? "visible" : "none");
    }
    for (const id of ["cours-eau-line", "cours-eau-label"]) {
      map.setLayoutProperty(id, "visibility", showCoursEau ? "visible" : "none");
    }
  }, [visible, showNappes, showCoursEau, ready]);

  // The searched address: a marker, and a fly-to that frames the radius.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centre) return;
    markerRef.current?.remove();
    markerRef.current = new maplibregl.Marker({ color: "#0f172a" })
      .setLngLat([centre.lon, centre.lat])
      .setPopup(new maplibregl.Popup({ offset: 24 }).setText(centre.label))
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

  const searchHere = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    setMoved(false);
    onSearchHere(c.lat, c.lng);
  }, [onSearchHere]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-140 w-full rounded-xl border border-slate-200 shadow-sm" />

      {moved && (
        <button
          type="button"
          onClick={searchHere}
          className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-sky-700"
        >
          Rechercher dans cette zone
        </button>
      )}

      <div className="absolute bottom-3 left-3 z-10 max-w-[16rem] rounded-lg bg-white/95 px-3 py-2 text-xs shadow">
        <p className="mb-1 font-semibold text-slate-700">Légende</p>
        <ul className="flex flex-col gap-0.5">
          {LAYERS.map((l) => (
            <li key={l.kind} className="flex items-center gap-1.5 text-slate-600" title={l.hint}>
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={
                  l.kind === "onde"
                    ? { border: `2px solid ${l.color}`, backgroundColor: "#fb8c00" }
                    : { backgroundColor: l.color }
                }
              />
              {l.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5 text-slate-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: "#38bdf8", opacity: 0.5 }}
            />
            Nappes (masses d&apos;eau)
          </li>
          <li className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block h-0.5 w-2.5" style={{ backgroundColor: "#0369a1" }} />
            Cours d&apos;eau
          </li>
        </ul>
        <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] leading-snug text-slate-400">
          Les points cerclés d&apos;orange sont des observations d&apos;écoulement : leur
          remplissage va du vert (écoulement visible) au violet (assec). Un ouvrage translucide est
          positionné au centre de sa commune, pas sur l&apos;ouvrage — un point numéroté en
          rassemble plusieurs à cette même position. Cliquez n&apos;importe quel objet pour le
          nommer.
        </p>
      </div>

      {nappesFailed && (
        <p className="absolute right-3 bottom-3 z-10 rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-500 shadow">
          Contours des nappes indisponibles.
        </p>
      )}
    </div>
  );
}
