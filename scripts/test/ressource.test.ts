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
// 2. Exploitation rate and the WRI scale
// ---------------------------------------------------------------------------
{
  const ressource = 0.5 * SECONDS_PER_YEAR; // ≈ 15,8 Mm³/an
  const r = computeRessource({ ...base, prelevementsCommuneM3: ressource * 0.25 });
  check("exploitation rate = withdrawals ÷ resource",
    Math.abs((r.tauxExploitation ?? 0) - 0.25) < 1e-6);
  check("0,25 falls in the WRI 'élevé' class", r.classe?.id === "eleve");

  // Exact boundaries — an off-by-one here misclassifies a real site.
  check("just under 10 % is 'faible'", classeWri(0.0999).id === "faible");
  check("exactly 10 % tips into 'modéré'", classeWri(0.1).id === "modere");
  check("exactly 20 % tips into 'élevé'", classeWri(0.2).id === "eleve");
  check("exactly 40 % tips into 'très élevé'", classeWri(0.4).id === "tres_eleve");
  check("exactly 80 % tips into 'extrême'", classeWri(0.8).id === "extreme");
  check("above 100 % stays 'extrême'", classeWri(3).id === "extreme");
  check("the scale is exhaustive", CLASSES_WRI[CLASSES_WRI.length - 1].max === Infinity);

  // No withdrawals known → no rate invented.
  const sans = computeRessource(base);
  check("no withdrawals → no exploitation rate, not a rate of 0",
    sans.tauxExploitation === undefined && sans.classe === undefined);
}

// ---------------------------------------------------------------------------
// 2b. Above 100 %: a different reading, not a worse grade
// ---------------------------------------------------------------------------
// Found on real data (Toulouse, run 29): 62 Mm³ withdrawn against ~13 Mm³
// produced locally. The city drinks Pyrenean water carried by the Garonne. That
// is a structural dependency, not an over-use — and grading it "extrême" on the
// WRI scale would announce a catastrophe where the truth is ordinary geography.
{
  const ressource = 0.5 * SECONDS_PER_YEAR;
  const amont = computeRessource({ ...base, prelevementsCommuneM3: ressource * 4.9 });
  check("above 100 % the upstream dependency is flagged", amont.dependanceAmont === true);
  check("and NO WRI class is applied", amont.classe === undefined);
  check("the ratio itself is still reported", Math.abs((amont.tauxExploitation ?? 0) - 4.9) < 1e-6);
  check("the step reads as a multiple, not a percentage",
    amont.etapes.some((e) => e.valeur.includes("×")));
  check("and the caveat explains it is not a WRI extreme",
    amont.reserves.includes(RESSOURCE_RESERVES.dependanceAmont));

  // Just under and just over the boundary must behave differently in kind.
  const sous = computeRessource({ ...base, prelevementsCommuneM3: ressource * 0.99 });
  check("just under 100 % keeps the WRI class",
    sous.classe?.id === "extreme" && sous.dependanceAmont === undefined);
  check("and does not raise the upstream caveat",
    !sous.reserves.includes(RESSOURCE_RESERVES.dependanceAmont));
}

// ---------------------------------------------------------------------------
// 3. The site's own share
// ---------------------------------------------------------------------------
{
  const r = computeRessource({ ...base, volumeSiteM3: 100_000 });
  check("site share = declared volume ÷ resource",
    Math.abs((r.partSite ?? 0) - 100_000 / (0.5 * SECONDS_PER_YEAR)) < 1e-9);
  // 100 000 m³ against ~15,8 Mm³ is 0,63 % — not tiny. A genuinely small site
  // is the case the rendering guard exists for.
  const minuscule = computeRessource({ ...base, volumeSiteM3: 500 });
  check("a genuinely tiny share is rendered as '< 0,1 %' rather than rounded to 0",
    minuscule.etapes.some((e) => e.valeur === "< 0,1 %"));
  check("a percent-scale share is rendered as a number", 
    r.etapes.some((e) => e.label === "Part de votre site" && e.valeur.includes("0,63")));
  const sans = computeRessource(base);
  check("no declared volume → no share, not a share of 0", sans.partSite === undefined);
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

  // Missing catchment area — measured at >50 % of the national network.
  const sansBv = computeRessource({ ...base, surfaceBvKm2: undefined });
  check("no catchment area → no figure", !sansBv.available);
  check("and the message says how common that is",
    (sansBv.message ?? "").includes("plus de la moitié"));

  // Too short a record.
  const sansModule = computeRessource({ ...base, moduleM3s: undefined });
  check("no module → no figure", !sansModule.available);

  // Incomparable regimes: the Loire (40 500 km²) against a 20 km² commune.
  const loire = computeRessource({
    ...base, moduleM3s: 350, surfaceBvKm2: 40500, surfaceCommuneKm2: 20,
  });
  check("an absurd area ratio refuses rather than producing a number",
    !loire.available && loire.ressourceCommuneM3An === undefined);
  check("but the specific discharge, which IS valid, is still returned",
    (loire.debitSpecifiqueLsKm2 ?? 0) > 0);
  // fr-FR groups thousands with a narrow no-break space; a literal " " here
  // would fail for the wrong reason.
  const fr = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  check("and the refusal names the two areas",
    (loire.message ?? "").includes(fr(40500)) && (loire.message ?? "").includes(fr(20)));

  // Unknown commune area: partial answer, not a zero.
  const sansCommune = computeRessource({ ...base, surfaceCommuneKm2: undefined });
  check("unknown commune area → no resource, but no zero either",
    !sansCommune.available && sansCommune.ressourceCommuneM3An === undefined);
  check("the specific discharge survives it", sansCommune.debitSpecifiqueLsKm2 === 10);
}

// ---------------------------------------------------------------------------
// 5. The caveats travel with the figure — always
// ---------------------------------------------------------------------------
{
  const r = computeRessource({ ...base, prelevementsCommuneM3: 1e6, anneesModule: 18 });
  check("the 'not a right to withdraw' caveat is always present",
    r.reserves.includes(RESSOURCE_RESERVES.pasUnDroit));
  check("the transposition caveat is always present",
    r.reserves.includes(RESSOURCE_RESERVES.transposition));
  check("the commune≠basin caveat appears once withdrawals are used",
    r.reserves.includes(RESSOURCE_RESERVES.communeVsBassin));
  check("a short module is flagged as biasing the rate upward",
    r.reserves.includes(RESSOURCE_RESERVES.moduleCourt));

  // The influence code is surfaced, never weighted — its Sandre scale is unread.
  const influence = computeRessource({ ...base, influenceCode: 3 });
  check("a non-zero influence code raises a caveat",
    influence.reserves.includes(RESSOURCE_RESERVES.influence));
  const sansInfluence = computeRessource({ ...base, influenceCode: 0 });
  check("a zero influence code raises none",
    !sansInfluence.reserves.includes(RESSOURCE_RESERVES.influence));
  check("an unknown influence changes nothing",
    !computeRessource({ ...base, influenceCode: null }).reserves.includes(RESSOURCE_RESERVES.influence));
  // Whatever the code, the numbers are identical: it is never computed with.
  check("the influence code never moves a number",
    influence.ressourceCommuneM3An === sansInfluence.ressourceCommuneM3An);

  // A mains-fed site gets the territorial reading, explicitly labelled as such.
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
