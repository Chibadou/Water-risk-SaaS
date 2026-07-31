// Who gets restricted before whom.
//
// Drought restrictions are an arbitration between users of the same resource,
// not a uniform cut. The order is set by the framework the préfets work from —
// décret n° 2021-795 du 23 juin 2021 (gestion quantitative de la ressource en
// eau et gestion des situations de crise liées à la sécheresse), the national
// arrêté-cadre guidance, and the departmental arrêtés-cadre that implement them.
//
// Static and descriptive, like lib/transition.ts: it explains the ranking the
// published measures already encode. The numbers the product shows come from
// the measures themselves (lib/restrictions.ts), never from this table.

import type { Secteur } from "./sites";

export interface ArbitrageRang {
  /** 1 = restricted first, 6 = maintained longest */
  rang: number;
  label: string;
  detail: string;
  /** sectors that sit at this rank, used to highlight the user's own position */
  secteurs: Secteur[];
}

export const ARBITRAGE: ArbitrageRang[] = [
  {
    rang: 1,
    label: "Usages d'agrément et de confort",
    detail:
      "Arrosage des espaces verts et terrains de sport, lavage de véhicules, remplissage des piscines, fontaines d'ornement, golfs. Restreints dès l'alerte, souvent interdits en alerte renforcée.",
    secteurs: ["particulier"],
  },
  {
    rang: 2,
    label: "Irrigation agricole",
    detail:
      "Réduite par paliers puis interdite, avec des tours d'eau et des dérogations pour les cultures pérennes ou le maraîchage. En zone de répartition des eaux, la gestion collective (OUGC) répartit un volume déjà plafonné.",
    secteurs: ["agriculture"],
  },
  {
    rang: 3,
    label: "Activités économiques non critiques",
    detail:
      "Industrie, tertiaire, commerces : réduction des prélèvements, puis arrêt des usages non essentiels. C'est le rang où se situent la plupart des sites professionnels.",
    secteurs: ["industrie", "services", "autre"],
  },
  {
    rang: 4,
    label: "Installations encadrées (ICPE, production d'électricité)",
    detail:
      "Soumises à leurs propres prescriptions préfectorales : les usages liés à la sécurité (refroidissement critique, lutte contre l'incendie) sont maintenus même en crise, le reste est réduit.",
    secteurs: ["energie"],
  },
  {
    rang: 5,
    label: "Abreuvement des animaux",
    detail:
      "Considéré comme un besoin vital : maintenu à tous les niveaux, y compris en crise.",
    secteurs: [],
  },
  {
    rang: 6,
    label: "Santé, salubrité, sécurité civile, eau potable",
    detail:
      "Usages prioritaires au sens du décret : maintenus jusqu'au bout. C'est la raison pour laquelle un site raccordé au réseau d'eau potable n'est pratiquement jamais coupé, même en crise.",
    secteurs: ["collectivite"],
  },
];

export const ARBITRAGE_NOTE =
  "En crise, ce sont les prélèvements non prioritaires qui cessent, pas la totalité des usages : " +
  "l'eau potable, la santé, la sécurité civile et l'abreuvement sont maintenus. C'est pourquoi " +
  "l'estimation ci-dessus compte des jours d'activité contrainte plutôt que des jours de coupure.";

export const ARBITRAGE_SOURCE =
  "Décret n° 2021-795 du 23 juin 2021 et arrêtés-cadre départementaux.";

/** The rank a sector sits at, used to highlight the user's own position. */
export function rangForSecteur(secteur: Secteur | undefined): ArbitrageRang | undefined {
  if (!secteur) return undefined;
  return ARBITRAGE.find((r) => r.secteurs.includes(secteur));
}
