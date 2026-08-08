// A component missing because its SOURCE WAS UNREACHABLE must never read like a
// component missing because the source answered and had nothing. Both drop out
// of the weighted mean the same way — that part is correct and is asserted here
// too — but the wording the user reads, and the confidence detail, must differ.
//
// Runs offline. npx tsx scripts/test/score-indisponible.test.ts

import { computeScore, scoreConfidence } from "../../lib/score";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

const detailOf = (inputs: Parameters<typeof computeScore>[0], id: string) =>
  computeScore(inputs).components.find((c) => c.id === id)?.detail;

// --- Base case: sources answered, they simply have nothing -------------------
const quiet = computeScore({
  worst: "vigilance",
  joursAlertePlus: 10,
  hydro: null,
  piezo: null,
  onde: null,
});
check(
  "silence: hydro reads 'donnée indisponible'",
  detailOf({ hydro: null, piezo: null, onde: null }, "hydro") === "donnée indisponible",
);
check(
  "silence: onde reads as an absent campaign, not a failure",
  detailOf({ hydro: null, piezo: null, onde: null }, "onde") ===
    "pas de campagne Onde récente à proximité",
);

// --- Same inputs, but the sources could not be reached -----------------------
const outage = {
  worst: "vigilance",
  joursAlertePlus: 10,
  hydro: null,
  piezo: null,
  onde: null,
  indisponibles: ["hydro", "piezo", "onde"] as Array<"hydro" | "piezo" | "onde">,
};
const outageScore = computeScore(outage);

for (const id of ["hydro", "piezo", "onde"]) {
  const d = detailOf(outage, id);
  check(`panne: ${id} nomme le service injoignable`, d?.includes("service injoignable") === true);
  check(
    `panne: ${id} refuse explicitement la lecture « pas de risque »`,
    d?.includes("pas « pas de risque »") === true,
  );
}
check(
  "panne: le détail diffère du silence — c'est tout l'objet du correctif",
  detailOf(outage, "hydro") !== detailOf({ hydro: null, piezo: null, onde: null }, "hydro"),
);

// --- The arithmetic must NOT change: unreachable is still "non estimé" --------
check(
  "panne: le score chiffré est identique (aucune composante inventée)",
  outageScore.score === quiet.score,
);
check("panne: la couverture est identique", outageScore.coverage === quiet.coverage);
check(
  "panne: les composantes injoignables restent sans score, jamais 0",
  outageScore.components
    .filter((c) => ["hydro", "piezo", "onde"].includes(c.id))
    .every((c) => c.score === undefined),
);

// --- Confidence must name the outage, at every level --------------------------
const confPanne = scoreConfidence(0.65, 8, 3, ["hydro"]);
check("confiance: la panne est nommée", confPanne.detail.includes("source injoignable"));
check("confiance: la source est nommée en clair", confPanne.detail.includes("débit du cours d'eau"));

// The regression that motivated this: at full marks the detail was a fixed
// reassuring sentence, so the one caveat that mattered was the one hidden.
const confHaute = scoreConfidence(0.98, 5, 2, ["onde"]);
check("confiance haute: le niveau reste haut", confHaute.level === "haute");
check(
  "confiance haute: mais la panne est dite quand même",
  confHaute.detail.includes("source injoignable"),
);
check(
  "confiance haute sans panne: la phrase rassurante d'origine revient",
  scoreConfidence(0.98, 5, 2).detail.startsWith("Bonne couverture"),
);
check(
  "confiance: sans panne, aucune mention de source injoignable",
  !scoreConfidence(0.5, 30).detail.includes("source injoignable"),
);

console.log(failures === 0 ? "score-indisponible: all checks pass" : `score-indisponible: ${failures} FAILED`);
if (failures > 0) process.exit(1);
