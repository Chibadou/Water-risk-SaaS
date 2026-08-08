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
import { bassinInfo, SDAGE_NOTE } from "@/lib/bassins";
import Panel from "./ui/Panel";
import { methodologieHref } from "@/lib/methodologie";

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
  const bassin = bassinInfo(zre?.bassin);
  const knownNotZre = zre?.available && zre.zre === false;
  // While the request is in flight this panel used to render "Statut ZRE
  // indisponible" and then flip to the real answer — asserting an absence that
  // was only a wait. Same rule the map made structural at Sprint 32: a service
  // still answering is not a service with nothing to say.
  const pending = citycode !== undefined && (result === null || result.code !== citycode);
  // The ZRE half already had this three-way state; the basin half next to it did
  // not, so a failed /api/transition rendered "Bassin non déterminé pour cette
  // commune" — a lookup result we never obtained, stated as a fact.
  const referentielIndisponible = !pending && zre !== null && !zre.available;

  return (
    <section className="mt-6">
      <h3 className="text-base font-semibold text-ink">Risque de transition</h3>
      <p className="mt-1 max-w-3xl text-sm text-ink-subtle">
        Au-delà du risque physique (sécheresse), la trajectoire réglementaire et politique de
        l&apos;eau fait peser un risque de transition sur les usages consommateurs.{" "}
        <Link href={methodologieHref("transition")} className="text-sky-700 underline hover:text-sky-900">
          Méthodologie
        </Link>
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ZRE status */}
        <Panel variant="reglementaire" tag title="Zone de Répartition des Eaux (ZRE)">
          <div className="mt-2">
            {pending ? (
              <span className="inline-flex items-center rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-subtle">
                Lecture du statut ZRE…
              </span>
            ) : inZre ? (
              <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-900">
                Commune classée en ZRE
              </span>
            ) : knownNotZre ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                Non recensée en ZRE
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-subtle">
                Statut ZRE indisponible
              </span>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{ZRE_EXPLAINER}</p>
          {knownNotZre && (
            <p className="mt-2 text-xs italic text-ink-subtle">
              D&apos;après la couche ZRE nationale (Sandre, France métropolitaine continentale).
            </p>
          )}
        </Panel>

        {/* Which basin authority the site actually deals with. Resolved even
            when the ZRE status is not: the two referentials have different
            reach, and Corsica has a basin but no ZRE layer. */}
        <Panel variant="reglementaire" title="Bassin et agence de l&apos;eau">
          {pending ? (
            <p className="mt-2 text-sm text-ink-subtle">Lecture du référentiel des bassins…</p>
          ) : bassin ? (
            <>
              <p className="mt-2 text-sm text-ink">
                <span className="font-medium">{bassin.agence}</span>
              </p>
              <p className="mt-1 text-xs text-ink-subtle">
                Bassin {bassin.code} — {bassin.nom}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{SDAGE_NOTE}</p>
              <a
                href={bassin.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs text-sky-700 underline hover:text-sky-900"
              >
                Programme d&apos;aides et redevances de l&apos;agence →
              </a>
            </>
          ) : referentielIndisponible ? (
            <p className="mt-2 text-sm text-amber-700">
              Référentiel des bassins injoignable : le bassin de cette commune n&apos;a pas pu être
              consulté.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-subtle">
              Bassin non déterminé pour cette commune.
            </p>
          )}
        </Panel>

        {/* Plan Eau + sector trajectory */}
        <Panel variant="pedagogie" title={`${PLAN_EAU.title} — trajectoire`}>
          <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{PLAN_EAU.summary}</p>
          <ul className="mt-3 space-y-1">
            {PLAN_EAU.measures.map((m) => (
              <li key={m} className="flex items-start gap-1.5 text-xs text-ink-muted">
                <span className="mt-0.5 text-sky-600">→</span>
                {m}
              </li>
            ))}
          </ul>
          {secteur && (
            <p className="mt-3 rounded-md border border-slate-100 bg-canvas px-2.5 py-2 text-xs text-ink-muted">
              <span className="font-semibold">Pour votre secteur : </span>
              {sectorTransition(secteur)}
            </p>
          )}
        </Panel>
      </div>
    </section>
  );
}
