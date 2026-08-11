// Batch import of 50 to 500 addresses — §8 chantier 5, and "blocage n°1 du
// produit" in HANDBOOK §5 since Sprint 26.
//
// ⚠️⚠️ THE RULE THAT SHAPES THIS WHOLE FILE, from §8: **a silently wrong geocode is
// worse than a missing one.** A row that lands 40 km away gets a plausible-looking
// alert zone, a plausible-looking level, and a completely wrong answer that nothing
// distinguishes from a right one. A row that fails to geocode is visibly missing and
// gets fixed. So every row carries its own verdict, and the ambiguous ones are
// NEVER auto-resolved — they are handed back for a human to arbitrate.
//
// This module is pure parsing and reporting. The geocoding call itself is not here:
// the BAN batch endpoint (`data.geopf.fr/geocodage/search/csv/`, POST multipart) is
// unreachable from the sandbox, so what is delivered and testable is the parser, the
// per-row report and the acceptance rules. The network call is a thin wrapper the
// caller supplies — which is also what makes the rules testable without it.

export interface LigneBrute {
  /** 1-based line number in the user's file, so an error names their row */
  ligne: number;
  /** raw cell values, keyed by the normalised column name */
  champs: Record<string, string>;
}

export type VerdictGeocodage =
  | "resolu"
  | "ambigu"
  | "hors_perimetre"
  | "non_resolu"
  | "adresse_absente";

export interface LigneResultat {
  ligne: number;
  label: string;
  /** what the user wrote, kept verbatim so they can see what was searched */
  adresseSaisie?: string;
  verdict: VerdictGeocodage;
  lat?: number;
  lon?: number;
  citycode?: string;
  /** BAN score, 0-1 */
  score?: number;
  /** other candidates, when the answer was ambiguous — never silently discarded */
  candidats?: { label: string; score: number; lat: number; lon: number; citycode?: string }[];
  /** one sentence the user can act on */
  message: string;
}

export interface RapportImport {
  lignes: LigneResultat[];
  /** counts per verdict, so the summary needs no re-scan */
  compte: Record<VerdictGeocodage, number>;
  /** rows that will be created */
  importables: number;
  /** ⚠️ rows needing a human decision. NOT importable, NOT discarded. */
  aArbitrer: number;
  colonnesReconnues: string[];
  colonnesIgnorees: string[];
  hypotheses: string[];
  message?: string;
}

/**
 * Score below which a BAN answer is treated as ambiguous rather than accepted.
 *
 * ⚠️ 0.6 is a judgement, not a measurement, and it is stated as such. It was NOT
 * calibrated against a labelled sample — the sandbox has no egress — so it is
 * deliberately conservative: the cost of an extra row to arbitrate is a click, the
 * cost of an accepted wrong geocode is a wrong answer nobody notices. When a real
 * sample exists, this is the first number to check.
 */
export const SEUIL_SCORE_ACCEPTE = 0.6;

/**
 * Gap below which two candidates are considered equally plausible.
 *
 * A top score of 0.92 against a second of 0.91 is not a resolved address: the two
 * are indistinguishable and picking the first is picking at random. Same caveat as
 * above — a judgement, uncalibrated.
 */
export const ECART_AMBIGUITE = 0.05;

const ALIAS: Record<string, string[]> = {
  label: ["label", "nom", "site", "nom_du_site", "libelle", "designation"],
  adresse: ["adresse", "address", "rue", "voie", "adresse_complete"],
  codePostal: ["code_postal", "cp", "postal_code", "codepostal"],
  ville: ["ville", "commune", "city", "localite"],
  volumeM3: ["volume_m3", "volume", "volume_preleve", "volume_annuel_m3"],
  coutJourEuros: ["cout_jour_euros", "cout_jour", "cout_journalier", "cout_arret_jour"],
};

/** Normalise a header cell: lowercase, unaccented, non-alphanumerics to underscore. */
export function normaliserEntete(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Split a CSV line, honouring double-quoted fields and doubled quotes.
 *
 * ⚠️ Written rather than imported because the failure mode matters more than the
 * feature set: a French address routinely contains a comma ("12, rue de la Paix"),
 * and a naive `split(",")` shifts every following column by one. The row then
 * geocodes to something plausible with the postcode in the city column — the exact
 * silent-wrongness this file exists to prevent.
 */
export function decouperLigneCsv(ligne: string, separateur: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (inQuotes) {
      if (c === '"') {
        if (ligne[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === separateur) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/**
 * Detect the separator by counting candidates in the header.
 *
 * ⚠️ French Excel exports use `;` — the decimal comma makes `,` unusable as a
 * separator, and a user exporting from Excel FR will hand us semicolons without
 * knowing it. Guessing wrong yields a single column and an "empty file" error that
 * blames the user for a file that was fine.
 */
export function detecterSeparateur(entete: string): string {
  const candidats = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = -1;
  for (const c of candidats) {
    const n = decouperLigneCsv(entete, c).length;
    if (n > bestCount) {
      bestCount = n;
      best = c;
    }
  }
  return best;
}

export interface ParseResultat {
  lignes: LigneBrute[];
  colonnesReconnues: string[];
  colonnesIgnorees: string[];
  separateur: string;
  message?: string;
}

export const MAX_LIGNES = 500;

/** Parse the user's CSV into rows keyed by canonical column name. */
export function parserCsv(texte: string): ParseResultat {
  // Strip a UTF-8 BOM: Excel writes one, and it silently corrupts the first header
  // cell so `label` becomes `﻿label` and matches nothing.
  const clean = texte.replace(/^﻿/, "");
  const lignesTexte = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lignesTexte.length === 0) {
    return {
      lignes: [],
      colonnesReconnues: [],
      colonnesIgnorees: [],
      separateur: ";",
      message: "Fichier vide.",
    };
  }
  const separateur = detecterSeparateur(lignesTexte[0]);
  const entetes = decouperLigneCsv(lignesTexte[0], separateur).map(normaliserEntete);

  const mapping = new Map<number, string>();
  const reconnues: string[] = [];
  const ignorees: string[] = [];
  entetes.forEach((h, i) => {
    const canon = Object.entries(ALIAS).find(([, alias]) => alias.includes(h))?.[0];
    if (canon && !reconnues.includes(canon)) {
      mapping.set(i, canon);
      reconnues.push(canon);
    } else if (h) {
      ignorees.push(h);
    }
  });

  const lignes: LigneBrute[] = [];
  for (let i = 1; i < lignesTexte.length && lignes.length < MAX_LIGNES; i++) {
    const cells = decouperLigneCsv(lignesTexte[i], separateur);
    const champs: Record<string, string> = {};
    mapping.forEach((canon, idx) => {
      champs[canon] = cells[idx] ?? "";
    });
    lignes.push({ ligne: i + 1, champs });
  }

  return {
    lignes,
    colonnesReconnues: reconnues,
    colonnesIgnorees: ignorees,
    separateur,
    message:
      lignesTexte.length - 1 > MAX_LIGNES
        ? `Fichier tronqué à ${MAX_LIGNES} lignes sur ${lignesTexte.length - 1}. ⚠️ Les lignes ` +
          `au-delà n'ont PAS été importées — relancez avec le reste du fichier plutôt que de ` +
          `supposer qu'elles sont passées.`
        : undefined,
  };
}

/** The address string handed to the geocoder, assembled from the columns present. */
export function adresseDeLigne(l: LigneBrute): string {
  return [l.champs.adresse, l.champs.codePostal, l.champs.ville]
    .filter((v) => v && v.trim().length > 0)
    .join(" ")
    .trim();
}

export interface CandidatBan {
  label: string;
  score: number;
  lat: number;
  lon: number;
  citycode?: string;
}

/**
 * Turn a geocoder answer into a verdict, applying the acceptance rules.
 *
 * ⚠️ The one rule with teeth: an ambiguous answer is NOT resolved. Taking the top
 * candidate when two are within a rounding error of each other is picking at random
 * and calling it a result.
 */
export function verdictPour(
  ligne: LigneBrute,
  candidats: CandidatBan[],
  couvert: (lat: number, lon: number, citycode?: string) => boolean,
): LigneResultat {
  const label = ligne.champs.label?.trim() || adresseDeLigne(ligne) || `Ligne ${ligne.ligne}`;
  const adresseSaisie = adresseDeLigne(ligne) || undefined;
  const base = { ligne: ligne.ligne, label, adresseSaisie };

  if (!adresseSaisie) {
    return {
      ...base,
      verdict: "adresse_absente",
      message:
        "Aucune adresse dans cette ligne. ⚠️ Les colonnes reconnues sont listées dans le rapport : " +
        "si votre en-tête s'appelle autrement, renommez-le plutôt que de supposer qu'il a été lu.",
    };
  }
  if (candidats.length === 0) {
    return {
      ...base,
      verdict: "non_resolu",
      message: `Adresse non trouvée : « ${adresseSaisie} ». Le site n'est PAS créé.`,
    };
  }

  const tries = [...candidats].sort((a, b) => b.score - a.score);
  const premier = tries[0];
  const second = tries[1];

  if (premier.score < SEUIL_SCORE_ACCEPTE) {
    return {
      ...base,
      verdict: "ambigu",
      score: premier.score,
      candidats: tries.slice(0, 5),
      message:
        `Correspondance faible (${Math.round(premier.score * 100)} %) pour « ${adresseSaisie} ». ` +
        "À arbitrer : un rattachement plausible mais faux est pire qu'un rattachement manquant.",
    };
  }
  if (second && premier.score - second.score < ECART_AMBIGUITE) {
    return {
      ...base,
      verdict: "ambigu",
      score: premier.score,
      candidats: tries.slice(0, 5),
      message:
        `Deux adresses également plausibles (${Math.round(premier.score * 100)} % contre ` +
        `${Math.round(second.score * 100)} %) : « ${premier.label} » et « ${second.label} ». ` +
        "L'outil ne choisit pas — retenir la première serait tirer au sort.",
    };
  }
  if (!couvert(premier.lat, premier.lon, premier.citycode)) {
    return {
      ...base,
      verdict: "hors_perimetre",
      lat: premier.lat,
      lon: premier.lon,
      citycode: premier.citycode,
      score: premier.score,
      message:
        `« ${premier.label} » est hors du périmètre réglementaire couvert (France). Le site sera ` +
        "créé et compté, marqué NON COUVERT : aucun indicateur, et jamais un zéro.",
    };
  }
  return {
    ...base,
    verdict: "resolu",
    lat: premier.lat,
    lon: premier.lon,
    citycode: premier.citycode,
    score: premier.score,
    message: `« ${premier.label} » (${Math.round(premier.score * 100)} %).`,
  };
}

/** Assemble the per-row report. */
export function construireRapport(input: {
  parse: ParseResultat;
  resultats: LigneResultat[];
}): RapportImport {
  const compte: Record<VerdictGeocodage, number> = {
    resolu: 0,
    ambigu: 0,
    hors_perimetre: 0,
    non_resolu: 0,
    adresse_absente: 0,
  };
  for (const r of input.resultats) compte[r.verdict]++;

  const hypotheses: string[] = [];
  hypotheses.push(
    `Séparateur détecté : « ${input.parse.separateur === "\t" ? "tabulation" : input.parse.separateur} ». ` +
      "Les exports Excel français utilisent le point-virgule, parce que la virgule décimale " +
      "interdit de s'en servir comme séparateur.",
  );
  if (input.parse.colonnesIgnorees.length > 0) {
    hypotheses.push(
      `Colonnes non reconnues et IGNORÉES : ${input.parse.colonnesIgnorees.join(", ")}. ` +
        "⚠️ Elles ne sont pas importées. Si l'une contient l'adresse, renommez-la.",
    );
  }
  if (compte.ambigu > 0) {
    hypotheses.push(
      `${compte.ambigu} ligne(s) à arbitrer : elles ne sont NI importées NI écartées. Un ` +
        "géocodage silencieusement faux donne une zone d'alerte plausible et une réponse fausse " +
        "que rien ne distingue d'une bonne.",
    );
  }
  if (compte.hors_perimetre > 0) {
    hypotheses.push(
      `${compte.hors_perimetre} site(s) hors France : créés, comptés, marqués non couverts (G15).`,
    );
  }
  hypotheses.push(
    `⚠️ Le seuil d'acceptation (${SEUIL_SCORE_ACCEPTE}) et l'écart d'ambiguïté ` +
      `(${ECART_AMBIGUITE}) sont des JUGEMENTS, non calibrés sur un échantillon annoté. Ils sont ` +
      "volontairement prudents : une ligne de plus à arbitrer coûte un clic, un géocodage faux " +
      "accepté coûte une réponse fausse que personne ne remarque.",
  );

  return {
    lignes: input.resultats,
    compte,
    // Out-of-perimeter rows ARE importable: G15 says they are counted and marked,
    // not dropped. Ambiguous ones are not, until a human decides.
    importables: compte.resolu + compte.hors_perimetre,
    aArbitrer: compte.ambigu,
    colonnesReconnues: input.parse.colonnesReconnues,
    colonnesIgnorees: input.parse.colonnesIgnorees,
    hypotheses,
    message: input.parse.message,
  };
}

/** The report as CSV, so a user can fix their file rather than re-guess it. */
export function rapportEnCsv(rapport: RapportImport): string {
  const esc = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lignes = [
    ["ligne", "site", "adresse_saisie", "verdict", "latitude", "longitude", "code_insee", "score", "message", "candidats"].join(";"),
  ];
  for (const l of rapport.lignes) {
    lignes.push(
      [
        l.ligne,
        esc(l.label),
        esc(l.adresseSaisie),
        l.verdict,
        l.lat ?? "",
        l.lon ?? "",
        esc(l.citycode),
        l.score !== undefined ? Math.round(l.score * 100) : "",
        esc(l.message),
        esc(l.candidats?.map((c) => `${c.label} (${Math.round(c.score * 100)} %)`).join(" | ")),
      ].join(";"),
    );
  }
  return "﻿" + lignes.join("\r\n");
}
