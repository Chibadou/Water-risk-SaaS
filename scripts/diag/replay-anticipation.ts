// One-off replay of lib/anticipation.ts against REAL data fetched by the
// "anticipation" mode of scripts/diag/prod-diag.sh (data/diag/anti_*.json).
// The sandbox has no egress, so the index has only ever run on synthetic
// fixtures (scripts/test/anticipation.test.ts) or the sandbox's degraded
// state. This closes that gap: real VigiEau/Hub'Eau/Onde data, computed
// through the same pure function the app calls in the browser.
//
// npx tsx scripts/diag/replay-anticipation.ts

import { readFileSync } from "node:fs";
import { computeAnticipation, type SignalInput } from "../../lib/anticipation";
import type { YearHistory } from "../../lib/history";

const DIAG = new URL("../../data/diag/", import.meta.url);

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`${name}.json`, DIAG), "utf-8"));
}

interface ZonesResponse {
  zones: Array<{ code?: string; id?: number; niveauGravite?: string; type: string }>;
  message?: string;
  notCovered?: boolean;
}
interface HistoryZone {
  joursAlertePlusMoyen?: number;
  anneesCompletes?: number;
  parAnnee?: Record<string, YearHistory>;
  parMois?: Record<string, Record<number, number>>;
}
interface HistoryPayload {
  available: boolean;
  zones: Record<string, HistoryZone>;
}
interface IndicatorSelected {
  trend?: SignalInput["trend"];
  higherIsBetter?: boolean;
  reference?: { score: number };
  station?: { distanceKm?: number };
}
interface IndicatorPayload {
  selected?: IndicatorSelected;
  message?: string;
}

function maxGravite(niveaux: (string | undefined)[]): string | null {
  const order = ["vigilance", "alerte", "alerte_renforcee", "crise"];
  let best: string | null = null;
  for (const n of niveaux) {
    if (!n) continue;
    if (!best || order.indexOf(n) > order.indexOf(best)) best = n;
  }
  return best;
}

function toSignal(ind: IndicatorPayload | undefined): SignalInput | null | undefined {
  if (!ind) return undefined;
  const s = ind.selected;
  if (!s) return null;
  return { score: s.reference?.score, trend: s.trend, higherIsBetter: s.higherIsBetter };
}

const zones = readJson("anti_zones") as ZonesResponse;
const history = readJson("anti_history") as HistoryPayload;
const onde = readJson("anti_onde") as { available: boolean; score?: number };
const hydro = readJson("anti_hydro") as IndicatorPayload;
const piezo = readJson("anti_piezo") as IndicatorPayload;

console.log("=== raw inputs ===");
console.log("zones:", JSON.stringify(zones).slice(0, 300));
console.log("onde available:", onde.available, onde.available ? `score=${onde.score}` : "");
console.log("hydro selected:", !!hydro.selected, hydro.selected?.reference);
console.log("piezo selected:", !!piezo.selected, piezo.selected?.reference);

const codes = zones.zones
  .flatMap((z) => [z.code, z.id !== undefined ? String(z.id) : undefined])
  .filter((c): c is string => !!c);
let best: HistoryZone | undefined;
for (const c of codes) {
  const z = history.zones?.[c];
  if (!z) continue;
  const score = z.joursAlertePlusMoyen ?? 0;
  const bestScore = best ? best.joursAlertePlusMoyen ?? 0 : -1;
  if (score > bestScore) best = z;
}

const worst =
  zones.message && zones.zones.length === 0 ? null : maxGravite(zones.zones.map((z) => z.niveauGravite));

const result = computeAnticipation({
  worst,
  anneesCompletes: best?.anneesCompletes,
  parMois: best?.parMois,
  parAnnee: best?.parAnnee,
  nappe: toSignal(piezo),
  debit: toSignal(hydro),
  onde: onde.available ? { score: onde.score } : onde.available === false ? null : undefined,
  stationDistanceKm: piezo.selected?.station?.distanceKm ?? hydro.selected?.station?.distanceKm,
});

console.log("\n=== computeAnticipation result (REAL data) ===");
console.log("available:", result.available);
if (result.available) {
  console.log("level:", result.level.label, `(${result.level.rank}/4)`);
  console.log("horizon:", result.horizonLabel);
  console.log("confidence:", result.confidence, "-", result.confidenceDetail);
  console.log("caveat:", result.caveat);
  console.log("drivers:");
  for (const d of result.drivers) {
    console.log(`  [${d.direction}] ${d.label}${d.score !== undefined ? ` (${d.score}/100)` : ""}${d.weightPct !== undefined ? ` weight=${d.weightPct}%` : ""} — ${d.detail}`);
  }
} else {
  console.log("message:", result.message);
  console.log("caveat:", result.caveat);
}
