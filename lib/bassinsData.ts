// The national watershed layer, read once and shared.
//
// Two routes need it and they need it differently: /api/bassins-versants serves
// the outlines in view to /carte, /api/bassin-versant answers "which one holds
// this point" for `lib/ressource.ts`. Each carrying its own reader would mean
// the same 4,35 MB parsed twice and held in memory twice, in a runtime where
// both routes live in the same process.
//
// ⚠️ Server-side only: it reads from disk. Anything the browser needs of this
// layer goes through one of the two routes.
//
// ⚠️ Every route importing this must list the data file in next.config.ts under
// outputFileTracingIncludes, or it 503s in production while working perfectly
// in dev.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { BassinFeature } from "./bassinVersant";

const FICHIER = path.join(process.cwd(), "data", "refdata", "bassins-versants.geojson");

let cache: BassinFeature[] | null | undefined;

/**
 * The 6 190 basins, or `null` when the file could not be read.
 *
 * `null` is a state the callers must carry through, not swallow: a missing
 * referential is an outage, and answering "no basin here" instead would turn it
 * into a claim about the territory.
 */
export async function chargerBassins(): Promise<BassinFeature[] | null> {
  if (cache !== undefined) return cache;
  try {
    const raw = await fs.readFile(FICHIER, "utf-8");
    const parsed = JSON.parse(raw) as { features?: BassinFeature[] };
    cache = Array.isArray(parsed.features) ? parsed.features : [];
  } catch {
    cache = null;
  }
  return cache;
}
