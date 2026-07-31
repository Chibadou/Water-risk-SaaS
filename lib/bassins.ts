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
  /** the agence de l'eau that manages it */
  agence: string;
  /** public site, for the aid programmes */
  url: string;
}

export const BASSINS: Record<string, BassinInfo> = {
  A: {
    code: "A",
    nom: "Escaut, Somme et cours d'eau côtiers Manche Mer du Nord",
    agence: "Agence de l'eau Artois-Picardie",
    url: "https://www.eau-artois-picardie.fr/",
  },
  B1: {
    code: "B1",
    nom: "Meuse",
    agence: "Agence de l'eau Rhin-Meuse",
    url: "https://www.eau-rhin-meuse.fr/",
  },
  B2: {
    code: "B2",
    nom: "Sambre",
    agence: "Agence de l'eau Rhin-Meuse",
    url: "https://www.eau-rhin-meuse.fr/",
  },
  C: {
    code: "C",
    nom: "Rhin",
    agence: "Agence de l'eau Rhin-Meuse",
    url: "https://www.eau-rhin-meuse.fr/",
  },
  D: {
    code: "D",
    nom: "Rhône et cours d'eau côtiers méditerranéens",
    agence: "Agence de l'eau Rhône Méditerranée Corse",
    url: "https://www.eaurmc.fr/",
  },
  E: {
    code: "E",
    nom: "Corse",
    agence: "Agence de l'eau Rhône Méditerranée Corse",
    url: "https://www.eaurmc.fr/",
  },
  F: {
    code: "F",
    nom: "Adour, Garonne, Dordogne, Charente et cours d'eau côtiers aquitains",
    agence: "Agence de l'eau Adour-Garonne",
    url: "https://eau-grandsudouest.fr/",
  },
  G: {
    code: "G",
    nom: "Loire, cours d'eau côtiers vendéens et bretons",
    agence: "Agence de l'eau Loire-Bretagne",
    url: "https://agence.eau-loire-bretagne.fr/",
  },
  H: {
    code: "H",
    nom: "Seine et cours d'eau côtiers normands",
    agence: "Agence de l'eau Seine-Normandie",
    url: "https://www.eau-seine-normandie.fr/",
  },
};

export function bassinInfo(code: string | undefined): BassinInfo | undefined {
  if (!code) return undefined;
  return BASSINS[code.trim().toUpperCase()];
}

export const SDAGE_NOTE =
  "Le SDAGE du bassin fixe les orientations de gestion quantitative pour six ans, et " +
  "c'est l'agence de l'eau du bassin qui perçoit les redevances de prélèvement et " +
  "finance les aides à la sobriété — les taux comme les programmes d'aide diffèrent " +
  "d'un bassin à l'autre.";
