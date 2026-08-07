// Soil wetness index (SWI, Météo-France SAFRAN) as a drought precursor.
//
// The anticipation model already reads groundwater (slow, the strongest
// predictor), river low flow and dry-stream observations. Soil moisture sits
// earlier in the chain than all of them — soil dries out weeks before an
// aquifer does — which is what makes it useful for the weeks-ahead horizon.
//
// The raw index is not comparable between places or seasons: 0.4 is normal for
// a Mediterranean August and alarming for a Breton April. So it is turned into
// a **standardised** figure, the rank of the current value within the same
// cell's distribution for the same calendar month over 1990-2019 — the same
// logic already used for the piezometric index in lib/hubeau.ts.

/** Historical distribution for one cell and one calendar month. */
export type SwiQuantiles = [min: number, q25: number, q50: number, q75: number, max: number];

export interface SwiCell {
  n: number;
  lat: number;
  lon: number;
}

/**
 * How old a monthly reading may be and still inform a weeks-ahead index.
 *
 * Measured on prod (2026-07): the published decade file stops at 2025-12, so
 * the latest available value can be many months old. Feeding a December value
 * into a July anticipation index would be wrong twice over — the soil state is
 * not current, and the reading is labelled with its own month, so the UI would
 * announce "December" to someone reading it in July.
 */
export const MAX_AGE_MONTHS = 3;

/** Whole months between a YYYYMM period and a date. Negative if in the future. */
export function ageInMonths(period: string, now: Date): number {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(4, 6));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return Number.POSITIVE_INFINITY;
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
}

export interface SwiReading {
  /** 0-100 dryness stress: 100 = drier than anything on record for this month */
  score: number;
  /** the raw monthly index, kept so the figure can be checked against the source */
  value: number;
  /** YYYYMM of the observation */
  period: string;
  /** where the value sits in the 1990-2019 distribution, 0-100 */
  percentile: number;
  label: string;
  detail: string;
  cell: SwiCell;
  distanceKm: number;
  /** whole months between the observation and now */
  ageMonths: number;
  /** true when the reading is too old to inform the anticipation index */
  stale: boolean;
}

const EARTH_KM = 6371;

/** Great-circle distance, used to attach a site to its SAFRAN cell. */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Nearest SAFRAN cell to a point, or undefined when the grid is empty. */
export function nearestCell(cells: SwiCell[], lat: number, lon: number): SwiCell | undefined {
  let best: SwiCell | undefined;
  let bestD = Infinity;
  for (const c of cells) {
    const d = distanceKm(lat, lon, c.lat, c.lon);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Where a value sits in a five-point distribution, as a 0-100 percentile.
 *
 * The climatology stores min/q25/median/q75/max rather than the full series, so
 * the position is interpolated linearly between the known breakpoints. That is
 * coarse in the tails by construction — which is honest, since five points
 * cannot resolve an extreme any better — and it is monotone, which is what the
 * score depends on.
 */
export function percentileIn(q: SwiQuantiles, value: number): number {
  const [min, q25, med, q75, max] = q;
  const points: Array<[number, number]> = [
    [min, 0],
    [q25, 25],
    [med, 50],
    [q75, 75],
    [max, 100],
  ];
  if (value <= min) return 0;
  if (value >= max) return 100;
  for (let i = 1; i < points.length; i++) {
    const [x0, p0] = points[i - 1];
    const [x1, p1] = points[i];
    if (value <= x1) {
      if (x1 === x0) return p1;
      return p0 + ((value - x0) / (x1 - x0)) * (p1 - p0);
    }
  }
  return 100;
}

function label(score: number): string {
  if (score >= 85) return "Sols extrêmement secs";
  if (score >= 70) return "Sols très secs";
  if (score >= 50) return "Sols plus secs que la normale";
  if (score >= 30) return "Sols proches de la normale";
  return "Sols humides";
}

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/**
 * Standardise a monthly SWI reading against its own cell-and-month history.
 *
 * A low index means dry soil, so the stress score is the inverse of the
 * percentile: sitting at the 10th percentile of the historical range means the
 * soil is drier than 90 % of the record, hence a stress of 90.
 */
export function swiReading(
  cell: SwiCell,
  distance: number,
  period: string,
  value: number,
  quantiles: SwiQuantiles | undefined,
  now: Date = new Date(),
): SwiReading | undefined {
  if (!quantiles || quantiles.length !== 5) return undefined;
  if (!Number.isFinite(value)) return undefined;
  const percentile = percentileIn(quantiles, value);
  const score = Math.round(100 - percentile);
  const monthIndex = Number(period.slice(4, 6)) - 1;
  const monthName = MONTHS[monthIndex] ?? "ce mois";
  const ageMonths = ageInMonths(period, now);
  const stale = ageMonths > MAX_AGE_MONTHS;
  return {
    ageMonths,
    stale,
    score,
    value,
    period,
    percentile: Math.round(percentile),
    label: label(score),
    detail:
      `Indice d'humidité des sols de ${value.toFixed(2)} pour ${monthName}, ` +
      `soit plus sec que ${Math.round(100 - percentile)} % des mois de ${monthName} ` +
      `observés sur 1990-2019.` +
      (stale
        ? ` ⚠️ Dernière donnée publiée : ${monthName} ${period.slice(0, 4)} — trop ancienne pour ` +
          `éclairer les prochaines semaines, elle n'entre pas dans l'indice d'anticipation.`
        : ""),
    cell,
    distanceKm: Math.round(distance * 10) / 10,
  };
}

/**
 * Latest monthly value for one cell, from the live decade file.
 *
 * Scans line by line and keeps only the newest row for the requested cell
 * rather than parsing 650 000 rows into memory — the file is ~22 MB and only a
 * single cell is ever needed.
 */
/**
 * `null` = the file parsed fine and this cell has nothing.
 * "format-inconnu" = we could not parse the file at all, so its silence says
 * nothing about the cell. Keeping these apart is what stops a column rename at
 * Météo-France from replaying the July 2026 bug, where a parser that discarded
 * 100 % of its rows was reported to the user as "aucune mesure récente".
 */
export type SwiLookup = { period: string; value: number } | "format-inconnu" | null;

export function latestForCell(csv: string, cellNumber: number): SwiLookup {
  const wanted = String(cellNumber);
  let bestPeriod = "";
  let bestValue = Number.NaN;
  let start = 0;
  let headerSeen = false;
  let sawDataLine = false;
  let numIdx = 0;
  let dateIdx = 3;
  let swiIdx = 4;

  while (start < csv.length) {
    let end = csv.indexOf("\n", start);
    if (end === -1) end = csv.length;
    // Trimmed, not just sliced: the file uses CRLF, and SWI_UNIF_MENS is the
    // LAST column — an untrimmed "0.949\r" makes Number() return NaN, which
    // silently discards every row and reads as "no recent measure".
    const line = csv.slice(start, end).trim();
    start = end + 1;
    if (!line || line.startsWith("#")) continue;

    const cols = line.split(";").length > 1 ? line.split(";") : line.split(",");
    if (!headerSeen) {
      const upper = cols.map((c) => c.trim().toUpperCase());
      if (upper.includes("NUMERO")) {
        numIdx = upper.indexOf("NUMERO");
        dateIdx = upper.indexOf("DATE");
        swiIdx = upper.findIndex((c) => c.startsWith("SWI"));
        // A header we recognise only partially is worse than none: reading the
        // wrong column silently, or -1 (=> undefined => NaN) on every row, both
        // end as "no recent measure" with no way to tell the file changed.
        if (dateIdx < 0 || swiIdx < 0) return "format-inconnu";
        headerSeen = true;
        continue;
      }
    }
    sawDataLine = true;
    if (cols[numIdx]?.trim() !== wanted) continue;
    const period = cols[dateIdx]?.trim() ?? "";
    if (period <= bestPeriod) continue;
    const value = Number(cols[swiIdx]);
    if (!Number.isFinite(value)) continue;
    bestPeriod = period;
    bestValue = value;
  }
  // Data lines but no header ever recognised: the positional defaults (0, 3, 4)
  // would have been applied blindly to every row. An empty file, by contrast,
  // really is empty — that stays `null`.
  if (!headerSeen && sawDataLine) return "format-inconnu";
  return bestPeriod ? { period: bestPeriod, value: bestValue } : null;
}
