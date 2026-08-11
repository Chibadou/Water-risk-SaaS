// The jurisdiction boundary — G3, ADR-002.
//
// ⚠️ ADR-002's own warning, recopied verbatim because it is the honest framing of
// what this file is:
//
//     « Sans une seconde juridiction réelle, l'abstraction sera fictive et le
//       refactoring ultérieur coûteux. »
//
// G3 ACCEPTS that cost, it does not remove it. Only France is implemented. What
// this module buys today is not portability — it is that the four French levels,
// their ranks, their cadence and their vocabulary stop being scattered as literal
// arrays through the codebase.
//
// ⚠️ The measurement that justified the work. `NiveauGravite` is referenced by 18
// files and `GRAVITE` by 17, but a type import costs nothing to move. The real
// population was the LITERAL ARRAYS of the four levels — measured at Sprint 44:
// eight of them, in lib/js.ts, lib/vnp.ts, lib/restrictionsData.ts,
// app/api/restrictions/route.ts, components/ImpactPanel.tsx,
// components/RestrictionHistory.tsx, components/SectorImpactPanel.tsx and
// scripts/diag/replay-anticipation.ts. Each was a place where adding a fifth
// level, or renaming one, would have silently skipped a module. That sorting had
// never been done; this file is the result of doing it.

import type { NiveauGravite } from "./types";

/** ISO 3166-1 alpha-2. Only "FR" exists — see the ADR-002 warning above. */
export type JuridictionId = "FR";

/**
 * How a jurisdiction publishes its restriction states.
 *
 *  - `event_driven` — a decree is published when the situation requires it, with
 *    its own validity dates. France works this way, which is why the repo can
 *    count real days and real episodes.
 *  - `monthly` — a fixed calendar of published states. An episode's start and end
 *    are then only known to the month, which would make the IA's convexity
 *    (§4.3) unmeasurable rather than merely uncertain.
 *
 * ⚠️ Declared even though only one value is used, because it is the field that
 * decides whether `episodesFromPeriodes` means anything at all. A second
 * jurisdiction on `monthly` would not need a new engine — it would need the IA to
 * refuse.
 */
export type Cadence = "event_driven" | "monthly";

export interface Juridiction {
  id: JuridictionId;
  label: string;
  /**
   * The severity levels, from least to most severe. THE ordered list — every
   * module reads it rather than writing its own literal.
   */
  niveaux: NiveauGravite[];
  /** rank per level, 1-based. Kept here so `GRAVITE` stays a display concern. */
  rangs: Record<NiveauGravite, number>;
  /** the level from which a legal OBLIGATION applies (below it, an appeal) */
  premierNiveauContraignant: NiveauGravite;
  cadence: Cadence;
  /** the reform that makes older counts incomparable (anti-pattern n°9, §4.1) */
  reformes: { date: string; quoi: string }[];
}

export const FR: Juridiction = {
  id: "FR",
  label: "France métropolitaine et outre-mer",
  niveaux: ["vigilance", "alerte", "alerte_renforcee", "crise"],
  rangs: { vigilance: 1, alerte: 2, alerte_renforcee: 3, crise: 4 },
  // ⚠️ Vigilance is an appeal to voluntary restraint, not a rule. Counting it as
  // a constrained day inflates every figure — the distinction `CONSTRAINED_RANK`
  // already made in lib/portefeuille.
  premierNiveauContraignant: "alerte",
  cadence: "event_driven",
  reformes: [
    {
      date: "2021-06-23",
      quoi:
        "Décret 2021-795 : passage de trois à quatre niveaux de gravité et harmonisation " +
        "nationale des seuils. ⚠️ Un décompte de jours antérieur à cette date n'est PAS comparable " +
        "à un décompte postérieur — c'est la raison pour laquelle la note fait de JS le moins " +
        "durable des trois indicateurs (§4.1) et pourquoi §5.4 impose une variable de régime " +
        "pré/post-2021 dans toute calibration.",
    },
    {
      date: "2023-05-16",
      quoi:
        "Instruction du 16 mai 2023 : précision des mesures types par usage et des seuils de " +
        "déclenchement. Modifie la sévérité lue dans les arrêtés à niveau de gravité constant.",
    },
    {
      date: "2023-06-30",
      quoi:
        "Arrêté du 30 juin 2023 (installations classées) : définit le volume de référence " +
        "opposable pour les ICPE. ⚠️ Non implémenté — voir `resolveVref`, dont la trace le dit.",
    },
  ],
};

const JURIDICTIONS: Record<JuridictionId, Juridiction> = { FR };

/**
 * The active jurisdiction.
 *
 * ⚠️ A function rather than a constant on purpose: every call site that reads it
 * becomes a place a second jurisdiction would have to be threaded through, and
 * that list is what makes the future cost VISIBLE rather than surprising.
 */
export function juridiction(id: JuridictionId = "FR"): Juridiction {
  return JURIDICTIONS[id];
}

/** The ordered levels of the active jurisdiction — replaces eight literal arrays. */
export const NIVEAUX: NiveauGravite[] = FR.niveaux;

/** Rank of a level, 0 when unknown. */
export function rang(niveau: NiveauGravite | undefined | null): number {
  return niveau ? (FR.rangs[niveau] ?? 0) : 0;
}

/** True when the level carries an obligation rather than an appeal. */
export function contraignant(niveau: NiveauGravite | undefined | null): boolean {
  return rang(niveau) >= rang(FR.premierNiveauContraignant);
}

/**
 * G15 — is a point inside the jurisdiction's coverage?
 *
 * ⚠️ The rule this implements: a site outside France is ACCEPTED in the
 * portfolio, COUNTED in the headcount, and MARKED not covered. Never absent in
 * silence, never at zero. It is the repository's central rule ("an absent datum
 * is never a zero") applied to geography — and it is what makes the cost of G3
 * visible instead of theoretical.
 *
 * ⚠️⚠️ **What this check can and cannot do, precisely.** A bounding box around
 * metropolitan France necessarily contains parts of Catalonia, Piedmont, the Swiss
 * plateau, Wallonia and Kent. Barcelona (41.39, 2.17) is INSIDE the box. So:
 *
 *   - a far-field point (Madrid, Berlin, Casablanca) is rejected here;
 *   - a NEAR-BORDER foreign point passes, and is then answered by VigiEau with an
 *     empty zone list — the residual hole, named rather than papered over.
 *
 * The positive proof, when we have it, is the INSEE `citycode`: the BAN geocoder
 * only returns French addresses, so a site added through the search carries one by
 * construction. A lat/lon deep link does not, which is exactly the path that let a
 * foreign point in. The asymmetry is deliberate — a false negative would silently
 * drop a real French site from a portfolio, which is worse than one useless request.
 *
 * ✅ **DÉCISION (utilisateur, 2026-08-11) : on s'en tient au code INSEE.** Le polygone
 * France (≈ 100 kB de littoral) n'est PAS embarqué. Motif : le chemin par recherche
 * d'adresse — celui que tout le monde emprunte — est déjà protégé par construction,
 * puisque le géocodeur BAN ne délivre que des adresses françaises. Seul le lien
 * profond lat/lon reste exposé, et il faut le construire à la main pour tomber dans
 * le trou. Le coût du polygone n'est pas justifié par ce que ça ferme.
 *
 * ⚠️ Le test qui affirme que Barcelone passe RESTE, et c'est le point : la limite est
 * une propriété connue et vérifiée du code, pas une surprise. Si un jour un polygone
 * arrive, ce test échouera et devra être mis à jour — ce qui est exactement ce qu'on
 * veut d'un test qui documente une limite assumée.
 */
const EMPRISES: { nom: string; latMin: number; latMax: number; lonMin: number; lonMax: number }[] = [
  { nom: "France métropolitaine", latMin: 41.2, latMax: 51.2, lonMin: -5.3, lonMax: 9.7 },
  { nom: "Guadeloupe", latMin: 15.8, latMax: 16.6, lonMin: -61.9, lonMax: -60.9 },
  { nom: "Martinique", latMin: 14.3, latMax: 15.0, lonMin: -61.3, lonMax: -60.7 },
  { nom: "Guyane", latMin: 2.0, latMax: 6.0, lonMin: -54.7, lonMax: -51.5 },
  { nom: "La Réunion", latMin: -21.5, latMax: -20.8, lonMin: 55.1, lonMax: 55.9 },
  { nom: "Mayotte", latMin: -13.1, latMax: -12.6, lonMin: 44.9, lonMax: 45.4 },
];

export interface Couverture {
  couvert: boolean;
  emprise?: string;
  /** why, in words, for the interface — never a bare false */
  detail: string;
}

export function couverture(lat: number, lon: number, citycode?: string): Couverture {
  // Positive proof first: an INSEE commune code can only come from the French
  // referential. 5 characters, digits, with 2A/2B for Corsica.
  if (citycode && /^(\d{5}|2[AB]\d{3})$/.test(citycode.trim())) {
    return {
      couvert: true,
      emprise: "France (code INSEE)",
      detail: `Code commune INSEE ${citycode.trim()} : le site est dans le référentiel français.`,
    };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      couvert: false,
      detail:
        "Coordonnées illisibles : la couverture n'a pas pu être établie. ⚠️ Ce n'est pas « hors " +
        "France », c'est « on ne sait pas où ».",
    };
  }
  for (const e of EMPRISES) {
    if (lat >= e.latMin && lat <= e.latMax && lon >= e.lonMin && lon <= e.lonMax) {
      return { couvert: true, emprise: e.nom, detail: `Dans l'emprise ${e.nom}.` };
    }
  }
  return {
    couvert: false,
    detail:
      "Ce site est hors du périmètre réglementaire couvert par HydroVigie (France). Il reste " +
      "compté dans votre portefeuille et marqué NON COUVERT : aucun indicateur n'est produit pour " +
      "lui, et il ne compte pas pour zéro. ⚠️ Aucune source étrangère n'est substituée — mélanger " +
      "deux méthodologies incomparables dans un même classement est exactement ce que l'ADR-004 " +
      "interdit (c'est pourquoi Aqueduct n'est pas intégré).",
  };
}
