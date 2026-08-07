// The single registry of the methodology page's sections.
//
// The page is 26 sections long, and every panel in the product linked to
// `/methodologie` — full stop. From "Disponibilité en eau — horizon 2050" the
// reader landed at the top of a very long page whose matching section is the
// 24th. On a product whose selling point IS traceability, that was the most
// disappointing link in it, and the cheapest to repair.
//
// One registry, two consumers:
//   - app/methodologie/page.tsx renders its headings and its table of contents
//     FROM this list, so a section cannot exist without an id;
//   - every panel links `methodologieHref("...")`, which is typed, so a renamed
//     section breaks the build rather than producing a dead anchor.
//
// `scripts/test/methodologie.test.ts` closes the loop: it fails if the page
// declares a section the registry does not know, or the reverse.

export interface MethodoSection {
  /** URL fragment. Stable: it is what external links and reports point at. */
  id: string;
  /** Heading as displayed. */
  titre: string;
}

export const METHODO_SECTIONS = [
  { id: "signaux", titre: "Deux signaux complémentaires" },
  { id: "sources", titre: "Sources de données" },
  { id: "choix-station", titre: "Comment la station de mesure est choisie" },
  { id: "tendance", titre: "Tendance affichée" },
  { id: "classification", titre: "Classification du risque" },
  { id: "score", titre: "Score de risque courant" },
  { id: "calendrier", titre: "Calendrier saisonnier et évolution du risque" },
  { id: "secteur", titre: "Secteur d'activité : un seul choix, deux effets" },
  { id: "synthese-portefeuille", titre: "Synthèse portefeuille (tableau de bord)" },
  { id: "benchmark", titre: "Positionnement du site (benchmark national)" },
  { id: "rapport-esg", titre: "Rapport ESG (ESRS E3 / TNFD)" },
  { id: "partage-hors-ligne", titre: "Partage et mode hors-ligne" },
  { id: "bnpe", titre: "Prélèvements (BNPE)" },
  { id: "zones-alerte", titre: "Zones d'alerte : périmètre appliqué" },
  { id: "transition", titre: "Risque de transition (ZRE, Plan Eau)" },
  { id: "carte-departementale", titre: "Carte départementale du portefeuille" },
  { id: "anticipation", titre: "Anticipation des restrictions (horizon saisonnier)" },
  { id: "bdlisa", titre: "Rattachement à l'aquifère (BDLISA)" },
  { id: "bassin", titre: "Bassin et agence de l'eau" },
  { id: "swi", titre: "Humidité des sols (SWI)" },
  { id: "portee-rapport", titre: "Ce que le rapport ESG couvre — et ce qu'il ne couvre pas" },
  { id: "jours-contraints", titre: "Jours d'activité contrainte" },
  { id: "arbitrage", titre: "Partage de la ressource et arbitrage des usages" },
  { id: "projection-2050", titre: "Projection 2050" },
  { id: "vos-donnees", titre: "Vos données" },
  { id: "avertissement", titre: "Avertissement" },
] as const satisfies readonly MethodoSection[];

/** Every id in the registry, as a union — this is what makes a dead anchor a
 *  compile error rather than a silent jump to the top of the page. */
export type MethodoId = (typeof METHODO_SECTIONS)[number]["id"];

/** Link to a specific section. Prefer this over a bare "/methodologie". */
export function methodologieHref(id: MethodoId): string {
  return `/methodologie#${id}`;
}

export function methodoTitre(id: MethodoId): string {
  return METHODO_SECTIONS.find((s) => s.id === id)!.titre;
}
