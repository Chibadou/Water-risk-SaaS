"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DeltaStat, IndicatorKey, ProjectionPayload, ScenarioKey } from "@/lib/projections";
import { prospectiveScore } from "@/lib/projections";
import { historiqueScore } from "@/lib/score";
import { scoreColor } from "@/lib/score";

const INDICATOR_LABELS: Record<IndicatorKey, { label: string; hint: string }> = {
  module: { label: "Débit moyen (module)", hint: "débit moyen interannuel du cours d'eau" },
  qmna5: { label: "Étiage QMNA5", hint: "débit mensuel minimal de fréquence quinquennale sèche" },
  vcn10: { label: "Étiage VCN10", hint: "débit minimal sur 10 jours consécutifs" },
  recharge: { label: "Recharge de nappe", hint: "alimentation annuelle de la nappe" },
};

const SCENARIOS: Array<{ key: ScenarioKey; label: string; sub: string }> = [
  { key: "tracc27", label: "TRACC +2,7 °C", sub: "trajectoire de référence ≈ 2050" },
  { key: "rcp85", label: "RCP 8.5", sub: "stress test" },
];

const DOMAIN_MIN = -55;
const DOMAIN_MAX = 15;

function deltaColor(median: number): string {
  if (median >= 0) return "#059669";
  if (median >= -10) return "#fdd835";
  if (median >= -25) return "#fb8c00";
  return "#e53935";
}

function fmt(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

/** Uncertainty gauge: Q10-Q90 band + median marker on a fixed % axis. */
function DeltaGauge({ stat }: { stat: DeltaStat }) {
  const width = 220;
  const height = 26;
  const x = (v: number) =>
    ((Math.max(DOMAIN_MIN, Math.min(DOMAIN_MAX, v)) - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * width;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`médiane ${fmt(stat.median)}, fourchette ${fmt(stat.q10)} à ${fmt(stat.q90)}`}
      className="shrink-0"
    >
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#e2e8f0" strokeWidth="2" />
      <line x1={x(0)} y1={3} x2={x(0)} y2={height - 3} stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
      <rect
        x={x(stat.q10)}
        y={height / 2 - 4}
        width={Math.max(2, x(stat.q90) - x(stat.q10))}
        height={8}
        rx={4}
        fill={deltaColor(stat.median)}
        opacity={0.25}
      />
      <circle cx={x(stat.median)} cy={height / 2} r={5} fill={deltaColor(stat.median)} stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

export default function Projection2050({
  lat,
  lon,
  joursAlertePlus,
}: {
  lat: number;
  lon: number;
  joursAlertePlus?: number;
}) {
  const key = `${lat},${lon}`;
  const [scenario, setScenario] = useState<ScenarioKey>("tracc27");
  const [result, setResult] = useState<{ key: string; status: "done" | "failed"; data?: ProjectionPayload } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projection?lat=${lat}&lon=${lon}`)
      .then(async (res) => {
        const data = (await res.json()) as ProjectionPayload;
        if (!cancelled) setResult({ key, status: "done", data });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, key]);

  const state = result && result.key === key ? result : { status: "loading" as const, data: undefined };
  const data = state.data;
  const point = data?.point;
  const stats = point?.scenarios[scenario];
  const hist = joursAlertePlus === undefined ? undefined : historiqueScore(joursAlertePlus);
  const prospective = stats ? prospectiveScore(stats.qmna5.median, hist) : undefined;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">Disponibilité en eau — horizon 2050</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Évolution projetée vs la référence 1976-2005, au point de simulation hydrologique le plus
        proche du site. Médiane de l&apos;ensemble multi-modèles et fourchette d&apos;incertitude
        (Q10–Q90). <strong>Ce sont des tendances, pas des prévisions.</strong>{" "}
        <Link href="/methodologie" className="text-sky-700 underline hover:text-sky-900">
          Méthodologie
        </Link>
      </p>

      {data?.meta?.demo && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900">
          ⚠️ Données de démonstration (synthétiques) — l&apos;intégration des données réelles
          Explore2 / DRIAS-Eau est en cours. Ne pas utiliser pour une décision.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {state.status === "loading" && (
          <p className="text-sm text-slate-400">Recherche du point de simulation…</p>
        )}
        {state.status === "failed" && (
          <p className="text-sm text-amber-700">Service de projection indisponible.</p>
        )}
        {state.status === "done" && data && !point && (
          <p className="text-sm text-slate-500">{data.message ?? "Projection indisponible pour ce site."}</p>
        )}

        {state.status === "done" && point && stats && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setScenario(s.key)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      scenario === s.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                    title={s.sub}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {prospective && (
                <div
                  className="flex items-center gap-2"
                  title="Sévérité de la baisse d'étiage projetée (QMNA5, 70 %) croisée avec la fréquence des restrictions de l'année (30 %). Voir Méthodologie."
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Score prospectif 2050
                  </span>
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: scoreColor(prospective.score) }}
                  >
                    {prospective.score}
                  </span>
                </div>
              )}
            </div>

            <p className="mt-1 text-xs text-slate-400">
              {SCENARIOS.find((s) => s.key === scenario)?.sub} · horizon {data.meta?.horizon}
            </p>

            <ul className="mt-4 space-y-3">
              {(Object.keys(INDICATOR_LABELS) as IndicatorKey[]).map((ind) => {
                const stat = stats[ind];
                if (!stat) return null;
                return (
                  <li key={ind} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <div className="min-w-44">
                      <p className="text-sm font-medium text-slate-700" title={INDICATOR_LABELS[ind].hint}>
                        {INDICATOR_LABELS[ind].label}
                      </p>
                      <p className="text-xs text-slate-400">
                        {fmt(stat.q10)} … <span className="font-semibold text-slate-600">{fmt(stat.median)}</span> … {fmt(stat.q90)}
                      </p>
                    </div>
                    <DeltaGauge stat={stat} />
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 text-xs text-slate-400">
              Point de simulation {point.id} à {point.distanceKm} km du site (rattachement par
              distance — le rattachement hydrographique par sous-bassin est prévu). Source :{" "}
              {data.meta?.demo ? "données de démonstration" : "Explore2 / DRIAS-Eau"} · référence{" "}
              {data.meta?.reference}.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
