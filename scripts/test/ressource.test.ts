// Tests for lib/ressource.ts — the renewable-resource estimate per site.
// Run: npx tsx scripts/test/ressource.test.ts
//
// The property that matters most is not an arithmetic one: it is that the module
// REFUSES to answer where it has no business answering — a borehole, a missing
// catchment area, a transposition between incomparable regimes. A resource
// figure that appears everywhere is a resource figure nobody should trust.

import {
  computeRessource,
  classeWri,
  CLASSES_WRI,
  RESSOURCE_RESERVES,
  type RessourceInput,
} from "../../lib/ressource";
import { computeModule } from "../../lib/hubeau";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

/** A well-behaved case: 10 m³/s over 1 000 km², commune of 50 km². */
const base: RessourceInput = {
  moduleM3s: 10,
  anneesModule: 18,
  surfaceBvKm2: 1000,
  surfaceCommuneKm2: 50,
  origine: "superficiel",
};

// ---------------------------------------------------------------------------
// 1. The arithmetic chain
// ---------------------------------------------------------------------------
{
  const r = computeRessource(base);
  check("available on a well-formed input", r.available && r.applicable);
  // 10 m³/s = 10 000 l/s over 1 000 km² → 10 l/s/km²
  check("specific discharge = module ÷ catchment", r.debitSpecifiqueLsKm2 === 10);
  // 10 l/s/km² × 50 km² = 0,5 m³/s → × seconds/year
  const attendu = 0.5 * SECONDS_PER_YEAR;
  check("resource = specific discharge × commune area",
    Math.abs((r.ressourceCommuneM3An ?? 0) - attendu) < 1);

  // THE proportionality that is the whole model: twice the area, twice the water.
  const double = computeRessource({ ...base, surfaceCommuneKm2: 100 });
  check("doubling the commune doubles the resource",
    Math.abs((double.ressourceCommuneM3An ?? 0) - 2 * (r.ressourceCommuneM3An ?? 0)) < 1);
  // ...and the same catchment twice as large halves the specific discharge.
  const grand = computeRessource({ ...base, surfaceBvKm2: 2000 });
  check("doubling the catchment halves the specific discharge",
    grand.debitSpecifiqueLsKm2 === 5);

  check("the chain is exposed step by step", r.etapes.length >= 5);
  check("each step carries a value", r.etapes.every((e) => e.valeur.length > 0));
}

// ---------------------------------------------------------------------------
// 2. Two denominators, two questions — the correction this sprint exists for
// ---------------------------------------------------------------------------
// Chartres, from the real replay (Sprint 27, run 29): module 3,13 m³/s over a
// 756 km² catchment, commune of ~17 km², ~0,82 Mm³ withdrawn. The SAME inputs
// give a pressure under 1 % and an autonomy near 37 %. One number could never
// have carried both, and the old model reported only the second — under the
// first one's name, on the first one's scale.
{
  const chartres: RessourceInput = {
    moduleM3s: 3.13,
    anneesModule: 8,
    surfaceBvKm2: 756,
    surfaceCommuneKm2: 16.85,
    prelevementsCommuneM3: 818_000,
    origine: "superficiel",
  };
  const r = computeRessource(chartres);

  const dispo = 3.13 * SECONDS_PER_YEAR; // ≈ 98,7 Mm³/an
  check("available flow = module × seconds per year",
    Math.abs((r.debitDisponibleM3An ?? 0) - dispo) < 1);
  check("pressure = withdrawals ÷ available flow",
    Math.abs((r.pressionCoursEau ?? 0) - 818_000 / dispo) < 1e-9);
  check("Chartres: pressure under 1 %, classed 'faible'",
    (r.pressionCoursEau ?? 1) < 0.01 && r.classePression?.id === "faible");
  check("Chartres: autonomy near 37 %",
    Math.abs((r.autonomieTerritoire ?? 0) - 0.37) < 0.02);
  check("the two ratios differ by orders of magnitude — the whole point",
    (r.autonomieTerritoire ?? 0) / (r.pressionCoursEau ?? 1) > 30);
  check("both are reported side by side",
    r.pressionCoursEau !== undefined && r.autonomieTerritoire !== undefined);
}

// THE regression guard: the WRI scale belongs to the pressure alone. Grading
// autonomy on it is exactly what made Toulouse read as a catastrophe.
{
  // Toulouse: 62,1 Mm³ withdrawn, module 2,63 m³/s on the Hers, 118 km² commune.
  const toulouse = computeRessource({
    moduleM3s: 2.63, anneesModule: 17, surfaceBvKm2: 768,
    surfaceCommuneKm2: 118.06, prelevementsCommuneM3: 62_100_000,
    origine: "superficiel",
  });
  check("Toulouse: autonomy above 1 flags upstream dependency",
    (toulouse.autonomieTerritoire ?? 0) > 1 && toulouse.dependanceAmont === true);
  check("Toulouse: autonomy carries NO WRI class of its own",
    !("classeAutonomie" in toulouse));
  check("Toulouse: the pressure is computed separately and IS classed",
    toulouse.pressionCoursEau !== undefined && toulouse.classePression !== undefined);
  check("Toulouse: the caveat explains the dependency",
    toulouse.reserves.includes(RESSOURCE_RESERVES.dependanceAmont));

  // Below 1 nothing special happens — the flag is a reading, not a mode.
  const sous = computeRessource({
    moduleM3s: 10, anneesModule: 18, surfaceBvKm2: 1000,
    surfaceCommuneKm2: 50, prelevementsCommuneM3: 0.5 * SECONDS_PER_YEAR * 0.99,
    origine: "superficiel",
  });
  check("autonomy just under 1 raises no dependency flag",
    sous.dependanceAmont === undefined &&
      !sous.reserves.includes(RESSOURCE_RESERVES.dependanceAmont));
}

// The WRI scale itself, on the ratio it belongs to.
{
  check("just under 10 % is 'faible'", classeWri(0.0999).id === "faible");
  check("exactly 10 % tips into 'modéré'", classeWri(0.1).id === "modere");
  check("exactly 20 % tips into 'élevé'", classeWri(0.2).id === "eleve");
  check("exactly 40 % tips into 'très élevé'", classeWri(0.4).id === "tres_eleve");
  check("exactly 80 % tips into 'extrême'", classeWri(0.8).id === "extreme");
  check("the scale is exhaustive", CLASSES_WRI[CLASSES_WRI.length - 1].max === Infinity);

  const sans = computeRessource(base);
  check("no withdrawals → neither ratio is invented",
    sans.pressionCoursEau === undefined && sans.autonomieTerritoire === undefined &&
      sans.classePression === undefined);
}

// ---------------------------------------------------------------------------
// 2 bis. Coverage: the pressure needs only a module
// ---------------------------------------------------------------------------
// `surface_bv` is missing on 55 % of the network (measured, Sprint 27) and used
// to make the WHOLE panel fail. It now costs only the local-production branch.
{
  const sansBv = computeRessource({
    moduleM3s: 3.13, anneesModule: 18, prelevementsCommuneM3: 818_000,
    origine: "superficiel",
  });
  check("no catchment area → the pressure is still produced",
    sansBv.available && sansBv.pressionCoursEau !== undefined);
  check("...and the local-production branch is simply absent",
    sansBv.debitSpecifiqueLsKm2 === undefined &&
      sansBv.ressourceCommuneM3An === undefined &&
      sansBv.autonomieTerritoire === undefined);

  const sansCommune = computeRessource({
    moduleM3s: 3.13, anneesModule: 18, surfaceBvKm2: 756,
    prelevementsCommuneM3: 818_000, origine: "superficiel",
  });
  check("no commune area → pressure and specific discharge survive",
    sansCommune.pressionCoursEau !== undefined &&
      sansCommune.debitSpecifiqueLsKm2 !== undefined &&
      sansCommune.autonomieTerritoire === undefined);
}

// ---------------------------------------------------------------------------
// 3. The site's own share
// ---------------------------------------------------------------------------
// Expressed against the flow actually available — the direct answer to "how much
// of the water that is there do I take". It therefore survives a missing
// catchment area, like the pressure it shares a denominator with.
{
  const dispo = 10 * SECONDS_PER_YEAR;
  const r = computeRessource({ ...base, volumeSiteM3: 1_000_000 });
  check("site share = declared volume ÷ available flow",
    Math.abs((r.partSite ?? 0) - 1_000_000 / dispo) < 1e-12);
  const minuscule = computeRessource({ ...base, volumeSiteM3: 100 });
  check("a genuinely tiny share is rendered as '< 0,1 %' rather than rounded to 0",
    minuscule.etapes.some((e) => e.valeur === "< 0,1 %"));
  const sans = computeRessource(base);
  check("no declared volume → no share, not a share of 0", sans.partSite === undefined);
  check("the share does not need a catchment area either",
    computeRessource({ moduleM3s: 10, anneesModule: 18, volumeSiteM3: 1_000_000 }).partSite !== undefined);
}

// ---------------------------------------------------------------------------
// 4. Where the model must REFUSE to answer
// ---------------------------------------------------------------------------
{
  // A borehole: a river gauge does not measure the aquifer it draws from.
  const nappe = computeRessource({ ...base, origine: "souterrain" });
  check("a borehole gets no surface figure at all",
    !nappe.available && !nappe.applicable && nappe.ressourceCommuneM3An === undefined);
  check("and it is told why, including that no national dataset exists",
    (nappe.message ?? "").includes("aucun jeu national"));
  check("it is pointed at the piezometric index instead",
    (nappe.message ?? "").includes("piézométrique"));

  // Too short a record: the one hard prerequisite left.
  const sansModule = computeRessource({ ...base, moduleM3s: undefined });
  check("no module → nothing at all, it is the only hard prerequisite",
    !sansModule.available && sansModule.debitDisponibleM3An === undefined);

  // Incomparable regimes: the Loire (36 970 km²) against a 28 km² commune —
  // the real Orléans case from the replay. The refusal is now SCOPED: it kills
  // the transposition, not the pressure, which never used it.
  const orleans = computeRessource({
    moduleM3s: 278.4, anneesModule: 16, surfaceBvKm2: 36970,
    surfaceCommuneKm2: 27.5, prelevementsCommuneM3: 5_000_000,
    origine: "superficiel",
  });
  check("Orléans: an absurd area ratio kills the local production",
    orleans.ressourceCommuneM3An === undefined && orleans.autonomieTerritoire === undefined);
  check("...but the pressure on the watercourse stands",
    orleans.available && orleans.pressionCoursEau !== undefined);
  check("...and the specific discharge, which IS valid, is still returned",
    (orleans.debitSpecifiqueLsKm2 ?? 0) > 0);
  const fr = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  check("the refusal names both areas, as a caveat rather than a dead end",
    orleans.reserves.some((c) => c.includes(fr(36970)) && c.includes(fr(28))));
}

// ---------------------------------------------------------------------------
// 5. The caveats travel with the figure — always
// ---------------------------------------------------------------------------
{
  const r = computeRessource({ ...base, prelevementsCommuneM3: 1e6, anneesModule: 18 });
  check("the 'not a right to withdraw' caveat is always present",
    r.reserves.includes(RESSOURCE_RESERVES.pasUnDroit));
  check("the pressure always warns the station may not be the source",
    r.reserves.includes(RESSOURCE_RESERVES.stationPasSource));
  check("the transposition caveat rides with the local-production branch",
    r.reserves.includes(RESSOURCE_RESERVES.transposition));
  check("...and is absent when that branch was not computed",
    !computeRessource({ moduleM3s: 10, anneesModule: 18, prelevementsCommuneM3: 1e6 })
      .reserves.includes(RESSOURCE_RESERVES.transposition));
  check("a short module is flagged as biasing the ratios",
    computeRessource({ ...base, anneesModule: 12, prelevementsCommuneM3: 1e6 })
      .reserves.includes(RESSOURCE_RESERVES.moduleCourt));

  const influence = computeRessource({ ...base, influenceCode: 3 });
  check("a non-zero influence code raises a caveat",
    influence.reserves.includes(RESSOURCE_RESERVES.influence));
  check("a zero influence code raises none",
    !computeRessource({ ...base, influenceCode: 0 }).reserves.includes(RESSOURCE_RESERVES.influence));
  check("the influence code never moves a number",
    influence.debitDisponibleM3An === computeRessource({ ...base, influenceCode: 0 }).debitDisponibleM3An);

  const aep = computeRessource({ ...base, origine: "aep" });
  check("a mains-fed site is told the figure describes its territory, not its supply",
    aep.reserves.some((c) => c.includes("réseau d'eau potable")));
}

// ---------------------------------------------------------------------------
// 6. Confidence degrades on distance, record length and area ratio
// ---------------------------------------------------------------------------
{
  check("a nearby station with a long record is high confidence",
    computeRessource({ ...base, distanceStationKm: 5 }).confiance === "haute");
  check("a distant station degrades it",
    computeRessource({ ...base, distanceStationKm: 40 }).confiance === "moyenne");
  check("a very distant one degrades it further",
    computeRessource({ ...base, distanceStationKm: 60 }).confiance === "faible");
  check("a short record degrades it",
    computeRessource({ ...base, anneesModule: 7 }).confiance === "faible");
  check("a stretched but admissible ratio degrades it",
    computeRessource({ ...base, surfaceBvKm2: 4000, surfaceCommuneKm2: 50 }).confiance === "moyenne");
}

// ---------------------------------------------------------------------------
// 7. computeModule — the input the whole chain rests on
// ---------------------------------------------------------------------------
{
  const serie = (annees: number[], parJour: number, jours = 365) =>
    annees.flatMap((y) =>
      Array.from({ length: jours }, (_, i) => {
        const d = new Date(Date.UTC(y, 0, 1 + i));
        return { date: d.toISOString().slice(0, 10), value: parJour };
      }),
    );

  const m = computeModule(serie([2010, 2011, 2012, 2013, 2014, 2015], 12));
  check("module of a constant series is that constant", m?.moduleM3s === 12);
  check("and it reports the years it averaged", m?.annees === 6);

  check("too few years → no module, rather than a fragile one",
    computeModule(serie([2010, 2011], 12)) === undefined);

  // The guard that matters: partial years must not drag the mean toward low water.
  const complet = serie([2010, 2011, 2012, 2013, 2014, 2015], 12);
  const partiel = [...complet, ...serie([2016], 1, 90)];
  check("a 90-day year is excluded rather than pulling the module down",
    computeModule(partiel)?.moduleM3s === 12 && computeModule(partiel)?.annees === 6);

  check("an empty series yields nothing", computeModule([]) === undefined);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("ressource: all checks pass");
