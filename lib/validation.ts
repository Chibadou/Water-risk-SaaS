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
// ⚠️ Nothing here has been run on real data. It is verified on synthetic series
// whose generating process is known — which shows the harness measures what it
// claims, and shows nothing at all about the model's skill on France.

import { NIVEAUX, rang } from "./juridiction";
import { durationDistribution, type DureeBucket, type Episode } from "./ia";
import type { NiveauGravite } from "./types";

/** A probabilistic forecast for one day: P(level = each). */
export type Prevision = Partial<Record<NiveauGravite, number>>;

export interface JourEvalue {
  zone: string;
  day: number;
  departement?: string;
  /** what actually happened */
  observe: NiveauGravite;
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
    for (const l of NIVEAUX) {
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
export function baselineClimatologique(observations: { observe: NiveauGravite }[]): Prevision {
  const counts: Partial<Record<NiveauGravite, number>> = {};
  for (const o of observations) counts[o.observe] = (counts[o.observe] ?? 0) + 1;
  const total = observations.length;
  if (total === 0) return {};
  const out: Prevision = {};
  for (const l of NIVEAUX) out[l] = (counts[l] ?? 0) / total;
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
  niveau: NiveauGravite,
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

export interface ResultatValidation {
  mode: "leave_one_year_out" | "leave_one_department_out";
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
    const baseline = baselineClimatologique(entrainement);
    const brierModele = brier(prevus);
    const brierBaseline = brier(test.map((j) => ({ ...j, prevu: baseline })));
    const gain =
      brierModele !== undefined && brierBaseline !== undefined
        ? brierBaseline - brierModele
        : undefined;
    if (gain !== undefined && gain < 0) plisPerdus.push(k);
    plis.push({ cle: k, brierModele, brierBaseline, gain, jours: test.length });
  }

  const gains = plis.map((p) => p.gain).filter((g): g is number => g !== undefined);
  hypotheses.push(
    "⚠️ La baseline climatologique est calculée sur le PLI D'ENTRAÎNEMENT seulement. La calculer " +
      "sur l'ensemble complet ferait fuir l'information du pli de test dans la baseline, ce qui " +
      "rend la comparaison faussement favorable au modèle.",
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

  return {
    mode,
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

/** Levels ordered by rank, for callers building a forecast row. */
export const NIVEAUX_ORDONNES = [...NIVEAUX].sort((a, b) => rang(a) - rang(b));
