// N2 — Markovian transitions on gravity levels, per alert zone (§5.1, §5.4).
//
// ⚠️⚠️ READ THIS FIRST. This module is an ESTIMATOR AND A VALIDATION HARNESS. It
// is NOT a calibrated model, and nothing in the product consumes its output yet.
// Calibrating it needs the arrêtés archive, which needs egress the sandbox does not
// have (HANDBOOK §3: the GitHub Actions escape hatch). What is delivered and
// verifiable today is the estimator, its §5.4 constraints, and the §5.5 validation
// harness — all tested against SYNTHETIC data whose true parameters are known, so
// the code can be shown correct without being shown calibrated.
//
// Publishing an uncalibrated estimator as if it were a model is exactly the kind
// of claim this repository refuses. The `calibre` flag on every result exists so a
// caller cannot use one without knowing.
//
// ---------------------------------------------------------------------------
// Why a transition model and not a frequency model (§5.1)
// ---------------------------------------------------------------------------
//
// A model of "how many restricted days per year" would fit the annual count and
// get the STRUCTURE wrong — and the structure is what the IA depends on. §4.3's
// convexity means forty one-day episodes and two twenty-day episodes cost wildly
// different amounts at equal day totals, so a model that reproduces the total and
// not the episode lengths is useless for the output that matters.
//
// The physical justification for a Markov chain on levels: levels go UP FAST and
// come DOWN SLOWLY. That hysteresis is a property of the DECISION SYSTEM — a
// prefect lifts a restriction only once the situation is durably restored — not of
// the hydrology and not of noise. A chain with asymmetric up/down probabilities
// reproduces episode lengths for that reason; a frequency model has no mechanism
// that could.
//
// ---------------------------------------------------------------------------
// ⚠️⚠️ WHAT THE FIRST REAL CALIBRATION MEASURED (2026-08-11)
// ---------------------------------------------------------------------------
//
// Runs 31490333194 and 31491804305 fitted this estimator on the French archive:
// 10 221 zones, 5.38 M observations, 126 168 episodes, 2011-2026. Three results,
// and the second is the one that constrains what this module may ever claim.
//
// **1. The hysteresis above is REAL, and now measured rather than argued.** Levels
// rise 1.77× faster than they fall (post-2021 regime; 2.13× pre-2021). The physical
// justification for choosing a Markov chain holds up on real data.
//
// **2. The fitted chain has NO ANTICIPATION SKILL. Measured, not suspected.**
// Against a climatological baseline the mean Brier gain is +0.69 in
// leave-one-department-out, over 100 folds, losing none. That number is worthless on
// its own: the fitted diagonal is ≈ 0.99, so "tomorrow = today" already beats a
// climatological average by a wide margin, and the gain mostly measures that
// restrictions LAST. Scoring the SAME forecast on the 67 335 days where the level
// actually CHANGED gives a gain of **−1.16, losing on ALL 100 departments**.
//
// So on the question a user actually asks — "is my zone about to get worse?" — this
// model is WORSE than the long-run average, and much worse than "same as yesterday".
// The +0.69 must never be published without the −1.16 beside it. That pairing is not
// a caveat, it is the result.
//
// ⚠️ This is also why `calibre` stays false after a successful fit on real data. The
// flag does not mean "not yet fitted"; it means "not fit for use", and the
// measurement above is what justifies it rather than mere caution.
//
// **3. The chain has no « no restriction » state, which is likely why.** `NIVEAUX`
// holds four ARRÊTÉ levels, and an observation exists only for a day under an
// arrêté. The chain therefore cannot represent entering or leaving restriction at
// all — those are the transitions counted as ignored jumps — and the marginal
// distribution it produces is conditional on a restriction being in force, not an
// annual probability. Adding a fifth state is a change of model, not a fix, and is
// the first thing to try before this estimator is trusted for anything.

import { NIVEAUX, rang } from "./juridiction";
import type { NiveauGravite } from "./types";

/**
 * The absence of any arrêté, as a STATE of the chain.
 *
 * ⚠️⚠️ Deliberately declared HERE and not added to `NIVEAUX`. The jurisdiction's four
 * levels are a legal nomenclature — `lib/juridiction.ts` exists precisely so that list
 * has one home and a fifth entry cannot be smuggled in (anti-pattern n°9). "No
 * restriction" is not a fifth level of severity a prefect can declare; it is the state
 * the chain is in when no arrêté applies. Two different things, two different lists:
 * `NIVEAUX` is the jurisdiction's, `ETATS_CHAINE` is the MODEL's.
 *
 * ⚠️ It is also the reason `couverture`/`GRAVITE` are untouched by this: nothing in the
 * interface gains a fifth colour, because nothing legal gained a fifth level.
 */
export const ETAT_LIBRE = "aucune_restriction" as const;

/** The chain's state space: the four arrêté levels, plus the absence of one. */
export type EtatChaine = NiveauGravite | typeof ETAT_LIBRE;

/**
 * The chain's states, ordered by severity, least severe first.
 *
 * ⚠️ The ORDER is load-bearing and the invariant is `rangEtat(ETATS_CHAINE[i]) === i`:
 * `enforceMonotonicity` indexes survival functions by position, and `asymetrie` reads
 * "rise" and "fall" from it. `verifierOrdreEtats` below asserts it rather than trusting
 * that a future edit will preserve it.
 */
export const ETATS_CHAINE: EtatChaine[] = [ETAT_LIBRE, ...NIVEAUX];

/** Severity rank of a chain state; `ETAT_LIBRE` is 0, below every arrêté level. */
export function rangEtat(etat: EtatChaine | undefined | null): number {
  if (etat === undefined || etat === null || etat === ETAT_LIBRE) return 0;
  return rang(etat);
}

/**
 * The ordering invariant, checked rather than assumed.
 *
 * ⚠️ Exported so a test can assert it. If a fifth legal level is ever added to
 * `NIVEAUX`, or the ranks stop being contiguous from 1, this returns false and the
 * monotonicity fix would otherwise start writing probabilities into the wrong cells —
 * silently, since every row would still sum to 1.
 */
export function verifierOrdreEtats(): boolean {
  return ETATS_CHAINE.every((e, i) => rangEtat(e) === i);
}

/** One observed day: which zone, which date, which state. */
export interface Observation {
  zone: string;
  /** day index, as in the RLE calendar (lib/history HISTORY_DAY_MS) */
  day: number;
  /**
   * ⚠️ An `EtatChaine`, not a `NiveauGravite`: a day with NO arrêté is an observation
   * like any other. Before the 2026-08-11 calibration this field was a gravity level,
   * so unrestricted days simply did not exist for the model — see the header.
   */
  niveau: EtatChaine;
  /** department, for the random effects of §5.4 */
  departement?: string;
  /** hydrological covariates, already standardised by their own modules */
  covariables?: Covariables;
}

/**
 * Covariates of §5.3.
 *
 * ✅ Measured at Sprint 38: four of the six the note asks for are ALREADY in the
 * repository — soil moisture (lib/swi), the standardised piezometric index
 * (computeIps), standardised flow and low-flow references (computeLowFlow). Only
 * SPI and SPEI are missing. The heaviest chantier of the note is less blocked by
 * data than reading it suggests.
 */
export interface Covariables {
  /** soil wetness index, standardised */
  swi?: number;
  /** standardised piezometric level */
  ips?: number;
  /** standardised streamflow */
  debit?: number;
  /** standardised precipitation index — NOT yet available in the repo */
  spi?: number;
  /** standardised precipitation-evapotranspiration index — NOT yet available */
  spei?: number;
}

/** §5.4: the regulatory regime a day belongs to. */
export type Regime = "pre_2021" | "post_2021";

/**
 * ⚠️ The decree of 23 June 2021 moved France from three to four levels and
 * harmonised the thresholds. Fitting across it without a regime variable
 * attributes to the CLIMATE what comes from the REGULATION — the single most
 * likely way to produce a confident and wrong trend.
 */
export const REGIME_PIVOT_DAY = Math.floor(Date.UTC(2021, 5, 23) / 86_400_000);

export function regimeOf(day: number): Regime {
  return day < REGIME_PIVOT_DAY ? "pre_2021" : "post_2021";
}

export interface TransitionMatrix {
  /** from state → to state → probability, rows summing to 1 */
  p: Record<EtatChaine, Partial<Record<EtatChaine, number>>>;
  /** how many transitions each row was estimated from */
  n: Record<EtatChaine, number>;
  /**
   * Rows whose sample was too small to estimate. ⚠️ Flagged rather than
   * extrapolated (§5.4): a row with three observations pooled from a national
   * prior is honest, a row invented from a smooth function is not.
   */
  donneesInsuffisantes: EtatChaine[];
}

export interface FitOptions {
  /** minimum transitions per row below which the row is pooled, then flagged */
  minParLigne?: number;
  /**
   * Hierarchical pooling weight, 0-1. 0 = no pooling (per-zone only), 1 = the
   * national prior alone. §5.4 asks for pooling rather than extrapolation.
   */
  mutualisation?: number;
  /** national prior to pool towards; computed from all zones when omitted */
  prior?: TransitionMatrix;
}

const MIN_PAR_LIGNE = 20;

function emptyMatrix(): TransitionMatrix {
  const p = {} as TransitionMatrix["p"];
  const n = {} as TransitionMatrix["n"];
  for (const l of ETATS_CHAINE) {
    p[l] = {};
    n[l] = 0;
  }
  return { p, n, donneesInsuffisantes: [] };
}

/**
 * Count day-to-day transitions, then normalise each row.
 *
 * Observations are grouped by zone and sorted by day; only CONSECUTIVE days
 * produce a transition. A gap in the archive must not be read as a transition
 * across it — that would manufacture a jump from crise to nothing (anti-pattern
 * n°8, and here it would also bias the down-probabilities upwards).
 */
export function countTransitions(observations: Observation[]): {
  counts: Record<EtatChaine, Partial<Record<EtatChaine, number>>>;
  sautsIgnores: number;
} {
  const counts = {} as Record<EtatChaine, Partial<Record<EtatChaine, number>>>;
  for (const l of ETATS_CHAINE) counts[l] = {};
  // ⚠️ `byZone.set(z, [...existing, o])` copies the whole array per observation —
  // O(n²). Measured on the 40 000-day synthetic series of markov.test.ts: the suite
  // took 38 s, almost all of it in that spread. Pushing into a held reference took
  // it to under 2 s. The lesson is the shape, not the seconds: a spread inside a
  // per-item loop is quadratic every time, and it reads like grouping.
  const byZone = new Map<string, Observation[]>();
  for (const o of observations) {
    const bucket = byZone.get(o.zone);
    if (bucket) bucket.push(o);
    else byZone.set(o.zone, [o]);
  }
  let sautsIgnores = 0;
  for (const obs of byZone.values()) {
    const sorted = [...obs].sort((a, b) => a.day - b.day);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].day - sorted[i - 1].day !== 1) {
        sautsIgnores++;
        continue;
      }
      const from = sorted[i - 1].niveau;
      const to = sorted[i].niveau;
      counts[from][to] = (counts[from][to] ?? 0) + 1;
    }
  }
  return { counts, sautsIgnores };
}

/** Normalise counts into a row-stochastic matrix, pooling thin rows. */
export function fitTransitions(
  observations: Observation[],
  options: FitOptions = {},
): TransitionMatrix {
  const minParLigne = options.minParLigne ?? MIN_PAR_LIGNE;
  const mutualisation = Math.min(1, Math.max(0, options.mutualisation ?? 0));
  const { counts } = countTransitions(observations);
  const out = emptyMatrix();

  for (const from of ETATS_CHAINE) {
    const row = counts[from];
    const total = Object.values(row).reduce((a, b) => a + (b ?? 0), 0);
    out.n[from] = total;

    if (total === 0) {
      // ⚠️ No transition observed from this level. NOT a self-absorbing state, and
      // not a uniform row either: both would be inventions. The row stays EMPTY
      // and the level is flagged.
      out.donneesInsuffisantes.push(from);
      continue;
    }

    const empirique: Partial<Record<EtatChaine, number>> = {};
    for (const to of ETATS_CHAINE) empirique[to] = (row[to] ?? 0) / total;

    const priorRow = options.prior?.p[from];
    // A thin row is pooled towards the prior at full weight, whatever the
    // configured weight: that is what "insufficient" means. It is still flagged,
    // because a pooled row is not an estimate for THIS zone.
    const poids = total < minParLigne ? (priorRow ? 1 : 0) : mutualisation;
    if (total < minParLigne) out.donneesInsuffisantes.push(from);

    // ⚠️ ETATS_CHAINE, not NIVEAUX. Pooling over the four levels only would drop the
    // `ETAT_LIBRE` column entirely and leave the row summing to less than 1 — a leak
    // that no row-total assertion downstream would attribute back to here.
    for (const to of ETATS_CHAINE) {
      const e = empirique[to] ?? 0;
      const pr = priorRow?.[to] ?? e;
      out.p[from][to] = (1 - poids) * e + poids * pr;
    }
  }
  return out;
}

/**
 * §5.4's two structural constraints, enforced rather than hoped for.
 *
 * **Monotonicity.** From a given level, the probability of ending up at least at
 * level k must not increase when the starting level falls. Put plainly: being in
 * crisis today cannot make tomorrow's crisis less likely than being merely in
 * alert today does. A finite sample violates this routinely; left uncorrected, the
 * chain produces episodes that end early from the worst level.
 *
 * **Asymmetry.** Levels rise faster than they fall. The constraint is not "up is
 * more likely than down" — that would be false in a calm year — but that the chain
 * must not IMPOSE symmetry, so this function only reports the measured asymmetry
 * for the caller to check against the physical argument.
 *
 * ⚠️ Enforced by pooled-adjacent-violators on the CUMULATIVE probabilities, which
 * is the standard isotonic fix and, crucially, preserves each row summing to 1.
 * An earlier sketch clamped the offending cell directly and silently unnormalised
 * the row.
 */
export function enforceMonotonicity(m: TransitionMatrix): {
  matrix: TransitionMatrix;
  violations: number;
} {
  const out: TransitionMatrix = {
    p: JSON.parse(JSON.stringify(m.p)),
    n: { ...m.n },
    donneesInsuffisantes: [...m.donneesInsuffisantes],
  };
  let violations = 0;

  // Survival function per row, indexed by POSITION in ETATS_CHAINE:
  //   s[j] = P(next state is ETATS_CHAINE[j] or anything more severe).
  //
  // ⚠️ Rewritten when `ETAT_LIBRE` joined the state space. The previous version
  // indexed by RANK (`s[k] = P(rank >= k + 1)`), which silently assumed the first
  // state had rank 1. `ETAT_LIBRE` has rank 0, so that assumption became false and
  // every probability would have landed one cell too severe — while each row still
  // summed to 1, which is exactly the kind of break no total-based check would catch.
  // Indexing by position removes the assumption instead of updating it: it holds for
  // any contiguous ordered state space, which `verifierOrdreEtats` asserts.
  const survie = (from: EtatChaine): number[] => {
    // ⚠️ A row may be ABSENT and not merely empty. The type says `Record<EtatChaine, …>`,
    // but a hand-built matrix — a test fixture, a payload decoded at a boundary — can be
    // missing a state, and `scripts/` is not covered by `npm run build`'s typecheck, so
    // the compiler does not always catch it. Read a missing row as an empty one, which
    // is the case the rest of this function already handles, rather than throwing a
    // TypeError from inside an accumulation loop.
    const row = out.p[from] ?? {};
    const s: number[] = [];
    for (let j = 0; j < ETATS_CHAINE.length; j++) {
      let acc = 0;
      for (let k = j; k < ETATS_CHAINE.length; k++) acc += row[ETATS_CHAINE[k]] ?? 0;
      s.push(acc);
    }
    return s;
  };

  const rows = [...ETATS_CHAINE].sort((a, b) => rangEtat(a) - rangEtat(b));
  const survies = rows.map(survie);

  // For each threshold, the survival must be non-decreasing in the starting state.
  // Pool adjacent violators. ⚠️ Starts at j = 1: s[0] = P(any state) = 1 for every
  // row, so threshold 0 carries no information and pooling it does nothing.
  for (let k = 1; k < ETATS_CHAINE.length; k++) {
    for (let i = 1; i < rows.length; i++) {
      if (out.p[rows[i]] && Object.keys(out.p[rows[i]]).length === 0) continue;
      if (out.p[rows[i - 1]] && Object.keys(out.p[rows[i - 1]]).length === 0) continue;
      if (survies[i][k] < survies[i - 1][k] - 1e-12) {
        violations++;
        const moyenne = (survies[i][k] + survies[i - 1][k]) / 2;
        survies[i][k] = moyenne;
        survies[i - 1][k] = moyenne;
      }
    }
  }

  // Rebuild each row from its corrected survival function. S is non-increasing in
  // k by construction of the differences, so clamp before differencing.
  rows.forEach((from, i) => {
    if (!out.p[from] || Object.keys(out.p[from]).length === 0) return;
    const s = survies[i];
    for (let k = s.length - 2; k >= 0; k--) s[k] = Math.max(s[k], s[k + 1]);
    // P(state == ETATS_CHAINE[j]) = s[j] − s[j+1], the last one differencing against 0.
    for (let j = 0; j < ETATS_CHAINE.length; j++) {
      const to = ETATS_CHAINE[j];
      const next = j + 1 < ETATS_CHAINE.length ? s[j + 1] : 0;
      out.p[from][to] = Math.max(0, s[j] - next);
    }
    // Renormalise: the pooling can leave a row a hair off 1.
    const total = ETATS_CHAINE.reduce((a, to) => a + (out.p[from][to] ?? 0), 0);
    if (total > 0) for (const to of ETATS_CHAINE) out.p[from][to] = (out.p[from][to] ?? 0) / total;
  });

  return { matrix: out, violations };
}

/**
 * Measured asymmetry: mean probability of rising vs falling one state.
 *
 * ⚠️⚠️ `etats` is not a convenience, it is the difference between two DIFFERENT
 * QUANTITIES, and conflating them would invalidate a published figure.
 *
 * Restricted to `NIVEAUX`, this measures « once under an arrêté, does its severity
 * rise faster than it falls? » — the hysteresis of §5.1, and the **1.77** published
 * from the 2026-08-11 calibration.
 *
 * Over all of `ETATS_CHAINE`, entering restriction (`ETAT_LIBRE` → vigilance) counts
 * as a rise and leaving it as a fall. That is a legitimate and different question —
 * « do restrictions arrive faster than they end? » — whose answer is NOT comparable to
 * 1.77. Passing the set explicitly is what stops the two being reported as one number.
 */
export function asymetrie(
  m: TransitionMatrix,
  etats: EtatChaine[] = ETATS_CHAINE,
): { monte: number; descend: number; ratio?: number } {
  let monte = 0;
  let descend = 0;
  let lignes = 0;
  for (const from of etats) {
    if (!m.p[from] || Object.keys(m.p[from]).length === 0) continue;
    lignes++;
    for (const to of etats) {
      const p = m.p[from][to] ?? 0;
      if (rangEtat(to) > rangEtat(from)) monte += p;
      else if (rangEtat(to) < rangEtat(from)) descend += p;
    }
  }
  if (lignes === 0) return { monte: 0, descend: 0 };
  const mo = monte / lignes;
  const de = descend / lignes;
  return { monte: mo, descend: de, ratio: de > 0 ? mo / de : undefined };
}

export interface ModeleN2 {
  /** one matrix per regime — §5.4 forbids fitting across the 2021 reform */
  parRegime: Record<Regime, TransitionMatrix>;
  /** per-department matrices, the random effects of §5.4 */
  parDepartement: Record<string, TransitionMatrix>;
  /** national prior, used to pool thin rows */
  prior: TransitionMatrix;
  /** transitions skipped because the days were not consecutive */
  sautsIgnores: number;
  /**
   * ⚠️ ALWAYS false in this repository today. The model has never been fitted on
   * the real archive — that needs egress. A caller must not present an
   * uncalibrated model's output as an estimate.
   */
  calibre: boolean;
  hypotheses: string[];
}

export function fitModeleN2(observations: Observation[], options: FitOptions = {}): ModeleN2 {
  const hypotheses: string[] = [];
  const prior = fitTransitions(observations, { minParLigne: 1 });
  const { sautsIgnores } = countTransitions(observations);

  const parRegime = {} as ModeleN2["parRegime"];
  for (const regime of ["pre_2021", "post_2021"] as Regime[]) {
    const subset = observations.filter((o) => regimeOf(o.day) === regime);
    const brut = fitTransitions(subset, { ...options, prior });
    parRegime[regime] = enforceMonotonicity(brut).matrix;
  }
  hypotheses.push(
    "Deux matrices distinctes de part et d'autre du décret 2021-795 (23 juin 2021) : ajuster à " +
      "travers la réforme attribuerait au CLIMAT ce qui vient de la RÉGLEMENTATION.",
  );

  const parDepartement: Record<string, TransitionMatrix> = {};
  const deps = new Set(observations.map((o) => o.departement).filter((d): d is string => !!d));
  for (const dep of deps) {
    const subset = observations.filter((o) => o.departement === dep);
    parDepartement[dep] = enforceMonotonicity(
      fitTransitions(subset, { ...options, prior, mutualisation: options.mutualisation ?? 0.3 }),
    ).matrix;
  }
  if (deps.size > 0) {
    hypotheses.push(
      `Effets aléatoires par département (${deps.size} départements) : les lignes trop peu ` +
        "fournies sont MUTUALISÉES vers l'a priori national et signalées " +
        "`données_insuffisantes`, jamais extrapolées.",
    );
  }

  if (sautsIgnores > 0) {
    hypotheses.push(
      `${sautsIgnores} transitions écartées : les jours n'étaient pas consécutifs. Une lacune ` +
        "d'archive n'est pas une transition — la compter gonflerait les probabilités de descente.",
    );
  }

  hypotheses.push(
    "⚠️ MODÈLE NON CALIBRÉ. Aucun ajustement sur l'archive réelle n'a été effectué : il exige " +
      "l'egress, bloqué en bac à sable. Ce qui est vérifié est l'estimateur et son banc de " +
      "validation, sur données synthétiques dont les paramètres vrais sont connus.",
  );

  return { parRegime, parDepartement, prior, sautsIgnores, calibre: false, hypotheses };
}

/** One step of the chain, given a level and a uniform draw in [0, 1). */
export function stepChaine(
  m: TransitionMatrix,
  from: EtatChaine,
  u: number,
): EtatChaine | undefined {
  const row = m.p[from];
  if (!row || Object.keys(row).length === 0) return undefined;
  let acc = 0;
  for (const to of ETATS_CHAINE) {
    acc += row[to] ?? 0;
    if (u < acc) return to;
  }
  return ETATS_CHAINE.at(-1);
}
