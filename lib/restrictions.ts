// Reading how hard a drought restriction actually bites — as an INTERVAL.
//
// The VigiEau "Restrictions" resource (data.gouv, ~23 MB, 74 974 rows) attaches
// to every arrêté × zone × gravity level the list of restricted usages, each
// with a free-text measure in `usage.u.description`. There is NO structured
// severity field — the text is what prefectures actually wrote, so severity has
// to be read from it.
//
// That turns out to be an advantage rather than a compromise: the phrasings are
// regular and frequently *quantified* ("Interdiction de 8h à 20h" is a measured
// 12 h out of 24), so the coefficient is derived from the arrêté rather than
// invented. Where the text carries no quantity, the reading degrades to an
// interval and says so.
//
// ---------------------------------------------------------------------------
// Why this file returns [min, max] and never a bare number
// ---------------------------------------------------------------------------
//
// Note technique §3.2: an unquantified measure ("limiter au strict nécessaire")
// must NEVER be given a point value silently. The interval propagates to the
// output, which becomes a range. That is the honest result, and it is what
// makes the figure defensible in review.
//
// The previous design returned `coefficient?: number` and dropped unreadable
// measures out of the mean. Prudent, but not the same thing: a usage that fell
// out read as if it did not exist.
//
// ---------------------------------------------------------------------------
// Three defects this rewrite fixes, all measured on verbatim text (Sprint 38)
// ---------------------------------------------------------------------------
//
// 1. POLARITY. The old reader assumed every stated time span was the FORBIDDEN
//    one. Prefectures also write the permitted one: "arrosage autorisé … entre
//    20h et 9h" means those 13 h are ALLOWED. The old code returned ρ = 13/24
//    and printed "Interdiction 13 h sur 24" — an audit trail stating the
//    opposite of the arrêté, which is exactly what ADR-006 exists to prevent.
//
// 2. NO COMPOSITION. Days and hours multiply. "Autorisé 3 jours par semaine …
//    entre 20h et 9h" allows 3/7 × 13/24 ≈ 16 % of the volume, so ρ ≈ 0.84. The
//    old code read one dimension — whichever matched first — and returned
//    0.125 where the answer was 0.96, a factor of 7.7 in the direction that
//    understates risk.
//
// 3. `NO_LIMIT` SWALLOWED QUANTIFIED MEASURES. "Autorisé 3 jours par semaine :
//    lundi, mercredi, vendredi entre 20h et 9h" starts with "autorisé", matched
//    `^autorise`, and returned ρ = 0 "Aucune restriction prescrite" for a
//    measure that blocks ~77 % of the usage. Same failure shape as the /api/swi
//    outage: a positive-looking answer meaning "nothing to report".
//
// The fix for (3) is not to delete the rule — "Autorisé" on its own really does
// mean no restriction, and a test protects that. It is to look for quantified
// dimensions FIRST, and only fall back to the coarse wording rules when none
// was found.
//
// Observed value domain (probe runs 30586667807 and 31356782500, full reports
// in data/restrictions/probe.json and note-technique-probe.json).

import type { NiveauGravite } from "./types";

/**
 * The ρ typology of note technique §3.1, plus `none`.
 *
 * `none` is not in the note's table: the note enumerates the ways a measure
 * restricts, and the corpus also contains explicit statements that it does not
 * ("Pas de limitation", "Autorisé"). Folding those into `recommendation` would
 * claim an awareness obligation that the text does not carry.
 */
export type RhoType =
  | "percentage"
  | "total_ban"
  | "time_window"
  | "rotation"
  | "unquantified"
  | "recommendation"
  | "reporting_only"
  | "none";

/**
 * Blocked share of a usage, as an interval. `min` and `max` are ALWAYS defined;
 * a known quantity is the degenerate interval min === max.
 *
 * Deliberately not `{ value?: number; min?: number; max?: number }`: an optional
 * point value invites callers to read it and ignore the bound, which is how the
 * old `coefficient?: number` let an unquantified measure disappear from a mean.
 */
export interface Rho {
  type: RhoType;
  /** lower bound of the blocked share, 0-1 */
  min: number;
  /** upper bound of the blocked share, 0-1 */
  max: number;
}

/** True when the interval is a single value — i.e. the arrêté quantified it. */
export function isPoint(rho: Rho): boolean {
  return Math.abs(rho.max - rho.min) < 1e-9;
}

export interface RestrictionSeverity {
  rho: Rho;
  /** how the interval was obtained, surfaced in the UI so the figure is auditable */
  detail: string;
  /**
   * The quantified dimensions actually found, in the order read. Empty when the
   * reading fell back to a wording rule. Kept because the composition is the
   * part a reviewer will want to check.
   */
  dimensions: RhoDimension[];
}

export interface RhoDimension {
  kind: "percentage" | "rotation" | "time_window";
  /** share of the usage still ALLOWED by this dimension alone, 0-1 */
  allowed: number;
  detail: string;
}

/**
 * Upper bound applied to an unquantified measure.
 *
 * 1, deliberately. "Limiter au strict nécessaire" gives no quantity, and any
 * value below 1 would be an invented coefficient — the thing the Sprint 21
 * review removed and note §3.2 forbids. A wide interval is the honest reading;
 * a narrow invented one is not. Exported so the width of the resulting range is
 * traceable to a decision rather than to a magic number.
 */
export const RHO_MAX_UNQUANTIFIED = 1;

/**
 * Lower bound for a ban carried with an exemption ("interdiction totale sauf
 * autorisation administrative").
 *
 * ⚠️ This is the one calibrated coefficient left in this file, inherited from
 * Sprint 21. The upper bound is sound — a site without the exemption loses the
 * whole usage — but 0.85 for the lower bound is a judgement, not a measurement.
 * It is expressed as an interval so the uncertainty is visible instead of being
 * hidden in a point value.
 */
export const RHO_MIN_CONDITIONAL_BAN = 0.85;

const point = (type: RhoType, v: number): Rho => ({ type, min: v, max: v });

/** Lowercase and strip accents so patterns match whatever the prefecture typed. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NO_LIMIT = /pas de (limitation|restriction)|aucune restriction|^autorise\b|sans restriction/;
const AWARENESS =
  /sensibilis|information via|communique de presse|incitation|incite|recommand|bon usage|economie d'eau|economies d'eau|prevenir|alerter les|surveillance/;
// Weekly declaration of withdrawn volumes in alerte renforcée and crise: no
// volume lost, but a real compliance burden (note §3.1 `reporting_only`).
const REPORTING =
  /registre|releve( de)? (des )?(index|compteur)|declaration hebdomadaire|tenue d'un registre|remplir (un|le) registre/;
const EXEMPTED = /sauf|hors |a l'exception|derogation|excepte/;
const BAN = /interdi/;

// --- dimension readers -------------------------------------------------------

/**
 * Which of "autorisé" / "interdit" governs the quantity at `index`.
 *
 * The nearest preceding keyword wins. That is what makes
 * "Interdiction sauf arrosage localisé … (arrosage autorisé 3 jours par
 * semaine … entre 20h et 9h)" read correctly: the sentence opens with
 * "Interdiction", but the quantity is governed by the "autorisé" beside it.
 */
function polarityAt(text: string, index: number): "allowed" | "forbidden" {
  const before = text.slice(0, index);
  const lastAllowed = Math.max(before.lastIndexOf("autoris"), before.lastIndexOf("permis"));
  const lastForbidden = Math.max(
    before.lastIndexOf("interdi"),
    before.lastIndexOf("interdit"),
    before.lastIndexOf("ferme"), // "fermeture de 9h à 19h"
  );
  if (lastAllowed < 0 && lastForbidden < 0) return "forbidden";
  return lastAllowed > lastForbidden ? "allowed" : "forbidden";
}

/** "réduction de 50 %" → 50 % blocked, so 0.5 allowed. */
function readPercentage(t: string): RhoDimension | undefined {
  const m = t.match(/(\d{1,3})\s*%/);
  if (!m) return undefined;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return undefined;
  return {
    kind: "percentage",
    allowed: 1 - value / 100,
    detail: `réduction de ${value} % prescrite`,
  };
}

/**
 * "autorisé 3 jours par semaine" → 3/7 allowed. The note's `rotation` type.
 *
 * Sprint 38 measured this: it is the form that carries the 77 entreprise
 * measures. "Tours d'eau" (496 occurrences) is the other wording and is
 * exclusively `concerne_exploitation` — agriculture, out of scope (§0.2) —
 * so it is deliberately not read here, and this comment is why.
 */
function readRotation(t: string): RhoDimension | undefined {
  const m = t.match(/(\d)\s*jours?\s+par\s+semaine/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 7) {
      const allowed = polarityAt(t, m.index ?? 0) === "allowed" ? n / 7 : 1 - n / 7;
      return {
        kind: "rotation",
        allowed,
        detail: `${n} jour${n > 1 ? "s" : ""} sur 7 ${
          polarityAt(t, m.index ?? 0) === "allowed" ? "autorisés" : "interdits"
        }`,
      };
    }
  }
  // "3 jours sur 7" — the same quantity, the other phrasing. 7/7 is a total ban,
  // not a rotation, so it is excluded here and handled by the ban rule.
  const m2 = t.match(/\b([1-6])\s*jours?\s+sur\s+7\b/);
  if (m2) {
    const n = Number(m2[1]);
    const allowed = polarityAt(t, m2.index ?? 0) === "allowed" ? n / 7 : 1 - n / 7;
    return { kind: "rotation", allowed, detail: `${n} jours sur 7` };
  }
  return undefined;
}

/**
 * "de 8h à 20h" → 12 h of the day. Whether those 12 h are the forbidden or the
 * permitted ones is decided by `polarityAt`, which is defect (1) of the header.
 */
function readTimeWindow(t: string): RhoDimension | undefined {
  const m = t.match(/(\d{1,2})\s*h(?:\s*\d{2})?\s*(?:a|-|et|jusqu'a)\s*(\d{1,2})\s*h/);
  if (!m) return undefined;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= 24 || to > 24) return undefined;
  const hours = to > from ? to - from : 24 - from + to;
  if (hours <= 0 || hours > 24) return undefined;
  const stated = polarityAt(t, m.index ?? 0);
  const allowed = stated === "allowed" ? hours / 24 : 1 - hours / 24;
  return {
    kind: "time_window",
    allowed,
    detail: `${hours} h sur 24 ${stated === "allowed" ? "autorisées" : "interdites"} (${from} h → ${to} h)`,
  };
}

/**
 * Read a prefectural restriction measure into a ρ interval.
 *
 * Quantified dimensions are looked for FIRST and composed multiplicatively;
 * only when none is found does the reading fall back to the coarse wording
 * rules. That ordering is what stops "Autorisé 3 jours par semaine …" from
 * being read as "no restriction" (defect 3).
 */
export function restrictionSeverity(description: string | undefined): RestrictionSeverity {
  const raw = (description ?? "").trim();
  if (!raw) {
    return {
      rho: { type: "unquantified", min: 0, max: RHO_MAX_UNQUANTIFIED },
      detail: "Mesure non précisée dans l'arrêté — fourchette complète.",
      dimensions: [],
    };
  }
  const t = normalize(raw);

  // --- 1. quantified dimensions, composed --------------------------------
  const dimensions = [readPercentage(t), readRotation(t), readTimeWindow(t)].filter(
    (d): d is RhoDimension => d !== undefined,
  );

  if (dimensions.length > 0) {
    // Multiplicative: each dimension restricts what the previous one left.
    const allowed = dimensions.reduce((acc, d) => acc * d.allowed, 1);
    const blocked = Math.min(1, Math.max(0, 1 - allowed));
    const type: RhoType =
      dimensions.length > 1
        ? "rotation" // a composed measure is reported under its coarsest dimension
        : dimensions[0].kind === "percentage"
          ? "percentage"
          : dimensions[0].kind === "rotation"
            ? "rotation"
            : "time_window";
    return {
      rho: point(type, blocked),
      detail:
        dimensions.length > 1
          ? `Composé : ${dimensions.map((d) => d.detail).join(" × ")} → ${Math.round(
              allowed * 100,
            )} % du volume autorisé.`
          : `${dimensions[0].detail[0].toUpperCase()}${dimensions[0].detail.slice(1)}.`,
      dimensions,
    };
  }

  // --- 2. compliance burden without volume loss ---------------------------
  if (REPORTING.test(t) && !BAN.test(t)) {
    return {
      rho: point("reporting_only", 0),
      detail: "Déclaration ou registre obligatoire — aucune réduction de volume.",
      dimensions: [],
    };
  }

  const hasBan = BAN.test(t);

  // Vigilance-style measures: real obligations to communicate, no volume lost.
  // Tested before NO_LIMIT because prefectures often write both at once;
  // ρ is 0 either way, but "recommendation" is the truthful label.
  if (!hasBan && AWARENESS.test(t)) {
    return {
      rho: point("recommendation", 0),
      detail: "Sensibilisation ou information — pas de restriction de volume.",
      dimensions: [],
    };
  }

  // "Pas de limitation", "Autorisé" — an explicit absence of constraint.
  // Reached only when NO quantified dimension was found above (defect 3).
  if (!hasBan && NO_LIMIT.test(t)) {
    return {
      rho: point("none", 0),
      detail: "Aucune restriction prescrite.",
      dimensions: [],
    };
  }

  if (hasBan) {
    if (EXEMPTED.test(t)) {
      return {
        rho: { type: "total_ban", min: RHO_MIN_CONDITIONAL_BAN, max: 1 },
        detail:
          "Interdiction assortie d'une dérogation — totale sans elle, nulle avec : " +
          "fourchette plutôt qu'un point.",
        dimensions: [],
      };
    }
    return {
      rho: point("total_ban", 1),
      detail: "Interdiction totale de l'usage.",
      dimensions: [],
    };
  }

  return {
    rho: { type: "unquantified", min: 0, max: RHO_MAX_UNQUANTIFIED },
    detail: `Mesure non interprétée : « ${raw.slice(0, 80)} ».`,
    dimensions: [],
  };
}

export type ProfilFlagKey =
  | "concerne_particulier"
  | "concerne_entreprise"
  | "concerne_collectivite"
  | "concerne_exploitation";

export interface RestrictionRow {
  usage: string;
  thematique?: string;
  description?: string;
  /** the four VigiEau audience flags, as published */
  concerne: Partial<Record<ProfilFlagKey, boolean>>;
}

export interface UsageExposure {
  usage: string;
  thematique?: string;
  severity: RestrictionSeverity;
}

export interface ExposureResult {
  /**
   * Mean blocked share across the usages that concern this profile, as an
   * interval. Undefined only when no usage at all concerns the profile.
   */
  exposure?: { min: number; max: number };
  /** per-usage detail, worst first — this is what makes the headline auditable */
  usages: UsageExposure[];
  /** usages whose measure carries no quantity; counted, and INSIDE the interval */
  unquantified: number;
  /** usages under a non-binding measure (sensibilisation) — separate counter, §3.1 */
  recommendation: number;
  /** usages imposing a declaration burden without volume loss — separate counter */
  reportingOnly: number;
}

/**
 * Exposure of one profile at one gravity level: the mean blocked share over the
 * usages that actually concern it, as an interval.
 *
 * A mean, not a max: a site is not stopped because one of fifteen listed usages
 * is banned. It is also not volume-weighted — VigiEau publishes no per-usage
 * volumes — which is the main documented limit of this reading, and what the
 * site usage vector (ADR-001) is meant to fix.
 *
 * ⚠️ Unquantified usages are now averaged in as [0, 1] instead of being dropped.
 * That widens the interval, and that is the point: dropping them made a usage
 * nobody could read look like a usage that did not exist.
 */
export function exposureForProfil(
  rows: RestrictionRow[],
  flag: ProfilFlagKey,
): ExposureResult {
  const usages: UsageExposure[] = [];
  let sumMin = 0;
  let sumMax = 0;
  let counted = 0;
  let unquantified = 0;
  let recommendation = 0;
  let reportingOnly = 0;

  for (const row of rows) {
    if (row.concerne[flag] !== true) continue;
    const severity = restrictionSeverity(row.description);
    usages.push({ usage: row.usage, thematique: row.thematique, severity });

    if (severity.rho.type === "unquantified") unquantified++;
    if (severity.rho.type === "recommendation") recommendation++;
    if (severity.rho.type === "reporting_only") reportingOnly++;

    sumMin += severity.rho.min;
    sumMax += severity.rho.max;
    counted++;
  }

  // Worst first, on the lower bound: a usage certainly blocked outranks one that
  // merely might be.
  usages.sort(
    (a, b) => b.severity.rho.min - a.severity.rho.min || b.severity.rho.max - a.severity.rho.max,
  );

  return {
    exposure: counted > 0 ? { min: sumMin / counted, max: sumMax / counted } : undefined,
    usages,
    unquantified,
    recommendation,
    reportingOnly,
  };
}

/** Exposure intervals per gravity level, as consumed by the days model. */
export type ExposureIntervalByLevel = Partial<Record<NiveauGravite, { min: number; max: number }>>;
