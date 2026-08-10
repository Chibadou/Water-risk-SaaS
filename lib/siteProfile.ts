// The site's usage vector, read as a vector — note technique ADR-001 / ADR-003.
//
// Everything here is pure and offline: it takes a SavedSite and answers three
// questions the engine needs before it can compute anything honest.
//
//   1. What is the site's water actually made of? (volume per source, exempt
//      share, consumed vs returned)
//   2. Given a level per resource type, what level does the SITE experience?
//      Weighted by volume — never the maximum (anti-pattern n°1).
//   3. What do we NOT know about this site, and what is therefore unsafe to
//      compute?
//
// (3) is not a nicety. Every site saved before Sprint 40 has no usage vector,
// and the tempting shortcut — treat it as one usage at 100 % of the declared
// volume — would silently invent the very thing ADR-001 exists to obtain. An
// absent vector reads as INCOMPLETE, and the caller is told what is missing.

import { GRAVITE } from "./gravite";
import type { OrigineEau, SavedSite, SiteUsage, SourceType } from "./sites";
import type { NiveauGravite, ZoneType } from "./types";

/** Volume figures derived from the usage vector. All m³/an. */
export interface UsageTotals {
  /** total declared across the vector */
  total: number;
  /** per source type, for the weighting in `weightedLevel` */
  parSource: Partial<Record<SourceType, number>>;
  /** volume flagged exempt (§4.2b) — deducted before ρ is applied */
  exempt: number;
  /** total minus exempt: the volume a restriction can actually bite into */
  restreignable: number;
  /** volume belonging to a process-critical usage */
  critique: number;
  /** usages carrying no declared volume — they cannot be weighted */
  sansVolume: number;
}

export function usageTotals(usages: SiteUsage[] | undefined): UsageTotals {
  const out: UsageTotals = {
    total: 0,
    parSource: {},
    exempt: 0,
    restreignable: 0,
    critique: 0,
    sansVolume: 0,
  };
  for (const u of usages ?? []) {
    const v = u.volumeM3;
    if (v === undefined || !Number.isFinite(v) || v < 0) {
      out.sansVolume++;
      continue;
    }
    out.total += v;
    if (u.sourceType) out.parSource[u.sourceType] = (out.parSource[u.sourceType] ?? 0) + v;
    if (u.isExempt) out.exempt += v;
    else out.restreignable += v;
    if (u.isProcessCritical) out.critique += v;
  }
  return out;
}

/**
 * Volume actually consumed rather than withdrawn (§4.2c).
 *
 * Where withdrawal and discharge occur in the same water body, the restriction
 * bears on consumption. `tauxRestitution` is the share returned; what a
 * restriction can remove is what is not returned.
 *
 * Returns undefined rather than assuming 0 when the rate is not declared: an
 * assumed 0 would silently claim the site consumes everything it takes, which
 * overstates the VNP by up to an order of magnitude for open-circuit cooling.
 */
export function volumeConsomme(
  volumeM3: number | undefined,
  tauxRestitution: number | undefined,
): number | undefined {
  if (volumeM3 === undefined || !Number.isFinite(volumeM3)) return undefined;
  if (tauxRestitution === undefined || !Number.isFinite(tauxRestitution)) return undefined;
  const r = Math.min(1, Math.max(0, tauxRestitution));
  return volumeM3 * (1 - r);
}

const SOURCE_OF_ZONE: Record<ZoneType, SourceType> = { SUP: "SUP", SOU: "SOU", AEP: "AEP" };

/** Legacy fallback: the single `origine` a site could declare before Sprint 40. */
const SOURCE_OF_ORIGINE: Partial<Record<OrigineEau, SourceType>> = {
  aep: "AEP",
  superficiel: "SUP",
  souterrain: "SOU",
};

export interface WeightedLevel {
  /** effective severity rank, 0 = none — a real number, since it is a weighted mean */
  rank: number;
  /** nearest named level, for display; undefined when nothing applies */
  niveau?: NiveauGravite;
  /** share of the site's restrictable volume that each source contributes */
  parts: Partial<Record<SourceType, number>>;
  /** how the weighting was obtained — never let a fallback pass for a measure */
  base: "vecteur" | "origine_unique" | "aucune";
  /** true when no volume could be used and the answer is not a weighting at all */
  degrade: boolean;
}

/**
 * The level a SITE experiences, weighted by where its water comes from.
 *
 * ⚠️ This is anti-pattern n°1 of the note: taking the maximum across SUP, SOU
 * and AEP declares a mains-connected site "in crisis" because a river it never
 * pumps is. `levelForOrigin` (lib/vigieau.ts) already refused the maximum, but
 * it CHOOSES one resource; the note asks to WEIGHT them.
 *
 * The rank is returned as a real number on purpose. A site at 95 % AEP in
 * vigilance and 5 % SUP in crise sits at 1.15 — closer to vigilance than to
 * alerte, which is the honest answer and one no named level can express. The
 * named level is provided alongside for display, and is a rounding, not the
 * result.
 *
 * ⚠️ Exempt volumes are excluded from the weighting: a restriction cannot bite
 * into them, so letting them carry weight would dilute the level.
 */
export function weightedLevel(
  levels: Partial<Record<ZoneType, NiveauGravite | null | undefined>>,
  site: Pick<SavedSite, "usages" | "origine">,
): WeightedLevel {
  const rankOf = (t: SourceType): number => {
    const n = levels[t];
    return n && GRAVITE[n] ? GRAVITE[n].rank : 0;
  };

  const totals = usageTotals(site.usages);
  let parts: Partial<Record<SourceType, number>> = {};
  let base: WeightedLevel["base"] = "aucune";

  if (totals.restreignable > 0) {
    // Weight on the RESTRICTABLE volume, not the total: exempt water cannot be
    // restricted, so it must not dilute the level.
    for (const u of site.usages ?? []) {
      if (u.isExempt || !u.sourceType) continue;
      const v = u.volumeM3;
      if (v === undefined || !Number.isFinite(v) || v <= 0) continue;
      parts[u.sourceType] = (parts[u.sourceType] ?? 0) + v / totals.restreignable;
    }
    if (Object.keys(parts).length > 0) base = "vecteur";
  }

  if (base === "aucune") {
    // No usable vector. Fall back to the single declared origin — the pre-Sprint
    // 40 behaviour — and SAY so, so no caller mistakes it for a weighting.
    const single = site.origine ? SOURCE_OF_ORIGINE[site.origine] : undefined;
    if (single) {
      parts = { [single]: 1 };
      base = "origine_unique";
    }
  }

  if (base === "aucune") {
    // Nothing declared at all. Returning 0 here would read as "no restriction",
    // so the caller is told the answer is degraded and must not be displayed as
    // a level.
    return { rank: 0, parts: {}, base: "aucune", degrade: true };
  }

  let rank = 0;
  for (const [src, share] of Object.entries(parts) as [SourceType, number][]) {
    rank += rankOf(SOURCE_OF_ZONE[src]) * share;
  }

  // Nearest named level, for display only.
  let niveau: NiveauGravite | undefined;
  if (rank > 0) {
    let best: NiveauGravite | undefined;
    let bestGap = Infinity;
    for (const key of Object.keys(GRAVITE) as NiveauGravite[]) {
      const gap = Math.abs(GRAVITE[key].rank - rank);
      if (gap < bestGap) {
        bestGap = gap;
        best = key;
      }
    }
    niveau = best;
  }

  return { rank, niveau, parts, base, degrade: base !== "vecteur" };
}

export type ProfileGap =
  | "vecteur_usages"
  | "volumes_usages"
  | "taux_restitution"
  | "type_reponse"
  | "profil_charge";

export interface ProfileCompleteness {
  /** true only when every field the engine needs is declared */
  complet: boolean;
  gaps: ProfileGap[];
  /** what each gap prevents, so the UI can say why a figure is missing */
  consequences: string[];
}

const GAP_CONSEQUENCE: Record<ProfileGap, string> = {
  vecteur_usages:
    "Sans vecteur d'usages, le niveau effectif ne peut pas être pondéré par les volumes : " +
    "l'outil retombe sur l'origine unique déclarée.",
  volumes_usages:
    "Des usages sont déclarés sans volume : ils ne pèsent pas dans la pondération et " +
    "sortent du VNP.",
  taux_restitution:
    "Sans taux de restitution, prélèvement et consommation sont confondus — le VNP peut " +
    "être faux d'un ordre de grandeur selon le procédé.",
  type_reponse:
    "Sans fonction de réponse, l'interruption d'activité ne peut pas être convertie en " +
    "jours-équivalents d'arrêt.",
  profil_charge:
    "Sans profil de charge, une mesure à plage horaire est comptée en fraction de journée, " +
    "ce qui suppose une consommation uniforme sur 24 h.",
};

/**
 * What is missing from a site profile, and what each gap costs.
 *
 * ⚠️ The point of this function is to make an incomplete site SAY it is
 * incomplete. The tempting alternative — treat a legacy site as one usage at
 * 100 % of its declared volume — would manufacture the exact data ADR-001 is
 * meant to collect, and nothing downstream could tell the invention from a
 * declaration.
 */
export function profileCompleteness(
  site: Pick<SavedSite, "usages" | "reponse"> & { interne?: { tauxRestitution?: number } },
): ProfileCompleteness {
  const gaps: ProfileGap[] = [];
  const usages = site.usages ?? [];

  if (usages.length === 0) gaps.push("vecteur_usages");
  else {
    const totals = usageTotals(usages);
    if (totals.sansVolume > 0) gaps.push("volumes_usages");
    if (usages.some((u) => !u.loadProfile)) gaps.push("profil_charge");
  }
  if (site.interne?.tauxRestitution === undefined) gaps.push("taux_restitution");
  if (!site.reponse) gaps.push("type_reponse");

  return {
    complet: gaps.length === 0,
    gaps,
    consequences: gaps.map((g) => GAP_CONSEQUENCE[g]),
  };
}
