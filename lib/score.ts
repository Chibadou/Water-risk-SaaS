// Composite risk score (plan §B, partial): weighted mean of the available
// components, renormalized when a component is missing. Components not yet
// implemented (IPS, VCN10/QMNA5, BNPE) are listed as upcoming so the UI can
// stay transparent about coverage.

import { GRAVITE, graviteInfo } from "./gravite";
import type { Trend } from "./hubeau";

export interface ScoreComponent {
  id: "reglementaire" | "historique" | "onde" | "hydro" | "piezo";
  label: string;
  weight: number;
  /** 0-100, present only when the component could be computed */
  score?: number;
  detail?: string;
}

export interface CompositeScore {
  /** 0-100 weighted over available components */
  score: number;
  components: ScoreComponent[];
  /** share of total weight actually covered (0-1) */
  coverage: number;
}

export const UPCOMING_COMPONENTS = ["Pression des prélèvements (BNPE)"];

export function reglementaireScore(worst?: string): number {
  const info = graviteInfo(worst);
  return info ? info.rank * 25 : 0;
}

/** days/year in "alerte" or worse (current-year total, or structural mean) → 0-100 */
export function historiqueScore(joursAlertePlus: number): number {
  if (joursAlertePlus <= 0) return 0;
  if (joursAlertePlus <= 15) return 25;
  if (joursAlertePlus <= 45) return 50;
  if (joursAlertePlus <= 90) return 75;
  return 100;
}

/** Onde: risk 0-100 from the share of nearby sentinel streams that are dry or
 *  not flowing. Provided directly by lib/onde (already 0-100). */
export function ondeScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** resource-oriented trend (already inverted for depth series) → risk 0-100 */
export function trendScore(trend: Trend | undefined, higherIsBetter: boolean | undefined): number | undefined {
  if (!trend) return undefined;
  const resourceTrend: Trend =
    higherIsBetter === false ? (trend === "hausse" ? "baisse" : trend === "baisse" ? "hausse" : "stable") : trend;
  switch (resourceTrend) {
    case "baisse":
      return 75;
    case "stable":
      return 40;
    case "hausse":
      return 15;
  }
}

export interface ScoreInputs {
  /** worst VigiEau level, undefined = no restriction; null = unknown (service down) */
  worst?: string | null;
  /** current-year days in alerte+ ; undefined = history unavailable */
  joursAlertePlus?: number;
  /** structural frequency: mean days/year in alerte+ over the complete years */
  joursAlertePlusMoyen?: number;
  /** number of complete years the structural mean covers */
  anneesCompletes?: number;
  hydro?: { trend?: Trend; higherIsBetter?: boolean; reference?: ResourceRef } | null;
  piezo?: { trend?: Trend; higherIsBetter?: boolean; reference?: ResourceRef } | null;
  /** Onde: 0-100 risk from dry/no-flow sentinel streams, with a station count */
  onde?: { score: number; stations: number } | null;
}

/** Standardized reference state (IPS / low-flow) computed in lib/hubeau. */
export interface ResourceRef {
  score: number;
  label: string;
  detail: string;
}

/** Resource component: prefer the standardized reference (IPS / VCN10-QMNA5)
 *  over the raw 14-day trend when it could be computed. */
function resourceComponent(
  id: "hydro" | "piezo",
  label: string,
  weight: number,
  input: { trend?: Trend; higherIsBetter?: boolean; reference?: ResourceRef } | null | undefined,
): ScoreComponent {
  if (input?.reference) {
    return { id, label, weight, score: Math.round(input.reference.score), detail: input.reference.detail };
  }
  const trendScoreValue = input ? trendScore(input.trend, input.higherIsBetter) : undefined;
  return {
    id,
    label: `${label} (tendance 14 j)`,
    weight,
    score: trendScoreValue,
    detail: input?.trend ? undefined : "donnée indisponible",
  };
}

export function computeScore(inputs: ScoreInputs): CompositeScore {
  // Prefer the multi-year structural frequency; fall back to the current-year
  // total when no complete year is covered.
  const useStructural =
    inputs.joursAlertePlusMoyen !== undefined && (inputs.anneesCompletes ?? 0) > 0;
  const histValue = useStructural ? inputs.joursAlertePlusMoyen : inputs.joursAlertePlus;

  const components: ScoreComponent[] = [
    {
      id: "reglementaire",
      label: "Statut réglementaire (VigiEau)",
      weight: 40,
      score: inputs.worst === null ? undefined : reglementaireScore(inputs.worst ?? undefined),
      detail:
        inputs.worst === null
          ? "statut indisponible"
          : inputs.worst
            ? GRAVITE[inputs.worst as keyof typeof GRAVITE]?.label
            : "aucune restriction",
    },
    {
      id: "historique",
      label: useStructural
        ? `Fréquence structurelle des restrictions (moyenne ${inputs.anneesCompletes} ans)`
        : "Fréquence des restrictions (année en cours)",
      weight: 25,
      score: histValue === undefined ? undefined : historiqueScore(histValue),
      detail:
        histValue === undefined
          ? "historique indisponible"
          : useStructural
            ? `${histValue} j/an en alerte ou plus (moyenne ${inputs.anneesCompletes} ans)`
            : `${histValue} j en alerte ou plus`,
    },
    {
      id: "onde",
      label: "Assecs des cours d'eau (Onde)",
      weight: 10,
      score: inputs.onde ? ondeScore(inputs.onde.score) : undefined,
      detail: inputs.onde
        ? `${inputs.onde.stations} station${inputs.onde.stations > 1 ? "s" : ""} sentinelle à proximité`
        : "pas de campagne Onde récente à proximité",
    },
    resourceComponent("hydro", "État du débit", 12.5, inputs.hydro),
    resourceComponent("piezo", "État de la nappe", 12.5, inputs.piezo),
  ];

  const available = components.filter((c) => c.score !== undefined);
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const availWeight = available.reduce((s, c) => s + c.weight, 0);
  const score =
    availWeight > 0
      ? Math.round(available.reduce((s, c) => s + c.score! * c.weight, 0) / availWeight)
      : 0;
  return { score, components, coverage: availWeight / totalWeight };
}

export function scoreColor(score: number): string {
  if (score >= 85) return GRAVITE.crise.color;
  if (score >= 60) return GRAVITE.alerte_renforcee.color;
  if (score >= 35) return GRAVITE.alerte.color;
  if (score >= 15) return GRAVITE.vigilance.color;
  return "#059669";
}

// ---------------------------------------------------------------------------
// Risk classification — named classes aligned with WRI/CDP terminology
// ---------------------------------------------------------------------------

export type RiskClass = "negligeable" | "faible" | "modere" | "eleve" | "tres_eleve" | "critique";

export interface RiskClassInfo {
  id: RiskClass;
  label: string;
  labelEn: string;
  color: string;
  badgeClass: string;
}

const RISK_CLASSES: RiskClassInfo[] = [
  { id: "negligeable", label: "Négligeable", labelEn: "Low", color: "#059669", badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  { id: "faible", label: "Faible", labelEn: "Low–Medium", color: "#fdd835", badgeClass: "bg-yellow-50 text-yellow-900 border-yellow-300" },
  { id: "modere", label: "Modéré", labelEn: "Medium–High", color: "#fb8c00", badgeClass: "bg-orange-50 text-orange-900 border-orange-300" },
  { id: "eleve", label: "Élevé", labelEn: "High", color: "#e53935", badgeClass: "bg-red-50 text-red-900 border-red-300" },
  { id: "tres_eleve", label: "Très élevé", labelEn: "Extremely High", color: "#c62828", badgeClass: "bg-red-100 text-red-950 border-red-400" },
  { id: "critique", label: "Critique", labelEn: "Critical", color: "#8e24aa", badgeClass: "bg-purple-100 text-purple-950 border-purple-300" },
];

export function riskClass(score: number): RiskClassInfo {
  if (score >= 85) return RISK_CLASSES[5];
  if (score >= 70) return RISK_CLASSES[4];
  if (score >= 50) return RISK_CLASSES[3];
  if (score >= 30) return RISK_CLASSES[2];
  if (score >= 15) return RISK_CLASSES[1];
  return RISK_CLASSES[0];
}

// ---------------------------------------------------------------------------
// Score confidence — how much to trust the overall assessment
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "haute" | "moyenne" | "faible";

export interface ScoreConfidence {
  level: ConfidenceLevel;
  label: string;
  detail: string;
  badgeClass: string;
}

export function scoreConfidence(
  coverage: number,
  stationDistanceKm?: number,
  dataRecencyDays?: number,
): ScoreConfidence {
  let points = 0;
  // Coverage: 3 points if full, 2 if >=60%, 1 if >=40%, 0 otherwise
  if (coverage >= 0.95) points += 3;
  else if (coverage >= 0.6) points += 2;
  else if (coverage >= 0.4) points += 1;

  // Station proximity: 2 if <=10km, 1 if <=20km, 0 otherwise
  if (stationDistanceKm !== undefined) {
    if (stationDistanceKm <= 10) points += 2;
    else if (stationDistanceKm <= 20) points += 1;
  }

  // Data recency: 1 if within 7 days
  if (dataRecencyDays !== undefined && dataRecencyDays <= 7) points += 1;

  const reasons: string[] = [];
  if (coverage < 0.6) reasons.push(`${Math.round(coverage * 100)} % des composantes disponibles`);
  if (stationDistanceKm !== undefined && stationDistanceKm > 20) reasons.push(`station à ${Math.round(stationDistanceKm)} km`);
  if (stationDistanceKm === undefined) reasons.push("pas de station rattachée");
  if (dataRecencyDays !== undefined && dataRecencyDays > 7) reasons.push(`données datant de ${dataRecencyDays} j`);

  if (points >= 5) return {
    level: "haute",
    label: "Confiance haute",
    detail: "Bonne couverture des composantes et station proche avec données récentes.",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
  };
  if (points >= 3) return {
    level: "moyenne",
    label: "Confiance moyenne",
    detail: reasons.length > 0 ? reasons.join(" · ") : "Couverture partielle des composantes.",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
  };
  return {
    level: "faible",
    label: "Confiance faible",
    detail: reasons.length > 0 ? reasons.join(" · ") : "Peu de composantes disponibles.",
    badgeClass: "bg-orange-50 text-orange-900 border-orange-300",
  };
}

// ---------------------------------------------------------------------------
// Seasonal risk calendar — monthly restriction pattern from history
// ---------------------------------------------------------------------------

export interface MonthlyRiskProfile {
  month: number;
  label: string;
  avgDaysRestricted: number;
  maxDaysRestricted: number;
  yearsWithRestriction: number;
  totalYears: number;
  risk: number;
}

export function computeSeasonalProfile(
  parAnnee: Record<string, { joursParNiveau: Partial<Record<string, number>>; joursAlertePlus: number }>,
  monthlyBreakdown: Record<string, Record<number, number>>,
): MonthlyRiskProfile[] {
  const monthLabels = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
  const currentYear = new Date().getUTCFullYear();
  const years = Object.keys(monthlyBreakdown).filter((y) => Number(y) < currentYear).sort();
  const totalYears = years.length;

  return monthLabels.map((label, m) => {
    const daysPerYear = years.map((y) => monthlyBreakdown[y]?.[m] ?? 0);
    const avgDays = totalYears > 0 ? daysPerYear.reduce((s, d) => s + d, 0) / totalYears : 0;
    const maxDays = daysPerYear.length > 0 ? Math.max(...daysPerYear) : 0;
    const yearsWith = daysPerYear.filter((d) => d > 0).length;
    const frequency = totalYears > 0 ? yearsWith / totalYears : 0;
    const intensity = Math.min(avgDays / 25, 1);
    const risk = Math.round(Math.min(1, frequency * 0.6 + intensity * 0.4) * 100);
    return { month: m, label, avgDaysRestricted: Math.round(avgDays * 10) / 10, maxDaysRestricted: maxDays, yearsWithRestriction: yearsWith, totalYears, risk };
  });
}
