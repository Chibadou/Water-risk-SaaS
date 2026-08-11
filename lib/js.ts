// JS — jours sous statut (note technique §4.1).
//
// The first of the note's three outputs, and the one it is most explicit about:
// JS is a COUNT OF DAYS PER LEVEL, not a weighted scalar. The arrêtés are
// published, so these days are MEASURED, not modelled — which is why the note
// calls JS a public, opposable fact for the past.
//
// ⚠️ What this module deliberately does NOT do, and what it replaces.
//
// `lib/interruption.ts` (Sprint 21 → removed at Sprint 42b) collapsed the same
// horizons into a single number:
//
//     joursContraints = Σ_niveau  jours(niveau) × exposition(niveau) × DEPENDANCE_FACTOR
//
// Two things were wrong with it, and both are named anti-patterns of the note:
//
//   1. `DEPENDANCE_FACTOR` (0.6 / 1 / 1.4 / 1.8) was a coefficient I invented.
//      It multiplied a measured quantity by a number nobody could source, and it
//      could push a measured 30 days to 54. §4.3 asks for a declared production
//      response instead — which lib/ia.ts now implements, with a refusal when the
//      declaration is missing rather than a default.
//   2. Weighting days by exposure and then calling the product "days" mixes a
//      fact with a model in one figure that carries neither's error bar. The note
//      separates them on purpose: JS is the fact (days per level), IA is the model
//      (JEA, in lib/ia.ts).
//
// So this module keeps the horizon machinery — année type, rest of the low-water
// season, 2050 — which was the genuinely good part of interruption.ts, and hands
// the exposure weighting to lib/ia.ts where it belongs.

import { GRAVITE } from "./gravite";
import type { YearHistory } from "./history";
import type { NiveauGravite } from "./types";
import { NIVEAUX } from "./juridiction";

export type HorizonId = "annee_type" | "fin_saison" | "horizon_2050";

export type DaysByLevel = Partial<Record<NiveauGravite, number>>;

/** Evidence level of a horizon (note §0.1). */
export type NiveauPreuve = "N1" | "N2" | "N3";

export interface JsHorizon {
  id: HorizonId;
  label: string;
  available: boolean;
  /**
   * Evidence level, per §0.1 and G8. The année type is N1 — it counts published
   * arrêtés. The 2050 horizon is N3 — a scenario. `fin_saison` is N2: observed
   * climatology adjusted by live precursors.
   */
  preuve?: NiveauPreuve;
  /** days per level — the JS vector itself, never collapsed to a scalar */
  parNiveau?: DaysByLevel;
  /** total days under any arrêté, the sum of the vector above */
  joursTotal?: number;
  /** days at alerte or worse — the subset most arrêtés' hard measures attach to */
  joursAlertePlus?: number;
  /** envelope, only where the source data carries one (2050: Explore2 q05/q95) */
  lo?: number;
  hi?: number;
  /**
   * Growth of the day total relative to the année type, e.g. 1.3 for +30 %.
   * Consumed by lib/ia.ts to lengthen the OBSERVED episodes rather than scale a
   * day total — see `scaleEpisodes`.
   */
  facteurCroissance?: number;
  detail: string;
  message?: string;
}

export interface JsInput {
  /** injectable clock, so tests are deterministic */
  now?: Date;
  parAnnee?: Record<string, YearHistory>;
  parMois?: Record<string, Record<number, number>>;
  /** monthly detail split by level; preferred over `parMois` when present */
  parMoisNiveau?: Record<string, Record<number, DaysByLevel>>;
  anneesCompletes?: number;
  /** AnticipationResult.index, 0-100 — reused rather than recomputed */
  anticipationIndex?: number;
  /** Explore2 tuples [q05, q50, q95]; dtBE in days, vcn10 in % */
  projection?: {
    dtBE?: [number | null, number | null, number | null];
    vcn10?: [number | null, number | null, number | null];
  };
}

export interface JsResult {
  available: boolean;
  horizons: JsHorizon[];
  /** the année type vector, hoisted for the callers that only need that one */
  anneeType?: DaysByLevel;
  hypotheses: string[];
  /**
   * ⚠️ §4.1's own warning, carried by the result so it reaches the screen.
   * JS is the LEAST durable of the three indicators: the French nomenclature
   * already changed in 2021 and will change again before 2050. It is an
   * intermediate indicator, never a headline.
   */
  avertissement: string;
  message?: string;
}

/** Re-exported from the jurisdiction layer, which owns the ordered levels (G3). */
export const LEVELS = NIVEAUX;

// Low-water season. Drought arrêtés are overwhelmingly a May-October affair, so
// the "rest of the season" horizon closes at the end of October.
const SEASON_END_MONTH = 9; // 0-based: October

export const JS_AVERTISSEMENT =
  "Les jours sous statut décrivent la zone d'alerte dont dépend le site, pas un compteur du site. " +
  "⚠️ C'est le moins durable des trois indicateurs : la nomenclature française est passée de trois " +
  "à quatre niveaux en 2021 et changera encore d'ici 2050, ce qui rend deux décomptes de jours " +
  "séparés par une réforme incomparables. Le volume non prélevable (m³) et l'interruption " +
  "d'activité (JEA) sont en unités physiques, donc invariants au cadre réglementaire : ce sont eux " +
  "qui font un titre.";

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export function sumDays(days: DaysByLevel): number {
  return LEVELS.reduce((s, l) => s + (days[l] ?? 0), 0);
}

export function sumAlertePlus(days: DaysByLevel): number {
  return LEVELS.reduce((s, l) => s + (GRAVITE[l].rank >= 2 ? days[l] ?? 0 : 0), 0);
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
export function meanDaysPerLevel(
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
  const total = sumAlertePlus(days);
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

export function computeJs(input: JsInput): JsResult {
  const now = input.now ?? new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const anneesCompletes = input.anneesCompletes ?? 0;
  const hypotheses: string[] = [];
  const horizons: JsHorizon[] = [];

  if (!input.parAnnee || anneesCompletes <= 0) {
    return {
      available: false,
      horizons,
      hypotheses,
      avertissement: JS_AVERTISSEMENT,
      message:
        "Historique des arrêtés insuffisant (aucune année complète) pour établir une année type. " +
        "⚠️ Ce n'est pas « aucune restriction » : c'est « l'archive ne permet pas de compter ».",
    };
  }

  // --- Horizon 1: typical year, MEASURED (N1) --------------------------------
  const typical = meanDaysPerLevel(input.parAnnee, anneesCompletes, currentYear);
  const totalTypique = sumDays(typical);
  horizons.push({
    id: "annee_type",
    label: "Année type",
    available: true,
    preuve: "N1",
    parNiveau: typical,
    joursTotal: round1(totalTypique),
    joursAlertePlus: round1(sumAlertePlus(typical)),
    facteurCroissance: 1,
    detail: `Moyenne mesurée sur ${anneesCompletes} année${anneesCompletes > 1 ? "s" : ""} complète${
      anneesCompletes > 1 ? "s" : ""
    } d'arrêtés publiés — un fait, pas un modèle.`,
  });
  hypotheses.push(
    `Année type moyennée sur les ${anneesCompletes} années COMPLÈTES de la fenêtre : l'année en ` +
      "cours est exclue, l'inclure inventerait des mois calmes.",
  );

  // --- Horizon 2: rest of the current low-water season (N2) ------------------
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
      const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
      const remainingShare = (daysInMonth - now.getUTCDate() + 1) / daysInMonth;

      // Preferred path: real per-level monthly detail. Restriction severity is
      // not evenly spread through the season — crise days cluster in late
      // summer — so borrowing the annual mix for every month flattens exactly
      // the peak this horizon exists to show.
      const nivMonths = input.parMoisNiveau;
      const seasonByLevel: DaysByLevel = {};
      let alertePlus = 0;
      let usedLevelDetail = false;

      if (nivMonths) {
        for (let y = currentYear - anneesCompletes; y <= currentYear - 1; y++) {
          const months = nivMonths[String(y)];
          if (!months) continue;
          usedLevelDetail = true;
          for (let m = currentMonth; m <= SEASON_END_MONTH; m++) {
            const share = m === currentMonth ? remainingShare : 1;
            const byLevel = months[m];
            if (!byLevel) continue;
            for (const level of LEVELS) {
              const d = byLevel[level];
              if (!d) continue;
              seasonByLevel[level] = (seasonByLevel[level] ?? 0) + (d * share) / anneesCompletes;
            }
          }
        }
      }

      if (!usedLevelDetail) {
        // Fallback: alerte+ totals only, split by the annual mix.
        const perMonth: number[] = new Array(12).fill(0);
        for (let y = currentYear - anneesCompletes; y <= currentYear - 1; y++) {
          const months = parMois[String(y)];
          if (!months) continue;
          for (let m = 0; m < 12; m++) perMonth[m] += months[m] ?? 0;
        }
        for (let m = 0; m < 12; m++) perMonth[m] /= anneesCompletes;
        for (let m = currentMonth; m <= SEASON_END_MONTH; m++) {
          alertePlus += perMonth[m] * (m === currentMonth ? remainingShare : 1);
        }
        hypotheses.push(
          "Détail mensuel par niveau indisponible : la fin de saison est répartie selon le mix " +
            "annuel, ce qui APLATIT le pic de fin d'été — les jours de crise y sont sous-estimés.",
        );
      }

      // The anticipation index already blends the seasonal climatology with the
      // live precursors (groundwater IPS, low flow, Onde, current level) and the
      // year's trajectory. Consuming it here is the point: one signal, not two.
      const index = input.anticipationIndex;
      const adjustment = index === undefined ? 1 : clamp(0.7 + 0.6 * (index / 100), 0.7, 1.3);

      const projected: DaysByLevel = {};
      if (usedLevelDetail) {
        for (const level of LEVELS) {
          const d = seasonByLevel[level];
          if (d) projected[level] = d * adjustment;
        }
      } else {
        const mix = alertePlusMix(typical);
        for (const level of Object.keys(mix) as NiveauGravite[]) {
          projected[level] = alertePlus * adjustment * (mix[level] ?? 0);
        }
      }
      const total = sumDays(projected);
      horizons.push({
        id: "fin_saison",
        label: `Fin de saison (${MONTHS[currentMonth]}–${MONTHS[SEASON_END_MONTH]})`,
        available: true,
        preuve: "N2",
        parNiveau: projected,
        joursTotal: round1(total),
        joursAlertePlus: round1(sumAlertePlus(projected)),
        facteurCroissance: totalTypique > 0 ? total / totalTypique : undefined,
        detail:
          (usedLevelDetail
            ? "Climatologie mensuelle par niveau"
            : "Climatologie mensuelle (mix annuel)") +
          (index === undefined
            ? ", sans ajustement d'anticipation."
            : `, ajustée par l'indice d'anticipation (${Math.round(index)}/100).`),
      });
    }
  }

  // --- Horizon 3: 2050, extension + intensification (N3) --------------------
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
      // Envelope: least severe = shortest extension with the mildest low flow.
      const loDays = dtBE[0] ?? dtBE[1];
      const hiDays = dtBE[2] ?? dtBE[1];
      const loTotal = sumDays(scenario(loDays, vcn10?.[2]));
      const hiTotal = sumDays(scenario(hiDays, vcn10?.[0]));
      const midTotal = sumDays(mid);

      horizons.push({
        id: "horizon_2050",
        label: "Horizon 2050 (+2,7 °C)",
        available: true,
        preuve: "N3",
        parNiveau: mid,
        joursTotal: round1(midTotal),
        joursAlertePlus: round1(sumAlertePlus(mid)),
        lo: round1(Math.min(loTotal, hiTotal)),
        hi: round1(Math.max(loTotal, hiTotal)),
        facteurCroissance: totalTypique > 0 ? midTotal / totalTypique : undefined,
        detail:
          `Année type allongée de ${dtBE[1] > 0 ? "+" : ""}${Math.round(dtBE[1])} j de basses eaux` +
          (vcn10?.[1] != null ? `, étiage ${Math.round(vcn10[1])} %.` : ".") +
          " Les jours sont déplacés vers les niveaux hauts, jamais fabriqués : le total ne croît " +
          "que de l'allongement.",
      });
      hypotheses.push(
        "Horizon 2050 : scénario N3 sur le narratif +2,7 °C France d'Explore2, restitué en " +
          "fourchette q05-q95. Jamais une moyenne d'ensemble (anti-pattern n°4).",
      );
    }
  }

  return {
    available: true,
    horizons,
    anneeType: typical,
    hypotheses,
    avertissement: JS_AVERTISSEMENT,
  };
}
