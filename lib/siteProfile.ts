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

/**
 * Where a usage's volume came from — carried to the export (ADR-006).
 *
 * `deduit_part` is not a lesser truth, it is a DIFFERENT one: the share was
 * declared, the volume was computed from it and from the site total. A verifier
 * asking "where does this m³ come from?" must get that answer, not a bare
 * number.
 */
export type VolumeOrigin = "declare" | "deduit_part" | "indisponible";

export interface ResolvedVolume {
  volumeM3?: number;
  origine: VolumeOrigin;
}

/**
 * The volume of one usage, and how it was obtained.
 *
 * An explicitly declared volume always wins over a derived one: if an operator
 * took the trouble to state m³ for a usage, that is better evidence than a
 * share applied to a total.
 */
export function resolveUsageVolume(usage: SiteUsage, totalM3: number | undefined): ResolvedVolume {
  const v = usage.volumeM3;
  if (v !== undefined && Number.isFinite(v) && v >= 0) {
    return { volumeM3: v, origine: "declare" };
  }
  const part = usage.part;
  if (
    part !== undefined &&
    Number.isFinite(part) &&
    part >= 0 &&
    totalM3 !== undefined &&
    Number.isFinite(totalM3) &&
    totalM3 > 0
  ) {
    return { volumeM3: totalM3 * Math.min(1, part), origine: "deduit_part" };
  }
  return { origine: "indisponible" };
}

export interface VectorSum {
  /** sum of the declared shares, 0-1 — 1 when the vector is complete */
  total: number;
  /** how many rows carry a share at all */
  renseignes: number;
  /** true when the shares add up to 100 % within a tolerance of half a point */
  complet: boolean;
  /** signed gap to 100 %, so the UI can say "il manque 15 %" or "vous dépassez de 5 %" */
  ecart: number;
}

/**
 * Whether the declared shares add up.
 *
 * ⚠️ Not enforced, reported. A vector summing to 85 % is not invalid — the
 * operator may simply not have accounted for the rest — and refusing the input
 * would lose the 85 % that IS known. The gap is surfaced so the reader knows the
 * weighting rests on a partial description.
 */
export function vectorSum(usages: SiteUsage[] | undefined): VectorSum {
  let total = 0;
  let renseignes = 0;
  for (const u of usages ?? []) {
    if (u.part !== undefined && Number.isFinite(u.part) && u.part >= 0) {
      total += u.part;
      renseignes++;
    }
  }
  return {
    total,
    renseignes,
    complet: renseignes > 0 && Math.abs(total - 1) < 0.005,
    ecart: total - 1,
  };
}

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
  /** usages whose volume could be resolved neither directly nor from a share */
  sansVolume: number;
  /** how many volumes were DERIVED from a share rather than declared (ADR-006) */
  deduits: number;
}

/**
 * Totals over the vector.
 *
 * `totalM3` is the site's declared annual volume, needed to turn shares into
 * cubic metres. Omit it and only directly declared per-usage volumes count —
 * which is the honest degradation, not a zero.
 */
export function usageTotals(
  usages: SiteUsage[] | undefined,
  totalM3?: number,
): UsageTotals {
  const out: UsageTotals = {
    total: 0,
    parSource: {},
    exempt: 0,
    restreignable: 0,
    critique: 0,
    sansVolume: 0,
    deduits: 0,
  };
  for (const u of usages ?? []) {
    const resolved = resolveUsageVolume(u, totalM3);
    const v = resolved.volumeM3;
    if (v === undefined) {
      out.sansVolume++;
      continue;
    }
    if (resolved.origine === "deduit_part") out.deduits++;
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

/**
 * A notional total used only for weighting.
 *
 * Weighting is scale-free: shares of 80/15/5 give the same result whether the
 * site draws 1 000 or 1 000 000 m³. Passing 1 lets `resolveUsageVolume` turn
 * shares into comparable numbers without pretending to know a volume.
 */
function weightBasis(usages: SiteUsage[] | undefined): number | undefined {
  return (usages ?? []).some((u) => u.part !== undefined) ? 1 : undefined;
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

  // Shares alone are enough to weight a level: no site total is needed, because
  // the weighting is relative. That is why the form can ask for percentages.
  const totals = usageTotals(site.usages, weightBasis(site.usages));
  let parts: Partial<Record<SourceType, number>> = {};
  let base: WeightedLevel["base"] = "aucune";

  if (totals.restreignable > 0) {
    // Weight on the RESTRICTABLE volume, not the total: exempt water cannot be
    // restricted, so it must not dilute the level.
    for (const u of site.usages ?? []) {
      if (u.isExempt || !u.sourceType) continue;
      const v = resolveUsageVolume(u, weightBasis(site.usages)).volumeM3;
      if (v === undefined || v <= 0) continue;
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
