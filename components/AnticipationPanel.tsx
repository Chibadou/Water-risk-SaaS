"use client";

import Link from "next/link";
import { scoreColor } from "@/lib/score";
import { computeAnticipation, type SignalInput } from "@/lib/anticipation";
import type { YearHistory } from "@/lib/history";
import type { IndicatorSummary } from "./SiteIndicators";

// Restriction anticipation panel: the *middle* time horizon between the live
// VigiEau status and the 2050 projection — the coming weeks-to-end-of-season a
// business needs to anticipate an upcoming (or worsening) restriction. Computes
// entirely from props already in HomeClient state (seasonal history + the
// physical leading signals), so it degrades gracefully as those arrive.

const DIRECTION = {
  up: { arrow: "↑", label: "aggrave", className: "text-red-700" },
  down: { arrow: "↓", label: "atténue", className: "text-emerald-700" },
  neutral: { arrow: "•", label: "", className: "text-slate-400" },
} as const;

const CONFIDENCE_BADGE: Record<string, string> = {
  haute: "bg-emerald-50 text-emerald-800 border-emerald-200",
  moyenne: "bg-amber-50 text-amber-800 border-amber-200",
  faible: "bg-orange-50 text-orange-900 border-orange-300",
};

/** Map a hydro/piezo indicator summary to an anticipation leading signal. */
function toSignal(s: IndicatorSummary | null | undefined): SignalInput | null | undefined {
  if (s === undefined) return undefined;
  if (s === null) return null;
  return { score: s.reference?.score, trend: s.trend, higherIsBetter: s.higherIsBetter };
}

export default function AnticipationPanel({
  worst,
  histInfo,
  onde,
  indicators,
}: {
  worst?: string | null;
  histInfo: {
    moyen?: number;
    annees?: number;
    parAnnee?: Record<string, YearHistory>;
    parMois?: Record<string, Record<number, number>>;
  };
  onde?: { score: number; stations: number } | null;
  indicators: { hydro?: IndicatorSummary | null; piezo?: IndicatorSummary | null };
}) {
  const result = computeAnticipation({
    worst,
    anneesCompletes: histInfo.annees,
    parMois: histInfo.parMois,
    parAnnee: histInfo.parAnnee,
    nappe: toSignal(indicators.piezo),
    debit: toSignal(indicators.hydro),
    onde: onde === undefined ? undefined : onde ? { score: onde.score } : null,
    // Groundwater is the key signal; prefer the piezometer's distance.
    stationDistanceKm: indicators.piezo?.distanceKm ?? indicators.hydro?.distanceKm,
  });

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">Anticipation des restrictions</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Entre le statut actuel et l&apos;horizon 2050, cet indice estime la probabilité qu&apos;une
        restriction survienne (ou s&apos;aggrave) dans les prochaines semaines, à partir de
        l&apos;historique saisonnier et de l&apos;état de la ressource.{" "}
        <Link href="/methodologie" className="text-sky-700 underline hover:text-sky-900">
          Méthodologie
        </Link>
      </p>

      {!result.available ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
          {result.message ?? "Données insuffisantes pour estimer l'anticipation."}
          <p className="mt-2 text-xs text-slate-400">{result.caveat}</p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {/* Verdict */}
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${result.level.badgeClass}`}
            >
              {result.level.label}
            </span>
            <span
              title={result.confidenceDetail}
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CONFIDENCE_BADGE[result.confidence]}`}
            >
              Confiance {result.confidence}
            </span>
          </div>

          <p className="mt-3 text-sm text-slate-700">
            Sur <span className="font-medium">{result.horizonLabel}</span>, le{" "}
            {result.alreadyRestricted
              ? "maintien ou l'aggravation de la restriction en vigueur"
              : "passage en restriction"}{" "}
            est jugé <span className="font-semibold">{result.level.label.toLowerCase()}</span>.
          </p>

          {/* 4-step gauge */}
          <div className="mt-3 flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className="h-2 flex-1 rounded-full"
                style={{
                  backgroundColor: step <= result.level.rank ? result.level.color : "#e2e8f0",
                }}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Peu probable · Possible · Probable · Très probable
          </p>

          {/* Drivers */}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ce qui pèse sur l&apos;estimation
            </p>
            <ul className="mt-2 space-y-2">
              {result.drivers.map((d, i) => {
                const dir = DIRECTION[d.direction];
                return (
                  <li key={`${d.label}-${i}`} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 w-3 shrink-0 text-center font-semibold ${dir.className}`} title={dir.label}>
                      {dir.arrow}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-800">{d.label}</span>
                      {d.weightPct !== undefined && (
                        <span className="ml-1 text-xs text-slate-400">({d.weightPct} %)</span>
                      )}
                      <span className="block text-xs text-slate-500">{d.detail}</span>
                    </span>
                    {d.score !== undefined && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ backgroundColor: scoreColor(d.score) }}
                        title="Signal 0-100 (élevé = ressource plus tendue)"
                      >
                        {d.score}/100
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="mt-4 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            {result.caveat}
          </p>
        </div>
      )}
    </section>
  );
}
