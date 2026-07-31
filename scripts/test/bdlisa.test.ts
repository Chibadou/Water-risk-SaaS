// Unit tests for the aquifer matching (lib/bdlisa).
// npx tsx scripts/test/bdlisa.test.ts
//
// The property shapes come from a real Sandre WFS response
// (data/refdata/bdlisa-probe.json): CodeEH / LibelleEH / NiveauEH / EtatEH,
// with 4-5 nested entities returned per point.

import {
  parseEntities,
  matchesAquifer,
  rankByAquifer,
  type AquiferEntity,
} from "../../lib/bdlisa";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// A point near Chartres, shaped like the observed response.
const WFS = {
  type: "FeatureCollection",
  features: [
    { properties: { CodeEH: "117AC05", LibelleEH: "Craie du Séno-Turonien", NiveauEH: "2", EtatEH: "Libre" } },
    { properties: { CodeEH: "125AA01", LibelleEH: "Calcaires de Beauce", NiveauEH: "3", EtatEH: "Libre" } },
    { properties: { CodeEH: "119AE15", LibelleEH: "Grand ensemble", NiveauEH: "1" } },
    // Duplicate entity, as the bbox can return the same polygon twice.
    { properties: { CodeEH: "125AA01", LibelleEH: "Calcaires de Beauce", NiveauEH: "3" } },
  ],
};

// ---- 1. Parsing a real-shaped response ----
{
  const e = parseEntities(WFS);
  check("parse: reads every distinct entity", e.length === 3);
  check("parse: deduplicates repeated codes", e.filter((x) => x.code === "125AA01").length === 1);
  check("parse: most specific level first", e[0].code === "125AA01" && e[0].niveau === 3);
  check("parse: keeps the label", e[0].label === "Calcaires de Beauce");
  check("parse: keeps the state when published", e[0].etat === "Libre");
  check("parse: numeric level parsed from a string", typeof e[0].niveau === "number");

  check("parse: empty input yields nothing", parseEntities({}).length === 0);
  check("parse: malformed input yields nothing, not a throw", parseEntities(null).length === 0);
  check("parse: features without a code are skipped",
    parseEntities({ features: [{ properties: { LibelleEH: "x" } }] }).length === 0);
}

// ---- 2. Membership, not selection ----
{
  const site = parseEntities(WFS);
  check("match: a station in any containing entity matches", matchesAquifer(site, "117AC05"));
  check("match: including the deepest one", matchesAquifer(site, "125AA01"));
  check("match: a station in a different aquifer does not", !matchesAquifer(site, "999ZZ99"));
  check("match: case and whitespace tolerated", matchesAquifer(site, " 125aa01 "));
  check("match: unknown station code is not a match", !matchesAquifer(site, undefined));
  check("match: no site aquifers means no match, never a false positive",
    !matchesAquifer(undefined, "125AA01") && !matchesAquifer([], "125AA01"));
}

// ---- 3. Ranking: availability, then aquifer, then distance ----
{
  const site: AquiferEntity[] = [{ code: "125AA01" }];
  const stations = [
    { code: "near-wrong", distanceKm: 2, available: true, aquifer: "999ZZ99" },
    { code: "far-right", distanceKm: 15, available: true, aquifer: "125AA01" },
    { code: "near-unknown", distanceKm: 5, available: true },
    { code: "closest-unavailable", distanceKm: 1, available: false, aquifer: "125AA01" },
  ];
  const ranked = rankByAquifer(stations, site);

  // The whole point: the right aquifer at 15 km beats the wrong one at 2 km.
  check("rank: right aquifer far beats wrong aquifer near", ranked[0].code === "far-right");
  check("rank: unavailable stations sink despite matching and being closest",
    ranked[ranked.length - 1].code === "closest-unavailable");
  // A station with no published aquifer is neither promoted nor punished: it
  // and a known-mismatch are both non-matches, so distance alone separates them.
  const unknownPos = ranked.findIndex((s) => s.code === "near-unknown");
  const wrongPos = ranked.findIndex((s) => s.code === "near-wrong");
  check("rank: unknown aquifer is not promoted over a closer non-match",
    wrongPos < unknownPos);
  check("rank: both non-matches sit behind the aquifer match",
    wrongPos > 0 && unknownPos > 0);
  check("rank: among equals, distance decides",
    rankByAquifer(
      [
        { code: "b", distanceKm: 9, available: true },
        { code: "a", distanceKm: 3, available: true },
      ],
      site,
    )[0].code === "a");

  // Without site aquifers the ordering must degrade to the previous behaviour.
  const noSite = rankByAquifer(stations, undefined);
  check("rank: no site aquifer → pure availability then distance",
    noSite[0].code === "near-wrong" && noSite[noSite.length - 1].code === "closest-unavailable");
  check("rank: input array is not mutated", stations[0].code === "near-wrong");
}

console.log(failures === 0 ? "bdlisa: all checks pass" : `bdlisa: ${failures} FAILED`);
if (failures > 0) process.exit(1);
