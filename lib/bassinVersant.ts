// Which watershed does this point sit in?
//
// The question `lib/ressource.ts` has been unable to ask since Sprint 27. It
// transposes a specific discharge onto the COMMUNE — an administrative outline
// with no hydrological meaning — and says so in its own caveat: "neither
// coincides with the site's real watershed". The data lock was lifted in Sprint
// 52: data/refdata/bassins-versants.geojson carries the 6 190 topographic basins
// of BD Topage, all named, with their area.
//
// ⚠️ WHAT ONE OF THESE BASINS ACTUALLY IS, measured on the file rather than
// assumed — and it changes how the figure must be worded. 54 % of the names are
// of the form "L'Arrats du confluent du Campunau au confluent de la Garonne":
// these are INTER-CONFLUENCE units, the land draining directly into one stretch
// of river, not everything upstream of it. The largest is 1 333 km², where the
// Loire's true catchment is 117 000 — so the layer is elementary units
// throughout. That is the right denominator for "what does this territory
// produce" and the wrong one for "how much water flows past", which is what the
// module already answers. Both questions stay separate, as they have since
// Sprint 28.
//
// ⚠️ The area in the file is the TRUE one: fetch_bassins_versants.py computes it
// in Lambert-93 BEFORE simplification, so the 200 m tolerance degrades the
// outline drawn on the map, never a figure that enters a calculation.
//
// Pure on purpose — no filesystem, no fetch. Reading the national file is
// `lib/bassinsData.ts`, so this module (and its constants) can be imported from
// anywhere, including code that also runs in the browser.

import { featureContenant } from "./geoPoint";

export interface BassinFeature {
  type?: "Feature";
  properties?: { nom?: string; code?: string; surfaceKm2?: number };
  geometry?: { type?: string; coordinates?: unknown } | null;
}

/**
 * Three states, never two — the shape `lib/juridiction.ts` settled on in Sprint
 * 54, for the same reason: "no basin here" and "the referential did not answer"
 * are different facts, and collapsing them is how an outage becomes a claim.
 */
export type BassinVersant =
  | { etat: "trouve"; nom: string; code?: string; surfaceKm2: number; detail: string }
  | { etat: "hors-couverture"; detail: string }
  | { etat: "indisponible"; detail: string };

/**
 * Area below which the polygon is reported but NEVER transposed on.
 *
 * A convention, and stated as one — but backed by a measurement on the embedded
 * file rather than a feeling. BD Topage's layer is not only made of catchments:
 * it also publishes CANAL REACHES as polygons ("Canal de Saint-Quentin de
 * l'écluse numéro 11 Tordoir à l'écluse numéro 10 Vinchy", 0,0 km²). Counted:
 *
 *   < 1 km²      93 basins, 70 % named after a canal, a bief or a lock
 *   1-5 km²     101 basins, 18 %
 *   > 20 km²  5 542 basins,  4 %
 *
 * Below 1 km² the polygon is a navigation corridor far more often than a
 * watershed, and multiplying a specific discharge by its area would produce a
 * "local production" describing a stretch of canal. The name is shown either
 * way, which is the real safeguard: a reader seeing "de l'écluse numéro 11 à
 * l'écluse numéro 10" needs no threshold to know what happened.
 */
export const BASSIN_MIN_KM2 = 1;

/**
 * The source's name field stops at 120 characters, and 10 of the 6 190 names hit
 * that ceiling — including the one covering Metz, which ends "(cf défin".
 *
 * Measured, not guessed: no name in the file is longer, and exactly ten are that
 * long. Displaying such a name as-is makes a correct referential look like a
 * broken one, so callers mark it. What is NOT done here is repairing it: the
 * missing words are not in the file, and inventing an ending would be worse than
 * showing a cut.
 */
export const NOM_LONGUEUR_MAX = 120;

export function nomTronque(nom: string): boolean {
  return nom.length >= NOM_LONGUEUR_MAX;
}

/**
 * The basin containing (lat, lon), or why there is none.
 *
 * Takes the features rather than loading them: the caller owns the cache, and a
 * test can run this against the real 6 190 without a server.
 */
export function bassinDuPoint(
  features: readonly BassinFeature[],
  lat: number,
  lon: number,
): BassinVersant {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      etat: "indisponible",
      detail:
        "Coordonnées illisibles : le bassin versant de ce point n'a pas pu être cherché. " +
        "⚠️ Ce n'est PAS « ce point n'a pas de bassin versant ».",
    };
  }

  const f = featureContenant(features, lon, lat);
  if (!f) {
    // ⚠️ NOT "this point has no watershed" — every point on land has one. The
    // layer is `..._FXX_...`: metropolitan France only. Saying "no basin" to a
    // site in Guadeloupe would be the Sprint 54 sea-point mistake in reverse:
    // presenting the limits of a referential as a property of the territory.
    return {
      etat: "hors-couverture",
      detail:
        "Aucun bassin versant du référentiel ne contient ce point. Le jeu embarqué (BD Topage) " +
        "couvre la France métropolitaine : ce point est en mer, hors frontière, ou dans un " +
        "territoire ultramarin — ce n'est pas un point sans bassin versant.",
    };
  }

  const nom = f.properties?.nom;
  const surfaceKm2 = f.properties?.surfaceKm2;
  if (!nom || typeof surfaceKm2 !== "number" || !Number.isFinite(surfaceKm2)) {
    // Measured: 0 of the 6 190 features are unnamed and all carry an area. The
    // branch exists so a future refresh that drops a column fails loudly here
    // rather than producing a resource figure out of `undefined`.
    return {
      etat: "indisponible",
      detail:
        "Un bassin versant contient ce point mais le référentiel n'en donne ni le nom ni la " +
        "surface : rien n'en est déduit.",
    };
  }

  return {
    etat: "trouve",
    nom,
    code: f.properties?.code,
    surfaceKm2,
    detail:
      `Ce point est dans le bassin versant « ${nom}${nomTronque(nom) ? " […]" : ""} » ` +
      `(${surfaceKm2.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km²).`,
  };
}
