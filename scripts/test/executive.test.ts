// Tests for lib/executive.ts — the portfolio executive summary.
// Run: npx tsx scripts/test/executive.test.ts
//
// The property under test is not the wording, it is the DISCIPLINE: a sentence
// exists if and only if the fact behind it was computed, and the "what we don't
// know" line is never dropped when something is missing.

import { buildExecutiveSummary, executiveSummaryMarkdown, type ExecutiveInput } from "../../lib/executive";
import { computePortfolio } from "../../lib/portefeuille";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

const DAY_MS = 86400_000;
const day = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
const NOW = new Date("2026-08-04T00:00:00Z");
const ALERTE = 2;

const has = (s: ReturnType<typeof buildExecutiveSummary>, id: string) =>
  s.lignes.some((l) => l.id === id);
const line = (s: ReturnType<typeof buildExecutiveSummary>, id: string) =>
  s.lignes.find((l) => l.id === id);

/** A full-featured portfolio: three sites, two sharing a zone, all declared. */
const richPortfolio = computePortfolio({
  now: NOW,
  sites: [
    {
      id: "a", label: "Usine A", periodes: [day(2025, 7, 1), 40, ALERTE],
      zoneCle: "Z1", bassin: "H", volumeM3: 365000, coutJourEuros: 10000,
      exposureInterval: { alerte: { min: 1, max: 1 } },
      joursParNiveau: { alerte: 30 }, autonomieJours: 0,
    },
    {
      id: "b", label: "Usine B", periodes: [day(2025, 7, 1), 40, ALERTE],
      zoneCle: "Z1", bassin: "H", volumeM3: 73000, coutJourEuros: 5000,
      exposureInterval: { alerte: { min: 1, max: 1 } },
      joursParNiveau: { alerte: 20 }, autonomieJours: 0,
    },
    {
      id: "c", label: "Dépôt C", periodes: [day(2025, 9, 1), 10, ALERTE],
      zoneCle: "Z2", bassin: "H", volumeM3: 3650, coutJourEuros: 100,
      exposureInterval: { alerte: { min: 1, max: 1 } },
      joursParNiveau: { alerte: 5 }, autonomieJours: 0,
    },
  ],
});

const richInput: ExecutiveInput = {
  now: NOW,
  sites: 3,
  sitesEvalues: 3,
  sitesEnRestriction: 2,
  sitesEnAlerteForte: 1,
  scoreMoyen: 54,
  scoreMax: 78,
  joursSousArreteTotal: 55,
  joursSousArreteSites: 3,
  jeaTotal: 55,
  jeaSites: 3,
  joursSousArrete2050Base: 55,
  jours2050Total: 71,
  portefeuille: richPortfolio,
  parSite: [
    { id: "a", label: "Usine A", jea: 30 },
    { id: "b", label: "Usine B", jea: 20 },
    { id: "c", label: "Dépôt C", jea: 5 },
  ],
};

// ---------------------------------------------------------------------------
// 0 bis. The Pareto claim must not assert an order the intervals cannot defend
// ---------------------------------------------------------------------------
// ⚠️ "These two sites concentrate 60 % of the constrained days" is a statement about an
// ORDER. Every JEA is an interval widened by each unquantified arrêté measure (G2), so when
// the head of the pack overlaps the sites just outside it, the claim is noise dressed as a
// finding. Arbitration of 2026-08-11.
{
  // Point estimates far apart: the order stands, no caveat.
  const net = buildExecutiveSummary({
    ...richInput,
    parSite: [
      { id: "a", label: "Usine A", jea: 100, jeaMax: 101 },
      { id: "b", label: "Usine B", jea: 10, jeaMax: 11 },
      { id: "c", label: "Dépôt C", jea: 5, jeaMax: 6 },
    ],
  });
  check("pareto: a cleanly separated head of the pack carries no materiality caveat",
    has(net, "agir") && !/coupe au milieu/.test(line(net, "agir")?.texte ?? ""));

  // Overlapping intervals: the cut falls inside an inseparable group, so it must say so.
  const flou = buildExecutiveSummary({
    ...richInput,
    parSite: [
      { id: "a", label: "Usine A", jea: 40, jeaMax: 60 },
      { id: "b", label: "Usine B", jea: 38, jeaMax: 58 },
      { id: "c", label: "Dépôt C", jea: 36, jeaMax: 56 },
    ],
  });
  const texte = line(flou, "agir")?.texte ?? "";
  check("pareto: a cut through overlapping intervals is flagged", /coupe au milieu/.test(texte));
  check("pareto: … the tied sites are NAMED, not just counted",
    /Usine A/.test(texte) && /Usine B/.test(texte));
  check("pareto: … and the reader is told the effort is worth the same on either",
    /ordonner du bruit/.test(texte) && /vaut autant/.test(texte));
  // ⚠️ The caveat must ADD to the claim, not replace it: the Pareto share is still the
  // useful part, and hiding it would trade one false impression for another.
  check("pareto: the share is still stated alongside the caveat", /% des jours contraints/.test(texte));
}

// ---------------------------------------------------------------------------
// 1. A complete portfolio produces the full narrative, in order
// ---------------------------------------------------------------------------
{
  const s = buildExecutiveSummary(richInput);
  check("situation line present", has(s, "situation"));
  check("cost line present", has(s, "cout"));
  check("concentration line present", has(s, "concentration"));
  check("trajectory line present", has(s, "trajectoire"));
  check("where-to-act line present", has(s, "agir"));
  check(
    "lines come in the reading order: facts, then trajectory, then action",
    s.lignes.map((l) => l.id).join(",").startsWith("situation,cout,concentration,trajectoire,agir"),
  );
  check("a headline is produced", typeof s.accroche === "string" && s.accroche.length > 0);
  check("headline leads on simultaneity, the portfolio-specific fact",
    (s.accroche ?? "").includes("le même jour"));
}

// ---------------------------------------------------------------------------
// 2. Facts, not templates — a missing input removes its sentence entirely
// ---------------------------------------------------------------------------
{
  const bare = buildExecutiveSummary({
    now: NOW,
    sites: 2,
    sitesEvalues: 0,
    sitesEnRestriction: 0,
    sitesEnAlerteForte: 0,
    joursSousArreteSites: 0,
    jeaSites: 0,
    portefeuille: computePortfolio({ now: NOW, sites: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }),
    parSite: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  });
  check("no evaluated site → no situation line", !has(bare, "situation"));
  check("no constrained days → no cost line", !has(bare, "cout"));
  check("no replay → no concentration line", !has(bare, "concentration"));
  check("no projection → no trajectory line", !has(bare, "trajectoire"));
  check("nothing to rank → no where-to-act line", !has(bare, "agir"));
  check("no fabricated headline when nothing was computed", bare.accroche === undefined);
  check("but the unknowns line still appears", has(bare, "inconnu"));
  // The unknowns line is allowed to explain *why* something is missing; no
  // other line may fall back to a placeholder instead of disappearing.
  check("no sentence outside the unknowns line reports an unavailability",
    bare.lignes.every((l) => l.id === "inconnu" || !/indisponible|non renseign/i.test(l.texte)));
}

// ---------------------------------------------------------------------------
// 3. The unknowns line names what is missing, and never reads as zero risk
// ---------------------------------------------------------------------------
{
  const partial = buildExecutiveSummary({
    ...richInput,
    sites: 5,          // two more sites than the portfolio could evaluate
    sitesEvalues: 3,
  });
  const l = line(partial, "inconnu");
  check("unknowns line present when sites could not be evaluated", l !== undefined);
  check("it counts the unevaluated sites", (l?.texte ?? "").includes("2 sites sans statut"));
  check("it counts the sites without declared volumes", (l?.texte ?? "").includes("sans volume"));

  // A declared volume that could not be converted (no restriction history yet)
  // must NOT be reported as a missing volume: the owner would go looking for a
  // field that is already filled in.
  const declareMaisSansJours = buildExecutiveSummary({
    ...richInput,
    sites: 1,
    sitesEvalues: 1,
    jeaTotal: undefined,
    jeaSites: 0,
    portefeuille: computePortfolio({
      now: NOW,
      sites: [{ id: "a", label: "A", volumeM3: 50000 }],
    }),
    parSite: [{ id: "a", label: "A" }],
  });
  check("a declared-but-unconvertible volume is not reported as missing",
    !(line(declareMaisSansJours, "inconnu")?.texte ?? "").includes("sans volume"));
  check("but its missing history is reported",
    (line(declareMaisSansJours, "inconnu")?.texte ?? "").includes("sans historique"));
  check("it states explicitly that they are not risk-free",
    (l?.texte ?? "").includes("jamais comme des sites sans risque"));
  check("unknowns line is always last", partial.lignes.at(-1)?.id === "inconnu");

  // Nothing missing at all → no unknowns line to clutter the summary.
  const complet = buildExecutiveSummary({
    ...richInput,
    portefeuille: computePortfolio({
      now: NOW,
      sites: richInput.parSite.map((s) => ({
        id: s.id, label: s.label, periodes: [day(2025, 7, 1), 10, ALERTE],
        volumeM3: 1000, zoneCle: "Z1", coutJourEuros: 100, autonomieJours: 0,
        exposureInterval: { alerte: { min: 1, max: 1 } },
        joursParNiveau: { alerte: 10 },
      })),
    }),
  });
  check("nothing missing → no unknowns line", !has(complet, "inconnu"));
}

// ---------------------------------------------------------------------------
// 4. Tone escalates with the facts, not with the wording
// ---------------------------------------------------------------------------
{
  const s = buildExecutiveSummary(richInput);
  check("alerte renforcée on site → situation tone is 'alerte'",
    line(s, "situation")?.ton === "alerte");

  const calme = buildExecutiveSummary({
    ...richInput,
    sitesEnRestriction: 0,
    sitesEnAlerteForte: 0,
  });
  check("no site under restriction → neutral situation tone",
    line(calme, "situation")?.ton === "neutre");
  check("and the sentence says so plainly",
    (line(calme, "situation")?.texte ?? "").startsWith("Aucun"));

  // Two of three sites constrained together = half the replayed parc.
  check("peak covering half the parc raises the concentration tone",
    line(s, "concentration")?.ton === "alerte");
}

// ---------------------------------------------------------------------------
// 5. Numbers are the computed ones, formatted for reading
// ---------------------------------------------------------------------------
{
  const s = buildExecutiveSummary(richInput);
  const cout = line(s, "cout")?.texte ?? "";
  check("constrained days reported as computed", cout.includes("55 jours"));
  // Formatted through the same locale as the builder: fr-FR groups with a
  // narrow no-break space, so a literal " " here would fail for the wrong reason.
  const fr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
  // a: 365 000 × 30/365 = 30 000 ; b: 73 000 × 20/365 = 4 000 ; c: 3 650 × 5/365 = 50
  check("m³ at risk is the sum of the per-site figures", cout.includes(`${fr(34050)} m³`));
  // ⚠️ Euros are now `coutJourEuros × JEA`, not × the old weighted day count. The
  // JEA comes from the real episodes: a and b each carry one 40-day total ban over
  // one covered year → 40 JEA; c carries 10.
  // a: 10 000 × 40 = 400 000 ; b: 5 000 × 40 = 200 000 ; c: 100 × 10 = 1 000
  check("euros compacted for reading", cout.includes(`${fr(601)} k€`));
  check("no caveat when every site declared its cost", !cout.includes("chiffre d'affaires"));

  const traj = line(s, "trajectoire")?.texte ?? "";
  check("trajectory states both endpoints and the delta",
    traj.includes("55") && traj.includes("71") && traj.includes("+29 %"));

  const agir = line(s, "agir")?.texte ?? "";
  check("Pareto names the smallest set carrying half the days",
    agir.includes("1 site sur 3") && agir.includes("Usine A"));

  const conc = line(s, "concentration")?.texte ?? "";
  check("peak date is written in French", conc.includes("1 juillet 2025"));
}

// ---------------------------------------------------------------------------
// 6. The revenue fallback is disclosed wherever it is used
// ---------------------------------------------------------------------------
{
  // ⚠️ This section used to check that a revenue-derived euro figure DISCLOSED
  // itself in the sentence ("dont une partie estimée à partir du chiffre
  // d'affaires"). G6 removed the fallback, so the check is inverted: a site that
  // declares a revenue and no cost per day must produce NO euro figure, and the
  // sentence must say that the sites without one are absent from the total —
  // rather than quietly summing over fewer sites than the reader assumes.
  const s = buildExecutiveSummary({
    ...richInput,
    portefeuille: computePortfolio({
      now: NOW,
      sites: [
        {
          id: "a", label: "A", periodes: [day(2025, 7, 1), 10, ALERTE],
          volumeM3: 365_000, autonomieJours: 0,
          exposureInterval: { alerte: { min: 1, max: 1 } },
          joursParNiveau: { alerte: 10 },
          // A declared revenue and NO cost per day.
        },
      ],
    }),
  });
  check("no euro figure is invented from a revenue (G6)",
    !(line(s, "cout")?.texte ?? "").includes("Exposition financière"));

  const declare = buildExecutiveSummary({
    ...richInput,
    portefeuille: computePortfolio({
      now: NOW,
      sites: [
        {
          id: "a", label: "A", periodes: [day(2025, 7, 1), 10, ALERTE],
          volumeM3: 365_000, coutJourEuros: 1000, autonomieJours: 0,
          exposureInterval: { alerte: { min: 1, max: 1 } },
          joursParNiveau: { alerte: 10 },
        },
      ],
    }),
  });
  check("a declared cost per day does produce a euro figure",
    (line(declare, "cout")?.texte ?? "").includes("Exposition financière"));

  // Mixed: one site declares a cost, one does not. The total then covers ONE site
  // out of two, and must say so — a partial total read as complete is the whole
  // risk of removing the fallback without a word.
  const mixte = buildExecutiveSummary({
    ...richInput,
    portefeuille: computePortfolio({
      now: NOW,
      sites: [
        {
          id: "a", label: "A", periodes: [day(2025, 7, 1), 10, ALERTE],
          volumeM3: 365_000, coutJourEuros: 1000, autonomieJours: 0,
          exposureInterval: { alerte: { min: 1, max: 1 } },
          joursParNiveau: { alerte: 10 },
        },
        {
          id: "b", label: "B", periodes: [day(2025, 7, 1), 10, ALERTE],
          volumeM3: 365_000, autonomieJours: 0,
          exposureInterval: { alerte: { min: 1, max: 1 } },
          joursParNiveau: { alerte: 10 },
        },
      ],
    }),
  });
  const coutMixte = line(mixte, "cout")?.texte ?? "";
  check("a partial euro total names how many sites are missing from it",
    /1 site est absent/.test(coutMixte));
  check("… and says the removed fallback is why", coutMixte.includes("chiffre d'affaires"));
}

// ---------------------------------------------------------------------------
// 7. Markdown rendering, for the ESG report
// ---------------------------------------------------------------------------
{
  const md = executiveSummaryMarkdown(buildExecutiveSummary(richInput));
  check("markdown carries the headline in bold", md.startsWith("**"));
  check("markdown renders one bullet per line",
    md.split("\n\n").filter((b) => b.startsWith("- **")).length ===
      buildExecutiveSummary(richInput).lignes.length);
  check("empty summary renders as an empty string",
    executiveSummaryMarkdown({ lignes: [] }) === "");
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("executive: all checks pass");
