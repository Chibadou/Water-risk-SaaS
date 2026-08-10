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
  /** how many equal steps a `stepwise` site loses production in */
  paliers?: number;
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
const DEFAULT_PALIERS = 4;

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
  const besoinJour = vref / DAYS_PER_YEAR;
  const exemptJour = exempt / DAYS_PER_YEAR;
  const reponse = input.reponse ?? "linear";
  const paliers = input.paliers ?? DEFAULT_PALIERS;

  // Buffer, in m³. A legacy `autonomieJours` is converted at the daily need —
  // which is what "days of autonomy" means.
  const tampon =
    input.tamponM3 ?? (input.autonomieJours !== undefined ? input.autonomieJours * besoinJour : 0);
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
    if (lastEnd !== undefined) {
      const gap = Math.max(0, ep.startDay - lastEnd);
      stock = recharge > 0 ? Math.min(tampon, stock + gap * recharge) : tampon;
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
