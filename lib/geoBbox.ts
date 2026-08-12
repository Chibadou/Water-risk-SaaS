// Viewport filtering for the embedded GeoJSON layers of /carte.
//
// Why these live here rather than in each route: three routes now serve a
// national reference file and answer with the part of it that is in view
// (/api/cours-eau, /api/plans-eau, /api/bassins-versants). The first two
// carried a verbatim copy of the same twenty lines; a third copy is how two of
// them start to disagree about what "in view" means.
//
// The rule they share is deliberate and worth stating once: the test is an
// overlap of BOUNDING BOXES, never a true geometric intersection. A river that
// merely passes near the corner of the view is kept, and a watershed whose
// outline wraps around the view is kept too. It is cheap — one pass over the
// coordinates, no geometry library — and on a locator map, erring towards
// drawing something is the right way to err.

/** A box as the routes carry it: [lonMin, latMin, lonMax, latMax]. */
export type Bbox = [number, number, number, number];

/** The minimal shape this module needs of a GeoJSON feature. */
export interface BboxFeature {
  geometry?: { coordinates?: unknown } | null;
}

/**
 * Grow `acc` to contain every coordinate found in `coords`, walking nested
 * arrays of any depth — a Point, a LineString and a MultiPolygon all come
 * through here unchanged.
 */
export function bounds(coords: unknown, acc: number[]): void {
  if (Array.isArray(coords)) {
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lon, lat] = coords as [number, number];
      if (lon < acc[0]!) acc[0] = lon;
      if (lat < acc[1]!) acc[1] = lat;
      if (lon > acc[2]!) acc[2] = lon;
      if (lat > acc[3]!) acc[3] = lat;
      return;
    }
    for (const c of coords) bounds(c, acc);
  }
}

/** Does this feature's bounding box overlap `box`? See the note above. */
export function overlaps(f: BboxFeature, box: number[]): boolean {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  bounds(f.geometry?.coordinates, b);
  return b[0]! <= box[2]! && b[2]! >= box[0]! && b[1]! <= box[3]! && b[3]! >= box[1]!;
}

/**
 * `lonMin,latMin,lonMax,latMax` → a normalised box, or null when the parameter
 * is absent or malformed. Corners given in any order are accepted and put back
 * in order: a caller that hands over a box south-to-north gets the area it
 * meant, not an empty answer that would read as "nothing here".
 */
export function parseBbox(value: string | null): Bbox | null {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lonMin, latMin, lonMax, latMax] = parts as [number, number, number, number];
  return [
    Math.min(lonMin, lonMax),
    Math.min(latMin, latMax),
    Math.max(lonMin, lonMax),
    Math.max(latMin, latMax),
  ];
}
