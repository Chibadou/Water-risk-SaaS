"use client";

import { useEffect, useState } from "react";
import Sparkline from "./Sparkline";
import type { IndicatorResult, Trend } from "@/lib/hubeau";

const CONFIDENCE_STYLE: Record<string, { label: string; className: string }> = {
  bonne: { label: "représentativité bonne", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  moyenne: { label: "représentativité moyenne", className: "bg-amber-50 text-amber-800 border-amber-200" },
  faible: { label: "représentativité faible", className: "bg-orange-50 text-orange-800 border-orange-200" },
};

// Trend of the *resource* (more/less available water), never color alone: arrow + label.
function resourceTrend(trend: Trend | undefined, higherIsBetter: boolean | undefined) {
  if (!trend) return undefined;
  const t: Trend =
    higherIsBetter === false ? (trend === "hausse" ? "baisse" : trend === "baisse" ? "hausse" : "stable") : trend;
  switch (t) {
    case "hausse":
      return { arrow: "↗", label: "en hausse sur 14 j", className: "bg-sky-50 text-sky-800 border-sky-200" };
    case "baisse":
      return { arrow: "↘", label: "en baisse sur 14 j", className: "bg-amber-50 text-amber-900 border-amber-200" };
    default:
      return { arrow: "→", label: "stable sur 14 j", className: "bg-slate-50 text-slate-600 border-slate-200" };
  }
}

function formatValue(value: number, unit?: string): string {
  // Groundwater levels/depths in metres: centimetre precision matters even at
  // ~100 m NGF. Flows scale their precision with magnitude.
  const isPiezo = unit?.includes("NGF") || unit?.includes("profondeur");
  const digits = isPiezo ? 2 : Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: digits })} ${unit ?? ""}`.trim();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function IndicatorCard({
  title,
  endpoint,
  lat,
  lon,
  emptyHint,
}: {
  title: string;
  endpoint: string;
  lat: number;
  lon: number;
  emptyHint: string;
}) {
  // Loading is derived from a key mismatch (no setState at effect start).
  const key = `${endpoint}:${lat},${lon}`;
  const [result, setResult] = useState<{
    key: string;
    status: "done" | "failed";
    data?: IndicatorResult;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${endpoint}?lat=${lat}&lon=${lon}`)
      .then(async (res) => {
        const data = (await res.json()) as IndicatorResult;
        if (!cancelled) setResult({ key, status: "done", data });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, lat, lon, key]);

  const state = result && result.key === key ? result : { status: "loading" as const, data: undefined };
  const data = state.data;
  const trend = data ? resourceTrend(data.trend, data.higherIsBetter) : undefined;
  const conf = data?.station ? CONFIDENCE_STYLE[data.station.confidence] : undefined;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>

      {state.status === "loading" && (
        <p className="mt-3 text-sm text-slate-400">Recherche de la station la plus proche…</p>
      )}

      {state.status === "failed" && (
        <p className="mt-3 text-sm text-amber-700">Service Hub&apos;Eau injoignable pour le moment.</p>
      )}

      {state.status === "done" && data && !data.available && (
        <p className="mt-3 text-sm text-slate-500">
          {data.message ?? emptyHint}
        </p>
      )}

      {state.status === "done" && data?.available && data.station && data.latest && (
        <>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {formatValue(data.latest.value, data.unit)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {data.grandeur} · {formatDate(data.latest.date)}
              </p>
            </div>
            {data.series && (
              <Sparkline
                points={data.series}
                ariaLabel={`${data.grandeur} sur ${data.series.length} jours, dernière valeur ${formatValue(
                  data.latest.value,
                  data.unit,
                )}`}
              />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {trend && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${trend.className}`}
              >
                <span aria-hidden>{trend.arrow}</span> Ressource {trend.label}
              </span>
            )}
            {conf && (
              <span
                title="Station la plus proche avec données récentes, sélectionnée par distance. Le rattachement par sous-bassin / aquifère viendra dans une prochaine version."
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${conf.className}`}
              >
                {conf.label} · {data.station.distanceKm} km
              </span>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Station : {data.station.label}{" "}
            <span className="font-mono">{data.station.code}</span>
          </p>
        </>
      )}
    </div>
  );
}

export default function SiteIndicators({ lat, lon }: { lat: number; lon: number }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">Ressource en eau à proximité</h2>
      <p className="mt-1 text-sm text-slate-500">
        Mesures des stations publiques Hub&apos;Eau les plus proches (30 km max). La station la
        plus proche n&apos;est pas forcément sur la même ressource que votre site : fiez-vous à
        l&apos;indicateur de représentativité.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <IndicatorCard
          title="Débit du cours d'eau"
          endpoint="/api/hydro"
          lat={lat}
          lon={lon}
          emptyHint="Aucune station hydrométrique proche."
        />
        <IndicatorCard
          title="Nappe souterraine"
          endpoint="/api/piezo"
          lat={lat}
          lon={lon}
          emptyHint="Aucun piézomètre proche."
        />
      </div>
    </section>
  );
}
