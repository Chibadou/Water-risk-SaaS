"use client";

import Link from "next/link";
import { useMemo } from "react";
import { GRAVITE } from "@/lib/gravite";
import type { NiveauGravite } from "@/lib/types";
import Panel from "./ui/Panel";
import { PanelSkeleton } from "./ui/Skeleton";
import { methodologieHref } from "@/lib/methodologie";
import { NIVEAUX } from "@/lib/juridiction";
import { couvertureVecteur, type EntreeNomenclature } from "@/lib/nomenclature";
import type { SiteUsage } from "@/lib/sites";

// Chapter 2 of the site sheet: what the arrêtés actually cost this site.
//
// ⚠️ This replaces InterruptionPanel (Sprint 21 → 42b). What was removed is the
// `joursContraints` headline — days × exposure × an invented dependence factor —
// and what stays is the part that made the figure auditable: the ρ read per usage,
// with an interval wherever the arrêté left a measure unquantified.
//
// The three output figures themselves are rendered by IndicateursNote, from a
// single computation in lib/indicateurs.ts. This panel is now the EVIDENCE
// chapter: it shows the measures the prefecture wrote, so a reader can check the
// numbers rather than take them.

const LEVELS = NIVEAUX;

export interface RestrictionsPayload {
  available?: boolean;
  origin?: "restrictions" | "guide";
  exposure?: Partial<Record<NiveauGravite, number>>;
  /**
   * The truth (G2): [min, max] per level, widened by every measure whose ρ could
   * not be read. `exposure` is only its lower bound.
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
          /** ids of the arrêtés the measure was read from (Sprint 44) */
          arretes?: string[];
        }[];
      }
    >
  >;
  /** decree table for the department: id → numero, zone */
  arretes?: Record<string, { numero?: string | null; zone?: string | null }>;
  message?: string;
}

export default function ImpactPanel({
  restrictions,
  usages,
}: {
  /**
   * `undefined` = not asked yet (skeleton), `null` = asked and failed (refusal).
   * Fetched by HomeClient, which needs the same payload for lib/indicateurs.
   */
  restrictions?: RestrictionsPayload | null;
  /** the site's declared usage vector, for the nomenclature coverage below */
  usages?: SiteUsage[];
}) {
  const criseDetail = restrictions?.detail?.crise;
  const interval = restrictions?.exposureInterval ?? {};

  // The nomenclature to match the site's declared usages against.
  //
  // ⚠️ Taken from the PAYLOAD, not from data/restrictions/guide.json. Two reasons,
  // and the first is the one that matters: these are the labels of the measures that
  // actually apply to THIS site — its department, its zone type — whereas guide.json
  // is the national fallback. Matching against the national guide when the department
  // published its own arrêtés would report coverage of a document that does not
  // govern the site. The second reason is mechanical: guide.json is read server-side
  // with `fs` (lib/restrictionsData.ts), so a client component cannot import it.
  //
  // Levels are unioned rather than read from `crise` alone: a usage restricted only
  // from alerte renforcée onwards is still a usage the nomenclature names.
  const nomenclature = useMemo<EntreeNomenclature[]>(() => {
    const vus = new Map<string, EntreeNomenclature>();
    for (const level of LEVELS) {
      for (const u of restrictions?.detail?.[level]?.usages ?? []) {
        if (!vus.has(u.usage)) vus.set(u.usage, { usage: u.usage });
      }
    }
    return [...vus.values()];
  }, [restrictions]);

  const couverture = useMemo(
    () =>
      usages && usages.length > 0 && nomenclature.length > 0
        ? couvertureVecteur(usages, nomenclature)
        : undefined,
    [usages, nomenclature],
  );

  return (
    <section className="mt-6">
      <h3 className="text-base font-semibold text-ink">Ce que les arrêtés prescrivent</h3>
      <p className="mt-1 max-w-3xl text-sm text-ink-subtle">
        La part de l&apos;activité que chaque niveau d&apos;arrêté empêche, lue dans les mesures que la
        préfecture a écrites, usage par usage. C&apos;est <strong>l&apos;entrée</strong> des trois
        sorties ci-dessous : la voir, c&apos;est pouvoir les contester.{" "}
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
      ) : restrictions === null || !restrictions.available ? (
        <Panel variant="modele" className="mt-4 text-sm text-ink-subtle">
          {restrictions?.message ??
            "Restrictions par usage indisponibles pour cette zone. ⚠️ Ce n'est pas « aucune restriction » : c'est « les mesures n'ont pas pu être lues », et les trois sorties ci-dessous le disent plutôt que de compter 0."}
        </Panel>
      ) : (
        <Panel variant="reglementaire" tag className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">
              Part de l&apos;activité empêchée, par niveau
            </h3>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                restrictions.origin === "restrictions"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
              title={
                restrictions.origin === "restrictions"
                  ? "Lue dans les arrêtés publiés pour ce département et ce type de zone."
                  : "Aucune restriction publiée pour cette zone : repli sur le guide national de référence."
              }
            >
              {restrictions.origin === "restrictions"
                ? "Arrêtés de la zone"
                : "Guide national (repli)"}
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {LEVELS.map((level) => {
              const e = interval[level];
              // ⚠️ The bar shows the LOWER bound and the label shows the range.
              // A single bar at the midpoint would invent a central value the
              // arrêté never gave — the whole point of G2 is that [0, 1] stays
              // [0, 1] until someone reads the measure.
              const min = e === undefined ? undefined : Math.round(e.min * 100);
              const max = e === undefined ? undefined : Math.round(e.max * 100);
              return (
                <div key={level} className="flex items-center gap-3 text-sm">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: GRAVITE[level].color }}
                  />
                  <span className="w-36 shrink-0 text-ink-muted">{GRAVITE[level].label}</span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    {min !== undefined && (
                      <span
                        className="absolute inset-y-0 left-0 block rounded-full"
                        style={{ width: `${min}%`, backgroundColor: GRAVITE[level].color }}
                      />
                    )}
                    {min !== undefined && max !== undefined && max > min && (
                      <span
                        className="absolute inset-y-0 block rounded-full opacity-30"
                        style={{
                          left: `${min}%`,
                          width: `${max - min}%`,
                          backgroundColor: GRAVITE[level].color,
                        }}
                      />
                    )}
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-ink-muted">
                    {min === undefined
                      ? "—"
                      : max !== undefined && max > min
                        ? `${min}–${max} %`
                        : `${min} %`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-subtle">
            Une fourchette signifie qu&apos;au moins une mesure de l&apos;arrêté n&apos;est pas
            chiffrée. La barre pleine est la borne basse, la barre pâle l&apos;incertitude — jamais un
            point moyen, qui inventerait une valeur que l&apos;arrêté n&apos;a pas écrite.
          </p>

          {/* Nomenclature coverage — §3.3.

              ⚠️ Placed here, immediately under the bars and ABOVE the measures, because
              it QUALIFIES the bars: it says what share of the site's own volume the
              figures above are evidence about. A site whose main usage the arrêtés
              never name gets a percentage that is real and about someone else.

              The figure is a share of VOLUME, never a count of usages. Four usages
              matched out of five reads like 80 % and means nothing if the fifth carries
              most of the withdrawal. */}
          {couverture && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                couverture.partVolumeCouverte !== undefined
                  && couverture.partVolumeCouverte < 0.999
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-slate-50 text-ink-subtle"
              }`}
            >
              <p className="font-medium">
                Rapprochement de vos usages avec la nomenclature des arrêtés
              </p>
              <p className="mt-1">{couverture.detail}</p>
              <p className="mt-1 tabular-nums">
                {couverture.rapproches} usage{couverture.rapproches > 1 ? "s" : ""} rapproché
                {couverture.rapproches > 1 ? "s" : ""}
                {couverture.nonRapproches > 0 && (
                  <> · {couverture.nonRapproches} sans correspondance</>
                )}
                {couverture.ambigus > 0 && (
                  <>
                    {" "}
                    · {couverture.ambigus} ambigu{couverture.ambigus > 1 ? "s" : ""} (non appliqué
                    {couverture.ambigus > 1 ? "s" : ""} : deux mesures différentes, l&apos;outil ne
                    tire pas au sort)
                  </>
                )}
              </p>
            </div>
          )}

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
                      {/* ADR-006, anti-pattern n°7: every number walks back to a
                          document. The decree numbers are the last link in the
                          chain — without them the trail stops at "the arrêtés say
                          so", which is not a trail. */}
                      {u.arretes && u.arretes.length > 0 && (
                        <span className="block text-xs text-ink-subtle">
                          Arrêté{u.arretes.length > 1 ? "s" : ""}{" "}
                          {u.arretes
                            .map((id) => restrictions?.arretes?.[id]?.numero ?? `id ${id}`)
                            .join(" · ")}
                        </span>
                      )}
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
        </Panel>
      )}
    </section>
  );
}
