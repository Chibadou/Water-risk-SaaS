// River-basin district → agence de l'eau.
//
// Each of the six agences runs its own aid programmes, sets its own redevance
// rates and adopts its own SDAGE, so knowing which one a site falls under turns
// the transition panel from national policy into the body it actually deals
// with.
//
// The commune → basin attribution is NOT here: it comes from the Sandre
// referential (data/refdata/bassins-communes.json, built by
// scripts/refdata/fetch_bassins.py), because basins follow hydrology and a
// department-keyed table would be wrong at every divide. Only this last hop —
// nine stable DCE basin codes to six agencies — is expressed in code.

export interface BassinInfo {
  /** DCE basin code as published by Sandre */
  code: string;
  /** basin name */
  nom: string;
  /**
   * The district's usual short name — « Loire-Bretagne » where the referential
   * writes « La Loire, les cours d'eau côtiers vendéens et bretons ».
   *
   * It exists for the map: drawn in full, those names wrap over five lines and
   * cover the country they label (measured on the France-wide view). The full
   * name stays in `nom` and is what the popup shows.
   */
  nomCourt: string;
  /** the agence de l'eau that manages it */
  agence: string;
  /** public site, for the aid programmes */
  url: string;
}

export const BASSINS: Record<string, BassinInfo> = {
  A: {
    code: "A",
    nom: "Escaut, Somme et cours d'eau côtiers Manche Mer du Nord",
    nomCourt: "Artois-Picardie",
    agence: "Agence de l'eau Artois-Picardie",
    url: "https://www.eau-artois-picardie.fr/",
  },
  B1: {
    code: "B1",
    nom: "Meuse",
    nomCourt: "Meuse",
    agence: "Agence de l'eau Rhin-Meuse",
    url: "https://www.eau-rhin-meuse.fr/",
  },
  B2: {
    code: "B2",
    nom: "Sambre",
    nomCourt: "Sambre",
    agence: "Agence de l'eau Rhin-Meuse",
    url: "https://www.eau-rhin-meuse.fr/",
  },
  C: {
    code: "C",
    nom: "Rhin",
    nomCourt: "Rhin",
    agence: "Agence de l'eau Rhin-Meuse",
    url: "https://www.eau-rhin-meuse.fr/",
  },
  D: {
    code: "D",
    nom: "Rhône et cours d'eau côtiers méditerranéens",
    nomCourt: "Rhône-Méditerranée",
    agence: "Agence de l'eau Rhône Méditerranée Corse",
    url: "https://www.eaurmc.fr/",
  },
  E: {
    code: "E",
    nom: "Corse",
    nomCourt: "Corse",
    agence: "Agence de l'eau Rhône Méditerranée Corse",
    url: "https://www.eaurmc.fr/",
  },
  F: {
    code: "F",
    nom: "Adour, Garonne, Dordogne, Charente et cours d'eau côtiers aquitains",
    nomCourt: "Adour-Garonne",
    agence: "Agence de l'eau Adour-Garonne",
    url: "https://eau-grandsudouest.fr/",
  },
  G: {
    code: "G",
    nom: "Loire, cours d'eau côtiers vendéens et bretons",
    nomCourt: "Loire-Bretagne",
    agence: "Agence de l'eau Loire-Bretagne",
    url: "https://agence.eau-loire-bretagne.fr/",
  },
  H: {
    code: "H",
    nom: "Seine et cours d'eau côtiers normands",
    nomCourt: "Seine-Normandie",
    agence: "Agence de l'eau Seine-Normandie",
    url: "https://www.eau-seine-normandie.fr/",
  },
};

/**
 * The DCE districts that are NOT managed by an agence de l'eau: overseas, the
 * body is an office de l'eau départemental. The Sandre referential publishes
 * fourteen districts — the nine above plus these five.
 *
 * ⚠️ Named explicitly rather than deduced from "absent from BASSINS". The map
 * popup states, for a district it cannot name an agency for, that it is an
 * overseas one — which is true today and would become a confident falsehood the
 * day Sandre published a tenth metropolitan code. Listing them turns that
 * sentence into something this file can be held to.
 */
export const BASSINS_OUTRE_MER = new Set(["I", "J", "K", "L", "M"]);

export function estOutreMer(code: string | undefined): boolean {
  if (!code) return false;
  return BASSINS_OUTRE_MER.has(code.trim().toUpperCase());
}

export function bassinInfo(code: string | undefined): BassinInfo | undefined {
  if (!code) return undefined;
  return BASSINS[code.trim().toUpperCase()];
}

export const SDAGE_NOTE =
  "Le SDAGE du bassin fixe les orientations de gestion quantitative pour six ans, et " +
  "c'est l'agence de l'eau du bassin qui perçoit les redevances de prélèvement et " +
  "finance les aides à la sobriété — les taux comme les programmes d'aide diffèrent " +
  "d'un bassin à l'autre.";
