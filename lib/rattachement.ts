// Which regulatory level actually applies to a site — ADR-003.
//
// ⚠️ The anti-pattern this module exists to end (note, anti-pattern n°1):
//
//     niveau = max(SUP, SOU, AEP)
//
// VigiEau publishes a separate gravity level per zone type at a single point. A
// factory on the mains that also holds a surface-water permit for its fire pond
// is not in crisis because the river is: it draws 99 % of its water from a
// network under vigilance. Taking the maximum makes the fire pond govern the
// site, and it does so SILENTLY — the figure looks like a reading of the arrêtés.
//
// ADR-003 says to weight by the volume shares instead. That needs a usage vector,
// which most sites do not have yet, so the resolution is a ladder and EVERY RUNG
// IS NAMED in the result:
//
//   1. `vecteur`         — weighted by declared restrictable volume per source.
//   2. `origine_unique`  — one declared origin, so that zone governs. (The
//                          Sprint 21 `levelForOrigin` behaviour.)
//   3. `maximum`         — nothing declared: fall back to the worst level, and
//                          say that it is a fallback, not a reading.
//
// The point is not that rung 3 disappears — with no declaration the conservative
// reading IS the right default. The point is that a caller can no longer confuse
// it with rung 1, because `base` and `degrade` come back with the number.

import { GRAVITE } from "./gravite";
import { weightedLevel } from "./siteProfile";
import type { SavedSite } from "./sites";
import type { NiveauGravite, VigieauZone, ZoneType } from "./types";

export const ZONE_TYPES: ZoneType[] = ["SUP", "SOU", "AEP"];

/** One resource's regulatory situation — the JS vector's unit (§4.1). */
export interface RessourceEtat {
  type: ZoneType;
  /** undefined = no zone of this type covers the point (a fact, not a zero) */
  niveau?: NiveauGravite;
  zoneCode?: string;
  zoneNom?: string;
  /** share of the site's restrictable volume drawn from this resource, 0-1 */
  part?: number;
}

export interface Rattachement {
  /** the JS vector: one entry per zone type, ALWAYS all three, so an absence shows */
  parRessource: RessourceEtat[];
  /**
   * Effective level as a REAL-NUMBERED rank, e.g. 1.15 for 95 % AEP vigilance and
   * 5 % SUP crise. Deliberately not rounded to a named level for computation:
   * rounding to "vigilance" here is what loses the 5 %.
   */
  rangEffectif: number;
  /** nearest named level, for DISPLAY only */
  niveauEffectif?: NiveauGravite;
  base: "vecteur" | "origine_unique" | "maximum" | "aucune";
  /** true when the figure is a fallback rather than a reading of the site's mix */
  degrade: boolean;
  /**
   * ⚠️ ADR-003's `rattachement_ambigu`. True when the point is covered by SEVERAL
   * zones of the SAME type — VigiEau's zone referential overlaps in places — or
   * when a declared source has no zone at all. Never resolved silently: the
   * candidates are listed so a human can decide.
   */
  ambigu: boolean;
  candidats: {
    type: ZoneType;
    zones: { code?: string; nom?: string; niveau?: NiveauGravite }[];
  }[];
  /** why the ambiguity exists, in words, for the interface */
  motifAmbiguite?: string;
  detail: string;
}

// ⚠️ `SourceType` and `ZoneType` are the same three symbols ("SUP" | "SOU" |
// "AEP"), so no mapping is needed — and writing one was a real bug in the first
// version of this module: a table keyed on "reseau" / "superficiel" matched
// nothing, every share came back 0.5 and the weighted rank came out 0. Two
// identical-looking vocabularies with one wrong table is exactly the failure a
// value test catches only if it uses more than one usage.

/**
 * Resolve a site's regulatory attachment.
 *
 * `zones` is VigiEau's answer at the point; `site` carries the usage vector and
 * the declared origin.
 */
export function resolveRattachement(
  zones: VigieauZone[],
  site: Pick<SavedSite, "usages" | "origine">,
): Rattachement {
  // --- The vector, one entry per type, absences included ---------------------
  const byType = new Map<ZoneType, VigieauZone[]>();
  for (const z of zones) {
    const t = z.type as ZoneType;
    if (!ZONE_TYPES.includes(t)) continue;
    byType.set(t, [...(byType.get(t) ?? []), z]);
  }

  // Shares per source, from the usage vector. Reuses weightedLevel's own
  // weighting so the two cannot drift: it is the function that already decided
  // to weight on the RESTRICTABLE volume rather than the total.
  const levels: Partial<Record<ZoneType, NiveauGravite | null | undefined>> = {};
  for (const t of ZONE_TYPES) {
    const zs = byType.get(t);
    if (!zs || zs.length === 0) continue;
    // Several zones of one type: the worst of them governs THAT resource. This is
    // not anti-pattern n°1 — it is a maximum WITHIN one resource, where the site
    // really is subject to both arrêtés on the water it draws from that resource.
    let worst: NiveauGravite | undefined;
    for (const z of zs) {
      const n = z.niveauGravite as NiveauGravite | undefined;
      if (!n || !GRAVITE[n]) continue;
      if (!worst || GRAVITE[n].rank > GRAVITE[worst].rank) worst = n;
    }
    levels[t] = worst;
  }

  const weighted = weightedLevel(levels, site);

  const parRessource: RessourceEtat[] = ZONE_TYPES.map((t) => {
    const zs = byType.get(t) ?? [];
    const niveau = levels[t] ?? undefined;
    const governing = zs.find((z) => z.niveauGravite === niveau) ?? zs[0];
    const part = weighted.parts[t];
    return {
      type: t,
      niveau,
      zoneCode: governing?.code,
      zoneNom: governing?.nom,
      part,
    };
  });

  // --- Ambiguity (ADR-003) ---------------------------------------------------
  const candidats: Rattachement["candidats"] = [];
  const motifs: string[] = [];
  for (const t of ZONE_TYPES) {
    const zs = byType.get(t) ?? [];
    if (zs.length > 1) {
      candidats.push({
        type: t,
        zones: zs.map((z) => ({
          code: z.code,
          nom: z.nom,
          niveau: z.niveauGravite as NiveauGravite | undefined,
        })),
      });
    }
  }
  if (candidats.length > 0) {
    motifs.push(
      `${candidats.length} ressource${candidats.length > 1 ? "s" : ""} ${
        candidats.length > 1 ? "sont couvertes" : "est couverte"
      } par plusieurs zones d'alerte à ce point`,
    );
  }
  // A declared source with NO zone: the site says it draws from a resource the
  // referential does not cover here. That is a gap, not a zero.
  const sansZone = (Object.keys(weighted.parts) as ZoneType[]).filter((t) => !byType.has(t));
  if (sansZone.length > 0) {
    motifs.push(
      `${sansZone.length} source déclarée sans zone d'alerte correspondante à ce point ` +
        `(${sansZone.join(", ")})`,
    );
  }

  // --- Effective level -------------------------------------------------------
  let base: Rattachement["base"] = weighted.base === "aucune" ? "aucune" : weighted.base;
  let rangEffectif = weighted.rank;
  let niveauEffectif = weighted.niveau;
  let degrade = weighted.degrade;

  if (base === "aucune") {
    // Nothing declared. The conservative reading is the maximum — and it is
    // labelled as a fallback so no caller reads it as this site's mix.
    let worst: NiveauGravite | undefined;
    for (const t of ZONE_TYPES) {
      const n = levels[t];
      if (!n) continue;
      if (!worst || GRAVITE[n].rank > GRAVITE[worst].rank) worst = n;
    }
    if (worst) {
      base = "maximum";
      rangEffectif = GRAVITE[worst].rank;
      niveauEffectif = worst;
      degrade = true;
    }
  }

  const detail =
    base === "vecteur"
      ? "Niveau effectif pondéré par les parts volumiques déclarées par ressource (ADR-003)."
      : base === "origine_unique"
        ? "Niveau de la seule ressource déclarée. ⚠️ Pas une pondération : le vecteur d'usages " +
          "n'est pas renseigné, donc une seule ressource porte 100 % du site."
        : base === "maximum"
          ? "⚠️ Aucune ressource déclarée : repli sur le niveau LE PLUS SÉVÈRE des zones couvrantes. " +
            "C'est une lecture prudente, pas une lecture de ce site — un site raccordé au réseau " +
            "hérite ici d'une nappe qu'il ne pompe peut-être pas. Renseigner la répartition par " +
            "usage remplace ce repli par une pondération."
          : "Aucune zone d'alerte lisible à ce point.";

  return {
    parRessource,
    rangEffectif,
    niveauEffectif,
    base,
    degrade,
    ambigu: motifs.length > 0,
    candidats,
    motifAmbiguite: motifs.length > 0 ? `${motifs.join(" ; ")}.` : undefined,
    detail,
  };
}

/**
 * The effective level as a named one, for the callers that need a single symbol
 * (score, badge, map colour).
 *
 * ⚠️ Returns the `degrade` flag alongside on purpose. Every call site that used
 * `maxGravite` had no way to know whether the level it got was a reading or a
 * fallback; this signature makes it impossible not to know.
 */
export function niveauEffectif(
  zones: VigieauZone[],
  site: Pick<SavedSite, "usages" | "origine">,
): { niveau?: NiveauGravite; degrade: boolean; base: Rattachement["base"] } {
  const r = resolveRattachement(zones, site);
  return { niveau: r.niveauEffectif, degrade: r.degrade, base: r.base };
}
