// Interruption d'activité — note technique §4.3, in jours-équivalents d'arrêt.
//
//     A_t         = V_ref − VNP_t + prélèvement_tampon(t)
//     production_t = f(A_t, response_type, min_technical_threshold)
//     JEA          = Σ_t (1 − production_t / production_nominale)
//
// ---------------------------------------------------------------------------
// This generalises code that already existed — it does not invent it
// ---------------------------------------------------------------------------
//
// `lib/portefeuille.ts:375-398` already walks the real run-length calendar and
// computes `max(0, length − autonomieJours)` per episode. That IS the convexity
// §4.3 demands, and it is tested. Three things were missing, and this module
// adds exactly those:
//
//   1. It only ever ran for the PORTFOLIO. A single site's headline figure was
//      an annual total with no episode structure at all.
//   2. It had ONE response shape — the equivalent of `linear` with a buffer
//      threshold. `threshold` and `stepwise` did not exist.
//   3. Its output was net stoppage days, which presumes binary production.
//
// ---------------------------------------------------------------------------
// Why the episode structure is the whole point
// ---------------------------------------------------------------------------
//
// §4.3: as soon as a buffer exists, the loss is CONVEX in episode duration. Two
// sites with 40 restriction days a year and a 3-day tank:
//
//   forty 1-day episodes  → the tank absorbs every one → 0 days lost
//   two 20-day episodes   → 2 × (20 − 3)               → 34 days lost
//
// An annual total cannot tell them apart. A model that predicts 40 days
// correctly but gets the episode structure wrong "donnera une perte proche de
// zéro là où elle est maximale".

import { GRAVITE } from "./gravite";
import type { ResponseType } from "./sites";
import type { NiveauGravite } from "./types";

export type ExposureIntervalByLevel = Partial<
  Record<NiveauGravite, { min: number; max: number }>
>;

/** One contiguous run of restriction, decoded from `ZoneHistory.periodes`. */
export interface Episode {
  /** day index, as stored in the RLE calendar (see lib/history HISTORY_DAY_MS) */
  startDay: number;
  lengthDays: number;
  /** severity rank of the run, 1-4 */
  rank: number;
}

const RANK_TO_LEVEL: Record<number, NiveauGravite> = {
  1: "vigilance",
  2: "alerte",
  3: "alerte_renforcee",
  4: "crise",
};

/**
 * Decode the flat RLE triplets `[dayIndex, lengthDays, rank, …]`.
 *
 * The parser already builds a day→rank map per zone and throws it away after
 * bucketing, so this is data recovered rather than recomputed — the reason the
 * calendar was kept at Sprint 26 in the first place.
 */
export function episodesFromPeriodes(periodes: number[] | undefined): Episode[] {
  const out: Episode[] = [];
  if (!periodes) return out;
  for (let i = 0; i + 2 < periodes.length; i += 3) {
    const lengthDays = periodes[i + 1];
    const rank = periodes[i + 2];
    if (lengthDays > 0 && rank > 0) {
      out.push({ startDay: periodes[i], lengthDays, rank });
    }
  }
  return out;
}

export interface IaInput {
  episodes: Episode[];
  /** blocked share per level, as an interval — from lib/restrictions */
  exposure: ExposureIntervalByLevel;
  /** annual reference volume, m³ — the site's normal need */
  vrefM3?: number;
  /** exempt volume, m³/an: still available during a restriction (§4.2b) */
  exemptM3?: number;
  /** share returned to the same body, 0-1 (§4.2c) */
  tauxRestitution?: number;
  /** how production responds to a shortfall (§4.3) */
  reponse?: ResponseType;
  /** storage the site can draw on, m³ */
  tamponM3?: number;
  /** legacy buffer, expressed in days of activity — converted when tamponM3 is absent */
  autonomieJours?: number;
  /**
   * Buffer refill rate, m³/day, applied between episodes.
   *
   * ⚠️ Omitting it does NOT mean "never refills". A tank refills once water is
   * available again, so the default is a FULL refill between episodes — which is
   * also exactly what `portefeuille.ts` has always assumed with its
   * `max(0, length − autonomieJours)` per episode. Declare a rate to model a
   * slower refill, which matters when episodes come close together.
   *
   * The first version of this module treated the buffer as a stock spent once
   * for the site's lifetime. A test caught it immediately: forty one-day
   * episodes then cost exactly as much as two twenty-day ones, which destroys
   * the convexity the module exists to express.
   */
  rechargeM3ParJour?: number;
  /** daily volume below which the site stops entirely, m³ */
  seuilTechniqueM3?: number;
  /** number of years the episodes span, so the result is per year */
  anneesCouvertes?: number;
  /**
   * How many equal steps a `stepwise` site loses production in.
   *
   * ⚠️ No default (G17). See the refusal in `computeIa`.
   */
  paliers?: number;
  /**
   * Twelve monthly shares of the annual volume, January first (G19).
   *
   * Omit it and the daily need is flat — the assumption both engines made
   * silently, now journalled. Restrictions fall in summer, so a flat need
   * UNDERSTATES a summer-peaking site.
   */
  profilMensuel?: number[];
}

export interface DureeBucket {
  /** episode length in days */
  duree: number;
  nombre: number;
}

export interface IaResult {
  available: boolean;
  /** jours-équivalents d'arrêt per year, lower bound */
  jeaMin: number;
  /** … and upper bound, wider whenever a measure was unquantified */
  jeaMax: number;
  /** episodes actually used (those whose level had a readable measure) */
  episodesRetenus: number;
  /** episodes dropped because their level had no readable measure */
  episodesEcartes: number;
  /** longest consecutive run of restriction, days — the statistic §4.3 asks for */
  maxJoursConsecutifs: number;
  /** observed distribution of episode durations, for the §5.5 comparison */
  distribution: DureeBucket[];
  reponse: ResponseType;
  hypotheses: string[];
  message?: string;
}

const DAYS_PER_YEAR = 365;
const DAYS_PER_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Daily need on a given calendar day, m³.
 *
 * Flat unless a monthly split is declared. With one, the month's share is spread
 * over that month's days — so an August peak makes August days cost more, which
 * is exactly when restrictions bite.
 */
function besoinDuJour(
  vrefAnnuel: number,
  dayIndex: number,
  profilMensuel: number[] | undefined,
): number {
  if (!profilMensuel || profilMensuel.length !== 12) return vrefAnnuel / DAYS_PER_YEAR;
  const month = new Date(dayIndex * 86400_000).getUTCMonth();
  const share = profilMensuel[month];
  if (!Number.isFinite(share) || share < 0) return vrefAnnuel / DAYS_PER_YEAR;
  return (vrefAnnuel * share) / DAYS_PER_MONTH[month];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Production kept, 0-1, given the volume available on a day.
 *
 * `besoin` is the site's normal daily volume; `dispo` what it can actually get.
 */
function production(
  dispo: number,
  besoin: number,
  reponse: ResponseType,
  seuilTechnique: number | undefined,
  paliers: number,
): number {
  if (besoin <= 0) return 1;
  const ratio = Math.min(1, Math.max(0, dispo / besoin));

  // Below the technical threshold the installation stops, whatever its response
  // shape: this is the floor, not a fourth response type.
  if (seuilTechnique !== undefined && dispo < seuilTechnique) return 0;

  switch (reponse) {
    case "threshold":
      // A semiconductor fab runs or it does not; it does not run at 60 % of its
      // ultra-pure water. Without a declared threshold, any shortfall stops it.
      return ratio >= 1 ? 1 : 0;
    case "stepwise": {
      // A multi-line plant loses lines in steps: production falls to the step
      // below, never in between.
      const step = Math.floor(ratio * paliers) / paliers;
      return Math.min(1, step);
    }
    case "linear":
    default:
      return ratio;
  }
}

/** JEA for one bound of the ρ interval. */
function jeaForBound(input: IaInput, bound: "min" | "max"): {
  jea: number;
  retenus: number;
  ecartes: number;
} {
  const vref = input.vrefM3 ?? 0;
  const exempt = input.exemptM3 ?? 0;
  const restitution =
    input.tauxRestitution !== undefined && Number.isFinite(input.tauxRestitution)
      ? Math.min(1, Math.max(0, input.tauxRestitution))
      : 0;

  // The daily need, and the part of it a restriction cannot touch.
  const reponse = input.reponse ?? "linear";
  const paliers = input.paliers ?? 0;
  // Reference daily need, used for the buffer conversion. The per-day need
  // inside an episode may differ when a monthly split is declared.
  const besoinMoyen = vref / DAYS_PER_YEAR;

  // Buffer, in m³. A legacy `autonomieJours` is converted at the daily need —
  // which is what "days of autonomy" means.
  const tampon =
    input.tamponM3 ?? (input.autonomieJours !== undefined ? input.autonomieJours * besoinMoyen : 0);
  const recharge = input.rechargeM3ParJour ?? 0;

  const sorted = [...input.episodes].sort((a, b) => a.startDay - b.startDay);
  let stock = tampon;
  let lastEnd: number | undefined;
  let jea = 0;
  let retenus = 0;
  let ecartes = 0;

  for (const ep of sorted) {
    // Refill between episodes. With no declared rate the tank is full again by
    // the next episode — the physical default, and the assumption
    // portefeuille.ts already made. With a rate, it refills gradually, so
    // closely spaced episodes find it partly empty.
    //
    // ⚠️ A gap of ZERO refills nothing, whatever the rate. Two runs that touch
    // are one continuous restriction — an alerte hardening into crise on the
    // next day — and the tank has had no water to refill from. This was a real
    // defect, found at Sprint 42b when the portfolio switched from its own
    // episode decoder (which MERGED adjacent runs) to episodesFromPeriodes
    // (which does not): the unconditional refill turned a 20-day continuous
    // restriction into two 10-day ones, and a 3-day buffer absorbed 3 days
    // TWICE. Measured on the escalating fixture: 14 JEA instead of 17.
    if (lastEnd !== undefined) {
      const gap = Math.max(0, ep.startDay - lastEnd);
      if (gap > 0) stock = recharge > 0 ? Math.min(tampon, stock + gap * recharge) : tampon;
    }
    lastEnd = ep.startDay + ep.lengthDays;

    const level = RANK_TO_LEVEL[ep.rank];
    const e = level ? input.exposure[level] : undefined;
    if (!e) {
      // A level with no readable measure contributes NOTHING, not zero loss.
      ecartes++;
      continue;
    }
    retenus++;
    const rho = e[bound];

    for (let d = 0; d < ep.lengthDays; d++) {
      const besoinJour = besoinDuJour(vref, ep.startDay + d, input.profilMensuel);
      const exemptJour = besoinDuJour(exempt, ep.startDay + d, input.profilMensuel);
      // Volume the restriction leaves, before touching the buffer. The exempt
      // volume is always available, and what is returned to the same body is
      // not really consumed — so the restriction bites on the rest.
      const contraint = besoinJour * rho * (1 - restitution);
      let dispo = besoinJour - contraint;
      if (dispo < exemptJour) dispo = exemptJour;

      // Draw on the buffer to close the gap, while it lasts. This is where the
      // convexity comes from: the first days of an episode are absorbed, the
      // later ones are not.
      const manque = Math.max(0, besoinJour - dispo);
      if (manque > 0 && stock > 0) {
        const tire = Math.min(stock, manque);
        stock -= tire;
        dispo += tire;
      }

      const prod = production(dispo, besoinJour, reponse, input.seuilTechniqueM3, paliers);
      jea += 1 - prod;
    }
  }

  return { jea, retenus, ecartes };
}

/**
 * Interruption d'activité, in JEA per year, as an interval.
 *
 * Returns `available: false` with a stated reason rather than 0 when an input is
 * missing. Zero JEA means "nothing stops"; no JEA means "we cannot say".
 */
export function computeIa(input: IaInput): IaResult {
  const reponse = input.reponse ?? "linear";
  const hypotheses: string[] = [];

  const distribution = durationDistribution(input.episodes);
  const maxJoursConsecutifs = input.episodes.reduce((m, e) => Math.max(m, e.lengthDays), 0);

  if (!input.vrefM3 || input.vrefM3 <= 0) {
    return {
      available: false,
      jeaMin: 0,
      jeaMax: 0,
      episodesRetenus: 0,
      episodesEcartes: 0,
      maxJoursConsecutifs,
      distribution,
      reponse,
      hypotheses,
      message:
        "Volume de référence non déclaré — l'interruption d'activité ne peut pas être convertie " +
        "en jours-équivalents d'arrêt.",
    };
  }
  // G17 — `stepwise` without declared steps is refused, not computed on an
  // invented number. The first version defaulted to 4, which happened to make
  // stepwise and linear agree at 50 % of volume: a coincidence of my own choice
  // masquerading as a result.
  if (reponse === "stepwise" && (!input.paliers || input.paliers < 2)) {
    return {
      available: false,
      jeaMin: 0,
      jeaMax: 0,
      episodesRetenus: 0,
      episodesEcartes: 0,
      maxJoursConsecutifs,
      distribution,
      reponse,
      hypotheses,
      message:
        "Réponse « par paliers » choisie sans nombre de paliers déclaré — l'interruption n'est pas " +
        "calculée. Le nombre de lignes ou de tranches d'arrêt est propre au site : l'outil ne le " +
        "devine pas.",
    };
  }

  // G18 — `threshold` is the most punitive shape in the model: it can double the
  // JEA at equal volume. Making it rest on an implicit default is the worst
  // place in the engine to be approximate.
  if (reponse === "threshold" && input.seuilTechniqueM3 === undefined) {
    return {
      available: false,
      jeaMin: 0,
      jeaMax: 0,
      episodesRetenus: 0,
      episodesEcartes: 0,
      maxJoursConsecutifs,
      distribution,
      reponse,
      hypotheses,
      message:
        "Réponse « tout ou rien » choisie sans seuil technique déclaré — l'interruption n'est pas " +
        "calculée. Sans ce seuil, l'outil devrait supposer qu'un manque de 1 % arrête l'installation, " +
        "ce qui doublerait les jours perdus à volume égal.",
    };
  }

  if (input.episodes.length === 0) {
    return {
      available: false,
      jeaMin: 0,
      jeaMax: 0,
      episodesRetenus: 0,
      episodesEcartes: 0,
      maxJoursConsecutifs: 0,
      distribution,
      reponse,
      hypotheses,
      message: "Aucun épisode de restriction dans l'historique — rien à calculer.",
    };
  }

  if (input.reponse === undefined) {
    hypotheses.push(
      "Fonction de réponse non déclarée : `linear` appliquée par défaut (la production suit le " +
        "volume). Un site qui s'arrête net — `threshold` — perdrait davantage à volume égal.",
    );
  }
  if (input.tamponM3 === undefined && input.autonomieJours === undefined) {
    hypotheses.push(
      "Aucune réserve déclarée : chaque jour de restriction mord immédiatement. Une réserve, " +
        "même de trois jours, absorbe les épisodes courts et change fortement le résultat.",
    );
  }
  if (input.autonomieJours !== undefined && input.tamponM3 === undefined) {
    hypotheses.push(
      `Réserve convertie depuis ${input.autonomieJours} jours d'autonomie au besoin journalier ` +
        "moyen — approximation, le besoin réel n'est pas constant sur l'année.",
    );
  }
  if (!input.profilMensuel || input.profilMensuel.length !== 12) {
    hypotheses.push(
      "Aucun profil mensuel de consommation déclaré : le besoin est supposé PLAT sur l'année " +
        "(V_ref / 365). Or les restrictions tombent en été, quand beaucoup de procédés consomment " +
        "davantage — les jours perdus sont donc probablement SOUS-ESTIMÉS pour un site à pic estival.",
    );
  }
  if (input.rechargeM3ParJour === undefined && (input.tamponM3 ?? input.autonomieJours)) {
    hypotheses.push(
      "Aucun taux de recharge déclaré : la réserve est supposée pleine à chaque nouvel épisode. " +
        "C'est l'hypothèse physique par défaut — une cuve se remplit dès que la restriction cesse — " +
        "et déclarer un débit de recharge la rendrait moins favorable sur des épisodes rapprochés.",
    );
  }

  const lo = jeaForBound(input, "min");
  const hi = jeaForBound(input, "max");
  const annees = input.anneesCouvertes && input.anneesCouvertes > 0 ? input.anneesCouvertes : 1;

  if (lo.ecartes > 0) {
    hypotheses.push(
      `${lo.ecartes} épisode${lo.ecartes > 1 ? "s" : ""} écarté${lo.ecartes > 1 ? "s" : ""} : ` +
        "aucune mesure lisible pour leur niveau. Ils ne comptent pas 0 JEA, ils ne comptent pas.",
    );
  }

  return {
    available: lo.retenus > 0,
    jeaMin: round1(lo.jea / annees),
    jeaMax: round1(hi.jea / annees),
    episodesRetenus: lo.retenus,
    episodesEcartes: lo.ecartes,
    maxJoursConsecutifs,
    distribution,
    reponse,
    hypotheses,
    message:
      lo.retenus === 0
        ? "Aucun épisode dont le niveau porte une mesure lisible — impossible de convertir en JEA."
        : undefined,
  };
}

/**
 * Observed distribution of episode durations.
 *
 * §5.5 makes this a validation criterion in its own right: a model must
 * reproduce the observed distribution, not just the annual count. Exposing it
 * here is what makes that comparison possible later.
 */
export function durationDistribution(episodes: Episode[]): DureeBucket[] {
  const counts = new Map<number, number>();
  for (const e of episodes) counts.set(e.lengthDays, (counts.get(e.lengthDays) ?? 0) + 1);
  return [...counts.entries()]
    .map(([duree, nombre]) => ({ duree, nombre }))
    .sort((a, b) => a.duree - b.duree);
}

/** Severity ranks, so callers need not reach into lib/gravite. */
export const IA_RANKS = Object.entries(RANK_TO_LEVEL).map(([rank, id]) => ({
  rank: Number(rank),
  id,
  label: GRAVITE[id].label,
}));

/**
 * Project the OBSERVED episode structure onto a horizon by lengthening each
 * episode, then re-run the IA on the result.
 *
 * ⚠️ This is the whole reason the function exists, and the reason it does not
 * simply scale a day total. A horizon that adds 30 % more restriction days can
 * mean two very different things:
 *
 *   - 30 % MORE episodes of the same length — a site with a buffer barely feels it;
 *   - the SAME episodes, each 30 % longer — the buffer is overrun in every one.
 *
 * With a storage buffer the second costs several times the first (§4.3's
 * convexity). A projection that multiplies the annual day count picks neither and
 * silently produces the first, which is the optimistic one.
 *
 * The physical argument for lengthening rather than multiplying: Explore2's
 * `dtBE_yr` is a lengthening of the LOW-WATER PERIOD in days. A longer low-water
 * period stretches the episodes inside it; it does not scatter new independent
 * ones through the winter. So the projection lengthens.
 *
 * Ranks are promoted alongside, using the same day-conserving `intensify` logic
 * as lib/js.ts: `rankShift` is the share of each episode's days that moves one
 * level up. Passing 0 lengthens without deepening.
 */
export function scaleEpisodes(
  episodes: Episode[],
  facteurCroissance: number,
  rankShift = 0,
): Episode[] {
  if (!Number.isFinite(facteurCroissance) || facteurCroissance <= 0) return episodes;
  return episodes.map((e) => {
    // Round up: an episode never gets shorter under a lengthening scenario, and
    // rounding to nearest would erase a +10 % on a 4-day episode entirely.
    const lengthDays = Math.max(e.lengthDays, Math.ceil(e.lengthDays * facteurCroissance));
    const promote = rankShift > 0 && e.rank < 4 && rankShift >= 0.5;
    return { ...e, lengthDays, rank: promote ? e.rank + 1 : e.rank };
  });
}

export interface IaHorizonInput extends Omit<IaInput, "episodes"> {
  /** the OBSERVED episodes — never a synthetic calendar */
  episodesObserves: Episode[];
  /** from JsHorizon.facteurCroissance */
  facteurCroissance?: number;
  /** share of days promoted one level up, 0-1 */
  rankShift?: number;
}

/**
 * IA for a projected horizon. Returns the same shape as `computeIa`, with the
 * lengthening declared in the assumption journal so the figure never reads as
 * observed.
 */
export function computeIaHorizon(input: IaHorizonInput): IaResult {
  const facteur = input.facteurCroissance ?? 1;
  const rankShift = input.rankShift ?? 0;
  const rest: IaInput = { ...input, episodes: [] };
  // The three horizon-only fields must not reach computeIa, which would ignore
  // them silently — and a field silently ignored is how a projection quietly
  // stops projecting.
  delete (rest as Partial<IaHorizonInput>).episodesObserves;
  delete (rest as Partial<IaHorizonInput>).facteurCroissance;
  delete (rest as Partial<IaHorizonInput>).rankShift;
  const episodesObserves = input.episodesObserves;
  const episodes =
    facteur === 1 ? episodesObserves : scaleEpisodes(episodesObserves, facteur, rankShift);
  const result = computeIa({ ...rest, episodes });
  if (facteur !== 1) {
    result.hypotheses.push(
      `Horizon projeté : les ${episodesObserves.length} épisodes OBSERVÉS ont été allongés de ` +
        `${Math.round((facteur - 1) * 100)} % chacun, et non multipliés en nombre. ⚠️ Ce choix n'est ` +
        "pas neutre : à jours égaux, allonger coûte plusieurs fois plus cher que multiplier dès " +
        "qu'une réserve existe. Multiplier aurait produit le chiffre optimiste sans le dire.",
    );
  }
  return result;
}
