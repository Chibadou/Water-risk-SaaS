// Matching a site's declared usage to the arrêtés' own usage nomenclature — §3.3.
//
// ⚠️ What this unlocks, and why it was the biggest remaining functional gain.
//
// Today a site's ρ is a single blended figure: every measure applicable to the
// site's PROFILE is averaged, and the whole withdrawal is weighted by it. But
// arrêtés do not restrict companies, they restrict USAGES — "arrosage des espaces
// verts" and "abreuvement des animaux" carry wildly different measures at the same
// gravity level, and a site doing both is not restricted uniformly.
//
// Matching each declared usage to the nomenclature lets the RIGHT ρ apply to the
// RIGHT share of volume. That is ADR-001 finally reaching the computation rather
// than only the data model.
//
// ---------------------------------------------------------------------------
// ⚠️ What this module deliberately refuses to do
// ---------------------------------------------------------------------------
//
// It never guesses. A free-text usage the operator typed ("refroidissement") has no
// entry in a nomenclature of 20 labels about watering, car washing and livestock —
// and inventing one would attach a lawn-watering ban to a cooling circuit. So:
//
//   - below the acceptance threshold, the result is `undefined` and the candidates
//     are returned for a human to pick from;
//   - when two labels score within a hair of each other, the match is AMBIGUOUS,
//     not resolved in favour of the first.
//
// The nomenclature counts 20 entries (measured). That is small enough to read in
// five minutes, which is why the matcher can be simple and the failures readable —
// there is no long tail to hide in.

/** One nomenclature entry, as the embedded guide publishes it. */
export interface EntreeNomenclature {
  usage: string;
  thematique?: string | null;
}

export interface Rapprochement {
  /** the matched label, or undefined when nothing scored high enough */
  usage?: string;
  thematique?: string | null;
  /** 0-1 token overlap; undefined when no candidate was offered at all */
  score?: number;
  /**
   * ⚠️ True when the two best candidates are indistinguishable. The match is then
   * NOT applied: picking the first would be drawing lots and calling it a result —
   * the same rule the batch geocoder follows.
   */
  ambigu: boolean;
  /** best candidates, always returned so a human can arbitrate */
  candidats: { usage: string; score: number; thematique?: string | null }[];
  /** one sentence a reader can act on */
  detail: string;
}

/**
 * Minimum overlap to accept a match.
 *
 * ⚠️ A JUDGEMENT, not a measurement, and stated as such. 0.34 means "a third of the
 * meaningful words agree", which on labels of three to six words is roughly one
 * strong word in common ("piscines", "abreuvement"). It has NOT been calibrated
 * against a labelled sample: none exists. It errs towards refusing, because
 * attaching the wrong measure to a usage produces a plausible ρ nobody will
 * question, while a refusal is visible and gets fixed.
 */
export const SEUIL_RAPPROCHEMENT = 0.34;

/** Gap below which two candidates are indistinguishable. */
export const ECART_AMBIGUITE_USAGE = 0.08;

/**
 * Words carrying no discriminating power in this nomenclature.
 *
 * ⚠️ "eau" is in the list, and that is the interesting one: it appears in a third of
 * the labels and in almost every free-text usage an operator types, so keeping it
 * would make everything match everything at a low score.
 */
const VIDES = new Set([
  "de", "des", "du", "la", "le", "les", "l", "d", "en", "et", "ou", "a", "au", "aux",
  "pour", "par", "dans", "sur", "un", "une", "the", "eau", "eaux", "usage", "usages",
  "site", "autres", "autre", "plus", "cadre", "conformement", "installations",
]);

/**
 * Modifier prefixes bound to the word that follows them by a hyphen.
 *
 * ⚠️ MEASURED DEFECT, not a precaution. Entry 13 of the guide reads « Irrigation des
 * cultures par système d'irrigation localisée (goutte à goutte, micro-aspersion) ».
 * Splitting on the hyphen produced the token `aspersion` — a word that label does NOT
 * contain — so entry 13 scored 1.00 on the query « irrigation par aspersion », tying
 * with entry 12 (« Irrigation par aspersion des cultures ») and making the match
 * ambiguous. The two carry DIFFERENT measures: aspersion is restricted several levels
 * earlier than localised irrigation, so an ambiguity here is a real loss.
 *
 * `micro-aspersion` is one word; `micro` is not an independent term. Joining across the
 * hyphen only for these bound prefixes also fixes the reverse direction: a user typing
 * « goutte-à-goutte » still splits, because `goutte` is not a modifier prefix.
 */
const PREFIXES_LIES = new Set(["micro", "mini", "semi", "sous", "sur", "quasi", "auto"]);

/**
 * Words that NEGATE the term they qualify.
 *
 * ⚠️ MEASURED DEFECT, and the worst one this module had. « remplissage de la piscine
 * collective » matched « Remplissage et vidange de piscines NON collective » at **1.00**
 * — the entry that means the exact opposite, at full confidence — because a bag of words
 * has no polarity and `non` counted as an ordinary shared token. The right entry
 * (« piscines à usage collectif13 ») scored 0.67 and lost.
 *
 * The rule below is deliberately one-directional: an entry that negates a term the
 * query does not negate is refused, while the reverse is allowed. A query that DOES
 * negate (« piscine non collective ») still reaches the negating entry, and reaches it
 * ahead of the affirmative one because it shares `non` too.
 */
const NEGATIONS = new Set(["non", "hors", "sauf"]);

/**
 * Gender variants folded onto one form.
 *
 * ⚠️ One entry, and it earns its place from a measurement rather than from caution: the
 * GUIDE ITSELF is inconsistent — entry 2 writes « piscines non collective », entry 3
 * writes « piscines à usage collectif13 ». Without the fold the two entries do not
 * share the adjective that distinguishes them, so the correct entry scored lower than
 * the wrong one. This is a hand list and not a stemmer because French gender endings
 * are irregular (`collectif/collective` but `vif/vive`, `public/publique`), and a rule
 * general enough to cover them would mangle words the guide does contain.
 */
const VARIANTES: Record<string, string> = { collective: "collectif" };

/**
 * Normalise a label into comparable tokens: unaccented, lowercase, punctuation out,
 * stop words out, and singularised crudely.
 *
 * ⚠️ The crude singularisation (`piscines` → `piscine`) matters more than it looks:
 * the nomenclature writes plurals ("Arrosage des golfs") and operators write
 * singulars ("arrosage du golf"). Without it, the two share only "arrosage" and the
 * match falls under the threshold.
 */
export function tokens(label: string): string[] {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Digits are footnote markers in the guide ("piscines à usage collectif13").
    .replace(/[0-9]+/g, " ")
    // ⚠️ A hyphenated negation must behave like a spaced one: "non-collective" and
    // "non collective" mean the same thing, and only the second form survives the
    // prefix join below. Done BEFORE it, so `non` stays a token the polarity rule sees.
    .replace(/\bnon-/g, "non ")
    // Bound modifier prefixes keep their word: "micro-aspersion" is one term.
    .replace(new RegExp(`\\b(${[...PREFIXES_LIES].join("|")})-(?=[a-z])`, "g"), "$1")
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !VIDES.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t))
    .map((t) => VARIANTES[t] ?? t);
}

/**
 * Does this token set negate one of its own terms?
 *
 * Exported because the polarity rule it feeds is the kind of thing a reader will not
 * believe until they can call it on a label themselves.
 */
export function nie(tk: string[]): boolean {
  return tk.some((t) => NEGATIONS.has(t));
}

/**
 * Overlap between two token sets, as the share of the SMALLER set that is shared.
 *
 * ⚠️ Not the Jaccard index. Jaccard divides by the union, which penalises a short user
 * label against a long nomenclature one. Dividing by the smaller set asks the question
 * that actually matters here: "is what the user wrote contained in this entry?"
 *
 * ⚠️ MEASURED, on the real 20-entry guide against 13 real queries. Four queries are
 * accepted here and would be REFUSED under Jaccard:
 *
 *   « ICPE »                    → entry 10  recouvrement 1.00 · Jaccard 0.20
 *   « nettoyage des trottoirs » → entry 6   recouvrement 1.00 · Jaccard 0.33
 *   « prélèvement en canal »    → entry 17  recouvrement 0.50 · Jaccard 0.33
 *   « abreuvement du troupeau » → entry 14  recouvrement 0.50 · Jaccard 0.33
 *
 * The first two are perfect subsets — every word the user typed is in the entry — and
 * Jaccard rejects them purely for the entry's length. That is the whole argument.
 *
 * ⚠️ An earlier version of this comment claimed a perfect subset "scores 0.1" under
 * Jaccard and used « arrosage du golf » as the example. Measured, that pair scores
 * **0.50** and Jaccard would have accepted it: the example proved nothing. Left recorded
 * because the plausible-but-unmeasured justification is the failure mode this file is
 * otherwise about.
 */
export function recouvrement(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const communs = a.filter((t) => setB.has(t)).length;
  return communs / Math.min(a.length, b.length);
}

/**
 * Match a free-text usage against the nomenclature.
 *
 * `usageCode` is what the operator typed; `nomenclature` is the embedded guide.
 */
export function rapprocherUsage(
  usageCode: string | undefined,
  nomenclature: EntreeNomenclature[],
): Rapprochement {
  const saisi = (usageCode ?? "").trim();
  if (!saisi) {
    return {
      ambigu: false,
      candidats: [],
      detail: "Aucun usage saisi : rien à rapprocher.",
    };
  }
  const tk = tokens(saisi);
  if (tk.length === 0) {
    return {
      ambigu: false,
      candidats: [],
      detail:
        `« ${saisi} » ne contient aucun mot discriminant après normalisation. ` +
        "Précisez l'usage (par exemple « arrosage des espaces verts » plutôt que « eau »).",
    };
  }

  const nieSaisi = nie(tk);
  const notes = nomenclature
    .map((e) => {
      const te = tokens(e.usage);
      // ⚠️ Polarity gate. An entry that negates a term the query does not negate is
      // NOT a weak match, it is the opposite usage — see the `NEGATIONS` comment for
      // the case that made this a 1.00 mismatch. Scored 0 so it leaves the candidate
      // list entirely rather than sitting near the top for a human to trip over.
      const score = nie(te) && !nieSaisi ? 0 : recouvrement(tk, te);
      return { usage: e.usage, thematique: e.thematique, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const candidats = notes.slice(0, 5);
  const premier = notes[0];
  const second = notes[1];

  if (!premier || premier.score < SEUIL_RAPPROCHEMENT) {
    return {
      score: premier?.score,
      ambigu: false,
      candidats,
      detail:
        `« ${saisi} » ne correspond à aucun usage de la nomenclature des arrêtés ` +
        `(meilleure correspondance : ${premier ? `${Math.round(premier.score * 100)} %` : "aucune"}). ` +
        "⚠️ Aucune mesure ne lui est attachée — plutôt que d'en attacher une plausible et fausse. " +
        "La nomenclature ne couvre que les usages que les arrêtés nomment ; un procédé industriel " +
        "n'y figure pas, et c'est l'exemption ou le seuil technique qui le décrit.",
    };
  }
  if (second && premier.score - second.score < ECART_AMBIGUITE_USAGE) {
    return {
      score: premier.score,
      ambigu: true,
      candidats,
      detail:
        `« ${saisi} » correspond aussi bien à « ${premier.usage} » qu'à « ${second.usage} » ` +
        `(${Math.round(premier.score * 100)} % contre ${Math.round(second.score * 100)} %). ` +
        "L'outil ne choisit pas : les deux portent des mesures différentes, et retenir la première " +
        "serait tirer au sort.",
    };
  }
  return {
    usage: premier.usage,
    thematique: premier.thematique,
    score: premier.score,
    ambigu: false,
    candidats,
    detail:
      `« ${saisi} » rapproché de « ${premier.usage} » ` +
      `(${Math.round(premier.score * 100)} % de recouvrement). Les mesures de cet usage lui sont ` +
      "appliquées. ⚠️ Le seuil d'acceptation est un jugement non calibré : vérifiez le " +
      "rapprochement si le chiffre vous surprend.",
  };
}

export interface CouvertureVecteur {
  /** declared usages that matched an entry */
  rapproches: number;
  /** declared usages with no match — no measure applies to them */
  nonRapproches: number;
  /** declared usages whose match is ambiguous and therefore NOT applied */
  ambigus: number;
  /**
   * ⚠️ Les usages orphelins, NOMMÉS. Le compteur seul ne dit pas sur quoi agir :
   * vu en ligne le 2026-08-13, un site industriel lisait « 1 usage rapproché ·
   * 2 sans correspondance » sans savoir lesquels — alors que c'est la seule
   * chose sur laquelle un lecteur peut agir. Reformuler un libellé
   * (« refroidissement » ne se comporte pas comme « eau de refroidissement »),
   * ou constater que l'arrêté de sa zone ne nomme jamais son usage principal :
   * les deux demandent de savoir DE QUEL usage on parle.
   */
  nonRapprochesLabels: string[];
  /** idem pour les rapprochements ambigus, écartés faute de pouvoir trancher */
  ambigusLabels: string[];
  /**
   * ⚠️ Les entrées qui adressent le site PAR SON STATUT et non par ses usages —
   * aujourd'hui les ICPE.
   *
   * Lu dans les arrêtés réels de la Moselle (data/restrictions/zones/57.json) :
   * sur 27 usages nommés, **aucun** ne parle de refroidissement, de procédé
   * industriel ni de sanitaires. Un site industriel y ressort donc couvert à
   * 20 % — et le rapprochement a RAISON de refuser. Mais l'industrie n'est pas
   * hors du champ pour autant : elle y entre en bloc, par « Exploitations des
   * installations classées pour la protection de l'environnement (ICPE) hors
   * élevage », dont la mesure est « des mesures sont mises en œuvre pour limiter
   * au maximum les prélèvements d'eau » — non chiffrée, donc `unquantified` au
   * sens de la note §3.2.
   *
   * ⚠️⚠️ Ces entrées sont CITÉES, jamais appliquées. Les rattacher au volume
   * orphelin serait une inférence que ce module refuse partout ailleurs, et
   * elle élargirait la fourchette au lieu de la resserrer. Ce champ ne touche
   * donc à AUCUN des compteurs ci-dessus : il explique la couverture, il ne la
   * change pas.
   */
  adressageCollectif: string[];
  /**
   * Share of the site's restrictable volume covered by a match, 0-1.
   *
   * ⚠️ THE figure that says whether a per-usage ρ is worth anything for this site.
   * Matching 4 usages out of 5 sounds good and means little if the unmatched one
   * carries 80 % of the volume.
   */
  partVolumeCouverte?: number;
  detail: string;
}

/**
 * How much of a site's usage vector the nomenclature actually covers.
 *
 * Reported before any per-usage ρ is applied, because a per-usage figure computed on
 * a third of the volume and presented as the site's figure would be worse than the
 * blended one it replaces.
 */
export function couvertureVecteur(
  usages: { usageCode?: string; part?: number; isExempt?: boolean }[],
  nomenclature: EntreeNomenclature[],
): CouvertureVecteur {
  let rapproches = 0;
  let nonRapproches = 0;
  let ambigus = 0;
  const nonRapprochesLabels: string[] = [];
  const ambigusLabels: string[] = [];
  let partTotale = 0;
  let partCouverte = 0;

  for (const u of usages) {
    // Exempt usages are excluded: no measure can restrict them, so whether they
    // match the nomenclature is irrelevant. Counting them would inflate coverage.
    if (u.isExempt) continue;
    const part = Number.isFinite(u.part) && (u.part ?? 0) > 0 ? u.part! : 0;
    partTotale += part;
    const r = rapprocherUsage(u.usageCode, nomenclature);
    // Le libellé retenu est celui que l'utilisateur a TAPÉ : c'est celui qu'il
    // reconnaîtra dans son formulaire, et celui qu'il peut changer.
    const libelle = (u.usageCode ?? "").trim();
    if (r.ambigu) {
      ambigus++;
      if (libelle) ambigusLabels.push(libelle);
    } else if (r.usage) {
      rapproches++;
      partCouverte += part;
    } else {
      nonRapproches++;
      if (libelle) nonRapprochesLabels.push(libelle);
    }
  }

  // Détecté sur la thématique publiée par le guide, pas sur le secteur déclaré
  // par l'utilisateur : l'anti-pattern n°5 interdit de brancher le moteur sur le
  // secteur, et le signal se trouve de toute façon dans l'arrêté lui-même.
  const adressageCollectif = [
    ...new Set(
      nomenclature
        .filter((e) => (e.thematique ?? "").toUpperCase().includes("ICPE"))
        .map((e) => e.usage),
    ),
  ];

  const partVolumeCouverte = partTotale > 0 ? partCouverte / partTotale : undefined;
  return {
    rapproches,
    nonRapproches,
    ambigus,
    nonRapprochesLabels,
    ambigusLabels,
    adressageCollectif,
    partVolumeCouverte,
    detail:
      partVolumeCouverte === undefined
        ? "Aucune part volumique déclarée : la couverture de la nomenclature ne peut pas être pondérée."
        : partVolumeCouverte >= 0.999
          ? "Tous les usages restreignables sont rapprochés de la nomenclature des arrêtés."
          : `${Math.round(partVolumeCouverte * 100)} % du volume restreignable est rapproché de la ` +
            `nomenclature. ⚠️ Le reste ne porte AUCUNE mesure : ce n'est pas un volume non ` +
            `restreint, c'est un volume dont on ne sait pas s'il l'est.`,
  };
}
