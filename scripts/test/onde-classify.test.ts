// Unit test for the Onde flow classifier (lib/onde). Runs offline — no network.
// npx tsx scripts/test/onde-classify.test.ts

import { classifyEcoulement } from "../../lib/onde";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// By label (primary path, robust to code-scheme changes)
check("assec by label", classifyEcoulement("Assec") === "assec");
check("assèchement by label", classifyEcoulement("Assèchement du lit") === "assec");
check("non visible by label", classifyEcoulement("Écoulement non visible") === "nonVisible");
check("pas d'écoulement by label", classifyEcoulement("Pas d'écoulement") === "nonVisible");
check("faible by label", classifyEcoulement("Écoulement visible faible") === "faible");
check("visible by label", classifyEcoulement("Écoulement visible acceptable") === "visible");

// By code (fallback when label missing/unknown)
check("code 3 → assec", classifyEcoulement(undefined, "3") === "assec");
check("code 2 → nonVisible", classifyEcoulement(undefined, "2") === "nonVisible");
check("code 1f → faible", classifyEcoulement(undefined, "1f") === "faible");
check("code 1 → visible", classifyEcoulement(undefined, "1") === "visible");

// Unknown → undefined (renormalized out, never invented)
check("unknown → undefined", classifyEcoulement("", "") === undefined);
check("garbage → undefined", classifyEcoulement("banane", "z") === undefined);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("onde classifier: all checks pass");
