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
  countObjects,
  parseBnpeOuvrages,
  parseUsageByOuvrage,
  parseVolumesOuvrage,
  parseHydroStations,
  parseOndeObservations,
  parsePiezoStations,
  truncatedLabelExpression,
} from "../../lib/carteEau";
import { overlaps, parseBbox } from "../../lib/geoBbox";
import { sparkGeometry } from "../../lib/sparkline";

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
  const out = parseBnpeOuvrages(rows, CENTRE, R).autres;
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
// Drinking-water catchments: the use comes from the CHRONICLES, joined by code
// ---------------------------------------------------------------------------
{
  const chroniques = [
    { code_ouvrage: "OPR_AEP", libelle_usage: "EAU POTABLE", annee: 2019 },
    // Same structure, a later year: the most recent declared use must win.
    { code_ouvrage: "OPR_AEP", libelle_usage: "EAU POTABLE", annee: 2023 },
    { code_ouvrage: "OPR_IND", libelle_usage: "INDUSTRIE et ACTIVITES ECONOMIQUES (hors irrigation, hors énergie)", annee: 2023 },
    // A row without a use teaches nothing and must not create an entry.
    { code_ouvrage: "OPR_VIDE", libelle_usage: null, annee: 2023 },
  ];
  const usage = parseUsageByOuvrage(chroniques);
  check("usage: joins the use by code_ouvrage", usage.get("OPR_AEP") === "EAU POTABLE");
  check("usage: a row without a use creates nothing", !usage.has("OPR_VIDE"));
  check("usage: unknown structures are simply absent", !usage.has("OPR_INCONNU"));

  const ouvrages = [
    { code_ouvrage: "OPR_AEP", nom_ouvrage: "Captage du bourg", longitude: 1.49, latitude: 48.45 },
    { code_ouvrage: "OPR_IND", nom_ouvrage: "Forage usine", longitude: 1.492, latitude: 48.451 },
    // Reached by no chronicle: its use is UNKNOWN, which is not "another use".
    { code_ouvrage: "OPR_INCONNU", nom_ouvrage: "Ouvrage sans chronique", longitude: 1.494, latitude: 48.452 },
  ];
  const { aep, autres } = parseBnpeOuvrages(ouvrages, CENTRE, R, usage);
  check("aep: a drinking-water structure goes to its own layer", aep.length === 1 && aep[0]?.code === "OPR_AEP");
  check("aep: an industrial one does not", autres.some((f) => f.code === "OPR_IND"));
  check(
    "aep: a structure with no known use stays out of the catchments",
    !aep.some((f) => f.code === "OPR_INCONNU") && autres.some((f) => f.code === "OPR_INCONNU"),
  );
  const inconnu = autres.find((f) => f.code === "OPR_INCONNU");
  check(
    "aep: an unknown use reads « non renseigné », never « autre usage »",
    inconnu?.caracteristiques?.some((c) => c.label === "Usage" && c.valeur === "non renseigné") === true,
  );
  check(
    "aep: a known use is surfaced verbatim",
    aep[0]?.caracteristiques?.some((c) => c.label === "Usage" && c.valeur === "EAU POTABLE") === true,
  );

  // Without the chronicles at all, nothing may be claimed to be a catchment.
  const sansUsage = parseBnpeOuvrages(ouvrages, CENTRE, R, undefined);
  check("aep: no chronicles ⇒ no catchment is invented", sansUsage.aep.length === 0);
  check("aep: no chronicles ⇒ every structure is still drawn", sansUsage.autres.length === 3);

  // The split must precede grouping: a catchment and an industrial borehole
  // published at the same commune centroid are two different answers.
  const memeCentroide = [
    { code_ouvrage: "OPR_AEP", nom_ouvrage: "Captage", longitude: 1.49, latitude: 48.45,
      code_precision_coord: "5", libelle_precision_coord: "Coordonnées du centroïde de la commune" },
    { code_ouvrage: "OPR_IND", nom_ouvrage: "Forage", longitude: 1.49, latitude: 48.45,
      code_precision_coord: "5", libelle_precision_coord: "Coordonnées du centroïde de la commune" },
  ];
  const split = parseBnpeOuvrages(memeCentroide, CENTRE, R, usage);
  check(
    "aep: a catchment and a borehole at one centroid are not merged together",
    split.aep.length === 1 && split.autres.length === 1 && !split.aep[0]?.groupe,
  );
}

// ---------------------------------------------------------------------------
// State of an object: last declared volume, and the sparkline geometry
// ---------------------------------------------------------------------------
{
  const chroniques = [
    { annee: 2019, volume: 12000, libelle_usage: "EAU POTABLE" },
    { annee: 2023, volume: 15500, libelle_usage: "EAU POTABLE" },
    { annee: 2021, volume: 9000, libelle_usage: "EAU POTABLE" },
  ];
  const v = parseVolumesOuvrage(chroniques);
  check("volume: the most recent declared year wins", v?.annee === 2023 && v?.volumeM3 === 15500);
  check("volume: the usage travels with it", v?.usage === "EAU POTABLE");

  // A declared zero is not a measured zero, and a negative is nonsense: both
  // are ignored, exactly as lib/bnpe.ts does when aggregating.
  check(
    "volume: a null or negative volume is ignored, not shown as 0 m³",
    parseVolumesOuvrage([{ annee: 2023, volume: 0 }, { annee: 2022, volume: -5 }]) === undefined,
  );
  check(
    "volume: a year with no volume does not beat an older year that has one",
    parseVolumesOuvrage([{ annee: 2023, volume: null }, { annee: 2020, volume: 800 }])?.annee === 2020,
  );
  // No chronicle at all is an ABSENCE. Returning 0 would say "this structure
  // takes nothing", which is a different and unverified claim.
  check("volume: no chronicle means absent, never zero", parseVolumesOuvrage([]) === undefined);

  // Sparkline geometry, shared by the site sheet and the map popups.
  check("sparkline: a single point has no shape", sparkGeometry([{ date: "2026-08-01", value: 3 }]) === undefined);
  check("sparkline: empty series has no shape", sparkGeometry([]) === undefined);
  const flat = sparkGeometry(
    [
      { date: "2026-08-01", value: 5 },
      { date: "2026-08-02", value: 5 },
      { date: "2026-08-03", value: 5 },
    ],
    100,
    40,
  );
  // A flat series must sit mid-height and read as flat — a zero span placed at
  // the top would read as "high".
  check("sparkline: a flat series is drawn flat, mid-height", flat !== undefined && flat.last.y === 20);
  const down = sparkGeometry(
    [
      { date: "2026-08-01", value: 10 },
      { date: "2026-08-02", value: 0 },
    ],
    100,
    40,
  );
  check("sparkline: a falling series ends low on the canvas", down !== undefined && down.last.y > 20);
  const negatifs = sparkGeometry(
    [
      { date: "2026-08-01", value: -5 },
      { date: "2026-08-02", value: -1 },
    ],
    100,
    40,
  );
  check("sparkline: negative values are handled", negatifs !== undefined && Number.isFinite(negatifs.last.y));
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
  // The cap must drop the FARTHEST, so that "we kept the 300 nearest" is a
  // true statement and not a comforting one.
  check(
    "capping drops the farthest, never the nearest",
    capped[capped.length - 1]!.distanceKm <=
      Math.max(...many.map((m) => Math.abs(m.longitude_station - CENTRE.lon))) * 111,
  );
  check("capped output stays sorted by distance",
    capped.every((f, i) => i === 0 || f.distanceKm >= capped[i - 1]!.distanceKm));

  // Co-located objects: the BNPE publishes a share of its structures at the
  // centroid of their commune, so every structure of one commune lands on the
  // same pixel and hides the others. Merged into one counted marker rather
  // than scattered — scattering would draw positions nobody published.
  {
    const sameCommune = [
      { code_ouvrage: "OPR1", nom_ouvrage: "Forage A", longitude: 1.511239, latitude: 48.448061,
        code_precision_coord: "5", libelle_precision_coord: "Coordonnées du centroïde de la commune" },
      { code_ouvrage: "OPR2", nom_ouvrage: "Forage B", longitude: 1.511239, latitude: 48.448061,
        code_precision_coord: "5", libelle_precision_coord: "Coordonnées du centroïde de la commune" },
      { code_ouvrage: "OPR3", nom_ouvrage: "Forage C", longitude: 1.511239, latitude: 48.448061,
        code_precision_coord: "5", libelle_precision_coord: "Coordonnées du centroïde de la commune" },
      // ~50 m away: a genuinely distinct position must stay its own marker.
      { code_ouvrage: "OPR4", nom_ouvrage: "Forage voisin", longitude: 1.511889, latitude: 48.448061 },
    ];
    const out = parseBnpeOuvrages(sameCommune, CENTRE, R).autres;
    check("groups objects sharing one exact position", out.length === 2);
    const grouped = out.find((f) => f.groupe);
    check("the grouped marker counts its members", grouped?.groupe?.total === 3);
    check("the grouped marker lists them", grouped?.groupe?.membres.length === 3);
    check(
      "members keep their own code and label",
      grouped?.groupe?.membres.map((m) => m.code).join(",") === "OPR1,OPR2,OPR3",
    );
    check("a neighbour ~50 m away is NOT merged", out.some((f) => f.code === "OPR4" && !f.groupe));
    check("countObjects counts structures, not markers", countObjects(out) === 4);
  }

  // Grouping must precede the cap: capping first would spend the 300 slots on
  // duplicates of a few communes and drop whole communes that are nearer.
  {
    const crowded = [
      // 400 structures on ONE commune centroid, farther than the rest.
      ...Array.from({ length: 400 }, (_, i) => ({
        code_ouvrage: `DUP${i}`, nom_ouvrage: `Doublon ${i}`,
        longitude: 1.62, latitude: 48.4439,
        code_precision_coord: "5", libelle_precision_coord: "Coordonnées du centroïde de la commune",
      })),
      // one nearer, distinct structure that must survive
      { code_ouvrage: "PROCHE", nom_ouvrage: "Ouvrage proche", longitude: 1.49, latitude: 48.4439 },
    ];
    const out = parseBnpeOuvrages(crowded, CENTRE, R).autres;
    check("400 co-located structures collapse to one marker", out.length === 2);
    check("the nearer distinct structure survives the crowd", out[0]?.code === "PROCHE");
    check("no structure is lost to the cap by grouping first", countObjects(out) === 401);
  }

  // -------------------------------------------------------------------------
  // Viewport filtering (lib/geoBbox), shared by /api/cours-eau, /api/plans-eau
  // and /api/bassins-versants
  // -------------------------------------------------------------------------
  // What these guard is the difference between "nothing in this area" and "the
  // question was malformed". A bbox given corner-first must still describe the
  // area the caller meant; a bbox that cannot be read must yield null, so the
  // route falls back to its national skeleton instead of filtering with garbage
  // and answering an empty map.
  check("bbox: absent parameter yields null", parseBbox(null) === null);
  check("bbox: three numbers yield null", parseBbox("1,2,3") === null);
  check("bbox: a non-number yields null", parseBbox("1,2,banane,4") === null);
  check(
    "bbox: corners given in any order are put back in order",
    JSON.stringify(parseBbox("1.8,48.6,1.2,48.3")) === JSON.stringify([1.2, 48.3, 1.8, 48.6]),
  );

  const BOX = [1.2, 48.3, 1.8, 48.6];
  // A watershed drawn as a ring around the view: none of its own vertices is
  // inside the box, and it must still be kept — it is the basin the reader is
  // standing in.
  const anneau = {
    geometry: {
      coordinates: [[[[1.0, 48.1], [2.0, 48.1], [2.0, 48.8], [1.0, 48.8], [1.0, 48.1]]]],
    },
  };
  check("bbox: a polygon wrapping the whole view is kept", overlaps(anneau, BOX));
  check(
    "bbox: a polygon touching only a corner is kept",
    overlaps(
      { geometry: { coordinates: [[[0.9, 48.0], [1.25, 48.0], [1.25, 48.35], [0.9, 48.35], [0.9, 48.0]]] } },
      BOX,
    ),
  );
  check(
    "bbox: a polygon entirely elsewhere is dropped",
    !overlaps(
      { geometry: { coordinates: [[[5.0, 44.0], [5.2, 44.0], [5.2, 44.2], [5.0, 44.2], [5.0, 44.0]]] } },
      BOX,
    ),
  );
  check(
    "bbox: a feature without geometry is dropped, not crashed on",
    !overlaps({ geometry: null }, BOX),
  );

  // -------------------------------------------------------------------------
  // Map labels: the ellipsis is a statement about the name, not a decoration
  // -------------------------------------------------------------------------
  // ⚠️ What is checked here is the SHAPE of the MapLibre expression, not its
  // rendering — MapLibre evaluates it, and no map runs in this suite. The first
  // version appended « … » unconditionally: measured on the embedded watershed
  // file, 727 of the 6 190 names are 24 characters or fewer and were therefore
  // shown as truncated while being complete.
  {
    const expr = truncatedLabelExpression("nom", 24);
    check("label: guarded by the length of the name", JSON.stringify(expr).includes('["length",["get","nom"]]'));
    check("label: a short name is returned untouched",
      JSON.stringify(expr[3]) === JSON.stringify(["get", "nom"]));
    check("label: a long name is cut at the limit and marked",
      JSON.stringify(expr[2]) === JSON.stringify(["concat", ["slice", ["get", "nom"], 0, 24], "…"]));
    check("label: the limit is the one asked for",
      JSON.stringify(truncatedLabelExpression("nom", 12)[2]) ===
        JSON.stringify(["concat", ["slice", ["get", "nom"], 0, 12], "…"]));
  }

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
