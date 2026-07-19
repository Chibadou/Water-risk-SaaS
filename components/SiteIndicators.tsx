"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Sparkline from "./Sparkline";
import { siteKey } from "@/lib/sites";
import { getStationChoice, setStationChoice } from "@/lib/stationChoice";
import type { IndicatorsPayload, StationOption, Trend } from "@/lib/hubeau";

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

function StationList({
  stations,
  selectedCode,
  onPick,
}: {
  stations: StationOption[];
  selectedCode?: string;
  onPick: (code: string) => void;
}) {
  return (
    <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
      {stations.map((s) => {
        const isSelected = s.code === selectedCode;
        return (
          <li key={s.code}>
            <button
              type="button"
              disabled={!s.available}
              onClick={() => onPick(s.code)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                s.available ? "hover:bg-sky-50" : "cursor-not-allowed opacity-50"
              } ${isSelected ? "bg-sky-50" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-800">
                  {isSelected && <span className="mr-1 text-sky-700">✓</span>}
                  {s.label}
                </span>
                <span className="block text-xs text-slate-500">
                  {s.distanceKm} km ·{" "}
                  {s.available
                    ? `donnée du ${s.lastDate ? formatDate(s.lastDate) : "?"}${s.secondary ? " (hauteur)" : ""}`
                    : s.lastDate
                      ? `dernière donnée : ${formatDate(s.lastDate)}`
                      : "pas de donnée récente"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function IndicatorCard({
  title,
  endpoint,
  kind,
  lat,
  lon,
}: {
  title: string;
  endpoint: string;
  kind: "hydro" | "piezo";
  lat: number;
  lon: number;
}) {
  const site = siteKey(lon, lat);
  const [override, setOverride] = useState<string | undefined>(() => getStationChoice(site, kind));
  const [showList, setShowList] = useState(false);

  // Loading is derived from a key mismatch (no setState at effect start).
  const key = `${endpoint}:${lat},${lon}:${override ?? ""}`;
  const [result, setResult] = useState<{
    key: string;
    status: "done" | "failed";
    data?: IndicatorsPayload;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stationParam = override ? `&station=${encodeURIComponent(override)}` : "";
    fetch(`${endpoint}?lat=${lat}&lon=${lon}${stationParam}`)
      .then(async (res) => {
        const data = (await res.json()) as IndicatorsPayload;
        if (!cancelled) setResult({ key, status: "done", data });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, lat, lon, override, key]);

  const state = result && result.key === key ? result : { status: "loading" as const, data: undefined };
  const data = state.data;
  const selected = data?.selected;
  const trend = selected ? resourceTrend(selected.trend, selected.higherIsBetter) : undefined;
  const conf = selected ? CONFIDENCE_STYLE[selected.station.confidence] : undefined;

  const pickStation = (code: string) => {
    setStationChoice(site, kind, code);
    setOverride(code);
    setShowList(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>

      {state.status === "loading" && (
        <p className="mt-3 text-sm text-slate-400">Recherche des stations les plus proches…</p>
      )}

      {state.status === "failed" && (
        <p className="mt-3 text-sm text-amber-700">Service Hub&apos;Eau injoignable pour le moment.</p>
      )}

      {state.status === "done" && data && !selected && (
        <p className="mt-3 text-sm text-slate-500">{data.message ?? "Aucune donnée disponible."}</p>
      )}

      {state.status === "done" && selected && (
        <>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {formatValue(selected.latest.value, selected.unit)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {selected.grandeur} · {formatDate(selected.latest.date)}
              </p>
            </div>
            <Sparkline
              points={selected.series}
              ariaLabel={`${selected.grandeur} sur ${selected.series.length} jours, dernière valeur ${formatValue(
                selected.latest.value,
                selected.unit,
              )}`}
            />
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
                title="Représentativité estimée d'après la distance. Le rattachement par sous-bassin / aquifère viendra dans une prochaine version — voir Méthodologie."
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${conf.className}`}
              >
                {conf.label} · {selected.station.distanceKm} km
              </span>
            )}
            {selected.secondary && (
              <span
                title="Aucune station proche ne publie de débit : la hauteur d'eau est affichée à la place. Elle indique une tendance mais n'est pas comparable d'une station à l'autre."
                className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800"
              >
                signal secondaire
              </span>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Station : {selected.station.label}{" "}
            <span className="font-mono">{selected.station.code}</span>
          </p>
        </>
      )}

      {state.status === "done" && data && data.stations.length > 1 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            className="text-xs font-medium text-sky-700 hover:text-sky-900"
          >
            {showList ? "Masquer les stations" : `Changer de station (${data.stations.length} à proximité)`}
          </button>
          {showList && (
            <StationList
              stations={data.stations}
              selectedCode={selected?.station.code}
              onPick={pickStation}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function SiteIndicators({ lat, lon }: { lat: number; lon: number }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">Ressource en eau à proximité</h2>
      <details className="mt-1 max-w-3xl text-sm text-slate-500">
        <summary className="cursor-pointer select-none font-medium text-slate-600 hover:text-slate-800">
          Pourquoi ces mesures ?
        </summary>
        <p className="mt-2">
          VigiEau donne le signal <strong>réglementaire</strong> : ce que vous devez faire
          aujourd&apos;hui. Les stations publiques Hub&apos;Eau donnent le signal{" "}
          <strong>physique</strong> : l&apos;état réel du cours d&apos;eau et de la nappe près de
          votre site. Les niveaux physiques se dégradent généralement <em>avant</em>{" "}
          le renforcement des arrêtés — un débit ou une nappe en baisse est un signal
          d&apos;alerte précoce. La station la plus proche n&apos;est pas forcément sur la même ressource que
          votre site : vérifiez l&apos;indicateur de représentativité, et choisissez vous-même la
          station si vous connaissez le terrain.{" "}
          <Link href="/methodologie" className="text-sky-700 underline hover:text-sky-900">
            En savoir plus (méthodologie)
          </Link>
        </p>
      </details>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <IndicatorCard title="Débit du cours d'eau" endpoint="/api/hydro" kind="hydro" lat={lat} lon={lon} />
        <IndicatorCard title="Nappe souterraine" endpoint="/api/piezo" kind="piezo" lat={lat} lon={lon} />
      </div>
    </section>
  );
}
