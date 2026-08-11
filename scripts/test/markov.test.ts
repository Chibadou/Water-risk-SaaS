// Sprint 45 — the N2 estimator and its validation harness.
// npx tsx scripts/test/markov.test.ts
//
// ⚠️⚠️ WHAT THIS SUITE PROVES, AND WHAT IT DOES NOT.
//
// It proves the estimator recovers parameters it was given, that the §5.4
// constraints are enforced, and that the §5.5 harness measures what it claims. It
// proves NOTHING about the model's skill on France: the model has never been fitted
// on the real archive, which needs egress the sandbox does not have.
//
// The method is to generate series from a KNOWN transition matrix, then check the
// estimator recovers it. That is the only way to test an estimator without data —
// and it is genuinely informative, because an estimator that cannot recover its own
// generating process will not recover anything else either.

import { readFileSync } from "fs";
import {
  asymetrie,
  countTransitions,
  enforceMonotonicity,
  fitModeleN2,
  fitTransitions,
  regimeOf,
  stepChaine,
  REGIME_PIVOT_DAY,
  type Observation,
  type TransitionMatrix,
} from "../../lib/markov";
import {
  baselineClimatologique,
  brier,
  couvertureReconstruction,
  diagrammeFiabilite,
  ecartDistributionDurees,
  validationCroisee,
  type JourEvalue,
} from "../../lib/validation";
import { NIVEAUX } from "../../lib/juridiction";
import type { Episode } from "../../lib/ia";
import type { NiveauGravite } from "../../lib/types";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number | undefined, b: number, tol: number) =>
  a !== undefined && Math.abs(a - b) <= tol;

/** Deterministic PRNG, so a failure is reproducible rather than "flaky". */
function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The generating process: levels rise fast and fall slowly — the hysteresis §5.1
 * gives as the physical justification for a Markov chain.
 */
const VRAI: TransitionMatrix = {
  p: {
    vigilance: { vigilance: 0.9, alerte: 0.1 },
    alerte: { vigilance: 0.05, alerte: 0.85, alerte_renforcee: 0.1 },
    alerte_renforcee: { alerte: 0.04, alerte_renforcee: 0.86, crise: 0.1 },
    crise: { alerte_renforcee: 0.05, crise: 0.95 },
  },
  n: { vigilance: 0, alerte: 0, alerte_renforcee: 0, crise: 0 },
  donneesInsuffisantes: [],
};

const DAY0 = Math.floor(Date.UTC(2022, 0, 1) / 86_400_000);

function simuler(
  jours: number,
  zone = "Z1",
  departement = "28",
  seed = 42,
  debut = DAY0,
  matrice: TransitionMatrix = VRAI,
): Observation[] {
  const rnd = mulberry(seed);
  const out: Observation[] = [];
  let niveau: NiveauGravite = "vigilance";
  for (let i = 0; i < jours; i++) {
    out.push({ zone, day: debut + i, niveau, departement });
    niveau = stepChaine(matrice, niveau, rnd()) ?? niveau;
  }
  return out;
}

// ---- 1. The estimator recovers the matrix it was given ----
{
  const obs = simuler(40_000);
  const fitted = fitTransitions(obs);
  // 40 000 days is a large sample; the recovery should be within a couple of points.
  check("fit: recovers P(vigilance → vigilance) = 0.90", near(fitted.p.vigilance.vigilance, 0.9, 0.02));
  check("fit: recovers P(crise → crise) = 0.95", near(fitted.p.crise.crise, 0.95, 0.02));
  check("fit: recovers P(alerte → alerte_renforcee) = 0.10",
    near(fitted.p.alerte.alerte_renforcee, 0.1, 0.02));
  check("fit: every row sums to 1",
    NIVEAUX.every((l) => near(NIVEAUX.reduce((a, t) => a + (fitted.p[l][t] ?? 0), 0), 1, 1e-9)));
  check("fit: the sample size per row is reported", NIVEAUX.every((l) => fitted.n[l] > 0));
  check("fit: nothing is flagged insufficient on 40 000 days",
    fitted.donneesInsuffisantes.length === 0);
}

// ---- 2. A gap in the archive is not a transition (anti-pattern n°8) ----
{
  // Two blocks of days with a hole between them. The last day of block 1 is crise,
  // the first of block 2 is vigilance: reading that as a transition would invent a
  // crise → vigilance jump and inflate the down-probabilities.
  const obs: Observation[] = [
    { zone: "Z", day: 100, niveau: "alerte_renforcee" },
    { zone: "Z", day: 101, niveau: "crise" },
    // 30-day hole
    { zone: "Z", day: 131, niveau: "vigilance" },
    { zone: "Z", day: 132, niveau: "vigilance" },
  ];
  const { counts, sautsIgnores } = countTransitions(obs);
  check("gap: the non-consecutive pair is skipped", sautsIgnores === 1);
  check("gap: … so no crise → vigilance transition is invented",
    (counts.crise.vigilance ?? 0) === 0);
  check("gap: the consecutive pairs are still counted",
    counts.alerte_renforcee.crise === 1 && counts.vigilance.vigilance === 1);

  // Observations of two zones must not produce a transition ACROSS zones either.
  const deux: Observation[] = [
    { zone: "A", day: 10, niveau: "crise" },
    { zone: "B", day: 11, niveau: "vigilance" },
  ];
  check("gap: two different zones never form a transition",
    countTransitions(deux).sautsIgnores === 0 &&
      Object.values(countTransitions(deux).counts).every((r) => Object.keys(r).length === 0));
}

// ---- 3. A thin row is pooled and FLAGGED, never extrapolated (§5.4) ----
{
  const obs = simuler(80, "Z1", "28", 7);
  const prior = fitTransitions(simuler(40_000, "national", "00", 99), { minParLigne: 1 });
  const fitted = fitTransitions(obs, { minParLigne: 20, prior });
  check("thin: at least one row is flagged insufficient", fitted.donneesInsuffisantes.length > 0);
  // ⚠️ The flag is what matters, not the value. A pooled row is a national prior
  // wearing a local label, and a caller must be able to tell.
  check("thin: a flagged row still sums to 1 — it is pooled, not blanked",
    fitted.donneesInsuffisantes.every((l) =>
      near(NIVEAUX.reduce((a, t) => a + (fitted.p[l][t] ?? 0), 0), 1, 1e-9)));

  // With no prior available and no observation at all, the row stays EMPTY. Neither
  // self-absorbing (which would make an episode eternal) nor uniform (which would
  // invent a 25 % chance of jumping to crisis).
  const vide = fitTransitions([{ zone: "Z", day: 1, niveau: "vigilance" }]);
  check("empty: a level never observed leaves an EMPTY row, not a uniform one",
    Object.keys(vide.p.crise).length === 0);
  check("empty: … and is flagged", vide.donneesInsuffisantes.includes("crise"));
  check("empty: stepping from an unestimated level returns undefined rather than guessing",
    stepChaine(vide, "crise", 0.5) === undefined);
}

// ---- 4. Monotonicity is enforced, and enforcement preserves the row sums ----
{
  // A deliberately non-monotone matrix: from `crise`, the chance of staying at
  // crise (0.2) is LOWER than from `alerte_renforcee` (0.9). Physically absurd —
  // being in crisis today would make tomorrow's crisis less likely.
  const tordu: TransitionMatrix = {
    p: {
      vigilance: { vigilance: 1 },
      alerte: { alerte: 1 },
      alerte_renforcee: { crise: 0.9, alerte_renforcee: 0.1 },
      crise: { crise: 0.2, vigilance: 0.8 },
    },
    n: { vigilance: 100, alerte: 100, alerte_renforcee: 100, crise: 100 },
    donneesInsuffisantes: [],
  };
  const { matrix, violations } = enforceMonotonicity(tordu);
  check("monotone: the violation is detected", violations > 0);
  check("monotone: P(stay at crise | crise) is no longer below P(reach crise | AR)",
    (matrix.p.crise.crise ?? 0) >= (matrix.p.alerte_renforcee.crise ?? 0) - 1e-9);
  // ⚠️ The property an earlier sketch broke: clamping the offending cell directly
  // left the row unnormalised, so the chain silently leaked probability.
  check("monotone: every corrected row still sums to 1",
    NIVEAUX.every((l) =>
      Object.keys(matrix.p[l]).length === 0 ||
      near(NIVEAUX.reduce((a, t) => a + (matrix.p[l][t] ?? 0), 0), 1, 1e-9)));
  check("monotone: an already-monotone matrix is left alone",
    enforceMonotonicity(fitTransitions(simuler(40_000))).violations === 0);
  check("monotone: rows with no data are not fabricated by the correction",
    Object.keys(enforceMonotonicity(fitTransitions([{ zone: "Z", day: 1, niveau: "vigilance" }]))
      .matrix.p.crise).length === 0);
}

// ---- 5. Asymmetry is measured, not imposed ----
{
  const fitted = fitTransitions(simuler(40_000));
  const a = asymetrie(fitted);
  // The generating process rises faster than it falls, so the measured ratio must
  // exceed 1. ⚠️ The function REPORTS this rather than enforcing it: in a calm year
  // falls genuinely outnumber rises, and forcing the inequality would be modelling
  // a belief instead of measuring one.
  check("asymmetry: the measured rise/fall ratio exceeds 1 on a rising process",
    (a.ratio ?? 0) > 1);
  const mkt = readFileSync("lib/markov.ts", "utf-8");
  check("asymmetry: nothing in the module CLAMPS the asymmetry",
    !/monte\s*=\s*Math\.max|descend\s*=\s*Math\.min/.test(mkt));
}

// ---- 6. The 2021 regime split (§5.4) ----
{
  check("regime: 22 June 2021 is pre-reform", regimeOf(REGIME_PIVOT_DAY - 1) === "pre_2021");
  check("regime: 23 June 2021 is post-reform", regimeOf(REGIME_PIVOT_DAY) === "post_2021");

  const avant = simuler(6_000, "Z", "28", 1, REGIME_PIVOT_DAY - 6_500);
  const apres = simuler(6_000, "Z", "28", 2, REGIME_PIVOT_DAY + 1);
  const modele = fitModeleN2([...avant, ...apres]);
  check("regime: two distinct matrices are fitted",
    modele.parRegime.pre_2021 !== undefined && modele.parRegime.post_2021 !== undefined);
  check("regime: both were estimated from real samples",
    modele.parRegime.pre_2021.n.alerte > 0 && modele.parRegime.post_2021.n.alerte > 0);
  // ⚠️ The reason, journalled: fitting across the reform attributes to the climate
  // what comes from the regulation.
  check("regime: the reason is journalled in words",
    modele.hypotheses.some((h) => /CLIMAT/.test(h) && /RÉGLEMENTATION/.test(h)));
  check("regime: department random effects are fitted too",
    Object.keys(modele.parDepartement).length === 1);
  check("regime: pooling of thin department rows is journalled",
    modele.hypotheses.some((h) => /MUTUALISÉES/.test(h)));

  // ⚠️⚠️ The single most important assertion in this file.
  check("calibration: the model declares itself NOT CALIBRATED", modele.calibre === false);
  check("calibration: … and says why, in the journal",
    modele.hypotheses.some((h) => /NON CALIBRÉ/.test(h) && /egress/.test(h)));
}

// ---- 7. The Brier score, and the baseline it must beat ----
{
  const obs = simuler(2_000).map((o) => ({ zone: o.zone, day: o.day, observe: o.niveau }));
  const baseline = baselineClimatologique(obs);
  check("baseline: it is a probability distribution",
    near(NIVEAUX.reduce((a, l) => a + (baseline[l] ?? 0), 0), 1, 1e-9));

  const parfait: JourEvalue[] = obs.map((o) => ({ ...o, prevu: { [o.observe]: 1 } }));
  check("brier: a perfect forecast scores 0", near(brier(parfait), 0, 1e-9));
  const pire: JourEvalue[] = obs.map((o) => ({
    ...o,
    prevu: { [NIVEAUX.find((l) => l !== o.observe)!]: 1 },
  }));
  check("brier: a confidently wrong forecast scores 2", near(brier(pire), 2, 1e-9));
  const clim: JourEvalue[] = obs.map((o) => ({ ...o, prevu: baseline }));
  check("brier: the climatological baseline sits between the two",
    (brier(clim) ?? 0) > 0 && (brier(clim) ?? 2) < 2);
  check("brier: an empty set yields undefined, not 0 — 0 would read as perfect",
    brier([]) === undefined);

  // ⚠️ Anti-pattern n°6 in arithmetic. A forecast that confuses alerte with crise
  // must be PENALISED; the two-class "alerte or worse" Brier would not notice.
  const confus: JourEvalue[] = obs.map((o) => ({
    ...o,
    prevu:
      o.observe === "crise"
        ? { alerte: 1 }
        : o.observe === "alerte"
          ? { crise: 1 }
          : { [o.observe]: 1 },
  }));
  check("brier: confusing alerte with crise is charged for",
    (brier(confus) ?? 0) > (brier(parfait) ?? 0));
}

// ---- 8. Reliability: calibration and skill are independent ----
{
  const obs = simuler(5_000).map((o) => ({ zone: o.zone, day: o.day, observe: o.niveau }));
  const baseline = baselineClimatologique(obs);
  const bins = diagrammeFiabilite(obs.map((o) => ({ ...o, prevu: baseline })), "alerte");
  check("reliability: bins are produced", bins.length > 0);
  // The climatological baseline is perfectly calibrated BY CONSTRUCTION and has no
  // skill at all — which is exactly why §5.5 asks for the diagram AND the Brier
  // score. Publishing calibration alone lets a useless model look finished.
  check("reliability: the baseline is well calibrated despite having no skill",
    bins.every((b) => Math.abs(b.prevuMoyen - b.observeFrequence) < 0.05));
  check("reliability: empty bins are dropped, not plotted at zero",
    bins.every((b) => b.nombre > 0));
}

// ---- 9. Episode-duration distributions — the criterion that matters (§5.5) ----
{
  const ep = (start: number, len: number): Episode => ({ startDay: start, lengthDays: len, rank: 4 });
  const observes = [ep(0, 20), ep(100, 20)];

  check("durations: identical distributions give distance 0",
    near(ecartDistributionDurees(observes, [ep(500, 20), ep(700, 20)]).distance, 0, 1e-9));

  // ⚠️ THE case a frequency model cannot distinguish: forty 1-day episodes carry
  // the SAME 40 days as two 20-day ones, and cost a fraction of the JEA once a
  // buffer exists. The distance must be maximal.
  const courts = Array.from({ length: 40 }, (_, i) => ep(i * 3, 1));
  const e = ecartDistributionDurees(observes, courts);
  check("durations: same day total, opposite structure → distance 1", near(e.distance, 1, 1e-9));
  check("durations: the longest run is reported for both", e.maxObserve === 20 && e.maxSimule === 1);
  check("durations: a partial overlap lands strictly between 0 and 1",
    (() => {
      const d = ecartDistributionDurees(observes, [ep(0, 20), ep(50, 1)]).distance;
      return d > 0 && d < 1;
    })());
}

// ---- 10. Cross-validation: both modes, and lost folds are reported ----
{
  // Three years, three departments.
  const jours: JourEvalue[] = [];
  for (const [i, dep] of ["28", "34", "69"].entries()) {
    for (const annee of [2022, 2023, 2024]) {
      const debut = Math.floor(Date.UTC(annee, 0, 1) / 86_400_000);
      for (const o of simuler(360, `Z${dep}`, dep, 10 + i, debut)) {
        jours.push({ zone: o.zone, day: o.day, departement: dep, observe: o.niveau, prevu: {} });
      }
    }
  }

  // A "model" that forecasts the training marginal — i.e. exactly the baseline. It
  // must come out with a gain of ZERO, which is the harness's own sanity check: a
  // harness that reports skill for a model identical to its baseline is broken.
  const commeBaseline = (entrainement: JourEvalue[], test: JourEvalue[]): JourEvalue[] => {
    const b = baselineClimatologique(entrainement);
    return test.map((j) => ({ ...j, prevu: b }));
  };
  const nul = validationCroisee(jours, "leave_one_year_out", commeBaseline);
  check("cv: a model identical to the baseline scores a gain of zero",
    near(nul.gainMoyen, 0, 1e-9));

  // A model with real information: it knows yesterday's level (a one-step forecast).
  const informe = (entrainement: JourEvalue[], test: JourEvalue[]): JourEvalue[] => {
    const m = fitTransitions(
      entrainement.map((j) => ({ zone: j.zone, day: j.day, niveau: j.observe })),
    );
    const parJour = new Map(test.map((j) => [`${j.zone}|${j.day}`, j]));
    return test.map((j) => {
      const hier = parJour.get(`${j.zone}|${j.day - 1}`);
      return { ...j, prevu: hier ? (m.p[hier.observe] ?? {}) : {} };
    });
  };
  const skill = validationCroisee(jours, "leave_one_year_out", informe);
  check("cv: a model that uses yesterday's level beats the baseline",
    (skill.gainMoyen ?? -1) > 0);
  check("cv: leave-one-year-out produces one fold per year", skill.plis.length === 3);

  const parDep = validationCroisee(jours, "leave_one_department_out", informe);
  check("cv: leave-one-department-out produces one fold per department",
    parDep.plis.length === 3);
  check("cv: every fold reports both scores and its size",
    parDep.plis.every((p) => p.brierModele !== undefined && p.brierBaseline !== undefined && p.jours > 0));
  // ⚠️ The honesty constraint: a positive mean must not hide a losing fold.
  check("cv: lost folds are listed rather than averaged away",
    Array.isArray(parDep.plisPerdus));
  check("cv: the leakage risk is journalled",
    parDep.hypotheses.some((h) => /PLI D'ENTRAÎNEMENT/.test(h)));
  check("cv: and the two-class Brier trap is named",
    parDep.hypotheses.some((h) => /anti-pattern n°6/.test(h)));
}

// ---- 11. Reconstruction coverage: gaps listed, never interpolated (§8) ----
{
  const debut = Math.floor(Date.UTC(2022, 0, 1) / 86_400_000);
  // A full 2022 and 2023.
  const complet = Array.from({ length: 730 }, (_, i) => ({ day: debut + i }));
  const c = couvertureReconstruction(complet, [2022, 2023]);
  check("coverage: two complete years leave no gap",
    c.lacunes.length === 0 && c.couvert === c.attendu);

  // Remove March 2022.
  const marsDebut = Math.floor(Date.UTC(2022, 2, 1) / 86_400_000);
  const marsFin = Math.floor(Date.UTC(2022, 2, 31) / 86_400_000);
  const troue = complet.filter((d) => d.day < marsDebut || d.day > marsFin);
  const t = couvertureReconstruction(troue, [2022, 2023]);
  check("coverage: a missing month is reported as ONE gap", t.lacunes.length === 1);
  check("coverage: with its exact bounds",
    t.lacunes[0].debut === marsDebut && t.lacunes[0].fin === marsFin);
  check("coverage: and the shortfall is counted", t.attendu - t.couvert === 31);
  // ⚠️ The criterion is "sans lacune NON SIGNALÉE", not "sans lacune". Listing the
  // hole satisfies it; filling it by interpolation would be anti-pattern n°8.
  const src = readFileSync("lib/validation.ts", "utf-8");
  check("coverage: nothing in the module interpolates a gap",
    !/interpol/i.test(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")));
}



console.log(failures === 0 ? "markov: all checks pass" : `markov: ${failures} FAILED`);
if (failures > 0) process.exit(1);
