// Benchmark: what widening the history window actually costs.
// HISTORY_WINDOW_YEARS=5 npx tsx scripts/test/history-window.bench.ts
//
// The parser expands every arrêté day by day per zone, so the day map grows
// with the window. The master CSV was measured at 12 452 arrêtés spanning
// 2010-2026 (data/restrictions/backlog-probe.json); this reproduces that shape
// so the cost is measured rather than guessed against a 60 s function timeout.

import { aggregateCsv } from "../../lib/history";

const YEARS = [
  [2010, 24], [2011, 785], [2012, 602], [2013, 215], [2014, 168], [2015, 535],
  [2016, 437], [2017, 885], [2018, 579], [2019, 892], [2020, 779], [2021, 488],
  [2022, 1735], [2023, 2022], [2024, 361], [2025, 1114], [2026, 831],
] as const;

const ZONES_PER_ARRETE = 5;
const LEVELS = ["Vigilance", "Alerte", "Alerte renforcée", "Crise"];

const header =
  "id,numero,date_debut,date_signature,date_fin,statut,departement,chemin_fichier," +
  "niveau_gravite_specifique_aep,ressource_aep_communique,regle_gestion," +
  "arrete_cadre.id,arrete_cadre.numero,arrete_cadre.date_debut,arrete_cadre.date_fin," +
  "arrete_cadre.chemin_fichier,zones_alerte.id,zones_alerte.type,zones_alerte.code," +
  "zones_alerte.nom,zones_alerte.niveau_gravite,zones_alerte.id_sandre,zones_alerte.communes";

const rows: string[] = [header];
let id = 0;
let zoneSeed = 0;
for (const [year, count] of YEARS) {
  for (let i = 0; i < count; i++) {
    id++;
    // Arrêtés cluster in the low-water season and typically run 1-4 months.
    const startMonth = 4 + (i % 5);
    const startDay = 1 + (i % 27);
    const lengthDays = 30 + (i % 90);
    const start = new Date(Date.UTC(year, startMonth, startDay));
    const end = new Date(start.getTime() + lengthDays * 86400000);
    const ids: number[] = [];
    const codes: string[] = [];
    const nivs: string[] = [];
    for (let z = 0; z < ZONES_PER_ARRETE; z++) {
      const zn = (zoneSeed++ % 2200) + 1;
      ids.push(zn);
      codes.push(`""76_09_${String(zn).padStart(4, "0")}""`);
      nivs.push(`""${LEVELS[(i + z) % LEVELS.length]}""`);
    }
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    rows.push(
      `${id},A${id},${iso(start)},${iso(start)},${iso(end)},abroge,34,,null,null,undefined,` +
        `,,,,,"[${ids.join(",")}]","[]","[${codes.join(",")}]","[]","[${nivs.join(",")}]",,`,
    );
  }
}
const csv = rows.join("\n");

const windowYears = process.env.HISTORY_WINDOW_YEARS ?? "10 (default)";
const t0 = Date.now();
const agg = aggregateCsv(csv);
const ms = Date.now() - t0;

const zoneCount = Object.keys(agg.zones).length;
const bytes = Buffer.byteLength(csv);
console.log(`window=${windowYears}`);
console.log(`  csv           : ${(bytes / 1e6).toFixed(1)} MB, ${rows.length - 1} arrêtés`);
console.log(`  parse         : ${ms} ms`);
console.log(`  zones         : ${zoneCount}`);
console.log(`  windowYears   : ${agg.diag.windowYears}`);
const sample = agg.zones[Object.keys(agg.zones)[0]];
console.log(`  sample années : ${sample?.anneesCompletes} complètes, moyenne ${sample?.joursAlertePlusMoyen} j/an`);
