// Unit tests for the transition-risk context (lib/transition).
// npx tsx scripts/test/transition.test.ts

import { PLAN_EAU, ZRE_EXPLAINER, sectorTransition } from "../../lib/transition";
import { SECTEURS } from "../../lib/secteur";
import { BASSINS, BASSINS_OUTRE_MER, bassinInfo, estOutreMer } from "../../lib/bassins";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// Every sector (including "particulier") has a non-empty transition note.
for (const s of SECTEURS) {
  const note = sectorTransition(s.id);
  check(`${s.id} has a transition note`, typeof note === "string" && note.length > 20);
}
// Falls back gracefully for undefined.
check("undefined sector → generic note", sectorTransition(undefined).length > 20);

// Plan Eau context is well-formed.
check("Plan Eau has a title", PLAN_EAU.title.includes("Plan Eau"));
check("Plan Eau has a summary", PLAN_EAU.summary.length > 40);
check("Plan Eau lists measures", Array.isArray(PLAN_EAU.measures) && PLAN_EAU.measures.length >= 3);
check("Plan Eau mentions the -10% target", PLAN_EAU.measures.some((m) => m.includes("10")));

// ZRE explainer names the regulatory consequence.
check("ZRE explainer mentions prélèvements", ZRE_EXPLAINER.includes("prélèvements"));
check("ZRE explainer is substantial", ZRE_EXPLAINER.length > 100);

// --- basin → agence de l'eau ---
{
  check("bassin: H is Seine-Normandie", bassinInfo("H")!.agence.includes("Seine-Normandie"));
  check("bassin: three codes share Rhin-Meuse",
    ["B1", "B2", "C"].every((c) => bassinInfo(c)?.agence.includes("Rhin-Meuse") === true));
  check("bassin: Corsica maps to the Rhône Méditerranée Corse agency",
    bassinInfo("E")?.agence.includes("Corse") === true);
  check("bassin: lookup trims and is case-insensitive", bassinInfo(" h ")?.code === "H");
  check("bassin: unknown code yields nothing, not a default agency",
    bassinInfo("Z") === undefined && bassinInfo(undefined) === undefined);
  check("bassin: every basin carries an agency and an https URL",
    Object.values(BASSINS).every((b) => b.agence.length > 0 && b.url.startsWith("https://")));
  // The nine DCE codes the Sandre layer actually returned must all resolve.
  check("bassin: all nine observed DCE codes resolve",
    ["A", "B1", "B2", "C", "D", "E", "F", "G", "H"].every((c) => bassinInfo(c) !== undefined));
  // Every district carries a short name: the map draws it, and the published
  // name wraps over five lines and covers the basin it labels.
  check("bassin: every basin has a short name, and a short one",
    Object.values(BASSINS).every((b) => b.nomCourt.length > 0 && b.nomCourt.length <= 20));

  // ⚠️ The map popup says « les bassins d'outre-mer relèvent d'un office de
  // l'eau départemental » when it can name no agency. That is true of the five
  // overseas districts of the referential and MUST NOT be said of anything
  // else — a tenth metropolitan code published by Sandre would otherwise be
  // announced, confidently, as overseas.
  check("bassin: the five overseas districts are recognised as such",
    ["I", "J", "K", "L", "M"].every((c) => estOutreMer(c)));
  check("bassin: overseas and metropolitan districts do not overlap",
    Object.keys(BASSINS).every((c) => !estOutreMer(c)));
  check("bassin: an unknown code is not declared overseas",
    !estOutreMer("Z") && !estOutreMer("") && !estOutreMer(undefined));
  check("bassin: the fourteen published districts are all accounted for",
    Object.keys(BASSINS).length + BASSINS_OUTRE_MER.size === 14);
}

console.log(failures === 0 ? "transition: all checks pass" : `transition: ${failures} FAILED`);
if (failures > 0) process.exit(1);
