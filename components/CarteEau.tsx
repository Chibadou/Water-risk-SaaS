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
  /** called with the centre of the current viewport when the user asks to search here */
  onSearchHere: (lat: number, lon: number) => void;
}

export default function CarteEau({ layers, centre, visible, showNappes, onSearchHere }: Props) {
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

      for (const { kind } of LAYERS) {
        map.addSource(kind, { type: "geojson", data: EMPTY });
        map.addLayer({
          id: `${kind}-circle`,
          type: "circle",
          source: kind,
          paint: {
            "circle-radius": 6,
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
          const p = f.properties as Record<string, unknown>;
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const label = String(p.label ?? p.code ?? "");
          const detail = String(p.detail ?? "");
          const analyse = `/?lat=${lat}&lon=${lon}&label=${encodeURIComponent(label)}`;
          new maplibregl.Popup({ offset: 12, maxWidth: "280px" })
            .setLngLat([lon, lat])
            .setHTML(
              `<div style="font:600 13px system-ui;color:#0f172a">${escapeHtml(label)}</div>` +
                `<div style="font:12px system-ui;color:#64748b;margin-top:2px">${escapeHtml(String(p.code ?? ""))} · à ${escapeHtml(String(p.distanceKm ?? "?"))} km</div>` +
                (detail
                  ? `<div style="font:12px system-ui;color:#475569;margin-top:4px">${escapeHtml(detail)}</div>`
                  : "") +
                `<a href="${analyse}" style="display:inline-block;margin-top:8px;font:600 12px system-ui;color:#0369a1;text-decoration:underline">Analyser ce point →</a>`,
            )
            .addTo(map);
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
      map.setLayoutProperty(`${kind}-circle`, "visibility", visible[kind] ? "visible" : "none");
    }
    for (const id of ["nappes-fill", "nappes-line"]) {
      map.setLayoutProperty(id, "visibility", showNappes ? "visible" : "none");
    }
  }, [visible, showNappes, ready]);

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
        </ul>
        <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] leading-snug text-slate-400">
          Les points cerclés d&apos;orange sont des observations d&apos;écoulement : leur
          remplissage va du vert (écoulement visible) au violet (assec). Un ouvrage translucide est
          positionné au centre de sa commune, pas sur l&apos;ouvrage.
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
