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

export interface ZoneHistory {
  /** cumulated days at each gravity level over the covered period */
  joursParNiveau: Partial<Record<NiveauGravite, number>>;
  /** days at level "alerte" or worse (the structural-tension proxy) */
  joursAlertePlus: number;
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

const DAY_MS = 86400_000;

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
  // deduplicated by keeping the max). Aggregation covers the current year
  // only ("année en cours") — this also caps the day loops against garbage
  // dates present in the real file (e.g. year 0022).
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const yearStartUtc = Date.UTC(today.getUTCFullYear(), 0, 1);
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
    const finRaw = finIdx !== -1 ? parseDate(row[finIdx] ?? "") : undefined;
    const start = Math.max(debut.getTime(), yearStartUtc);
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
  const zones: Record<string, ZoneHistory> = {};
  for (const [code, days] of perZoneDays) {
    const joursParNiveau: Partial<Record<NiveauGravite, number>> = {};
    let alertePlus = 0;
    for (const rank of days.values()) {
      const niveau = rankToNiveau[rank];
      joursParNiveau[niveau] = (joursParNiveau[niveau] ?? 0) + 1;
      if (rank >= 2) alertePlus++;
    }
    zones[code] = { joursParNiveau, joursAlertePlus: alertePlus };
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

export async function getHistory(
  zoneCodes: string[],
  debug = false,
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
    // A zone absent from the file means no arrêté over the period: 0 days.
    zones[code] = h ?? { joursParNiveau: {}, joursAlertePlus: 0 };
  }
  return { available: true, zones, diag: agg.diag, ...(debug ? { attempts } : {}) };
}
