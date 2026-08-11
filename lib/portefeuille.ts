// Portfolio analysis — what a parc of sites is exposed to, as opposed to what
// each of its sites is exposed to.
//
// The dashboard until now *stacked* per-site analyses: average score, max
// score, sum of constrained days. That answers "which of my sites is the worst"
// — a question a company already knows the answer to. It cannot answer the two
// questions that actually drive a portfolio decision:
//
//   1. How many of my sites are constrained ON THE SAME DAY?
//   2. What does that cost, in m³ and in euros?
//
// On (1): twenty sites spread over eighteen alert zones and twenty sites packed
// into three give the *same* total of constrained days. They are not the same
// risk. In the second case a single prefectural decree immobilises most of the
// parc on the same day, and it is that day — not the annual mean — that breaks
// a supply chain. The hydrology literature calls this drought synchronicity and
// notes that risk assessments routinely assume events are independent across
// locations. Here they need not be assumed at all: ten years of decrees are
// published, so the co-occurrence is measured by replaying them.
//
// On (2): the HANDBOOK records "weight exposure by volumes: BLOCKED, VigiEau
// publishes no volume per usage". True of the public source, and beside the
// point — the company knows its own volumes. They are asked for, never guessed.
//
// This module is pure and offline, in the vein of computeAnticipation and
// computeInterruption: it consumes what the dashboard already fetched.

import { GRAVITE } from "./gravite";
import { HISTORY_DAY_MS } from "./history";
import { computeIa, episodesFromPeriodes, type ExposureIntervalByLevel } from "./ia";
import { computeVnp, resolveVref } from "./vnp";
import type { ResponseType } from "./sites";
import type { NiveauGravite } from "./types";

/** Scalar exposure per level. Kept for the peak replay, which needs one number. */
export type ExposureByLevel = Partial<Record<NiveauGravite, number>>;

const RANK_TO_NIVEAU: Record<number, NiveauGravite> = {
  1: "vigilance",
  2: "alerte",
  3: "alerte_renforcee",
  4: "crise",
};

/** Constrained = an obligation applies. Vigilance is an appeal, not a rule. */
const CONSTRAINED_RANK = GRAVITE.alerte.rank;

// ⚠️ Two coefficients used to live here and were REMOVED at Sprint 42b (G6, G10).
// Recording why, because both looked harmless and neither was:
//
//   - `DEPENDANCE_FACTOR` (0.6 / 1 / 1.4 / 1.8) multiplied a MEASURED day count
//     by a number I had invented, and existed in two copies kept in step by a
//     test that read the other module's source text. §4.3 asks instead for a
//     declared production response — lib/ia.ts implements it and REFUSES when the
//     declaration is missing, which is the opposite of a default.
//   - `REVENUE_SHARE_PER_DAY = 0.005` turned an annual revenue into a euro loss
//     at 0.5 %/day, sourced to a Swiss Re all-perils order of magnitude. That is
//     anti-pattern n°10 (« estimer une perte financière ») almost verbatim: the
//     figure was labelled `repli_ca`, but a label does not make a number about
//     drought out of one that is not. Euros now come ONLY from a cost per day the
//     client declares — and an empty cell is the honest output otherwise.

export interface PortfolioSiteInput {
  id: string;
  label: string;
  /** run-length restriction calendar of the zone the site depends on */
  periodes?: number[];
  /** blocked share per gravity level, read from the arrêtés (never posed here) */
  exposure?: ExposureByLevel;
  /** the same, as the interval G2 propagates — what the IA and the VNP consume */
  exposureInterval?: ExposureIntervalByLevel;
  /** JS: total days under an arrêté in a typical year (a measured fact) */
  joursSousArrete?: number;
  /** mean days per level over the complete years, for the VNP */
  joursParNiveau?: Partial<Record<NiveauGravite, number>>;
  /** how many complete years the calendar spans, so the JEA is per year */
  anneesCompletes?: number;
  /** §4.3 production response, declared by the client */
  reponse?: ResponseType;
  /** storage the site can draw on, m³ */
  tamponM3?: number;
  /** daily volume below which the site stops entirely, m³ */
  seuilTechniqueM3?: number;
  /** number of equal steps a `stepwise` site loses production in */
  paliers?: number;
  /** share of the withdrawal returned to the same body, 0-1 */
  tauxRestitution?: number;
  /** twelve monthly shares of the annual volume, January first */
  profilMensuel?: number[];
  /** declared by the company — annual withdrawal, m³ */
  volumeM3?: number;
  /** declared: cost of one day of stoppage, € — the ONLY euro input (G6) */
  coutJourEuros?: number;
  /** declared: days of activity the site can run on stored water */
  autonomieJours?: number;
  /** true when the site is a classified installation (ICPE), for V_ref */
  icpe?: boolean;
  /** grouping keys for concentration; undefined = the site is not grouped */
  zoneCle?: string;
  bassin?: string;
  departement?: string;
}

export interface PortfolioInput {
  sites: PortfolioSiteInput[];
  /** injectable clock, so tests are deterministic */
  now?: Date;
  /**
   * First calendar year the source file covers (`diag.coverage.from`).
   *
   * ⚠️ Not the same as the year of the first decree, and using the latter is a
   * measurement error — caught on real data, invisible on fixtures. VigiEau's
   * zone referential is redrawn over time, so a zone code in force today simply
   * does not appear in older decrees: Lyon's `84_69_0004` starts in 2022 inside
   * a file covering 2017→. Deriving the window from the first run would divide
   * per-year figures by 4 instead of 9 and inflate them accordingly.
   *
   * A covered year without a decree is a measured calm and counts as a zero —
   * the same rule `lib/history.ts` applies with its `fileMinYear` bound. Absent,
   * the replay falls back to the first decree and says so through `annees`.
   */
  couvertureDepuis?: number;
}

export interface SimultaneityPeak {
  /** number of sites constrained at the same time */
  sites: number;
  /** longest consecutive stretch spent at that peak */
  jours: number;
  debut: string;
  fin: string;
  siteIds: string[];
}

export interface SimultaneityResult {
  available: boolean;
  message?: string;
  /** complete calendar years replayed, oldest first */
  annees: number[];
  /** sites carrying a usable calendar — the replay's denominator */
  sitesRejoues: number;
  /**
   * days[k] = number of days over the whole replay with exactly k sites
   * constrained. Index 0 included: quiet days are a result too.
   */
  distribution: number[];
  /** mean days per year with at least two sites constrained at once */
  joursMultiSitesParAn?: number;
  pic?: SimultaneityPeak;
  /** worst complete year, by cumulated site-days */
  anneePire?: { annee: number; siteJours: number; pic: number };
  /**
   * Peak of "sites-equivalent stopped": the same replay weighted by each site's
   * exposure and dependence rather than counting heads. A site whose decrees
   * only ever restrict watering does not stop like a site on process water.
   */
  picPondere?: number;
}

export interface ConcentrationResult {
  cle: "zone" | "bassin" | "departement";
  label: string;
  /** sites carrying this key */
  sites: number;
  groupes: number;
  /** Herfindahl-Hirschman index over the site shares, 0-1 */
  hhi: number;
  /** 1/HHI — the readable form: "your N sites behave like X independent zones" */
  effectifs: number;
  plusGrosGroupe?: { cle: string; sites: number; part: number };
}

export interface Grappe {
  cle: string;
  type: ConcentrationResult["cle"];
  siteIds: string[];
  labels: string[];
  /** cumulated JEA over the cluster, if every member has one */
  jea?: number;
  m3ARisque?: number;
}

export interface SiteCorrelation {
  id: string;
  label: string;
  /** constrained days of this site over the replay */
  jours: number;
  /** of which, days where at least one other site was constrained too */
  joursPartages: number;
  /** joursPartages / jours, 0-1. undefined when the site is never constrained */
  partSimultanee?: number;
}

export interface SiteValue {
  id: string;
  label: string;
  /**
   * VNP de crise, m³/an — the note's own indicator, computed by lib/vnp.
   *
   * ⚠️ It used to be `volumeM3 × joursContraints / 365`, a flat daily withdrawal
   * multiplied by a weighted day count. That approximation is gone: the real VNP
   * deducts the exempt volume BEFORE applying ρ, applies the restitution rate,
   * and weights by the monthly profile when one is declared.
   */
  m3ARisque?: number;
  /** upper bound of the same, when ρ carried an interval (G2) */
  m3ARisqueMax?: number;
  /** euros = coutJourEuros × jea. No fallback (G6): declared or absent. */
  eurosARisque?: number;
  /**
   * IA — jours-équivalents d'arrêt per year, from lib/ia on the REAL episodes.
   *
   * Replaces `joursArretNet`, which was `Σ max(0, length − autonomieJours)`: the
   * right idea (a buffer absorbs short episodes) with two defects — it ignored
   * the intensity of the restriction, treating a 20 % cut as a full stop, and it
   * knew nothing of the production response.
   */
  jea?: number;
  jeaMax?: number;
  /** what the JEA supposes, captured at computation time (ADR-006) */
  jeaHypotheses?: string[];
}

export interface PortfolioValue {
  m3Total?: number;
  /** sites that actually got an m³ figure */
  m3Sites: number;
  /**
   * Sites that declared a volume, whether or not it could be converted.
   * Distinct from `m3Sites` on purpose: a site with a volume but no restriction
   * history is missing DAYS, not volume, and telling its owner to "renseigner
   * le volume" would send them to fix something that is already filled in.
   */
  m3Declares: number;
  eurosTotal?: number;
  /**
   * Sites that got a euro figure. ⚠️ Always equal to the number of sites that
   * DECLARED a cost per day and had a JEA: there is no fallback any more (G6),
   * so an empty euro column means "nobody told us", never "no exposure".
   */
  eurosSites: number;
  /** JEA total over the sites that have one — the figure euros are derived from */
  jeaTotal?: number;
  jeaSites: number;
  parSite: SiteValue[];
}

export interface PortfolioResult {
  sites: number;
  simultaneite: SimultaneityResult;
  concentration: ConcentrationResult[];
  grappes: Grappe[];
  correlations: SiteCorrelation[];
  valeur: PortfolioValue;
  /** sites with no usable restriction calendar — never counted as risk-free */
  sitesNonEvalues: string[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const iso = (dayIndex: number) => new Date(dayIndex * HISTORY_DAY_MS).toISOString().slice(0, 10);

/** Merge several zone calendars into one, keeping the worst level per day. */
export function mergePeriodes(calendars: Array<number[] | undefined>): number[] {
  // Deduplicated by reference, not by value: a zone is served under both its
  // code and its numeric id, pointing at the same array. Without this a site
  // covered by one zone would arrive as two identical calendars and take the
  // day-by-day merge path to reproduce what it was already given.
  const present = [
    ...new Set(calendars.filter((c): c is number[] => Array.isArray(c) && c.length > 0)),
  ];
  if (present.length === 0) return [];
  if (present.length === 1) return present[0];
  const byDay = new Map<number, number>();
  let min = Infinity;
  let max = -Infinity;
  for (const runs of present) {
    for (let i = 0; i < runs.length; i += 3) {
      const start = runs[i];
      const end = start + runs[i + 1] - 1;
      const rank = runs[i + 2];
      if (start < min) min = start;
      if (end > max) max = end;
      for (let d = start; d <= end; d++) {
        const prev = byDay.get(d);
        if (prev === undefined || rank > prev) byDay.set(d, rank);
      }
    }
  }
  const out: number[] = [];
  let runStart = -1;
  let runRank = -1;
  for (let d = min; d <= max; d++) {
    const r = byDay.get(d);
    if (r === runRank) continue;
    if (runStart >= 0) out.push(runStart, d - runStart, runRank);
    if (r === undefined) {
      runStart = -1;
      runRank = -1;
    } else {
      runStart = d;
      runRank = r;
    }
  }
  if (runStart >= 0) out.push(runStart, max + 1 - runStart, runRank);
  return out;
}

// ⚠️ A local `episodes()` decoder lived here and MERGED adjacent runs of
// different levels into one episode, because an alerte hardening into crise never
// let the storage tank refill. It was replaced by `episodesFromPeriodes` from
// lib/ia.ts, which does NOT merge — and that difference was a live defect for the
// length of one edit: the buffer refilled between the two halves of a continuous
// restriction, absorbing three days twice. The fix went into lib/ia.ts, where a
// zero gap between episodes now refills nothing. Recorded here because the
// deletion of this function is what exposed it.

/**
 * Blocked share of a site on a given level, bounded to [0, 1].
 *
 * ⚠️ This used to multiply the read exposure by `DEPENDANCE_FACTOR[site.dependance]`.
 * The factor is gone (G10): it could push a measured 0.8 to 1.0 or drop it to
 * 0.48 on the strength of a four-value dropdown, and nothing sourced the numbers.
 * What is left is the share the arrêté itself states.
 */
function exposureAt(site: PortfolioSiteInput, rank: number): number | undefined {
  const niveau = RANK_TO_NIVEAU[rank];
  if (!niveau) return undefined;
  const e = site.exposure?.[niveau];
  if (e === undefined) return undefined;
  return Math.min(1, Math.max(0, e));
}

function concentrationFor(
  sites: PortfolioSiteInput[],
  cle: ConcentrationResult["cle"],
  label: string,
  key: (s: PortfolioSiteInput) => string | undefined,
): ConcentrationResult | undefined {
  const counts = new Map<string, number>();
  let total = 0;
  for (const s of sites) {
    const k = key(s);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    total++;
  }
  if (total === 0) return undefined;
  let hhi = 0;
  let biggest: { cle: string; sites: number; part: number } | undefined;
  for (const [k, n] of counts) {
    const share = n / total;
    hhi += share * share;
    if (!biggest || n > biggest.sites) biggest = { cle: k, sites: n, part: share };
  }
  return {
    cle,
    label,
    sites: total,
    groupes: counts.size,
    hhi: Math.round(hhi * 1000) / 1000,
    effectifs: round1(1 / hhi),
    plusGrosGroupe: biggest,
  };
}

export function computePortfolio(input: PortfolioInput): PortfolioResult {
  const now = input.now ?? new Date();
  const currentYear = now.getUTCFullYear();
  const sites = input.sites;

  // --- Value at risk: m³, € and days net of storage ------------------------
  //
  // Deliberately independent of the replay: a site with volumes but no usable
  // calendar still deserves its m³ figure, and one with a calendar but no
  // volumes must not be counted as zero m³.
  const parSite: SiteValue[] = [];
  let m3Total = 0;
  let m3Sites = 0;
  let m3Declares = 0;
  let eurosTotal = 0;
  let eurosSites = 0;
  let jeaTotal = 0;
  let jeaSites = 0;

  for (const s of sites) {
    const v: SiteValue = { id: s.id, label: s.label };
    const volumeDeclare = s.volumeM3 !== undefined && s.volumeM3 > 0;
    if (volumeDeclare) m3Declares++;
    const exposure = s.exposureInterval ?? {};

    // --- VNP: the note's own indicator, not an approximation of it -----------
    if (volumeDeclare && s.joursParNiveau) {
      const vnp = computeVnp({
        daysByLevel: s.joursParNiveau,
        exposure,
        vref: resolveVref({ volumeDeclareM3: s.volumeM3, icpe: s.icpe }),
        tauxRestitution: s.tauxRestitution,
        profilMensuel: s.profilMensuel,
        // ⚠️ No trajectory here. The structural component must never be summed
        // with the crisis one (anti-pattern n°3), and a portfolio total is a sum
        // by construction — so the portfolio carries the crisis component only,
        // and the structural one stays on the site sheet where it can stand
        // beside it without being added to it.
      });
      if (vnp.crise) {
        v.m3ARisque = Math.round(vnp.crise.min);
        v.m3ARisqueMax = Math.round(vnp.crise.max);
        m3Total += v.m3ARisque;
        m3Sites++;
      }
    }

    // --- IA: JEA on the real episodes, buffer and response included ----------
    if (s.periodes?.length) {
      const eps = episodesFromPeriodes(s.periodes).filter(
        // Partial current year excluded, as everywhere else in the repo.
        (e) => new Date(e.startDay * HISTORY_DAY_MS).getUTCFullYear() < currentYear,
      );
      if (eps.length > 0) {
        // Same denominator rule as the replay: years the file covers but the zone
        // spent quiet are real zeros, so the mean is over the covered window, not
        // over the years that happen to carry an episode.
        const years = new Set(
          eps.map((e) => new Date(e.startDay * HISTORY_DAY_MS).getUTCFullYear()),
        );
        const premiere =
          input.couvertureDepuis !== undefined
            ? Math.min(input.couvertureDepuis, Math.min(...years))
            : Math.min(...years);
        const span = Math.max(1, currentYear - premiere);
        const ia = computeIa({
          episodes: eps,
          exposure,
          vrefM3: s.volumeM3,
          tauxRestitution: s.tauxRestitution,
          reponse: s.reponse,
          tamponM3: s.tamponM3,
          autonomieJours: s.autonomieJours,
          seuilTechniqueM3: s.seuilTechniqueM3,
          paliers: s.paliers,
          profilMensuel: s.profilMensuel,
          anneesCouvertes: span,
        });
        if (ia.available) {
          v.jea = round1(ia.jeaMin);
          v.jeaMax = round1(ia.jeaMax);
          v.jeaHypotheses = ia.hypotheses;
        }
      }
    }

    // --- Euros: declared cost per day × JEA, or nothing (G6) ----------------
    if (v.jea !== undefined) {
      jeaTotal += v.jea;
      jeaSites++;
    }
    if (v.jea !== undefined && s.coutJourEuros !== undefined && s.coutJourEuros > 0) {
      v.eurosARisque = Math.round(s.coutJourEuros * v.jea);
      eurosTotal += v.eurosARisque;
      eurosSites++;
    }

    parSite.push(v);
  }

  // --- Concentration -------------------------------------------------------
  const concentration = [
    concentrationFor(sites, "zone", "zone d'alerte", (s) => s.zoneCle),
    concentrationFor(sites, "bassin", "bassin", (s) => s.bassin),
    concentrationFor(sites, "departement", "département", (s) => s.departement),
  ].filter((c): c is ConcentrationResult => c !== undefined);

  // --- Co-exposed clusters -------------------------------------------------
  const grappes: Grappe[] = [];
  const clusterKeys: Array<[ConcentrationResult["cle"], (s: PortfolioSiteInput) => string | undefined]> = [
    ["zone", (s) => s.zoneCle],
    ["bassin", (s) => s.bassin],
  ];
  for (const [type, key] of clusterKeys) {
    const groups = new Map<string, PortfolioSiteInput[]>();
    for (const s of sites) {
      const k = key(s);
      if (!k) continue;
      let members = groups.get(k);
      if (!members) {
        members = [];
        groups.set(k, members);
      }
      members.push(s);
    }
    for (const [k, members] of groups) {
      if (members.length < 2) continue;
      const jea = members.map((m) => parSite.find((p) => p.id === m.id)?.jea);
      const m3 = members.map((m) => parSite.find((p) => p.id === m.id)?.m3ARisque);
      grappes.push({
        cle: k,
        type,
        siteIds: members.map((m) => m.id),
        labels: members.map((m) => m.label),
        jea: jea.every((j) => j !== undefined)
          ? round1(jea.reduce((a, b) => a + b!, 0))
          : undefined,
        m3ARisque: m3.every((v) => v !== undefined)
          ? m3.reduce((a, b) => a + b!, 0)
          : undefined,
      });
    }
  }
  // Zone clusters before basin clusters, then heaviest first: a shared zone is
  // a shared decree, a shared basin is only a shared hydrology.
  grappes.sort(
    (a, b) =>
      (a.type === b.type ? 0 : a.type === "zone" ? -1 : 1) ||
      b.siteIds.length - a.siteIds.length ||
      (b.jea ?? 0) - (a.jea ?? 0),
  );

  // --- Simultaneity replay -------------------------------------------------
  const replayable = sites.filter((s) => s.periodes && s.periodes.length > 0);
  const sitesNonEvalues = sites.filter((s) => !s.periodes || s.periodes.length === 0).map((s) => s.id);

  const valeur: PortfolioValue = {
    m3Total: m3Sites > 0 ? m3Total : undefined,
    m3Sites,
    m3Declares,
    eurosTotal: eurosSites > 0 ? eurosTotal : undefined,
    eurosSites,
    jeaTotal: jeaSites > 0 ? round1(jeaTotal) : undefined,
    jeaSites,
    parSite,
  };

  if (replayable.length === 0) {
    return {
      sites: sites.length,
      simultaneite: {
        available: false,
        annees: [],
        sitesRejoues: 0,
        distribution: [],
        message: "Calendrier des arrêtés indisponible pour les sites du portefeuille.",
      },
      concentration,
      grappes,
      correlations: [],
      valeur,
      sitesNonEvalues,
    };
  }

  // Replay range: from the first year any site was ever under a decree, to the
  // end of the last COMPLETE year. The current year is partial and would drag
  // every per-year figure down, exactly as it is excluded from the structural
  // mean in lib/history.ts.
  let firstDay = Infinity;
  for (const s of replayable) {
    for (let i = 0; i < s.periodes!.length; i += 3) {
      if (s.periodes![i] < firstDay) firstDay = s.periodes![i];
    }
  }
  // The file's coverage wins over the first decree: a covered year without a
  // decree is a zero, not a gap. Guarded against a coverage claim that would
  // start after the data actually does.
  const firstRunYear = new Date(firstDay * HISTORY_DAY_MS).getUTCFullYear();
  const firstYear =
    input.couvertureDepuis !== undefined && input.couvertureDepuis < firstRunYear
      ? input.couvertureDepuis
      : firstRunYear;
  const lastYear = currentYear - 1;
  if (!Number.isFinite(firstDay) || firstYear > lastYear) {
    return {
      sites: sites.length,
      simultaneite: {
        available: false,
        annees: [],
        sitesRejoues: replayable.length,
        distribution: [],
        message: "Aucune année complète d'arrêtés à rejouer sur ce portefeuille.",
      },
      concentration,
      grappes,
      correlations: [],
      valeur,
      sitesNonEvalues,
    };
  }

  const startDay = Math.floor(Date.UTC(firstYear, 0, 1) / HISTORY_DAY_MS);
  const endDay = Math.floor(Date.UTC(lastYear, 11, 31) / HISTORY_DAY_MS);
  const span = endDay - startDay + 1;
  const annees: number[] = [];
  for (let y = firstYear; y <= lastYear; y++) annees.push(y);

  // One rank-per-day lane per site. Quiet years inside the range stay zero on
  // purpose: a year without a decree is a measured calm, not a missing value.
  const lanes = replayable.map((s) => {
    const lane = new Int8Array(span);
    for (let i = 0; i < s.periodes!.length; i += 3) {
      const from = Math.max(startDay, s.periodes![i]);
      const to = Math.min(endDay, s.periodes![i] + s.periodes![i + 1] - 1);
      const rank = s.periodes![i + 2];
      for (let d = from; d <= to; d++) lane[d - startDay] = rank;
    }
    return lane;
  });

  const distribution = new Array<number>(replayable.length + 1).fill(0);
  const joursParSite = new Array<number>(replayable.length).fill(0);
  const joursPartagesParSite = new Array<number>(replayable.length).fill(0);
  const perYear = new Map<number, { siteJours: number; pic: number }>();
  let joursMultiSites = 0;
  let picCount = 0;
  let picPondere = 0;
  const picDays: number[] = [];

  for (let i = 0; i < span; i++) {
    let count = 0;
    let weighted = 0;
    const members: number[] = [];
    for (let s = 0; s < lanes.length; s++) {
      const rank = lanes[s][i];
      if (rank < CONSTRAINED_RANK) continue;
      count++;
      members.push(s);
      joursParSite[s]++;
      const e = exposureAt(replayable[s], rank);
      if (e !== undefined) weighted += e;
    }
    distribution[count]++;
    if (count >= 2) {
      joursMultiSites++;
      for (const s of members) joursPartagesParSite[s]++;
    }
    if (weighted > picPondere) picPondere = weighted;

    const year = new Date((startDay + i) * HISTORY_DAY_MS).getUTCFullYear();
    const bucket = perYear.get(year) ?? { siteJours: 0, pic: 0 };
    bucket.siteJours += count;
    if (count > bucket.pic) bucket.pic = count;
    perYear.set(year, bucket);

    if (count > picCount) {
      picCount = count;
      picDays.length = 0;
    }
    if (count === picCount && count > 0) picDays.push(startDay + i);
  }

  // The peak, reported as its longest unbroken stretch: "9 sites at once for
  // 11 days" is an operational fact, "9 sites at once" alone is a headline.
  let pic: SimultaneityPeak | undefined;
  if (picCount > 0 && picDays.length > 0) {
    let bestStart = picDays[0];
    let bestLen = 1;
    let runStart = picDays[0];
    let runLen = 1;
    for (let i = 1; i < picDays.length; i++) {
      if (picDays[i] === picDays[i - 1] + 1) runLen++;
      else {
        runStart = picDays[i];
        runLen = 1;
      }
      if (runLen > bestLen) {
        bestLen = runLen;
        bestStart = runStart;
      }
    }
    // Members are read back from the reported stretch, not from whichever day
    // first hit the peak — otherwise the named sites and the shown dates could
    // belong to two different episodes.
    const siteIds: string[] = [];
    for (let s = 0; s < lanes.length; s++) {
      if (lanes[s][bestStart - startDay] >= CONSTRAINED_RANK) siteIds.push(replayable[s].id);
    }
    pic = {
      sites: picCount,
      jours: bestLen,
      debut: iso(bestStart),
      fin: iso(bestStart + bestLen - 1),
      siteIds,
    };
  }

  let anneePire: SimultaneityResult["anneePire"];
  for (const [annee, b] of perYear) {
    if (!anneePire || b.siteJours > anneePire.siteJours) {
      anneePire = { annee, siteJours: b.siteJours, pic: b.pic };
    }
  }

  const correlations: SiteCorrelation[] = replayable.map((s, i) => ({
    id: s.id,
    label: s.label,
    jours: joursParSite[i],
    joursPartages: joursPartagesParSite[i],
    partSimultanee:
      joursParSite[i] > 0 ? Math.round((joursPartagesParSite[i] / joursParSite[i]) * 100) / 100 : undefined,
  }));

  return {
    sites: sites.length,
    simultaneite: {
      available: true,
      annees,
      sitesRejoues: replayable.length,
      distribution,
      joursMultiSitesParAn: round1(joursMultiSites / annees.length),
      pic,
      anneePire,
      picPondere: round1(picPondere),
    },
    concentration,
    grappes,
    correlations,
    valeur,
    sitesNonEvalues,
  };
}

/**
 * The correlation findings as Markdown, for the portfolio ESG report.
 *
 * Returns an empty string when there is nothing measured to say — the report
 * then omits the whole section rather than printing an empty heading.
 */
export function correlationMarkdown(result: PortfolioResult): string {
  const s = result.simultaneite;
  if (!s.available) return "";
  const nf = new Intl.NumberFormat("fr-FR");
  const n = (v: number) => nf.format(Math.round(v));
  const L: string[] = [];

  L.push(
    `Rejeu des arrêtés publiés sur les zones dont dépendent vos sites, sur ` +
      `${s.annees.length} année${s.annees.length > 1 ? "s" : ""} complète${
        s.annees.length > 1 ? "s" : ""
      } (${s.annees[0]}–${s.annees.at(-1)}), pour ${n(s.sitesRejoues)} site${
        s.sitesRejoues > 1 ? "s" : ""
      } disposant d'un historique.`,
  );
  L.push("");

  if (s.pic) {
    L.push(
      `- **Pic de simultanéité** : ${n(s.pic.sites)} site${s.pic.sites > 1 ? "s" : ""} ` +
        `contraint${s.pic.sites > 1 ? "s" : ""} en même temps, ${n(s.pic.jours)} jour${
          s.pic.jours > 1 ? "s" : ""
        } consécutif${s.pic.jours > 1 ? "s" : ""} à partir du ${s.pic.debut}.`,
    );
  }
  if (s.joursMultiSitesParAn !== undefined) {
    L.push(
      `- **Jours multi-sites** : ${nf.format(s.joursMultiSitesParAn)} jours par an en moyenne ` +
        `avec au moins deux sites contraints simultanément.`,
    );
  }
  if (s.anneePire) {
    L.push(
      `- **Année la plus lourde** : ${s.anneePire.annee}, ${n(s.anneePire.siteJours)} site-jours ` +
        `cumulés, pic à ${n(s.anneePire.pic)} site${s.anneePire.pic > 1 ? "s" : ""}.`,
    );
  }
  for (const c of result.concentration) {
    if (c.sites < 2) continue;
    L.push(
      `- **Concentration par ${c.label}** : ${n(c.sites)} sites répartis sur ${n(c.groupes)} ` +
        `groupe${c.groupes > 1 ? "s" : ""}, soit ${nf.format(c.effectifs)} équivalent${
          c.effectifs >= 2 ? "s" : ""
        } indépendant${c.effectifs >= 2 ? "s" : ""} (HHI ${nf.format(c.hhi)}).`,
    );
  }
  const grappes = result.grappes.filter((g) => g.type === "zone");
  if (grappes.length > 0) {
    L.push("");
    L.push(`| Zone d'alerte | Sites contraints ensemble | JEA cumulés |`);
    L.push(`| --- | --- | ---: |`);
    for (const g of grappes) {
      L.push(
        `| ${g.cle} | ${g.labels.join(", ")} | ${
          g.jea !== undefined ? `${nf.format(g.jea)} JEA` : "—"
        } |`,
      );
    }
  }
  return L.join("\n");
}

/** Levels a portfolio-wide caveat should carry, reused by the report. */
export const PORTFOLIO_CAVEAT =
  "La simultanéité est rejouée sur les arrêtés réellement publiés des zones dont dépendent " +
  "vos sites, années complètes uniquement. Les m³ et les euros dérivent des volumes et des " +
  "coûts que vous avez déclarés : l'outil ne les estime jamais à votre place.";

// ---------------------------------------------------------------------------
// Materiality of the ranking — the arbitration left open since Sprint 26
// ---------------------------------------------------------------------------

/** One materiality class: sites whose intervals overlap and cannot be separated. */
export interface ClasseMaterielle {
  /** 1-based rank of the CLASS, not of a site */
  rang: number;
  /** site ids sharing this rank, ordered by lower bound for display only */
  sites: string[];
  /** the class's envelope in JEA — the union of its members' intervals */
  jeaMin: number;
  jeaMax: number;
}

export interface ClassementMateriel {
  classes: ClasseMaterielle[];
  /** sites with no JEA at all: not ranked, and not ranked LAST either */
  nonClasses: string[];
  detail: string;
}

/**
 * Group sites into ranks that can actually be defended.
 *
 * ⚠️⚠️ THE ARBITRATION, open since Sprint 26 and settled here. « À partir de quel écart
 * deux sites sont-ils vraiment classés différemment plutôt que séparés par du bruit ? »
 *
 * The tempting answer is a threshold — "more than 5 JEA apart". It is also the wrong
 * answer, because that 5 would be invented, and an invented coefficient in the ranking is
 * exactly what ADR-004 warns about: the ranking is the output the note calls most
 * trustworthy, so a made-up number there discredits the one thing we can defend.
 *
 * The right answer was already in the data. Every JEA is an INTERVAL, `[jea, jeaMax]`,
 * widened by each arrêté measure whose ρ could not be read (G2). Two sites are genuinely
 * ordered when their intervals are DISJOINT, and indistinguishable when they overlap. No
 * threshold, no constant — the resolution of the ranking is whatever the arrêtés' own
 * precision allows, which is the honest ceiling.
 *
 * ⚠️ Overlap is NOT transitive, and this computes CONNECTED COMPONENTS of the overlap graph
 * so that it does not matter: A and B may overlap, B and C overlap, A and C not, and
 * separating A from C while both tie with B would be a ranking that contradicts itself.
 *
 * ⚠️ What actually does the work is the pair (descending sort, running MINIMUM). An earlier
 * version of this comment claimed the merit was "comparing against the class envelope rather
 * than against the previous site pairwise" — measured, those two are the SAME THING here,
 * because sorted descending the previous site in the list is always the last one added to the
 * current class, so `courante.jeaMin === precedent.jea` identically. The distinction was
 * vacuous and the comment said otherwise.
 *
 * The comparison that would genuinely break it is against the class's `jeaMax` instead of its
 * `jeaMin`: A = [30, 40] then B = [35, 45] overlap, yet `35 >= 40` is false and B would open
 * its own class. That is the mutation the test exercises.
 *
 * ⚠️ A consequence to accept rather than engineer around: when measures are widely
 * unquantified, intervals are wide, and the whole portfolio can collapse into ONE class.
 * That is the correct output — it says "these sites cannot be ranked on this evidence" —
 * and it is far better than a confident order built on nothing.
 *
 * ⚠️ Sites with no JEA are returned separately and are NOT ranked last. Absent is not
 * zero: the rule this repository applies everywhere else applies to ranking too.
 */
export function classementMateriel(
  parSite: { id: string; jea?: number; jeaMax?: number }[],
): ClassementMateriel {
  const nonClasses = parSite.filter((s) => s.jea === undefined).map((s) => s.id);
  const avec = parSite
    .filter((s): s is { id: string; jea: number; jeaMax?: number } => s.jea !== undefined)
    // Descending by lower bound: the most exposed class comes out rank 1.
    .sort((a, b) => b.jea - a.jea || a.id.localeCompare(b.id));

  const classes: ClasseMaterielle[] = [];
  for (const s of avec) {
    const haut = s.jeaMax ?? s.jea;
    const courante = classes[classes.length - 1];
    // Sorted descending, so `s` joins the current class when its UPPER bound still
    // reaches the class's lowest lower bound — i.e. the intervals touch.
    if (courante && haut >= courante.jeaMin) {
      courante.sites.push(s.id);
      courante.jeaMin = Math.min(courante.jeaMin, s.jea);
      courante.jeaMax = Math.max(courante.jeaMax, haut);
    } else {
      classes.push({
        rang: classes.length + 1,
        sites: [s.id],
        jeaMin: s.jea,
        jeaMax: haut,
      });
    }
  }

  const exAequo = classes.filter((c) => c.sites.length > 1).length;
  const detail =
    classes.length === 0
      ? "Aucun site n'a de JEA : il n'y a rien à classer, et ce n'est pas un classement vide."
      : classes.length === 1 && avec.length > 1
        ? `Les ${avec.length} sites estimés tiennent dans UNE SEULE classe (${classes[0].jeaMin}` +
          `–${classes[0].jeaMax} JEA) : leurs fourchettes se recouvrent toutes, donc l'outil ne les ` +
          `ordonne pas. ⚠️ Ce n'est pas une absence de résultat — c'est le résultat : la précision ` +
          `des arrêtés lus ne permet pas de dire lequel est le plus exposé.`
        : `${classes.length} classe(s) de matérialité sur ${avec.length} site(s) estimé(s)` +
          (exAequo > 0
            ? `, dont ${exAequo} regroupant des sites ex æquo. Deux sites d'une même classe ont des ` +
              `fourchettes de JEA qui se recouvrent : les ordonner serait présenter du bruit comme ` +
              `un écart.`
            : `. Toutes les fourchettes sont disjointes : le classement est défendable site par site.`) +
          (nonClasses.length > 0
            ? ` ${nonClasses.length} site(s) sans JEA ne sont PAS classés — absent n'est pas dernier.`
            : "");
  return { classes, nonClasses, detail };
}
