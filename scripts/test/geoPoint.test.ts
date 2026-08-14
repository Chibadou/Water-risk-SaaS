// Tests for lib/geoPoint.ts — "which polygon contains this point?".
// Run: npx tsx scripts/test/geoPoint.test.ts
//
// The property that matters is not "does the square work". It is that two
// polygons SHARING AN EDGE claim a point on that edge exactly once between them.
// Watersheds tile the territory, so every site near a divide depends on it, and
// a naive test gets it wrong in one of two ways that are both invisible on a
// square: attributing the site to both basins, or to neither.

import { contientPoint, featureContenant, type PolygonFeature } from "../../lib/geoPoint";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

/** A closed ring, counter-clockwise, from a box. */
const carre = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

const poly = (rings: [number, number][][]): PolygonFeature => ({
  geometry: { type: "Polygon", coordinates: rings },
});

// ---------------------------------------------------------------------------
// 1. The plain cases
// ---------------------------------------------------------------------------
{
  const f = poly([carre(0, 0, 10, 10)]);
  check("a point inside is inside", contientPoint(f, 5, 5));
  check("a point outside is outside", !contientPoint(f, 15, 5));
  check("a point far above is outside", !contientPoint(f, 5, 99));
  // The bounding-box prefilter must not become the answer: this point IS in the
  // box of the L below, and outside the polygon.
  const L = poly([
    [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
      [0, 0],
    ],
  ]);
  check("in the box but outside the shape", !contientPoint(L, 8, 8));
  check("in the box and inside the shape", contientPoint(L, 2, 8));
}

// ---------------------------------------------------------------------------
// 2. Holes — an endorheic basin is published as a hole
// ---------------------------------------------------------------------------
{
  const troue = poly([carre(0, 0, 10, 10), carre(4, 4, 6, 6)]);
  check("inside the outline, outside the hole", contientPoint(troue, 1, 1));
  check("inside the hole is NOT inside", !contientPoint(troue, 5, 5));
}

// ---------------------------------------------------------------------------
// 3. MultiPolygon — a basin split by an island or a braided outlet
// ---------------------------------------------------------------------------
{
  const multi: PolygonFeature = {
    geometry: {
      type: "MultiPolygon",
      coordinates: [[carre(0, 0, 2, 2)], [carre(8, 8, 10, 10)]],
    },
  };
  check("first part of a MultiPolygon", contientPoint(multi, 1, 1));
  check("second part of a MultiPolygon", contientPoint(multi, 9, 9));
  check("between the two parts is outside", !contientPoint(multi, 5, 5));
}

// ---------------------------------------------------------------------------
// 4. ⚠️ THE ONE THAT MATTERS — a shared divide
// ---------------------------------------------------------------------------
{
  // Two basins meeting on x = 10, the way BD Topage publishes adjacent basins.
  const ouest = { id: "ouest", ...poly([carre(0, 0, 10, 10)]) };
  const est = { id: "est", ...poly([carre(10, 0, 20, 10)]) };
  const deux = [ouest, est];

  for (const lat of [0, 1, 5, 9.999]) {
    const dedans = deux.filter((f) => contientPoint(f, 10, lat));
    check(
      `a point on the shared divide (lat ${lat}) belongs to exactly one basin`,
      dedans.length === 1,
    );
  }

  // The same rule read from the other end: no gap either. A point just inside
  // each side is claimed by that side alone.
  check("just west of the divide → ouest", featureContenant(deux, 9.999, 5)?.id === "ouest");
  check("just east of the divide → est", featureContenant(deux, 10.001, 5)?.id === "est");
  check("nothing contains a point outside both", featureContenant(deux, 50, 5) === null);
}

// ---------------------------------------------------------------------------
// 5. Refusals, said rather than crashed
// ---------------------------------------------------------------------------
{
  check("NaN coordinates are outside", !contientPoint(poly([carre(0, 0, 10, 10)]), NaN, 5));
  check("a missing geometry is outside", !contientPoint({ geometry: null }, 5, 5));
  check(
    "a LineString contains nothing",
    !contientPoint(
      { geometry: { type: "LineString", coordinates: carre(0, 0, 10, 10) } },
      5,
      5,
    ),
  );
  check("an empty list contains nothing", featureContenant([], 5, 5) === null);
}

console.log(failures === 0 ? "\nAll geoPoint tests passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
