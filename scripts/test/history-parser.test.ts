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
check("current year bucket present in parAnnee", zA?.parAnnee?.[String(year)]?.joursAlertePlus === 10);

// 4. Multi-year structural frequency: same zone across several complete years,
//    all inside the 5-year window (a year-4 row makes all 4 complete years
//    covered; year-2 is intentionally absent → counts as 0 in the mean).
const my = [
  header,
  row(10, `${year}-07-01`, `${year}-07-10`, "[201]", '[""76_09_0201""]', '[""Alerte""]'), // current, 10 j (excluded)
  row(11, `${year - 1}-07-01`, `${year - 1}-07-10`, "[201]", '[""76_09_0201""]', '[""Alerte""]'), // 10 j
  row(13, `${year - 3}-07-01`, `${year - 3}-07-20`, "[201]", '[""76_09_0201""]', '[""Crise""]'), // 20 j
  row(14, `${year - 4}-07-01`, `${year - 4}-07-10`, "[201]", '[""76_09_0201""]', '[""Alerte""]'), // 10 j
].join("\n");
const aggMy = aggregateCsv(my);
const z201 = aggMy.zones["76_09_0201"];
// The window is configurable (HISTORY_WINDOW_YEARS); assert against the value
// actually in force so the test tracks the setting instead of pinning it.
const W = aggMy.diag.windowYears ?? 10;
check("window is reported in diag", typeof aggMy.diag.windowYears === "number" && W >= 1);
check("per-year buckets for distinct years (current + 3 prior)", Object.keys(z201?.parAnnee ?? {}).length === 4);
check(`current year (${year}) is 10 days, not in mean`, z201?.joursAlertePlus === 10);
// complete years = year-4..year-1 (4). Days: y-4=10, y-3=20, y-2=0, y-1=10 → 40/4 = 10
// The fixture only carries data for the 5 most recent years, and the file's
// earliest observed year bounds the denominator — so a wider window must not
// invent quiet years before the data starts.
check("complete years bounded by the data, not the window", (z201?.anneesCompletes ?? 0) === 4);
check("structural mean over the 4 complete years = 10", z201?.joursAlertePlusMoyen === 10);

// --- monthly breakdown split by gravity level (additive to parMois) ---
{
  const pmn = z201?.parMoisNiveau;
  check("parMoisNiveau present", pmn !== undefined);
  // year-3 is 20 days of crise, all in July (month index 6).
  check("parMoisNiveau: crise days land in the right month",
    pmn?.[String(year - 3)]?.[6]?.crise === 20);
  check("parMoisNiveau: level is not collapsed into alerte+",
    pmn?.[String(year - 1)]?.[6]?.alerte === 10);
  check("parMoisNiveau: unaffected months absent", pmn?.[String(year - 1)]?.[0] === undefined);
  // parMois must keep its aggregate shape — four consumers depend on it.
  check("parMois still aggregates alerte+ only", z201?.parMois?.[String(year - 3)]?.[6] === 20);
  // Totals must agree between the two views.
  const totalFromLevels = Object.values(pmn?.[String(year - 3)]?.[6] ?? {}).reduce(
    (a, b) => a + (b ?? 0), 0);
  check("parMoisNiveau totals match parMois for that month",
    totalFromLevels === z201?.parMois?.[String(year - 3)]?.[6]);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("history parser: all checks pass");
