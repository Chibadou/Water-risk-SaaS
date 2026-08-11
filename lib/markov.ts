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
// **3. The chain had no « no restriction » state, which looked like the cause.**
// `NIVEAUX` holds four ARRÊTÉ levels and an observation existed only for a day under
// an arrêté, so the chain could not represent entering or leaving restriction at all.
// That made the onset of a restriction — the thing users ask about first —
// unrepresentable, and it was the obvious suspect.
//
// ---------------------------------------------------------------------------
// ⚠️⚠️ THE FIFTH STATE WAS ADDED, AND IT IS NOT THE CAUSE (run 31495086087)
// ---------------------------------------------------------------------------
//
// `ETAT_LIBRE` now exists and is fitted on real data: 2 844 zones across all 100
// departments, 6.0 M observations of which **73.5 % are unrestricted days**, derived by
// complement of the RLE calendar. `P(libre → libre) = 0.9967`, estimated from 4.4 M
// transitions, nothing flagged insufficient. The state is well populated, not a token.
//
// **The onset is now representable, and it is still not predictable.** Scored on the
// 14 723 days where a zone went from free to under-arrêté, the Brier gain against a
// climatological baseline is **−0.60, losing in all 100 departments**. On all transition
// days it is −0.98 (against −1.16 without the fifth state: slightly less bad, nowhere
// near enough). Overall it still shows +0.44 — persistence again, for the same reason.
//
// So the hypothesis in point 3 is **REFUTED**, and that is the useful part: the cause is
// not the state space. The next candidate is that this chain is UNCONDITIONAL — it has no
// covariates, so nothing in it can know that it has not rained.
//
// ---------------------------------------------------------------------------
// ⚠️⚠️ CONDITIONING ON THE MONTH ALSO FAILS — AND SAYS WHY (run 31498428653)
// ---------------------------------------------------------------------------
//
// The cheapest covariate was tried: the calendar month, needing no fetch and no spatial
// join. `fitConditionnel` fits one matrix per month; all 12 contexts came out
// well-populated (157 k–465 k transitions each, **nothing pooled**).
//
// **The month is a strong signal, and the chain recovers it cleanly.** P(leave the free
// state) runs from **0.010 %/day in January to 1.479 % in July** — a factor of 148. There
// is nothing wrong with the conditioning machinery, and seasonality is real.
//
// **It nonetheless buys nothing for the onset.** Scored on the same 14 723 onsets:
// **−0.58 against the annual climatology and −0.76 against a month-conditioned one**,
// losing all 100 folds either way. Against the SAME (annual) bar the unconditional
// five-state model scored −0.595, so conditioning on the month bought **+0.016**.
//
// ⚠️ THE REASON, and it is the useful part — it constrains what the next covariate must be.
// A covariate only helps pick out a DAY if it varies WITHIN its own context. The month does
// not: every day in July is handed the same 1.479 %. So it improves the RATE and cannot
// improve the TIMING, and a month-conditioned climatology already knows that rate — which
// is exactly why the fair bar erases the gain. The next covariate must carry information
// the calendar does not: something that moves day to day and differs between two Julys.
// Soil moisture (SWI) is the candidate; the calendar is now measured and eliminated.
//
// ⚠️ And a caution the same run demonstrates. Reported against the annual bar alone the
// figure is −0.58 rather than −0.76: the flattery is worth **0.18 of Brier**. Here it did
// not flip the conclusion, both being negative. On a model that ever does work it would,
// which is why `validationCroisee` takes its reference explicitly.
//
// ✅ **What the same run confirms, twice over.** The hysteresis restricted to `NIVEAUX`
// comes out at **1.78** on this 2 844-zone five-state sample against **1.77** on all
// 10 221 zones with four states. An independent re-measurement through a different state
// space and a different sample: the §5.1 argument is solid, and the refactor did not
// disturb the published figure.
//
// ⚠️ And the figure that must never be quoted in its place: over all five states the
// asymmetry is **0.63** — restrictions END faster than they ARRIVE. A true statement
// about a different question, which is why `asymetrie` takes its state set explicitly.

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

/**
 * A discrete condition a transition matrix may be fitted separately for.
 *
 * ⚠️ A STRING, and deliberately not a number or an enum. The first context is the
 * calendar month, the next is meant to be a soil-moisture band, and later possibly a
 * pair of the two — a string keeps `fitConditionnel` indifferent to what is being
 * conditioned on, so adding a covariate is a new `contexteDe` function and not a change
 * to the estimator.
 *
 * ⚠️ It must be COARSE. Each context gets its own matrix estimated from its own subset,
 * so contexts multiply the data requirement: 12 months over 5 states already means 12
 * matrices of 25 cells. Anything finer than a band is how a conditional model becomes a
 * lookup table of noise, which is why thin contexts are pooled and flagged below.
 */
export type Contexte = string;

/** Calendar month of a day index, as a context: "01".."12". */
export function contexteMois(day: number): Contexte {
  const mois = new Date(day * 86_400_000).getUTCMonth() + 1;
  return String(mois).padStart(2, "0");
}

export interface ModeleConditionnel {
  /** one matrix per context, thin ones pooled towards the prior and flagged */
  parContexte: Record<Contexte, TransitionMatrix>;
  /** the unconditional matrix, kept so the conditional gain is measurable */
  prior: TransitionMatrix;
  /** contexts actually observed, sorted */
  contextes: Contexte[];
  /** contexts whose sample was thin enough to be pooled */
  contextesMutualises: Contexte[];
  hypotheses: string[];
}

/**
 * Fit one transition matrix per context.
 *
 * ⚠️⚠️ Why this exists, and what it is a test OF. Two calibrations measured that the
 * unconditional chain cannot anticipate anything (see the header): +0.44 to +0.69 overall,
 * −0.60 to −1.16 on the days that change. Both eliminated a suspect. The remaining
 * hypothesis is that the chain has nothing to condition ON — no covariate, so nothing in
 * it can know that it has not rained. This function is the machinery to test that.
 *
 * ⚠️ The FAIR comparison matters more than the mechanism. A month-conditioned model scored
 * against a month-BLIND baseline would win on seasonality alone and prove nothing: French
 * restrictions are overwhelmingly summer events, so knowing the month is worth a lot
 * against an annual average and nothing against a monthly one. The reference must be
 * conditioned the same way — see `Reference` in lib/validation.
 *
 * ⚠️ Thin contexts are POOLED towards the unconditional matrix and listed, never dropped
 * and never left as raw noise: the §5.4 rule already applied per department, applied again
 * per context. A context with eleven observed transitions is not an estimate.
 */
export function fitConditionnel(
  observations: Observation[],
  contexteDe: (o: Observation) => Contexte,
  options: FitOptions = {},
): ModeleConditionnel {
  // ⚠️ `options.prior` is REUSED when supplied. `FitOptions` had carried a `prior` field
  // all along and this function silently ignored it — a dead parameter that reads as
  // supported, which is worse than an absent one.
  //
  // ⚠️ To be accurate about what this buys: NOTHING at today's call sites, because none of
  // them has a prior to hand — the cross-validation fold has to fit one either way. It
  // matters for a caller that conditions the same fold on two different contexts (month and
  // a soil-moisture band, say), where the unconditional prior is the same full pass over
  // every observation and would otherwise be computed twice. The measured speed-up in this
  // sprint comes from `validationCroiseeMulti`, not from here.
  const prior = options.prior ?? fitTransitions(observations, { minParLigne: 1 });
  const groupes = new Map<Contexte, Observation[]>();
  for (const o of observations) {
    const c = contexteDe(o);
    const bucket = groupes.get(c);
    if (bucket) bucket.push(o);
    else groupes.set(c, [o]);
  }

  const parContexte: Record<Contexte, TransitionMatrix> = {};
  const contextesMutualises: Contexte[] = [];
  for (const [c, subset] of groupes) {
    const m = fitTransitions(subset, { ...options, prior });
    parContexte[c] = enforceMonotonicity(m).matrix;
    if (m.donneesInsuffisantes.length > 0) contextesMutualises.push(c);
  }

  const contextes = [...groupes.keys()].sort();
  const hypotheses = [
    `Une matrice de transition par contexte (${contextes.length} contextes observés). ` +
      "⚠️ Conditionner multiplie le besoin en données : chaque contexte est estimé sur son " +
      "propre sous-ensemble.",
    "⚠️ Les contextes dont une ligne est trop peu fournie sont MUTUALISÉS vers la matrice " +
      "inconditionnelle et listés — jamais laissés en bruit brut, jamais supprimés.",
    "⚠️ Un modèle conditionné doit être comparé à une baseline conditionnée DE LA MÊME " +
      "FAÇON. Face à une baseline aveugle au contexte, il gagnerait par la saisonnalité seule " +
      "et ne prouverait rien.",
  ];
  if (contextesMutualises.length > 0) {
    hypotheses.push(
      `${contextesMutualises.length} contexte(s) mutualisé(s) : ${contextesMutualises.sort().join(", ")}.`,
    );
  }

  return { parContexte, prior, contextes, contextesMutualises, hypotheses };
}

/**
 * The row to forecast from, given a state and a context.
 *
 * ⚠️ Falls back to the unconditional matrix when the context was never observed, and that
 * is the honest behaviour rather than an empty forecast: an unseen month is not evidence
 * that nothing happens, it is absence of evidence, and the unconditional row is the best
 * available statement. An empty row would score as if the model had claimed certainty
 * about nothing (see `brier`: a missing level reads as p = 0).
 */
export function ligneConditionnelle(
  modele: ModeleConditionnel,
  contexte: Contexte,
  etat: EtatChaine,
): Partial<Record<EtatChaine, number>> {
  const m = modele.parContexte[contexte];
  const row = m?.p[etat];
  if (row && Object.keys(row).length > 0) return row;
  return modele.prior.p[etat] ?? {};
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
