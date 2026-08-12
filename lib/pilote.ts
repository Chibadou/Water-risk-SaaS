// §5.5 — comparing what we PREDICTED against what a real site actually lived.
//
// ⚠️⚠️ Why this is the only validation that counts, and why everything before it does not.
// Anti-pattern n°6, verbatim: « valider le modèle sur le niveau d'alerte plutôt que sur la
// métrique finale ». Every measurement made so far — Brier scores, reliability, hysteresis —
// scores the ALERT LEVEL. A model can predict levels well and the JEA badly, and the JEA is
// what a client pays attention to. §5.5 asks for three to five sites giving their real
// 2022-2023 data so prediction can be set against reality.
//
// ⚠️⚠️ WHAT n = 5 CAN AND CANNOT ESTABLISH, stated here because it is the first thing a
// reader will over-read. Five sites is not a sample; no confidence interval, no significance,
// no generalisation. What five documented sites DO establish is whether the tool is wrong by
// a factor of ten — and that is worth more than any amount of statistics on synthetic data,
// which is exactly the note's own argument (« cinq sites documentés valent plus que
// n'importe quelle élégance statistique »). This module therefore reports a DIRECTION and an
// ORDER OF MAGNITUDE, and refuses to compute anything resembling a p-value.
//
// ⚠️ The asymmetry that matters commercially: a tool that OVERSTATES loss gets found out and
// discredited; one that UNDERSTATES it gets a client caught unprepared. Those are different
// failures and the comparison names which one occurred rather than reporting |error|.

/** One column a pilot has to fill, and what it is for. */
export interface ColonneGabarit {
  cle: string;
  entete: string;
  unite: string;
  obligatoire: boolean;
  /** why we ask, in the operator's terms — this text goes in the template itself */
  pourquoi: string;
}

/**
 * The minimal data a pilot must provide.
 *
 * ⚠️ Deliberately SHORT. Every column is a reason for someone not to reply, and a pilot who
 * sends four columns is worth more than one who sends nothing because the form asked for
 * twenty. Anything the engine can derive is not asked for.
 *
 * ⚠️ Monthly volumes rather than an annual total, and this is the one place the template is
 * demanding on purpose: twelve numbers give the annual volume AND the seasonal profile (G19)
 * AND the actual reduction during restriction months — three things the comparison needs,
 * from data that sits on a water bill.
 */
export const GABARIT_PILOTE: ColonneGabarit[] = [
  {
    cle: "site",
    entete: "site",
    unite: "texte",
    obligatoire: true,
    pourquoi: "Un nom qui vous parle. Il ne quitte pas votre navigateur.",
  },
  {
    cle: "adresse",
    entete: "adresse",
    unite: "texte",
    obligatoire: true,
    pourquoi:
      "Pour retrouver la zone d'alerte dont dépend le site. C'est elle qui porte les arrêtés, " +
      "et sans elle il n'y a rien à comparer.",
  },
  {
    cle: "annee",
    entete: "annee",
    unite: "2022 ou 2023",
    obligatoire: true,
    pourquoi:
      "Les deux années de sécheresse sur lesquelles la note demande le contrôle. Une ligne par " +
      "site et par année.",
  },
  {
    cle: "volumesMensuels",
    entete: "volume_01 … volume_12",
    unite: "m³",
    obligatoire: true,
    pourquoi:
      "Douze colonnes, une par mois, telles qu'elles figurent sur vos factures d'eau. Elles " +
      "donnent à la fois le volume annuel, le profil saisonnier, et la baisse réellement subie " +
      "pendant les mois de restriction.",
  },
  {
    cle: "joursArretReels",
    entete: "jours_arret_reels",
    unite: "jours",
    obligatoire: true,
    pourquoi:
      "Le nombre de journées de production perdues à cause de l'eau cette année-là — la seule " +
      "chose que l'outil prétend estimer. Une valeur approchée vaut mieux qu'un vide.",
  },
  {
    cle: "causeEau",
    entete: "part_imputable_eau",
    unite: "%",
    obligatoire: false,
    pourquoi:
      "Part de ces journées réellement due à l'eau plutôt qu'à une panne ou à un arrêt commercial. " +
      "⚠️ Laissée vide, l'outil ne suppose PAS 100 % : il signale que l'imputation n'est pas faite.",
  },
  {
    cle: "volumeRefAutorise",
    entete: "volume_autorise",
    unite: "m³/an",
    obligatoire: false,
    pourquoi:
      "Volume de référence de votre autorisation ou déclaration, s'il existe. C'est le V_ref " +
      "opposable que l'outil ne peut pas deviner.",
  },
];

/** What we predicted for one site-year, and what the site says happened. */
export interface ComparaisonPilote {
  site: string;
  annee: number;
  /** JEA the engine produced for that year, lower and upper bound */
  jeaPreditMin?: number;
  jeaPreditMax?: number;
  /** days the site says it actually lost */
  joursReels?: number;
  /** share of those days the site attributes to water, 0-1 — undefined when not stated */
  partEau?: number;
}

export type SensEcart = "surestime" | "sousestime" | "dans_la_fourchette" | "incomparable";

export interface VerdictPilote {
  site: string;
  annee: number;
  sens: SensEcart;
  /** observed days actually attributable to water, when the share was stated */
  joursImputables?: number;
  /** ratio predicted/observed, when both exist and the observed is non-zero */
  facteur?: number;
  detail: string;
}

/**
 * Compare one site-year.
 *
 * ⚠️ Returns a DIRECTION first and a ratio second. `|prédit − réel|` averaged over five sites
 * would be a number with no meaning and an air of rigour; "the tool understated on four of
 * five sites" is a finding a reader can act on.
 *
 * ⚠️ « dans_la_fourchette » is a real outcome, not a near-miss. The JEA is published as an
 * interval precisely because unquantified arrêté measures widen it (G2), so an observation
 * landing inside that interval is the tool being RIGHT — and treating it as an error of
 * (réel − milieu) would punish the honesty of publishing a range.
 */
export function comparerPilote(c: ComparaisonPilote): VerdictPilote {
  const { site, annee } = c;
  if (c.jeaPreditMin === undefined || c.joursReels === undefined) {
    return {
      site,
      annee,
      sens: "incomparable",
      detail:
        c.jeaPreditMin === undefined
          ? "Aucun JEA prédit pour cette année : la comparaison n'a pas de terme gauche. " +
            "⚠️ Ce n'est pas un écart de zéro."
          : "Le site n'a pas déclaré ses journées perdues : la comparaison n'a pas de terme droit.",
    };
  }

  const haut = c.jeaPreditMax ?? c.jeaPreditMin;
  // ⚠️ When the site did not attribute its losses, the observation is used AS IS and the
  // trail says the attribution is missing. Multiplying by an assumed 100 % would silently
  // credit the tool with days it may have nothing to do with.
  const imputables = c.partEau !== undefined ? c.joursReels * c.partEau : c.joursReels;
  const reserve =
    c.partEau === undefined
      ? " ⚠️ La part imputable à l'eau n'est pas déclarée : ces journées peuvent inclure des " +
        "arrêts sans lien avec l'eau, donc l'écart est une borne."
      : "";

  const fmt = (n: number) => Math.round(n * 10) / 10;
  const fourchette =
    haut > c.jeaPreditMin ? `${fmt(c.jeaPreditMin)}–${fmt(haut)}` : `${fmt(c.jeaPreditMin)}`;

  if (imputables >= c.jeaPreditMin && imputables <= haut) {
    return {
      site,
      annee,
      sens: "dans_la_fourchette",
      joursImputables: fmt(imputables),
      detail:
        `Prédit ${fourchette} JEA, observé ${fmt(imputables)} : l'observation tombe DANS la ` +
        `fourchette. C'est le cas favorable, et il ne se transforme pas en erreur parce qu'il ` +
        `n'égale pas une valeur centrale — la fourchette est l'estimation.` + reserve,
    };
  }

  const sousEstime = imputables > haut;
  const reference = sousEstime ? haut : c.jeaPreditMin;
  const facteur = reference > 0 ? imputables / reference : undefined;
  return {
    site,
    annee,
    sens: sousEstime ? "sousestime" : "surestime",
    joursImputables: fmt(imputables),
    facteur: facteur !== undefined ? Math.round(facteur * 100) / 100 : undefined,
    detail:
      (sousEstime
        ? `⚠️ SOUS-ESTIMATION : prédit ${fourchette} JEA, observé ${fmt(imputables)}. ` +
          `Le site a perdu PLUS que la borne haute` +
          (facteur !== undefined ? ` (facteur ${Math.round(facteur * 100) / 100})` : "") +
          `. C'est le sens d'erreur le plus grave : un client qui s'appuie là-dessus est pris ` +
          `au dépourvu.`
        : `Surestimation : prédit ${fourchette} JEA, observé ${fmt(imputables)}. ` +
          `Le site a perdu MOINS que la borne basse` +
          (facteur !== undefined ? ` (facteur ${Math.round(facteur * 100) / 100})` : "") +
          `. Moins dangereux qu'une sous-estimation, mais c'est ce qui fait perdre la confiance ` +
          `d'un lecteur qui connaît son site.`) + reserve,
  };
}

export interface SyntheseValidation {
  comparables: number;
  dansLaFourchette: number;
  sousEstimes: number;
  surEstimes: number;
  incomparables: number;
  /** worst understatement factor seen — the number that decides whether the tool ships */
  pireFacteurSousEstimation?: number;
  verdict: string;
  limites: string[];
}

/**
 * Roll several site-years into the statement §5.5 asks for.
 *
 * ⚠️ NO mean error, NO standard deviation, NO p-value, and their absence is the point. With
 * three to five sites those quantities exist arithmetically and mean nothing, and printing
 * one would lend a false air of rigour to an anecdote. What is reported instead is a count,
 * a direction, and the single worst factor — which is what actually decides whether the tool
 * can be put in front of a client.
 */
export function synthetiserValidation(verdicts: VerdictPilote[]): SyntheseValidation {
  const comparables = verdicts.filter((v) => v.sens !== "incomparable");
  const sous = comparables.filter((v) => v.sens === "sousestime");
  const sur = comparables.filter((v) => v.sens === "surestime");
  const dans = comparables.filter((v) => v.sens === "dans_la_fourchette");
  const pire = sous
    .map((v) => v.facteur)
    .filter((f): f is number => f !== undefined)
    .reduce<number | undefined>((m, f) => (m === undefined || f > m ? f : m), undefined);

  const limites = [
    "⚠️ Trois à cinq sites ne sont pas un échantillon : aucun intervalle de confiance, aucune " +
      "signification statistique, aucune généralisation. Ce contrôle dit si l'outil se trompe " +
      "d'un facteur dix, pas de combien il se trompe en moyenne.",
    "⚠️ Les journées perdues sont déclarées par le site, sur deux années passées. C'est une " +
      "mémoire d'entreprise, pas un relevé : elle est probablement arrondie, et plutôt vers le bas.",
    "⚠️ Rien ici ne valide le VNP en m³ : seule l'interruption est comparée, parce que c'est la " +
      "seule des trois sorties dont un site connaît la valeur réelle.",
  ];
  if (comparables.some((v) => /part imputable à l'eau n'est pas déclarée/.test(v.detail))) {
    limites.push(
      "⚠️ Au moins un site n'a pas imputé ses arrêts à une cause : pour celui-là, l'écart mesuré " +
        "est une BORNE et non une valeur.",
    );
  }

  const verdict =
    comparables.length === 0
      ? "Aucun site-année comparable : la validation de §5.5 reste NON FAITE. ⚠️ Ce n'est pas un " +
        "résultat neutre, c'est une absence de résultat."
      : sous.length === 0
        ? `Sur ${comparables.length} site(s)-année comparables, aucune sous-estimation : ` +
          `${dans.length} dans la fourchette, ${sur.length} surestimé(s). L'outil ne prend ` +
          `personne au dépourvu sur cet échantillon — ce qui est le minimum, pas une réussite.`
        : `⚠️ Sur ${comparables.length} site(s)-année comparables, ${sous.length} SOUS-ESTIMÉ(S)` +
          (pire !== undefined ? `, au pire d'un facteur ${pire}` : "") +
          `. C'est le sens d'erreur qui compte : il faut savoir pourquoi avant de mettre ces ` +
          `chiffres devant un client.`;

  return {
    comparables: comparables.length,
    dansLaFourchette: dans.length,
    sousEstimes: sous.length,
    surEstimes: sur.length,
    incomparables: verdicts.length - comparables.length,
    pireFacteurSousEstimation: pire,
    verdict,
    limites,
  };
}

/**
 * Quote a CSV field when it needs it — comma, quote, or newline.
 *
 * ⚠️ Written rather than pulled in, for one reason: the alternative was to strip commas from
 * the example, which would have produced an address no French pilot would recognise as
 * theirs. Quoting keeps the example realistic AND the file parseable.
 */
function champCsv(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** The template as a CSV a pilot can open in a spreadsheet, comments included. */
export function gabaritCsv(): string {
  const entetes = GABARIT_PILOTE.flatMap((c) =>
    c.cle === "volumesMensuels"
      ? Array.from({ length: 12 }, (_, i) => `volume_${String(i + 1).padStart(2, "0")}`)
      : [c.entete],
  );
  const lignes = [
    "# Gabarit de données pilote — HydroVigie, validation §5.5",
    "# Une ligne par site ET par année (2022, puis 2023).",
    "# Un champ vide n'est jamais compté comme zéro : il est signalé comme non déclaré.",
    "#",
    ...GABARIT_PILOTE.map(
      (c) => `# ${c.entete} (${c.unite})${c.obligatoire ? " — obligatoire" : " — optionnel"} : ${c.pourquoi}`,
    ),
    "#",
    entetes.join(","),
    // One example row, so the format is unambiguous. Values obviously fictional.
    //
    // ⚠️ QUOTED, and the reason is a defect this template shipped with for one commit: the
    // example address contains a comma ("12 rue de la Fonderie, 28000 Chartres"), so the row
    // had 19 fields against 18 headers and the file broke in a spreadsheet the moment a pilot
    // opened it. A template that does not survive its own example row is worse than none —
    // it teaches the wrong format. French addresses contain commas by convention, so this is
    // the common case and not an edge one.
    [
      "Usine exemple",
      "12 rue de la Fonderie, 28000 Chartres",
      "2022",
      ...Array.from({ length: 12 }, (_, i) => String(2000 + i * 100)),
      "14",
      "80",
      "45000",
    ]
      .map(champCsv)
      .join(","),
  ];
  return lignes.join("\n") + "\n";
}
