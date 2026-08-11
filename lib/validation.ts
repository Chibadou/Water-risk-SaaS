// §5.5 — validation on the FINAL metric, not the intermediate one.
//
// ⚠️⚠️ Anti-pattern n°6, verbatim: « valider le modèle sur le niveau d'alerte
// plutôt que sur la métrique finale ». It is the most seductive of the ten, because
// validating on the alert level is easy, gives a good-looking number, and answers a
// question nobody asked. A model that predicts the level well and the JEA badly is
// a failed model, and only the second is measurable here.
//
// So the harness scores:
//   1. the level, because it is the model's own output (Brier + reliability);
//   2. the EPISODE DURATION DISTRIBUTION, because that is what the IA consumes;
//   3. against a CLIMATOLOGICAL BASELINE, because a Brier score with nothing to
//      beat is a number, not a result.
//
// ⚠️ UPDATED 2026-08-11: this harness HAS now been run on the real French archive
// (Actions runs 31490333194 / 31491804305 — 5.38 M observed days), and what it measured
// is that the model has no anticipation skill: +0.69 Brier against a climatological
// baseline overall, but **−1.16 on the days the level actually changed**, losing in all
// 100 departments. See the header of lib/markov.ts. The harness did its job; the model
// did not. What is still verified only on synthetic series are the harness's OWN
// properties (leakage guard, fold construction, scoring subsets).

import { durationDistribution, type DureeBucket, type Episode } from "./ia";
import { ETATS_CHAINE, rangEtat, type EtatChaine } from "./markov";

/**
 * A probabilistic forecast for one day: P(state = each).
 *
 * ⚠️ Over `EtatChaine`, which includes `ETAT_LIBRE` (« no arrêté »), not over the four
 * gravity levels. The distinction is not cosmetic for a Brier score: if the model can
 * put probability on « no restriction » and the score only sums the four levels, that
 * mass VANISHES from the total and the model is charged less than it should be. The
 * scoring set and the forecast's support have to be the same set.
 */
export type Prevision = Partial<Record<EtatChaine, number>>;

export interface JourEvalue {
  zone: string;
  day: number;
  departement?: string;
  /** what actually happened — possibly `ETAT_LIBRE`, i.e. no arrêté that day */
  observe: EtatChaine;
  /** what the model said would happen */
  prevu: Prevision;
}

/**
 * Multi-category Brier score, in [0, 2]. Lower is better.
 *
 * ⚠️ Not the two-class version. The two-class Brier on "alerte or worse" is what
 * anti-pattern n°6 looks like in arithmetic: it scores well for a model that
 * confuses alerte with crise, and those two differ by a factor of several on the
 * JEA. The multi-category form charges for that confusion.
 */
export function brier(jours: JourEvalue[]): number | undefined {
  if (jours.length === 0) return undefined;
  let total = 0;
  for (const j of jours) {
    for (const l of ETATS_CHAINE) {
      const p = j.prevu[l] ?? 0;
      const o = j.observe === l ? 1 : 0;
      total += (p - o) ** 2;
    }
  }
  return total / jours.length;
}

/**
 * The climatological baseline: the observed marginal frequency of each level,
 * forecast every day regardless of conditions.
 *
 * ⚠️ This is the bar to beat, and it is not a low one. A model that cannot beat
 * "the long-run average, always" has learned nothing from its covariates — and it
 * is entirely possible to build one that does not, which is why §5.5 asks for the
 * comparison rather than for an absolute threshold.
 */
export function baselineClimatologique(observations: { observe: EtatChaine }[]): Prevision {
  const counts: Partial<Record<EtatChaine, number>> = {};
  for (const o of observations) counts[o.observe] = (counts[o.observe] ?? 0) + 1;
  const total = observations.length;
  if (total === 0) return {};
  const out: Prevision = {};
  for (const l of ETATS_CHAINE) out[l] = (counts[l] ?? 0) / total;
  return out;
}

export interface BinFiabilite {
  /** centre of the forecast-probability bin */
  centre: number;
  /** mean forecast probability in the bin */
  prevuMoyen: number;
  /** observed frequency in the bin */
  observeFrequence: number;
  nombre: number;
}

/**
 * Reliability diagram for one level: does "40 % chance" happen 40 % of the time?
 *
 * ⚠️ A well-calibrated model can still be useless (the climatological baseline is
 * perfectly calibrated by construction) and a skilful model can be badly
 * calibrated. That is precisely why §5.5 asks for BOTH this and the Brier score:
 * neither implies the other, and publishing one alone lets a model look finished.
 */
export function diagrammeFiabilite(
  jours: JourEvalue[],
  niveau: EtatChaine,
  bins = 10,
): BinFiabilite[] {
  const buckets: { p: number[]; o: number[] }[] = Array.from({ length: bins }, () => ({
    p: [],
    o: [],
  }));
  for (const j of jours) {
    const p = j.prevu[niveau] ?? 0;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(p * bins)));
    buckets[idx].p.push(p);
    buckets[idx].o.push(j.observe === niveau ? 1 : 0);
  }
  return buckets
    .map((b, i) => ({
      centre: (i + 0.5) / bins,
      prevuMoyen: b.p.length > 0 ? b.p.reduce((a, x) => a + x, 0) / b.p.length : 0,
      observeFrequence: b.o.length > 0 ? b.o.reduce((a, x) => a + x, 0) / b.o.length : 0,
      nombre: b.p.length,
    }))
    // Empty bins are DROPPED rather than plotted at zero: a bin with no forecast in
    // it is not a bin where the model was wrong.
    .filter((b) => b.nombre > 0);
}

export interface EcartDistribution {
  /** total variation distance between the two duration distributions, 0-1 */
  distance: number;
  observee: DureeBucket[];
  simulee: DureeBucket[];
  /** longest observed run vs longest simulated one — the statistic §4.3 needs */
  maxObserve: number;
  maxSimule: number;
}

/**
 * §5.5's third criterion: the simulated episode-duration distribution must
 * reproduce the observed one.
 *
 * ⚠️ THE criterion that matters for the product, and the one a frequency model
 * cannot meet by construction. Two models can agree on the annual day total and
 * disagree by a factor of several on the JEA, because a storage buffer absorbs
 * short episodes entirely and long ones not at all (§4.3). Total variation distance
 * rather than a mean-duration comparison: two distributions can share a mean and
 * differ everywhere, and it is the tail that costs money.
 */
export function ecartDistributionDurees(
  observes: Episode[],
  simules: Episode[],
): EcartDistribution {
  const observee = durationDistribution(observes);
  const simulee = durationDistribution(simules);
  const nObs = observes.length || 1;
  const nSim = simules.length || 1;
  const durees = new Set([...observee.map((b) => b.duree), ...simulee.map((b) => b.duree)]);
  let distance = 0;
  for (const d of durees) {
    const po = (observee.find((b) => b.duree === d)?.nombre ?? 0) / nObs;
    const ps = (simulee.find((b) => b.duree === d)?.nombre ?? 0) / nSim;
    distance += Math.abs(po - ps);
  }
  return {
    distance: distance / 2,
    observee,
    simulee,
    maxObserve: observes.reduce((m, e) => Math.max(m, e.lengthDays), 0),
    maxSimule: simules.reduce((m, e) => Math.max(m, e.lengthDays), 0),
  };
}

export interface PliValidation {
  /** what was held out: a year, or a department */
  cle: string;
  brierModele?: number;
  brierBaseline?: number;
  /** positive = the model beats the baseline */
  gain?: number;
  jours: number;
}

/**
 * Restrict which test days are SCORED, without restricting what the forecast may see.
 *
 * ⚠️ Why this exists, measured. The first real calibration reported a mean Brier gain
 * of 0.69 over climatology, on a chain whose diagonal is ≈ 0.99. On a process that
 * persistent, "tomorrow = today" alone beats a climatological average by a wide
 * margin, so a large gain does NOT establish that the model anticipates anything — it
 * may only establish that restrictions last. The question a user actually has ("will
 * my zone get worse?") is answered on the days the level CHANGES.
 *
 * Scoring a subset while forecasting from the full fold is the distinction that makes
 * this measurable: the forecast still reads the previous day (which is usually not
 * itself a transition day), and only the scored set narrows. Filtering the fold
 * instead would starve the forecaster and measure nothing.
 *
 * ⚠️ Deliberately NOT a smoothed persistence baseline. That would need an invented
 * smoothing constant, and a constant chosen to make a comparison come out is exactly
 * what this repository refuses. Selecting days needs no constant.
 */
export interface RestrictionScore {
  /** what the subset means, carried into the result so a reader is never guessing */
  nom: string;
  /** `${zone}|${day}` keys eligible for scoring */
  cles: Set<string>;
}

/**
 * The reference the model is scored against — the bar it has to clear.
 *
 * ⚠️⚠️ Parameterised because the DEFAULT BECAME UNFAIR the moment the model gained a
 * covariate. `validationCroisee` used to always build an unconditional climatology, which
 * is the right bar for an unconditional model and the wrong one for a conditioned model:
 * French restrictions are overwhelmingly summer events, so a month-aware model scored
 * against an annual average wins on seasonality alone. The gain would be real arithmetic
 * and worthless evidence — the model would not have learned anything about water, only
 * about the calendar, while the baseline was denied the calendar.
 *
 * So a conditioned model must be scored against a reference conditioned THE SAME WAY. The
 * two-stage shape (`construire` from the training fold, then apply per test day) is what
 * lets the reference depend on the day being scored while still being built only from
 * training data — the leakage guard the harness already enforces.
 */
export interface Reference {
  /** what the bar is, carried into the result so a reader is never guessing */
  nom: string;
  construire: (entrainement: JourEvalue[]) => (jour: JourEvalue) => Prevision;
}

/** The unconditional climatology: the historical mix, forecast every day. */
export const REFERENCE_CLIMATOLOGIQUE: Reference = {
  nom: "climatologie inconditionnelle (le mélange historique, tous les jours)",
  construire: (entrainement) => {
    const p = baselineClimatologique(entrainement);
    return () => p;
  },
};

/**
 * A climatology conditioned on the same context as the model — the honest bar.
 *
 * ⚠️ Thin contexts fall back to the unconditional mix rather than to an empty forecast, for
 * the same reason `ligneConditionnelle` does: an unseen context is absence of evidence, and
 * an empty forecast scores as a confident claim about nothing.
 */
export function referenceParContexte(
  nom: string,
  contexteDe: (jour: JourEvalue) => string,
  minParContexte = 100,
): Reference {
  return {
    nom,
    construire: (entrainement) => {
      const groupes = new Map<string, JourEvalue[]>();
      for (const j of entrainement) {
        const c = contexteDe(j);
        const bucket = groupes.get(c);
        if (bucket) bucket.push(j);
        else groupes.set(c, [j]);
      }
      const global = baselineClimatologique(entrainement);
      const parContexte = new Map<string, Prevision>();
      for (const [c, sous] of groupes) {
        parContexte.set(c, sous.length >= minParContexte ? baselineClimatologique(sous) : global);
      }
      return (jour) => parContexte.get(contexteDe(jour)) ?? global;
    },
  };
}

export interface ResultatValidation {
  mode: "leave_one_year_out" | "leave_one_department_out";
  /** the scored subset, when the run restricted it */
  restriction?: string;
  /**
   * What the model was scored AGAINST. ⚠️ Reported because a gain is meaningless without
   * it: the same model scores +0.44 against an annual average and can score near zero
   * against a monthly one, and a reader who is not told the bar cannot tell the two apart.
   */
  reference?: string;
  plis: PliValidation[];
  /** mean gain over the folds; undefined when no fold could be scored */
  gainMoyen?: number;
  /**
   * Folds where the model LOST to the baseline. ⚠️ Reported, not averaged away: a
   * mean gain that hides two departments where the model is worse than the
   * long-run average is a mean that conceals the finding.
   */
  plisPerdus: string[];
  hypotheses: string[];
}

/**
 * Out-of-sample validation, leaving out one year or one department at a time.
 *
 * §5.5 asks for BOTH, and they answer different questions: leaving out a year tests
 * whether the model generalises across weather, leaving out a department whether it
 * generalises across administrations. The second is the harder one, and it is the
 * one that matters for selling to a company with sites in several départements.
 */
export function validationCroisee(
  jours: JourEvalue[],
  mode: ResultatValidation["mode"],
  ajuster: (entrainement: JourEvalue[], test: JourEvalue[]) => JourEvalue[],
  restriction?: RestrictionScore,
  reference: Reference = REFERENCE_CLIMATOLOGIQUE,
): ResultatValidation {
  const cle = (j: JourEvalue) =>
    mode === "leave_one_year_out"
      ? String(new Date(j.day * 86_400_000).getUTCFullYear())
      : (j.departement ?? "inconnu");

  const cles = [...new Set(jours.map(cle))].sort();
  const plis: PliValidation[] = [];
  const plisPerdus: string[] = [];
  const hypotheses: string[] = [];

  for (const k of cles) {
    const test = jours.filter((j) => cle(j) === k);
    const entrainement = jours.filter((j) => cle(j) !== k);
    if (test.length === 0 || entrainement.length === 0) continue;

    const prevus = ajuster(entrainement, test);
    // ⚠️ Built from the TRAINING fold only — the leakage guard. A reference fitted on the
    // full set would carry the test fold's own distribution and flatter the baseline into
    // looking unbeatable, or (worse, and the direction that actually misleads) make a
    // useless model look skilful because the bar moved.
    const prevoirReference = reference.construire(entrainement);
    // ⚠️ The forecast above saw the WHOLE fold; only the scoring narrows. Both sides
    // are filtered with the same predicate, so the comparison stays like-for-like.
    const retenu = restriction
      ? (j: JourEvalue) => restriction.cles.has(`${j.zone}|${j.day}`)
      : () => true;
    const notes = prevus.filter(retenu);
    const testNotes = test.filter(retenu);
    if (testNotes.length === 0) {
      plis.push({ cle: k, jours: 0 });
      continue;
    }
    const brierModele = brier(notes);
    const brierBaseline = brier(testNotes.map((j) => ({ ...j, prevu: prevoirReference(j) })));
    const gain =
      brierModele !== undefined && brierBaseline !== undefined
        ? brierBaseline - brierModele
        : undefined;
    if (gain !== undefined && gain < 0) plisPerdus.push(k);
    plis.push({ cle: k, brierModele, brierBaseline, gain, jours: testNotes.length });
  }

  const gains = plis.map((p) => p.gain).filter((g): g is number => g !== undefined);
  hypotheses.push(
    `⚠️ Référence : ${reference.nom}. Calculée sur le PLI D'ENTRAÎNEMENT seulement — la calculer ` +
      "sur l'ensemble complet ferait fuir l'information du pli de test dans la référence.",
  );
  hypotheses.push(
    "⚠️ Un gain ne veut rien dire sans sa référence. Un modèle conditionné au mois face à une " +
      "référence aveugle au mois gagne par la SAISONNALITÉ seule : les restrictions françaises " +
      "sont massivement estivales, donc connaître le mois vaut beaucoup contre une moyenne " +
      "annuelle et presque rien contre une moyenne mensuelle.",
  );
  if (plisPerdus.length > 0) {
    hypotheses.push(
      `⚠️ Le modèle PERD contre la baseline sur ${plisPerdus.length} pli(s) : ` +
        `${plisPerdus.join(", ")}. Un gain moyen positif ne les efface pas.`,
    );
  }
  hypotheses.push(
    "⚠️ Score de Brier MULTI-CATÉGORIES. La variante à deux classes (« alerte ou pire ») note " +
      "bien un modèle qui confond alerte et crise — deux niveaux qui diffèrent d'un facteur " +
      "plusieurs sur les JEA. C'est l'anti-pattern n°6 sous forme arithmétique.",
  );

  if (restriction) {
    hypotheses.push(
      `⚠️ Score restreint à « ${restriction.nom} » : la prévision a vu tout le pli, seule la ` +
        "NOTATION est réduite. À comparer au gain non restreint — un gain qui s'effondre ici " +
        "signifie que le modèle gagnait par persistance et non par anticipation.",
    );
  }

  return {
    mode,
    restriction: restriction?.nom,
    reference: reference.nom,
    plis,
    gainMoyen: gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : undefined,
    plisPerdus,
    hypotheses,
  };
}

/**
 * Reproduce the 2022-2023 episodes without an unsignalled gap — §8's criterion for
 * chantier 2.
 *
 * ⚠️ What "sans lacune non signalée" means here, precisely: every day of the target
 * years must be either COVERED by the reconstruction or LISTED as a gap. A
 * reconstruction that quietly skips March is not a reconstruction, and interpolating
 * March would be anti-pattern n°8.
 */
export function couvertureReconstruction(
  jours: { day: number }[],
  anneesCibles: number[],
): { couvert: number; attendu: number; lacunes: { debut: number; fin: number }[] } {
  const present = new Set(jours.map((j) => j.day));
  const lacunes: { debut: number; fin: number }[] = [];
  let couvert = 0;
  let attendu = 0;
  for (const annee of anneesCibles) {
    const debut = Math.floor(Date.UTC(annee, 0, 1) / 86_400_000);
    const fin = Math.floor(Date.UTC(annee, 11, 31) / 86_400_000);
    let trou: { debut: number; fin: number } | undefined;
    for (let d = debut; d <= fin; d++) {
      attendu++;
      if (present.has(d)) {
        couvert++;
        if (trou) {
          lacunes.push(trou);
          trou = undefined;
        }
      } else if (trou) {
        trou.fin = d;
      } else {
        trou = { debut: d, fin: d };
      }
    }
    if (trou) lacunes.push(trou);
  }
  return { couvert, attendu, lacunes };
}

/**
 * Chain states ordered by rank, for callers building a forecast row.
 *
 * ⚠️ Renamed from `NIVEAUX_ORDONNES` when `ETAT_LIBRE` joined the state space: the old
 * name promised gravity LEVELS and would now hand back a list containing a non-level.
 */
export const ETATS_ORDONNES = [...ETATS_CHAINE].sort((a, b) => rangEtat(a) - rangEtat(b));
