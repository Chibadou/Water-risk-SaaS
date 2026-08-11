// How seasonal a drought restriction actually is — measured, not assumed.
//
// ⚠️ Why this module exists. Two places in the product lean on the claim that restrictions
// are a summer phenomenon: the anticipation index uses a seasonal "anchor" to keep itself
// low out of season, and the methodology page tells the reader so. Until now that claim was
// argued rather than quantified — reasonable, universally believed, and unmeasured.
//
// The N2 calibration measured it as a side effect (Actions run 31498428653): fitting one
// transition matrix per calendar month over 2 844 zones and 6 M observed days gives, per
// month, the probability that a zone with no arrêté acquires one the next day. That is
// exactly the seasonality the anchor assumes.
//
// ⚠️ Kept as a DATED CONSTANT with its run id rather than read from
// data/calibration/report.json at render time. Two reasons: the page is static and should
// not depend on a report file that a future run rewrites, and ADR-006 wants a figure shown
// to a reader to carry where it came from. A number whose provenance is "some JSON in the
// repo" is not auditable; one that names its run is.

/** Probability that an unrestricted zone comes under an arrêté the next day, per month. */
export interface DepartMensuel {
  /** "01".."12" */
  mois: string;
  label: string;
  /** probability per day, 0-1 */
  parJour: number;
  /** transitions the estimate rests on */
  n: number;
}

export const SAISONNALITE_SOURCE = {
  run: "31498428653",
  date: "2026-08-11",
  zones: 2844,
  observations: 6_000_000,
  quoi:
    "Une matrice de transition par mois calendaire, ajustée sur l'archive réelle des arrêtés " +
    "(2 844 zones réparties sur les 100 départements, 6 millions de journées observées).",
} as const;

/**
 * Measured monthly onset rates.
 *
 * ⚠️ All twelve contexts were well populated — 157 k to 465 k transitions each — and NONE
 * was pooled towards the unconditional matrix. So the shape below is estimated, not smoothed
 * into existence.
 */
export const DEPARTS_PAR_MOIS: DepartMensuel[] = [
  { mois: "01", label: "janvier", parJour: 0.00010, n: 465_250 },
  { mois: "02", label: "février", parJour: 0.00024, n: 425_151 },
  { mois: "03", label: "mars", parJour: 0.00083, n: 462_914 },
  { mois: "04", label: "avril", parJour: 0.00182, n: 432_977 },
  { mois: "05", label: "mai", parJour: 0.00258, n: 425_830 },
  { mois: "06", label: "juin", parJour: 0.00776, n: 364_933 },
  { mois: "07", label: "juillet", parJour: 0.01479, n: 278_692 },
  { mois: "08", label: "août", parJour: 0.01386, n: 191_519 },
  { mois: "09", label: "septembre", parJour: 0.00714, n: 157_871 },
  { mois: "10", label: "octobre", parJour: 0.00157, n: 237_947 },
  { mois: "11", label: "novembre", parJour: 0.00099, n: 383_558 },
  { mois: "12", label: "décembre", parJour: 0.00026, n: 440_291 },
];

/** The month a restriction is likeliest to start, and the quietest one. */
export function extremesSaisonniers(): {
  pic: DepartMensuel;
  creux: DepartMensuel;
  rapport: number;
} {
  const trie = [...DEPARTS_PAR_MOIS].sort((a, b) => b.parJour - a.parJour);
  const pic = trie[0];
  const creux = trie[trie.length - 1];
  return { pic, creux, rapport: pic.parJour / creux.parJour };
}

/**
 * What this measurement does and does NOT license.
 *
 * ⚠️⚠️ The distinction that matters, and the reason this text ships next to the figures.
 * The same run that produced them also measured that knowing the month does **not** help
 * predict WHICH DAY a restriction starts: scored against a month-aware baseline the model
 * lost in all 100 departments. A monthly rate improves the expected NUMBER of onsets and
 * cannot improve their TIMING, because every day in July is handed the same figure.
 *
 * So these numbers are legitimate for "when should I expect pressure" and illegitimate for
 * "will it happen next week". Publishing them without that sentence would invite exactly
 * the reading the measurement rules out.
 */
export const SAISONNALITE_PORTEE =
  "Ces taux disent à quel RYTHME les restrictions démarrent selon la saison. Ils ne disent " +
  "pas QUEL JOUR : la même calibration a mesuré que connaître le mois n'améliore pas la " +
  "prévision de la date — chaque jour de juillet reçoit le même chiffre. À utiliser pour " +
  "savoir quand s'attendre à de la pression, jamais comme une prévision à court terme.";
