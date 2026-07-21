import type { Secteur } from "./sites";
import type { NiveauGravite, Profil } from "./types";

export interface SecteurInfo {
  id: Secteur;
  label: string;
  icon: string;
  /** true = domestic/individual use, outside the professional-site focus */
  domestic?: boolean;
}

// Professional sectors first; "particulier" (domestic use) last and flagged —
// HydroVigie targets professional site risk, so the individual case is a
// secondary option. It still works exactly like the others (it maps to the
// VigiEau "particulier" profil and has its own impact descriptions).
export const SECTEURS: SecteurInfo[] = [
  { id: "agriculture", label: "Agriculture", icon: "🌾" },
  { id: "industrie", label: "Industrie", icon: "🏭" },
  { id: "energie", label: "Énergie", icon: "⚡" },
  { id: "services", label: "Services / Tertiaire", icon: "🏢" },
  { id: "collectivite", label: "Collectivité", icon: "🏛️" },
  { id: "autre", label: "Autre", icon: "📍" },
  { id: "particulier", label: "Particulier (usage domestique)", icon: "🏠", domestic: true },
];

export const DEFAULT_SECTEUR: Secteur = "autre";

export function secteurInfo(id: Secteur | undefined): SecteurInfo | undefined {
  return id ? SECTEURS.find((s) => s.id === id) : undefined;
}

// A site's sector maps to a VigiEau "usager" profile — the taxonomy VigiEau
// uses to select which official restrictions apply. Industry, energy and
// services all query as "entreprise" (VigiEau has no finer split); the sector
// only refines the *interpretation* (SectorImpactPanel), never the score.
const SECTEUR_TO_PROFIL: Record<Secteur, Profil> = {
  agriculture: "exploitation",
  industrie: "entreprise",
  energie: "entreprise",
  services: "entreprise",
  collectivite: "collectivite",
  autre: "entreprise",
  particulier: "particulier",
};

export function profilForSecteur(secteur: Secteur): Profil {
  return SECTEUR_TO_PROFIL[secteur];
}

// Reverse (lossy) inference for backward compatibility: legacy sites and deep
// links carry only a VigiEau profil. Map it back to the closest sector so the
// merged UI can pre-select something sensible.
const PROFIL_TO_SECTEUR: Record<Profil, Secteur> = {
  exploitation: "agriculture",
  collectivite: "collectivite",
  entreprise: "autre",
  particulier: "particulier",
};

export function secteurForProfil(profil: Profil | undefined): Secteur {
  return profil ? PROFIL_TO_SECTEUR[profil] ?? DEFAULT_SECTEUR : DEFAULT_SECTEUR;
}

interface SectorImpact {
  short: string;
  detail: string;
}

const SECTOR_IMPACTS: Record<Secteur, Record<NiveauGravite, SectorImpact>> = {
  agriculture: {
    vigilance: {
      short: "Économies d'eau recommandées",
      detail: "Sensibilisation — pas de contrainte sur l'irrigation. Optimiser les horaires d'arrosage.",
    },
    alerte: {
      short: "Irrigation réduite",
      detail: "Réduction des volumes prélevés pour l'irrigation (jusqu'à 50 %). Interdiction d'arrosage aux heures chaudes.",
    },
    alerte_renforcee: {
      short: "Irrigation très limitée",
      detail: "Forte réduction voire interdiction de l'irrigation selon les cultures. Seules les cultures pérennes et le maraîchage peuvent être exemptés.",
    },
    crise: {
      short: "Irrigation interdite",
      detail: "Arrêt total de l'irrigation, sauf dérogation préfectorale pour cultures de survie ou abreuvement du bétail.",
    },
  },
  industrie: {
    vigilance: {
      short: "Optimisation encouragée",
      detail: "Pas de restriction obligatoire. Mise en place recommandée de circuits de recyclage.",
    },
    alerte: {
      short: "Prélèvements réduits",
      detail: "Réduction des prélèvements industriels. Interdiction possible du lavage de véhicules / équipements non essentiels.",
    },
    alerte_renforcee: {
      short: "Plan de continuité requis",
      detail: "Forte réduction des prélèvements. Activation des plans de continuité — report de production ou passage en circuit fermé.",
    },
    crise: {
      short: "Arrêt des prélèvements",
      detail: "Arrêt total des prélèvements non prioritaires. Seuls les usages ICPE liés à la sécurité (refroidissement critique, anti-incendie) sont maintenus.",
    },
  },
  energie: {
    vigilance: {
      short: "Surveillance accrue",
      detail: "Pas de contrainte. Surveillance des débits des cours d'eau utilisés pour le refroidissement.",
    },
    alerte: {
      short: "Refroidissement contraint",
      detail: "Restrictions sur les volumes de prélèvement pour le refroidissement. Possibilité de réduction de puissance pour les centrales thermiques.",
    },
    alerte_renforcee: {
      short: "Réduction de puissance",
      detail: "Forte réduction des prélèvements de refroidissement. Risque de baisse de production significative pour les centrales thermiques et nucléaires.",
    },
    crise: {
      short: "Déconnexion possible",
      detail: "Arrêt des prélèvements non prioritaires. Risque de mise à l'arrêt de tranches de production si la température de rejet dépasse les normes.",
    },
  },
  services: {
    vigilance: {
      short: "Gestes d'économie",
      detail: "Pas de restriction. Affichage recommandé de consignes d'économie d'eau dans les locaux.",
    },
    alerte: {
      short: "Restrictions mineures",
      detail: "Interdiction d'arroser les espaces verts aux heures chaudes. Limitation du lavage des façades et véhicules de service.",
    },
    alerte_renforcee: {
      short: "Usages non essentiels interdits",
      detail: "Interdiction de l'arrosage des espaces verts, lavage des véhicules, fontaines décoratives. Impact limité sur les activités tertiaires courantes.",
    },
    crise: {
      short: "Usages prioritaires seuls",
      detail: "Seuls les usages d'hygiène et de sécurité sont maintenus. Impact faible sur le tertiaire hors restauration / hôtellerie.",
    },
  },
  collectivite: {
    vigilance: {
      short: "Communication préventive",
      detail: "Campagne de sensibilisation aux économies d'eau auprès des administrés. Surveillance du réseau AEP.",
    },
    alerte: {
      short: "Restrictions communales",
      detail: "Interdiction d'arroser les espaces verts et terrains de sport aux heures chaudes. Fermeture possible des fontaines publiques.",
    },
    alerte_renforcee: {
      short: "Plan sécheresse activé",
      detail: "Arrêt de l'arrosage des espaces verts, nettoyage des voiries réduit. Dérogation maintenue pour l'eau potable et la lutte incendie.",
    },
    crise: {
      short: "Situation d'urgence",
      detail: "Seuls les usages prioritaires (eau potable, santé, sécurité) sont maintenus. Possibilité de ravitaillement par citerne en cas de déficit AEP.",
    },
  },
  autre: {
    vigilance: {
      short: "Économies recommandées",
      detail: "Pas de restriction obligatoire, sensibilisation générale aux économies d'eau.",
    },
    alerte: {
      short: "Premières restrictions",
      detail: "Réduction des prélèvements, interdiction de certains usages non essentiels (arrosage, lavage, remplissage de piscines).",
    },
    alerte_renforcee: {
      short: "Restrictions renforcées",
      detail: "Forte réduction des prélèvements, interdiction des usages non essentiels.",
    },
    crise: {
      short: "Usages prioritaires seuls",
      detail: "Arrêt de tous les prélèvements non prioritaires (santé, sécurité, eau potable).",
    },
  },
  particulier: {
    vigilance: {
      short: "Économies volontaires",
      detail: "Pas de restriction obligatoire. Gestes recommandés : réparer les fuites, limiter l'arrosage et les usages de confort.",
    },
    alerte: {
      short: "Usages extérieurs limités",
      detail: "Arrosage des pelouses et jardins interdit aux heures chaudes, lavage des véhicules et remplissage des piscines privées restreints.",
    },
    alerte_renforcee: {
      short: "Usages extérieurs interdits",
      detail: "Arrosage interdit (potagers parfois tolérés en soirée), lavage des véhicules et remplissage des piscines privées interdits.",
    },
    crise: {
      short: "Usages domestiques prioritaires seuls",
      detail: "Tous les usages extérieurs sont interdits ; seuls les usages sanitaires (boisson, hygiène, sécurité) sont maintenus.",
    },
  },
};

export function sectorImpact(
  secteur: Secteur | undefined,
  niveau: NiveauGravite | undefined,
): SectorImpact | undefined {
  if (!secteur || !niveau) return undefined;
  return SECTOR_IMPACTS[secteur]?.[niveau];
}
