// Regression tests for lib/history.ts aggregateCsv against the real
// data.gouv CSV schemas (fixtures captured 2026-07-20 by the prod-diag
// workflow). Run: npm i --no-save tsx && npx tsx scripts/test/history-parser.test.ts
//
// Guards the 2026-07 fix: the "Arrêtés Cadre" file has no gravity column and
// must be rejected; the master "Arrêtés" file encodes zones as parallel JSON
// arrays per row and must be exploded, keyed by both code and numeric id,
// clamped to the current year.

import { readFileSync } from "node:fs";
import path from "node:path";
import { aggregateCsv } from "../../lib/history";

const fixtures = path.join(import.meta.dirname, "fixtures");
const read = (f: string) => readFileSync(path.join(fixtures, f), "utf-8");
let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// 1. "Arrêtés Cadre" (no gravity column): must be rejected, never aggregated.
const cadre = aggregateCsv(read("arretes-cadre.head.csv"));
check("cadre file rejected as unparseable", cadre.diag.source === "unparseable");

// 2. Master "Arrêtés" head (old rows only): schema recognized, right columns.
const head = aggregateCsv(read("arretes-master.head.csv"));
check("master niveau column is zones_alerte.niveau_gravite (not …_specifique_aep)",
  head.diag.columns?.niveau === "zones_alerte.niveau_gravite");
check("master code column is zones_alerte.code", head.diag.columns?.code === "zones_alerte.code");
check("out-of-year rows clamped out", (head.diag.parsedCount ?? 0) === 0);

// 3. Synthetic current-year rows in the master schema: exact day counts.
const year = new Date().getUTCFullYear();
const header = read("arretes-master.head.csv").split("\n")[0];
const row = (id: number, debut: string, fin: string, zoneIds: string, codes: string, niveaux: string) =>
  `${id},AR-${id},${debut},${debut},${fin},abroge,09,,null,null,undefined,,,,,,"${zoneIds}","[""SUP""]","${codes}","[""Zone""]","${niveaux}","[null]","[]"`;
const fixture = [
  header,
  row(1, `${year}-07-01`, `${year}-07-10`, "[101,102]", '[""76_09_0001"",""76_09_0002""]', '[""Alerte"",""Crise""]'),
  row(2, `${year}-07-05`, `${year}-07-08`, "[101]", '[""76_09_0001""]', '[""Alerte renforcée""]'),
  // Garbage year present in the real file: must not blow up the day loop.
  row(3, "0022-07-26", "2022-07-22", "[103]", '[""76_09_0003""]', '[""Crise""]'),
].join("\n");
const agg = aggregateCsv(fixture);
const zA = agg.zones["76_09_0001"];
const zB = agg.zones["76_09_0002"];
check("array cells detected", agg.diag.arrayCells === true);
check("zone A: 10 days alerte+ total", zA?.joursAlertePlus === 10);
check("zone A: overlap deduped at worst level (6 alerte / 4 renforcée)",
  (zA?.joursParNiveau.alerte ?? 0) === 6 && (zA?.joursParNiveau.alerte_renforcee ?? 0) === 4);
check("zone B: 10 days crise", zB?.joursParNiveau.crise === 10);
check("numeric id key mirrors code key", JSON.stringify(agg.zones["101"]) === JSON.stringify(zA));
check("garbage-date zone clamped out", agg.zones["76_09_0003"] === undefined);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("history parser: all checks pass");
