// Reading how hard a drought restriction actually bites.
//
// The VigiEau "Restrictions" resource (data.gouv, ~23 MB, 77 k rows) attaches to
// every arrêté × zone × gravity level the list of restricted usages, each with a
// free-text measure in `usage.u.description`. There is NO structured severity
// field — the text is what prefectures actually wrote, so severity has to be
// read from it.
//
// That turns out to be an advantage rather than a compromise: the phrasings are
// regular and frequently *quantified* ("Interdiction de 8h à 20h" is a measured
// 12 h out of 24), so the coefficient is derived from the arrêté rather than
// invented. Where the text carries no quantity, the classification degrades to
// a coarse band and says so.
//
// Observed value domain (probe, 2026-07-30, run 30586667807 — full report in
// data/restrictions/probe.json): "Interdiction totale", "Interdit",
// "Interdiction de 8h à 20h.", "Interdiction totale sauf autorisation
// administrative", "Interdiction totale sauf impératif sanitaire", "Pas de
// limitation sauf arrêté spécifique", "Autorisé", "Sensibiliser le grand public
// …", "Information via communiqué de presse", "Prévenir les agriculteurs".

export type RestrictionKind =
  | "aucune"
  | "sensibilisation"
  | "reduction"
  | "plage_horaire"
  | "interdiction_conditionnelle"
  | "interdiction"
  | "indetermine";

export interface RestrictionSeverity {
  /**
   * Share of the usage that is blocked, 0-1. `undefined` when the text cannot
   * be read — never 0, which would silently mean "no restriction" (the repo's
   * undefined ≠ 0 rule).
   */
  coefficient?: number;
  kind: RestrictionKind;
  /** how the coefficient was obtained, surfaced in the UI so the figure is auditable */
  detail: string;
}

/** Lowercase and strip accents so patterns match whatever the prefecture typed. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// A conditional ban ("interdiction totale sauf autorisation administrative")
// still stops the usage for everyone without the exemption. Most sites do not
// hold one, so it sits high but below a flat ban.
const CONDITIONAL_COEFFICIENT = 0.85;

// A ban with no stated quantity and no exemption, when the wording is vaguer
// than "totale" — kept apart so the UI can flag the coarser reading.
const PLAIN_BAN_COEFFICIENT = 1;

const NO_LIMIT = /pas de (limitation|restriction)|aucune restriction|^autorise|sans restriction/;
const AWARENESS =
  /sensibilis|information via|communique de presse|incitation|incite|recommand|bon usage|economie d'eau|economies d'eau|prevenir|alerter les|surveillance/;
const EXEMPTED = /sauf|hors |a l'exception|derogation|excepte/;
const BAN = /interdi/;

/**
 * Read a prefectural restriction measure into a 0-1 share of the usage blocked.
 *
 * Order matters: a text like "Interdiction de 8h à 20h" contains both a ban and
 * a quantity, and the quantity is the better reading. Quantified forms are
 * therefore tested before the coarse ones.
 */
export function restrictionSeverity(description: string | undefined): RestrictionSeverity {
  const raw = (description ?? "").trim();
  if (!raw) return { kind: "indetermine", detail: "Mesure non précisée dans l'arrêté." };
  const t = normalize(raw);

  const hasBan = BAN.test(t);

  // Vigilance-style measures: real obligations to communicate, but no volume
  // lost. Tested before NO_LIMIT because prefectures often write both at once
  // ("Incitation … (Sensibilisation mais pas de restriction"); the coefficient
  // is 0 either way, but "sensibilisation" is the truthful label.
  // Guarded by hasBan so "interdiction … sauf" never lands here.
  if (!hasBan && AWARENESS.test(t)) {
    return {
      coefficient: 0,
      kind: "sensibilisation",
      detail: "Sensibilisation ou information — pas de restriction de volume.",
    };
  }

  // "Pas de limitation", "Autorisé" — an explicit absence of constraint.
  if (!hasBan && NO_LIMIT.test(t)) {
    return { coefficient: 0, kind: "aucune", detail: "Aucune restriction prescrite." };
  }

  // Explicit percentage cut ("réduction de 50 % des prélèvements").
  const pct = t.match(/(\d{1,3})\s*%/);
  if (pct) {
    const value = Number(pct[1]);
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      return {
        coefficient: value / 100,
        kind: "reduction",
        detail: `Réduction de ${value} % prescrite par l'arrêté.`,
      };
    }
  }

  // Time-window ban ("interdiction de 8h à 20h", "interdit entre 11h et 18h").
  // The fraction of the day lost is a measured quantity, not an assumption.
  const span = t.match(/(\d{1,2})\s*h(?:\s*\d{2})?\s*(?:a|-|et|jusqu'a)\s*(\d{1,2})\s*h/);
  if (span) {
    const from = Number(span[1]);
    const to = Number(span[2]);
    if (Number.isFinite(from) && Number.isFinite(to) && from < 24 && to <= 24) {
      const hours = to > from ? to - from : 24 - from + to;
      if (hours > 0 && hours <= 24) {
        return {
          coefficient: hours / 24,
          kind: "plage_horaire",
          detail: `Interdiction ${hours} h sur 24 (${from} h → ${to} h).`,
        };
      }
    }
  }

  if (hasBan) {
    if (EXEMPTED.test(t)) {
      return {
        coefficient: CONDITIONAL_COEFFICIENT,
        kind: "interdiction_conditionnelle",
        detail: "Interdiction assortie d'une dérogation ou d'une exception.",
      };
    }
    return {
      coefficient: PLAIN_BAN_COEFFICIENT,
      kind: "interdiction",
      detail: "Interdiction totale de l'usage.",
    };
  }

  return { kind: "indetermine", detail: `Mesure non interprétée : « ${raw.slice(0, 80)} ».` };
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
  /** mean blocked share across the usages that concern this profile, 0-1 */
  exposure?: number;
  /** per-usage detail, worst first — this is what makes the headline figure auditable */
  usages: UsageExposure[];
  /** usages whose measure could not be read; excluded from the mean, never counted as 0 */
  unread: number;
}

/**
 * Exposure of one profile at one gravity level: the mean blocked share over the
 * usages that actually concern it.
 *
 * A mean, not a max: a site is not stopped because one of fifteen listed usages
 * is banned. It is also not a volume-weighted figure — VigiEau publishes no
 * per-usage volumes — which is the main documented limit of this reading.
 */
export function exposureForProfil(
  rows: RestrictionRow[],
  flag: ProfilFlagKey,
): ExposureResult {
  const usages: UsageExposure[] = [];
  let sum = 0;
  let counted = 0;
  let unread = 0;

  for (const row of rows) {
    if (row.concerne[flag] !== true) continue;
    const severity = restrictionSeverity(row.description);
    usages.push({ usage: row.usage, thematique: row.thematique, severity });
    if (severity.coefficient === undefined) unread++;
    else {
      sum += severity.coefficient;
      counted++;
    }
  }

  usages.sort((a, b) => (b.severity.coefficient ?? -1) - (a.severity.coefficient ?? -1));
  return {
    exposure: counted > 0 ? sum / counted : undefined,
    usages,
    unread,
  };
}
