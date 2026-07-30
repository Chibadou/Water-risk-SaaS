// Days of constrained activity for a site — the figure that makes the three
// existing blocks (arrêtés, anticipation, 2050 projection) talk to each other.
//
// The product could already say "Alerte renforcée" and "−13 % d'étiage", but not
// the one thing that drives an operational decision: how many days a year the
// activity is actually held back, and how many it will be in 2050.
//
// Method, in one line:
//
//     jours contraints = Σ_niveau  jours(niveau) × exposition(niveau)
//
// A bounded weighting, never a quotient. An earlier design used
// `probabilité × durée / priorité`, which is unbounded — 0.8 × 90 j / 0.4 gives
// 180 days of interruption inside a 90-day drought. It also *estimated* a
// probability that does not need estimating: the arrêtés are published, so the
// days are measured, not modelled.
//
// The exposure weights come from lib/restrictions.ts, which reads them from the
// measures prefectures actually wrote. They are never invented here.

import { GRAVITE } from "./gravite";
import type { YearHistory } from "./history";
import type { Dependance } from "./sites";
import type { NiveauGravite } from "./types";

export type HorizonId = "annee_type" | "fin_saison" | "horizon_2050";

export type ExposureByLevel = Partial<Record<NiveauGravite, number>>;
export type DaysByLevel = Partial<Record<NiveauGravite, number>>;

/** Where the exposure weights came from — surfaced so the figure is auditable. */
export type ExposureSource = "restrictions" | "guide" | "indisponible";

export interface Horizon {
  id: HorizonId;
  label: string;
  available: boolean;
  /** raw days under an arrêté, before any weighting — the measured quantity */
  joursSousArrete?: number;
  /** exposure-weighted days: the headline figure */
  joursContraints?: number;
  /** subset at crise level: withdrawals for non-priority uses stopped */
  joursArret?: number;
  parNiveau?: DaysByLevel;
  /** uncertainty band, only where the source data carries one (2050) */
  lo?: number;
  hi?: number;
  detail: string;
  message?: string;
}

export interface InterruptionInput {
  /** injectable clock, so tests are deterministic */
  now?: Date;
  /** gravity of the zone the site depends on (see levelForOrigin) */
  worst?: string | null;
  parAnnee?: Record<string, YearHistory>;
  parMois?: Record<string, Record<number, number>>;
  anneesCompletes?: number;
  /** blocked share per gravity level, 0-1, read from the arrêtés */
  exposure?: ExposureByLevel;
  exposureSource?: ExposureSource;
  /** how much of the activity stops when water is restricted */
  dependance?: Dependance;
  /** AnticipationResult.index, 0-100 — reused rather than recomputed */
  anticipationIndex?: number;
  /** Explore2 tuples [q05, q50, q95]; dtBE in days, vcn10 in % */
  projection?: {
    dtBE?: [number | null, number | null, number | null];
    vcn10?: [number | null, number | null, number | null];
  };
}

export interface InterruptionResult {
  available: boolean;
  horizons: Horizon[];
  exposureUsed: ExposureByLevel;
  exposureSource: ExposureSource;
  dependanceFactor: number;
  caveat: string;
  message?: string;
}

const LEVELS: NiveauGravite[] = ["vigilance", "alerte", "alerte_renforcee", "crise"];

// Low-water season. Drought arrêtés are overwhelmingly a May-October affair, so
// the "rest of the season" horizon closes at the end of October.
const SEASON_END_MONTH = 9; // 0-based: October

const DEPENDANCE_FACTOR: Record<Dependance, number> = {
  faible: 0.6,
  moyenne: 1,
  forte: 1.4,
  critique: 1.8,
};

export const INTERRUPTION_CAVEAT =
  "Ces jours décrivent la zone d'alerte dont dépend le site, pas un compteur du site. " +
  "L'exposition est lue dans les mesures des arrêtés, sans pondération par les volumes " +
  "consommés — VigiEau n'en publie aucun par usage. À lire comme un ordre de grandeur.";

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Weight a per-level day count by exposure.
 *
 * Levels whose exposure is unknown contribute nothing rather than 0 — the
 * caller is told through `covered` so it can flag a partial reading instead of
 * quietly understating the figure.
 */
function weigh(
  days: DaysByLevel,
  exposure: ExposureByLevel,
  factor: number,
): { jours: number; arret: number; covered: boolean } {
  let jours = 0;
  let arret = 0;
  let covered = true;
  for (const level of LEVELS) {
    const d = days[level] ?? 0;
    if (d <= 0) continue;
    const e = exposure[level];
    if (e === undefined) {
      covered = false;
      continue;
    }
    const weighted = d * clamp(e * factor, 0, 1);
    jours += weighted;
    if (level === "crise") arret += weighted;
  }
  return { jours, arret, covered };
}

/**
 * Mean days per gravity level over the complete years of the history window.
 *
 * `parAnnee` also holds the partial current year, and the denominator is bounded
 * by the first year the source file actually covers, so the set to average is
 * exactly [currentYear − anneesCompletes, currentYear − 1] — not every key
 * present in `parAnnee`. Averaging the keys would blend a half-finished year
 * into a per-year mean.
 */
function meanDaysPerLevel(
  parAnnee: Record<string, YearHistory>,
  anneesCompletes: number,
  currentYear: number,
): DaysByLevel {
  const out: DaysByLevel = {};
  if (anneesCompletes <= 0) return out;
  for (let y = currentYear - anneesCompletes; y <= currentYear - 1; y++) {
    const year = parAnnee[String(y)];
    for (const level of LEVELS) {
      out[level] = (out[level] ?? 0) + (year?.joursParNiveau?.[level] ?? 0);
    }
  }
  for (const level of LEVELS) {
    if (out[level] !== undefined) out[level] = out[level]! / anneesCompletes;
  }
  return out;
}

/** Share of each level among days at alerte or worse, used to split a day total. */
function alertePlusMix(days: DaysByLevel): DaysByLevel {
  const mix: DaysByLevel = {};
  let total = 0;
  for (const level of LEVELS) {
    if (GRAVITE[level].rank < 2) continue;
    total += days[level] ?? 0;
  }
  if (total <= 0) return mix;
  for (const level of LEVELS) {
    if (GRAVITE[level].rank < 2) continue;
    mix[level] = (days[level] ?? 0) / total;
  }
  return mix;
}

/**
 * Shift part of the day mix one level up.
 *
 * Deeper low flows do not only lengthen restrictions, they deepen them: the same
 * number of days is spent at a worse level. Applied top-down so a day promoted
 * into `crise` is not promoted again, and the day total is conserved — the
 * projection must never manufacture days.
 */
function intensify(days: DaysByLevel, share: number): DaysByLevel {
  const out: DaysByLevel = { ...days };
  if (share <= 0) return out;
  for (let i = LEVELS.length - 1; i > 0; i--) {
    const from = LEVELS[i - 1];
    const to = LEVELS[i];
    const moved = (out[from] ?? 0) * share;
    if (moved <= 0) continue;
    out[from] = (out[from] ?? 0) - moved;
    out[to] = (out[to] ?? 0) + moved;
  }
  return out;
}

function sumDays(days: DaysByLevel): number {
  return LEVELS.reduce((s, l) => s + (days[l] ?? 0), 0);
}

/** Days added by a longer low-water season, spread over the alerte+ mix. */
function extend(days: DaysByLevel, extraDays: number): DaysByLevel {
  const out: DaysByLevel = { ...days };
  if (extraDays === 0) return out;
  const mix = alertePlusMix(days);
  const keys = Object.keys(mix) as NiveauGravite[];
  if (keys.length === 0) return out;
  for (const level of keys) {
    const delta = extraDays * (mix[level] ?? 0);
    out[level] = Math.max(0, (out[level] ?? 0) + delta);
  }
  return out;
}

export function computeInterruption(input: InterruptionInput): InterruptionResult {
  const now = input.now ?? new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  const exposure = input.exposure ?? {};
  const exposureSource = input.exposureSource ?? "indisponible";
  const factor = DEPENDANCE_FACTOR[input.dependance ?? "moyenne"];
  const anneesCompletes = input.anneesCompletes ?? 0;

  const horizons: Horizon[] = [];
  const hasExposure = LEVELS.some((l) => exposure[l] !== undefined);

  if (!input.parAnnee || anneesCompletes <= 0 || !hasExposure) {
    return {
      available: false,
      horizons,
      exposureUsed: exposure,
      exposureSource,
      dependanceFactor: factor,
      caveat: INTERRUPTION_CAVEAT,
      message: !hasExposure
        ? "Restrictions par usage indisponibles pour cette zone — impossible de convertir les jours d'arrêté en jours contraints."
        : "Historique des arrêtés insuffisant (aucune année complète) pour établir une année type.",
    };
  }

  // --- Horizon 1: typical year, measured -----------------------------------
  const typical = meanDaysPerLevel(input.parAnnee, anneesCompletes, currentYear);
  const typicalW = weigh(typical, exposure, factor);
  horizons.push({
    id: "annee_type",
    label: "Année type",
    available: true,
    joursSousArrete: Math.round(sumDays(typical)),
    joursContraints: round1(typicalW.jours),
    joursArret: round1(typicalW.arret),
    parNiveau: typical,
    detail: `Moyenne mesurée sur ${anneesCompletes} année${anneesCompletes > 1 ? "s" : ""} complète${
      anneesCompletes > 1 ? "s" : ""
    } d'arrêtés.`,
    message: typicalW.covered ? undefined : "Lecture partielle : certains niveaux n'ont pas de restriction publiée.",
  });

  // --- Horizon 2: rest of the current low-water season ----------------------
  {
    const parMois = input.parMois;
    if (!parMois || currentMonth > SEASON_END_MONTH) {
      horizons.push({
        id: "fin_saison",
        label: "Fin de saison",
        available: false,
        detail:
          currentMonth > SEASON_END_MONTH
            ? "Saison d'étiage terminée — les restrictions reprennent au printemps."
            : "Répartition mensuelle indisponible.",
      });
    } else {
      // Mean days at alerte+ per month over the complete years.
      const perMonth: number[] = new Array(12).fill(0);
      for (let y = currentYear - anneesCompletes; y <= currentYear - 1; y++) {
        const months = parMois[String(y)];
        if (!months) continue;
        for (let m = 0; m < 12; m++) perMonth[m] += months[m] ?? 0;
      }
      for (let m = 0; m < 12; m++) perMonth[m] /= anneesCompletes;

      const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
      const remainingShare = (daysInMonth - now.getUTCDate() + 1) / daysInMonth;

      let alertePlus = 0;
      for (let m = currentMonth; m <= SEASON_END_MONTH; m++) {
        alertePlus += perMonth[m] * (m === currentMonth ? remainingShare : 1);
      }

      // The anticipation index already blends the seasonal climatology with the
      // live precursors (groundwater IPS, low flow, Onde, current level) and the
      // year's trajectory. Consuming it here is the point: one signal, not two.
      const index = input.anticipationIndex;
      const adjustment = index === undefined ? 1 : clamp(0.7 + 0.6 * (index / 100), 0.7, 1.3);

      // parMois is aggregated at alerte+ only, so the level split is taken from
      // the annual mix. Restriction days are overwhelmingly summer days, which
      // is precisely the period this horizon covers, so the annual mix is a
      // close stand-in for the seasonal one.
      const mix = alertePlusMix(typical);
      const projected: DaysByLevel = {};
      for (const level of Object.keys(mix) as NiveauGravite[]) {
        projected[level] = alertePlus * adjustment * (mix[level] ?? 0);
      }
      const w = weigh(projected, exposure, factor);
      const label = `Fin de saison (${MONTHS[currentMonth]}–${MONTHS[SEASON_END_MONTH]})`;
      horizons.push({
        id: "fin_saison",
        label,
        available: true,
        joursSousArrete: Math.round(sumDays(projected)),
        joursContraints: round1(w.jours),
        joursArret: round1(w.arret),
        parNiveau: projected,
        detail:
          index === undefined
            ? "Climatologie mensuelle, sans ajustement d'anticipation."
            : `Climatologie mensuelle ajustée par l'indice d'anticipation (${Math.round(index)}/100).`,
      });
    }
  }

  // --- Horizon 3: 2050, extension + intensification -------------------------
  {
    const proj = input.projection;
    const dtBE = proj?.dtBE;
    const vcn10 = proj?.vcn10;
    if (!dtBE || dtBE[1] === null || dtBE[1] === undefined) {
      horizons.push({
        id: "horizon_2050",
        label: "Horizon 2050",
        available: false,
        detail: "Projection Explore2 indisponible pour cette commune.",
      });
    } else {
      // Two physical effects, both from data already embedded in the repo:
      // dtBE_yr lengthens the low-water period (in days), VCN10 deepens it.
      const scenario = (extraDays: number, vcn: number | null | undefined): DaysByLevel => {
        const extended = extend(typical, extraDays);
        const share = vcn === null || vcn === undefined ? 0 : clamp(-vcn / 40, 0, 1) * 0.5;
        return intensify(extended, share);
      };

      const mid = scenario(dtBE[1], vcn10?.[1]);
      const midW = weigh(mid, exposure, factor);

      // Envelope: least severe = shortest extension with the mildest low flow.
      const loDays = dtBE[0] ?? dtBE[1];
      const hiDays = dtBE[2] ?? dtBE[1];
      const loW = weigh(scenario(loDays, vcn10?.[2]), exposure, factor);
      const hiW = weigh(scenario(hiDays, vcn10?.[0]), exposure, factor);

      horizons.push({
        id: "horizon_2050",
        label: "Horizon 2050 (+2,7 °C)",
        available: true,
        joursSousArrete: Math.round(sumDays(mid)),
        joursContraints: round1(midW.jours),
        joursArret: round1(midW.arret),
        parNiveau: mid,
        lo: round1(Math.min(loW.jours, hiW.jours)),
        hi: round1(Math.max(loW.jours, hiW.jours)),
        detail:
          `Année type allongée de ${dtBE[1] > 0 ? "+" : ""}${Math.round(dtBE[1])} j de basses eaux` +
          (vcn10?.[1] != null ? `, étiage ${Math.round(vcn10[1])} %.` : "."),
      });
    }
  }

  return {
    available: true,
    horizons,
    exposureUsed: exposure,
    exposureSource,
    dependanceFactor: factor,
    caveat: INTERRUPTION_CAVEAT,
  };
}
