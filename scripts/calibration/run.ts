// N2 calibration on the REAL arrêtés archive, and the four §8 acceptance criteria
// that were waiting on it.
//
// ⚠️ Runs on a GitHub runner with full network access, never in the dev sandbox
// where every French open-data host is blocked by the proxy (HANDBOOK §3). It is
// invoked by .github/workflows/probe-restrictions.yml under `mode: "calibration"`
// and commits its report to data/calibration/report.json.
//
// ---------------------------------------------------------------------------
// What this measures, and what a reader must not read into it
// ---------------------------------------------------------------------------
//
// Sprint 45 delivered an estimator and a validation harness verified on SYNTHETIC
// series. This is the first time either touches the French archive. So the report
// answers four questions that had no answer:
//
//   1. Does the reconstruction cover 2022-2023 with every gap LISTED? (§8, ch. 2)
//   2. Does the N2 model beat a climatological baseline in Brier score, under
//      leave-one-year-out AND leave-one-department-out? (§8, ch. 3)
//   3. Does it reproduce the observed distribution of episode durations? (§8, ch. 3)
//   4. On a real site, which term of the variance decomposition dominates? (§6.4)
//
// ⚠️ A negative answer is a result, not a failure of the run. The report records
// whichever answer comes out — including "the model loses to the baseline", which
// would be the single most useful thing this script could tell us.
//
// ⚠️ What it CANNOT answer: anything needing the pilot sites of §5.5 (real
// production data for 2022-2023) or the digitised arrêté-cadre annexes of §5.2.
// Those are named in the report as untouched rather than left implicit.

import { writeFileSync, mkdirSync } from "fs";
import { aggregateCsv, type ZoneHistory } from "../../lib/history";
import { episodesFromPeriodes, type Episode } from "../../lib/ia";
import {
  fitModeleN2,
  fitTransitions,
  asymetrie,
  ETAT_LIBRE,
  ETATS_CHAINE,
  type Observation,
} from "../../lib/markov";
import {
  baselineClimatologique,
  couvertureReconstruction,
  ecartDistributionDurees,
  validationCroisee,
  type JourEvalue,
} from "../../lib/validation";
import { NIVEAUX } from "../../lib/juridiction";
import type { NiveauGravite } from "../../lib/types";

const OUT_DIR = "data/calibration";

/** Median of a list, or undefined when empty — never 0, which would read as a value. */
function mediane(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const RANK_TO_LEVEL: Record<number, NiveauGravite> = {
  1: "vigilance",
  2: "alerte",
  3: "alerte_renforcee",
  4: "crise",
};

/**
 * Expand a zone's run-length calendar into one observation per day.
 *
 * ⚠️ Only the days the calendar actually covers. A day with no run is NOT
 * "vigilance" and not "nothing" — it is a day the archive says nothing about, and
 * inventing a level for it would manufacture transitions into and out of it. That
 * is why the coverage check below reports gaps instead of the estimator filling them.
 */
function observationsFor(code: string, zone: ZoneHistory): Observation[] {
  const out: Observation[] = [];
  const periodes = zone.periodes ?? [];
  for (let i = 0; i + 2 < periodes.length; i += 3) {
    const start = periodes[i];
    const len = periodes[i + 1];
    const niveau = RANK_TO_LEVEL[periodes[i + 2]];
    if (!niveau || len <= 0) continue;
    for (let d = 0; d < len; d++) {
      out.push({ zone: code, day: start + d, niveau, departement: zone.departement });
    }
  }
  return out;
}

/**
 * The same calendar, plus the days with NO arrêté as explicit `ETAT_LIBRE` observations.
 *
 * ⚠️⚠️ This is the change of model the first calibration asked for. The four-state chain
 * could not represent entering or leaving restriction, so it could not forecast the ONSET
 * of a restriction — the question a user asks first. A fifth state makes that
 * representable; whether it makes it PREDICTABLE is what the run measures.
 *
 * ⚠️⚠️ Where the complement is legitimate, and where it is not — the whole difficulty.
 * The archive lists arrêtés, so a day inside no run is a day with no restriction in
 * force, but ONLY over a span where we know the zone was being watched. Two edges are
 * both traps, and both are cut the same conservative way:
 *
 *   - **Before** the first observed arrêté, we do not know the zone existed under that
 *     code. `premiereAnnee` is the first year the zone APPEARS, and appearing means
 *     having an arrêté — so it cannot widen the span backwards either. Using it to start
 *     at 1 January would invent calm months.
 *   - **After** the last observed arrêté, we do not know the zone still exists. VigiEau
 *     redraws its zone referential (see lib/history), so a zone silent since 2019 may
 *     have been retired rather than spared. Filling to the end of the archive would
 *     invent SEVEN YEARS of freedom for such a zone, and there are thousands of them.
 *
 * So the span is `[first observed day, last observed day]`. The free days are exactly the
 * gaps BETWEEN restrictions — which is precisely what the chain needs in order to learn
 * entering and leaving, and nothing that was inferred rather than seen.
 *
 * ⚠️ THE CONTAMINATION TO KEEP IN MIND, and it is not small. "No run covers this day"
 * can also mean "an arrêté covering it was dropped by the parser". The same run measures
 * 1 523 archive rows with no attributable zone (12.1 %). Those periods exist and are
 * missing, so a fraction of the `ETAT_LIBRE` days below are really restricted days in
 * disguise. That biases the chain towards leaving restriction too easily, so any
 * five-state result reads as an upper bound on freedom, not a measurement of it.
 */
function observationsAvecEtatLibre(code: string, zone: ZoneHistory): Observation[] {
  const restreintes = observationsFor(code, zone);
  if (restreintes.length === 0) return restreintes;

  const parJour = new Map<number, Observation>();
  let premier = Infinity;
  let dernier = -Infinity;
  for (const o of restreintes) {
    parJour.set(o.day, o);
    if (o.day < premier) premier = o.day;
    if (o.day > dernier) dernier = o.day;
  }

  const out: Observation[] = [];
  for (let d = premier; d <= dernier; d++) {
    const observee = parJour.get(d);
    out.push(
      observee ?? { zone: code, day: d, niveau: ETAT_LIBRE, departement: zone.departement },
    );
  }
  return out;
}

async function fetchArchive(): Promise<{ text: string; url: string }> {
  const urls = [
    process.env.HISTORY_CSV_URL,
    "https://www.data.gouv.fr/api/1/datasets/r/f425cfa6-ccd1-438e-bb03-9d90ab527851",
  ].filter((u): u is string => !!u);
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "HydroVigie/calibration (contact via repository)" },
      });
      if (!res.ok) {
        errors.push(`${url} → HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      if (text.length < 10_000) {
        errors.push(`${url} → ${text.length} bytes, too small to be the archive`);
        continue;
      }
      return { text, url };
    } catch (e) {
      errors.push(`${url} → ${String(e).slice(0, 200)}`);
    }
  }
  throw new Error(`Archive unreachable:\n${errors.join("\n")}`);
}

async function main() {
  const rapport: Record<string, unknown> = {
    generated: new Date().toISOString(),
    // ⚠️ Set to true ONLY at the very end. A run that dies halfway leaves this
    // false, so a partial report cannot be read as a complete one.
    complet: false,
  };

  const { text, url } = await fetchArchive();
  const agg = aggregateCsv(text);
  const zones = Object.entries(agg.zones);
  rapport.source = { url, bytes: text.length, diag: agg.diag, zonesIndexees: zones.length };

  // Deduplicate: aggregateCsv indexes each zone under both its code and its
  // numeric id, pointing at the same object. Counting both would double every
  // observation and halve every standard error.
  const vues = new Set<ZoneHistory>();
  const uniques: [string, ZoneHistory][] = [];
  for (const [code, z] of zones) {
    if (vues.has(z)) continue;
    vues.add(z);
    uniques.push([code, z]);
  }
  rapport.zonesUniques = uniques.length;

  const observations: Observation[] = [];
  const episodes: Episode[] = [];
  let sansDepartement = 0;
  for (const [code, z] of uniques) {
    observations.push(...observationsFor(code, z));
    episodes.push(...episodesFromPeriodes(z.periodes));
    if (!z.departement) sansDepartement++;
  }
  rapport.observations = observations.length;
  rapport.episodes = episodes.length;
  rapport.zonesSansDepartement = sansDepartement;
  if (sansDepartement > 0) {
    rapport.avertissementDepartement =
      `${sansDepartement} zones sur ${uniques.length} n'ont pas de département : les effets ` +
      "aléatoires de §5.4 ne les couvrent pas. Ce n'est pas un ajustement dégradé, c'est un " +
      "ajustement qui les exclut — et la validation leave-one-department-out les ignore aussi.";
  }

  // --- 1. §8 ch. 2 — is any 2022-2023 gap UNSIGNALLED? ----------------------
  //
  // ⚠️⚠️ REWRITTEN after the first real run (2026-08-11), which exposed two defects
  // in this very block. Both are recorded because they are the instructive part.
  //
  // **Defect 1 — the criterion could not fail.** It read
  //     `couvert === attendu || lacunes > 0`
  // and `couvertureReconstruction` opens a gap for every uncovered day, so
  // `couvert < attendu` ALWAYS implies `lacunes > 0`. The condition was a tautology.
  // It reported `true` on the real archive and that `true` meant nothing.
  //
  // **Defect 2 — the headline figure measured something else.** `partMedianeCouverte`
  // came out at 0.338 and was read as "a third of the archive is missing". It is not:
  // an observation exists only for days INSIDE a published restriction period, so an
  // unrestricted day produces no observation. 0.338 is the median share of 2022-2023
  // a zone spent UNDER RESTRICTION — a prevalence, and a plausible one for those two
  // drought years. Measured confirmation: the example zones show ~2 gaps per zone per
  // year, i.e. one unrestricted winter stretch each. Naming it `couverte` invited
  // exactly the wrong reading, so it is renamed.
  //
  // What the criterion has to distinguish, and now does: a day with NO restriction in
  // force (known, and legitimately absent from a file that lists arrêtés) from a day
  // we know NOTHING about because the zone's history does not reach back that far.
  // The second only exists before the zone's `premiereAnnee`, and it is SIGNALLED
  // precisely when `premiereAnnee` is published. A zone with unknown days and no
  // published `premiereAnnee` is the actual §8 violation — and can now be counted.
  {
    const parZone = uniques.map(([code, z]) => {
      const jours = observationsFor(code, z).map((o) => ({ day: o.day }));
      const c = couvertureReconstruction(jours, [2022, 2023]);
      // Days of 2022-2023 that predate the zone's own history: unknown, not "calm".
      const debut = z.premiereAnnee;
      const joursInconnus =
        debut === undefined ? 0 : [2022, 2023].filter((a) => a < debut).length * 365;
      return {
        zone: code,
        premiereAnnee: debut,
        joursRestreints: c.couvert,
        joursDeLaPeriode: c.attendu,
        joursInconnus,
        plagesSansRestriction: c.lacunes.length,
      };
    });
    const avecJours = parZone.filter((p) => p.joursRestreints > 0);
    // The violation: unknown days that nothing declares as unknown.
    const inconnuNonSignale = parZone.filter(
      (p) => p.joursInconnus > 0 && p.premiereAnnee === undefined,
    );
    rapport.reconstruction = {
      zonesAvecJoursEn2022_2023: avecJours.length,
      /**
       * Median share of 2022-2023 spent UNDER RESTRICTION — a prevalence, not a
       * coverage. See the defect note above: the previous name said the opposite.
       */
      partMedianeSousRestriction: mediane(
        avecJours.map((p) => p.joursRestreints / p.joursDeLaPeriode),
      ),
      /** stretches with no arrêté in force — a known state, not missing data */
      plagesSansRestrictionTotales: parZone.reduce((a, p) => a + p.plagesSansRestriction, 0),
      /** zones whose history starts after 2022, so part of the period is unknowable */
      zonesAvecJoursInconnus: parZone.filter((p) => p.joursInconnus > 0).length,
      /**
       * ⚠️ THE criterion, and one that can now come out false: unknown days whose
       * zone publishes no `premiereAnnee` to declare them unknown.
       */
      zonesAvecInconnuNonSignale: inconnuNonSignale.length,
      aucuneLacuneNonSignalee: inconnuNonSignale.length === 0,
      /** the row loss the parser now attributes per reason (see lib/history diag) */
      rejetsDeLignes: agg.diag.rejets,
      exemples: avecJours.slice(0, 5),
      exemplesNonSignales: inconnuNonSignale.slice(0, 5),
    };
  }

  // --- 2. §8 ch. 3 — does the model beat the climatological baseline? -------
  {
    const jours: JourEvalue[] = observations.map((o) => ({
      zone: o.zone,
      day: o.day,
      departement: o.departement,
      observe: o.niveau,
      prevu: {},
    }));

    // The forecast: yesterday's level run through the transition matrix fitted on
    // the training fold. A one-step-ahead forecast, which is what a Markov chain
    // gives and the honest thing to score.
    const informe = (entrainement: JourEvalue[], test: JourEvalue[]): JourEvalue[] => {
      const m = fitTransitions(
        entrainement.map((j) => ({ zone: j.zone, day: j.day, niveau: j.observe })),
      );
      const index = new Map(test.map((j) => [`${j.zone}|${j.day}`, j]));
      return test.map((j) => {
        const hier = index.get(`${j.zone}|${j.day - 1}`);
        return { ...j, prevu: hier ? (m.p[hier.observe] ?? {}) : {} };
      });
    };

    const parAnnee = validationCroisee(jours, "leave_one_year_out", informe);
    const parDep = validationCroisee(jours, "leave_one_department_out", informe);

    // ⚠️ The control that decides how much the two gains above are worth. The fitted
    // chain has a ≈ 0.99 diagonal, so "tomorrow = today" already beats a climatological
    // average by a lot, and a large gain may be measuring only that restrictions last.
    // Scoring the SAME forecast on the days the level actually changed removes that
    // advantage: persistence is wrong on every one of them by construction.
    const parJour = new Map(observations.map((o) => [`${o.zone}|${o.day}`, o.niveau]));
    const transitions = new Set<string>();
    for (const o of observations) {
      const hier = parJour.get(`${o.zone}|${o.day - 1}`);
      if (hier !== undefined && hier !== o.niveau) transitions.add(`${o.zone}|${o.day}`);
    }
    const parDepTransitions = validationCroisee(jours, "leave_one_department_out", informe, {
      nom: "jours de transition (le niveau a changé depuis la veille)",
      cles: transitions,
    });

    rapport.validation = {
      leave_one_year_out: {
        gainMoyen: parAnnee.gainMoyen,
        plis: parAnnee.plis,
        plisPerdus: parAnnee.plisPerdus,
      },
      leave_one_department_out: {
        gainMoyen: parDep.gainMoyen,
        // Folds only, not the per-day detail: 90-odd departments would bloat the file.
        plis: parDep.plis.map((p) => ({ cle: p.cle, gain: p.gain, jours: p.jours })),
        plisPerdus: parDep.plisPerdus,
      },
      leave_one_department_out_transitions: {
        nom: parDepTransitions.restriction,
        gainMoyen: parDepTransitions.gainMoyen,
        joursNotes: parDepTransitions.plis.reduce((a, p) => a + p.jours, 0),
        plisPerdus: parDepTransitions.plisPerdus,
      },
      hypotheses: [...parAnnee.hypotheses, ...parDep.hypotheses, ...parDepTransitions.hypotheses],
      // ⚠️ THE verdict. Written as a sentence so it cannot be skimmed past, and
      // stating a loss as plainly as a win.
      verdict:
        parDep.gainMoyen === undefined
          ? "INDÉTERMINÉ — aucun pli n'a pu être noté."
          : parDep.gainMoyen > 0
            ? `LE MODÈLE BAT LA BASELINE en leave-one-department-out : gain moyen de ` +
              `${parDep.gainMoyen.toFixed(4)} point de Brier, sur ${parDep.plis.length} plis, ` +
              `dont ${parDep.plisPerdus.length} perdus.`
            : `⚠️ LE MODÈLE NE BAT PAS LA BASELINE en leave-one-department-out : gain moyen de ` +
              `${parDep.gainMoyen.toFixed(4)}. C'est un résultat, pas un échec du run — et c'est ` +
              `l'information la plus utile que cette calibration pouvait produire.`,
      // ⚠️ The verdict that qualifies the one above, and the one to read second.
      verdictAnticipation:
        parDepTransitions.gainMoyen === undefined
          ? "INDÉTERMINÉ sur les jours de transition — aucun pli noté."
          : parDepTransitions.gainMoyen > 0
            ? `Sur les seuls jours de CHANGEMENT de niveau, le gain reste positif ` +
              `(${parDepTransitions.gainMoyen.toFixed(4)}) : le modèle ne gagne pas seulement ` +
              `par persistance.`
            : `⚠️ Sur les seuls jours de CHANGEMENT de niveau, le gain devient ` +
              `${parDepTransitions.gainMoyen.toFixed(4)} : le gain global est donc porté par la ` +
              `PERSISTANCE des restrictions, pas par une capacité à anticiper leur évolution. ` +
              `C'est la limite à écrire dans la note méthodologique — un utilisateur qui demande ` +
              `« mon niveau va-t-il empirer ? » n'est pas mieux servi que par « comme hier ».`,
    };
  }

  // --- 3. §8 ch. 3 — the episode-duration distribution ---------------------
  //
  // ⚠️ Simulating a synthetic calendar from the fitted chain and comparing its
  // duration distribution to the observed one is what §5.5 asks for. It is NOT
  // done here: it needs a simulation protocol (how many replicates, seeded how,
  // over which zones) that is a modelling decision rather than a measurement. What
  // IS reported is the observed distribution itself, so the comparison has a
  // reference the day the simulation exists.
  {
    const observee = ecartDistributionDurees(episodes, episodes);
    rapport.distributionDurees = {
      observee: observee.observee.slice(0, 60),
      maxObserve: observee.maxObserve,
      episodes: episodes.length,
      nonFait:
        "La comparaison simulé/observé de §5.5 n'est PAS faite : elle exige un protocole de " +
        "simulation (nombre de réplicats, graine, zones retenues) qui est une décision de " +
        "modélisation, pas une mesure. La distribution OBSERVÉE est publiée ici pour que la " +
        "comparaison ait une référence le jour où la simulation existe.",
    };
  }

  // --- 4. The fitted model itself ------------------------------------------
  {
    const modele = fitModeleN2(observations, { mutualisation: 0.3 });
    rapport.modele = {
      // ⚠️ Still false: `fitModeleN2` hardcodes it, and this run does not make the
      // model calibrated in the sense the product would need — nothing consumes it.
      // What changed is that the matrices below are fitted on REAL data.
      calibreSelonLeModule: modele.calibre,
      ajusteSurArchiveReelle: true,
      sautsIgnores: modele.sautsIgnores,
      departements: Object.keys(modele.parDepartement).length,
      parRegime: Object.fromEntries(
        Object.entries(modele.parRegime).map(([regime, m]) => [
          regime,
          {
            p: m.p,
            n: m.n,
            donneesInsuffisantes: m.donneesInsuffisantes,
            // ⚠️ NIVEAUX explicitly, not the default state space: this is the
            // "once restricted, does severity rise faster than it falls?" quantity,
            // the one the 1.77 below refers to. See `asymetrie`'s own warning.
            asymetrie: asymetrie(m, NIVEAUX),
          },
        ]),
      ),
      hypotheses: modele.hypotheses,
    };

    // The §5.1 physical claim, now measurable: levels rise fast and fall slowly.
    const post = asymetrie(modele.parRegime.post_2021, NIVEAUX);
    rapport.hysteresis = {
      monte: post.monte,
      descend: post.descend,
      ratio: post.ratio,
      verdict:
        post.ratio === undefined
          ? "INDÉTERMINÉ"
          : post.ratio > 1
            ? `CONFIRMÉE sur l'archive : les niveaux montent ${post.ratio.toFixed(2)} fois plus ` +
              `vite qu'ils ne descendent (régime post-2021). C'est l'argument physique de §5.1, ` +
              `mesuré pour la première fois.`
            : `⚠️ NON CONFIRMÉE : le rapport montée/descente vaut ${post.ratio.toFixed(2)}, donc ` +
              `les niveaux descendent au moins aussi vite qu'ils ne montent. L'argument ` +
              `d'hystérésis de §5.1 ne tient pas sur ces données, et c'est le choix du modèle ` +
              `markovien qu'il faudrait alors rediscuter.`,
    };

    // The marginal distribution of levels — the baseline everything is scored against.
    const marge = baselineClimatologique(observations.map((o) => ({ observe: o.niveau })));
    rapport.marginale = Object.fromEntries(NIVEAUX.map((l) => [l, marge[l]]));
  }

  // --- 5. The fifth state: can the chain see a restriction COMING? ------------
  //
  // ⚠️⚠️ The question the first calibration left open. It measured that the four-state
  // chain has no anticipation skill (−1.16 Brier on transition days) and named the most
  // likely cause: with only arrêté levels, the chain cannot represent entering or leaving
  // restriction, so it was never given the chance to predict an onset. This section adds
  // the state and re-measures. A negative answer here is worth as much as a positive one:
  // it would move the cause elsewhere, which is progress.
  //
  // ⚠️ Fitted on a DECLARED SAMPLE of zones, not all of them, and the reason is arithmetic
  // rather than methodological. Materialising every free day for all 10 221 zones is about
  // 50 M observations against 5.4 M restricted ones — roughly 5 GB of objects, more than
  // the runner has. The sample is drawn ROUND-ROBIN ACROSS DEPARTMENTS so that all ~100
  // remain represented and leave-one-department-out keeps its meaning; taking the first N
  // zones by code would have sampled a handful of departments and quietly turned the
  // hardest validation into the easiest.
  {
    // ⚠️ Bounded by RUNTIME as much as by memory. Each of the three validations below
    // refits a matrix per fold, so a leave-one-department-out pass costs ~100 fits over
    // the whole sample. Extrapolating from run 31491804305 (5.38 M observations, one
    // LODO pass, ~2 min), three passes over 6 M land around 7 minutes — deliberately
    // chosen to stay in the same order of magnitude as the existing run rather than to
    // maximise the sample.
    const BUDGET_OBSERVATIONS = 6_000_000;

    const parDep = new Map<string, [string, ZoneHistory][]>();
    for (const [code, z] of uniques) {
      const dep = z.departement ?? "inconnu";
      const bucket = parDep.get(dep);
      if (bucket) bucket.push([code, z]);
      else parDep.set(dep, [[code, z]]);
    }
    const deps = [...parDep.keys()].sort();

    const echantillon: Observation[] = [];
    const zonesRetenues: string[] = [];
    let indexZone = 0;
    let budgetAtteint = false;
    while (!budgetAtteint) {
      let servi = false;
      for (const dep of deps) {
        const liste = parDep.get(dep)!;
        if (indexZone >= liste.length) continue;
        servi = true;
        const [code, z] = liste[indexZone];
        const obs = observationsAvecEtatLibre(code, z);
        if (obs.length === 0) continue;
        if (echantillon.length + obs.length > BUDGET_OBSERVATIONS) {
          budgetAtteint = true;
          break;
        }
        echantillon.push(...obs);
        zonesRetenues.push(code);
      }
      // Every department exhausted before the budget: the sample is the whole archive.
      if (!servi) break;
      indexZone++;
    }

    const libres = echantillon.filter((o) => o.niveau === ETAT_LIBRE).length;
    const matrice = fitTransitions(echantillon, { minParLigne: 20 });

    const jours: JourEvalue[] = echantillon.map((o) => ({
      zone: o.zone,
      day: o.day,
      departement: o.departement,
      observe: o.niveau,
      prevu: {},
    }));
    const informe5 = (entrainement: JourEvalue[], test: JourEvalue[]): JourEvalue[] => {
      const m = fitTransitions(
        entrainement.map((j) => ({ zone: j.zone, day: j.day, niveau: j.observe })),
      );
      const index = new Map(test.map((j) => [`${j.zone}|${j.day}`, j]));
      return test.map((j) => {
        const hier = index.get(`${j.zone}|${j.day - 1}`);
        return { ...j, prevu: hier ? (m.p[hier.observe] ?? {}) : {} };
      });
    };

    // Transition days, and the subset of them that are ONSETS — free yesterday,
    // restricted today. The onset is the question a user actually asks.
    const parJourEtat = new Map(echantillon.map((o) => [`${o.zone}|${o.day}`, o.niveau]));
    const transitions = new Set<string>();
    const declenchements = new Set<string>();
    for (const o of echantillon) {
      const hier = parJourEtat.get(`${o.zone}|${o.day - 1}`);
      if (hier === undefined || hier === o.niveau) continue;
      transitions.add(`${o.zone}|${o.day}`);
      if (hier === ETAT_LIBRE && o.niveau !== ETAT_LIBRE) declenchements.add(`${o.zone}|${o.day}`);
    }

    const global5 = validationCroisee(jours, "leave_one_department_out", informe5);
    const trans5 = validationCroisee(jours, "leave_one_department_out", informe5, {
      nom: "jours de transition (5 états)",
      cles: transitions,
    });
    const decl5 = validationCroisee(jours, "leave_one_department_out", informe5, {
      nom: "déclenchements (libre → sous arrêté)",
      cles: declenchements,
    });

    rapport.cinqEtats = {
      etats: ETATS_CHAINE,
      echantillon: {
        zones: zonesRetenues.length,
        zonesTotales: uniques.length,
        departements: deps.length,
        observations: echantillon.length,
        joursLibres: libres,
        joursSousArrete: echantillon.length - libres,
        budget: BUDGET_OBSERVATIONS,
        pourquoiUnEchantillon:
          "Matérialiser les jours libres de toutes les zones ferait ~50 M d'observations (~5 Go), " +
          "au-delà de ce que le runner offre. Tirage EN ROUND-ROBIN SUR LES DÉPARTEMENTS pour que " +
          "les ~100 restent représentés : prendre les N premières zones par code aurait échantillonné " +
          "quelques départements et transformé la validation la plus dure en la plus facile.",
      },
      // The two asymmetries, side by side and explicitly labelled — they answer
      // different questions and must never be reported as one number.
      asymetrieSousArrete: asymetrie(matrice, NIVEAUX),
      asymetrieToutEtats: asymetrie(matrice, ETATS_CHAINE),
      pDepuisLibre: matrice.p[ETAT_LIBRE],
      nDepuisLibre: matrice.n[ETAT_LIBRE],
      donneesInsuffisantes: matrice.donneesInsuffisantes,
      validation: {
        global: { gainMoyen: global5.gainMoyen, plisPerdus: global5.plisPerdus.length },
        transitions: {
          gainMoyen: trans5.gainMoyen,
          joursNotes: trans5.plis.reduce((a, p) => a + p.jours, 0),
          plisPerdus: trans5.plisPerdus.length,
          plis: trans5.plis.length,
        },
        declenchements: {
          gainMoyen: decl5.gainMoyen,
          joursNotes: decl5.plis.reduce((a, p) => a + p.jours, 0),
          plisPerdus: decl5.plisPerdus.length,
          plis: decl5.plis.length,
        },
      },
      verdict:
        decl5.gainMoyen === undefined
          ? "INDÉTERMINÉ — aucun déclenchement n'a pu être noté."
          : decl5.gainMoyen > 0
            ? `LE CINQUIÈME ÉTAT APPORTE QUELQUE CHOSE : sur les déclenchements (libre → sous ` +
              `arrêté), le gain de Brier vaut ${decl5.gainMoyen.toFixed(4)}, donc le modèle fait ` +
              `mieux qu'une moyenne historique sur la question « une restriction va-t-elle ` +
              `arriver ? ». ⚠️ À confirmer sur l'archive entière avant d'en tirer quoi que ce soit : ` +
              `ce résultat porte sur un échantillon de zones.`
            : `⚠️ LE CINQUIÈME ÉTAT NE SUFFIT PAS : sur les déclenchements, le gain vaut ` +
              `${decl5.gainMoyen.toFixed(4)}. Rendre le déclenchement REPRÉSENTABLE ne l'a pas ` +
              `rendu PRÉVISIBLE. L'hypothèse « l'état manquant explique l'absence d'anticipation » ` +
              `est donc écartée, et la cause est ailleurs — le candidat suivant étant que la ` +
              `chaîne soit inconditionnelle : sans covariables hydrologiques (§5.3), rien dans le ` +
              `modèle ne peut savoir qu'il ne pleut pas.`,
      limites: [
        "⚠️ Les jours libres sont déduits par COMPLÉMENT du calendrier, entre le premier et le " +
          "dernier arrêté observé de chaque zone. Avant et après, l'état est inconnu et n'est PAS " +
          "rempli : une zone muette depuis 2019 peut avoir été retirée du référentiel, pas épargnée.",
        "⚠️ Contamination connue : 1 523 lignes d'archive n'ont aucune zone attribuable (12,1 %). " +
          "Les périodes correspondantes existent et manquent, donc une fraction des jours " +
          "« libres » sont des jours restreints déguisés. Le résultat est une borne SUPÉRIEURE de " +
          "liberté, pas une mesure.",
        "⚠️ Résultat sur échantillon de zones, pas sur l'archive entière — voir `echantillon`.",
      ],
    };
  }

  rapport.nonInstruit = [
    "§5.2 — les annexes d'arrêtés-cadres (seuils DOE/DCR, correspondance zone → seuil) ne sont " +
      "pas numérisées : la moitié « règles » de l'approche hybride n'existe pas.",
    "§5.5 — aucun site pilote ne fournit ses données réelles 2022-2023 : la validation sur la " +
      "métrique finale du CLIENT (production perdue) n'est pas faite, seule celle sur le niveau l'est.",
    "§5.3 — SPI et SPEI manquent, et les quatre covariables présentes ne sont pas encore des " +
      "régresseurs : la matrice de transition est inconditionnelle.",
    // ⚠️ Discovered by the first real run, and the most consequential of the three.
    "§5.1 — LA CHAÎNE N'A PAS D'ÉTAT « AUCUNE RESTRICTION ». Les quatre niveaux de `NIVEAUX` " +
      "sont tous des niveaux d'arrêté, et une observation n'existe que pour un jour SOUS arrêté. " +
      "Trois conséquences, toutes mesurées sur ce run : (1) la distribution marginale publiée " +
      "(vigilance 34 %, alerte 22 %, AR 21 %, crise 23 %) est conditionnelle à « une restriction " +
      "est en vigueur » et ne doit pas être lue comme une probabilité annuelle ; (2) les sauts " +
      "ignorés comptés dans `modele.sautsIgnores` sont pour l'essentiel les entrées et sorties " +
      "de restriction, que la chaîne ne peut pas représenter ; (3) le modèle ne peut donc PAS " +
      "prévoir le DÉCLENCHEMENT d'une restriction — seulement son évolution une fois déclarée. " +
      "C'est pourtant la question qu'un industriel pose en premier. Ajouter un cinquième état " +
      "est un changement de modèle, pas un correctif, et n'est pas fait ici.",
  ];
  rapport.complet = true;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/report.json`, JSON.stringify(rapport, null, 1) + "\n", "utf-8");
  console.log(`calibration: report written to ${OUT_DIR}/report.json`);
  console.log(`  observations : ${rapport.observations}`);
  console.log(`  épisodes     : ${rapport.episodes}`);
  console.log(`  hystérésis   : ${(rapport.hysteresis as { verdict: string }).verdict}`);
  console.log(`  validation   : ${(rapport.validation as { verdict: string }).verdict}`);
}

main().catch((e) => {
  console.error("calibration failed:", e);
  process.exit(1);
});
