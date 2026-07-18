"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MaplibreMap, Marker } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { GRAVITE } from "@/lib/gravite";

// Vector tiles of the alert zones in force, proxied same-origin (see app/api/pmtiles).
const PMTILES_PATH = "/api/pmtiles";

const FRANCE_CENTER: [number, number] = [2.5, 46.6];

// Zone fill color by gravity level. The property name in the official tiles may be
// camelCase or snake_case depending on the export — coalesce covers both.
const NIVEAU_PROP: maplibregl.ExpressionSpecification = [
  "coalesce",
  ["get", "niveauGravite"],
  ["get", "niveau_gravite"],
  "",
];

function graviteColorExpression(): maplibregl.ExpressionSpecification {
  const matches: (string | string[])[] = [];
  for (const [key, info] of Object.entries(GRAVITE)) {
    matches.push(key, info.color);
  }
  return ["match", NIVEAU_PROP, ...matches, "#90a4ae"] as unknown as maplibregl.ExpressionSpecification;
}

interface Props {
  /** searched point, if any */
  point?: { lon: number; lat: number; label?: string };
}

export default function ZonesMap({ point }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    const pmtilesUrl = new URL(PMTILES_PATH, window.location.origin).toString();
    const archive = new PMTiles(pmtilesUrl);
    protocol.add(archive);

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: FRANCE_CENTER,
      zoom: 4.8,
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
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a> · Zones : VigiEau / MTES',
          },
        },
        layers: [{ id: "basemap", type: "raster", source: "basemap" }],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", async () => {
      // Discover the vector layer names from the PMTiles metadata instead of
      // hardcoding them (the official archive's layer ids are not documented).
      try {
        const metadata = (await archive.getMetadata()) as {
          vector_layers?: Array<{ id: string }>;
        };
        const layerIds = (metadata?.vector_layers ?? []).map((l) => l.id);
        if (layerIds.length === 0) return;

        map.addSource("zones", {
          type: "vector",
          url: `pmtiles://${pmtilesUrl}`,
        });
        for (const id of layerIds) {
          map.addLayer({
            id: `zones-fill-${id}`,
            type: "fill",
            source: "zones",
            "source-layer": id,
            paint: {
              "fill-color": graviteColorExpression(),
              "fill-opacity": 0.35,
            },
          });
          map.addLayer({
            id: `zones-line-${id}`,
            type: "line",
            source: "zones",
            "source-layer": id,
            paint: {
              "line-color": graviteColorExpression(),
              "line-width": 0.8,
              "line-opacity": 0.7,
            },
          });
        }
      } catch {
        // Tiles unavailable: keep the basemap + marker, the map is non-blocking.
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !point) return;
    if (markerRef.current) markerRef.current.remove();
    const marker = new maplibregl.Marker({ color: "#0369a1" })
      .setLngLat([point.lon, point.lat])
      .addTo(map);
    if (point.label) {
      marker.setPopup(new maplibregl.Popup({ offset: 24 }).setText(point.label));
    }
    markerRef.current = marker;
    map.flyTo({ center: [point.lon, point.lat], zoom: 10.5, duration: 1200 });
  }, [point]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-105 w-full rounded-xl border border-slate-200 shadow-sm" />
      <div className="absolute bottom-3 left-3 z-10 rounded-lg bg-white/90 px-3 py-2 text-xs shadow">
        <p className="mb-1 font-semibold text-slate-700">Niveau de gravité</p>
        <ul className="flex flex-col gap-0.5">
          {Object.values(GRAVITE).map((info) => (
            <li key={info.label} className="flex items-center gap-1.5 text-slate-600">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: info.color }}
              />
              {info.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
