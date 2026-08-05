// Replays the resource model on REAL stations captured by the Actions
// diagnostic (mode `app`), across contrasted basins.
//
// Why this is not optional: unlike the arrêtés, which are read, the resource is
// MODELLED. Unit tests prove the arithmetic on made-up numbers; only real
// stations can show whether the chain produces plausible French hydrology —
// a specific discharge of 300 l/s/km² or of 0,2 would both pass every unit test
// and both be wrong.
//
//   1. push data/diag-request.json with {"mode":"app"} and a bumped run
//   2. wait for the runner to commit data/diag/
//   3. npx tsx scripts/diag/replay-ressource.ts
//   4. purge data/diag/
//
// Run: npx tsx scripts/diag/replay-ressource.ts

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { computeRessource } from "../../lib/ressource";

const DIAG = path.join(process.cwd(), "data", "diag");
const read = <T,>(name: string): T | undefined => {
  const f = path.join(DIAG, name);
  if (!existsSync(f)) return undefined;
  try {
    return JSON.parse(readFileSync(f, "utf-8")) as T;
  } catch {
    return undefined;
  }
};

interface HydroPayload {
  selected?: {
    station?: { code?: string; label?: string; distanceKm?: number };
    ressource?: {
      moduleM3s: number;
      anneesModule: number;
      surfaceBvKm2?: number;
      influenceCode?: number | null;
    };
  };
}

const SITES = [
  { id: "orleans", label: "Orléans (Loire / Beauce)" },
  { id: "chartres", label: "Chartres (Beauce)" },
  { id: "toulouse", label: "Toulouse (Adour-Garonne)" },
  { id: "rennes", label: "Rennes (Bretagne)" },
] as const;

let problems = 0;
const fail = (msg: string) => {
  console.error(`  ✗ ${msg}`);
  problems++;
};

console.log("== Modèle de ressource rejoué sur stations réelles ==\n");

let joues = 0;
let avecSurface = 0;

for (const site of SITES) {
  const hydro = read<HydroPayload>(`rs_hydro_${site.id}.json`);
  const bnpe = read<{ available?: boolean; totalM3?: number; surfaceKm2?: number }>(
    `rs_bnpe_${site.id}.json`,
  );
  const r = hydro?.selected?.ressource;

  console.log(`${site.label}`);
  if (!hydro?.selected) {
    console.log("  (aucune station rattachée dans le diag)\n");
    continue;
  }
  joues++;
  console.log(`  station        : ${hydro.selected.station?.label ?? "?"} (${hydro.selected.station?.distanceKm ?? "?"} km)`);
  if (!r) {
    console.log("  ressource      : absente — chronique trop courte pour un module\n");
    continue;
  }
  console.log(`  module         : ${r.moduleM3s.toFixed(2)} m³/s sur ${r.anneesModule} ans`);
  console.log(`  surface_bv     : ${r.surfaceBvKm2 ?? "NON RENSEIGNÉE"} km²`);
  if (r.surfaceBvKm2) avecSurface++;

  const res = computeRessource({
    moduleM3s: r.moduleM3s,
    anneesModule: r.anneesModule,
    surfaceBvKm2: r.surfaceBvKm2,
    influenceCode: r.influenceCode,
    surfaceCommuneKm2: bnpe?.surfaceKm2,
    prelevementsCommuneM3: bnpe?.totalM3,
    origine: "superficiel",
    distanceStationKm: hydro.selected.station?.distanceKm,
  });

  if (!res.available) {
    console.log(`  → non estimé   : ${res.message}\n`);
    continue;
  }
  console.log(`  débit disponible : ${((res.debitDisponibleM3An ?? 0) / 1e6).toFixed(1)} Mm³/an`);
  if (res.pressionCoursEau !== undefined) {
    console.log(`  PRESSION       : ${(res.pressionCoursEau * 100).toFixed(2)} % (${res.classePression?.label})`);
  }
  if (res.debitSpecifiqueLsKm2 !== undefined) {
    console.log(`  débit spécif.  : ${res.debitSpecifiqueLsKm2.toFixed(2)} l/s/km²`);
  }
  if (res.ressourceCommuneM3An !== undefined) {
    console.log(`  production loc.: ${(res.ressourceCommuneM3An / 1e6).toFixed(2)} Mm³/an`);
  }
  if (res.autonomieTerritoire !== undefined) {
    console.log(`  autonomie      : ${res.dependanceAmont
      ? `× ${res.autonomieTerritoire.toFixed(1)} (dépendance amont)`
      : `${(res.autonomieTerritoire * 100).toFixed(1)} %`}`);
  }
  console.log(`  confiance      : ${res.confiance}`);

  // --- Plausibility, the part unit tests cannot do -------------------------
  // Metropolitan France runs roughly 1 to 60 l/s/km² of mean specific
  // discharge: single digits on lowland plains, tens in the Alps and on the
  // Atlantic edge. Outside that band, something in the chain is wrong — a unit
  // error, a bad join, a flow read in l/s instead of m³/s.
  const q = res.debitSpecifiqueLsKm2;
  if (q !== undefined && (q < 1 || q > 60)) {
    fail(`${site.label} : débit spécifique ${q.toFixed(2)} l/s/km² hors de la plage française plausible (1-60)`);
  }
  // The invariant that would betray swapped denominators: a commune's own area
  // is a fraction of the catchment feeding it, so the pressure on the
  // watercourse must be SMALLER than the autonomy ratio. The reverse would mean
  // the two divisions were exchanged.
  if (res.pressionCoursEau !== undefined && res.autonomieTerritoire !== undefined
      && res.pressionCoursEau > res.autonomieTerritoire) {
    fail(`${site.label} : pression (${(res.pressionCoursEau * 100).toFixed(1)} %) > autonomie ` +
      `(${(res.autonomieTerritoire * 100).toFixed(1)} %) — dénominateurs probablement inversés`);
  }
  // A ratio above ~20 would no longer be geography but a unit error.
  if ((res.autonomieTerritoire ?? 0) > 20) {
    fail(`${site.label} : autonomie ${(res.autonomieTerritoire ?? 0).toFixed(0)} × — invraisemblable même pour une ville de grand fleuve, vérifier les unités`);
  }
  if (res.reserves.length === 0) {
    fail(`${site.label} : aucune réserve affichée alors qu'un chiffre est produit`);
  }
  console.log();
}

console.log("== Couverture ==");
console.log(`  sites avec station rattachée : ${joues}/${SITES.length}`);
console.log(`  dont surface_bv renseignée   : ${avecSurface}/${joues}`);
if (joues > 0 && avecSurface === 0) {
  fail("aucune station rattachée ne porte de surface de bassin — le modèle serait muet partout");
}

if (problems > 0) {
  console.error(`\n${problems} incohérence(s) sur données réelles.`);
  process.exit(1);
}
console.log("\n✓ Rejeu réel plausible — penser à purger data/diag/.");
