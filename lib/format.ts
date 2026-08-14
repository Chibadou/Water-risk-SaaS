// Écrire un nombre sans le faire disparaître.
//
// ⚠️⚠️ Ce module existe pour un défaut vu en ligne le 2026-08-13, sur la capture
// d'un vrai site : la synthèse annonçait « perd **0 jour-équivalent** d'arrêt
// par an » et « VNP de crise **0 m³** », pendant que le détail juste en dessous
// disait « 19 jours sous restriction pondérés par l'exposition… sur un volume
// restreignable de 50 m³/an ». Dix pour cent de 50 m³ ne font pas zéro : c'était
// `Math.round()` qui écrasait un petit positif.
//
// Ce dépôt répète partout qu'une **absence** ne doit jamais s'écrire zéro. Ceci
// en est l'autre bout, et il est plus insidieux : une **présence** écrite zéro.
// Le lecteur y lit « rien à signaler », c'est-à-dire l'inverse de ce que le
// calcul a trouvé. Trois formateurs indépendants le faisaient
// (`IndicateursNote`, `synthese`, `executive`), ce qui est aussi la raison pour
// laquelle ce fichier est partagé plutôt que corrigé trois fois.

const nf = new Intl.NumberFormat("fr-FR");

/**
 * Un entier arrondi, SAUF si l'arrondi effaçait une valeur : un positif qui
 * tomberait à 0 s'écrit « < 1 ».
 *
 * ⚠️ Pas de décimale de repli (« 0,3 »). Ces sorties sont des estimations
 * bornées par des fourchettes de plusieurs dizaines de pour cent ; afficher un
 * dixième leur prêterait une précision qu'elles n'ont pas. « < 1 » dit
 * exactement ce qu'on sait : c'est petit, et ce n'est pas rien.
 *
 * ⚠️ Le zéro MESURÉ reste « 0 ». Remplacer tous les zéros par « < 1 » serait le
 * même défaut dans l'autre sens — un site réellement épargné a droit à son zéro.
 */
export function nombre(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const arrondi = Math.round(v);
  if (arrondi === 0) return v > 0 ? "< 1" : "> -1";
  return nf.format(arrondi);
}

/**
 * Vrai quand `nombre()` a renvoyé une borne plutôt qu'une valeur. Sert aux
 * appelants qui accordent un pluriel ou composent une phrase autour du chiffre :
 * « < 1 jours » se lit mal, et « moins d'un jour-équivalent » demande de savoir
 * qu'on est dans ce cas.
 */
export function estBorne(v: number): boolean {
  return Number.isFinite(v) && v !== 0 && Math.round(v) === 0;
}

/** Un volume, avec son unité et le même refus d'effacer un petit positif. */
export function m3(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `${nf.format(Math.round((v / 1_000_000) * 10) / 10)} Mm³`;
  return `${nombre(v)} m³`;
}
