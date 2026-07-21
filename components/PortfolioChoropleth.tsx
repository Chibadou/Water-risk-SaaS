"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MaplibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { departementName } from "@/lib/departements";
import { riskClass, scoreColor } from "@/lib/score";

const NO_DATA = "#e2e8f0";

export interface DeptDatum {
  count: number;
  avg?: number;
}

// A France choropleth of the user's portfolio: each department is shaded by the
// average risk score of the sites it contains. Departments without sites stay
// neutral. Base map is a blank background (no external tiles — CSP/offline safe);
// only the department polygons from /api/departements are drawn.
export default function PortfolioChoropleth({ data }: { data: Record<string, DeptDatum> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  // The map/tooltip are set up once; read the latest data through a ref so the
  // hover tooltip doesn't close over a stale snapshot as site scores load in.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#f1f5f9" } }],
      },
      center: [2.5, 46.6],
      zoom: 4.3,
      attributionControl: false,
      dragRotate: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("departements", { type: "geojson", data: "/api/departements" });
      map.addLayer({
        id: "dept-fill",
        type: "fill",
        source: "departements",
        paint: { "fill-color": NO_DATA, "fill-opacity": 0.85 },
      });
      map.addLayer({
        id: "dept-line",
        type: "line",
        source: "departements",
        paint: { "line-color": "#ffffff", "line-width": 0.5 },
      });

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      map.on("mousemove", "dept-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const code = String(f.properties?.code ?? "");
        const d = dataRef.current[code];
        map.getCanvas().style.cursor = "pointer";
        const name = departementName(code) ?? code;
        const body = d
          ? `${d.count} site${d.count > 1 ? "s" : ""}${d.avg !== undefined ? ` · score moyen ${d.avg} (${riskClass(d.avg).label})` : ""}`
          : "aucun site";
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font:600 12px system-ui;color:#0f172a">${name} (${code})</div><div style="font:12px system-ui;color:#475569">${body}</div>`,
          )
          .addTo(map);
      });
      map.on("mouseleave", "dept-fill", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Recolor when the portfolio changes (data-driven match on the dept code).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("dept-fill")) return;
      const pairs: (string | number)[] = [];
      for (const [code, d] of Object.entries(data)) {
        if (d.avg !== undefined) {
          pairs.push(code, scoreColor(d.avg));
        }
      }
      const expr =
        pairs.length > 0
          ? (["match", ["get", "code"], ...pairs, NO_DATA] as unknown as maplibregl.ExpressionSpecification)
          : NO_DATA;
      map.setPaintProperty("dept-fill", "fill-color", expr);
    };
    if (map.isStyleLoaded() && map.getLayer("dept-fill")) apply();
    else map.once("idle", apply);
  }, [data]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div ref={containerRef} className="h-105 w-full" />
    </div>
  );
}
