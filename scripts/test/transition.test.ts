// Unit tests for the transition-risk context (lib/transition).
// npx tsx scripts/test/transition.test.ts

import { PLAN_EAU, ZRE_EXPLAINER, sectorTransition } from "../../lib/transition";
import { SECTEURS } from "../../lib/secteur";

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

console.log(failures === 0 ? "transition: all checks pass" : `transition: ${failures} FAILED`);
if (failures > 0) process.exit(1);
