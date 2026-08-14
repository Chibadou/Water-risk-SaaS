// "Which polygon of this layer contains this point?" — a real geometric test,
// on the server, over an embedded reference file.
//
// Why this is NOT in lib/geoBbox.ts, which already walks the same coordinates:
// that module states its own contract in its header — "the test is an overlap of
// BOUNDING BOXES, never a true geometric intersection [...] erring towards
// drawing something is the right way to err". That rule is right for a locator
// map and wrong here. Attributing a site to a watershed is not a drawing
// decision: exactly one answer is correct, and a box around a watershed contains
// a great deal of land that drains somewhere else. Two different questions, two
// modules — the bounding box stays a PREFILTER here, never the answer.
//
// The algorithm is the standard even-odd ray cast (Franklin's pnpoly): count the
// edges a ray to the east crosses; an odd count means inside. It is 15 lines,
// has no dependency, and runs over the whole national layer in a few
// milliseconds once the boxes have done their work.

import { bounds, type BboxFeature } from "./geoBbox";

/** The minimal shape of a GeoJSON feature this module needs. */
export interface PolygonFeature extends BboxFeature {
  geometry?: { type?: string; coordinates?: unknown } | null;
}

type Ring = [number, number][];

/**
 * Even-odd ray casting on a single ring.
 *
 * ⚠️ THE BOUNDARY CONVENTION, and it matters here more than usual. Watersheds
 * TILE the territory: every divide is shared by two basins, so a point landing
 * exactly on an edge is not a curiosity, it is a case that occurs. The test
 * `(yi > y) !== (yj > y)` treats a vertex's lower edge as belonging to the
 * polygon and its upper edge as not — the half-open rule. Two polygons sharing
 * an edge therefore claim the point exactly once between them: no site is
 * attributed to two basins, and none falls through the crack.
 */
function ringContains(ring: Ring, lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * One polygon: its first ring is the outline, every following ring is a HOLE.
 *
 * Holes are not decoration in this layer: an endorheic basin — one draining to a
 * closed depression rather than to the sea — is published as a hole inside the
 * basin that surrounds it. Ignoring inner rings would attribute those sites to
 * the wrong watershed while looking perfectly correct everywhere else.
 */
function polygonContains(rings: Ring[], lon: number, lat: number): boolean {
  if (rings.length === 0 || !ringContains(rings[0]!, lon, lat)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (ringContains(rings[i]!, lon, lat)) return false;
  }
  return true;
}

/**
 * Does this feature's geometry contain the point? `Polygon` and `MultiPolygon`
 * only — a line or a point never "contains" anything, and answering `false` for
 * them is the truthful answer rather than a refusal.
 *
 * The bounding box is tried first: on the national watershed layer (6 190
 * basins) it discards nearly all of them without walking a single edge.
 */
export function contientPoint(f: PolygonFeature, lon: number, lat: number): boolean {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  const coords = f.geometry?.coordinates;
  if (!Array.isArray(coords)) return false;

  const box = [Infinity, Infinity, -Infinity, -Infinity];
  bounds(coords, box);
  if (lon < box[0]! || lon > box[2]! || lat < box[1]! || lat > box[3]!) return false;

  const type = f.geometry?.type;
  if (type === "Polygon") return polygonContains(coords as Ring[], lon, lat);
  if (type === "MultiPolygon") {
    for (const part of coords as Ring[][]) {
      if (polygonContains(part, lon, lat)) return true;
    }
    return false;
  }
  return false;
}

/**
 * The first feature of `features` containing the point, or null.
 *
 * Returning the FIRST rather than the smallest is deliberate and only safe
 * because of the boundary convention above: this layer is a partition, so at
 * most one feature legitimately contains a given point. `/carte`'s click handler
 * makes the opposite choice (smallest wins) for the opposite reason — it works
 * on what is drawn on screen, where several layers overlap by design.
 */
export function featureContenant<T extends PolygonFeature>(
  features: readonly T[],
  lon: number,
  lat: number,
): T | null {
  for (const f of features) if (contientPoint(f, lon, lat)) return f;
  return null;
}
