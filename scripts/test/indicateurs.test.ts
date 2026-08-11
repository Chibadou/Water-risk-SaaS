// Unit tests for lib/indicateurs — the single computation point of the note's
// three outputs.
// npx tsx scripts/test/indicateurs.test.ts
//
// The module is thin, and the tests that matter are not about arithmetic (the
// three engines have their own suites). They are about the two properties the
// module exists to guarantee:
//
//   1. ONE call produces all three, so the screen and the exported report cannot
//      disagree. Before Sprint 42b, `synthese.ts` had its own `volume / 365 ×
//      jours` for cubic metres while the panel called `computeVnp` — two formulas
//      for one figure, on one site.
//   2. The 2050 IA LENGTHENS the observed episodes instead of scaling a day
//      total. That difference is worth several times the figure once a buffer
//      exists, and picking the wrong one silently yields the optimistic answer.

import { computeIndicateurs } from "../../lib/indicateurs";
import { computeIa, episodesFromPeriodes, scaleEpisodes } from "../../lib/ia";
import type { YearHistory } from "../../lib/history";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number | undefined, b: number, tol = 0.15) =>
  a !== undefined && Math.abs(a - b) <= tol;

const DAY_MS = 86400_000;
const day = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
const NOW = new Date("2026-08-04T00:00:00Z");

const year = (alerte: number, crise = 0): YearHistory =>
  ({ joursParNiveau: { alerte, crise }, joursAlertePlus: alerte + crise }) as YearHistory;

const base = () => ({
  now: NOW,
  parAnnee: { "2024": year(30, 10), "2025": year(30, 10) },
  parMois: { "2024": { 7: 40 }, "2025": { 7: 40 } },
  parMoisNiveau: {
    "2024": { 7: { alerte: 30, crise: 10 } },
    "2025": { 7: { alerte: 30, crise: 10 } },
  },
  anneesCompletes: 2,
  joursParNiveau: { alerte: 30, crise: 10 },
  // Two 20-day crisis episodes, far apart: the buffer refills between them.
  periodes: [day(2024, 7, 1), 20, 4, day(2025, 7, 1), 20, 4],
  exposure: { alerte: { min: 0.5, max: 0.5 }, crise: { min: 1, max: 1 } },
  // 365 000 m³/an = 1 000 m³/day, so the arithmetic stays checkable by hand.
  interne: { volumeM3: 365_000 },
});

// ---- 1. One call, three outputs, each in its own unit ----
{
  const r = computeIndicateurs(base());
  check("all three outputs are produced by one call",
    r.js.available && r.vnp.available && r.ia.available);
  // JS: 40 days, in days. VNP: 30 × 1000 × 0.5 + 10 × 1000 × 1 = 25 000 m³.
  // IA: two 20-day total bans over two covered years, no buffer → 20 JEA/an.
  check("JS is in days", near(r.js.horizons[0].joursTotal, 40));
  check("VNP is in m³", near(r.vnp.crise?.min, 25_000, 50));
  check("IA is in JEA", near(r.ia.jeaMin, 20));
  // ⚠️ Three numbers, three units, no fourth number combining them.
  check("no combined field exists on the result",
    !Object.keys(r).some((k) => /total|score|impact/i.test(k)));
}

// ---- 2. The assumption journal gathers all three engines (ADR-006) ----
{
  const r = computeIndicateurs(base());
  check("journal: the JS assumptions are in it",
    r.hypotheses.some((h) => /années COMPLÈTES/.test(h)));
  check("journal: the VNP assumptions too", r.hypotheses.some((h) => /κ = 1/.test(h)));
  check("journal: and the IA's", r.hypotheses.some((h) => /supposé PLAT/.test(h)));
  check("journal: it is the concatenation, nothing is dropped",
    r.hypotheses.length === r.js.hypotheses.length + r.vnp.hypotheses.length + r.ia.hypotheses.length);
}

// ---- 3. A missing declaration refuses, it does not zero ----
{
  const noVolume = computeIndicateurs({ ...base(), interne: {} });
  check("no volume: the VNP refuses", !noVolume.vnp.available);
  check("no volume: the IA refuses too", !noVolume.ia.available);
  // But JS still works: it needs no declaration from the operator at all.
  check("no volume: JS is unaffected — it counts arrêtés, not the site",
    noVolume.js.available);
  check("no volume: both refusals are motivated",
    /non déclaré/.test(noVolume.vnp.message ?? "") &&
      /non déclaré/.test(noVolume.ia.message ?? ""));

  const noRho = computeIndicateurs({ ...base(), exposure: {} });
  check("no readable ρ: the VNP has no crisis component at all, not a 0 m³ one",
    noRho.vnp.crise === undefined);
  check("no readable ρ: the IA refuses", !noRho.ia.available);
  check("no readable ρ: JS still counts the days", noRho.js.available);
}

// ---- 4. The 2050 IA lengthens episodes; it does not scale a day total ----
{
  const withProj = computeIndicateurs({
    ...base(),
    projection: { dtBE: [5, 20, 40], vcn10: [-40, -20, -5] },
  });
  check("2050: the IA horizon is produced when Explore2 answered",
    withProj.ia2050?.available === true);
  check("2050: it costs more than the observed year",
    (withProj.ia2050?.jeaMin ?? 0) > withProj.ia.jeaMin);
  check("2050: and says in words that episodes were lengthened, not multiplied",
    (withProj.ia2050?.hypotheses ?? []).some((h) => /allongés/.test(h) && /non multipliés/.test(h)));

  check("2050: absent projection → no 2050 IA, rather than a copy of the present",
    computeIndicateurs(base()).ia2050 === undefined);

  // ⚠️ The measurement that justifies the whole design. Same growth in total
  // days, two ways of spending it, with a 10-day buffer (10 000 m³ on a
  // 1 000 m³/day need):
  //   - LENGTHEN: the two 20-day episodes become 27-day ones. The buffer still
  //     absorbs 10 days of each, so the extra days land entirely on production.
  //   - MULTIPLY: keep 20-day episodes and add more of them. Each new episode
  //     gets a full buffer, so a share of every one is absorbed.
  const episodes = episodesFromPeriodes(base().periodes);
  const common = {
    exposure: { crise: { min: 1, max: 1 } },
    vrefM3: 365_000,
    tamponM3: 10_000,
    anneesCouvertes: 2,
  };
  const facteur = 1.35;
  const allonge = computeIa({ ...common, episodes: scaleEpisodes(episodes, facteur) });
  // Same total days (2 × 27 = 54), spread over more, shorter episodes.
  const multiplie = computeIa({
    ...common,
    episodes: [
      { startDay: day(2024, 5, 1), lengthDays: 20, rank: 4 },
      { startDay: day(2024, 7, 1), lengthDays: 7, rank: 4 },
      { startDay: day(2025, 5, 1), lengthDays: 20, rank: 4 },
      { startDay: day(2025, 7, 1), lengthDays: 7, rank: 4 },
    ],
  });
  check("2050: lengthening and multiplying spend the SAME number of days",
    allonge.distribution.reduce((a, d) => a + d.duree * d.nombre, 0) ===
      multiplie.distribution.reduce((a, d) => a + d.duree * d.nombre, 0));
  check("2050: yet lengthening costs strictly more JEA — the convexity of §4.3",
    allonge.jeaMin > multiplie.jeaMin);
  check("2050: … and by a margin worth reporting, not a rounding difference",
    allonge.jeaMin - multiplie.jeaMin >= 3);
}

// ---- 5. scaleEpisodes never shortens, and never loses a short episode ----
{
  const eps = [
    { startDay: 100, lengthDays: 4, rank: 2 },
    { startDay: 200, lengthDays: 30, rank: 2 },
  ];
  const grown = scaleEpisodes(eps, 1.1);
  // ⚠️ Rounding to nearest would have left the 4-day episode at 4 — a +10 %
  // scenario that changes nothing for short episodes is not a scenario.
  check("scale: a +10 % scenario does lengthen a 4-day episode", grown[0].lengthDays === 5);
  check("scale: and lengthens a 30-day one proportionally", grown[1].lengthDays === 33);
  check("scale: an episode never gets shorter",
    scaleEpisodes(eps, 0.5).every((e, i) => e.lengthDays >= eps[i].lengthDays));
  check("scale: a factor of 1 is the identity",
    scaleEpisodes(eps, 1).every((e, i) => e.lengthDays === eps[i].lengthDays));
  check("scale: a nonsensical factor is refused rather than applied",
    scaleEpisodes(eps, Number.NaN) === eps);
}

console.log(failures === 0 ? "indicateurs: all checks pass" : `indicateurs: ${failures} FAILED`);
if (failures > 0) process.exit(1);
