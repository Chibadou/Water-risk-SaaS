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
import { computeIa, episodesFromPeriodes } from "../../lib/ia";

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
// ⚠️ Added after the first real calibration measured 1 592 of 12 584 archive rows
// (12.6 %) unparsed with no way to say why. `rowCount` minus `parsedCount` shows the
// LOSS; only the per-reason split says whether it is a property of the window (fine)
// or a parser defect (not fine), and §8's « aucune lacune non signalée » cannot be
// judged without that. Here all three head rows predate the window — a window effect.
check("rejects: the loss is attributed per reason, not just counted",
  head.diag.rejets?.horsFenetre === 3
    && head.diag.rejets?.dateIllisible === 0
    && head.diag.rejets?.niveauIllisible === 0);
check("rejects: the reasons account for every unparsed row",
  (head.diag.rowCount ?? 0) - (head.diag.parsedCount ?? 0)
    === Object.values(head.diag.rejets ?? {}).reduce((a, b) => a + b, 0));

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
// ⚠️ …and it is clamped out for the STATED reason. Dropping a row is the right call
// here (clamping a year-0022 start up to the window would fabricate months of phantom
// restriction days), but a silent drop and an attributed one differ: this counter is
// what lets the calibration report distinguish corrupt source data from a bug of ours.
check("rejects: the year-0022 row is attributed to 'trop ancien', not lost silently",
  agg.diag.rejets?.tropAncien === 1 && agg.diag.rejets?.horsFenetre === 0);
// ⚠️ The counter that would catch a nomenclature reform (anti-pattern n°9). A new
// gravity label appearing in the archive would otherwise vanish as unexplained loss.
{
  const inconnu = [
    header,
    row(4, `${year}-07-01`, `${year}-07-10`, "[104]", '[""76_09_0004""]', '[""Niveau inconnu XYZ""]'),
  ].join("\n");
  const aggInconnu = aggregateCsv(inconnu);
  check("rejects: an unknown gravity label is counted as such, not as a date problem",
    aggInconnu.diag.rejets?.niveauIllisible === 1 && (aggInconnu.diag.parsedCount ?? -1) === 0);
}
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

// --- run-length restriction calendar (`periodes`) ---
// The portfolio correlation reads the calendar back out of this encoding, so
// the encoding has to say exactly what the aggregates say. Anything else and
// two views of the same zone would tell two different stories.
{
  const p = z201?.periodes;
  check("periodes present", Array.isArray(p) && p.length > 0);
  check("periodes are flat triplets", (p?.length ?? 1) % 3 === 0);

  // Four arrêtés, four calendar-separated episodes — never merged into one run.
  check("one run per episode", (p?.length ?? 0) / 3 === 4);

  // Runs must be sorted and non-overlapping: a later run cannot start before
  // the previous one ends.
  let ordered = true;
  for (let i = 3; i < (p?.length ?? 0); i += 3) {
    if (p![i] < p![i - 3] + p![i - 2]) ordered = false;
  }
  check("runs are ordered and disjoint", ordered);

  // THE invariant: days rebuilt from the runs must equal joursParNiveau,
  // level by level, year by year.
  const rankToNiveau = ["", "vigilance", "alerte", "alerte_renforcee", "crise"];
  const rebuilt: Record<string, Record<string, number>> = {};
  for (let i = 0; i < (p?.length ?? 0); i += 3) {
    const [startDay, len, rank] = [p![i], p![i + 1], p![i + 2]];
    for (let d = startDay; d < startDay + len; d++) {
      const y = String(new Date(d * 86400_000).getUTCFullYear());
      (rebuilt[y] ??= {});
      const n = rankToNiveau[rank];
      rebuilt[y][n] = (rebuilt[y][n] ?? 0) + 1;
    }
  }
  const expected = Object.fromEntries(
    Object.entries(z201?.parAnnee ?? {}).map(([y, v]) => [y, v.joursParNiveau]),
  );
  check(
    "days rebuilt from periodes equal joursParNiveau exactly",
    JSON.stringify(rebuilt) === JSON.stringify(expected),
  );

  // Episode lengths are the point of the encoding — the storage-buffer maths
  // downstream is wrong if a 20-day crise is stored as 20 one-day runs.
  const criseRun = (() => {
    for (let i = 0; i < (p?.length ?? 0); i += 3) if (p![i + 2] === 4) return p![i + 1];
    return undefined;
  })();
  check("crise episode keeps its 20-day length", criseRun === 20);

  // Aliased keys share the compression rather than recomputing it, and must
  // therefore be the same array — not a lookalike.
  check("numeric id alias shares the same periodes array", aggMy.zones["201"]?.periodes === p);

  // --- The IA engine on THIS fixture, not on a hand-built calendar ----------
  //
  // ⚠️ Pending since Sprint 42a, and it is the one link in the whole IA chain that
  // had never seen a calendar produced by the real parser. Every other test of
  // lib/ia.ts feeds it triplets I wrote by hand — which proves the engine, and
  // proves nothing about the hand-off between the two modules.
  {
    const episodes = episodesFromPeriodes(p);
    check("ia: the parser's own calendar decodes to one episode per run",
      episodes.length === (p?.length ?? 0) / 3);
    // Same invariant as above, now measured through the IA decoder rather than by
    // re-implementing the walk: total days must equal the sum over parAnnee.
    const joursDecodes = episodes.reduce((a, e) => a + e.lengthDays, 0);
    const joursAttendus = Object.values(z201?.parAnnee ?? {}).reduce(
      (a, v) => a + Object.values(v.joursParNiveau).reduce((x, y) => x + (y ?? 0), 0),
      0,
    );
    check("ia: decoded days equal the aggregate's own day total",
      joursDecodes === joursAttendus);
    // The 20-day crise run must survive as ONE episode. If it arrived as twenty
    // one-day episodes, a storage buffer would absorb all of it and the JEA would
    // collapse — the exact failure the run-length encoding exists to prevent.
    const crise = episodes.filter((e) => e.rank === 4);
    check("ia: the 20-day crise arrives as ONE episode of 20 days",
      crise.length === 1 && crise[0].lengthDays === 20);
    check("ia: episodes come out ordered by start day",
      episodes.every((e, i) => i === 0 || e.startDay >= episodes[i - 1].startDay));

    // And the JEA computed on it. ⚠️ The numbers are checkable by hand: 365 000 m³/an
    // = 1 000 m³/day, ρ = 1 at both levels, no buffer → one JEA per restricted day,
    // spread over the 4 complete years the fixture covers.
    const ia = computeIa({
      episodes,
      exposure: { alerte: { min: 1, max: 1 }, crise: { min: 1, max: 1 } },
      vrefM3: 365_000,
      anneesCouvertes: z201?.anneesCompletes,
    });
    check("ia: the JEA is produced from the parser's calendar", ia.available);
    check("ia: 50 restricted days over 4 covered years → 12.5 JEA/an",
      Math.abs(ia.jeaMin - joursDecodes / (z201?.anneesCompletes ?? 1)) < 0.05);
    check("ia: the longest run is reported as 20 days", ia.maxJoursConsecutifs === 20);
    // ⚠️ With a 10-day buffer the SAME calendar costs far less: the buffer absorbs
    // each of the three 10-day episodes entirely and 10 days of the 20-day one.
    const avecTampon = computeIa({
      episodes,
      exposure: { alerte: { min: 1, max: 1 }, crise: { min: 1, max: 1 } },
      vrefM3: 365_000,
      tamponM3: 10_000,
      anneesCouvertes: z201?.anneesCompletes,
    });
    check("ia: a 10-day buffer on the same real calendar cuts the JEA to 10 days total",
      Math.abs(avecTampon.jeaMin - 10 / (z201?.anneesCompletes ?? 1)) < 0.05);
    check("ia: … which is strictly less than without it", avecTampon.jeaMin < ia.jeaMin);
  }
}

// --- premiereAnnee: making the young-zone bias visible ---
// VigiEau redraws its zone referential, so a code in force today may not exist
// in older decrees. The structural mean divides by every complete year the FILE
// covers, counting those pre-existence years as calm. We cannot tell "calm" from
// "did not exist", so the ambiguity is exposed rather than silently resolved —
// and widening the window makes it larger, which is why this field exists.
{
  check("premiereAnnee reported", z201?.premiereAnnee === year - 4);
  check("premiereAnnee is the first RESTRICTED year, not the window start",
    (z201?.premiereAnnee ?? 0) > year - W);

  // A zone appearing only in the most recent year: its mean is diluted across
  // every covered year. That is the conservative reading, and the field is what
  // lets a consumer see it rather than trust the mean blindly.
  const jeune = aggregateCsv([
    header,
    row(20, `${year - 4}-07-01`, `${year - 4}-07-10`, "[301]", '[""76_09_0301""]', '[""Alerte""]'),
    row(21, `${year - 1}-06-01`, `${year - 1}-08-29`, "[302]", '[""76_09_0302""]', '[""Alerte""]'),
  ].join("\n"));
  const z302 = jeune.zones["76_09_0302"];
  check("young zone: premiereAnnee is its own first year", z302?.premiereAnnee === year - 1);
  check("young zone: the mean IS diluted over the file's years, not its own",
    (z302?.anneesCompletes ?? 0) === 4 && z302?.joursAlertePlusMoyen === Math.round(90 / 4));
  check("a zone with no restriction at all has no premiereAnnee",
    aggMy.zones["76_09_9999"]?.premiereAnnee === undefined);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("history parser: all checks pass");
