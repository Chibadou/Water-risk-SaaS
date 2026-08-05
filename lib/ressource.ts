// How much renewable water the territory of a site actually produces, and what
// share of it is already withdrawn.
//
// This closes a gap the HANDBOOK carried since Sprint 10: "BNPE in the score —
// blocked on renewable-resource data by sub-basin". That was true while looking
// for a ready-made dataset. It stops being true once you notice the resource is
// COMPUTABLE from series the app already downloads:
//
//   module (m³/s)  ──÷ surface_bv──▶  débit spécifique (l/s/km²)
//                                          │
//                                    × surface commune
//                                          ▼
//                            ressource renouvelable (m³/an)
//                                          │
//                    prélèvements BNPE ÷ ────┴──── ÷ volume déclaré du site
//                            │                            │
//                   taux d'exploitation            part du site
//
// The module is the arithmetic mean of the same 18-year daily-flow series that
// already feeds the VCN10 reference (`computeModule` in lib/hubeau.ts) — no
// extra download. `surface_bv` comes from the hydrometric SITE referential.
//
// Transposing a specific discharge from a gauged catchment to an ungauged
// territory is not an invention: it is the reference method for ungauged basins,
// documented by the OFB and the DREAL guides ("transposition directe du débit
// d'une station voisine, avec ajustement au ratio des surfaces").
//
// ⚠️ MEASURED LIMITS, not assumed ones (probe run 26-28, 2 000 sites):
//   - `surface_bv` is filled on only **895 / 2 000** sites (45 %). Nearly half
//     the network cannot produce a resource figure at all.
//   - Catchment areas span 0,001 km² to 65 300 km² (median 173). Transposing
//     from the Loire to a village is meaningless; the ratio is bounded below.
//   - `influence_generale_site` exists but its Sandre code list could not be
//     read (the referential API returned 400 twice). It is therefore SURFACED
//     RAW and never computed with — inventing a severity scale for it would be
//     exactly the "ne pas inventer de coefficients" mistake.
//
// Informative only: nothing here enters `computeScore`. Same non-double-counting
// rule as `secteur`, `origine`, `dependance` and the Sprint 26 volumes.

import type { OrigineEau } from "./sites";

/** Seconds in a mean year — module (m³/s) → volume (m³/an). */
const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

/**
 * Bounds on the catchment/commune area ratio for the transposition to mean
 * anything.
 *
 * A convention, and stated as one — not a measured constant. Specific discharge
 * decreases as catchment area grows (documented), so transposing from a much
 * larger catchment understates the local resource and therefore OVERSTATES
 * stress: the error is conservative, which is why the upper bound is generous.
 * Beyond it the regimes are simply not comparable — the Loire at 40 500 km²
 * integrates mountain snowmelt that says nothing about a lowland commune.
 */
const RATIO_MAX = 200;
const RATIO_MIN = 0.02;
/** Beyond this the figure is still shown, but the confidence drops. */
const RATIO_CONFIANT = 50;

/** Aqueduct (WRI) baseline water stress classes — reused, not reinvented. */
export const CLASSES_WRI = [
  { id: "faible", label: "Faible", max: 0.1 },
  { id: "modere", label: "Modéré", max: 0.2 },
  { id: "eleve", label: "Élevé", max: 0.4 },
  { id: "tres_eleve", label: "Très élevé", max: 0.8 },
  { id: "extreme", label: "Extrême", max: Infinity },
] as const;

export type ClasseWri = (typeof CLASSES_WRI)[number];

export interface RessourceInput {
  /** mean interannual flow, m³/s — from computeModule on the existing series */
  moduleM3s?: number;
  anneesModule?: number;
  /** catchment area of the gauged SITE (referentiel/sites.surface_bv), km² */
  surfaceBvKm2?: number;
  /** area of the site's commune, km² — already fetched by lib/bnpe.ts */
  surfaceCommuneKm2?: number;
  /** annual withdrawals of the commune, m³ — already fetched by lib/bnpe.ts */
  prelevementsCommuneM3?: number;
  /** annual withdrawal declared by the company for this site, m³ (Sprint 26) */
  volumeSiteM3?: number;
  /** where the site draws from: decides whether surface water describes it */
  origine?: OrigineEau;
  /** raw Sandre influence code — surfaced, never computed with */
  influenceCode?: number | null;
  /** distance to the gauged station, km — confidence only */
  distanceStationKm?: number;
}

export interface EtapeCalcul {
  label: string;
  valeur: string;
  detail?: string;
}

export interface RessourceResult {
  /** a resource figure could be produced */
  available: boolean;
  /** surface hydrology describes this site at all (false for a borehole) */
  applicable: boolean;
  message?: string;
  /**
   * Flow actually available at the attached station, m³/an — the module, which
   * integrates everything the catchment upstream contributes.
   *
   * THE denominator for pressure on the watercourse, and the one the WRI scale
   * expects. Available whenever a module exists, with no need for `surface_bv`.
   */
  debitDisponibleM3An?: number;
  /**
   * Withdrawals ÷ flow available at the point, 0-1+.
   *
   * The only ratio carrying a WRI class: Aqueduct compares withdrawals to the
   * basin's AVAILABLE supply, upstream inflow included.
   */
  pressionCoursEau?: number;
  classePression?: ClasseWri;

  debitSpecifiqueLsKm2?: number;
  /** what the commune's own area produces, m³/an */
  ressourceCommuneM3An?: number;
  /**
   * Withdrawals ÷ what the territory itself produces, 0-1+.
   *
   * A different question from the pressure above — "does this territory live on
   * its own water" rather than "does the river have enough". Above 1 the commune
   * simply does not live on its own production; that is ordinary for a town on a
   * large river, and it is why this ratio NEVER carries a WRI class.
   */
  autonomieTerritoire?: number;
  /** autonomieTerritoire > 1, surfaced as a reading rather than a threshold */
  dependanceAmont?: boolean;
  /** the site's declared withdrawal as a share of the AVAILABLE flow, 0-1 */
  partSite?: number;
  /** the calculation, step by step, so the figure stays auditable */
  etapes: EtapeCalcul[];
  confiance: "haute" | "moyenne" | "faible";
  /** what this figure is NOT — always rendered, never optional */
  reserves: string[];
}

const fmt = (v: number, d = 1) =>
  v.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: 0 });

/** m³ → human scale. */
function volume(m3: number): string {
  if (m3 >= 1e9) return `${fmt(m3 / 1e9, 2)} milliard${m3 >= 2e9 ? "s" : ""} de m³`;
  if (m3 >= 1e6) return `${fmt(m3 / 1e6, 1)} Mm³`;
  if (m3 >= 1e3) return `${fmt(m3 / 1e3, 0)} milliers de m³`;
  return `${fmt(m3, 0)} m³`;
}

export function classeWri(taux: number): ClasseWri {
  for (const c of CLASSES_WRI) if (taux < c.max) return c;
  return CLASSES_WRI[CLASSES_WRI.length - 1];
}

/**
 * The caveats that must travel with every figure this module produces.
 *
 * Rendered unconditionally, not behind a "details" toggle: the single most
 * likely misuse of this panel is reading the renewable resource as a volume the
 * company may take.
 */
export const RESSOURCE_RESERVES = {
  pasUnDroit:
    "La ressource renouvelable n'est pas un volume prélevable : une part doit rester au milieu " +
    "(débit réservé, débit objectif d'étiage). Ce chiffre décrit ce que le territoire produit, " +
    "pas ce que vous pouvez prendre.",
  transposition:
    "Le débit spécifique est mesuré sur le bassin de la station rattachée, puis transposé à la " +
    "surface de la commune. C'est la méthode de référence pour un territoire non jaugé, mais elle " +
    "suppose une hydrologie comparable entre les deux.",
  moduleCourt:
    "Le module est calculé sur les années disponibles de la chronique, pas sur une période de " +
    "référence longue. Les années récentes étant plus sèches, il est probablement sous-estimé — " +
    "donc le taux d'exploitation surestimé.",
  communeVsBassin:
    "Les prélèvements sont ceux de la commune (BNPE) ; la ressource est estimée sur la même " +
    "emprise communale. Ni l'une ni l'autre ne coïncide avec le bassin versant réel du site.",
  dependanceAmont:
    "Cette commune prélève plus que son propre territoire ne produit : elle vit d'une eau " +
    "produite en amont et qui la traverse. C'est le cas normal d'une ville installée sur un " +
    "grand cours d'eau. Ce n'est pas une surexploitation — la pression réelle sur la ressource " +
    "est donnée par le premier chiffre, celui rapporté au débit disponible.",
  stationPasSource:
    "La pression est calculée sur le cours d'eau de la station la plus proche, qui n'est pas " +
    "forcément celui où le site puise. Mesuré : Toulouse est rattachée à l'Hers (768 km²) alors " +
    "que la ville prélève dans la Garonne. À vérifier avant d'en tirer une conclusion.",
  influence:
    "Le référentiel signale une influence sur le débit de cette station (barrage, prélèvements " +
    "amont). Le code de sévérité Sandre n'a pas pu être lu et n'est donc pas interprété ici : le " +
    "module peut ne pas refléter un régime naturel.",
} as const;

export function computeRessource(input: RessourceInput): RessourceResult {
  const etapes: EtapeCalcul[] = [];
  const reserves: string[] = [];

  // --- Does surface hydrology describe this site at all? --------------------
  //
  // A borehole draws from an aquifer whose renewable volume a river gauge does
  // not measure. Returning a surface figure "for information" would be worse
  // than returning none: it looks like an answer.
  if (input.origine === "souterrain") {
    return {
      available: false,
      applicable: false,
      message:
        "Ce site prélève en nappe. La ressource souterraine ne se déduit pas d'un débit de " +
        "cours d'eau, et aucun jeu national d'état quantitatif par masse d'eau n'est publié en " +
        "open data (vérifié : le référentiel Sandre porte l'identité des masses d'eau, pas leur " +
        "état). L'état de la nappe qui vous concerne est donné par l'indice piézométrique " +
        "ci-dessus.",
      etapes,
      confiance: "faible",
      reserves: [],
    };
  }

  const { moduleM3s, surfaceBvKm2, surfaceCommuneKm2 } = input;

  // Without a module there is no denominator of any kind. Everything downstream
  // hangs off this one number, so it is the only hard prerequisite left.
  if (!(moduleM3s && moduleM3s > 0)) {
    return {
      available: false,
      applicable: true,
      message:
        "Chronique de débit trop courte ou absente sur la station rattachée — module non calculable.",
      etapes,
      confiance: "faible",
      reserves: [],
    };
  }

  // --- 1. Flow available at the point — the headline denominator -----------
  //
  // The module already integrates every contribution of the catchment upstream.
  // It needs no catchment area, which matters: `surface_bv` is missing on 55 %
  // of the network, and used to make the WHOLE panel fail.
  const debitDisponibleM3An = moduleM3s * SECONDS_PER_YEAR;
  etapes.push({
    label: "Module de la station",
    valeur: `${fmt(moduleM3s, 2)} m³/s`,
    detail: input.anneesModule
      ? `moyenne interannuelle sur ${input.anneesModule} année${input.anneesModule > 1 ? "s" : ""} complète${input.anneesModule > 1 ? "s" : ""}`
      : undefined,
  });
  etapes.push({
    label: "Débit disponible au point",
    valeur: `${volume(debitDisponibleM3An)}/an`,
    detail: "ce que le cours d'eau apporte, apports amont compris",
  });

  const preleve =
    input.prelevementsCommuneM3 !== undefined && input.prelevementsCommuneM3 > 0
      ? input.prelevementsCommuneM3
      : undefined;

  let pressionCoursEau: number | undefined;
  let classePression: ClasseWri | undefined;
  if (preleve !== undefined) {
    pressionCoursEau = preleve / debitDisponibleM3An;
    classePression = classeWri(pressionCoursEau);
    etapes.push({
      label: "Prélèvements de la commune",
      valeur: `${volume(preleve)}/an`,
      detail: "BNPE, tous usages",
    });
    etapes.push({
      label: "Pression sur le cours d'eau",
      valeur: `${fmt(pressionCoursEau * 100, 1)} %`,
      detail: `échelle WRI Aqueduct — ${classePression.label.toLowerCase()}`,
    });
  }

  // The site's own weight, expressed against the flow that is actually there.
  let partSite: number | undefined;
  if (input.volumeSiteM3 !== undefined && input.volumeSiteM3 > 0) {
    partSite = input.volumeSiteM3 / debitDisponibleM3An;
    etapes.push({
      label: "Part de votre site",
      valeur: partSite < 0.001 ? "< 0,1 %" : `${fmt(partSite * 100, 2)} %`,
      detail: "volume que vous avez déclaré ÷ débit disponible",
    });
  }

  // --- 2. Local production, when the geometry allows it --------------------
  //
  // A second, DIFFERENT question: does this territory live on the water it
  // produces? Everything below is optional — its absence no longer condemns the
  // pressure figure above.
  let debitSpecifiqueLsKm2: number | undefined;
  let ressourceCommuneM3An: number | undefined;
  let autonomieTerritoire: number | undefined;
  let dependanceAmont = false;
  let transpositionRefusee: string | undefined;

  if (surfaceBvKm2 && surfaceBvKm2 > 0) {
    debitSpecifiqueLsKm2 = (moduleM3s * 1000) / surfaceBvKm2;
    etapes.push({
      label: "Bassin versant de la station",
      valeur: `${fmt(surfaceBvKm2, 0)} km²`,
    });
    etapes.push({
      label: "Débit spécifique",
      valeur: `${fmt(debitSpecifiqueLsKm2, 1)} l/s/km²`,
      detail: "module ÷ surface du bassin — la grandeur qui se transpose",
    });

    if (surfaceCommuneKm2 && surfaceCommuneKm2 > 0) {
      const ratio = surfaceBvKm2 / surfaceCommuneKm2;
      if (ratio > RATIO_MAX || ratio < RATIO_MIN) {
        // Refuses this branch only. The pressure figure stands: it never used
        // the transposition in the first place.
        transpositionRefusee =
          `La station draine ${fmt(surfaceBvKm2, 0)} km² pour une commune de ` +
          `${fmt(surfaceCommuneKm2, 0)} km² (rapport ${fmt(ratio, 0)}) : la production locale ` +
          "n'est pas transposée, les deux régimes n'étant pas comparables.";
      } else {
        ressourceCommuneM3An =
          (debitSpecifiqueLsKm2 / 1000) * surfaceCommuneKm2 * SECONDS_PER_YEAR;
        etapes.push({
          label: "Production du territoire",
          valeur: `${volume(ressourceCommuneM3An)}/an`,
          detail: "débit spécifique × surface de la commune",
        });
        if (preleve !== undefined) {
          autonomieTerritoire = preleve / ressourceCommuneM3An;
          dependanceAmont = autonomieTerritoire > 1;
          etapes.push({
            label: "Autonomie du territoire",
            valeur: dependanceAmont
              ? `× ${fmt(autonomieTerritoire, 1)}`
              : `${fmt(autonomieTerritoire * 100, 1)} %`,
            // Deliberately no WRI class here: this ratio answers another
            // question, and grading it on that scale was the Toulouse defect.
            detail: dependanceAmont
              ? "la commune prélève davantage que ce que son territoire produit"
              : "part de la production locale prélevée",
          });
        }
      }
    }
  }

  // --- 3. Confidence and caveats -------------------------------------------
  reserves.push(RESSOURCE_RESERVES.pasUnDroit);
  if (pressionCoursEau !== undefined) reserves.push(RESSOURCE_RESERVES.stationPasSource);
  // The transposition caveat belongs to the local-production branch only.
  if (ressourceCommuneM3An !== undefined) {
    reserves.push(RESSOURCE_RESERVES.transposition, RESSOURCE_RESERVES.communeVsBassin);
  }
  if (transpositionRefusee) reserves.push(transpositionRefusee);
  if (dependanceAmont) reserves.push(RESSOURCE_RESERVES.dependanceAmont);
  if ((input.anneesModule ?? 0) < 20) reserves.push(RESSOURCE_RESERVES.moduleCourt);
  // Surfaced because the referential says so, never weighted: the Sandre code
  // list could not be read, so its severity is not interpreted.
  if (input.influenceCode !== undefined && input.influenceCode !== null && input.influenceCode > 0) {
    reserves.push(RESSOURCE_RESERVES.influence);
  }

  let confiance: RessourceResult["confiance"] = "haute";
  const ratio = surfaceBvKm2 && surfaceCommuneKm2 ? surfaceBvKm2 / surfaceCommuneKm2 : 1;
  if (ratio > RATIO_CONFIANT || ratio < 1 / RATIO_CONFIANT) confiance = "moyenne";
  if ((input.anneesModule ?? 0) < 10) confiance = "moyenne";
  if ((input.distanceStationKm ?? 0) > 30) confiance = "moyenne";
  if ((input.distanceStationKm ?? 0) > 50 || (input.anneesModule ?? 0) < 8) confiance = "faible";

  // The mains case: the figure describes the territory, not the site's supply.
  if (input.origine === "aep") {
    reserves.push(
      "Ce site est raccordé au réseau d'eau potable : cette ressource décrit son territoire, " +
        "pas la disponibilité de son alimentation, qui dépend du service d'eau et de ses " +
        "interconnexions.",
    );
  }

  return {
    available: true,
    applicable: true,
    debitDisponibleM3An,
    pressionCoursEau,
    classePression,
    debitSpecifiqueLsKm2,
    ressourceCommuneM3An,
    autonomieTerritoire,
    dependanceAmont: dependanceAmont || undefined,
    partSite,
    etapes,
    confiance,
    reserves,
  };
}
