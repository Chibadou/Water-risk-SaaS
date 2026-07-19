// Composite risk score v1 (plan §B, partial): weighted mean of the available
// components, renormalized when a component is missing. Components not yet
// implemented (IPS, VCN10/QMNA5, Onde, BNPE, projection 2050) are listed as
// upcoming so the UI can stay transparent about coverage.

import { GRAVITE, graviteInfo } from "./gravite";
import type { Trend } from "./hubeau";

export interface ScoreComponent {
  id: "reglementaire" | "historique" | "hydro" | "piezo";
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
  "Assecs observés (Onde)",
  "Pression des prélèvements (BNPE)",
  "Projection 2050 (Explore2 / DRIAS-Eau)",
];

export function reglementaireScore(worst?: string): number {
  const info = graviteInfo(worst);
  return info ? info.rank * 25 : 0;
}

/** days in "alerte" or worse over the covered period → 0-100 */
export function historiqueScore(joursAlertePlus: number): number {
  if (joursAlertePlus <= 0) return 0;
  if (joursAlertePlus <= 15) return 25;
  if (joursAlertePlus <= 45) return 50;
  if (joursAlertePlus <= 90) return 75;
  return 100;
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
  /** days in alerte+ ; undefined = history unavailable */
  joursAlertePlus?: number;
  hydro?: { trend?: Trend; higherIsBetter?: boolean } | null;
  piezo?: { trend?: Trend; higherIsBetter?: boolean } | null;
}

export function computeScore(inputs: ScoreInputs): CompositeScore {
  const components: ScoreComponent[] = [
    {
      id: "reglementaire",
      label: "Statut réglementaire (VigiEau)",
      weight: 45,
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
      label: "Fréquence des restrictions (année en cours)",
      weight: 25,
      score: inputs.joursAlertePlus === undefined ? undefined : historiqueScore(inputs.joursAlertePlus),
      detail:
        inputs.joursAlertePlus === undefined
          ? "historique indisponible"
          : `${inputs.joursAlertePlus} j en alerte ou plus`,
    },
    {
      id: "hydro",
      label: "Tendance du débit",
      weight: 15,
      score: inputs.hydro ? trendScore(inputs.hydro.trend, inputs.hydro.higherIsBetter) : undefined,
      detail: inputs.hydro?.trend ? undefined : "donnée indisponible",
    },
    {
      id: "piezo",
      label: "Tendance de la nappe",
      weight: 15,
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
