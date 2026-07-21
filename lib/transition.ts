// Transition-risk context (client-safe, no fs). Complements the physical-risk
// signals with the regulatory/policy trajectory a site faces — the "transition
// risk" half of TCFD/CSRD that the rest of the tool did not cover.
//
// Two pieces:
//   - ZRE status (Zone de Répartition des Eaux): a real regulatory water-stress
//     designation. Membership is data-backed (data/refdata/zre-communes.json,
//     fetched via Actions) and resolved server-side in /api/transition.
//   - Plan Eau 2023 + sector trajectory: national policy context (static).

import type { Secteur } from "./sites";

export interface TransitionPayload {
  available: boolean;
  citycode?: string;
  /** whether the commune sits in a Zone de Répartition des Eaux */
  zre?: boolean;
  message?: string;
}

/** What being in a ZRE means, in plain terms (regulatory consequence). */
export const ZRE_EXPLAINER =
  "Une Zone de Répartition des Eaux (ZRE) est une désignation réglementaire des secteurs " +
  "où les prélèvements dépassent structurellement la ressource disponible. Les seuils " +
  "d'autorisation et de déclaration des prélèvements y sont abaissés (régime plus strict), " +
  "et tout nouveau prélèvement est fortement encadré, souvent via une gestion volumétrique " +
  "collective (OUGC). C'est un signal de tension quantitative durable et de risque " +
  "réglementaire accru pour les usages consommateurs d'eau.";

/** Plan Eau 2023 — national policy trajectory (transition context). */
export const PLAN_EAU = {
  title: "Plan Eau 2023",
  summary:
    "Le Plan d'action pour une gestion résiliente et concertée de l'eau (2023) fixe une " +
    "trajectoire nationale de sobriété : −10 % d'eau prélevée d'ici 2030, généralisation de " +
    "la réutilisation des eaux usées traitées, réduction des fuites des réseaux et " +
    "tarification progressive encouragée.",
  measures: [
    "Objectif −10 % de prélèvements d'ici 2030 (tous usages)",
    "Réutilisation des eaux usées traitées (REUT) généralisée",
    "Tarification progressive de l'eau encouragée",
    "Réduction des fuites des réseaux d'eau potable",
  ],
};

/** Sector-specific transition trajectory (what the policy direction implies). */
const SECTOR_TRANSITION: Record<Secteur, string> = {
  agriculture:
    "Encadrement renforcé de l'irrigation (gestion volumétrique, OUGC), retenues de " +
    "substitution sous conditions, incitation à l'adaptation des cultures et des assolements.",
  industrie:
    "Trajectoire de sobriété hydrique : boucles fermées, réutilisation des eaux, réduction " +
    "de 10 % des prélèvements. Les process consommateurs en zone tendue sont les plus exposés.",
  energie:
    "Pression réglementaire croissante sur les prélèvements de refroidissement ; adaptation " +
    "du parc et des débits réservés, risque de contraintes de production en étiage.",
  services:
    "Sobriété des usages tertiaires, réutilisation pour les espaces verts, tarification " +
    "progressive. Exposition modérée hors activités très consommatrices.",
  collectivite:
    "Réduction des fuites des réseaux, tarification progressive, REUT pour l'arrosage et le " +
    "nettoyage. Rôle central dans l'atteinte de l'objectif national de sobriété.",
  autre:
    "Trajectoire générale de sobriété (−10 % d'ici 2030), réutilisation et tarification " +
    "progressive selon l'usage.",
  particulier:
    "Tarification progressive de l'eau, incitations aux économies domestiques et à la " +
    "récupération d'eau de pluie.",
};

export function sectorTransition(secteur: Secteur | undefined): string {
  return SECTOR_TRANSITION[secteur ?? "autre"];
}
