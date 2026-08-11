// The note's three outputs, computed once for a site (note §4).
//
// ⚠️ Why this module exists at all, and why it is not "just a wrapper".
//
// At Sprint 42a the three engines were called from inside the panel that displays
// them. That worked, and it was wrong for one reason: the site report and the
// written synthesis needed the SAME numbers, and each was computing its own —
// `synthese.ts` had its own `volumeM3 / 365 × jours` for cubic metres, and the
// report took its days from a third module. Three call sites, three formulas, one
// site: nothing guaranteed the PDF and the screen would agree.
//
// So the site sheet computes here, once, and hands the result down. A figure the
// user reads on screen and a figure in their exported report now come from the
// same call — which is a precondition for ADR-006 (auditability) rather than a
// tidiness argument.

import { computeIa, computeIaHorizon, episodesFromPeriodes, type IaResult } from "./ia";
import { computeJs, type JsInput, type JsResult } from "./js";
import { computeVnp, meanDaysByMonth, resolveVref, PLAN_EAU_2030, type VnpResult } from "./vnp";
import { usageTotals } from "./siteProfile";
import type { DonneesInternes, ResponseType, SiteUsage } from "./sites";
import type { NiveauGravite } from "./types";

export interface IndicateursInput extends JsInput {
  /** exposure interval per level, from /api/restrictions (G2) */
  exposure?: Partial<Record<NiveauGravite, { min: number; max: number }>>;
  /** mean days per level over the complete years */
  joursParNiveau?: Partial<Record<NiveauGravite, number>>;
  /** run-length restriction calendar of the governing zone */
  periodes?: number[];
  interne?: DonneesInternes;
  usages?: SiteUsage[];
  reponse?: ResponseType;
  /** true when the site is a classified installation (ICPE) */
  icpe?: boolean;
}

export interface IndicateursResult {
  js: JsResult;
  vnp: VnpResult;
  ia: IaResult;
  /** IA projected onto the 2050 horizon, when Explore2 answered for the commune */
  ia2050?: IaResult;
  /** every assumption of the three, in one list, for the journal (ADR-006) */
  hypotheses: string[];
}

export function computeIndicateurs(input: IndicateursInput): IndicateursResult {
  const interne = input.interne ?? {};
  const exposure = input.exposure ?? {};
  const currentYear = (input.now ?? new Date()).getUTCFullYear();
  const totals = usageTotals(input.usages, interne.volumeM3);

  const js = computeJs(input);

  const vnp = computeVnp({
    daysByLevel: input.joursParNiveau ?? {},
    daysByMonthAndLevel: meanDaysByMonth(
      input.parMoisNiveau,
      input.anneesCompletes ?? 0,
      currentYear,
    ),
    exposure,
    vref: resolveVref({ volumeDeclareM3: interne.volumeM3, icpe: input.icpe }),
    // Only pass the exempt volume when the vector actually declares one: passing
    // 0 would claim "nothing is exempt", a different statement from "we were not
    // told".
    exemptM3: totals.exempt > 0 ? totals.exempt : undefined,
    tauxRestitution: interne.tauxRestitution,
    profilMensuel: interne.profilMensuel,
    trajectoire: PLAN_EAU_2030,
  });

  const episodes = episodesFromPeriodes(input.periodes);
  const iaCommon = {
    exposure,
    vrefM3: interne.volumeM3,
    exemptM3: totals.exempt > 0 ? totals.exempt : undefined,
    tauxRestitution: interne.tauxRestitution,
    reponse: input.reponse,
    tamponM3: interne.tamponM3,
    autonomieJours: interne.autonomieJours,
    seuilTechniqueM3: interne.seuilTechniqueM3,
    paliers: interne.paliers,
    profilMensuel: interne.profilMensuel,
    anneesCouvertes: input.anneesCompletes,
  };
  const ia = computeIa({ ...iaCommon, episodes });

  // 2050: the observed episodes LENGTHENED by the horizon's growth factor, never
  // a scaled day total — see scaleEpisodes for why the two differ by several
  // times once a buffer exists.
  const h2050 = js.horizons.find((h) => h.id === "horizon_2050");
  const ia2050 =
    h2050?.available && h2050.facteurCroissance !== undefined && episodes.length > 0
      ? computeIaHorizon({
          ...iaCommon,
          episodesObserves: episodes,
          facteurCroissance: h2050.facteurCroissance,
        })
      : undefined;

  return {
    js,
    vnp,
    ia,
    ia2050,
    hypotheses: [...js.hypotheses, ...vnp.hypotheses, ...ia.hypotheses],
  };
}
