"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BnpeSummary } from "@/lib/bnpe";

// Declared annual water withdrawals for the site's commune (BNPE / Hub'Eau),
// broken down by usage. Structural context on local pressure — explicitly not
// part of the composite score (see methodology).

const USAGE_COLOR: Record<string, string> = {
  "Agriculture": "#16a34a",
  "Eau potable": "#0284c7",
  "Industrie": "#7c3aed",
  "Énergie": "#dc2626",
  "Canaux": "#0891b2",
  "Tourisme / loisirs": "#db2777",
  "Autres": "#64748b",
};

function fmtVolume(m3: number): string {
  if (m3 >= 1e9) return `${(m3 / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Md m³`;
  if (m3 >= 1e6) return `${(m3 / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Mm³`;
  if (m3 >= 1e3) return `${(m3 / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} milliers m³`;
  return `${m3.toLocaleString("fr-FR")} m³`;
}

type Payload = ({ available: true } & BnpeSummary) | { available: false; message?: string };

export default function BnpePanel({ citycode }: { citycode?: string }) {
  const key = citycode ?? "";
  const [result, setResult] = useState<{ key: string; status: "done" | "failed"; data?: Payload } | null>(null);

  useEffect(() => {
    if (!citycode) return; // no fetch; render handles the missing-commune case
    let cancelled = false;
    fetch(`/api/bnpe?citycode=${encodeURIComponent(citycode)}`)
      .then(async (res) => {
        const data = (await res.json()) as Payload;
        if (!cancelled) setResult({ key, status: "done", data });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [citycode, key]);

  // Loading is derived from a key mismatch (no setState at effect start).
  const state: { status: "loading" | "done" | "failed"; data?: Payload } = !citycode
    ? { status: "done", data: { available: false, message: "Commune inconnue pour ce site." } }
    : result && result.key === key
      ? result
      : { status: "loading" };

  // Narrowed once so the nested render closures see the available shape.
  const summary = state.status === "done" && state.data?.available ? state.data : null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">Prélèvements en eau de la commune</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Volumes d&apos;eau déclarés prélevés sur la commune, par usage (BNPE — Banque Nationale des
        Prélèvements en Eau, OFB). Données <strong>annuelles</strong>, orientées redevances :
        un indicateur de <strong>pression structurelle</strong> sur la ressource locale, pas un
        signal temps réel — il n&apos;entre pas dans le score courant.{" "}
        <Link href="/methodologie" className="text-sky-700 underline hover:text-sky-900">
          Méthodologie
        </Link>
      </p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {state.status === "loading" && <p className="text-sm text-slate-400">Chargement des prélèvements…</p>}
        {state.status === "failed" && <p className="text-sm text-amber-700">Service BNPE indisponible.</p>}
        {state.status === "done" && state.data && !state.data.available && (
          <p className="text-sm text-slate-500">{state.data.message ?? "Aucun prélèvement déclaré."}</p>
        )}

        {state.status === "done" && summary && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-2xl font-bold text-slate-900">{fmtVolume(summary.totalM3)}</p>
              <p className="text-xs text-slate-500">
                prélevés en {summary.annee} · {summary.ouvrages} ouvrage
                {summary.ouvrages > 1 ? "s" : ""}
              </p>
            </div>

            {(summary.surfaceKm2 || summary.population) && (
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                {summary.population ? (
                  <span>
                    ≈{" "}
                    <strong className="text-slate-700">
                      {Math.round(summary.totalM3 / summary.population).toLocaleString("fr-FR")} m³
                    </strong>{" "}
                    / habitant
                  </span>
                ) : null}
                {summary.surfaceKm2 ? (
                  <span>
                    ≈{" "}
                    <strong className="text-slate-700">
                      {fmtVolume(summary.totalM3 / summary.surfaceKm2)}
                    </strong>{" "}
                    / km²
                  </span>
                ) : null}
              </div>
            )}

            <div className="mt-4 flex h-4 w-full overflow-hidden rounded bg-slate-100">
              {summary.parUsage.map((u) => (
                <div
                  key={u.usage}
                  style={{
                    width: `${(u.volumeM3 / summary.totalM3) * 100}%`,
                    backgroundColor: USAGE_COLOR[u.usage] ?? USAGE_COLOR.Autres,
                  }}
                  title={`${u.usage} : ${fmtVolume(u.volumeM3)}`}
                />
              ))}
            </div>

            <ul className="mt-3 space-y-1.5">
              {summary.parUsage.map((u) => {
                const share = Math.round((u.volumeM3 / summary.totalM3) * 100);
                return (
                  <li key={u.usage} className="flex items-center justify-between gap-2 text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-700">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: USAGE_COLOR[u.usage] ?? USAGE_COLOR.Autres }}
                      />
                      {u.usage}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {fmtVolume(u.volumeM3)} <span className="text-slate-400">({share} %)</span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 text-xs text-slate-400">
              Source : BNPE (Hub&apos;Eau, OFB), Licence Ouverte. Volumes déclarés au titre de la
              redevance ; l&apos;année affichée est la plus récente disponible et peut accuser un
              décalage de plusieurs années.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
