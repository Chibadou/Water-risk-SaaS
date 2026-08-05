"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { computeRessource, type RessourceResult } from "@/lib/ressource";
import type { BnpeSummary } from "@/lib/bnpe";
import type { OrigineEau } from "@/lib/sites";

// How much renewable water the site's territory produces, and what share of it
// is already withdrawn. Informative only — nothing here enters the composite
// score, same rule as BnpePanel.
//
// The whole calculation is displayed step by step rather than as a headline
// number. This is a MODEL, not a reading: a figure whose derivation is hidden
// invites more trust than it has earned.

const CLASSE_STYLE: Record<string, string> = {
  faible: "border-emerald-200 bg-emerald-50 text-emerald-800",
  modere: "border-yellow-200 bg-yellow-50 text-yellow-900",
  eleve: "border-orange-200 bg-orange-50 text-orange-900",
  tres_eleve: "border-red-200 bg-red-50 text-red-900",
  extreme: "border-purple-200 bg-purple-50 text-purple-950",
};

const CONFIANCE_LABEL: Record<RessourceResult["confiance"], string> = {
  haute: "Confiance haute",
  moyenne: "Confiance moyenne",
  faible: "Confiance faible",
};

interface Props {
  citycode?: string;
  origine?: OrigineEau;
  volumeSiteM3?: number;
  /** from the attached hydrometric station, via IndicatorSummary */
  ressource?: {
    moduleM3s: number;
    anneesModule: number;
    surfaceBvKm2?: number;
    influenceCode?: number | null;
  };
  distanceStationKm?: number;
}

export default function RessourcePanel({
  citycode,
  origine,
  volumeSiteM3,
  ressource,
  distanceStationKm,
}: Props) {
  // Keyed result rather than a synchronous setState in the effect: ESLint
  // forbids the latter here, and the key mismatch doubles as the loading state
  // when the commune changes (the repo's established pattern).
  const [result_, setResult] = useState<{ key: string; data: BnpeSummary | null } | null>(null);

  useEffect(() => {
    if (!citycode) return;
    let cancelled = false;
    fetch(`/api/bnpe?citycode=${encodeURIComponent(citycode)}`)
      .then(async (r) => {
        // The route flattens the summary next to `available` rather than
        // nesting it — read it as it is actually served.
        const body = (await r.json()) as { available?: boolean } & Partial<BnpeSummary>;
        if (!cancelled) {
          setResult({ key: citycode, data: body.available ? (body as BnpeSummary) : null });
        }
      })
      .catch(() => {
        // Withdrawals stay unknown: the exploitation rate simply is not shown,
        // rather than being computed against a zero.
        if (!cancelled) setResult({ key: citycode, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [citycode]);

  const bnpe = citycode ? (result_?.key === citycode ? result_.data : undefined) : null;

  const result = computeRessource({
    moduleM3s: ressource?.moduleM3s,
    anneesModule: ressource?.anneesModule,
    surfaceBvKm2: ressource?.surfaceBvKm2,
    influenceCode: ressource?.influenceCode,
    surfaceCommuneKm2: bnpe?.surfaceKm2,
    prelevementsCommuneM3: bnpe?.totalM3,
    volumeSiteM3,
    origine,
    distanceStationKm,
  });

  const loading = bnpe === undefined && citycode !== undefined;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Ressource en eau du territoire</h3>
        {result.available && (
          <span className="text-xs text-slate-400">{CONFIANCE_LABEL[result.confiance]}</span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Combien d&apos;eau renouvelable le territoire de ce site produit chaque année, et quelle
        part en est déjà prélevée. Estimation par <strong>débit spécifique</strong> — la méthode de
        référence pour un territoire non jaugé. <Link href="/methodologie" className="underline">Méthodologie</Link>.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-400">Chargement…</p>
      ) : !result.available ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm text-slate-600">{result.message}</p>
          {result.debitSpecifiqueLsKm2 !== undefined && (
            <p className="mt-2 text-xs text-slate-500">
              Débit spécifique mesuré sur le bassin de la station rattachée :{" "}
              <strong className="tabular-nums">
                {result.debitSpecifiqueLsKm2.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
              </strong>{" "}
              l/s/km².
            </p>
          )}
        </div>
      ) : (
        <>
          {/* The headline: pressure on the watercourse. This is the ratio the
              WRI scale was built for — withdrawals against the water actually
              available, upstream inflow included. */}
          {result.classePression && result.pressionCoursEau !== undefined && (
            <div
              className={`mt-4 rounded-lg border px-4 py-3 ${CLASSE_STYLE[result.classePression.id] ?? "border-slate-200 bg-slate-50"}`}
            >
              <p className="text-xs font-medium uppercase tracking-wide opacity-70">
                Pression sur le cours d&apos;eau
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">
                {(result.pressionCoursEau * 100).toLocaleString("fr-FR", {
                  maximumFractionDigits: 1,
                })}{" "}
                %
              </p>
              <p className="text-sm font-semibold">{result.classePression.label}</p>
              <p className="mt-1 text-xs opacity-80">
                « Le cours d&apos;eau a-t-il assez d&apos;eau ? » — prélèvements de la commune
                rapportés au débit disponible. Échelle WRI Aqueduct, celle des référentiels ESG.
              </p>
            </div>
          )}

          {/* A DIFFERENT question, deliberately never graded on the WRI scale:
              grading it there was the defect this sprint corrects. */}
          {result.autonomieTerritoire !== undefined && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Autonomie du territoire
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
                {result.dependanceAmont
                  ? `× ${result.autonomieTerritoire.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`
                  : `${(result.autonomieTerritoire * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                « Ce territoire vit-il de sa propre eau ? » — prélèvements rapportés à ce que la
                commune produit elle-même.{" "}
                {result.dependanceAmont
                  ? "Au-delà de 1, elle vit d'une eau produite en amont : c'est le cas ordinaire d'une ville sur un grand cours d'eau, pas une surexploitation."
                  : "Volontairement sans classe : cette question n'est pas celle de l'échelle WRI."}
              </p>
            </div>
          )}

          {/* The chain, visible. This is a model — hiding its derivation would
              invite more trust than it deserves. */}
          <ol className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {result.etapes.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                <span className="text-sm text-slate-600">
                  {e.label}
                  {e.detail && (
                    <span className="ml-1.5 text-xs text-slate-400">— {e.detail}</span>
                  )}
                </span>
                <span className="tabular-nums text-sm font-semibold text-slate-900">{e.valeur}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {result.reserves.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Ce que ce chiffre n&apos;est pas
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {result.reserves.map((c, i) => (
              <li key={i} className="text-xs leading-relaxed text-amber-900">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
