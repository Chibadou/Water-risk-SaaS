// Labels for the two optional site refinements used by the constrained-days
// estimate. Neither feeds the composite score — the non-double-counting rule
// that already governs `secteur` applies here too.

import type { OrigineEau, ResponseType } from "./sites";
import type { ZoneType } from "./types";

export interface OrigineInfo {
  id: OrigineEau;
  label: string;
  /** the VigiEau zone type this origin is exposed to, undefined = keep the worst */
  zoneType?: ZoneType;
}

// "inconnu" first: it is the default, and it preserves the historical behaviour
// (worst level across all zone types) for every site saved before this existed.
export const ORIGINES: OrigineInfo[] = [
  { id: "inconnu", label: "Non précisée" },
  { id: "aep", label: "Réseau d'eau potable", zoneType: "AEP" },
  { id: "superficiel", label: "Prélèvement en cours d'eau", zoneType: "SUP" },
  { id: "souterrain", label: "Forage / nappe", zoneType: "SOU" },
  { id: "mixte", label: "Mixte" },
];

export const DEFAULT_ORIGINE: OrigineEau = "inconnu";

/**
 * The §4.3 production response, offered to the user.
 *
 * ⚠️ Replaces the four-value "Dépendance à l'eau" dropdown removed at Sprint 42b
 * (G10). The difference is not cosmetic: `Dependance` fed a multiplier
 * (0.6 / 1 / 1.4 / 1.8) that I had invented and that scaled a MEASURED day
 * count. `ResponseType` names a physical behaviour instead, and the engine
 * REFUSES to compute rather than guess when the declaration it needs is missing
 * (`stepwise` without its number of steps, `threshold` without its threshold).
 *
 * Wording is the whole difficulty here: nobody outside this codebase knows what
 * `stepwise` means. Each label therefore names a machine, not a category.
 */
export interface ReponseInfo {
  id: ResponseType;
  label: string;
  hint: string;
}

export const REPONSES: ReponseInfo[] = [
  {
    id: "linear",
    label: "Proportionnelle au volume",
    hint: "Tour de refroidissement, lavage, irrigation : 20 % d'eau en moins, 20 % de production en moins.",
  },
  {
    id: "threshold",
    label: "Tout ou rien (seuil technique)",
    hint: "L'installation tourne ou s'arrête ; elle ne tourne pas à 60 % de son eau ultrapure. Demande un seuil technique en m³/jour.",
  },
  {
    id: "stepwise",
    label: "Par paliers (lignes de production)",
    hint: "Usine multi-lignes : les lignes s'arrêtent une par une. Demande le nombre de paliers.",
  },
];

/**
 * ⚠️ No default. `computeIa` applies `linear` and JOURNALS that it did, which is
 * a different statement from the user having chosen it.
 */
export const DEFAULT_REPONSE: ResponseType | undefined = undefined;

export function origineInfo(id: OrigineEau | undefined): OrigineInfo | undefined {
  return id ? ORIGINES.find((o) => o.id === id) : undefined;
}

/** The zone type an origin is exposed to; undefined means "keep the worst zone". */
export function zoneTypeForOrigine(id: OrigineEau | undefined): ZoneType | undefined {
  return origineInfo(id)?.zoneType;
}
