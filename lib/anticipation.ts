// Restriction anticipation index (client-safe, pure, no I/O). Fills the missing
// *middle* time horizon of the tool: between "now" (live VigiEau status) and
// "2050" (Explore2 climate projection) sits the coming weeks-to-end-of-season,
// which is exactly the horizon a business needs to anticipate an upcoming (or
// worsening) water restriction.
//
// What this predicts — and what it does NOT. We do not predict the
// administrative act itself: a prefectural decree depends on the department's
// arrêté-cadre thresholds AND a measure of prefectoral discretion, and weather
// beyond ~2 weeks is not skilfully predictable. We produce a transparent,
// explainable index of the *conditions conducive* to a restriction over the
// next ~4-8 weeks — framed like the 2050 block: trends, not forecasts.
//
// Method (transparent, two-part):
//   - Seasonal base rate (climatology) — the ANCHOR: how restricted this zone
//     historically is during the upcoming months (peak of the horizon window).
//     Off-season it gates the index low regardless of the physical state, since
//     drought decrees are administratively seasonal.
//   - Current-state pressure — leading physical signals that degrade BEFORE
//     regulatory escalation: groundwater IPS (weighted highest — slowest, most
//     predictive; SOU decrees are threshold-driven on piezometry), low-flow
//     VCN10/QMNA5, Onde dry-stream mix, plus the current regulatory level
//     (persistence of an existing restriction). Each physical signal is nudged
//     by its 14-day trend. This half only counts when the season is "open".
// A year-to-date trajectory factor (this year vs the seasonal norm so far)
// modulates the result up or down. Everything is surfaced as explicit drivers.

import type { Trend } from "./hubeau";
import { computeSeasonalProfile, reglementaireScore, trendScore } from "./score";
import { graviteInfo } from "./gravite";
import type { YearHistory } from "./history";

// Horizon: the current month plus the next two (a ~2-month look-ahead). The
// index anchors on the *peak* monthly risk over this window.
const HORIZON_MONTHS_AHEAD = 2;

const MONTH_NAMES = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

// Weights of the current-state signals (relative to each other). Groundwater
// carries the most weight — it is the slowest and most predictive signal.
const STATE_WEIGHTS = {
  nappe: 30,
  debit: 15,
  onde: 10,
  reglementaire: 20,
} as const;
const STATE_WEIGHT_TOTAL = Object.values(STATE_WEIGHTS).reduce((s, w) => s + w, 0); // 75

// Blend: half the index is the climatological anchor, half is the current
// state — but the state half only counts scaled by how "open" the season is.
const SEASON_SHARE = 0.5;
const STATE_SHARE = 0.5;
// Season is fully "open" once the seasonal base rate reaches this risk.
const OPENNESS_FULL_AT = 40;

/** How a resource's 14-day trend shifts a stress score (falling water = up). */
const TREND_BUMP = 10;

export type AnticipationLevel = "peu_probable" | "possible" | "probable" | "tres_probable";

export interface AnticipationLevelInfo {
  id: AnticipationLevel;
  /** 1-4, for a discrete gauge */
  rank: number;
  label: string;
  color: string;
  badgeClass: string;
}

const LEVELS: AnticipationLevelInfo[] = [
  { id: "peu_probable", rank: 1, label: "Peu probable", color: "#059669", badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  { id: "possible", rank: 2, label: "Possible", color: "#f59e0b", badgeClass: "bg-amber-50 text-amber-900 border-amber-300" },
  { id: "probable", rank: 3, label: "Probable", color: "#ea580c", badgeClass: "bg-orange-50 text-orange-900 border-orange-300" },
  { id: "tres_probable", rank: 4, label: "Très probable", color: "#dc2626", badgeClass: "bg-red-50 text-red-900 border-red-300" },
];

export function anticipationLevel(score: number): AnticipationLevelInfo {
  if (score >= 70) return LEVELS[3];
  if (score >= 45) return LEVELS[2];
  if (score >= 20) return LEVELS[1];
  return LEVELS[0];
}

export const ANTICIPATION_CAVEAT =
  "Cet indice estime les conditions propices à une restriction dans les prochaines " +
  "semaines à partir de l'historique saisonnier et de l'état actuel de la ressource. Ce " +
  "n'est pas une prévision de l'arrêté préfectoral (qui dépend des seuils de l'arrêté-cadre " +
  "départemental et de la décision du préfet) ni une prévision météorologique : seul " +
  "l'arrêté en vigueur fait foi.";

/** A physical/regulatory leading signal on the resource. */
export interface SignalInput {
  /** 0-100 stress score (high = low / stressed vs the record), e.g. IPS or low-flow */
  score?: number;
  trend?: Trend;
  /** true when a rising value means more available water (false for depth series) */
  higherIsBetter?: boolean;
}

export interface AnticipationInput {
  /** injectable clock for deterministic tests */
  now?: Date;
  /** worst current VigiEau level; undefined = no restriction; null = unknown */
  worst?: string | null;
  /** number of complete years of history, for confidence */
  anneesCompletes?: number;
  /** per-year, per-month alerte+ day counts (seasonal base + trajectory) */
  parMois?: Record<string, Record<number, number>>;
  /** per-year breakdown (passed through to computeSeasonalProfile) */
  parAnnee?: Record<string, YearHistory>;
  /** groundwater leading signal (IPS + 14-day trend) — weighted highest */
  nappe?: SignalInput | null;
  /** streamflow leading signal (VCN10/QMNA5 + 14-day trend) */
  debit?: SignalInput | null;
  /** Onde dry-stream risk 0-100 near the site */
  onde?: { score?: number } | null;
  /** distance of the nearest attached station, for confidence */
  stationDistanceKm?: number;
}

export type DriverDirection = "up" | "down" | "neutral";

export interface AnticipationDriver {
  label: string;
  /** 0-100 signal value, when the driver is a scored component */
  score?: number;
  /** weight share (%) of this signal within the current-state pressure */
  weightPct?: number;
  detail: string;
  direction: DriverDirection;
}

export type AnticipationConfidence = "haute" | "moyenne" | "faible";

export interface AnticipationResult {
  available: boolean;
  level: AnticipationLevelInfo;
  /** 0-100 continuous index behind the level, for a gauge */
  index: number;
  /** e.g. "juillet à septembre" */
  horizonLabel: string;
  /** true when the site is already under restriction (wording shifts to worsening) */
  alreadyRestricted: boolean;
  drivers: AnticipationDriver[];
  confidence: AnticipationConfidence;
  confidenceDetail: string;
  /** share of the index actually backed by data (0-1) */
  coverage: number;
  caveat: string;
  message?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Direction of the *resource* trend (falling availability), depth-inverted. */
function resourceTrend(trend: Trend | undefined, higherIsBetter: boolean | undefined): Trend | undefined {
  if (!trend) return undefined;
  return higherIsBetter === false
    ? trend === "hausse" ? "baisse" : trend === "baisse" ? "hausse" : "stable"
    : trend;
}

/** A leading signal's 0-100 contribution: reference stress nudged by its trend,
 *  falling back to the raw trend score when no reference is available. */
function signalScore(input: SignalInput | null | undefined): { score?: number; dir: Trend | undefined } {
  if (!input) return { score: undefined, dir: undefined };
  const dir = resourceTrend(input.trend, input.higherIsBetter);
  if (input.score !== undefined) {
    let s = input.score;
    if (dir === "baisse") s += TREND_BUMP;
    else if (dir === "hausse") s -= TREND_BUMP;
    return { score: clamp(Math.round(s), 0, 100), dir };
  }
  return { score: trendScore(input.trend, input.higherIsBetter), dir };
}

function trendPhrase(dir: Trend | undefined): string {
  if (dir === "baisse") return "en baisse sur 14 j";
  if (dir === "hausse") return "en hausse sur 14 j";
  if (dir === "stable") return "stable sur 14 j";
  return "";
}

function horizonLabel(months: number[]): string {
  const first = MONTH_NAMES[months[0]];
  const last = MONTH_NAMES[months[months.length - 1]];
  return first === last ? first : `${first} à ${last}`;
}

export function computeAnticipation(input: AnticipationInput): AnticipationResult {
  const now = input.now ?? new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  // Horizon months (wrapping past December): current + next HORIZON_MONTHS_AHEAD.
  const horizonMonths: number[] = [];
  for (let i = 0; i <= HORIZON_MONTHS_AHEAD; i++) horizonMonths.push((currentMonth + i) % 12);
  const label = horizonLabel(horizonMonths);

  const drivers: AnticipationDriver[] = [];

  // ---- Seasonal base rate (the anchor) ----
  const parMois = input.parMois ?? {};
  const completeYears = Object.keys(parMois).filter((y) => Number(y) < currentYear);
  let seasonalBase: number | undefined;
  if (completeYears.length > 0) {
    const profile = computeSeasonalProfile(input.parAnnee ?? {}, parMois, currentYear);
    seasonalBase = Math.max(0, ...horizonMonths.map((m) => profile[m]?.risk ?? 0));
    drivers.push({
      label: "Base saisonnière (historique)",
      score: seasonalBase,
      detail: `risque le plus élevé sur ${label}, d'après ${completeYears.length} année${completeYears.length > 1 ? "s" : ""} complète${completeYears.length > 1 ? "s" : ""} — ancre l'indice`,
      direction: "neutral",
    });
  }

  // ---- Current-state pressure (physical + regulatory) ----
  const stateComps: { key: keyof typeof STATE_WEIGHTS; score: number }[] = [];

  const nappe = signalScore(input.nappe);
  if (nappe.score !== undefined) {
    stateComps.push({ key: "nappe", score: nappe.score });
    drivers.push({
      label: "État de la nappe",
      score: nappe.score,
      detail: nappe.dir ? `niveau standardisé (IPS), ${trendPhrase(nappe.dir)}` : "niveau standardisé (IPS)",
      direction: nappe.dir === "baisse" ? "up" : nappe.dir === "hausse" ? "down" : "neutral",
    });
  }

  const debit = signalScore(input.debit);
  if (debit.score !== undefined) {
    stateComps.push({ key: "debit", score: debit.score });
    drivers.push({
      label: "État du débit",
      score: debit.score,
      detail: debit.dir ? `étiage de référence (VCN10/QMNA5), ${trendPhrase(debit.dir)}` : "étiage de référence (VCN10/QMNA5)",
      direction: debit.dir === "baisse" ? "up" : debit.dir === "hausse" ? "down" : "neutral",
    });
  }

  if (input.onde && input.onde.score !== undefined) {
    const s = clamp(Math.round(input.onde.score), 0, 100);
    stateComps.push({ key: "onde", score: s });
    drivers.push({
      label: "Assecs des cours d'eau (Onde)",
      score: s,
      detail: "réseau sentinelle à proximité",
      direction: "neutral",
    });
  }

  const grav = input.worst === null ? undefined : graviteInfo(input.worst ?? undefined);
  const rank = grav?.rank ?? 0;
  const alreadyRestricted = rank >= 2;
  if (input.worst !== null) {
    const s = reglementaireScore(input.worst ?? undefined);
    stateComps.push({ key: "reglementaire", score: s });
    drivers.push({
      label: "Statut réglementaire actuel",
      score: s,
      detail: grav ? `en ${grav.label.toLowerCase()}` : "aucune restriction en vigueur",
      direction: rank >= 2 ? "up" : "neutral",
    });
  }

  const availStateWeight = stateComps.reduce((s, c) => s + STATE_WEIGHTS[c.key], 0);
  const stateScore =
    availStateWeight > 0
      ? stateComps.reduce((s, c) => s + c.score * STATE_WEIGHTS[c.key], 0) / availStateWeight
      : undefined;

  // Annotate state drivers with their share of the current-state pressure.
  for (const d of drivers) {
    const comp = stateComps.find((c) => driverKeyLabel(c.key) === d.label);
    if (comp) d.weightPct = Math.round((STATE_WEIGHTS[comp.key] / availStateWeight) * 100);
  }

  // ---- Combine (seasonal-gated) ----
  const hasSeason = seasonalBase !== undefined;
  const hasState = stateScore !== undefined;

  if (!hasSeason && !hasState) {
    return {
      available: false,
      level: LEVELS[0],
      index: 0,
      horizonLabel: label,
      alreadyRestricted,
      drivers: [],
      confidence: "faible",
      confidenceDetail: "Aucune donnée exploitable pour l'anticipation.",
      coverage: 0,
      caveat: ANTICIPATION_CAVEAT,
      message: "Données insuffisantes pour estimer l'anticipation.",
    };
  }

  let core: number;
  let coverage: number;
  if (hasSeason && hasState) {
    // The state pressure only lifts the index when the season is open.
    const openness = clamp(seasonalBase! / OPENNESS_FULL_AT, 0, 1);
    core = seasonalBase! * SEASON_SHARE + stateScore! * STATE_SHARE * openness;
    coverage = SEASON_SHARE + STATE_SHARE * (availStateWeight / STATE_WEIGHT_TOTAL);
  } else if (hasSeason) {
    core = seasonalBase!; // pure climatology
    coverage = SEASON_SHARE;
  } else {
    // No seasonal history: fall back to raw current-state pressure (ungated).
    core = stateScore!;
    coverage = STATE_SHARE * (availStateWeight / STATE_WEIGHT_TOTAL);
  }

  // ---- Year-to-date trajectory factor ----
  const traj = trajectoryFactor(parMois, currentYear, currentMonth);
  let index = clamp(Math.round(core * traj.factor), 0, 100);
  if (traj.driver) drivers.push(traj.driver);

  // Floor: an existing restriction is very likely to persist/worsen near-term.
  if (rank >= 4) index = Math.max(index, 75);
  else if (rank >= 2) index = Math.max(index, 55);

  const conf = confidence(coverage, input.stationDistanceKm, input.anneesCompletes);

  return {
    available: true,
    level: anticipationLevel(index),
    index,
    horizonLabel: label,
    alreadyRestricted,
    drivers,
    confidence: conf.level,
    confidenceDetail: conf.detail,
    coverage,
    caveat: ANTICIPATION_CAVEAT,
  };
}

/** Match a state component back to its driver label (kept in one place). */
function driverKeyLabel(key: keyof typeof STATE_WEIGHTS): string {
  switch (key) {
    case "nappe": return "État de la nappe";
    case "debit": return "État du débit";
    case "onde": return "Assecs des cours d'eau (Onde)";
    case "reglementaire": return "Statut réglementaire actuel";
  }
}

/** Compares this year's cumulative alerte+ days (Jan→current month) with the
 *  mean of the same period over complete years, into a [0.85, 1.20] factor. */
function trajectoryFactor(
  parMois: Record<string, Record<number, number>>,
  currentYear: number,
  currentMonth: number,
): { factor: number; driver?: AnticipationDriver } {
  const sumToDate = (byMonth: Record<number, number> | undefined) => {
    if (!byMonth) return 0;
    let s = 0;
    for (let m = 0; m <= currentMonth; m++) s += byMonth[m] ?? 0;
    return s;
  };

  const pastYears = Object.keys(parMois).filter((y) => Number(y) < currentYear);
  if (pastYears.length === 0) return { factor: 1 };

  const normals = pastYears.map((y) => sumToDate(parMois[y]));
  const normalToDate = normals.reduce((s, v) => s + v, 0) / normals.length;
  const currentToDate = sumToDate(parMois[String(currentYear)]);

  // No meaningful baseline and nothing yet this year → not enough signal.
  if (normalToDate < 1 && currentToDate === 0) return { factor: 1 };

  const ratio = normalToDate > 0 ? currentToDate / normalToDate : currentToDate > 0 ? 2 : 0;

  // Piecewise: ratio 0.5→0.85, 1.0→1.00, 1.5+→1.20.
  let factor: number;
  if (ratio >= 1.5) factor = 1.2;
  else if (ratio >= 1) factor = 1 + (ratio - 1) * 0.4;
  else if (ratio >= 0.5) factor = 0.85 + (ratio - 0.5) * 0.3;
  else factor = 0.85;

  const label = ratio >= 1.25 ? "en avance sur la normale" : ratio <= 0.75 ? "en retard sur la normale" : "conforme à la normale";
  const direction: DriverDirection = ratio >= 1.25 ? "up" : ratio <= 0.75 ? "down" : "neutral";

  return {
    factor,
    driver: {
      label: `Trajectoire ${currentYear}`,
      detail: `${Math.round(currentToDate)} j en alerte+ à ce stade vs ${Math.round(normalToDate)} j en moyenne — ${label}`,
      direction,
    },
  };
}

/** Confidence from data coverage, station proximity and years of history. */
function confidence(
  coverage: number,
  stationDistanceKm: number | undefined,
  anneesCompletes: number | undefined,
): { level: AnticipationConfidence; detail: string } {
  let points = 0;
  if (coverage >= 0.8) points += 3;
  else if (coverage >= 0.55) points += 2;
  else if (coverage >= 0.35) points += 1;

  if (stationDistanceKm !== undefined) {
    if (stationDistanceKm <= 10) points += 2;
    else if (stationDistanceKm <= 20) points += 1;
  }

  if (anneesCompletes !== undefined) {
    if (anneesCompletes >= 3) points += 2;
    else if (anneesCompletes >= 1) points += 1;
  }

  const reasons: string[] = [];
  if (coverage < 0.55) reasons.push(`${Math.round(coverage * 100)} % de l'indice couvert par des données`);
  if (stationDistanceKm === undefined) reasons.push("pas de station rattachée");
  else if (stationDistanceKm > 20) reasons.push(`station à ${Math.round(stationDistanceKm)} km`);
  if (anneesCompletes !== undefined && anneesCompletes < 2) reasons.push(`historique de ${anneesCompletes} an${anneesCompletes > 1 ? "s" : ""}`);
  else if (anneesCompletes === undefined) reasons.push("historique saisonnier incomplet");

  if (points >= 5) return { level: "haute", detail: "Bonne couverture des composantes, station proche et historique suffisant." };
  if (points >= 3) return { level: "moyenne", detail: reasons.length > 0 ? reasons.join(" · ") : "Couverture partielle des composantes." };
  return { level: "faible", detail: reasons.length > 0 ? reasons.join(" · ") : "Peu de composantes disponibles." };
}
