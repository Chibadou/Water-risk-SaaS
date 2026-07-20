"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  levelLabel,
  prospectiveScore,
  referenceLevel,
  type ProjectionPayload,
} from "@/lib/projectionsShared";
import { historiqueScore, scoreColor } from "@/lib/score";

// Per-indicator display config: gauge domain and whether a positive change
// means MORE water stress (durations) or less (flows).
const INDICATOR_VIEW: Record<string, { domain: [number, number]; positiveIsWorse: boolean }> = {
  VCN10_ete: { domain: [-65, 50], positiveIsWorse: false },
  QA_yr: { domain: [-45, 50], positiveIsWorse: false },
  dtBE_yr: { domain: [-35, 50], positiveIsWorse: true },
};

function severityColor(value: number, positiveIsWorse: boolean): string {
  const v = positiveIsWorse ? -value : value;
  // v is now "flow-like": negative = worse
  if (v >= 0) return "#059669";
  if (v >= -10) return "#fdd835";
  if (v >= -25) return "#fb8c00";
  return "#e53935";
}

function fmt(v: number | null, unit: string): string {
  if (v === null) return "—";
  const s = `${v > 0 ? "+" : ""}${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`;
  return unit === "%" ? `${s} %` : `${s} j`;
}

function DeltaGauge({
  lo,
  med,
  hi,
  domain,
  positiveIsWorse,
  label,
}: {
  lo: number | null;
  med: number;
  hi: number | null;
  domain: [number, number];
  positiveIsWorse: boolean;
  label: string;
}) {
  const width = 220;
  const height = 26;
  const x = (v: number) =>
    ((Math.max(domain[0], Math.min(domain[1], v)) - domain[0]) / (domain[1] - domain[0])) * width;
  const color = severityColor(med, positiveIsWorse);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="shrink-0">
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#e2e8f0" strokeWidth="2" />
      <line x1={x(0)} y1={3} x2={x(0)} y2={height - 3} stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
      {lo !== null && hi !== null && (
        <rect
          x={x(Math.min(lo, hi))}
          y={height / 2 - 4}
          width={Math.max(2, Math.abs(x(hi) - x(lo)))}
          height={8}
          rx={4}
          fill={color}
          opacity={0.25}
        />
      )}
      <circle cx={x(med)} cy={height / 2} r={5} fill={color} stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

/** Build a semicolon-CSV (Excel-friendly, with BOM) of every warming level ×
 *  indicator for the commune. */
function projectionCsv(data: ProjectionPayload): string {
  const meta = data.meta;
  if (!meta || !data.data) return "";
  const commune = data.commune?.nom ? `${data.commune.nom} (${data.commune.code})` : data.commune?.code ?? "";
  const rows: string[][] = [
    ["Commune", "Niveau de réchauffement", "Indicateur", "Unité", "Q05", "Médiane", "Q95"],
  ];
  for (const level of meta.warming_levels) {
    const ld = data.data[level];
    if (!ld) continue;
    for (const [ind, indMeta] of Object.entries(meta.indicators)) {
      const stat = ld[ind];
      if (!stat) continue;
      const cell = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));
      rows.push([commune, level, indMeta.label, indMeta.unit, cell(stat[0]), cell(stat[1]), cell(stat[2])]);
    }
  }
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

export default function Projection2050({
  lat,
  lon,
  citycode,
  joursAlertePlus,
}: {
  lat: number;
  lon: number;
  citycode?: string;
  joursAlertePlus?: number;
}) {
  const key = `${lat},${lon},${citycode ?? ""}`;
  const [level, setLevel] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ key: string; status: "done" | "failed"; data?: ProjectionPayload } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (citycode) params.set("citycode", citycode);
    fetch(`/api/projection?${params}`)
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
  }, [lat, lon, citycode, key]);

  const state = result && result.key === key ? result : { status: "loading" as const, data: undefined };
  const data = state.data;
  const meta = data?.meta;
  const levels = meta?.warming_levels ?? [];
  const refLevel = referenceLevel(levels);
  const activeLevel = level && levels.includes(level) ? level : refLevel;
  const levelData = data?.data && activeLevel ? data.data[activeLevel] : undefined;

  // Prospective score always reads the +2.7 °C reference trajectory.
  const refVcn10 = data?.data && refLevel ? data.data[refLevel]?.VCN10_ete?.[1] : undefined;
  const hist = joursAlertePlus === undefined ? undefined : historiqueScore(joursAlertePlus);
  const prospective = refVcn10 != null ? prospectiveScore(refVcn10, hist) : undefined;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">Disponibilité en eau — horizon 2050</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Changement projeté par niveau de réchauffement (trajectoire TRACC) vs la référence{" "}
        {meta?.reference ?? "1976-2005"}, calculé sur le <strong>bassin versant de la commune</strong>{" "}
        du site (Explore2). Médiane de l&apos;ensemble multi-modèles et fourchette d&apos;incertitude.{" "}
        <strong>Ce sont des tendances, pas des prévisions.</strong>{" "}
        <Link href="/methodologie" className="text-sky-700 underline hover:text-sky-900">
          Méthodologie
        </Link>
      </p>

      {meta?.demo && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900">
          ⚠️ Données de démonstration (synthétiques) — ne pas utiliser pour une décision.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {state.status === "loading" && <p className="text-sm text-slate-400">Chargement de la projection…</p>}
        {state.status === "failed" && <p className="text-sm text-amber-700">Service de projection indisponible.</p>}
        {state.status === "done" && data && !data.available && (
          <p className="text-sm text-slate-500">{data.message ?? "Projection indisponible pour ce site."}</p>
        )}

        {state.status === "done" && data?.available && levelData && meta && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {levels.map((l) => {
                  const info = levelLabel(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLevel(l)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        activeLevel === l ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                      title={info.sub}
                    >
                      {info.label}
                    </button>
                  );
                })}
              </div>
              {prospective && (
                <div
                  className="flex items-center gap-2"
                  title="Sévérité de la baisse d'étiage projetée (VCN10 été, médiane à +2,7 °C, 70 %) croisée avec la fréquence des restrictions de l'année (30 %). Voir Méthodologie."
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

            {activeLevel && (
              <p className="mt-1 text-xs text-slate-400">{levelLabel(activeLevel).sub}</p>
            )}

            <ul className="mt-4 space-y-3">
              {Object.entries(meta.indicators).map(([ind, indMeta]) => {
                const stat = levelData[ind];
                const view = INDICATOR_VIEW[ind] ?? { domain: [-60, 20] as [number, number], positiveIsWorse: false };
                if (!stat || stat[1] === null) return null;
                const [lo, med, hi] = stat;
                return (
                  <li key={ind} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <div className="min-w-44">
                      <p className="text-sm font-medium text-slate-700" title={indMeta.source_name ?? undefined}>
                        {indMeta.label}
                      </p>
                      <p className="text-xs text-slate-400">
                        {fmt(lo, indMeta.unit)} …{" "}
                        <span className="font-semibold text-slate-600">{fmt(med, indMeta.unit)}</span> …{" "}
                        {fmt(hi, indMeta.unit)}
                      </p>
                    </div>
                    <DeltaGauge
                      lo={lo}
                      med={med!}
                      hi={hi}
                      domain={view.domain}
                      positiveIsWorse={view.positiveIsWorse}
                      label={`${indMeta.label} : médiane ${fmt(med, indMeta.unit)}, fourchette ${fmt(lo, indMeta.unit)} à ${fmt(hi, indMeta.unit)}`}
                    />
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-400">
                Commune {data.commune?.nom ? `${data.commune.nom} (${data.commune.code})` : data.commune?.code} —
                statistiques multi-modèles sur le bassin versant de la commune. Source :{" "}
                {meta.demo ? "données de démonstration" : "Explore2 / DRIAS-Eau (Licence Ouverte)"} · référence{" "}
                {meta.reference}.
              </p>
              <button
                type="button"
                onClick={() => {
                  const csv = projectionCsv(data);
                  if (!csv) return;
                  navigator.clipboard?.writeText(csv).then(
                    () => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    },
                    () => {},
                  );
                }}
                className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {copied ? "Copié ✓" : "Copier les données (CSV)"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
