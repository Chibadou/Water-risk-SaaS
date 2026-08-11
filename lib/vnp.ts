// Volume non prélevable — note technique §4.2, the first of the three outputs
// expressed in a PHYSICAL unit and therefore invariant to the regulatory
// nomenclature (unlike JS, which §4.1 calls the least durable of the three).
//
//     VNP = Σ_jours Σ_usages  ρ(usage, niveau, zone) × (V_ref − V_exempt)
//
// Three requirements the note attaches to it, all implemented here:
//
//   a) V_ref is REGULATORY, not free (§4.2a). See `resolveVref` — and read its
//      caveat, because the regulatory branch is a labelled hole, not a formula.
//   b) The exemptable volume is deducted (§4.2b): safety, fire defence,
//      environmental protection, public and animal health, sanitation, drinking
//      water. It comes from `SiteUsage.isExempt` via `usageTotals`.
//   c) Withdrawal or consumption (§4.2c). Where withdrawal and discharge occur
//      in the same body, the restriction bears on consumption, and the two
//      differ by an order of magnitude between open-circuit cooling and an
//      evaporative process.
//
// ---------------------------------------------------------------------------
// Why there is no `total` field on the result
// ---------------------------------------------------------------------------
//
// Anti-pattern n°3: never aggregate crisis VNP and structural VNP into a single
// figure. They answer different questions — one is "how much will restrictions
// cost me this year", the other "how much less will I be allowed to take" — and
// by 2050 the note expects the structural component to dominate. Adding them
// would hide the dominant signal.
//
// So `VnpResult` deliberately exposes `crise` and `structurel` and NOTHING that
// combines them. This is enforced by a test that reads this file's own source:
// a future `total` would be caught by the suite rather than by a reviewer.
//
// ---------------------------------------------------------------------------
// κ = 1 (ADR-005)
// ---------------------------------------------------------------------------
//
// κ is the effective compliance rate — the gap between the reduction imposed and
// the reduction actually achieved. It is NOT estimated here. The VNP served is
// the NOMINAL VNP, and `hypotheses` says so in words, because a verifier accepts
// a declared conservative assumption and rejects a badly identified empirical
// coefficient.

import { GRAVITE } from "./gravite";
import type { NiveauGravite } from "./types";
import { NIVEAUX } from "./juridiction";

/** Days spent at each gravity level over the period considered. */
export type DaysByLevel = Partial<Record<NiveauGravite, number>>;

/** Blocked share per level, as an interval — from lib/restrictions. */
export type ExposureIntervalByLevel = Partial<
  Record<NiveauGravite, { min: number; max: number }>
>;

/**
 * How the reference volume was established — arbitrage G9.
 *
 * Three paths and no fourth: a site with nothing declared gets a **motivated
 * refusal**, never a house average. The note is explicit about why: "une moyenne
 * calculée maison créera un désaccord avec la DREAL et détruira la confiance du
 * client".
 */
export type VrefRegime = "icpe" | "declare" | "indisponible";

export interface VrefResolution {
  regime: VrefRegime;
  /** annual reference volume, m³ — absent when the regime is `indisponible` */
  volumeM3?: number;
  /** the audit trail for this figure, carried to the export (ADR-006) */
  detail: string;
  /**
   * Set when the declared volume is USED but sits outside the plausible range.
   *
   * ⚠️ A warning, never a refusal. A site really can withdraw 40 m³/an (an office
   * with a meter) or 200 Mm³/an (a nuclear cooling circuit), so refusing would be
   * worse than flagging: the operator knows their volume and we do not. What is NOT
   * acceptable is producing a VNP of 3,6 billion m³ from a typo and showing it with
   * the same confidence as any other figure.
   */
  invraisemblable?: string;
}

/**
 * Plausibility bounds on a declared annual withdrawal, m³.
 *
 * ⚠️ Both are JUDGEMENTS, not measurements, and deliberately wide:
 *
 *  - **10 m³/an** — below that, the figure is almost certainly a unit mistake
 *    (m³/day entered as m³/year, or a decimal separator lost). A real site drawing
 *    10 m³ a year uses 27 litres a day.
 *  - **500 000 000 m³/an** — above that, the figure exceeds the largest single
 *    French industrial abstraction by a wide margin. The biggest declared BNPE
 *    points are nuclear cooling circuits in the low hundreds of millions of m³.
 *
 * The gap between them spans seven orders of magnitude on purpose: the bound is
 * there to catch a typo, not to second-guess an operator.
 */
export const VREF_MIN_PLAUSIBLE = 10;
export const VREF_MAX_PLAUSIBLE = 500_000_000;

/**
 * ⚠️⚠️ THE REGULATORY DEFINITION IS NOT IMPLEMENTED, AND THIS IS DELIBERATE.
 *
 * §4.2a requires the definition of the arrêté ICPE of 30 June 2023, amended
 * 3 July 2024. The Sprint 38 probe measured that Légifrance answers **403 on
 * every route, under both a probe and a browser user agent**, so the text could
 * not be read — and a regulatory formula must not be reconstructed from memory.
 * Getting it subtly wrong is worse than not having it: it would produce a figure
 * that LOOKS regulatory and disagrees with the DREAL.
 *
 * So the `icpe` regime here means "the operator entered the reference volume as
 * stated in its own authorisation", which is the note's own override path
 * ("possibilité de surcharge par le V_ref déclaré du site"). The difference from
 * `declare` is the LABEL: an ICPE site's figure is traceable to an arrêté, a
 * non-ICPE site's figure is an internal declaration. Both are honest; they are
 * not the same evidence.
 *
 * To finish: transcribe the definition by hand with its article cited (the
 * treatment already applied to décret 2021-795), then compute it here and keep
 * the declared value as an override.
 */
export function resolveVref(input: {
  /** volume the operator entered, m³/an */
  volumeDeclareM3?: number;
  /** true when the site is a classified installation subject to the arrêté */
  icpe?: boolean;
}): VrefResolution {
  const v = input.volumeDeclareM3;
  if (v === undefined || !Number.isFinite(v) || v <= 0) {
    return {
      regime: "indisponible",
      detail:
        "Volume de référence non déclaré — le VNP n'est pas calculé. " +
        "Aucune moyenne n'est estimée à la place : un volume inventé créerait un " +
        "désaccord avec l'arrêté d'autorisation.",
    };
  }
  // ⚠️ Checked BEFORE the regime branches, so the warning attaches whichever regime
  // applies. Putting it in one branch only is how a guard ends up covering half the
  // cases and reading as if it covered all of them.
  const invraisemblable =
    v < VREF_MIN_PLAUSIBLE
      ? `⚠️ Volume de ${Math.round(v).toLocaleString("fr-FR")} m³/an : c'est ` +
        `${(v / 365).toFixed(2)} m³ par jour, soit moins qu'un logement. Vérifiez l'unité — un ` +
        `volume JOURNALIER saisi comme annuel, ou un séparateur décimal perdu, donnent exactement ` +
        `ce genre de chiffre. Le VNP est calculé quand même, sur la valeur que vous avez saisie.`
      : v > VREF_MAX_PLAUSIBLE
        ? `⚠️ Volume de ${Math.round(v).toLocaleString("fr-FR")} m³/an : c'est plus que le plus ` +
          `gros point de prélèvement industriel déclaré en France. Vérifiez l'unité — des litres ` +
          `saisis comme des m³ donnent exactement ce facteur. Le VNP est calculé quand même, sur ` +
          `la valeur que vous avez saisie, et il sera du même ordre d'invraisemblance.`
        : undefined;

  if (input.icpe) {
    return {
      regime: "icpe",
      volumeM3: v,
      invraisemblable,
      detail:
        `Volume de référence ${Math.round(v).toLocaleString("fr-FR")} m³/an, déclaré par le site ` +
        "d'après son arrêté d'autorisation (régime ICPE). ⚠️ La définition de l'arrêté du " +
        "30 juin 2023 n'est pas encore appliquée par l'outil : le texte n'a pas pu être lu " +
        "automatiquement (Légifrance refuse l'accès).",
    };
  }
  return {
    regime: "declare",
    volumeM3: v,
    invraisemblable,
    detail:
      `Volume de référence ${Math.round(v).toLocaleString("fr-FR")} m³/an, déclaré par le site. ` +
      "Hors régime ICPE, aucune définition réglementaire ne s'applique — c'est une donnée interne.",
  };
}

/** A public-policy trajectory reducing the authorised volume itself (§6.2). */
export interface TrajectoireStructurelle {
  /** share of the reference volume withdrawn by the horizon, 0-1 */
  reduction: number;
  /** the year the reduction is reached */
  horizon: number;
  /** where the figure comes from — never a bare number */
  source: string;
}

/**
 * Plan Eau 2023, as already carried in text by lib/transition.ts:38-42.
 *
 * A national sobriety trajectory, not a site-level obligation: it is applied
 * here as a scenario, and `hypotheses` says so.
 */
export const PLAN_EAU_2030: TrajectoireStructurelle = {
  reduction: 0.1,
  horizon: 2030,
  source: "Plan Eau 2023 — trajectoire nationale de −10 % d'eau prélevée d'ici 2030",
};

/** Restriction days per calendar month (0-11) and per level. */
export type DaysByMonthAndLevel = Record<number, DaysByLevel>;

/**
 * Average `parMoisNiveau` (year → month → level → days) over the complete years.
 *
 * The partial current year is excluded, exactly as the days model already does:
 * blending a half-finished year into a per-year mean invents calm months.
 */
export function meanDaysByMonth(
  parMoisNiveau: Record<string, DaysByMonthAndLevel> | undefined,
  anneesCompletes: number,
  currentYear: number,
): DaysByMonthAndLevel | undefined {
  if (!parMoisNiveau || anneesCompletes <= 0) return undefined;
  const out: DaysByMonthAndLevel = {};
  let used = 0;
  for (let y = currentYear - anneesCompletes; y <= currentYear - 1; y++) {
    const months = parMoisNiveau[String(y)];
    if (!months) continue;
    used++;
    for (const [m, byLevel] of Object.entries(months)) {
      const month = Number(m);
      out[month] = out[month] ?? {};
      for (const level of LEVELS) {
        const d = byLevel[level];
        if (!d) continue;
        out[month][level] = (out[month][level] ?? 0) + d;
      }
    }
  }
  if (used === 0) return undefined;
  for (const month of Object.keys(out).map(Number)) {
    for (const level of LEVELS) {
      const v = out[month][level];
      if (v !== undefined) out[month][level] = v / anneesCompletes;
    }
  }
  return out;
}

export interface VnpInput {
  daysByLevel: DaysByLevel;
  /**
   * The same days, split by calendar month — enables the seasonal weighting of
   * G19. When both this and `profilMensuel` are present the VNP is weighted per
   * month; otherwise the daily volume is flat and the assumption is journalled.
   */
  daysByMonthAndLevel?: DaysByMonthAndLevel;
  exposure: ExposureIntervalByLevel;
  vref: VrefResolution;
  /** exempt volume, m³/an — from usageTotals().exempt */
  exemptM3?: number;
  /** share returned to the same water body, 0-1 (§4.2c) */
  tauxRestitution?: number;
  /** effective compliance rate. 1 in v1 (ADR-005), and named as an assumption. */
  kappa?: number;
  /** structural trajectory; omit to leave the structural component unavailable */
  trajectoire?: TrajectoireStructurelle;
  /**
   * Twelve monthly shares of the annual volume, January first (G19).
   *
   * Used here only to JOURNAL its absence: weighting the VNP by month needs the
   * restriction days broken down by month too (`parMoisNiveau` in lib/history
   * carries them), which is wiring the display sprint will bring. Naming the
   * assumption now is what stops it from staying silent.
   */
  profilMensuel?: number[];
}

export interface VnpComponent {
  /** m³/an, lower bound */
  min: number;
  /** m³/an, upper bound — wider than min whenever a measure was unquantified */
  max: number;
  detail: string;
}

export interface VnpResult {
  available: boolean;
  /**
   * Crisis component: volume lost to restriction days.
   *
   * ⚠️ Never added to `structurel`. See the header.
   */
  crise?: VnpComponent;
  /** Structural component: reduction of the authorised volume itself. */
  structurel?: VnpComponent;
  /** the compliance rate applied — 1 in v1, ADR-005 */
  kappa: number;
  /** what this figure assumes, captured at computation time (ADR-006) */
  hypotheses: string[];
  /** the V_ref audit trail, repeated here so the number travels with its origin */
  vrefDetail: string;
  /** set when the declared V_ref is used but sits outside the plausible range */
  vrefInvraisemblable?: string;
  message?: string;
}

const LEVELS = NIVEAUX;
const DAYS_PER_YEAR = 365;
const DAYS_PER_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const round = (v: number) => Math.round(v);

/**
 * Nominal VNP, in cubic metres per year, as an interval.
 *
 * Returns `available: false` with a stated reason rather than a zero whenever an
 * input is missing. A VNP of 0 m³ means "nothing will be blocked"; the absence
 * of a VNP means "we cannot say". Conflating the two is the failure this repo
 * keeps paying for.
 */
export function computeVnp(input: VnpInput): VnpResult {
  const kappa = input.kappa ?? 1;
  const hypotheses: string[] = [];

  // ADR-005, stated in words rather than left implicit.
  hypotheses.push(
    kappa === 1
      ? "κ = 1 : conformité parfaite supposée. Le VNP servi est le VNP NOMINAL, " +
        "hypothèse volontairement conservatrice — l'écart entre la réduction imposée et " +
        "la réduction réellement constatée n'est pas estimé en v1."
      : `κ = ${kappa} : taux de conformité appliqué au VNP nominal.`,
  );

  const vref = input.vref;
  if (vref.regime === "indisponible" || vref.volumeM3 === undefined) {
    return {
      available: false,
      kappa,
      hypotheses,
      vrefDetail: vref.detail,
      vrefInvraisemblable: vref.invraisemblable,
      message: "Volume de référence non déclaré — le VNP ne peut pas être calculé.",
    };
  }

  // G19 — the flat daily need, now named. Both engines shared this silent
  // assumption; it is the one omission I judged a defect rather than a limit.
  if (!input.profilMensuel || input.profilMensuel.length !== 12 || !input.daysByMonthAndLevel) {
    hypotheses.push(
      "Volume journalier supposé PLAT " +
        "(V_ref / 365), faute de profil mensuel de consommation déclaré ou de répartition mensuelle " +
        "des jours de restriction. Or les restrictions tombent en été, quand beaucoup de procédés " +
        "consomment davantage — le VNP est donc probablement SOUS-ESTIMÉ pour un site à pic estival.",
    );
  }

  const exempt = input.exemptM3 ?? 0;
  if (input.exemptM3 === undefined) {
    hypotheses.push(
      "Aucun volume exempté déclaré : le VNP porte sur la totalité du volume de référence. " +
        "Les usages de sécurité, de défense incendie et de santé publique sont exemptables (§4.2b) — " +
        "les déclarer réduirait le VNP.",
    );
  }
  const restreignable = Math.max(0, vref.volumeM3 - exempt);

  // (c) Withdrawal or consumption. Undeclared restitution is NOT assumed to be
  // zero: the figure stays a withdrawal, and the assumption is journalled.
  let facteurConsommation = 1;
  if (input.tauxRestitution !== undefined && Number.isFinite(input.tauxRestitution)) {
    const r = Math.min(1, Math.max(0, input.tauxRestitution));
    facteurConsommation = 1 - r;
    hypotheses.push(
      `Taux de restitution ${Math.round(r * 100)} % : le VNP porte sur la CONSOMMATION ` +
        `(${Math.round(facteurConsommation * 100)} % du volume prélevé), conformément au §4.2c.`,
    );
  } else {
    hypotheses.push(
      "Taux de restitution non déclaré : le VNP porte sur le volume PRÉLEVÉ, non sur la " +
        "consommation. Pour un procédé qui restitue l'essentiel de son eau au même milieu, " +
        "le chiffre est surestimé — d'un ordre de grandeur dans le cas d'un refroidissement " +
        "en circuit ouvert.",
    );
  }

  const consommable = restreignable * facteurConsommation;
  const volumeJournalierPlat = consommable / DAYS_PER_YEAR;

  // Seasonal weighting (G19). Only possible when BOTH the monthly consumption
  // split and the monthly restriction days are known: weighting one by the other
  // is the whole point, and having only one of the two would be worse than flat.
  const profil = input.profilMensuel;
  const parMois = input.daysByMonthAndLevel;
  const saisonnier = Boolean(profil && profil.length === 12 && parMois);

  const volumeJournalier = (month: number | undefined): number => {
    if (!saisonnier || month === undefined || !profil) return volumeJournalierPlat;
    const share = profil[month];
    if (!Number.isFinite(share) || share < 0) return volumeJournalierPlat;
    return (consommable * share) / DAYS_PER_MONTH[month];
  };

  // --- crisis component ------------------------------------------------------
  let min = 0;
  let max = 0;
  let joursCouverts = 0;
  let joursSansExposition = 0;

  // Each entry is [days, level, month] — one pass whether or not the month is
  // known, so the seasonal and flat paths cannot drift apart.
  const entries: [number, NiveauGravite, number | undefined][] = [];
  if (saisonnier && parMois) {
    for (const [m, byLevel] of Object.entries(parMois)) {
      for (const level of LEVELS) {
        const d = byLevel[level] ?? 0;
        if (d > 0) entries.push([d, level, Number(m)]);
      }
    }
  } else {
    for (const level of LEVELS) {
      const d = input.daysByLevel[level] ?? 0;
      if (d > 0) entries.push([d, level, undefined]);
    }
  }

  for (const [d, level, month] of entries) {
    const e = input.exposure[level];
    if (e === undefined) {
      // A level whose measures could not be read contributes NOTHING rather
      // than zero, and the caller is told how many days fell out.
      joursSansExposition += d;
      continue;
    }
    const vj = volumeJournalier(month);
    min += d * vj * e.min * kappa;
    max += d * vj * e.max * kappa;
    joursCouverts += d;
  }

  if (saisonnier) {
    hypotheses.push(
      "Volume journalier pondéré par le profil mensuel déclaré et par la répartition mensuelle " +
        "réelle des jours de restriction — les jours d'été pèsent leur poids de consommation.",
    );
  }

  const crise: VnpComponent | undefined =
    joursCouverts > 0
      ? {
          min: round(min),
          max: round(max),
          detail:
            `${Math.round(joursCouverts)} jours sous restriction pondérés par l'exposition lue ` +
            `dans les arrêtés, sur un volume restreignable de ` +
            `${round(restreignable).toLocaleString("fr-FR")} m³/an.` +
            (saisonnier ? " Pondéré par le profil mensuel déclaré." : ""),
        }
      : undefined;

  if (joursSansExposition > 0) {
    hypotheses.push(
      `${Math.round(joursSansExposition)} jours écartés du calcul : aucune mesure lisible pour ` +
        "leur niveau de gravité. Ils ne comptent pas 0 m³, ils ne comptent pas du tout.",
    );
  }

  // --- structural component --------------------------------------------------
  // Never added to the above. Its own figure, its own label, its own horizon.
  let structurel: VnpComponent | undefined;
  if (input.trajectoire) {
    const t = input.trajectoire;
    const v = consommable * t.reduction;
    structurel = {
      min: round(v),
      max: round(v),
      detail:
        `Réduction de ${Math.round(t.reduction * 100)} % du volume autorisé à l'horizon ` +
        `${t.horizon} — ${t.source}. Composante STRUCTURELLE : elle ne s'additionne pas à la ` +
        "composante de crise, qui répond à une autre question.",
    };
    hypotheses.push(
      `Composante structurelle appliquée comme scénario national (${t.source}), non comme une ` +
        "obligation propre à ce site.",
    );
  }

  return {
    available: crise !== undefined || structurel !== undefined,
    crise,
    structurel,
    kappa,
    hypotheses,
    vrefDetail: vref.detail,
    vrefInvraisemblable: vref.invraisemblable,
    message:
      crise === undefined && structurel === undefined
        ? "Aucun jour sous restriction avec une exposition lisible, et aucune trajectoire " +
          "structurelle fournie — rien à calculer."
        : undefined,
  };
}

/**
 * Whether the two components may be shown side by side, and never summed.
 *
 * Exists so a caller cannot ask "what is the total VNP?" and get an answer: the
 * only exported helper is one that keeps them apart.
 */
export function vnpComponents(
  result: VnpResult,
): { id: "crise" | "structurel"; label: string; value: VnpComponent }[] {
  const out: { id: "crise" | "structurel"; label: string; value: VnpComponent }[] = [];
  if (result.crise) out.push({ id: "crise", label: "VNP de crise", value: result.crise });
  if (result.structurel)
    out.push({ id: "structurel", label: "VNP structurel", value: result.structurel });
  return out;
}

/** Severity ranks, re-exported so callers do not reach into lib/gravite for them. */
export const VNP_LEVELS = LEVELS.map((l) => ({ id: l, rank: GRAVITE[l].rank }));
