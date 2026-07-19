import type { NiveauGravite, ZoneType } from "./types";

export interface GraviteInfo {
  /** severity rank, higher = worse */
  rank: number;
  label: string;
  /** hex color used on the map */
  color: string;
  /** tailwind classes for badges */
  badgeClass: string;
  description: string;
}

export const GRAVITE: Record<NiveauGravite, GraviteInfo> = {
  vigilance: {
    rank: 1,
    label: "Vigilance",
    color: "#fdd835",
    badgeClass: "bg-yellow-100 text-yellow-900 border-yellow-300",
    description: "Inciter aux économies d'eau — pas de restriction obligatoire.",
  },
  alerte: {
    rank: 2,
    label: "Alerte",
    color: "#fb8c00",
    badgeClass: "bg-orange-100 text-orange-900 border-orange-300",
    description: "Premières restrictions obligatoires (réduction des prélèvements).",
  },
  alerte_renforcee: {
    rank: 3,
    label: "Alerte renforcée",
    color: "#e53935",
    badgeClass: "bg-red-100 text-red-900 border-red-300",
    description: "Restrictions renforcées, réduction forte des prélèvements.",
  },
  crise: {
    rank: 4,
    label: "Crise",
    color: "#8e24aa",
    badgeClass: "bg-purple-100 text-purple-950 border-purple-300",
    description: "Arrêt des prélèvements non prioritaires — seuls les usages prioritaires (santé, sécurité, eau potable) sont maintenus.",
  },
};

export const ZONE_TYPE_LABEL: Record<ZoneType, { short: string; long: string }> = {
  SUP: { short: "SUP", long: "Eaux superficielles (cours d'eau)" },
  SOU: { short: "SOU", long: "Eaux souterraines (nappes)" },
  AEP: { short: "AEP", long: "Eau potable" },
};

export function graviteInfo(niveau?: string): GraviteInfo | undefined {
  if (!niveau) return undefined;
  return GRAVITE[niveau as NiveauGravite];
}

/** Highest severity level across a set of zones, if any. */
export function maxGravite(niveaux: Array<string | undefined>): NiveauGravite | undefined {
  let best: NiveauGravite | undefined;
  for (const n of niveaux) {
    const info = graviteInfo(n);
    if (info && (!best || info.rank > GRAVITE[best].rank)) {
      best = n as NiveauGravite;
    }
  }
  return best;
}
