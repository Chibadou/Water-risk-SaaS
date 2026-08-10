// Unit tests for the site usage vector (lib/siteProfile).
// npx tsx scripts/test/site-profile.test.ts
//
// The case that matters most is the last section: a site saved before Sprint 40
// has no usage vector, and the model must say so instead of inventing one.

import {
  usageTotals,
  volumeConsomme,
  weightedLevel,
  profileCompleteness,
} from "../../lib/siteProfile";
import type { SiteUsage } from "../../lib/sites";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};
const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9;

const u = (p: Partial<SiteUsage> & { id: string }): SiteUsage => ({
  usageCode: p.usageCode ?? "procede",
  ...p,
});

// ---- 1. Totals over the vector ----
{
  const usages = [
    u({ id: "a", volumeM3: 9500, sourceType: "AEP" }),
    u({ id: "b", volumeM3: 500, sourceType: "SUP" }),
    u({ id: "c", volumeM3: 1000, sourceType: "AEP", isExempt: true }),
    u({ id: "d", volumeM3: 300, sourceType: "SUP", isProcessCritical: true }),
    u({ id: "e" }), // declared without a volume
  ];
  const t = usageTotals(usages);
  check("totals: sums declared volumes only", near(t.total, 11300));
  check("totals: per source", near(t.parSource.AEP, 10500) && near(t.parSource.SUP, 800));
  check("totals: exempt volume is isolated", near(t.exempt, 1000));
  check("totals: restrictable excludes the exempt volume", near(t.restreignable, 10300));
  check("totals: process-critical volume is tracked", near(t.critique, 300));
  check("totals: a usage without volume is counted, not silently dropped", t.sansVolume === 1);
  check("totals: empty vector is all zeros, no crash", usageTotals(undefined).total === 0);
}

// ---- 2. Withdrawal is not consumption ----
{
  // Open-circuit cooling: nearly everything goes back to the same body.
  check("restitution: 95 % returned → 5 % consumed", near(volumeConsomme(100_000, 0.95), 5_000));
  // Evaporative process: nearly nothing returns.
  check("restitution: 5 % returned → 95 % consumed", near(volumeConsomme(100_000, 0.05), 95_000));
  check("restitution: the two differ by a factor of 19 on the same withdrawal",
    near((volumeConsomme(100_000, 0.05) ?? 0) / (volumeConsomme(100_000, 0.95) ?? 1), 19));
  // ⚠️ The whole point: an undeclared rate must NOT default to 0.
  check("restitution: undeclared rate → undefined, never 'consumes everything'",
    volumeConsomme(100_000, undefined) === undefined);
  check("restitution: clamped above 1", near(volumeConsomme(100_000, 1.4), 0));
}

// ---- 3. The weighted level — anti-pattern n°1 ----
{
  const levels = { AEP: "vigilance" as const, SUP: "crise" as const, SOU: undefined };

  // The note's own example: 95 % mains, 5 % river.
  const site = {
    usages: [
      u({ id: "a", volumeM3: 9500, sourceType: "AEP" }),
      u({ id: "b", volumeM3: 500, sourceType: "SUP" }),
    ],
  };
  const w = weightedLevel(levels, site);
  // vigilance = 1, crise = 4 → 0.95×1 + 0.05×4 = 1.15
  check("weighted: 95 % AEP vigilance + 5 % SUP crise → rank 1.15", near(w.rank, 1.15));
  check("weighted: NOT the maximum (which would be crise, rank 4)", w.rank < 4);
  check("weighted: nearest named level is vigilance, not crise", w.niveau === "vigilance");
  check("weighted: the weighting is flagged as computed from the vector", w.base === "vecteur" && !w.degrade);

  // Same zones, opposite mix: the answer must move.
  const inverse = weightedLevel(levels, {
    usages: [
      u({ id: "a", volumeM3: 500, sourceType: "AEP" }),
      u({ id: "b", volumeM3: 9500, sourceType: "SUP" }),
    ],
  });
  check("weighted: reversing the mix moves the level to crise", inverse.niveau === "crise");
  check("weighted: and the rank follows the volumes", near(inverse.rank, 0.05 * 1 + 0.95 * 4));

  // Exempt volume must not dilute the level.
  const exempt = weightedLevel(levels, {
    usages: [
      u({ id: "a", volumeM3: 9500, sourceType: "AEP", isExempt: true }),
      u({ id: "b", volumeM3: 500, sourceType: "SUP" }),
    ],
  });
  check("weighted: exempt volume carries no weight — only the SUP usage remains",
    near(exempt.rank, 4) && exempt.niveau === "crise");
}

// ---- 4. Legacy sites degrade honestly ----
{
  const levels = { AEP: "vigilance" as const, SUP: "crise" as const };

  // A site saved before Sprint 40: no vector, one declared origin.
  const legacy = weightedLevel(levels, { origine: "aep" });
  check("legacy: falls back to the single declared origin", near(legacy.rank, 1));
  check("legacy: the fallback is NAMED, not passed off as a weighting", legacy.base === "origine_unique");
  check("legacy: and flagged degraded", legacy.degrade);

  // Nothing declared at all.
  const nothing = weightedLevel(levels, {});
  check("nothing declared: rank 0 but flagged degraded, so 0 is not read as 'no restriction'",
    nothing.rank === 0 && nothing.degrade && nothing.base === "aucune");
}

// ---- 5. An incomplete profile says it is incomplete ----
{
  const legacy = profileCompleteness({});
  check("completeness: a legacy site is not complete", !legacy.complet);
  check("completeness: the missing vector is named", legacy.gaps.includes("vecteur_usages"));
  check("completeness: the missing restitution rate is named", legacy.gaps.includes("taux_restitution"));
  check("completeness: the missing response type is named", legacy.gaps.includes("type_reponse"));
  check("completeness: each gap comes with what it costs", legacy.consequences.length === legacy.gaps.length);
  check("completeness: the restitution consequence names the order of magnitude",
    legacy.consequences.some((c) => c.includes("ordre de grandeur")));

  const full = profileCompleteness({
    usages: [u({ id: "a", volumeM3: 1000, sourceType: "AEP", loadProfile: "continu" })],
    reponse: "linear",
    interne: { tauxRestitution: 0.2 },
  });
  check("completeness: a fully declared site is complete", full.complet && full.gaps.length === 0);

  const partial = profileCompleteness({
    usages: [u({ id: "a", sourceType: "AEP", loadProfile: "continu" })], // no volume
    reponse: "linear",
    interne: { tauxRestitution: 0.2 },
  });
  check("completeness: a usage without volume is reported", partial.gaps.includes("volumes_usages"));
}

console.log(failures === 0 ? "site-profile: all checks pass" : `site-profile: ${failures} FAILED`);
if (failures > 0) process.exit(1);
