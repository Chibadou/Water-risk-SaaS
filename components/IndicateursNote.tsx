"use client";

import { useMemo } from "react";
import Panel from "./ui/Panel";
import { computeVnp, meanDaysByMonth, resolveVref, vnpComponents, PLAN_EAU_2030 } from "@/lib/vnp";
import { computeIa, episodesFromPeriodes } from "@/lib/ia";
import { profileCompleteness, usageTotals } from "@/lib/siteProfile";
import type { DonneesInternes, ResponseType, SiteUsage } from "@/lib/sites";
import type { NiveauGravite } from "@/lib/types";

// The two physical indicators of the note technique — VNP (m³) and IA (JEA) —
// shown next to the existing constrained-days figure rather than replacing it.
//
// Arbitrage G16: wire first, remove second. Two day-figures coexist for one
// version, which is uncomfortable, but it is the only order that lets the old and
// the new be compared on the same data — and a wrong new figure be caught before
// its witness is deleted.
//
// ⚠️ Everything here is DERIVED from state the site sheet already holds. No new
// fetch, no new source: if a figure is missing it is because a declaration is
// missing, and the panel says which one.

export interface IndicateursNoteProps {
  /** exposure interval per level, from /api/restrictions (G2) */
  exposureInterval?: Partial<Record<NiveauGravite, { min: number; max: number }>>;
  /** mean days per level over the complete years — the same input the days model uses */
  joursParNiveau?: Partial<Record<NiveauGravite, number>>;
  /** year → month → level → days, for the seasonal weighting (G19) */
  parMoisNiveau?: Record<string, Record<number, Partial<Record<NiveauGravite, number>>>>;
  anneesCompletes?: number;
  /** run-length restriction calendar of the governing zone, for the episodes */
  periodes?: number[];
  interne: DonneesInternes;
  usages?: SiteUsage[];
  reponse?: ResponseType;
  /** true when the site is a classified installation (ICPE) */
  icpe?: boolean;
}

const fmt = (v: number) => Math.round(v).toLocaleString("fr-FR");

/** "12 000 m³" or "12 000 à 19 000 m³" — never a point where a range is real. */
function fourchette(min: number, max: number, unite: string): string {
  return Math.abs(max - min) < 1
    ? `${fmt(min)} ${unite}`
    : `${fmt(min)} à ${fmt(max)} ${unite}`;
}

export default function IndicateursNote({
  exposureInterval,
  joursParNiveau,
  parMoisNiveau,
  anneesCompletes,
  periodes,
  interne,
  usages,
  reponse,
  icpe,
}: IndicateursNoteProps) {
  const result = useMemo(() => {
    const exposure = exposureInterval ?? {};
    const vref = resolveVref({ volumeDeclareM3: interne.volumeM3, icpe });
    const totals = usageTotals(usages, interne.volumeM3);
    const currentYear = new Date().getUTCFullYear();

    const vnp = computeVnp({
      daysByLevel: joursParNiveau ?? {},
      daysByMonthAndLevel: meanDaysByMonth(parMoisNiveau, anneesCompletes ?? 0, currentYear),
      exposure,
      vref,
      // Only pass the exempt volume when the vector actually declares one:
      // passing 0 would claim "nothing is exempt", which is a different statement
      // from "we were not told".
      exemptM3: totals.exempt > 0 ? totals.exempt : undefined,
      tauxRestitution: interne.tauxRestitution,
      profilMensuel: interne.profilMensuel,
      trajectoire: PLAN_EAU_2030,
    });

    const ia = computeIa({
      episodes: episodesFromPeriodes(periodes),
      exposure,
      vrefM3: interne.volumeM3,
      exemptM3: totals.exempt > 0 ? totals.exempt : undefined,
      tauxRestitution: interne.tauxRestitution,
      reponse,
      tamponM3: interne.tamponM3,
      autonomieJours: interne.autonomieJours,
      seuilTechniqueM3: interne.seuilTechniqueM3,
      paliers: interne.paliers,
      profilMensuel: interne.profilMensuel,
      anneesCouvertes: anneesCompletes,
    });

    const completeness = profileCompleteness({ usages, reponse, interne });
    return { vnp, ia, completeness };
  }, [
    exposureInterval,
    joursParNiveau,
    parMoisNiveau,
    anneesCompletes,
    periodes,
    interne,
    usages,
    reponse,
    icpe,
  ]);

  const { vnp, ia, completeness } = result;
  const composantes = vnpComponents(vnp);
  const hypotheses = [...vnp.hypotheses, ...ia.hypotheses];

  return (
    <Panel
      // `modele` and not `reglementaire`: these are computed figures, not the
      // content of an arrêté. The variant is what makes that visible.
      variant="modele"
      as="section"
      // ⚠️ A <section> only becomes a landmark once it is named. Removing this
      // line was tried on purpose: the e2e suite stops finding the panel by role
      // at all, so the whole section becomes invisible to a screen reader's
      // landmark navigation while looking untouched on screen.
      ariaLabel="Volume non prélevable et interruption d'activité"
      id="indicateurs-physiques"
      eyebrow="Note technique — indicateurs physiques"
      title="Volume non prélevable et interruption d'activité"
    >
      <p className="text-sm text-ink-muted">
        Deux indicateurs en unités physiques, donc <strong>invariants au cadre réglementaire</strong> —
        contrairement au décompte de jours, dont la nomenclature a déjà changé en 2021. Ils se calculent
        sur ce que vous avez déclaré : quand une déclaration manque, l&apos;outil le dit plutôt que de
        supposer.
      </p>

      {/* --- VNP : deux composantes, JAMAIS additionnées (anti-pattern n°3) --- */}
      <div className="mt-4">
        <h4 className="text-sm font-medium text-ink">Volume non prélevable (m³/an)</h4>
        {composantes.length === 0 ? (
          <p className="mt-1 text-sm text-ink-subtle">{vnp.message}</p>
        ) : (
          <>
            <dl className="mt-2 grid gap-3 sm:grid-cols-2">
              {composantes.map((c) => (
                <div key={c.id} className="rounded-lg border border-line bg-white p-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    {c.label}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                    {fourchette(c.value.min, c.value.max, "m³")}
                  </dd>
                  <dd className="mt-1 text-xs text-ink-subtle">{c.value.detail}</dd>
                </div>
              ))}
            </dl>
            {composantes.length === 2 && (
              <p className="mt-2 text-xs text-ink-subtle">
                ⚠️ Ces deux volumes <strong>ne s&apos;additionnent pas</strong> : l&apos;un mesure ce que
                les restrictions coûtent cette année, l&apos;autre ce que la baisse programmée des volumes
                autorisés coûtera. À l&apos;horizon 2050, la seconde composante pèsera probablement
                davantage — les additionner masquerait le signal dominant.
              </p>
            )}
          </>
        )}
      </div>

      {/* --- IA : JEA --- */}
      <div className="mt-4 border-t border-line pt-4">
        <h4 className="text-sm font-medium text-ink">
          Interruption d&apos;activité (jours-équivalents d&apos;arrêt / an)
        </h4>
        {!ia.available ? (
          <p className="mt-1 text-sm text-ink-subtle">{ia.message}</p>
        ) : (
          <div className="mt-2 rounded-lg border border-line bg-white p-3">
            <p className="text-lg font-semibold tabular-nums text-ink">
              {fourchette(ia.jeaMin, ia.jeaMax, "JEA")}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              Calculé <strong>épisode par épisode</strong> sur {ia.episodesRetenus} épisode
              {ia.episodesRetenus > 1 ? "s" : ""} réel{ia.episodesRetenus > 1 ? "s" : ""}, réponse
              «&nbsp;{ia.reponse}&nbsp;». Plus long épisode : {ia.maxJoursConsecutifs} jours consécutifs.
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              À nombre de jours égal, la <strong>structure</strong> des épisodes change tout : dès
              qu&apos;une réserve existe, quarante coupures d&apos;un jour ne coûtent presque rien là où
              deux coupures de vingt jours coûtent la quasi-totalité.
            </p>
          </div>
        )}
      </div>

      {/* --- Ce qu'il manque pour que ces chiffres existent --- */}
      {!completeness.complet && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            Profil du site incomplet — {completeness.gaps.length} donnée
            {completeness.gaps.length > 1 ? "s" : ""} manquante
            {completeness.gaps.length > 1 ? "s" : ""}
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-900">
            {completeness.consequences.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Journal d'hypothèses (ADR-006) --- */}
      {hypotheses.length > 0 && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-muted">
            Ce que ces chiffres supposent ({hypotheses.length})
          </summary>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-subtle">
            {hypotheses.map((h, i) => (
              <li key={i}>• {h}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-subtle">
            Journal produit <strong>au moment du calcul</strong>, pas rédigé à côté : il voyage avec le
            chiffre jusqu&apos;à l&apos;export.
          </p>
        </details>
      )}

      <p className="mt-3 text-xs text-ink-subtle">
        Origine du volume de référence : {vnp.vrefDetail}
      </p>
    </Panel>
  );
}
