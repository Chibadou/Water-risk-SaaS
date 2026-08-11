// Restriction history from the official VigiEau "Arrêtés" master CSV
// (data.gouv.fr, ~11 MB, refreshed daily): one row per arrêté since 2012 —
// current year included — with the affected zones as parallel JSON arrays in
// the `zones_alerte.*` cells. Aggregated into days-per-gravity level per alert
// zone over the current year.
//
// The exact CSV schema is not formally documented, so parsing is defensive:
// the delimiter is sniffed, columns are matched by normalized name
// (case/accent-insensitive), and both cell shapes are handled (JSON-array
// cells and one-zone-per-row). The API exposes a `diag` block so a schema
// drift is visible immediately instead of failing silently.

import { GRAVITE } from "./gravite";
import type { NiveauGravite } from "./types";

// Candidate sources, tried in order until one parses. IDs come from the
// "Donnée Sécheresse - VigiEau" dataset; the dataset API lookup self-heals if
// a resource id rotates. Note: the "Arrêtés Cadre" resource (0732e970-…) is
// framework decrees with NO gravity level — never use it.
const ARRETES_CSV_URL = "https://www.data.gouv.fr/api/1/datasets/r/f425cfa6-ccd1-438e-bb03-9d90ab527851";
const DATASET_API_URL = "https://www.data.gouv.fr/api/1/datasets/donnee-secheresse-vigieau/";

const CSV_REVALIDATE = 24 * 3600;
const UPSTREAM_TIMEOUT_MS = 25000;

// How many calendar years the aggregation spans (current year + the previous
// WINDOW_YEARS-1).
//
// The master "Arrêtés" CSV was measured (probe run, data/restrictions/
// backlog-probe.json) to hold 12 452 arrêtés spanning 2010→2026, with per-year
// counts matching the per-year archives almost exactly. The wide swing between
// years — 168 arrêtés in 2014 against 2 041 in 2023 — is real drought
// variability, not a gap in the file, and it is precisely why a five-year mean
// is fragile: it can sit entirely inside a wet or a dry run.
//
// The cost is not free: the parser expands every arrêté day by day per zone, so
// the day map grows with the window. Overridable so the window can be tuned
// without a deploy, and so the benchmark can compare settings.
//
// Widened 10 → 14 (Sprint 27), then 14 → 15 (Sprint 45, N1). Cost re-measured at
// the bench each time rather than assumed:
//
//     window=10  ~1 900 ms      window=14  2 504 ms      window=15  2 648 ms
//
// +5.8 % for the last year, still two orders of magnitude under the 60 s function
// budget. 15 reaches back to 2012, which is what N1 asks for ("reconstruction
// 2012 → aujourd'hui"). It deliberately stops short of 2010-2011, where the file
// genuinely thins out — 24 arrêtés in 2010 against 602 in 2012.
//
// ⚠️ A finding worth keeping, because it contradicts the reasoning that justified
// the first widening. Sprint 27 widened the window on the argument that a 10-year
// window sits on 2017-2025 and therefore contains both 2022 and 2023 — two
// exceptional droughts — so the structural mean is biased high; measured, it fell
// from 74 to 69 j/an. Going 14 → 15 RAISES it from 69 to 71 j/an, because 2012 was
// itself more restrictive than the 14-year mean. So widening does not
// systematically lower the figure: it lowers it when the years added are calmer,
// and there is no reason for that to hold in general. The honest statement is
// "a longer window is more representative", not "a longer window is lower".
//
// ⚠️ Widening also makes archive DISCONTINUITY more likely, not less — VigiEau
// redraws its zone referential, so a code in force today may have no history at
// all before it existed. That is why `premiereAnnee` exists and why it is
// published rather than resolved (anti-pattern n°8).
const WINDOW_YEARS = (() => {
  const raw = Number(process.env.HISTORY_WINDOW_YEARS);
  return Number.isFinite(raw) && raw >= 1 && raw <= 20 ? Math.floor(raw) : 15;
})();

export interface YearHistory {
  joursParNiveau: Partial<Record<NiveauGravite, number>>;
  joursAlertePlus: number;
}

export interface ZoneHistory {
  /** current-year days at each gravity level (kept for back-compat) */
  joursParNiveau: Partial<Record<NiveauGravite, number>>;
  /** current-year days at level "alerte" or worse */
  joursAlertePlus: number;
  /** per-calendar-year breakdown over the window, keyed by year (e.g. "2024") */
  parAnnee: Record<string, YearHistory>;
  /** structural frequency: mean days/year in alerte+ over the complete years
   *  of the window (excludes the partial current year). undefined if no
   *  complete year is covered. */
  joursAlertePlusMoyen?: number;
  /** number of complete years the mean is averaged over */
  anneesCompletes?: number;
  /**
   * First calendar year this zone code appears in any arrêté.
   *
   * ⚠️ Read this before trusting `joursAlertePlusMoyen`. VigiEau redraws its
   * zone referential, so a code in force today may simply not exist in older
   * decrees — Lyon's `84_69_0004` starts in 2022 inside a file covering 2017→.
   * The mean divides by every complete year the FILE covers, which counts those
   * pre-existence years as zero-restriction years. The territory did exist and
   * was covered by some other code; we cannot map old codes to new ones, so we
   * cannot tell "calm" from "did not exist".
   *
   * Neither choice is right: dividing by the file's years understates a young
   * zone, dividing by its own years overstates it by dropping genuinely calm
   * years (the exact bug fixed in the portfolio replay at Sprint 26). So the
   * conservative denominator is kept and the ambiguity is EXPOSED here instead
   * of being silently resolved. Widening the window makes this larger, not
   * smaller — which is why this field arrived with the widening.
   */
  premiereAnnee?: number;
  /** monthly breakdown: year → month (0-11) → days in alerte+ */
  parMois?: Record<string, Record<number, number>>;
  /**
   * Monthly breakdown split by gravity level: year → month (0-11) → level → days.
   * Added alongside `parMois` rather than replacing it: the aggregate shape is
   * consumed by computeSeasonalProfile, RestrictionHistory, anticipation and
   * report, and changing it would ripple through all four.
   */
  parMoisNiveau?: Record<string, Record<number, Partial<Record<NiveauGravite, number>>>>;
  /**
   * Contiguous runs of restriction, as flat triplets
   * `[dayIndex, lengthDays, rank, dayIndex, lengthDays, rank, …]`.
   *
   * The aggregates above answer "how many days"; they cannot answer "were these
   * two sites constrained on the *same* day", nor "how long was one episode" —
   * both of which need the calendar back. The parser already builds a day→rank
   * map per zone and throws it away after bucketing, so this is data recovered,
   * not data recomputed.
   *
   * Run-length encoded because restrictions are contiguous by construction (an
   * arrêté is an interval): a decade of a busy zone is a few dozen runs against
   * 3 650 raw entries. Flat rather than nested tuples to keep both the retained
   * aggregate and the JSON payload small at ~2 200 zones.
   *
   * Only emitted when the caller asks for it (see `getHistory`).
   */
  periodes?: number[];
}

/** Milliseconds per day — the unit `periodes` day indices are expressed in. */
export const HISTORY_DAY_MS = 86400_000;

/** Convert a `periodes` day index back to a UTC date. */
export function dayIndexToDate(dayIndex: number): Date {
  return new Date(dayIndex * HISTORY_DAY_MS);
}

export interface HistoryDiag {
  source: "ok" | "unreachable" | "unparseable";
  delimiter?: string;
  columns?: { code?: string; niveau?: string; debut?: string; fin?: string };
  /** true when zone cells were JSON arrays (master "Arrêtés" file shape) */
  arrayCells?: boolean;
  rowCount?: number;
  parsedCount?: number;
  coverage?: { from: string; to: string };
  /** calendar years spanned by the aggregation window */
  windowYears?: number;
}

export interface HistoryPayload {
  available: boolean;
  zones: Record<string, ZoneHistory>;
  diag: HistoryDiag;
  message?: string;
}

/** lowercase, strip accents and non-alphanumerics — for header matching */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "_");
}

function normalizeNiveau(v: string): NiveauGravite | undefined {
  const n = normalizeHeader(v);
  if (n.includes("crise")) return "crise";
  if (n.includes("renforc")) return "alerte_renforcee";
  if (n.includes("alerte")) return "alerte";
  if (n.includes("vigilance")) return "vigilance";
  return undefined;
}

/** RFC4180-ish CSV parsing with quoted fields; delimiter given. */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

function sniffDelimiter(headerLine: string): string {
  const counts: Array<[string, number]> = [";", ",", "\t"].map((d) => [
    d,
    headerLine.split(d).length,
  ]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ";";
}

/** find the index of the first header matching one of the regexes, in order */
function findColumn(headers: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const idx = headers.findIndex((h) => p.test(h));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseDate(v: string): Date | undefined {
  const s = v.trim();
  if (!s) return undefined;
  // ISO YYYY-MM-DD (possibly with time)
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // French DD/MM/YYYY
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return undefined;
}

const DAY_MS = HISTORY_DAY_MS;

/**
 * Compress a day→rank map into flat run-length triplets.
 *
 * A run breaks on a rank change *or* a calendar gap: two separate arrêtés at the
 * same level, a fortnight apart, must stay two episodes — merging them would
 * invent a continuous restriction and, downstream, wipe out a storage buffer
 * that in reality had time to refill between them.
 */
function runLengths(days: Map<number, number>, fromDay: number, toDay: number): number[] {
  const out: number[] = [];
  let start = -1;
  let rank = -1;
  // Scanned over the window rather than over sorted keys: the day range is
  // bounded (~3 650) while sorting a busy zone's keys costs a comparator call
  // per comparison. Measured on the benchmark file, the scan is the cheaper of
  // the two by a wide margin.
  for (let d = fromDay; d <= toDay; d++) {
    const r = days.get(d);
    if (r === rank) continue;
    if (start >= 0) out.push(start, d - start, rank);
    if (r === undefined) {
      start = -1;
      rank = -1;
    } else {
      start = d;
      rank = r;
    }
  }
  if (start >= 0) out.push(start, toDay + 1 - start, rank);
  return out;
}

interface Aggregate {
  zones: Record<string, ZoneHistory>;
  diag: HistoryDiag;
}

export function aggregateCsv(text: string): Aggregate {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const delimiter = sniffDelimiter(firstLine);
  const rows = parseCsv(text, delimiter);
  if (rows.length < 2) {
    return { zones: {}, diag: { source: "unparseable", delimiter, rowCount: rows.length } };
  }
  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findColumn(headers, [/^zones_alerte_code$/, /^code_zone/, /zone.*code/, /^code$/, /code.*alerte/]);
  // Secondary zone identifier (numeric id): indexed too, so lookups work
  // whichever identifier the VigiEau API side uses.
  const idIdx = findColumn(headers, [/^zones_alerte_id$/, /^id_zone/, /zone.*id$/]);
  // The specific pattern must win: the master file also carries
  // `niveau_gravite_specifique_aep`, which /niveau/ alone would match first.
  const niveauIdx = findColumn(headers, [/^zones_alerte_niveau/, /niveau_gravite$/, /niveau(?!_gravite_specifique)/, /gravite/]);
  const debutIdx = findColumn(headers, [/^date_debut$/, /debut/]);
  const finIdx = findColumn(headers, [/^date_fin$/, /fin/]);

  const diag: HistoryDiag = {
    source: "ok",
    delimiter: delimiter === "\t" ? "tab" : delimiter,
    columns: {
      code: rows[0][codeIdx],
      niveau: rows[0][niveauIdx],
      debut: rows[0][debutIdx],
      fin: rows[0][finIdx],
    },
    rowCount: rows.length - 1,
    parsedCount: 0,
  };

  if ((codeIdx === -1 && idIdx === -1) || niveauIdx === -1 || debutIdx === -1) {
    return { zones: {}, diag: { ...diag, source: "unparseable" } };
  }

  // Per zone: day index → worst rank seen that day (overlapping arrêtés are
  // deduplicated by keeping the max). Aggregation spans the WINDOW_YEARS-year
  // window ending today — the lower bound also caps the day loops against
  // garbage dates present in the real file (e.g. year 0022).
  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const todayUtc = Date.UTC(currentYear, today.getUTCMonth(), today.getUTCDate());
  const windowStartUtc = Date.UTC(currentYear - (WINDOW_YEARS - 1), 0, 1);
  const perZoneDays = new Map<string, Map<number, number>>();
  let minDay = Infinity;
  let maxDay = -Infinity;
  let parsed = 0;
  let sawArrayCells = false;

  // In the master "Arrêtés" file, zone cells are parallel JSON arrays
  // (`["76_09_0009",…]`); in per-year exports they are plain scalars.
  const parseArrayCell = (v: string | undefined): string[] | null => {
    const s = (v ?? "").trim();
    if (!s.startsWith("[")) return null;
    try {
      const arr: unknown = JSON.parse(s);
      return Array.isArray(arr) ? arr.map((x) => (x == null ? "" : String(x))) : null;
    } catch {
      return null;
    }
  };

  const record = (code: string | undefined, zoneId: string | undefined, rank: number, start: number, end: number) => {
    const primaryKey = code || zoneId;
    if (!primaryKey) return;
    // Index under every identifier the entry carries (same underlying day
    // map, so both keys stay consistent).
    let days = perZoneDays.get(primaryKey);
    if (!days) {
      days = new Map();
      perZoneDays.set(primaryKey, days);
    }
    if (zoneId && zoneId !== primaryKey && !perZoneDays.has(zoneId)) {
      perZoneDays.set(zoneId, days);
    }
    for (let t = start; t <= end; t += DAY_MS) {
      const d = Math.floor(t / DAY_MS);
      if (d < minDay) minDay = d;
      if (d > maxDay) maxDay = d;
      const prev = days.get(d);
      if (prev === undefined || rank > prev) days.set(d, rank);
    }
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const debut = parseDate(row[debutIdx] ?? "");
    if (!debut) continue;
    // The real file carries a few corrupt start dates (e.g. year 0022). Left
    // alone, clamping such a start up to the window would fabricate months of
    // phantom restriction days, so drop implausibly old rows outright.
    if (debut.getUTCFullYear() < 2005) continue;
    const finRaw = finIdx !== -1 ? parseDate(row[finIdx] ?? "") : undefined;
    const start = Math.max(debut.getTime(), windowStartUtc);
    const end = Math.min(finRaw ? finRaw.getTime() : todayUtc, todayUtc);
    if (end < start) continue;

    const codes = codeIdx !== -1 ? parseArrayCell(row[codeIdx]) : null;
    const ids = idIdx !== -1 ? parseArrayCell(row[idIdx]) : null;
    const niveaux = parseArrayCell(row[niveauIdx]);

    if (codes || ids || niveaux) {
      // Array shape: one entry per zone, arrays are parallel. A scalar
      // gravity applies to every zone of the row.
      sawArrayCells = true;
      const n = Math.max(codes?.length ?? 0, ids?.length ?? 0, niveaux?.length ?? 0);
      const scalarNiveau = niveaux ? undefined : normalizeNiveau(row[niveauIdx] ?? "");
      let any = false;
      for (let i = 0; i < n; i++) {
        const niveau = niveaux ? normalizeNiveau(niveaux[i] ?? "") : scalarNiveau;
        if (!niveau) continue;
        record(codes?.[i]?.trim() || undefined, ids?.[i]?.trim() || undefined, GRAVITE[niveau].rank, start, end);
        any = true;
      }
      if (any) parsed++;
    } else {
      const code = codeIdx !== -1 ? row[codeIdx]?.trim() : undefined;
      const zoneId = idIdx !== -1 ? row[idIdx]?.trim() : undefined;
      const niveau = normalizeNiveau(row[niveauIdx] ?? "");
      if (!(code || zoneId) || !niveau) continue;
      record(code, zoneId, GRAVITE[niveau].rank, start, end);
      parsed++;
    }
  }
  diag.arrayCells = sawArrayCells;

  diag.parsedCount = parsed;
  diag.windowYears = WINDOW_YEARS;
  if (parsed > 0 && Number.isFinite(minDay)) {
    diag.coverage = {
      from: new Date(minDay * DAY_MS).toISOString().slice(0, 10),
      to: new Date(maxDay * DAY_MS).toISOString().slice(0, 10),
    };
  }

  const rankToNiveau: Record<number, NiveauGravite> = {
    1: "vigilance",
    2: "alerte",
    3: "alerte_renforcee",
    4: "crise",
  };
  // Complete (non-current) years of the window that the file actually covers.
  // A year older than the file's first data would wrongly count as 0 days, so
  // we bound the denominator by the earliest observed year.
  const fileMinYear = Number.isFinite(minDay)
    ? new Date(minDay * DAY_MS).getUTCFullYear()
    : currentYear;
  const completeYears: number[] = [];
  for (let y = currentYear - (WINDOW_YEARS - 1); y <= currentYear - 1; y++) {
    if (y >= fileMinYear) completeYears.push(y);
  }

  const zones: Record<string, ZoneHistory> = {};
  // A zone is indexed under both its code and its numeric id, pointing at the
  // *same* day map. Keying the cache on that map identity means the compression
  // runs once per zone rather than once per alias.
  const rleCache = new WeakMap<Map<number, number>, number[]>();
  for (const [code, days] of perZoneDays) {
    // Bucket each covered day into its calendar year (+ month for seasonal profile).
    const perYear = new Map<number, { jpn: Partial<Record<NiveauGravite, number>>; alertePlus: number }>();
    const perYearMonth = new Map<string, Map<number, number>>();
    const perYearMonthNiveau = new Map<string, Map<number, Map<NiveauGravite, number>>>();
    for (const [d, rank] of days) {
      const dt = new Date(d * DAY_MS);
      const year = dt.getUTCFullYear();
      const month = dt.getUTCMonth();
      let bucket = perYear.get(year);
      if (!bucket) {
        bucket = { jpn: {}, alertePlus: 0 };
        perYear.set(year, bucket);
      }
      const niveau = rankToNiveau[rank];
      bucket.jpn[niveau] = (bucket.jpn[niveau] ?? 0) + 1;
      const yk = String(year);
      // Per-level monthly detail covers every level, including vigilance, so a
      // consumer can weight a month by what was actually in force that month.
      let nivMonths = perYearMonthNiveau.get(yk);
      if (!nivMonths) { nivMonths = new Map(); perYearMonthNiveau.set(yk, nivMonths); }
      let nivBucket = nivMonths.get(month);
      if (!nivBucket) { nivBucket = new Map(); nivMonths.set(month, nivBucket); }
      nivBucket.set(niveau, (nivBucket.get(niveau) ?? 0) + 1);
      if (rank >= 2) {
        bucket.alertePlus++;
        let monthMap = perYearMonth.get(yk);
        if (!monthMap) { monthMap = new Map(); perYearMonth.set(yk, monthMap); }
        monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
      }
    }

    const parAnnee: Record<string, YearHistory> = {};
    for (const [year, b] of perYear) {
      parAnnee[String(year)] = { joursParNiveau: b.jpn, joursAlertePlus: b.alertePlus };
    }

    // Structural frequency: mean days/year in alerte+ over the complete years
    // (missing years count as 0, since the file covers them).
    let joursAlertePlusMoyen: number | undefined;
    if (completeYears.length > 0) {
      const sum = completeYears.reduce((s, y) => s + (parAnnee[String(y)]?.joursAlertePlus ?? 0), 0);
      joursAlertePlusMoyen = Math.round(sum / completeYears.length);
    }

    const parMois: Record<string, Record<number, number>> = {};
    for (const [yk, monthMap] of perYearMonth) {
      const obj: Record<number, number> = {};
      for (const [m, d] of monthMap) obj[m] = d;
      parMois[yk] = obj;
    }

    const parMoisNiveau: Record<
      string,
      Record<number, Partial<Record<NiveauGravite, number>>>
    > = {};
    for (const [yk, monthMap] of perYearMonthNiveau) {
      const obj: Record<number, Partial<Record<NiveauGravite, number>>> = {};
      for (const [m, levels] of monthMap) {
        const byLevel: Partial<Record<NiveauGravite, number>> = {};
        for (const [n, d] of levels) byLevel[n] = d;
        obj[m] = byLevel;
      }
      parMoisNiveau[yk] = obj;
    }

    let periodes = rleCache.get(days);
    if (!periodes) {
      periodes = Number.isFinite(minDay) ? runLengths(days, minDay, maxDay) : [];
      rleCache.set(days, periodes);
    }

    const current = parAnnee[String(currentYear)];
    zones[code] = {
      joursParNiveau: current?.joursParNiveau ?? {},
      joursAlertePlus: current?.joursAlertePlus ?? 0,
      parAnnee,
      parMoisNiveau,
      joursAlertePlusMoyen,
      anneesCompletes: completeYears.length || undefined,
      parMois,
      periodes,
      // The run-length encoding is already ordered, so its first run is the
      // zone's first restricted day — no extra pass to find it.
      premiereAnnee:
        periodes.length > 0
          ? new Date(periodes[0] * DAY_MS).getUTCFullYear()
          : undefined,
    };
  }
  return { zones, diag };
}

export interface SourceAttempt {
  url: string;
  status?: number | "network-error";
  contentType?: string;
  bytes?: number;
  headerLine?: string;
  diag?: HistoryDiag;
}

/** Discover CSV resources of the VigiEau dataset via the data.gouv API
 *  (self-heals if a hardcoded resource id rotates). */
async function discoverCsvUrls(): Promise<string[]> {
  try {
    const res = await fetch(DATASET_API_URL, {
      next: { revalidate: CSV_REVALIDATE },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      resources?: Array<{ title?: string; format?: string; url?: string; latest?: string }>;
    };
    const csvs = (data.resources ?? []).filter(
      (r) => (r.format ?? "").toLowerCase().includes("csv") && (r.latest || r.url),
    );
    // The master "Arrêtés" file first (all years incl. current, daily
    // refresh), then per-year exports newest-first. "Arrêtés Cadre" is
    // framework decrees without gravity level: last resort only.
    const score = (t: string) => {
      const n = normalizeHeader(t);
      if (n.includes("cadre")) return 9;
      if (/^arretes?$/.test(n)) return 0;
      const year = /^arretes?_(\d{4})$/.exec(n);
      if (year) return 1 + (2100 - Number(year[1])) / 1000;
      if (n.includes("restriction")) return 5;
      return 6;
    };
    return csvs
      .sort((a, b) => score(a.title ?? "") - score(b.title ?? ""))
      .map((r) => r.latest ?? r.url!)
      .slice(0, 4);
  } catch {
    return [];
  }
}

async function candidateUrls(): Promise<string[]> {
  const urls: string[] = [];
  if (process.env.HISTORY_CSV_URL) urls.push(process.env.HISTORY_CSV_URL);
  urls.push(ARRETES_CSV_URL);
  for (const u of await discoverCsvUrls()) if (!urls.includes(u)) urls.push(u);
  return urls;
}

// Working aggregate memoized per process (serverless instances are ephemeral;
// this avoids re-downloading/re-parsing on every warm invocation).
let memo: { agg: Aggregate; expiresAt: number } | null = null;

async function trySource(url: string, attempts: SourceAttempt[]): Promise<Aggregate | null> {
  const attempt: SourceAttempt = { url };
  attempts.push(attempt);
  let text: string;
  try {
    const res = await fetch(url, {
      // Large files exceed the fetch-cache item limit anyway; rely on the
      // in-process memo for reuse and always fetch fresh here.
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    attempt.status = res.status;
    attempt.contentType = res.headers.get("content-type") ?? undefined;
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    attempt.status = "network-error";
    return null;
  }
  attempt.bytes = text.length;
  attempt.headerLine = text.slice(0, 300).split(/\r?\n/)[0];
  const agg = aggregateCsv(text);
  attempt.diag = agg.diag;
  if (agg.diag.source === "ok" && (agg.diag.parsedCount ?? 0) > 0) return agg;
  return null;
}

async function loadAggregate(attempts: SourceAttempt[]): Promise<Aggregate | null> {
  if (memo && memo.expiresAt > Date.now()) return memo.agg;
  for (const url of await candidateUrls()) {
    const agg = await trySource(url, attempts);
    if (agg) {
      memo = { agg, expiresAt: Date.now() + CSV_REVALIDATE * 1000 };
      return agg;
    }
  }
  return null;
}

/**
 * @param withPeriodes emit the run-length restriction calendar per zone. Off by
 *   default: only the portfolio correlation needs it, and it would otherwise
 *   inflate every site-page response for nothing.
 */
export async function getHistory(
  zoneCodes: string[],
  debug = false,
  withPeriodes = false,
): Promise<HistoryPayload & { attempts?: SourceAttempt[] }> {
  const attempts: SourceAttempt[] = [];
  const agg = await loadAggregate(attempts);

  if (!agg) {
    return {
      available: false,
      zones: {},
      diag: attempts.some((a) => a.diag) ? attempts[attempts.length - 1].diag! : { source: "unreachable" },
      message: "Archives des arrêtés indisponibles — historique momentanément indisponible.",
      ...(debug ? { attempts } : {}),
    };
  }

  const zones: Record<string, ZoneHistory> = {};
  for (const code of zoneCodes) {
    const h = agg.zones[code];
    // A zone absent from the file means no arrêté over the period: 0 days,
    // and a structural frequency of 0 over the covered complete years.
    if (!h) {
      zones[code] = {
        joursParNiveau: {},
        joursAlertePlus: 0,
        parAnnee: {},
        joursAlertePlusMoyen: agg.diag.windowYears ? 0 : undefined,
        anneesCompletes: undefined,
        ...(withPeriodes ? { periodes: [] } : {}),
      };
      continue;
    }
    if (withPeriodes) {
      zones[code] = h;
    } else {
      // Shallow copy minus the calendar: the memoized aggregate is shared
      // across requests, so it must not be mutated to strip the field.
      const stripped: ZoneHistory = { ...h };
      delete stripped.periodes;
      zones[code] = stripped;
    }
  }
  return { available: true, zones, diag: agg.diag, ...(debug ? { attempts } : {}) };
}
