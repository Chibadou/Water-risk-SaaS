// Restriction history from the official VigiEau "arrêtés année en cours" CSV
// (data.gouv.fr, ~830 KB, refreshed daily). Aggregated into days-per-gravity
// level per alert zone.
//
// The exact CSV schema is not formally documented, so parsing is defensive:
// the delimiter is sniffed and columns are matched by normalized name
// (case/accent-insensitive). The API exposes a `diag` block so a schema drift
// is visible immediately instead of failing silently.

import { GRAVITE } from "./gravite";
import type { NiveauGravite } from "./types";

// Candidate sources, tried in order until one parses. IDs come from the
// "Donnée Sécheresse - VigiEau" dataset; the dataset API lookup self-heals if
// a resource id rotates.
const ARRETES_CSV_URL = "https://www.data.gouv.fr/api/1/datasets/r/0732e970-c12c-4e6a-adca-5ac9dbc3fdfa";
const RESTRICTIONS_CSV_URL = "https://www.data.gouv.fr/api/1/datasets/r/f425cfa6-ccd1-438e-bb03-9d90ab527851";
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
  const codeIdx = findColumn(headers, [/^code_zone/, /zone.*code/, /^code$/, /code.*alerte/]);
  // Secondary zone identifier (numeric id): indexed too, so lookups work
  // whichever identifier the VigiEau API side uses.
  const idIdx = findColumn(headers, [/^id_zone/, /zone.*id/]);
  const niveauIdx = findColumn(headers, [/niveau/, /gravite/]);
  const debutIdx = findColumn(headers, [/debut/]);
  const finIdx = findColumn(headers, [/fin/]);

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
  // deduplicated by keeping the max).
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const perZoneDays = new Map<string, Map<number, number>>();
  let minDay = Infinity;
  let maxDay = -Infinity;
  let parsed = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const code = codeIdx !== -1 ? row[codeIdx]?.trim() : undefined;
    const zoneId = idIdx !== -1 ? row[idIdx]?.trim() : undefined;
    const primaryKey = code || zoneId;
    const niveau = normalizeNiveau(row[niveauIdx] ?? "");
    const debut = parseDate(row[debutIdx] ?? "");
    if (!primaryKey || !niveau || !debut) continue;
    const finRaw = finIdx !== -1 ? parseDate(row[finIdx] ?? "") : undefined;
    const start = debut.getTime();
    const end = Math.min(finRaw ? finRaw.getTime() : todayUtc, todayUtc);
    if (end < start) continue;
    parsed++;
    const rank = GRAVITE[niveau].rank;
    // Index under every identifier the row carries (same underlying day map,
    // so both keys stay consistent).
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
  }

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
    // arrêtés-like resources first, then the rest
    const score = (t: string) => {
      const n = t.toLowerCase();
      if (n.includes("arrete") || n.includes("arrêté")) return 0;
      if (n.includes("restriction")) return 1;
      return 2;
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
  if (!urls.includes(RESTRICTIONS_CSV_URL)) urls.push(RESTRICTIONS_CSV_URL);
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
