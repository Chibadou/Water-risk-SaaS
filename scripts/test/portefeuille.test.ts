// Tests for lib/portefeuille.ts — the portfolio layer.
// Run: npx tsx scripts/test/portefeuille.test.ts
//
// The demonstration this module exists for is a single comparison: two parcs
// with the SAME total of constrained days, one concentrated and one spread, must
// come out differently. If that test ever passes trivially, the module is doing
// nothing.

import { readFileSync } from "node:fs";
import {
  classementMateriel,
  computePortfolio,
  mergePeriodes,
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

/**
 * A site with everything the IA and the VNP need to produce a figure.
 *
 * ⚠️ This helper is the visible price of Sprint 42b, and it is deliberate. The
 * old `joursArretNet` needed only `autonomieJours` and a calendar: any restricted
 * day beyond the buffer counted as a FULL stop, so it produced a number from
 * almost nothing by assuming the worst. The JEA needs a reference volume and a
 * readable ρ, and REFUSES without them. Fewer sites get a figure; the ones that
 * do get one that means something.
 *
 * 365 000 m³/an = 1 000 m³/day, which makes the arithmetic below checkable by hand.
 */
const declared = (
  id: string,
  runs: number[],
  extra: Partial<PortfolioSiteInput> = {},
): PortfolioSiteInput =>
  site(id, runs, {
    volumeM3: 365_000,
    exposureInterval: { alerte: { min: 1, max: 1 }, crise: { min: 1, max: 1 } },
    joursParNiveau: { alerte: 20 },
    anneesCompletes: 10,
    ...extra,
  });

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
// 3b. The denominator is the file's coverage, not the first decree
// ---------------------------------------------------------------------------
// Caught on real data, invisible on fixtures: VigiEau redraws its zone
// referential, so a code in force today has no history before it existed. Lyon's
// 84_69_0004 starts in 2022 inside a file covering 2017→ — dating the window
// from the first decree divided per-year figures by 4 instead of 9.
{
  const sitesTwoZones = [
    site("a", [day(2024, 7, 1), 20, ALERTE]),
    site("b", [day(2024, 7, 1), 20, ALERTE]),
  ];
  const naif = computePortfolio({ now: NOW, sites: sitesTwoZones });
  const couvert = computePortfolio({ now: NOW, sites: sitesTwoZones, couvertureDepuis: 2017 });

  check("without coverage, the window starts at the first decree",
    naif.simultaneite.annees.join(",") === "2024,2025");
  check("with coverage, the window starts where the file does",
    couvert.simultaneite.annees[0] === 2017 && couvert.simultaneite.annees.length === 9);
  check("covered-but-quiet years dilute the per-year figure",
    (naif.simultaneite.joursMultiSitesParAn ?? 0) > (couvert.simultaneite.joursMultiSitesParAn ?? 0));
  check("the measured days themselves are unchanged",
    naif.correlations[0].jours === couvert.correlations[0].jours);
  check("20 shared days over 9 covered years",
    couvert.simultaneite.joursMultiSitesParAn === Math.round((20 / 9) * 10) / 10);

  // A coverage claim later than the data must not truncate the replay.
  const incoherent = computePortfolio({ now: NOW, sites: sitesTwoZones, couvertureDepuis: 2030 });
  check("a coverage year after the data is ignored, never truncating",
    incoherent.simultaneite.annees[0] === 2024);

  // The storage-autonomy mean shares the denominator, or one figure would be
  // per-covered-year and the other per-year-with-an-episode.
  const auto = computePortfolio({
    now: NOW,
    couvertureDepuis: 2017,
    sites: [declared("x", [day(2024, 7, 1), 20, ALERTE], { autonomieJours: 0 })],
  });
  // 20 days of total ban with no buffer, over the 9 covered years: 2.2 JEA/an.
  check("the JEA uses the covered window as its denominator too",
    auto.valeur.parSite[0].jea === Math.round((20 / 9) * 10) / 10);
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
      declared("a", runs, { zoneCle: "Z1", bassin: "H", autonomieJours: 0 }),
      declared("b", runs, { zoneCle: "Z1", bassin: "H", autonomieJours: 0 }),
      declared("c", runs, { zoneCle: "Z2", bassin: "H", autonomieJours: 0 }),
    ],
  });
  const zoneGrappe = r.grappes.find((g) => g.type === "zone");
  check("a lone site is not a cluster", r.grappes.every((g) => g.siteIds.length >= 2));
  check("shared zone forms a cluster of 2", zoneGrappe?.siteIds.join(",") === "a,b");
  // Both members: one 10-day total ban with no buffer, over one covered year.
  check("cluster sums the JEA of its members", zoneGrappe?.jea === 20);
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
      // 20 alerte days/an at ρ = 1 on 365 000 m³/an → 20 × 1 000 = 20 000 m³.
      declared("a", runs, { autonomieJours: 0, coutJourEuros: 1000 }),
      // Declares a revenue but no cost per day. Used to get a euro figure from
      // the 0.5 %/day fallback; must now get NONE.
      declared("b", runs, { autonomieJours: 0 }),
      // No volume at all: no VNP, and no JEA either.
      site("c", runs, { exposureInterval: { alerte: { min: 1, max: 1 } } }),
    ],
  });
  const of = (id: string) => r.valeur.parSite.find((v) => v.id === id);

  // ⚠️ The VNP is no longer `volume × days / 365`. It is the note's own formula:
  // the restrictable volume, times ρ, day by day. Here everything is quantified
  // and nothing is exempt, so the two happen to agree — which is why the next
  // section checks a case where they cannot.
  check("VNP = Σ days × daily volume × ρ", of("a")?.m3ARisque === 20_000);
  check("a fully quantified ρ leaves no range", of("a")?.m3ARisqueMax === 20_000);
  // 10 days of total ban, no buffer, one covered year → 10 JEA.
  check("euros = declared cost per day × JEA", of("a")?.eurosARisque === 10_000);
  check("a site that declares no cost per day gets NO euro figure (G6)",
    of("b")?.eurosARisque === undefined);
  check("€ denominator counts only sites with a declared cost", r.valeur.eurosSites === 1);

  // The rule that matters: absence is never zero.
  check("a site without volume has no VNP", of("c")?.m3ARisque === undefined);
  check("a site without volume has no JEA either", of("c")?.jea === undefined);
  check("a site without volume is excluded from the m³ denominator", r.valeur.m3Sites === 2);
  check("m³ total covers only the estimated sites", r.valeur.m3Total === 40_000);
  check("the JEA denominator counts only sites with a figure", r.valeur.jeaSites === 2);
}

// ---------------------------------------------------------------------------
// 7 bis. The ρ interval survives to the portfolio (G2)
// ---------------------------------------------------------------------------
{
  const r = computePortfolio({
    now: NOW,
    sites: [
      declared("i", [day(2025, 7, 1), 10, ALERTE], {
        autonomieJours: 0,
        // An unquantified measure at alerte: ρ ∈ [0.4, 1].
        exposureInterval: { alerte: { min: 0.4, max: 1 } },
      }),
    ],
  });
  const v = r.valeur.parSite[0];
  check("interval: the VNP lower bound uses ρ_min", v.m3ARisque === 8_000);
  check("interval: … and the upper bound ρ_max", v.m3ARisqueMax === 20_000);
  check("interval: the JEA carries the same range", v.jea === 4 && v.jeaMax === 10);
  check("interval: the range is real, not a point", (v.jeaMax ?? 0) > (v.jea ?? 0));
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
      declared("buffered", short, { autonomieJours: 3 }),
      declared("unbuffered", short, { autonomieJours: 0 }),
      // one 30-day episode, same 3-day buffer: 27 days of real stoppage
      declared("long", [day(2025, 7, 1), 30, ALERTE], { autonomieJours: 3 }),
    ],
  });
  const of = (id: string) => r.valeur.parSite.find((v) => v.id === id);

  check("a 3-day buffer absorbs 2-day episodes entirely", of("buffered")?.jea === 0);
  check("absorbing the stoppage does not zero the constrained days",
    r.correlations.find((c) => c.id === "buffered")?.jours === 10);
  check("without a buffer every totally banned day stops the site",
    of("unbuffered")?.jea === 10);
  check("a long episode outlasts the buffer", of("long")?.jea === 27);
  // ⚠️ This is the convexity of §4.3, and it is the whole reason the run-length
  // calendar is fetched: SAME ten days at 'buffered' cost 0, the same buffer over
  // one long episode costs 27. An annual day total cannot tell the two apart.
  check("convexity: equal buffers, opposite outcomes by episode structure",
    of("buffered")?.jea === 0 && (of("long")?.jea ?? 0) > 25);
  check("a site with no declared volume gets no JEA, not a zero one",
    computePortfolio({
      now: NOW,
      sites: [site("x", short, { exposureInterval: { alerte: { min: 1, max: 1 } } })],
    }).valeur.parSite[0].jea === undefined);

  // Adjacent runs of different levels are ONE episode: an alerte hardening into
  // crise never let the tank refill.
  const escalating = computePortfolio({
    now: NOW,
    sites: [declared("e", [day(2025, 7, 1), 10, ALERTE, day(2025, 7, 11), 10, CRISE], {
      autonomieJours: 3,
    })],
  });
  // ⚠️ 17, not 14. The RLE calendar stores these as TWO runs because the level
  // changes, and the buffer must NOT refill between them: the restriction never
  // lifted. Sprint 42b found exactly this defect when the portfolio stopped using
  // its own merging decoder — the unconditional refill absorbed 3 days twice.
  check("adjacent levels do not let the buffer refill",
    escalating.valeur.parSite[0].jea === 17);
}

// ---------------------------------------------------------------------------
// 9. Degradation — a site without a calendar is unassessed, not risk-free
// ---------------------------------------------------------------------------
{
  const r = computePortfolio({
    now: NOW,
    sites: [
      site("a", [day(2025, 7, 1), 10, ALERTE], { zoneCle: "Z1" }),
      // No calendar, but a declared volume and a readable ρ: the VNP needs
      // neither the calendar nor the episodes, so it must still be produced.
      {
        id: "b", label: "Site b", zoneCle: "Z2", volumeM3: 1000,
        joursParNiveau: { alerte: 10 },
        exposureInterval: { alerte: { min: 1, max: 1 } },
      },
    ],
  });
  check("a site without a calendar is listed as unassessed", r.sitesNonEvalues.join(",") === "b");
  check("it is excluded from the replay denominator", r.simultaneite.sitesRejoues === 1);
  check("it is NOT counted as a constrained-free site in the peak",
    r.simultaneite.pic?.sites === 1);
  // 1 000 m³/an = 2.74 m³/day, ten banned days → 27 m³.
  check("but it still gets its VNP: that needs no calendar",
    r.valeur.parSite.find((v) => v.id === "b")?.m3ARisque === 27);
  check("… while its JEA is absent, because THAT needs the episodes",
    r.valeur.parSite.find((v) => v.id === "b")?.jea === undefined);
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
      site("a", runs, { exposure: { alerte: 0.5 } }),
      site("b", runs, { exposure: { alerte: 0.5 } }),
    ],
  });
  check("head count and weighted count differ",
    r.simultaneite.pic?.sites === 2 && r.simultaneite.picPondere === 1);

  // ⚠️ The weighted peak is now the exposure the ARRÊTÉ states, full stop. It used
  // to be multiplied by DEPENDANCE_FACTOR, so a "critique" site at ρ = 0.8 counted
  // as a full site (0.8 × 1.4, capped at 1) — the cap hid the fact that an
  // invented coefficient had moved a measured figure by 40 %.
  const fort = computePortfolio({
    now: NOW,
    sites: [site("a", runs, { exposure: { alerte: 0.8 } })],
  });
  check("the weighted peak is the read exposure, no longer scaled by a dependence factor",
    fort.simultaneite.picPondere === 0.8);

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
  // A zone arrives twice — once under its code, once under its numeric id —
  // as the SAME array. Deduping by reference keeps that on the trivial path.
  const shared = [day(2025, 7, 1), 10, ALERTE];
  check("the same calendar passed twice is returned, not re-merged",
    mergePeriodes([shared, shared]) === shared);
  check("merging nothing yields an empty calendar", mergePeriodes([undefined, []]).length === 0);
}

// ---------------------------------------------------------------------------
// 12. The two removed coefficients stay removed (G6, G10)
// ---------------------------------------------------------------------------
{
  // This section replaces the mirror test that kept portefeuille's
  // DEPENDANCE_FACTOR in step with the copy in lib/interruption.ts — by reading
  // that module's source text. Sprint 42b deleted the module, and the test would
  // have failed at `readFileSync` rather than at type-checking, in a suite whose
  // name mentions neither. It was flagged in SPRINTS.md precisely so it would be
  // handled WITH the removal and not discovered by it.
  //
  // What replaces it is the durable guard rather than the drift guard: both
  // coefficients must stay absent from the engine. A well-meaning "we need
  // something in the euro column" is exactly how anti-pattern n°10 comes back,
  // and it would come back as a plausible-looking one-liner.
  const modules = [
    "lib/portefeuille.ts",
    "lib/ia.ts",
    "lib/js.ts",
    "lib/vnp.ts",
    "lib/synthese.ts",
    "lib/executive.ts",
  ];
  const forbidden: { pattern: RegExp; why: string }[] = [
    { pattern: /DEPENDANCE_FACTOR\s*[:=]/, why: "invented 0.6-1.8 multiplier on a measured count" },
    { pattern: /REVENUE_SHARE_PER_DAY\s*[:=]/, why: "0.5 %/day of revenue — anti-pattern n°10" },
    { pattern: /caAnnuelEuros\s*\*/, why: "any arithmetic on annual revenue" },
    { pattern: /\*\s*0\.005\b/, why: "the same 0.5 % written as a literal" },
  ];
  for (const m of modules) {
    const src = readFileSync(m, "utf-8");
    for (const f of forbidden) {
      // Comments are allowed to NAME them — that is how the removal stays
      // explicable. Only code lines are checked.
      const code = src
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      check(`${m} does not reintroduce ${f.why}`, !f.pattern.test(code));
    }
  }

  // And lib/interruption.ts itself is gone, not merely unused.
  let stillThere = true;
  try {
    readFileSync("lib/interruption.ts", "utf-8");
  } catch {
    stillThere = false;
  }
  check("lib/interruption.ts is deleted, not left dangling", !stillThere);
}

// ---- Materiality of the ranking (arbitration settled 2026-08-11) ----
//
// ⚠️ The question was « from what gap are two sites genuinely ranked rather than separated
// by noise? ». The answer uses the intervals the repo already carries instead of an
// invented threshold: two sites are ordered when their [jea, jeaMax] ranges are DISJOINT.
{
  // Disjoint ranges: a defensible order, one class each.
  const net = classementMateriel([
    { id: "a", jea: 30, jeaMax: 32 },
    { id: "b", jea: 20, jeaMax: 22 },
    { id: "c", jea: 5, jeaMax: 6 },
  ]);
  check("materialite: disjoint intervals give one class per site",
    net.classes.length === 3 && net.classes.every((c) => c.sites.length === 1));
  check("materialite: the most exposed class is rank 1",
    net.classes[0].sites[0] === "a" && net.classes[0].rang === 1);
  check("materialite: … and the trail says the ranking is defensible",
    /disjointes : le classement est défendable/.test(net.detail));

  // Overlapping ranges: refused, not ordered.
  const flou = classementMateriel([
    { id: "a", jea: 30, jeaMax: 40 },
    { id: "b", jea: 35, jeaMax: 45 },
  ]);
  check("materialite: overlapping intervals are ex aequo, not ordered",
    flou.classes.length === 1 && flou.classes[0].sites.length === 2);
  // ⚠️ With everything in ONE class the trail takes the stronger wording — "the tool does
  // not order them, and that IS the result" — rather than the ex-aequo phrasing, which is
  // for a parc that is partly separable. A first version of this check asserted the wrong
  // branch and failed; the two messages exist because the two situations differ.
  check("materialite: … and a fully overlapping parc says the tool does not order it",
    /l'outil ne les ordonne pas/.test(flou.detail)
      && /Ce n'est pas une absence de résultat/.test(flou.detail));

  // Partly separable: one clear leader, then two that tie. This is where the ex-aequo
  // wording belongs, and it is the common real case.
  const mixte = classementMateriel([
    { id: "loin", jea: 80, jeaMax: 82 },
    { id: "a", jea: 30, jeaMax: 40 },
    { id: "b", jea: 35, jeaMax: 45 },
  ]);
  check("materialite: a clear leader is separated while the other two tie",
    mixte.classes.length === 2
      && mixte.classes[0].sites.join() === "loin"
      && mixte.classes[1].sites.length === 2);
  check("materialite: … and the trail says ordering the tied pair would be noise",
    /présenter du bruit comme un écart/.test(mixte.detail));

  // ⚠️ THE property a naive pairwise implementation gets wrong. A-B overlap, B-C overlap,
  // A-C do NOT. Separating A from C while both tie with B is a ranking that contradicts
  // itself, so all three must land in one class — connected components, not neighbours.
  const chaine = classementMateriel([
    { id: "a", jea: 30, jeaMax: 40 },
    { id: "b", jea: 25, jeaMax: 35 },
    { id: "c", jea: 20, jeaMax: 26 },
  ]);
  check("materialite: overlap is treated as NON-transitive-safe (connected components)",
    chaine.classes.length === 1 && chaine.classes[0].sites.length === 3);
  check("materialite: … and the class envelope spans the whole chain",
    chaine.classes[0].jeaMin === 20 && chaine.classes[0].jeaMax === 40);

  // A point estimate with no upper bound is its own interval, not an infinite one.
  const points = classementMateriel([{ id: "a", jea: 10 }, { id: "b", jea: 5 }]);
  check("materialite: a JEA with no upper bound is a point, so the order stands",
    points.classes.length === 2);

  // Absent is not last — the repo's central rule, applied to ranking.
  const manquant = classementMateriel([
    { id: "a", jea: 10, jeaMax: 11 },
    { id: "sans", jea: undefined },
  ]);
  check("materialite: a site with no JEA is NOT ranked last, it is unranked",
    manquant.nonClasses.includes("sans")
      && manquant.classes.every((c) => !c.sites.includes("sans")));
  check("materialite: … and the trail says so in those terms",
    /absent n'est pas dernier/.test(manquant.detail));

  // Wide intervals collapsing the whole portfolio is the CORRECT output, not a failure.
  const large = classementMateriel([
    { id: "a", jea: 1, jeaMax: 100 },
    { id: "b", jea: 2, jeaMax: 90 },
    { id: "c", jea: 3, jeaMax: 80 },
  ]);
  check("materialite: unquantified measures can collapse the parc into one class",
    large.classes.length === 1);
  check("materialite: … and that is stated as the result, not as missing data",
    /Ce n'est pas une absence de résultat/.test(large.detail));

  check("materialite: nothing to rank is not an empty ranking",
    /rien à classer/.test(classementMateriel([]).detail));
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("portefeuille: all checks pass");
