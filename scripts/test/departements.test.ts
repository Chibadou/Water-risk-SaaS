// Unit tests for the department code/name helpers (lib/departements).
// npx tsx scripts/test/departements.test.ts

import { departementCode, departementName } from "../../lib/departements";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// Metropolitan: first two digits.
check("Paris 75056 → 75", departementCode("75056") === "75");
check("Chartres 28085 → 28", departementCode("28085") === "28");
// Corsica keeps the letter.
check("Ajaccio 2A004 → 2A", departementCode("2A004") === "2A");
check("Bastia 2B033 → 2B", departementCode("2B033") === "2B");
check("Corsica lowercase 2b033 → 2B", departementCode("2b033") === "2B");
// Overseas: three digits.
check("Guadeloupe 97101 → 971", departementCode("97101") === "971");
check("La Réunion 97411 → 974", departementCode("97411") === "974");
// Missing / malformed input.
check("undefined citycode → undefined", departementCode(undefined) === undefined);
check("empty string → undefined", departementCode("") === undefined);
check("whitespace trimmed", departementCode("  33063 ") === "33");

// Name lookup.
check("75 → Paris", departementName("75") === "Paris");
check("2A → Corse-du-Sud", departementName("2A") === "Corse-du-Sud");
check("971 → Guadeloupe", departementName("971") === "Guadeloupe");
check("unknown code → undefined", departementName("99") === undefined);
check("undefined code → undefined", departementName(undefined) === undefined);

console.log(failures === 0 ? "departements: all checks pass" : `departements: ${failures} FAILED`);
if (failures > 0) process.exit(1);
