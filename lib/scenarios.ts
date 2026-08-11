// N3 — scenarios on two axes, and the variance decomposition (§6.2, §6.3, §6.4).
//
// ⚠️ The insight this module exists to make computable, from §6.4:
//
//     at the 2050 horizon and at SITE scale, the decisional and translational
//     uncertainties probably DOMINATE the hydro-climatic one.
//
// If that holds, then better-typing the arrêtés is worth more than better climate
// projections — which is a product-steering conclusion at least as much as a
// methodological one, and it redirects where the next effort goes. The note states
// it as a hypothesis TO TEST, so this module computes it rather than asserting it.
//
// ---------------------------------------------------------------------------
// The second axis, which did not exist before this sprint
// ---------------------------------------------------------------------------
//
// Everything the repo had was hydro-climatic: Explore2 narratives change the flow,
// and the model turns that into days. But the volume a site is ALLOWED to withdraw
// is set by policy, and policy moves independently of the climate — the Plan Eau
// already programmes −10 % by 2030. A public-policy scenario therefore modifies
// **V_ref itself**, not the days: a site can face the same hydrology and a
// different reference volume, and the VNP moves without a single extra dry day.

import { rang } from "./juridiction";
import type { NiveauGravite } from "./types";

/** A hydro-climatic narrative, as Explore2 publishes them. */
export interface NarratifClimatique {
  id: string;
  label: string;
  /** lengthening of the low-water period, days: [q05, q50, q95] */
  dtBE: [number, number, number];
  /** change in the summer low flow, %: [q05, q50, q95] */
  vcn10: [number, number, number];
}

/**
 * A public-policy scenario. Acts on V_ref, never on the days.
 *
 * ⚠️ These are NOT forecasts and not equally likely. They bracket a decision space,
 * and the labels say what each assumes so a reader can reject one.
 */
export interface ScenarioPolitique {
  id: string;
  label: string;
  /** multiplier applied to V_ref at the horizon, e.g. 0.9 for −10 % */
  facteurVref: number;
  /** what the scenario assumes, in words — never a bare coefficient */
  hypothese: string;
  /** the published instrument it derives from, or "aucun" when it is a bracket */
  source: string;
}

export const SCENARIOS_POLITIQUES: ScenarioPolitique[] = [
  {
    id: "statu_quo",
    label: "Statu quo réglementaire",
    facteurVref: 1,
    hypothese:
      "Les volumes autorisés restent à leur niveau actuel. ⚠️ C'est un scénario de RÉFÉRENCE, pas " +
      "le plus probable : le Plan Eau programme déjà une baisse, et aucune trajectoire publiée ne " +
      "prévoit la stabilité.",
    source: "aucun — borne de comparaison",
  },
  {
    id: "plan_eau_2030",
    label: "Plan Eau — −10 % de prélèvements en 2030",
    facteurVref: 0.9,
    hypothese:
      "La baisse de 10 % des prélèvements annoncée pour 2030 est répercutée uniformément sur les " +
      "volumes autorisés. ⚠️ L'uniformité est une hypothèse forte : la répartition réelle entre " +
      "usages et territoires n'est pas arrêtée, et un secteur peut porter bien plus que 10 %.",
    source: "Plan d'action pour une gestion résiliente et concertée de l'eau (mars 2023)",
  },
  {
    id: "zre_generalisee",
    label: "Généralisation des zones de répartition des eaux",
    facteurVref: 0.75,
    hypothese:
      "Les volumes prélevables sont révisés à la baisse là où la ressource est déficitaire, comme " +
      "le fait déjà le classement en ZRE. ⚠️ Le −25 % est une BORNE plausible construite pour " +
      "encadrer, pas une valeur publiée : aucun instrument ne l'annonce.",
    source: "aucun — borne haute construite à partir des révisions ZRE observées",
  },
];

export interface CelluleScenario {
  narratif: string;
  politique: string;
  /** days under an arrêté at the horizon, from the climate axis */
  joursTotal: number;
  /** V_ref at the horizon, from the policy axis */
  vrefM3: number;
  /** the resulting VNP, m³/an */
  vnpM3: number;
}

/**
 * The full cross of the two axes.
 *
 * ⚠️ Deliberately a CROSS and not a list of "storylines". Crossing them is what
 * makes the decomposition below possible: with a handful of hand-picked combined
 * storylines there is no way to tell which axis carries the spread, which is
 * precisely the question §6.4 asks.
 */
export function croiserScenarios(input: {
  narratifs: NarratifClimatique[];
  politiques?: ScenarioPolitique[];
  /** days under arrêté in the reference year */
  joursReference: number;
  /** V_ref today, m³/an */
  vrefM3: number;
  /** blocked share per level; a single mean ρ is enough at this granularity */
  rho: number;
}): CelluleScenario[] {
  const politiques = input.politiques ?? SCENARIOS_POLITIQUES;
  const out: CelluleScenario[] = [];
  for (const n of input.narratifs) {
    // The climate axis acts on the DAYS: a longer low-water period lengthens the
    // restriction calendar. Median quantile for the cell; the spread is carried by
    // having several narratives, not by widening one.
    const joursTotal = Math.max(0, input.joursReference + n.dtBE[1]);
    for (const p of politiques) {
      const vrefM3 = input.vrefM3 * p.facteurVref;
      out.push({
        narratif: n.id,
        politique: p.id,
        joursTotal,
        vrefM3,
        vnpM3: (vrefM3 / 365) * joursTotal * input.rho,
      });
    }
  }
  return out;
}

export interface DecompositionVariance {
  /** spread attributable to the hydro-climatic narrative */
  hydroClimatique: number;
  /** spread attributable to the public-policy scenario */
  decisionnelle: number;
  /**
   * Spread attributable to TRANSLATION — turning a decree's words into a ρ.
   * Supplied by the caller from the measured [ρ_min, ρ_max] interval, because it is
   * not a scenario axis: it is the width of what we could not read.
   */
  traductionnelle: number;
  /** the three as shares of the total, summing to 1 */
  parts: { hydroClimatique: number; decisionnelle: number; traductionnelle: number };
  /** which term dominates — the answer §6.4 asks for */
  dominante: "hydroClimatique" | "decisionnelle" | "traductionnelle";
  /**
   * ⚠️ True when the decisional or translational term dominates, i.e. when §6.4's
   * hypothesis is VERIFIED on this site. When it is, better-typing the arrêtés buys
   * more than better projections — a conclusion about where to spend effort.
   */
  hypotheseVerifiee: boolean;
  hypotheses: string[];
}

const variance = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
};

/**
 * Decompose the spread of the VNP across the two axes plus translation.
 *
 * Method: the variance of the cell means along each axis — the standard
 * between-group variance of a two-factor design. ⚠️ Not the variance of all cells
 * lumped together, which would mix the axes and answer nothing.
 *
 * `rhoMin` / `rhoMax` supply the translational term: it is the spread the SAME
 * decree produces depending on how its unquantified measures are read, so it is
 * computed at fixed narrative and fixed policy.
 */
export function decomposerVariance(input: {
  cellules: CelluleScenario[];
  rhoMin: number;
  rhoMax: number;
  /** the ρ actually used to build the cells, for scaling the translational term */
  rhoUtilise: number;
}): DecompositionVariance {
  const hypotheses: string[] = [];
  const cellules = input.cellules;

  const moyenneParCle = (cle: (c: CelluleScenario) => string): number[] => {
    const groupes = new Map<string, number[]>();
    for (const c of cellules) {
      const k = cle(c);
      const bucket = groupes.get(k);
      if (bucket) bucket.push(c.vnpM3);
      else groupes.set(k, [c.vnpM3]);
    }
    return [...groupes.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  };

  const hydroClimatique = variance(moyenneParCle((c) => c.narratif));
  const decisionnelle = variance(moyenneParCle((c) => c.politique));

  // The translational term: at a fixed cell, how much does the VNP move between
  // ρ_min and ρ_max? Scaled from the reference cell, since the VNP is linear in ρ.
  const reference = cellules.reduce((a, b) => a + b.vnpM3, 0) / (cellules.length || 1);
  const echelle = input.rhoUtilise > 0 ? reference / input.rhoUtilise : 0;
  const traductionnelle = variance([echelle * input.rhoMin, echelle * input.rhoMax]);

  const total = hydroClimatique + decisionnelle + traductionnelle;
  const parts =
    total > 0
      ? {
          hydroClimatique: hydroClimatique / total,
          decisionnelle: decisionnelle / total,
          traductionnelle: traductionnelle / total,
        }
      : { hydroClimatique: 0, decisionnelle: 0, traductionnelle: 0 };

  const entries: [DecompositionVariance["dominante"], number][] = [
    ["hydroClimatique", hydroClimatique],
    ["decisionnelle", decisionnelle],
    ["traductionnelle", traductionnelle],
  ];
  const dominante = entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const hypotheseVerifiee = dominante !== "hydroClimatique";

  hypotheses.push(
    "Décomposition en variance inter-groupes d'un plan à deux facteurs : variance des moyennes de " +
      "cellules le long de chaque axe. ⚠️ PAS la variance de toutes les cellules confondues, qui " +
      "mélangerait les axes et ne répondrait à rien.",
  );
  hypotheses.push(
    "Le terme traductionnel est calculé à narratif ET politique fixés : c'est l'écart que le MÊME " +
      "arrêté produit selon la lecture de ses mesures non chiffrées. Ce n'est pas un axe de " +
      "scénario, c'est la largeur de ce qu'on n'a pas su lire.",
  );
  hypotheses.push(
    hypotheseVerifiee
      ? `✅ L'hypothèse de §6.4 est VÉRIFIÉE sur ce site : le terme ${dominante} domine. ` +
        "Conséquence de pilotage : mieux typer les arrêtés rapporte davantage qu'améliorer les " +
        "projections climatiques."
      : "⚠️ L'hypothèse de §6.4 n'est PAS vérifiée sur ce site : c'est le terme hydro-climatique " +
        "qui domine. Améliorer les projections y rapporterait plus que mieux typer les arrêtés — " +
        "l'inverse de ce que la note anticipe, et donc un résultat à regarder de près plutôt qu'à " +
        "écarter.",
  );

  return {
    hydroClimatique,
    decisionnelle,
    traductionnelle,
    parts,
    dominante,
    hypotheseVerifiee,
    hypotheses,
  };
}

/** §6.3 — which quantile to publish, and for what. */
export type ConventionPrudence = "mediane" | "quantile_haut";

export interface RestitutionN3 {
  valeur: number;
  min: number;
  max: number;
  convention: ConventionPrudence;
  /** the scenario label, mandatory: an N3 figure without one is meaningless */
  etiquette: string;
  detail: string;
}

/**
 * §6.3's labelled prudence convention.
 *
 * ⚠️ The rule the note states and this enforces: **never a bare number**. An N3
 * figure without its interval and its scenario label is not a conservative
 * estimate, it is an unfalsifiable one. And the right quantile depends on the
 * decision: the median for reporting, a high quantile for sizing a storage tank —
 * publishing the median to someone about to pour concrete is the expensive error.
 *
 * Wide ranges are not a defect: the ESRS explicitly admit a range where
 * quantification is highly uncertain.
 */
export function restituerN3(input: {
  cellules: CelluleScenario[];
  convention: ConventionPrudence;
  /** narrative + policy, e.g. "+2,7 °C France × Plan Eau 2030" */
  etiquette: string;
}): RestitutionN3 | undefined {
  const valeurs = input.cellules.map((c) => c.vnpM3).sort((a, b) => a - b);
  if (valeurs.length === 0) return undefined;
  const quantile = (q: number) => valeurs[Math.min(valeurs.length - 1, Math.floor(q * valeurs.length))];
  const valeur = input.convention === "mediane" ? quantile(0.5) : quantile(0.9);
  return {
    valeur,
    min: valeurs[0],
    max: valeurs[valeurs.length - 1],
    convention: input.convention,
    etiquette: input.etiquette,
    detail:
      input.convention === "mediane"
        ? "Médiane des scénarios croisés — convention de reporting. ⚠️ À NE PAS utiliser pour " +
          "dimensionner un stockage : la moitié des scénarios la dépassent."
        : "Quantile 90 % des scénarios croisés — convention de dimensionnement. ⚠️ À NE PAS " +
          "publier comme une valeur attendue : c'est une borne haute assumée.",
  };
}

/** Mean ρ from a per-level interval, weighted by days — for the cross above. */
export function rhoMoyen(
  joursParNiveau: Partial<Record<NiveauGravite, number>>,
  exposure: Partial<Record<NiveauGravite, { min: number; max: number }>>,
): { min: number; max: number; jours: number } {
  let min = 0;
  let max = 0;
  let jours = 0;
  for (const [niveau, d] of Object.entries(joursParNiveau) as [NiveauGravite, number][]) {
    if (!d || d <= 0 || rang(niveau) === 0) continue;
    const e = exposure[niveau];
    // A level whose measures could not be read contributes NOTHING rather than
    // zero — the same rule as everywhere else in the repo.
    if (!e) continue;
    min += d * e.min;
    max += d * e.max;
    jours += d;
  }
  return jours > 0 ? { min: min / jours, max: max / jours, jours } : { min: 0, max: 0, jours: 0 };
}
