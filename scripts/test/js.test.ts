// Unit tests for JS — jours sous statut (lib/js).
// npx tsx scripts/test/js.test.ts
//
// This module inherited the horizon machinery of lib/interruption.ts (deleted at
// Sprint 42b) and dropped two things on the way: the exposure weighting and the
// DEPENDANCE_FACTOR multiplier. So the tests worth writing are the ones that
// prove the DAYS ARE STILL DAYS — a published count, never a count multiplied by
// a model. Section 5 reads the module's own source to enforce that, because it is
// a shape constraint no value test can catch.

import { readFileSync } from "fs";
import { computeJs, meanDaysPerLevel, sumDays, sumAlertePlus, JS_AVERTISSEMENT } from "../../lib/js";
import type { YearHistory } from "../../lib/history";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number | undefined, b: number, tol = 0.15) =>
  a !== undefined && Math.abs(a - b) <= tol;

/** 2026-08-04: 2017→2025 are complete years, 2026 is half-run. */
const NOW = new Date("2026-08-04T00:00:00Z");

const year = (alerte: number, crise = 0, vigilance = 0): YearHistory =>
  ({ joursParNiveau: { vigilance, alerte, crise }, joursAlertePlus: alerte + crise }) as YearHistory;

const parAnnee = { "2024": year(30, 10), "2025": year(50, 20) };

// ---- 1. The année type is a mean over COMPLETE years only ----
{
  const r = computeJs({ now: NOW, parAnnee, anneesCompletes: 2 });
  check("annee type: available", r.available);
  const h = r.horizons.find((x) => x.id === "annee_type");
  check("annee type: 30 and 50 alerte days average to 40", near(h?.parNiveau?.alerte, 40));
  check("annee type: 10 and 20 crise days average to 15", near(h?.parNiveau?.crise, 15));
  check("annee type: the total is the sum of the vector", near(h?.joursTotal, 55));
  check("annee type: alerte+ excludes vigilance", near(h?.joursAlertePlus, 55));

  // ⚠️ The partial current year must not enter the mean: it would add calm days.
  const withCurrent = computeJs({
    now: NOW,
    parAnnee: { ...parAnnee, "2026": year(4) },
    anneesCompletes: 2,
  });
  check("annee type: the partial current year is excluded from the mean",
    near(withCurrent.horizons[0].parNiveau?.alerte, 40));
  check("annee type: the exclusion is journalled, not silent",
    withCurrent.hypotheses.some((x) => /années COMPLÈTES/.test(x)));
}

// ---- 2. No history is "cannot count", never "no restriction" ----
{
  const r = computeJs({ now: NOW, anneesCompletes: 0 });
  check("empty: not available", !r.available);
  check("empty: no année type vector at all — not an empty one", r.anneeType === undefined);
  // The single most important sentence in the module.
  check("empty: the message refuses the reassuring reading",
    /pas « aucune restriction »/.test(r.message ?? ""));
}

// ---- 3. The 2050 horizon lengthens and deepens, but never fabricates days ----
{
  const r = computeJs({
    now: NOW,
    parAnnee,
    anneesCompletes: 2,
    projection: { dtBE: [5, 20, 40], vcn10: [-40, -20, -5] },
  });
  const h = r.horizons.find((x) => x.id === "horizon_2050");
  check("2050: available", h?.available === true);
  // 55 measured days + 20 days of lengthening = 75. Intensification MOVES days
  // between levels; it must not add any.
  check("2050: the total grows by the lengthening only, not by the deepening",
    near(h?.joursTotal, 75));
  check("2050: the envelope is a real range", (h?.hi ?? 0) > (h?.lo ?? 0));
  check("2050: the median sits inside its own envelope",
    (h?.joursTotal ?? 0) >= (h?.lo ?? 0) && (h?.joursTotal ?? 0) <= (h?.hi ?? 0));
  // Deepening: days move UP the levels, so crise gains what alerte loses.
  const base = computeJs({ now: NOW, parAnnee, anneesCompletes: 2 }).anneeType!;
  check("2050: crise gains days relative to the année type",
    (h?.parNiveau?.crise ?? 0) > (base.crise ?? 0));
  check("2050: and the vector still sums to the stated total",
    near(sumDays(h?.parNiveau ?? {}), h?.joursTotal ?? 0, 0.2));
  check("2050: the growth factor is exposed for the IA to lengthen episodes with",
    near(h?.facteurCroissance, 75 / 55, 0.01));

  const noProj = computeJs({ now: NOW, parAnnee, anneesCompletes: 2 });
  check("2050: an absent projection makes the horizon unavailable, not zero",
    noProj.horizons.find((x) => x.id === "horizon_2050")?.available === false);
}

// ---- 4. Evidence levels are attached per horizon (§0.1, G8) ----
{
  const r = computeJs({
    now: NOW,
    parAnnee,
    parMois: { "2024": { 7: 20 }, "2025": { 7: 30 } },
    parMoisNiveau: { "2024": { 7: { alerte: 20 } }, "2025": { 7: { alerte: 30 } } },
    anneesCompletes: 2,
    projection: { dtBE: [5, 20, 40], vcn10: [-40, -20, -5] },
  });
  const preuve = (id: string) => r.horizons.find((x) => x.id === id)?.preuve;
  // The année type COUNTS PUBLISHED ARRÊTÉS: it is an observed fact, N1.
  check("preuve: the année type is N1 — a published fact", preuve("annee_type") === "N1");
  check("preuve: the end of season is N2 — calibrated", preuve("fin_saison") === "N2");
  check("preuve: 2050 is N3 — a scenario", preuve("horizon_2050") === "N3");
  check("preuve: an unavailable horizon carries no evidence label",
    computeJs({ now: NOW, parAnnee, anneesCompletes: 2 })
      .horizons.find((x) => x.id === "horizon_2050")?.preuve === undefined);
}

// ---- 5. JS says, in the result, that it is the least durable of the three ----
{
  const r = computeJs({ now: NOW, parAnnee, anneesCompletes: 2 });
  check("warning: §4.1's caveat travels with the result", r.avertissement === JS_AVERTISSEMENT);
  check("warning: it names the 2021 nomenclature change", /2021/.test(r.avertissement));
  check("warning: and points at the two physical indicators instead",
    /m³/.test(r.avertissement) && /JEA/.test(r.avertissement));

  // The shape constraint. lib/interruption.ts collapsed the horizons into
  // `joursContraints = days × exposure × factor`; this module must not, and a
  // value test cannot see the difference — both produce numbers.
  const src = readFileSync("lib/js.ts", "utf-8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
  check("shape: the module never reads an exposure", !/\bexposure\b/.test(code));
  check("shape: nor a dependence factor", !/DEPENDANCE|dependance/i.test(code));
  check("shape: nor produces a `joursContraints` field", !/joursContraints/.test(code));
  // Its input type must not even ACCEPT one: an unused field is an invitation.
  check("shape: JsInput does not accept an exposure at all", !/exposure\??:/.test(src));
}

// ---- 6. The end-of-season horizon prefers per-level monthly detail ----
{
  const common = {
    now: NOW,
    parAnnee,
    anneesCompletes: 2,
    parMois: { "2024": { 7: 20, 8: 10 }, "2025": { 7: 30, 8: 20 } },
  };
  // With per-level detail: August crise days stay crise days.
  const detailed = computeJs({
    ...common,
    parMoisNiveau: {
      "2024": { 7: { crise: 20 }, 8: { crise: 10 } },
      "2025": { 7: { crise: 30 }, 8: { crise: 20 } },
    },
  });
  const h = detailed.horizons.find((x) => x.id === "fin_saison");
  check("season: per-level detail keeps crise days at crise", (h?.parNiveau?.crise ?? 0) > 0);
  check("season: and does not invent alerte days", (h?.parNiveau?.alerte ?? 0) === 0);

  // Without it: the annual mix is borrowed, which FLATTENS the late-summer peak.
  const flat = computeJs(common);
  const hf = flat.horizons.find((x) => x.id === "fin_saison");
  check("season: without detail the annual mix is used", (hf?.parNiveau?.alerte ?? 0) > 0);
  // ⚠️ Stating the direction of the error is the point — a flattened peak reads
  // as a milder end of season than the archive actually recorded.
  check("season: and the flattening is journalled with its direction",
    flat.hypotheses.some((x) => /APLATIT/.test(x) && /sous-estim/i.test(x)));
}

// ---- 7. Helpers ----
{
  check("sumDays adds every level", sumDays({ vigilance: 1, alerte: 2, crise: 3 }) === 6);
  check("sumAlertePlus drops vigilance", sumAlertePlus({ vigilance: 1, alerte: 2, crise: 3 }) === 5);
  const mean = meanDaysPerLevel(parAnnee, 2, 2026);
  check("meanDaysPerLevel averages over the window", near(mean.alerte, 40));
  check("meanDaysPerLevel on zero years yields nothing, not zeros",
    Object.keys(meanDaysPerLevel(parAnnee, 0, 2026)).length === 0);
}

console.log(failures === 0 ? "js: all checks pass" : `js: ${failures} FAILED`);
if (failures > 0) process.exit(1);
