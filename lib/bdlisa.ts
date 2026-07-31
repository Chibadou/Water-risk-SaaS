// BDLISA — matching a site to the aquifers beneath it.
//
// Piezometers carry `code_bdlisa`, but the site's own aquifer was unknown, so
// stations were attached by distance alone: a piezometer 15 km away in the
// right aquifer is more representative than one 2 km away in a different one.
//
// The recorded blocker was that BDLISA nests entities at several depths, so
// "the aquifer at this point" has no single answer — a point falls inside four
// or five entities at once (measured: 4-5 per test point).
//
// That framing was the problem. Picking one is unnecessary: what the station
// choice needs is whether a piezometer's aquifer is *one of* those beneath the
// site. Set membership answers it exactly and sidesteps the nesting entirely.

export interface AquiferEntity {
  /** BDLISA entity code (CodeEH), the same identifier piezometers carry */
  code: string;
  label?: string;
  /** nesting level: higher is more specific (grands ensembles → entités) */
  niveau?: number;
  /** free/captive, when published */
  etat?: string;
}

interface WfsFeature {
  properties?: Record<string, unknown>;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/**
 * Read the containing hydrogeological entities out of a Sandre WFS response.
 *
 * Ordered most specific first, so a caller that does want a single label has a
 * defensible one to show — but the matching itself never depends on that order.
 */
export function parseEntities(body: unknown): AquiferEntity[] {
  const feats = (body as { features?: WfsFeature[] })?.features;
  if (!Array.isArray(feats)) return [];
  const out: AquiferEntity[] = [];
  const seen = new Set<string>();
  for (const f of feats) {
    const p = f?.properties ?? {};
    const code = str(p.CodeEH) ?? str(p.codeeh) ?? str(p.code_bdlisa);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      label: str(p.LibelleEH) ?? str(p.libelleeh),
      niveau: num(p.NiveauEH) ?? num(p.niveaueh),
      etat: str(p.EtatEH) ?? str(p.etateh),
    });
  }
  out.sort((a, b) => (b.niveau ?? 0) - (a.niveau ?? 0));
  return out;
}

/**
 * Whether a station's aquifer is one of those beneath the site.
 *
 * Codes are compared case-insensitively and trimmed; an unknown station code
 * is not a match, and — importantly — not a mismatch either. The caller must
 * treat "unknown" as "no preference", never as evidence of a different aquifer.
 */
export function matchesAquifer(
  siteAquifers: AquiferEntity[] | undefined,
  stationCode: string | undefined,
): boolean {
  const code = stationCode?.trim().toUpperCase();
  if (!code || !siteAquifers || siteAquifers.length === 0) return false;
  return siteAquifers.some((a) => a.code.trim().toUpperCase() === code);
}

export interface RankableStation {
  code: string;
  distanceKm: number;
  available?: boolean;
  aquifer?: string;
}

/**
 * Order candidate stations by hydrogeological relevance, then distance.
 *
 * Availability still dominates — a representative station with no recent data
 * is useless — and distance remains the tiebreaker. The aquifer only promotes
 * stations that positively match; stations with no published aquifer keep their
 * distance-based position rather than being pushed behind, since a missing code
 * is not evidence against them.
 */
export function rankByAquifer<T extends RankableStation>(
  stations: T[],
  siteAquifers: AquiferEntity[] | undefined,
): T[] {
  return [...stations].sort((a, b) => {
    const aAvail = a.available === false ? 1 : 0;
    const bAvail = b.available === false ? 1 : 0;
    if (aAvail !== bAvail) return aAvail - bAvail;
    const aMatch = matchesAquifer(siteAquifers, a.aquifer) ? 0 : 1;
    const bMatch = matchesAquifer(siteAquifers, b.aquifer) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return a.distanceKm - b.distanceKm;
  });
}

export const BDLISA_NOTE =
  "Un point du territoire relève de plusieurs entités hydrogéologiques emboîtées " +
  "(grands ensembles, systèmes aquifères, entités). L'outil ne choisit donc pas « l' » " +
  "aquifère du site : il retient l'ensemble des entités qui le contiennent et privilégie " +
  "les piézomètres qui appartiennent à l'une d'elles, à disponibilité égale.";
