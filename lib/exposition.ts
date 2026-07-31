// Labels for the two optional site refinements used by the constrained-days
// estimate. Neither feeds the composite score — the non-double-counting rule
// that already governs `secteur` applies here too.

import type { Dependance, OrigineEau } from "./sites";
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

export interface DependanceInfo {
  id: Dependance;
  label: string;
  hint: string;
}

export const DEPENDANCES: DependanceInfo[] = [
  { id: "faible", label: "Faible", hint: "L'eau est un usage annexe (bureaux, commerce)." },
  { id: "moyenne", label: "Moyenne", hint: "Usage courant, substituable en partie." },
  { id: "forte", label: "Forte", hint: "L'eau entre dans le procédé principal." },
  { id: "critique", label: "Critique", hint: "L'activité s'arrête sans eau (refroidissement, agroalimentaire)." },
];

export const DEFAULT_DEPENDANCE: Dependance = "moyenne";

export function origineInfo(id: OrigineEau | undefined): OrigineInfo | undefined {
  return id ? ORIGINES.find((o) => o.id === id) : undefined;
}

/** The zone type an origin is exposed to; undefined means "keep the worst zone". */
export function zoneTypeForOrigine(id: OrigineEau | undefined): ZoneType | undefined {
  return origineInfo(id)?.zoneType;
}
