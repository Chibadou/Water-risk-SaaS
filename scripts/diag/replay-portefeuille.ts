// Replays the portfolio engine on the REAL decrees captured by the Actions
// diagnostic (mode `app`), then deletes nothing — see the "diag à purger"
// convention in the HANDBOOK.
//
// Why this exists: computePortfolio and the run-length calendar have only ever
// run on synthetic fixtures, because the sandbox cannot reach data.gouv. The
// unit tests prove the maths; they cannot prove the ENCODING survives contact
// with an 11 MB CSV of real arrêtés. This script closes that gap offline, from
// files a networked runner committed back.
//
//   1. push data/diag-request.json with {"mode":"app"} and a bumped run
//   2. wait for the runner to commit data/diag/
//   3. npx tsx scripts/diag/replay-portefeuille.ts
//   4. purge data/diag/
//
// Run: npx tsx scripts/diag/replay-portefeuille.ts

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { computePortfolio, mergePeriodes, type PortfolioSiteInput } from "../../lib/portefeuille";
import type { HistoryPayload, ZoneHistory } from "../../lib/history";
import type { NiveauGravite } from "../../lib/types";

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

const SITES = ["perpignan", "chartres", "lyon"] as const;

const hist = read<HistoryPayload>("pf_history_periodes.json");
const plain = read<HistoryPayload>("pf_history_plain.json");
if (!hist?.available) {
  console.error(
    "data/diag/pf_history_periodes.json absent ou indisponible — lancer d'abord le mode `app` du workflow prod-diag.",
  );
  process.exit(1);
}

let problems = 0;
const fail = (msg: string) => {
  console.error(`  ✗ ${msg}`);
  problems++;
};

// --- 1. The encoding must agree with the aggregates it was derived from -----
console.log("\n== Invariant : périodes ↔ jours agrégés (données réelles) ==");
const RANKS: Record<number, NiveauGravite> = {
  1: "vigilance", 2: "alerte", 3: "alerte_renforcee", 4: "crise",
};
let zonesChecked = 0;
for (const [code, z] of Object.entries(hist.zones)) {
  const p = (z as ZoneHistory).periodes;
  if (!p || p.length === 0) continue;
  zonesChecked++;
  const rebuilt: Record<string, Partial<Record<NiveauGravite, number>>> = {};
  for (let i = 0; i < p.length; i += 3) {
    for (let d = p[i]; d < p[i] + p[i + 1]; d++) {
      const y = String(new Date(d * 86400_000).getUTCFullYear());
      const n = RANKS[p[i + 2]];
      rebuilt[y] ??= {};
      rebuilt[y][n] = (rebuilt[y][n] ?? 0) + 1;
    }
  }
  for (const [y, expected] of Object.entries(z.parAnnee)) {
    const got = rebuilt[y] ?? {};
    if (JSON.stringify(got) !== JSON.stringify(expected.joursParNiveau)) {
      fail(`zone ${code}, ${y} : périodes ${JSON.stringify(got)} ≠ agrégat ${JSON.stringify(expected.joursParNiveau)}`);
    }
  }
  // Runs must be ordered and disjoint, or the replay would double-count days.
  for (let i = 3; i < p.length; i += 3) {
    if (p[i] < p[i - 3] + p[i - 2]) fail(`zone ${code} : périodes non disjointes autour de l'index ${i}`);
  }
}
console.log(`  ${zonesChecked} zone(s) avec calendrier vérifiées`);

// --- 2. The opt-in must change nothing but the calendar ---------------------
if (plain?.available) {
  console.log("\n== Contrat de l'opt-in ?periodes=1 ==");
  for (const [code, z] of Object.entries(plain.zones)) {
    if ((z as ZoneHistory).periodes !== undefined) fail(`zone ${code} : périodes émises sans le paramètre`);
    const withP = { ...(hist.zones[code] as ZoneHistory) };
    delete withP.periodes;
    if (JSON.stringify(withP) !== JSON.stringify(z)) fail(`zone ${code} : les agrégats diffèrent entre les deux appels`);
  }
  console.log(`  ${Object.keys(plain.zones).length} zone(s) comparées`);
} else {
  console.log("\n(pf_history_plain.json absent — contrat de l'opt-in non vérifié)");
}

// --- 3. The portfolio itself -----------------------------------------------
const inputs: PortfolioSiteInput[] = [];
for (const name of SITES) {
  const zones = read<{ zones?: Array<{ code?: string; id?: number; type?: string }> }>(`pf_zones_${name}.json`);
  const codes = (zones?.zones ?? [])
    .flatMap((z) => [z.code, z.id !== undefined ? String(z.id) : undefined])
    .filter((c): c is string => !!c);
  const periodes = mergePeriodes(codes.map((c) => (hist.zones[c] as ZoneHistory | undefined)?.periodes));
  const restr = read<{
    exposure?: Partial<Record<NiveauGravite, number>>;
    exposureInterval?: Partial<Record<NiveauGravite, { min: number; max: number }>>;
  }>(`pf_restrictions_${name}.json`);
  const sup = (zones?.zones ?? []).find((z) => z.type === "SUP");
  inputs.push({
    id: name,
    label: name,
    periodes: periodes.length > 0 ? periodes : undefined,
    exposure: restr?.exposure,
    // The interval, or the scalar widened into a degenerate one. ⚠️ Widening a
    // scalar here is a FIXTURE convenience for an old capture, not a modelling
    // choice: it asserts the arrêté was fully quantified, which is exactly what
    // G2 exists to avoid asserting. Recapture with `exposureInterval` to get the
    // real range.
    exposureInterval:
      restr?.exposureInterval ??
      (restr?.exposure
        ? Object.fromEntries(
            Object.entries(restr.exposure).map(([k, v]) => [k, { min: v as number, max: v as number }]),
          )
        : undefined),
    zoneCle: sup?.code ?? (zones?.zones ?? [])[0]?.code,
    // A plausible declared volume, so the m³ path is exercised end to end.
    volumeM3: 100_000,
    joursParNiveau: { alerte: 20, crise: 10 },
    anneesCompletes: 10,
  });
}

// The file's coverage, not the first decree: see PortfolioInput.couvertureDepuis.
const from = hist.diag?.coverage?.from;
const couvertureDepuis = from ? Number(from.slice(0, 4)) : undefined;
console.log(`\n  couverture du fichier : ${from ?? "inconnue"} → dénominateur ${couvertureDepuis ?? "premier arrêté"}`);

const result = computePortfolio({ sites: inputs, couvertureDepuis });
const s = result.simultaneite;

console.log("\n== Portefeuille rejoué sur arrêtés réels ==");
console.log(`  sites            : ${result.sites} (${s.sitesRejoues} avec calendrier)`);
console.log(`  non évalués      : ${result.sitesNonEvalues.join(", ") || "aucun"}`);
console.log(`  années rejouées  : ${s.annees[0]}–${s.annees.at(-1)} (${s.annees.length})`);
console.log(`  jours multi-sites: ${s.joursMultiSitesParAn} j/an`);
if (s.pic) {
  console.log(`  pic              : ${s.pic.sites} site(s), ${s.pic.jours} j, ${s.pic.debut} → ${s.pic.fin}`);
  console.log(`  pic pondéré      : ${s.picPondere} équivalent-sites`);
  console.log(`  membres du pic   : ${s.pic.siteIds.join(", ")}`);
}
if (s.anneePire) console.log(`  année la pire    : ${s.anneePire.annee} (${s.anneePire.siteJours} site-jours)`);
for (const c of result.concentration) {
  console.log(`  concentration ${c.cle.padEnd(11)}: ${c.groupes} groupe(s), ${c.effectifs} équivalent(s) indépendant(s)`);
}
for (const g of result.grappes) console.log(`  grappe ${g.type} ${g.cle}: ${g.labels.join(", ")}`);
console.log(`  m³ à risque      : ${result.valeur.m3Total ?? "—"} (${result.valeur.m3Sites}/${result.valeur.m3Declares} convertis)`);
console.log("\n  correlations par site :");
for (const c of result.correlations) {
  console.log(`    ${c.label.padEnd(12)} ${String(c.jours).padStart(5)} j contraints, ${c.joursPartages} partagés (${Math.round((c.partSimultanee ?? 0) * 100)} %)`);
}

// --- 4. Sanity on the real numbers -----------------------------------------
// Not assertions about France's hydrology — just the shapes that would betray a
// broken replay: a peak above the number of sites, shared days above total days,
// or a site whose days exceed the replay window.
console.log("\n== Cohérence ==");
if (s.pic && s.pic.sites > s.sitesRejoues) fail(`pic (${s.pic.sites}) supérieur au nombre de sites rejoués (${s.sitesRejoues})`);
const spanDays = s.annees.length * 366;
for (const c of result.correlations) {
  if (c.joursPartages > c.jours) fail(`${c.label} : jours partagés > jours contraints`);
  if (c.jours > spanDays) fail(`${c.label} : ${c.jours} jours contraints dépassent la fenêtre rejouée`);
}
const distTotal = s.distribution.reduce((a, b) => a + b, 0);
if (s.distribution.length > 0 && distTotal < spanDays - 366) {
  fail(`la distribution couvre ${distTotal} jours, moins que la fenêtre rejouée`);
}

if (problems > 0) {
  console.error(`\n${problems} incohérence(s) sur données réelles.`);
  process.exit(1);
}
console.log("\n✓ Rejeu réel cohérent — penser à purger data/diag/.");
