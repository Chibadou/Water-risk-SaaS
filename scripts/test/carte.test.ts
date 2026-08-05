// Unit tests for the map layer parsers (lib/carteEau). Offline — no network.
// npx tsx scripts/test/carte.test.ts
//
// What these guard, beyond field mapping: the rules that keep a locator map
// honest. A row without coordinates must vanish, not land at 0/0; the radius is
// a disc, not the bbox square the API answers with; an unreadable ONDE label
// yields no severity rather than the colour of a healthy stream.

import {
  DEFAULT_RADIUS_KM,
  MAX_FEATURES_PER_LAYER,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  clampRadiusKm,
  parseBnpeOuvrages,
  parseHydroStations,
  parseOndeObservations,
  parsePiezoStations,
} from "../../lib/carteEau";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// Chartres, the reference point of the other diagnostics.
const CENTRE = { lat: 48.4439, lon: 1.489 };
const R = 30;

// ---------------------------------------------------------------------------
// Hydrometry
// ---------------------------------------------------------------------------
{
  const rows = [
    {
      code_station: "H1122001",
      libelle_station: "L'Eure à Chartres",
      libelle_cours_eau: "L'Eure",
      longitude_station: 1.49,
      latitude_station: 48.45,
      en_service: true,
    },
    // Decommissioned: a gauge that no longer reports must not be drawn.
    {
      code_station: "H0000000",
      libelle_station: "Station fermée",
      longitude_station: 1.5,
      latitude_station: 48.44,
      en_service: false,
    },
    // No coordinates at all.
    { code_station: "H9999999", libelle_station: "Sans position", en_service: true },
    // Far away: inside a wide bbox, outside the requested disc.
    {
      code_station: "H5555555",
      libelle_station: "Loin",
      longitude_station: 2.9,
      latitude_station: 48.45,
      en_service: true,
    },
  ];
  const out = parseHydroStations(rows, CENTRE, R);
  check("hydro: keeps the in-service station in range", out.length === 1);
  check("hydro: maps code and label", out[0]?.code === "H1122001" && out[0]?.label === "L'Eure à Chartres");
  check("hydro: carries the river name as detail", out[0]?.detail === "L'Eure");
  check("hydro: distance is rounded to 0.1 km", out[0]?.distanceKm !== undefined && out[0].distanceKm < 1);
  check("hydro: drops en_service=false", !out.some((f) => f.code === "H0000000"));
  check("hydro: drops rows without coordinates", !out.some((f) => f.code === "H9999999"));
  check("hydro: drops points beyond the radius", !out.some((f) => f.code === "H5555555"));
}

// ---------------------------------------------------------------------------
// Piezometry — the referential has no longitude/latitude columns (Sprint 9).
// ---------------------------------------------------------------------------
{
  const rows = [
    {
      code_bss: "BSS000AAAA",
      libelle_pe: "Piézo geometry",
      geometry: { type: "Point", coordinates: [1.5, 48.45] },
      codes_bdlisa: ["121AB01"],
    },
    // No geometry: the x/y fallback is the only way this one appears.
    { code_bss: "BSS000BBBB", libelle_pe: "Piézo x/y", x: 1.48, y: 48.44 },
    // Empty geometry AND no x/y — the shape format=json actually returns when
    // a station is unpositioned. Must be dropped, not placed at 0/0.
    { code_bss: "BSS000CCCC", libelle_pe: "Piézo sans position", geometry: {} },
    // Stopped reporting years ago: a past site, not a live one.
    {
      code_bss: "BSS000DDDD",
      libelle_pe: "Piézo arrêté",
      x: 1.49,
      y: 48.45,
      date_fin_mesure: "2011-06-30",
    },
  ];
  const out = parsePiezoStations(rows, CENTRE, R);
  check("piezo: reads geometry.coordinates", out.some((f) => f.code === "BSS000AAAA"));
  check("piezo: falls back to x/y", out.some((f) => f.code === "BSS000BBBB"));
  check("piezo: drops unpositioned stations", !out.some((f) => f.code === "BSS000CCCC"));
  check("piezo: drops long-dead stations", !out.some((f) => f.code === "BSS000DDDD"));
  check(
    "piezo: surfaces the BDLISA aquifer code",
    out.find((f) => f.code === "BSS000AAAA")?.detail === "Aquifère BDLISA 121AB01",
  );
  check("piezo: closest first", (out[0]?.distanceKm ?? 9) <= (out[1]?.distanceKm ?? 9));
}

// ---------------------------------------------------------------------------
// ONDE — one point per station, the most recent observation
// ---------------------------------------------------------------------------
{
  const rows = [
    {
      code_station: "O0001",
      libelle_station: "Ruisseau amont",
      libelle_ecoulement: "Assec",
      code_ecoulement: "3",
      date_observation: "2026-07-15",
      longitude: 1.5,
      latitude: 48.45,
    },
    // Same station, older campaign: must lose to the July observation.
    {
      code_station: "O0001",
      libelle_station: "Ruisseau amont",
      libelle_ecoulement: "Écoulement visible acceptable",
      code_ecoulement: "1",
      date_observation: "2026-05-12",
      longitude: 1.5,
      latitude: 48.45,
    },
    // Unreadable class: no severity rather than the colour of a healthy stream.
    {
      code_station: "O0002",
      libelle_station: "Ruisseau inconnu",
      libelle_ecoulement: "",
      code_ecoulement: "",
      date_observation: "2026-07-15",
      longitude: 1.48,
      latitude: 48.44,
    },
  ];
  const out = parseOndeObservations(rows, CENTRE, R);
  check("onde: one feature per station", out.length === 2);
  const o1 = out.find((f) => f.code === "O0001");
  check("onde: keeps the most recent observation", o1?.severity === 100);
  check("onde: detail carries label and date", (o1?.detail ?? "").includes("2026-07-15"));
  check(
    "onde: unreadable class has NO severity (never 0 by default)",
    out.find((f) => f.code === "O0002")?.severity === undefined,
  );
}

// ---------------------------------------------------------------------------
// BNPE — withdrawal structures
// ---------------------------------------------------------------------------
{
  const rows = [
    {
      code_ouvrage: "OPR0000000001",
      nom_ouvrage: "Forage usine",
      longitude: 1.5,
      latitude: 48.45,
      libelle_type_milieu: "Souterrain",
      code_precision_coord: "1",
      libelle_precision_coord: "Coordonnées relevées sur le terrain",
    },
    // Real shape from the referential (verified on Chartres): the position is
    // the COMMUNE CENTROID. Kept — hiding a declared withdrawal would be worse
    // — but flagged, so the map never passes a town square off as a borehole.
    {
      code_ouvrage: "OPR0000033771",
      nom_ouvrage: "COM AGGLO Chartres  riv.Eure",
      longitude: 1.511239269062763,
      latitude: 48.44806142625342,
      libelle_type_milieu: "Surface continental",
      code_precision_coord: "5",
      libelle_precision_coord: "Coordonnées du centroïde de la commune",
    },
    // Coordinates only in a geometry object.
    {
      code_ouvrage: "OPR0000000002",
      nom_ouvrage: "Prise d'eau",
      geometry: { type: "Point", coordinates: [1.48, 48.44] },
    },
    // No coordinates: dropped rather than pinned on a commune centroid, which
    // would be an invented borehole.
    { code_ouvrage: "OPR0000000003", nom_ouvrage: "Ouvrage non positionné" },
  ];
  const out = parseBnpeOuvrages(rows, CENTRE, R);
  check("bnpe: maps a positioned ouvrage", out.some((f) => f.code === "OPR0000000001"));
  check("bnpe: reads geometry when longitude is absent", out.some((f) => f.code === "OPR0000000002"));
  check("bnpe: never invents a position", !out.some((f) => f.code === "OPR0000000003"));
  const surveyed = out.find((f) => f.code === "OPR0000000001");
  const centroid = out.find((f) => f.code === "OPR0000033771");
  check("bnpe: detail carries the milieu", surveyed?.detail === "Souterrain");
  check("bnpe: a surveyed position is not flagged", surveyed?.approximate === undefined);
  check("bnpe: a commune centroid IS flagged", centroid?.approximate === true);
  check(
    "bnpe: the popup says the position is approximate",
    (centroid?.detail ?? "").includes("position approchée"),
  );
}

// ---------------------------------------------------------------------------
// Shared rules
// ---------------------------------------------------------------------------
{
  // Duplicates: referentials page and can repeat a code. The map must not stack
  // two markers on one station.
  const dup = [
    { code_station: "H1", libelle_station: "A", longitude_station: 1.49, latitude_station: 48.45 },
    { code_station: "H1", libelle_station: "A", longitude_station: 1.49, latitude_station: 48.45 },
  ];
  check("dedupes on code", parseHydroStations(dup, CENTRE, R).length === 1);

  // Cap: a dense area must not ship thousands of markers to the browser.
  const many = Array.from({ length: MAX_FEATURES_PER_LAYER + 50 }, (_, i) => ({
    code_station: `H${i}`,
    libelle_station: `S${i}`,
    longitude_station: 1.489 + i * 0.0005,
    latitude_station: 48.4439,
  }));
  const capped = parseHydroStations(many, CENTRE, R);
  check("caps the number of features per layer", capped.length === MAX_FEATURES_PER_LAYER);
  check("keeps the closest ones when capping", capped[0]?.code === "H0");

  check("radius: default when absent", clampRadiusKm(undefined) === DEFAULT_RADIUS_KM);
  check("radius: default when not a number", clampRadiusKm("banane") === DEFAULT_RADIUS_KM);
  check("radius: floored at the minimum", clampRadiusKm(1) === MIN_RADIUS_KM);
  check("radius: capped at the maximum", clampRadiusKm(4000) === MAX_RADIUS_KM);
  check("radius: honours a value in range", clampRadiusKm("45") === 45);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("carte layers: all checks pass");
