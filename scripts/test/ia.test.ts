// Unit tests for interruption d'activité (lib/ia).
// npx tsx scripts/test/ia.test.ts
//
// Section 2 is the reason this module exists. It pins the note's own example:
// forty one-day episodes and two twenty-day episodes are the SAME 40 restriction
// days, and with a three-day buffer they must give wildly different losses.
// An annual total cannot tell them apart, and §4.3 says a model that gets this
// wrong "donnera une perte proche de zéro là où elle est maximale".

import {
  computeIa,
  episodesFromPeriodes,
  durationDistribution,
  type Episode,
  type IaInput,
} from "../../lib/ia";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number | undefined, b: number, tol = 0.15) =>
  a !== undefined && Math.abs(a - b) <= tol;

/** Episodes of `len` days each, spaced far apart so buffers refill if they can. */
const runs = (count: number, len: number, rank = 4): Episode[] =>
  Array.from({ length: count }, (_, i) => ({ startDay: i * 200, lengthDays: len, rank }));

const base = (over: Partial<IaInput> = {}): IaInput => ({
  episodes: runs(2, 20),
  // Total ban at crise, so the arithmetic is easy to follow by hand.
  exposure: { crise: { min: 1, max: 1 } },
  vrefM3: 365_000, // 1 000 m³/day
  reponse: "linear",
  ...over,
});

// ---- 1. Decoding the run-length calendar ----
{
  // Flat triplets [day, length, rank, …] — the shape lib/history emits.
  const eps = episodesFromPeriodes([100, 5, 2, 300, 12, 4]);
  check("rle: two episodes decoded", eps.length === 2);
  check("rle: lengths preserved", eps[0].lengthDays === 5 && eps[1].lengthDays === 12);
  check("rle: ranks preserved", eps[0].rank === 2 && eps[1].rank === 4);
  check("rle: undefined input yields no episodes, no crash", episodesFromPeriodes(undefined).length === 0);
  check("rle: a truncated triplet is ignored rather than half-read",
    episodesFromPeriodes([100, 5]).length === 0);
}

// ---- 2. Convexity: the note's own example ----
{
  // A three-day tank on a 1 000 m³/day need = 3 000 m³.
  const tampon = 3_000;

  const many = computeIa(base({ episodes: runs(40, 1), tamponM3: tampon }));
  const few = computeIa(base({ episodes: runs(2, 20), tamponM3: tampon }));

  check("convexity: both cases are 40 restriction days",
    runs(40, 1).reduce((s, e) => s + e.lengthDays, 0) === 40 &&
      runs(2, 20).reduce((s, e) => s + e.lengthDays, 0) === 40);

  // Forty 1-day episodes: the tank covers each one entirely.
  check("convexity: forty 1-day episodes cost ~0 JEA", near(many.jeaMin, 0, 0.01));
  // Two 20-day episodes: the tank covers 3 days of EACH, since it refills in
  // between — 17 + 17.
  check("convexity: two 20-day episodes cost 34 JEA", near(few.jeaMin, 34));
  check("convexity: the SAME 40 days give wildly different losses", few.jeaMin > 30 && many.jeaMin < 1);

  // A slow refill makes closely spaced episodes worse: the tank is not full when
  // the second one starts.
  const slow = computeIa(
    base({
      episodes: [
        { startDay: 0, lengthDays: 20, rank: 4 },
        { startDay: 21, lengthDays: 20, rank: 4 },
      ],
      tamponM3: tampon,
      rechargeM3ParJour: 100, // 1 day of gap refills only 100 m³ of 3 000
    }),
  );
  check("convexity: a slow refill costs more than a full one", slow.jeaMin > few.jeaMin);

  // ⚠️⚠️ A ZERO gap must refill NOTHING, whatever the rate. The RLE calendar stores
  // two runs as soon as the level changes, so an alerte hardening into crise on the
  // very next day arrives here as two adjacent episodes — and the restriction never
  // lifted, so the tank had no water to refill from.
  //
  // This assertion was ADDED after the defect it describes had already been shipped
  // and caught elsewhere: at Sprint 42b the portfolio stopped using its own decoder
  // (which merged adjacent runs) and the unconditional refill absorbed the buffer
  // TWICE. The only test that failed was in portefeuille.test.ts, whose name mentions
  // neither buffers nor episodes. A defect in lib/ia.ts must be catchable from
  // ia.test.ts.
  const contigus = computeIa(
    base({
      episodes: [
        { startDay: 0, lengthDays: 10, rank: 4 },
        { startDay: 10, lengthDays: 10, rank: 4 }, // touches the first: gap = 0
      ],
      tamponM3: tampon,
    }),
  );
  const separes = computeIa(
    base({
      episodes: [
        { startDay: 0, lengthDays: 10, rank: 4 },
        { startDay: 200, lengthDays: 10, rank: 4 }, // far apart: the tank refills
      ],
      tamponM3: tampon,
    }),
  );
  // 20 continuous days, a 3-day buffer spent once → 17 JEA.
  check("adjacent: two touching episodes are ONE continuous restriction — 17 JEA",
    near(contigus.jeaMin, 17));
  // Two separate 10-day episodes, the buffer absorbing 3 days of each → 14 JEA.
  check("adjacent: … while two separated ones let the buffer refill — 14 JEA",
    near(separes.jeaMin, 14));
  check("adjacent: so touching costs strictly more than separated, at equal days",
    contigus.jeaMin > separes.jeaMin);

  // And the statistic §4.3 asks for is exposed, not just the total.
  check("convexity: the longest consecutive run is reported", few.maxJoursConsecutifs === 20);
  check("convexity: and so is the duration distribution", few.distribution[0].duree === 20);
}

// ---- 3. The three response shapes ----
{
  // Half the volume blocked, no buffer.
  const half = { crise: { min: 0.5, max: 0.5 } };

  const linear = computeIa(base({ exposure: half, reponse: "linear", episodes: runs(1, 10) }));
  check("response linear: production follows the volume → 0.5 JEA per day", near(linear.jeaMin, 5));

  // ⚠️ threshold and stepwise now REQUIRE their declared parameter (G17, G18).
  // Every case below therefore declares one.
  const threshold = computeIa(
    base({ exposure: half, reponse: "threshold", seuilTechniqueM3: 1_000, episodes: runs(1, 10) }),
  );
  check("response threshold: it runs or it does not → a full day lost", near(threshold.jeaMin, 10));
  check("response threshold: strictly worse than linear at equal volume", threshold.jeaMin > linear.jeaMin);

  const stepwise = computeIa(
    base({ exposure: half, reponse: "stepwise", paliers: 4, episodes: runs(1, 10) }),
  );
  // 50 % available with 4 declared steps → production drops to the 0.5 step.
  check("response stepwise: production falls to the step below", near(stepwise.jeaMin, 5));
  // At 60 % available, stepwise loses more than linear: it can only run at 50 %.
  const s60 = computeIa(
    base({ exposure: { crise: { min: 0.4, max: 0.4 } }, reponse: "stepwise", paliers: 4, episodes: runs(1, 10) }),
  );
  const l60 = computeIa(
    base({ exposure: { crise: { min: 0.4, max: 0.4 } }, reponse: "linear", episodes: runs(1, 10) }),
  );
  check("response stepwise: 60 % available means running at 50 %, so it loses more than linear",
    s60.jeaMin > l60.jeaMin);
  // And the number of steps CHANGES the answer, which is why it cannot be
  // defaulted: 2 steps at 60 % available means running at 50 % too, but 10 steps
  // means running at 60 %.
  const s60fine = computeIa(
    base({ exposure: { crise: { min: 0.4, max: 0.4 } }, reponse: "stepwise", paliers: 10, episodes: runs(1, 10) }),
  );
  check("response stepwise: the declared number of steps changes the result",
    s60fine.jeaMin < s60.jeaMin);

  check("response: the shape used is reported", threshold.reponse === "threshold");
}

// ---- 4. The technical threshold is a floor under every response ----
{
  // 40 % of 1 000 m³ available, but the site cannot run below 500 m³/day.
  const r = computeIa(
    base({
      exposure: { crise: { min: 0.6, max: 0.6 } },
      reponse: "linear",
      seuilTechniqueM3: 500,
      episodes: runs(1, 10),
    }),
  );
  check("threshold: below the technical floor the site stops entirely", near(r.jeaMin, 10));

  const above = computeIa(
    base({
      exposure: { crise: { min: 0.3, max: 0.3 } },
      reponse: "linear",
      seuilTechniqueM3: 500,
      episodes: runs(1, 10),
    }),
  );
  check("threshold: above the floor, linear behaviour resumes", near(above.jeaMin, 3));
}

// ---- 5. Exempt volume and restitution reach the IA too ----
{
  // A total ban, but a third of the volume is exempt: the site keeps it.
  const exempt = computeIa(
    base({ exposure: { crise: { min: 1, max: 1 } }, exemptM3: 121_667, episodes: runs(1, 9) }),
  );
  check("exempt: an exempt third keeps a third of production", near(exempt.jeaMin, 6, 0.2));

  // 90 % returned to the same body: the restriction bites on consumption only.
  const restit = computeIa(
    base({ exposure: { crise: { min: 1, max: 1 } }, tauxRestitution: 0.9, episodes: runs(1, 10) }),
  );
  check("restitution: 90 % returned leaves 90 % of production", near(restit.jeaMin, 1));
}

// ---- 6. The ρ interval survives to JEA (G2) ----
{
  const r = computeIa(
    base({ exposure: { crise: { min: 0, max: 1 } }, episodes: runs(1, 10), reponse: "linear" }),
  );
  check("interval: an unquantified measure gives 0 JEA at the low bound", near(r.jeaMin, 0));
  check("interval: … and 10 at the high bound", near(r.jeaMax, 10));
  check("interval: the range is real", r.jeaMax > r.jeaMin);
}

// ---- 7. Missing inputs refuse to answer, and say why ----
{
  const noVref = computeIa(base({ vrefM3: undefined }));
  check("missing vref: not available", !noVref.available);
  check("missing vref: says why", /Volume de référence non déclaré/.test(noVref.message ?? ""));

  const noEpisodes = computeIa(base({ episodes: [] }));
  check("no episodes: not available, and not a 0 JEA claim", !noEpisodes.available);

  // An episode at a level with no readable measure must not count as 0 loss.
  const unreadable = computeIa(
    base({ episodes: [{ startDay: 0, lengthDays: 30, rank: 2 }], exposure: { crise: { min: 1, max: 1 } } }),
  );
  check("unreadable level: the episode is dropped, not zeroed", unreadable.episodesEcartes === 1);
  check("unreadable level: nothing is available to report", !unreadable.available);
  check("unreadable level: and the journal says they do not count",
    unreadable.hypotheses.some((h) => /ne comptent pas 0 JEA/.test(h)));
}

// ---- 8. The assumption journal (ADR-006) ----
{
  const bare = computeIa({
    episodes: runs(1, 10),
    exposure: { crise: { min: 1, max: 1 } },
    vrefM3: 365_000,
  });
  check("journal: an undeclared response shape is journalled",
    bare.hypotheses.some((h) => /Fonction de réponse non déclarée/.test(h)));
  check("journal: … and names what threshold would change",
    bare.hypotheses.some((h) => /threshold/.test(h)));
  check("journal: an absent buffer is journalled",
    bare.hypotheses.some((h) => /Aucune réserve déclarée/.test(h)));
  // ⚠️ With no buffer at all, there is nothing to say about its refill rate —
  // and the journal must not lecture about a parameter that does not apply.
  check("journal: with no buffer, no recharge assumption is claimed",
    !bare.hypotheses.some((h) => /recharge/.test(h)));
  const buffered = computeIa(base({ tamponM3: 3_000, episodes: runs(1, 10) }));
  check("journal: with a buffer, the full-refill default is stated",
    buffered.hypotheses.some((h) => /pleine à chaque nouvel épisode/.test(h)));

  const legacy = computeIa(base({ autonomieJours: 3, episodes: runs(1, 10) }));
  check("journal: a buffer converted from days is flagged as an approximation",
    legacy.hypotheses.some((h) => /approximation/.test(h)));
  // 3 days of autonomy on a total ban → 10 − 3 = 7.
  check("legacy buffer: 3 days of autonomy absorb 3 days", near(legacy.jeaMin, 7));
}

// ---- 9. Per-year normalisation ----
{
  const decade = computeIa(base({ episodes: runs(10, 20), tamponM3: 0, anneesCouvertes: 10 }));
  check("per year: 10 episodes of 20 days over 10 years → 20 JEA/an", near(decade.jeaMin, 20));

  const dist = durationDistribution([
    { startDay: 0, lengthDays: 5, rank: 4 },
    { startDay: 50, lengthDays: 5, rank: 4 },
    { startDay: 100, lengthDays: 12, rank: 4 },
  ]);
  check("distribution: buckets by duration", dist.length === 2);
  check("distribution: counts within a bucket", dist[0].duree === 5 && dist[0].nombre === 2);
  check("distribution: sorted ascending", dist[0].duree < dist[1].duree);
}

// ---- 10. Invented coefficients are refused, not defaulted (G17, G18) ----
{
  // `stepwise` with no declared steps: the first version defaulted to 4, and
  // that default happened to make stepwise agree with linear at 50 % — a
  // coincidence of my own choosing dressed up as a result.
  const noSteps = computeIa(base({ reponse: "stepwise", episodes: runs(1, 10) }));
  check("G17: stepwise without declared steps is refused", !noSteps.available);
  check("G17: and the refusal says the tool does not guess",
    /ne le devine pas/.test(noSteps.message ?? ""));
  check("G17: one step is not a step scale either",
    !computeIa(base({ reponse: "stepwise", paliers: 1, episodes: runs(1, 10) })).available);
  check("G17: declaring them makes it computable",
    computeIa(base({ reponse: "stepwise", paliers: 4, episodes: runs(1, 10) })).available);

  // `threshold` with no declared technical floor: the most punitive shape in the
  // model resting on an implicit default.
  const noFloor = computeIa(base({ reponse: "threshold", episodes: runs(1, 10) }));
  check("G18: threshold without a declared technical floor is refused", !noFloor.available);
  check("G18: and the refusal quantifies what the default would have assumed",
    /manque de 1 %/.test(noFloor.message ?? ""));
  check("G18: declaring it makes it computable",
    computeIa(base({ reponse: "threshold", seuilTechniqueM3: 500, episodes: runs(1, 10) })).available);

  // `linear` needs neither, and must stay usable out of the box.
  check("G17/G18: linear is unaffected", computeIa(base({ episodes: runs(1, 10) })).available);
}

// ---- 11. Seasonality: declared, or flat and journalled (G19) ----
{
  const flat = computeIa(base({ episodes: runs(1, 10) }));
  check("G19: a flat need is journalled, not silent",
    flat.hypotheses.some((h) => /supposé PLAT/.test(h)));
  check("G19: … and names the direction of the error",
    flat.hypotheses.some((h) => /SOUS-ESTIMÉS/.test(h)));

  // A summer-peaking site: half the annual volume in July and August.
  const summer = new Array(12).fill(0.05);
  summer[6] = 0.25;
  summer[7] = 0.25;

  // Day 19_570 ≈ 2023-08-01 (day index in days since epoch).
  const aug = Math.floor(Date.UTC(2023, 7, 1) / 86_400_000);
  const jan = Math.floor(Date.UTC(2023, 0, 1) / 86_400_000);

  const augustEpisode = [{ startDay: aug, lengthDays: 10, rank: 4 }];
  const januaryEpisode = [{ startDay: jan, lengthDays: 10, rank: 4 }];

  const augFlat = computeIa(base({ episodes: augustEpisode }));
  const augPeak = computeIa(base({ episodes: augustEpisode, profilMensuel: summer }));
  const janPeak = computeIa(base({ episodes: januaryEpisode, profilMensuel: summer }));

  // With a total ban, JEA in days does not depend on the volume — production
  // falls to zero either way. What the profile changes is the RATIO of a partial
  // restriction, so use a partial one to see it.
  const partial = { crise: { min: 0.5, max: 0.5 } };
  const augPartialFlat = computeIa(base({ episodes: augustEpisode, exposure: partial }));
  const augPartialPeak = computeIa(
    base({ episodes: augustEpisode, exposure: partial, profilMensuel: summer, tamponM3: 5_000 }),
  );
  const janPartialPeak = computeIa(
    base({ episodes: januaryEpisode, exposure: partial, profilMensuel: summer, tamponM3: 5_000 }),
  );
  check("G19: with a buffer, an August episode costs more than a January one for a summer site",
    augPartialPeak.jeaMin > janPartialPeak.jeaMin);
  check("G19: the flat profile cannot tell August from January",
    near(augPartialFlat.jeaMin, computeIa(base({ episodes: januaryEpisode, exposure: partial })).jeaMin));
  check("G19: a declared profile is not journalled as an assumption",
    !augPeak.hypotheses.some((h) => /supposé PLAT/.test(h)));
  void augFlat;
  void janPeak;
}

console.log(failures === 0 ? "ia: all checks pass" : `ia: ${failures} FAILED`);
if (failures > 0) process.exit(1);
