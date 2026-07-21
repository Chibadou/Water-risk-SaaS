// Unit tests for the sector ↔ VigiEau profil mapping (lib/secteur).
// npx tsx scripts/test/secteur.test.ts

import {
  DEFAULT_SECTEUR,
  SECTEURS,
  profilForSecteur,
  secteurForProfil,
  sectorImpact,
} from "../../lib/secteur";
import type { Secteur } from "../../lib/sites";
import type { Profil } from "../../lib/types";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// Every sector maps to a valid VigiEau profil.
const validProfils: Profil[] = ["particulier", "entreprise", "collectivite", "exploitation"];
for (const s of SECTEURS) {
  check(`${s.id} → valid VigiEau profil`, validProfils.includes(profilForSecteur(s.id)));
}

// Specific mappings that matter.
check("agriculture → exploitation", profilForSecteur("agriculture") === "exploitation");
check("collectivite → collectivite", profilForSecteur("collectivite") === "collectivite");
check("industrie → entreprise", profilForSecteur("industrie") === "entreprise");
check("energie → entreprise", profilForSecteur("energie") === "entreprise");
check("services → entreprise", profilForSecteur("services") === "entreprise");
check("autre → entreprise", profilForSecteur("autre") === "entreprise");

// Reverse inference (legacy profil → sector) is total and sensible.
check("exploitation → agriculture", secteurForProfil("exploitation") === "agriculture");
check("collectivite → collectivite", secteurForProfil("collectivite") === "collectivite");
check("entreprise → autre", secteurForProfil("entreprise") === "autre");
check("particulier → autre (dropped profil)", secteurForProfil("particulier") === "autre");
check("undefined profil → default sector", secteurForProfil(undefined) === DEFAULT_SECTEUR);

// Round-trip: a sector's profil infers back to a sector with the same profil
// (mapping need not be identity, but must be profil-consistent).
for (const s of SECTEURS) {
  const roundProfil = profilForSecteur(secteurForProfil(profilForSecteur(s.id)));
  check(`${s.id} round-trip keeps profil`, roundProfil === profilForSecteur(s.id));
}

// Default sector is a real sector with an impact table.
check("DEFAULT_SECTEUR is a known sector", SECTEURS.some((s) => s.id === DEFAULT_SECTEUR));
check("default sector has an impact for 'crise'", sectorImpact(DEFAULT_SECTEUR as Secteur, "crise") !== undefined);

console.log(failures === 0 ? "secteur: all checks pass" : `secteur: ${failures} FAILED`);
if (failures > 0) process.exit(1);
