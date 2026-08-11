"use client";

import Panel from "./ui/Panel";
import { vnpComponents } from "@/lib/vnp";
import { profileCompleteness } from "@/lib/siteProfile";
import type { IndicateursResult } from "@/lib/indicateurs";
import type { DonneesInternes, ResponseType, SiteUsage } from "@/lib/sites";

// The three outputs of the note technique — JS (days), VNP (m³) and IA (JEA).
//
// ⚠️ This component DISPLAYS; it no longer computes. Until Sprint 42b it called
// the three engines itself, which meant the site report and the written synthesis
// each derived their own version of the same figures. The computation moved to
// lib/indicateurs.ts so that what the user reads on screen and what lands in
// their PDF come from one call — a precondition of ADR-006, not housekeeping.
//
// Everything here is DERIVED from state the site sheet already holds. No fetch:
// if a figure is missing it is because a declaration is missing, and the panel
// says which one.

export interface IndicateursNoteProps {
  indicateurs: IndicateursResult;
  interne: DonneesInternes;
  usages?: SiteUsage[];
  reponse?: ResponseType;
}

const fmt = (v: number) => Math.round(v).toLocaleString("fr-FR");

/** "12 000 m³" or "12 000 à 19 000 m³" — never a point where a range is real. */
function fourchette(min: number, max: number, unite: string): string {
  return Math.abs(max - min) < 1
    ? `${fmt(min)} ${unite}`
    : `${fmt(min)} à ${fmt(max)} ${unite}`;
}

export default function IndicateursNote({
  indicateurs,
  interne,
  usages,
  reponse,
}: IndicateursNoteProps) {
  const { js, vnp, ia, ia2050, hypotheses } = indicateurs;
  const completeness = profileCompleteness({ usages, reponse, interne });
  const composantes = vnpComponents(vnp);

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
      ariaLabel="Jours sous statut, volume non prélevable et interruption d'activité"
      id="indicateurs-physiques"
      eyebrow="Note technique — les trois sorties"
      title="Jours sous statut, volume non prélevable et interruption d'activité"
    >
      <p className="text-sm text-ink-muted">
        <strong>Trois sorties, et trois seulement.</strong> Les jours sous statut sont un fait — les
        arrêtés sont publiés. Les deux autres sont en <strong>unités physiques</strong>, donc invariantes
        au cadre réglementaire, là où le décompte de jours dépend d&apos;une nomenclature qui a déjà
        changé en 2021. Elles se calculent sur ce que vous avez déclaré : quand une déclaration manque,
        l&apos;outil le dit plutôt que de supposer.
      </p>

      {/* --- JS : jours sous statut, par horizon --- */}
      <div className="mt-4">
        <h4 className="text-sm font-medium text-ink">Jours sous statut (jours/an)</h4>
        {!js.available ? (
          <p className="mt-1 text-sm text-ink-subtle">{js.message}</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-72 text-sm">
              <caption className="sr-only">
                Jours passés sous arrêté par horizon, avec leur niveau de preuve
              </caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-subtle">
                  <th scope="col" className="py-1 pr-2 font-medium">Horizon</th>
                  <th scope="col" className="py-1 pr-2 text-center font-medium">Preuve</th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">Sous arrêté</th>
                  <th scope="col" className="py-1 text-right font-medium">dont alerte+</th>
                </tr>
              </thead>
              <tbody>
                {js.horizons.map((h) => (
                  <tr key={h.id} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink">
                      {h.label}
                    </th>
                    <td className="py-1.5 pr-2 text-center text-xs text-ink-subtle">
                      {h.preuve ?? "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-ink">
                      {h.available
                        ? h.lo !== undefined && h.hi !== undefined
                          ? `${fmt(h.lo)} à ${fmt(h.hi)} j`
                          : `${fmt(h.joursTotal ?? 0)} j`
                        : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-ink-muted">
                      {h.available ? `${fmt(h.joursAlertePlus ?? 0)} j` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-ink-subtle">{js.avertissement}</p>
      </div>

      {/* --- VNP : deux composantes, JAMAIS additionnées (anti-pattern n°3) --- */}
      <div className="mt-4 border-t border-line pt-4">
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
            {ia2050?.available && (
              <p className="mt-2 border-t border-line pt-2 text-xs text-ink-subtle">
                <strong>Horizon 2050</strong> : {fourchette(ia2050.jeaMin, ia2050.jeaMax, "JEA")}.
                ⚠️ Les épisodes observés ont été <strong>allongés</strong>, pas multipliés en nombre —
                à jours égaux, allonger coûte plusieurs fois plus cher dès qu&apos;une réserve existe,
                et multiplier aurait produit le chiffre optimiste sans le dire.
              </p>
            )}
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
