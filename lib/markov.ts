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

import { NIVEAUX, rang } from "./juridiction";
import type { NiveauGravite } from "./types";

/** One observed day: which zone, which date, which level. */
export interface Observation {
  zone: string;
  /** day index, as in the RLE calendar (lib/history HISTORY_DAY_MS) */
  day: number;
  niveau: NiveauGravite;
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
  /** from level → to level → probability, rows summing to 1 */
  p: Record<NiveauGravite, Partial<Record<NiveauGravite, number>>>;
  /** how many transitions each row was estimated from */
  n: Record<NiveauGravite, number>;
  /**
   * Rows whose sample was too small to estimate. ⚠️ Flagged rather than
   * extrapolated (§5.4): a row with three observations pooled from a national
   * prior is honest, a row invented from a smooth function is not.
   */
  donneesInsuffisantes: NiveauGravite[];
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
  for (const l of NIVEAUX) {
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
  counts: Record<NiveauGravite, Partial<Record<NiveauGravite, number>>>;
  sautsIgnores: number;
} {
  const counts = {} as Record<NiveauGravite, Partial<Record<NiveauGravite, number>>>;
  for (const l of NIVEAUX) counts[l] = {};
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

  for (const from of NIVEAUX) {
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

    const empirique: Partial<Record<NiveauGravite, number>> = {};
    for (const to of NIVEAUX) empirique[to] = (row[to] ?? 0) / total;

    const priorRow = options.prior?.p[from];
    // A thin row is pooled towards the prior at full weight, whatever the
    // configured weight: that is what "insufficient" means. It is still flagged,
    // because a pooled row is not an estimate for THIS zone.
    const poids = total < minParLigne ? (priorRow ? 1 : 0) : mutualisation;
    if (total < minParLigne) out.donneesInsuffisantes.push(from);

    for (const to of NIVEAUX) {
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

  // Survival function per row: S[from][k] = P(next level rank >= k).
  const survie = (from: NiveauGravite): number[] => {
    const s: number[] = [];
    for (let k = 1; k <= NIVEAUX.length; k++) {
      let acc = 0;
      for (const to of NIVEAUX) if (rang(to) >= k) acc += out.p[from][to] ?? 0;
      s.push(acc);
    }
    return s;
  };

  const rows = [...NIVEAUX].sort((a, b) => rang(a) - rang(b));
  const survies = rows.map(survie);

  // For each threshold k, the survival must be non-decreasing in the starting
  // level. Pool adjacent violators.
  for (let k = 0; k < NIVEAUX.length; k++) {
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
    if (Object.keys(out.p[from]).length === 0) return;
    const s = survies[i];
    for (let k = s.length - 2; k >= 0; k--) s[k] = Math.max(s[k], s[k + 1]);
    for (let k = 0; k < NIVEAUX.length; k++) {
      const to = NIVEAUX[k];
      const next = k + 1 < NIVEAUX.length ? s[k + 1] : 0;
      out.p[from][to] = Math.max(0, s[k] - next);
    }
    // Renormalise: the pooling can leave a row a hair off 1.
    const total = NIVEAUX.reduce((a, to) => a + (out.p[from][to] ?? 0), 0);
    if (total > 0) for (const to of NIVEAUX) out.p[from][to] = (out.p[from][to] ?? 0) / total;
  });

  return { matrix: out, violations };
}

/** Measured asymmetry: mean probability of rising vs falling one level. */
export function asymetrie(m: TransitionMatrix): { monte: number; descend: number; ratio?: number } {
  let monte = 0;
  let descend = 0;
  let lignes = 0;
  for (const from of NIVEAUX) {
    if (Object.keys(m.p[from]).length === 0) continue;
    lignes++;
    for (const to of NIVEAUX) {
      const p = m.p[from][to] ?? 0;
      if (rang(to) > rang(from)) monte += p;
      else if (rang(to) < rang(from)) descend += p;
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
  from: NiveauGravite,
  u: number,
): NiveauGravite | undefined {
  const row = m.p[from];
  if (!row || Object.keys(row).length === 0) return undefined;
  let acc = 0;
  for (const to of NIVEAUX) {
    acc += row[to] ?? 0;
    if (u < acc) return to;
  }
  return NIVEAUX.at(-1);
}
