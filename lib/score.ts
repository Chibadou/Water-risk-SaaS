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

export const UPCOMING_COMPONENTS = [
  "Indice piézométrique standardisé (IPS)",
  "Débits vs références d'étiage (VCN10 / QMNA5)",
  "Pression des prélèvements (BNPE)",
];

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
  hydro?: { trend?: Trend; higherIsBetter?: boolean } | null;
  piezo?: { trend?: Trend; higherIsBetter?: boolean } | null;
  /** Onde: 0-100 risk from dry/no-flow sentinel streams, with a station count */
  onde?: { score: number; stations: number } | null;
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
    {
      id: "hydro",
      label: "Tendance du débit",
      weight: 12.5,
      score: inputs.hydro ? trendScore(inputs.hydro.trend, inputs.hydro.higherIsBetter) : undefined,
      detail: inputs.hydro?.trend ? undefined : "donnée indisponible",
    },
    {
      id: "piezo",
      label: "Tendance de la nappe",
      weight: 12.5,
      score: inputs.piezo ? trendScore(inputs.piezo.trend, inputs.piezo.higherIsBetter) : undefined,
      detail: inputs.piezo?.trend ? undefined : "donnée indisponible",
    },
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
