"use client";

import Link from "next/link";
import { useEffect } from "react";
import { computeAnticipation, type SignalInput } from "@/lib/anticipation";
import { computeInterruption, type ExposureByLevel, type Horizon } from "@/lib/interruption";
import { GRAVITE } from "@/lib/gravite";
import type { YearHistory } from "@/lib/history";
import type { Dependance } from "@/lib/sites";
import type { CommuneProjection } from "@/lib/projectionsShared";
import type { NiveauGravite } from "@/lib/types";
import type { IndicatorSummary } from "./SiteIndicators";
import Panel from "./ui/Panel";
import { PanelSkeleton } from "./ui/Skeleton";
import { methodologieHref } from "@/lib/methodologie";

// The synthesis panel: how many days a year this site's activity is actually
// held back. It is the one figure the three detail blocks below never produced
// on their own — the arrêtés give measured days, the restrictions say how hard
// each level bites, and Explore2 says how that changes by 2050.

const LEVELS: NiveauGravite[] = ["vigilance", "alerte", "alerte_renforcee", "crise"];
const REFERENCE_LEVEL = "+2.7°C France";

export interface RestrictionsPayload {
  available?: boolean;
  origin?: "restrictions" | "guide";
  exposure?: ExposureByLevel;
  /**
   * The truth (G2): [min, max] per level, widened by every measure whose ρ could
   * not be read. `exposure` above is only its lower bound, kept for the days
   * model until lib/interruption.ts goes.
   */
  exposureInterval?: Partial<Record<NiveauGravite, { min: number; max: number }>>;
  detail?: Partial<
    Record<
      NiveauGravite,
      {
        exposure?: { min: number; max: number };
        unquantified: number;
        recommendation: number;
        reportingOnly: number;
        usages: {
          usage: string;
          // ⚠️ Retyped inline rather than imported, as it already was. That is
          // why TypeScript said nothing when ρ became an interval — this shape
          // has to be kept in step with lib/restrictions.ts by hand.
          severity: { rho: { type: string; min: number; max: number }; detail: string };
        }[];
      }
    >
  >;
  message?: string;
}

/** The figures this chapter publishes to the page's synthesis. */
export interface InterruptionSummary {
  anneeType?: number;
  finSaison?: number;
  horizon2050?: number;
  arret?: number;
}

function toSignal(s: IndicatorSummary | null | undefined): SignalInput | null | undefined {
  if (s === undefined) return undefined;
  if (s === null) return null;
  return { score: s.reference?.score, trend: s.trend, higherIsBetter: s.higherIsBetter };
}

function HorizonCard({ h, hero }: { h: Horizon; hero: boolean }) {
  if (!h.available) {
    return (
      <div className="rounded-lg border border-line bg-canvas p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{h.label}</p>
        <p className="mt-2 text-sm text-ink-subtle">Indisponible</p>
        <p className="mt-1 text-xs text-ink-subtle">{h.detail}</p>
      </div>
    );
  }
  return (
    <div
      className={`rounded-lg border p-4 ${
        hero ? "border-sky-200 bg-sky-50/50" : "border-line bg-surface"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{h.label}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums text-ink">
          {Math.round(h.joursContraints ?? 0)}
        </span>
        <span className="text-sm text-ink-subtle">j / an</span>
      </p>
      {h.lo !== undefined && h.hi !== undefined && (
        <p className="mt-0.5 text-xs tabular-nums text-ink-subtle">
          fourchette {Math.round(h.lo)} – {Math.round(h.hi)} j
        </p>
      )}
      <p className="mt-2 text-sm text-ink-muted">
        dont{" "}
        <span className="font-semibold tabular-nums">{Math.round(h.joursArret ?? 0)} j</span>{" "}
        d&apos;arrêt des prélèvements non prioritaires
      </p>
      <p className="mt-2 text-xs text-ink-subtle">
        sur {h.joursSousArrete ?? 0} j sous arrêté · {h.detail}
      </p>
      {h.message && <p className="mt-1 text-xs text-amber-700">{h.message}</p>}
    </div>
  );
}

export default function InterruptionPanel({
  worst,
  histInfo,
  onde,
  sol,
  indicators,
  dependance,
  projection,
  restrictions,
  onResult,
}: {
  worst?: string | null;
  histInfo: {
    moyen?: number;
    annees?: number;
    parAnnee?: Record<string, YearHistory>;
    parMois?: Record<string, Record<number, number>>;
    parMoisNiveau?: Record<string, Record<number, Partial<Record<NiveauGravite, number>>>>;
  };
  onde?: { score: number; stations: number } | null;
  sol?: { score: number; label: string; detail: string; stale?: boolean } | null;
  indicators: { hydro?: IndicatorSummary | null; piezo?: IndicatorSummary | null };
  dependance?: Dependance;
  projection?: CommuneProjection;
  /**
   * The restriction reference, fetched by HomeClient and passed down. It used to
   * be fetched here, which made this panel its sole owner; the note's VNP needs
   * the same ρ interval, and this panel is scheduled for removal (G1), so the
   * fetch moved to the component that will still be there afterwards.
   *
   * `undefined` = not asked yet (skeleton), `null` = asked and failed (refusal).
   */
  restrictions?: RestrictionsPayload | null;
  /**
   * Reports the computed horizons upward, so the written synthesis at the top
   * of the page can state the same figures this chapter details.
   */
  onResult?: (r: InterruptionSummary | null) => void;
}) {
  // The anticipation index already blends seasonal climatology with the live
  // precursors; reuse it rather than re-deriving the same signals here.
  const anticipation = computeAnticipation({
    worst,
    anneesCompletes: histInfo.annees,
    parMois: histInfo.parMois,
    parAnnee: histInfo.parAnnee,
    nappe: toSignal(indicators.piezo),
    debit: toSignal(indicators.hydro),
    onde: onde === undefined ? undefined : onde ? { score: onde.score } : null,
    // A stale reading is treated as absent rather than as a current one: the
    // index renormalises over the signals it actually has.
    sol: sol === undefined ? undefined : sol && !sol.stale ? { score: sol.score } : null,
    stationDistanceKm: indicators.piezo?.distanceKm ?? indicators.hydro?.distanceKm,
  });

  const proj = projection?.[REFERENCE_LEVEL];
  const result = computeInterruption({
    worst,
    parAnnee: histInfo.parAnnee,
    parMois: histInfo.parMois,
    parMoisNiveau: histInfo.parMoisNiveau,
    anneesCompletes: histInfo.annees,
    exposure: restrictions?.exposure,
    exposureSource: restrictions?.origin ?? "indisponible",
    dependance,
    anticipationIndex: anticipation.available ? anticipation.index : undefined,
    projection: proj
      ? { dtBE: proj["dtBE_yr"], vcn10: proj["VCN10_ete"] }
      : undefined,
  });

  // Report upward. Keyed on the values themselves rather than on the result
  // object, which is rebuilt on every render and would loop.
  const jours = (id: string) => {
    const h = result.horizons.find((x) => x.id === id);
    return h?.available ? h.joursContraints : undefined;
  };
  const anneeType = result.available ? jours("annee_type") : undefined;
  const finSaison = result.available ? jours("fin_saison") : undefined;
  const horizon2050 = result.available ? jours("horizon_2050") : undefined;
  const arret = result.available
    ? result.horizons.find((x) => x.id === "annee_type")?.joursArret
    : undefined;
  useEffect(() => {
    if (!onResult) return;
    onResult(
      anneeType === undefined && finSaison === undefined && horizon2050 === undefined
        ? null
        : { anneeType, finSaison, horizon2050, arret },
    );
  }, [onResult, anneeType, finSaison, horizon2050, arret]);

  const criseDetail = restrictions?.detail?.crise;

  return (
    <section className="mt-6">
      <h3 className="text-base font-semibold text-ink">Jours d&apos;activité contrainte</h3>
      <p className="mt-1 max-w-3xl text-sm text-ink-subtle">
        Combien de jours par an les restrictions freinent réellement l&apos;activité de ce site. Les
        jours viennent des arrêtés publiés ; leur poids est lu dans les mesures que la préfecture a
        écrites, usage par usage.{" "}
        <Link href={methodologieHref("jours-contraints")} className="text-sky-700 underline hover:text-sky-900">
          Méthodologie
        </Link>
      </p>

      {restrictions === undefined ? (
        <PanelSkeleton
          className="mt-4"
          lines={6}
          label="Lecture des mesures prescrites dans les arrêtés…"
        />
      ) : !result.available ? (
        <Panel variant="modele" className="mt-4 text-sm text-ink-subtle">
          {result.message ?? "Données insuffisantes."}
          <p className="mt-2 text-xs text-ink-subtle">{result.caveat}</p>
        </Panel>
      ) : (
        <Panel variant="modele" tag className="mt-4">
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {result.horizons.map((h) => (
              <HorizonCard key={h.id} h={h} hero={h.id === "annee_type"} />
            ))}
          </div>

          {/* Exposure per level — what turns days under an arrêté into days lost */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">
                Part de l&apos;activité empêchée, par niveau
              </h3>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  result.exposureSource === "restrictions"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
                title={
                  result.exposureSource === "restrictions"
                    ? "Lue dans les arrêtés publiés pour ce département et ce type de zone."
                    : "Aucune restriction publiée pour cette zone : repli sur le guide national de référence."
                }
              >
                {result.exposureSource === "restrictions"
                  ? "Arrêtés de la zone"
                  : "Guide national (repli)"}
              </span>
            </div>
            <div className="mt-3 space-y-1.5">
              {LEVELS.map((level) => {
                const e = result.exposureUsed[level];
                const pct = e === undefined ? undefined : Math.round(Math.min(1, e * result.dependanceFactor) * 100);
                return (
                  <div key={level} className="flex items-center gap-3 text-sm">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: GRAVITE[level].color }}
                    />
                    <span className="w-36 shrink-0 text-ink-muted">{GRAVITE[level].label}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      {pct !== undefined && (
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: GRAVITE[level].color }}
                        />
                      )}
                    </span>
                    <span className="w-16 shrink-0 text-right tabular-nums text-ink-muted">
                      {pct === undefined ? "—" : `${pct} %`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* The usages behind the crisis figure — makes the headline auditable */}
          {criseDetail && criseDetail.usages.length > 0 && (
            <details className="mt-4 border-t border-slate-100 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-ink-muted">
                Ce qui est réellement restreint en crise ({criseDetail.usages.length} usages)
              </summary>
              <ul className="mt-3 space-y-1.5">
                {criseDetail.usages.slice(0, 12).map((u, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-20 shrink-0 text-right tabular-nums font-medium text-ink-muted">
                      {/* An interval when the arrêté left the measure unquantified —
                          never a point value silently imputed (note §3.2). */}
                      {Math.abs(u.severity.rho.max - u.severity.rho.min) < 1e-9
                        ? `${Math.round(u.severity.rho.min * 100)} %`
                        : `${Math.round(u.severity.rho.min * 100)}–${Math.round(
                            u.severity.rho.max * 100,
                          )} %`}
                    </span>
                    <span className="text-ink-muted">
                      {u.usage}
                      <span className="block text-xs text-ink-subtle">{u.severity.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {criseDetail.unquantified > 0 && (
                <p className="mt-2 text-xs text-ink-subtle">
                  {criseDetail.unquantified} mesure{criseDetail.unquantified > 1 ? "s" : ""} sans
                  quantité dans l&apos;arrêté — compté{criseDetail.unquantified > 1 ? "es" : "e"} en
                  fourchette de 0 à 100 %, jamais ramené
                  {criseDetail.unquantified > 1 ? "es" : ""} à une valeur unique.
                </p>
              )}
              {(criseDetail.recommendation > 0 || criseDetail.reportingOnly > 0) && (
                <p className="mt-1 text-xs text-ink-subtle">
                  {criseDetail.recommendation > 0 && (
                    <>
                      {criseDetail.recommendation} mesure
                      {criseDetail.recommendation > 1 ? "s" : ""} de sensibilisation (aucun volume
                      perdu)
                      {criseDetail.reportingOnly > 0 ? " · " : "."}
                    </>
                  )}
                  {criseDetail.reportingOnly > 0 && (
                    <>
                      {criseDetail.reportingOnly} obligation
                      {criseDetail.reportingOnly > 1 ? "s" : ""} de déclaration — charge de
                      conformité, pas de réduction.
                    </>
                  )}
                </p>
              )}
            </details>
          )}

          <p className="mt-4 rounded-lg bg-canvas p-3 text-xs text-ink-subtle">{result.caveat}</p>
        </Panel>
      )}
    </section>
  );
}
