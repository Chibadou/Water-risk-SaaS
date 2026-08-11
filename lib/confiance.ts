// Confidence by OUTPUT — ADR-004 — and evidence labels N1/N2/N3 — §0.1, G8.
//
// ⚠️ Two things that look alike and are not, which is why they live in separate
// fields here:
//
//   - `NiveauPreuve` (N1/N2/N3) says HOW A FIGURE WAS OBTAINED: observed,
//     calibrated, or scenario. It is a property of the computation.
//   - `Confiance` (haute/moyenne/basse) says HOW MUCH THE FIGURE CAN CARRY. It is
//     a property of the DECISION it supports.
//
// They are not redundant. The portfolio RANKING is high confidence even though it
// rests on N2 inputs, because a ranking survives errors that move every site the
// same way. A euro figure is low confidence even when built from N1 days, because
// the conversion to money is the weak link. ADR-004's whole point is that the
// product is most trustworthy exactly where it is least precise.
//
// ⚠️ Distinct from `scoreConfidence` (lib/score.ts), which measures how many
// COMPONENTS answered. That is coverage. This is epistemic standing, and a fully
// covered euro figure is still a low-confidence one.

/** Evidence level of a figure (§0.1). */
export type NiveauPreuve = "N1" | "N2" | "N3";

export type Confiance = "haute" | "moyenne" | "basse";

/** What the product publishes, as the unit confidence attaches to. */
export type Sortie =
  | "classement"
  | "magnitude_js"
  | "magnitude_vnp"
  | "magnitude_ia"
  | "euros"
  | "score";

export interface PreuveInfo {
  id: NiveauPreuve;
  label: string;
  /** one sentence a reader can act on, not a definition */
  quoi: string;
}

export const PREUVES: Record<NiveauPreuve, PreuveInfo> = {
  N1: {
    id: "N1",
    label: "Constaté",
    quoi:
      "Compté dans des documents publiés. Les arrêtés préfectoraux étant publics, un décompte de " +
      "jours passés est un FAIT OPPOSABLE, pas un modèle — vous pouvez le confronter au texte.",
  },
  N2: {
    id: "N2",
    label: "Calibré",
    quoi:
      "Estimé par un modèle ajusté sur l'historique observé. Porte une incertitude quantifiée, et " +
      "doit être lu en fourchette : un point unique y serait une illusion de précision.",
  },
  N3: {
    id: "N3",
    label: "Scénarisé",
    quoi:
      "Conditionnel à un scénario climatique et à un scénario de politique publique. ⚠️ N'est PAS " +
      "une prévision : c'est « si ce narratif se réalise, alors ». Les scénarios ne se moyennent pas.",
  },
};

export interface ConfianceInfo {
  sortie: Sortie;
  label: string;
  niveau: Confiance;
  /** why this level and not another — the justification, not the description */
  motif: string;
  /** what the figure may legitimately be used for */
  usage: string;
}

/**
 * ADR-004's assignment, written out.
 *
 * ⚠️ The order is deliberate: the most trustworthy output first, so a reader
 * scanning the table meets the ranking before the euros.
 */
export const CONFIANCES: ConfianceInfo[] = [
  {
    sortie: "classement",
    label: "Classement relatif de vos sites",
    niveau: "haute",
    motif:
      "Un classement survit aux erreurs qui déplacent tous les sites dans le même sens. Une ρ " +
      "systématiquement sous-estimée de 20 % change chaque volume et ne change pas l'ordre.",
    usage:
      "Décider où porter l'effort en premier. C'est la sortie la plus fiable du produit, et c'est " +
      "aussi celle dont on parle le moins parce qu'elle ne donne pas de chiffre à citer.",
  },
  {
    sortie: "magnitude_js",
    label: "Jours sous statut (jours/an)",
    niveau: "haute",
    motif:
      "Compté dans des arrêtés publiés (N1 pour le passé). ⚠️ Sa faiblesse n'est pas la précision " +
      "mais la DURABILITÉ : la nomenclature a changé en 2021 et changera encore, ce qui rend deux " +
      "décomptes séparés par une réforme incomparables (§4.1).",
    usage:
      "Décrire ce qui s'est passé, et le confronter au texte des arrêtés. Jamais comparer deux " +
      "périodes séparées par une réforme.",
  },
  {
    sortie: "magnitude_vnp",
    label: "Volume non prélevable (m³/an)",
    niveau: "moyenne",
    motif:
      "En unité physique, donc invariant au cadre réglementaire — mais il dépend de trois " +
      "déclarations que l'exploitant seul détient (volume de référence, volume exempté, taux de " +
      "restitution) et d'une hypothèse prudentielle nommée (κ = 1, ADR-005). Le taux de " +
      "restitution seul fait un facteur 19 entre un circuit ouvert et une évaporation.",
    usage:
      "Dimensionner un investissement, alimenter un reporting ESRS E3. À lire en fourchette quand " +
      "l'arrêté laisse une mesure non chiffrée.",
  },
  {
    sortie: "magnitude_ia",
    label: "Interruption d'activité (JEA/an)",
    niveau: "moyenne",
    motif:
      "Repose sur la forme de réponse de la production, que le client déclare et que l'outil " +
      "REFUSE de deviner. À jours égaux, la structure des épisodes change le résultat de plusieurs " +
      "fois dès qu'une réserve existe (§4.3) — c'est une force du modèle et une sensibilité forte " +
      "à une donnée d'entrée.",
    usage:
      "Dimensionner un stockage ou une continuité d'activité. Le chiffre 2050 est N3 : à lire comme " +
      "un scénario, pas comme une échéance.",
  },
  {
    sortie: "score",
    label: "Score composite 0-100",
    niveau: "moyenne",
    motif:
      "⚠️ **Divergence assumée avec la note technique** (arbitrage G4). La note ne prévoit que " +
      "trois sorties ; le score en est une quatrième. Ce n'est pas un oubli : le retirer aurait fait " +
      "dépendre le classement de volumes déclarés, donc rendu INCLASSABLE tout site dont le client " +
      "n'a rien saisi — alors que l'ADR-004 désigne le classement comme le livrable le plus fiable. " +
      "Le score est ce qui permet de classer un portefeuille non renseigné.",
    usage:
      "Trier un portefeuille et repérer les sites à instruire. Jamais comme une mesure " +
      "réglementaire ni comme une valeur à publier telle quelle.",
  },
  {
    sortie: "euros",
    label: "Exposition financière (€/an)",
    niveau: "basse",
    motif:
      "La conversion en euros est le maillon faible, quelle que soit la qualité des jours en " +
      "amont. Le produit ne l'estime plus du tout : il multiplie les JEA par un coût journalier que " +
      "le client déclare (G6). Le repli sur 0,5 %/jour du chiffre d'affaires a été RETIRÉ — un ordre " +
      "de grandeur tous périls confondus ne dit rien de la sécheresse (anti-pattern n°10).",
    usage:
      "Ouvrir une discussion en comité, avec le coût journalier affiché à côté. Jamais une " +
      "provision comptable.",
  },
];

export function confiancePour(sortie: Sortie): ConfianceInfo | undefined {
  return CONFIANCES.find((c) => c.sortie === sortie);
}

/**
 * CSRD reporting horizons — §11.2.
 *
 * The note recommends keeping the product's own operational horizons AND
 * publishing the correspondence table, because they answer different questions:
 * "can I pump in August" is not "what is my medium-term transition risk". The
 * table is cheap and prevents an auditor from having to guess the mapping.
 */
export const HORIZONS_CSRD: {
  produit: string;
  csrd: "court terme" | "moyen terme" | "long terme";
  esrs: string;
  preuve: NiveauPreuve;
}[] = [
  {
    produit: "Maintenant (situation en vigueur)",
    csrd: "court terme",
    esrs: "≤ 1 an — exercice de reporting en cours",
    preuve: "N1",
  },
  {
    produit: "Fin de saison d'étiage",
    csrd: "court terme",
    esrs: "≤ 1 an — reste de l'exercice",
    preuve: "N2",
  },
  {
    produit: "Année type (moyenne des années complètes)",
    csrd: "moyen terme",
    esrs: "1 à 5 ans — la base récurrente",
    preuve: "N1",
  },
  {
    produit: "Horizon 2050 (+2,7 °C, Explore2)",
    csrd: "long terme",
    esrs: "> 5 ans — résilience du modèle d'affaires",
    preuve: "N3",
  },
];
