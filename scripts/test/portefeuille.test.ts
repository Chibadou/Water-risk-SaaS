// Tests for lib/portefeuille.ts — the portfolio layer.
// Run: npx tsx scripts/test/portefeuille.test.ts
//
// The demonstration this module exists for is a single comparison: two parcs
// with the SAME total of constrained days, one concentrated and one spread, must
// come out differently. If that test ever passes trivially, the module is doing
// nothing.

import { readFileSync } from "node:fs";
import {
  computePortfolio,
  mergePeriodes,
  DEPENDANCE_FACTOR,
  REVENUE_SHARE_PER_DAY,
  type PortfolioSiteInput,
} from "../../lib/portefeuille";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

const DAY_MS = 86400_000;
const day = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
/** Deterministic clock: 2026 is "now", so 2024 and 2025 are complete years. */
const NOW = new Date("2026-08-04T00:00:00Z");

const ALERTE = 2;
const CRISE = 4;

/** A site under alerte for `len` days from the given date. */
const site = (
  id: string,
  runs: number[],
  extra: Partial<PortfolioSiteInput> = {},
): PortfolioSiteInput => ({ id, label: `Site ${id}`, periodes: runs, ...extra });

// ---------------------------------------------------------------------------
// 1. Simultaneity — the core claim
// ---------------------------------------------------------------------------
{
  // Two sites, 30 constrained days each, SAME 30 days.
  const concentre = computePortfolio({
    now: NOW,
    sites: [
      site("a", [day(2025, 7, 1), 30, ALERTE], { zoneCle: "Z1" }),
      site("b", [day(2025, 7, 1), 30, ALERTE], { zoneCle: "Z1" }),
    ],
  });
  // Two sites, 30 constrained days each, DISJOINT days.
  const disperse = computePortfolio({
    now: NOW,
    sites: [
      site("a", [day(2025, 6, 1), 30, ALERTE], { zoneCle: "Z1" }),
      site("b", [day(2025, 8, 1), 30, ALERTE], { zoneCle: "Z2" }),
    ],
  });

  const joursTotal = (r: ReturnType<typeof computePortfolio>) =>
    r.correlations.reduce((a, c) => a + c.jours, 0);

  check("same total constrained days in both parcs", joursTotal(concentre) === joursTotal(disperse));
  check("concentrated parc peaks at 2 sites at once", concentre.simultaneite.pic?.sites === 2);
  check("spread parc never exceeds 1 site at once", disperse.simultaneite.pic?.sites === 1);
  check("concentrated peak keeps its 30-day length", concentre.simultaneite.pic?.jours === 30);
  check("concentrated peak is dated", concentre.simultaneite.pic?.debut === "2025-07-01");
  check("concentrated peak names both sites",
    concentre.simultaneite.pic?.siteIds.join(",") === "a,b");
  check("multi-site days counted only when they overlap",
    (concentre.simultaneite.joursMultiSitesParAn ?? 0) > 0 &&
      disperse.simultaneite.joursMultiSitesParAn === 0);

  // Distribution: 30 days with 2 sites for the concentrated parc, 60 days with
  // exactly 1 for the spread one.
  check("distribution: concentrated has 30 days at k=2", concentre.simultaneite.distribution[2] === 30);
  check("distribution: spread has 60 days at k=1", disperse.simultaneite.distribution[1] === 60);
  check("distribution: spread has no day at k=2", (disperse.simultaneite.distribution[2] ?? 0) === 0);

  // Per-site correlation
  check("concentrated: every constrained day is shared",
    concentre.correlations.every((c) => c.partSimultanee === 1));
  check("spread: no constrained day is shared",
    disperse.correlations.every((c) => c.partSimultanee === 0));
}

// ---------------------------------------------------------------------------
// 2. The current (partial) year is excluded from the replay
// ---------------------------------------------------------------------------
{
  const r = computePortfolio({
    now: NOW,
    sites: [
      site("a", [day(2025, 7, 1), 10, ALERTE, day(2026, 7, 1), 10, CRISE]),
    ],
  });
  check("replay stops at the last complete year", r.simultaneite.annees.at(-1) === 2025);
  check("current-year days are not replayed", r.correlations[0].jours === 10);
}

// ---------------------------------------------------------------------------
// 3. Quiet years inside the range count as zeros, not as gaps
// ---------------------------------------------------------------------------
{
  const r = computePortfolio({
    now: NOW,
    sites: [site("a", [day(2022, 7, 1), 10, ALERTE, day(2025, 7, 1), 10, ALERTE])],
  });
  check("range spans every year from first decree to last complete one",
    r.simultaneite.annees.join(",") === "2022,2023,2024,2025");
  check("quiet years dilute the per-year mean rather than disappearing",
    r.simultaneite.joursMultiSitesParAn === 0);
  check("worst year identified", r.simultaneite.anneePire?.siteJours === 10);
}

// ---------------------------------------------------------------------------
// 4. Vigilance is not a constraint
// ---------------------------------------------------------------------------
{
  const r = computePortfolio({
    now: NOW,
    sites: [site("a", [day(2025, 7, 1), 30, 1 /* vigilance */])],
  });
  check("vigilance days are not counted as constrained", r.correlations[0].jours === 0);
  check("no peak when nothing is constrained", r.simultaneite.pic === undefined);
}

// ---------------------------------------------------------------------------
// 5. Concentration — HHI and its readable inverse
// ---------------------------------------------------------------------------
{
  const runs = [day(2025, 7, 1), 10, ALERTE];
  const spread = computePortfolio({
    now: NOW,
    sites: Array.from({ length: 20 }, (_, i) => site(`s${i}`, runs, { zoneCle: `Z${i}` })),
  });
  const packed = computePortfolio({
    now: NOW,
    sites: Array.from({ length: 20 }, (_, i) => site(`s${i}`, runs, { zoneCle: "Z0" })),
  });
  const zoneOf = (r: ReturnType<typeof computePortfolio>) =>
    r.concentration.find((c) => c.cle === "zone");

  check("20 sites on 20 zones behave like 20 independent zones", zoneOf(spread)?.effectifs === 20);
  check("20 sites on 1 zone behave like 1", zoneOf(packed)?.effectifs === 1);
  check("HHI is 1 when everything sits in one zone", zoneOf(packed)?.hhi === 1);
  check("biggest group reported with its share",
    zoneOf(packed)?.plusGrosGroupe?.sites === 20 && zoneOf(packed)?.plusGrosGroupe?.part === 1);
  check("a key nobody carries produces no concentration line",
    spread.concentration.find((c) => c.cle === "bassin") === undefined);
}

// ---------------------------------------------------------------------------
// 6. Co-exposed clusters
// ---------------------------------------------------------------------------
{
  const runs = [day(2025, 7, 1), 10, ALERTE];
  const r = computePortfolio({
    now: NOW,
    sites: [
      site("a", runs, { zoneCle: "Z1", bassin: "H", joursContraints: 12 }),
      site("b", runs, { zoneCle: "Z1", bassin: "H", joursContraints: 8 }),
      site("c", runs, { zoneCle: "Z2", bassin: "H", joursContraints: 5 }),
    ],
  });
  const zoneGrappe = r.grappes.find((g) => g.type === "zone");
  check("a lone site is not a cluster", r.grappes.every((g) => g.siteIds.length >= 2));
  check("shared zone forms a cluster of 2", zoneGrappe?.siteIds.join(",") === "a,b");
  check("cluster sums the constrained days of its members", zoneGrappe?.joursContraints === 20);
  check("zone clusters rank before basin clusters", r.grappes[0].type === "zone");
  check("shared basin forms its own cluster of 3",
    r.grappes.find((g) => g.type === "bassin")?.siteIds.length === 3);
}

// ---------------------------------------------------------------------------
// 7. m³ and € at risk — declared, never guessed
// ---------------------------------------------------------------------------
{
  const runs = [day(2025, 7, 1), 10, ALERTE];
  const r = computePortfolio({
    now: NOW,
    sites: [
      // 36 500 m³/an over 36.5 constrained days → 3 650 m³ at risk.
      site("a", runs, { joursContraints: 36.5, volumeM3: 36500, coutJourEuros: 1000 }),
      // revenue fallback only
      site("b", runs, { joursContraints: 10, caAnnuelEuros: 2_000_000 }),
      // no internal data at all
      site("c", runs, { joursContraints: 20 }),
    ],
  });
  const of = (id: string) => r.valeur.parSite.find((v) => v.id === id);

  check("m³ at risk = volume × days / 365", of("a")?.m3ARisque === 3650);
  check("declared cost per day is used as declared", of("a")?.eurosARisque === 36500);
  check("declared euros are flagged as declared", of("a")?.eurosSource === "declare");
  check("revenue fallback applies Swiss Re's 0.5 %/day",
    of("b")?.eurosARisque === 2_000_000 * REVENUE_SHARE_PER_DAY * 10);
  check("fallback euros are flagged as a fallback", of("b")?.eurosSource === "repli_ca");
  check("portfolio flags that a fallback was used", r.valeur.eurosParRepli === true);

  // The rule that matters: absence is never zero.
  check("a site without volume has no m³ figure", of("c")?.m3ARisque === undefined);
  check("a site without volume is excluded from the m³ denominator", r.valeur.m3Sites === 1);
  check("m³ total covers only the estimated sites", r.valeur.m3Total === 3650);
  check("€ denominator counts only sites with a euro figure", r.valeur.eurosSites === 2);
}

// ---------------------------------------------------------------------------
// 8. Storage autonomy — the reason the run-length calendar exists
// ---------------------------------------------------------------------------
{
  // Five separate 2-day episodes in 2025, a 3-day buffer: nothing ever stops.
  const short = [
    day(2025, 6, 1), 2, ALERTE,
    day(2025, 6, 10), 2, ALERTE,
    day(2025, 6, 20), 2, ALERTE,
    day(2025, 7, 1), 2, ALERTE,
    day(2025, 7, 10), 2, ALERTE,
  ];
  const r = computePortfolio({
    now: NOW,
    sites: [
      site("buffered", short, { autonomieJours: 3, joursContraints: 10 }),
      site("unbuffered", short, { autonomieJours: 0, joursContraints: 10 }),
      // one 30-day episode, same 3-day buffer: 27 days of real stoppage
      site("long", [day(2025, 7, 1), 30, ALERTE], { autonomieJours: 3, joursContraints: 30 }),
    ],
  });
  const of = (id: string) => r.valeur.parSite.find((v) => v.id === id);

  check("a 3-day buffer absorbs 2-day episodes entirely", of("buffered")?.joursArretNet === 0);
  check("absorbing the stoppage does not zero the constrained days",
    r.correlations.find((c) => c.id === "buffered")?.jours === 10);
  check("without a buffer every constrained day stops the site",
    of("unbuffered")?.joursArretNet === 10);
  check("a long episode outlasts the buffer", of("long")?.joursArretNet === 27);
  check("a site that declares no autonomy gets no net figure",
    computePortfolio({ now: NOW, sites: [site("x", short, { joursContraints: 10 })] })
      .valeur.parSite[0].joursArretNet === undefined);

  // Adjacent runs of different levels are ONE episode: an alerte hardening into
  // crise never let the tank refill.
  const escalating = computePortfolio({
    now: NOW,
    sites: [site("e", [day(2025, 7, 1), 10, ALERTE, day(2025, 7, 11), 10, CRISE], {
      autonomieJours: 3,
      joursContraints: 20,
    })],
  });
  check("adjacent levels form a single episode against the buffer",
    escalating.valeur.parSite[0].joursArretNet === 17);
}

// ---------------------------------------------------------------------------
// 9. Degradation — a site without a calendar is unassessed, not risk-free
// ---------------------------------------------------------------------------
{
  const r = computePortfolio({
    now: NOW,
    sites: [
      site("a", [day(2025, 7, 1), 10, ALERTE], { zoneCle: "Z1" }),
      { id: "b", label: "Site b", zoneCle: "Z2", volumeM3: 1000, joursContraints: 10 },
    ],
  });
  check("a site without a calendar is listed as unassessed", r.sitesNonEvalues.join(",") === "b");
  check("it is excluded from the replay denominator", r.simultaneite.sitesRejoues === 1);
  check("it is NOT counted as a constrained-free site in the peak",
    r.simultaneite.pic?.sites === 1);
  check("but it still gets its m³ figure", r.valeur.parSite.find((v) => v.id === "b")?.m3ARisque === 27);
  check("and it still counts for concentration",
    r.concentration.find((c) => c.cle === "zone")?.sites === 2);

  const none = computePortfolio({ now: NOW, sites: [{ id: "x", label: "X" }] });
  check("no calendar at all → simultaneity unavailable, with a message",
    none.simultaneite.available === false && !!none.simultaneite.message);
  check("empty portfolio does not throw",
    computePortfolio({ now: NOW, sites: [] }).simultaneite.available === false);
}

// ---------------------------------------------------------------------------
// 10. Weighted peak — heads counted vs activity actually stopped
// ---------------------------------------------------------------------------
{
  const runs = [day(2025, 7, 1), 10, ALERTE];
  const r = computePortfolio({
    now: NOW,
    sites: [
      site("a", runs, { exposure: { alerte: 0.5 }, dependance: "moyenne" }),
      site("b", runs, { exposure: { alerte: 0.5 }, dependance: "moyenne" }),
    ],
  });
  check("head count and weighted count differ",
    r.simultaneite.pic?.sites === 2 && r.simultaneite.picPondere === 1);

  const critique = computePortfolio({
    now: NOW,
    sites: [site("a", runs, { exposure: { alerte: 0.8 }, dependance: "critique" })],
  });
  check("exposure × dependence is capped at one site's worth",
    critique.simultaneite.picPondere === 1);

  const unknown = computePortfolio({ now: NOW, sites: [site("a", runs)] });
  check("unknown exposure contributes nothing rather than a default",
    unknown.simultaneite.picPondere === 0);
}

// ---------------------------------------------------------------------------
// 11. mergePeriodes — several zones cover one site
// ---------------------------------------------------------------------------
{
  const merged = mergePeriodes([
    [day(2025, 7, 1), 10, ALERTE],
    [day(2025, 7, 5), 10, CRISE],
  ]);
  // Days 1-4 alerte, 5-14 crise: the worst level wins per day.
  check("merge keeps the worst level per day", merged.length === 6);
  check("merge: first run is the alerte prefix",
    merged[0] === day(2025, 7, 1) && merged[1] === 4 && merged[2] === ALERTE);
  check("merge: second run is the crise remainder",
    merged[3] === day(2025, 7, 5) && merged[4] === 10 && merged[5] === CRISE);
  check("merging one calendar returns it unchanged",
    mergePeriodes([[1, 2, 3]]).join(",") === "1,2,3");
  check("merging nothing yields an empty calendar", mergePeriodes([undefined, []]).length === 0);
}

// ---------------------------------------------------------------------------
// 12. Calibration stays in step with lib/interruption.ts
// ---------------------------------------------------------------------------
{
  // The two modules keep their own copy on purpose; this catches the drift that
  // makes one of them silently disagree with the other.
  const source = readFileSync("lib/interruption.ts", "utf-8");
  const ok = (["faible", "moyenne", "forte", "critique"] as const).every((k) =>
    new RegExp(`${k}:\\s*${DEPENDANCE_FACTOR[k]}\\b`).test(source),
  );
  check("dependence factors match lib/interruption.ts", ok);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("portefeuille: all checks pass");
