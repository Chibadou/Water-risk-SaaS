"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PLAN_EAU,
  ZRE_EXPLAINER,
  sectorTransition,
  type TransitionPayload,
} from "@/lib/transition";
import type { Secteur } from "@/lib/sites";

// Transition-risk context: the regulatory/policy trajectory a site faces
// (ZRE status + Plan Eau + sector direction) — complements the physical-risk
// signals with the "transition" half of a TCFD/CSRD climate-risk view.
export default function TransitionRiskPanel({
  citycode,
  secteur,
}: {
  citycode?: string;
  secteur?: Secteur;
}) {
  const [result, setResult] = useState<{ code: string; payload: TransitionPayload } | null>(null);

  useEffect(() => {
    if (!citycode) return;
    let cancelled = false;
    fetch(`/api/transition?citycode=${encodeURIComponent(citycode)}`)
      .then((r) => r.json())
      .then((b: TransitionPayload) => {
        if (!cancelled) setResult({ code: citycode, payload: b });
      })
      .catch(() => {
        if (!cancelled) setResult({ code: citycode, payload: { available: false } });
      });
    return () => {
      cancelled = true;
    };
  }, [citycode]);

  // Only trust the result if it matches the site currently displayed.
  const zre = result && result.code === citycode ? result.payload : null;
  const inZre = zre?.available && zre.zre === true;
  const knownNotZre = zre?.available && zre.zre === false;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">Risque de transition</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Au-delà du risque physique (sécheresse), la trajectoire réglementaire et politique de
        l&apos;eau fait peser un risque de transition sur les usages consommateurs.{" "}
        <Link href="/methodologie" className="text-sky-700 underline hover:text-sky-900">
          Méthodologie
        </Link>
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ZRE status */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">Zone de Répartition des Eaux (ZRE)</h3>
          <div className="mt-2">
            {inZre ? (
              <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-900">
                Commune classée en ZRE
              </span>
            ) : knownNotZre ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                Non recensée en ZRE
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                Statut ZRE indisponible
              </span>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{ZRE_EXPLAINER}</p>
          {knownNotZre && (
            <p className="mt-2 text-[11px] italic text-slate-400">
              Couverture partielle : selon les couches ZRE disponibles. L&apos;absence de
              classement ici ne garantit pas l&apos;absence de ZRE sur la commune.
            </p>
          )}
        </div>

        {/* Plan Eau + sector trajectory */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">{PLAN_EAU.title} — trajectoire</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{PLAN_EAU.summary}</p>
          <ul className="mt-3 space-y-1">
            {PLAN_EAU.measures.map((m) => (
              <li key={m} className="flex items-start gap-1.5 text-xs text-slate-600">
                <span className="mt-0.5 text-sky-600">→</span>
                {m}
              </li>
            ))}
          </ul>
          {secteur && (
            <p className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
              <span className="font-semibold">Pour votre secteur : </span>
              {sectorTransition(secteur)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
