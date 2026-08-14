// Tests for lib/bassinVersant.ts — on the REAL national file, offline.
// Run: npx tsx scripts/test/bassinVersant.test.ts
//
// Idiom nº 22: the source is already in the repo. data/refdata/bassins-versants.geojson
// is 6 190 real basins, so nothing here needs a network the sandbox does not
// have. What made-up polygons cannot show, and this can:
//
//   - that the layer really is a PARTITION (no point in two basins at once),
//   - that a real address lands in a plausibly-named basin,
//   - that the sea is answered with "outside the coverage" and not with silence.

import {
  bassinDuPoint,
  BASSIN_MIN_KM2,
  NOM_LONGUEUR_MAX,
  nomTronque,
  type BassinFeature,
} from "../../lib/bassinVersant";
import { contientPoint } from "../../lib/geoPoint";
import { readFileSync } from "node:fs";
import path from "node:path";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

const features = (
  JSON.parse(
    readFileSync(path.join(process.cwd(), "data", "refdata", "bassins-versants.geojson"), "utf-8"),
  ) as { features: BassinFeature[] }
).features;

// Real addresses, spread over contrasted hydrology.
const POINTS = [
  { nom: "Metz", lat: 49.1193, lon: 6.1757 },
  { nom: "Chartres", lat: 48.4469, lon: 1.489 },
  { nom: "Toulouse", lat: 43.6045, lon: 1.444 },
  { nom: "Rennes", lat: 48.1173, lon: -1.6778 },
  { nom: "Orléans", lat: 47.9029, lon: 1.9093 },
  { nom: "Briançon (montagne)", lat: 44.8986, lon: 6.6453 },
] as const;

// One function rather than top-level statements: tsx compiles these scripts to
// CJS, and the grid sweep below is the kind of thing one ends up wanting to
// return early from.
function main() {
  // ---------------------------------------------------------------------------
  // 1. Every real address falls in exactly one named basin
  // ---------------------------------------------------------------------------
  {
    for (const p of POINTS) {
      const dedans = features.filter((f) => contientPoint(f, p.lon, p.lat));
      // ⚠️ THE property of a partition, and the one no synthetic square can test:
      // 6 190 real outlines, sharing thousands of kilometres of divides.
      check(`${p.nom} : exactement un bassin le contient`, dedans.length === 1);
      const props = dedans[0]?.properties;
      check(
        `${p.nom} : le bassin est nommé et porte une surface`,
        typeof props?.nom === "string" && props.nom.length > 0 && (props?.surfaceKm2 ?? 0) > 0,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. The three states, through the public function
  // ---------------------------------------------------------------------------
  {
    const metz = bassinDuPoint(features, 49.1193, 6.1757);
    check("Metz : état trouve", metz.etat === "trouve");
    if (metz.etat === "trouve") {
      console.log(`     → « ${metz.nom} », ${metz.surfaceKm2} km²`);
      check("Metz : la surface est plausible (1-1 400 km²)",
        metz.surfaceKm2 >= 1 && metz.surfaceKm2 <= 1400);
      check("Metz : le détail nomme le bassin", metz.detail.includes(metz.nom));
    }

    // The Mediterranean point of gesture nº 9 — the one that used to fill a whole
    // site sheet with coastal stations.
    const mer = bassinDuPoint(features, 43.0, 5.5);
    check("en mer : hors-couverture, pas trouve", mer.etat === "hors-couverture");
    check(
      "en mer : le texte dit que c'est le référentiel qui s'arrête, pas le bassin",
      mer.etat === "hors-couverture" && /métropolitaine|ultramarin/.test(mer.detail),
    );

    // ⚠️ Guadeloupe: a real place, a real watershed, absent from an FXX layer.
    // It must NOT read as "this point has no watershed".
    const guadeloupe = bassinDuPoint(features, 16.241, -61.533);
    check("Guadeloupe : hors-couverture (couche FXX)", guadeloupe.etat === "hors-couverture");

    const illisible = bassinDuPoint(features, NaN, 6.17);
    check("coordonnées illisibles : indisponible, jamais hors-couverture",
      illisible.etat === "indisponible");
  }

  // ---------------------------------------------------------------------------
  // 3. The floor, and what it is there for
  // ---------------------------------------------------------------------------
  {
    const petits = features.filter((f) => (f.properties?.surfaceKm2 ?? 0) < BASSIN_MIN_KM2);
    const canal = petits.filter((f) => /canal|bief|écluse|dérivation/i.test(f.properties?.nom ?? ""));
    // The measurement the constant is justified by, re-run rather than trusted:
    // if a data refresh changed the mix, the comment in lib/bassinVersant.ts
    // would be stale and this fails.
    check(
      `sous ${BASSIN_MIN_KM2} km², la majorité des polygones sont des biefs de canal ` +
        `(${canal.length}/${petits.length})`,
      petits.length > 0 && canal.length / petits.length > 0.5,
    );
    check("ces polygones restent une petite minorité de la couche",
      petits.length / features.length < 0.05);
  }

  // ---------------------------------------------------------------------------
  // 3 bis. Names cut at the source's ceiling
  // ---------------------------------------------------------------------------
  {
    const longueurs = features.map((f) => (f.properties?.nom ?? "").length);
    const max = Math.max(...longueurs);
    const auPlafond = longueurs.filter((l) => l === max).length;
    // If a refresh lifts the ceiling, NOM_LONGUEUR_MAX is stale and the display
    // would stop marking real cuts — or start marking whole names.
    check(`le plafond du référentiel est bien ${NOM_LONGUEUR_MAX} caractères`,
      max === NOM_LONGUEUR_MAX);
    check(`des noms y sont coupés (${auPlafond} au plafond)`, auPlafond > 0 && auPlafond < 50);
    check("un nom court n'est pas signalé comme coupé", !nomTronque("La Seille"));

    // Metz is one of them — the address the user actually opened.
    const metz = bassinDuPoint(features, 49.1193, 6.1757);
    check("Metz : son nom est coupé, et le détail le signale",
      metz.etat === "trouve" && nomTronque(metz.nom) && metz.detail.includes("[…]"));
  }

  // ---------------------------------------------------------------------------
  // 4. No point belongs to two basins — swept over a grid, not over 6 addresses
  // ---------------------------------------------------------------------------
  {
    let doubles = 0;
    let trouves = 0;
    let testes = 0;
    for (let lat = 43; lat <= 50; lat += 0.5) {
      for (let lon = -2; lon <= 7; lon += 0.5) {
        testes++;
        const n = features.filter((f) => contientPoint(f, lon, lat)).length;
        if (n > 1) doubles++;
        if (n === 1) trouves++;
      }
    }
    console.log(`     grille : ${testes} points, ${trouves} dans un bassin, ${doubles} dans deux`);
    check("aucun point de la grille n'appartient à deux bassins", doubles === 0);
    // Sanity: a grid over metropolitan France must hit land most of the time. A
    // zero here would mean the geometry test silently answers "no" everywhere.
    check("la grille tombe majoritairement sur des bassins", trouves > testes * 0.5);
  }

  console.log(failures === 0 ? "\nAll bassinVersant tests passed." : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
