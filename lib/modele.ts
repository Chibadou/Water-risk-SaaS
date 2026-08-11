// Model version, and the log of method changes — ADR-006, anti-pattern n°7.
//
// ⚠️ Why this is not the "Démo — Sprint N" badge that used to sit in Shell.tsx.
// A sprint number tells a reader which code shipped. It does not tell them
// whether the NUMBER THEY ARE LOOKING AT was produced the same way as the one
// they read three months ago. The note asks for a report produced today to be
// reproducible identically in two years, which needs two things a sprint badge
// cannot give: a version that changes only when the METHOD changes, and a log
// saying what changed and in which direction the figures moved.
//
// ⚠️ The specific failure this prevents. Sprint 43 replaced `max(SUP, SOU, AEP)`
// with a volume-weighted level. That is a correctness fix, and it MOVES SCORES
// ALREADY READ BY SOMEONE — generally downwards, because a site on the mains
// stops inheriting an aquifer it never pumps. Without a dated, announced change,
// a user reopening their portfolio sees an improvement in their risk where there
// is only a change of method. This is the first time in this repo that a
// correctness fix moves a figure someone has already acted on.

/**
 * Current model version. Bumped ONLY when a change alters the figures a previous
 * version would have produced — not on every sprint, not on a UI change.
 *
 * Format: `AAAA.MM.N`, so the date is readable without a lookup table.
 */
export const MODELE_VERSION = "2026.08.1";

/** ISO date the current version was frozen. */
export const MODELE_DATE = "2026-08-11";

export interface ChangementMethode {
  version: string;
  date: string;
  /** what changed, in one sentence a non-specialist can act on */
  quoi: string;
  /** which outputs moved */
  sorties: Array<"JS" | "VNP" | "IA" | "score">;
  /**
   * Direction of the movement on already-published figures, stated plainly.
   * ⚠️ "inconnu" is allowed and honest; "aucun" must never be used as a default.
   */
  sens: "hausse" | "baisse" | "les deux" | "aucun" | "inconnu";
  /** why the previous figure was wrong — the justification, not the description */
  motif: string;
}

/**
 * The log, most recent first. Every entry is a promise: a report bearing version
 * X was produced by the method described at X, and any later entry says how a
 * figure would differ.
 */
export const CHANGEMENTS_METHODE: ChangementMethode[] = [
  {
    version: "2026.08.1",
    date: "2026-08-11",
    quoi:
      "Le niveau réglementaire d'un site n'est plus le maximum de ses zones superficielle, " +
      "souterraine et eau potable : il est pondéré par la part de volume que le site prélève dans " +
      "chacune. Quand aucune répartition par usage n'est déclarée, l'outil retombe sur le maximum " +
      "et le signale explicitement (mention « repli »).",
    sorties: ["JS", "score"],
    sens: "baisse",
    motif:
      "Un site raccordé au réseau héritait du niveau de gravité d'une nappe qu'il ne pompe pas. " +
      "Le maximum fait gouverner le site par sa ressource la plus contrainte, même quand elle ne " +
      "porte que 1 % de ses prélèvements — et il le faisait silencieusement, le chiffre ayant " +
      "l'apparence d'une lecture des arrêtés. ⚠️ Conséquence pratique : les scores affichés " +
      "BAISSENT généralement, et un classement de portefeuille peut se réordonner. Ce n'est pas " +
      "une amélioration du risque, c'est une correction de méthode.",
  },
  {
    version: "2026.08.0",
    date: "2026-08-11",
    quoi:
      "Les jours d'activité contrainte (jours × exposition × un facteur de dépendance) sont " +
      "remplacés par trois sorties distinctes : les jours sous statut en jours, le volume non " +
      "prélevable en m³, l'interruption d'activité en jours-équivalents d'arrêt.",
    sorties: ["JS", "VNP", "IA"],
    sens: "les deux",
    motif:
      "L'ancien chiffre multipliait une quantité mesurée (les jours d'arrêté publiés) par un " +
      "coefficient de dépendance de 0,6 à 1,8 que rien ne sourçait, et présentait le produit " +
      "comme des jours. Le repli euros sur 0,5 %/jour du chiffre d'affaires est retiré pour la " +
      "même raison : un ordre de grandeur tous périls confondus ne dit rien de la sécheresse. " +
      "⚠️ Les colonnes CSV changent de nom, volontairement : un tableur bâti sur les anciennes " +
      "ne lira pas silencieusement les nouvelles.",
  },
];

/** The change entries that affect a given output, most recent first. */
export function changementsPour(
  sortie: "JS" | "VNP" | "IA" | "score",
): ChangementMethode[] {
  return CHANGEMENTS_METHODE.filter((c) => c.sorties.includes(sortie));
}

/** One line for a report header, so a printed figure carries its own version. */
export function modeleLigne(): string {
  return `Modèle HydroVigie ${MODELE_VERSION}, figé le ${new Date(MODELE_DATE).toLocaleDateString(
    "fr-FR",
    { day: "numeric", month: "long", year: "numeric" },
  )}.`;
}
