// Matching a declared usage to the arrêtés' nomenclature (§3.3).
// npx tsx scripts/test/nomenclature.test.ts
//
// ⚠️ Run against the REAL embedded nomenclature (data/restrictions/guide.json, 20
// entries), not a fixture. A matcher tested on labels I wrote myself would be
// tested on the phrasing I happened to imagine, and the whole difficulty here is
// that the guide's phrasing is not mine: it writes plurals, footnote digits inside
// words ("collectif13"), and sentence-long entries with parenthetical accords.

import { readFileSync } from "fs";
import {
  ECART_AMBIGUITE_USAGE,
  SEUIL_RAPPROCHEMENT,
  couvertureVecteur,
  nie,
  rapprocherUsage,
  recouvrement,
  tokens,
  type EntreeNomenclature,
} from "../../lib/nomenclature";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

const guide = JSON.parse(
  readFileSync("data/restrictions/guide.json", "utf-8"),
) as EntreeNomenclature[];

// ---- 0. The nomenclature is small enough to justify a simple matcher ----
{
  check("nomenclature: the embedded guide is loaded", guide.length > 0);
  // ⚠️ SPRINTS said this join "demande un échantillon lu à la main". Measured: 20
  // entries. Small enough to read in five minutes, which is why the matcher can be
  // simple and its failures readable — there is no long tail to hide in.
  check("nomenclature: 20 entries, hand-readable", guide.length === 20);
  check("nomenclature: every entry has a usage label", guide.every((e) => e.usage.length > 0));
}

// ---- 1. Tokenisation: the three things the guide's phrasing does ----
{
  check("tokens: accents and punctuation are removed",
    tokens("Arrosage des jardins potagers.").join(" ") === "arrosage jardin potager");
  // ⚠️ Footnote digits sit INSIDE words in the guide: "piscines à usage collectif13".
  // Left in, "collectif13" matches nothing a human would type.
  check("tokens: footnote digits inside a word are stripped",
    tokens("piscines à usage collectif13").includes("collectif"));
  // ⚠️ The guide writes plurals, operators write singulars. Without the crude
  // singularisation the two share only "arrosage" and fall under the threshold.
  check("tokens: plurals are folded onto singulars",
    tokens("golfs").join("") === tokens("golf").join(""));
  // ⚠️ "eau" appears in a third of the labels and in almost every free-text usage an
  // operator types. Kept, it would make everything match everything at a low score.
  check("tokens: 'eau' is treated as carrying no signal", !tokens("eau du site").includes("eau"));
  check("tokens: a label of only stop words yields nothing", tokens("de la pour").length === 0);
}

// ---- 2. Overlap divides by the SMALLER set, not the union ----
{
  const jaccard = (a: string[], b: string[]) => {
    const A = new Set(a);
    const B = new Set(b);
    if (A.size === 0 || B.size === 0) return 0;
    return [...A].filter((x) => B.has(x)).length / new Set([...a, ...b]).size;
  };

  // ⚠️ The example that carries the argument, chosen by MEASUREMENT and not by
  // intuition: an acronym against a sentence-long entry. Every word the user typed is
  // in the entry, and Jaccard rejects it purely for the entry's length.
  const icpe = tokens("ICPE");
  // ⚠️ Found by content, not by index: the guide is a REBUILT artifact and entry order
  // is not a contract. A positional `guide[10]` would break silently on the next build.
  const entreeIcpe = tokens(
    guide.find((e) => /\(ICPE\)/.test(e.usage))?.usage ?? "",
  );
  check("overlap: the ICPE entry is found by content, not by position", entreeIcpe.length > 0);
  check("overlap: a short label fully contained in a long one scores high",
    recouvrement(icpe, entreeIcpe) >= 0.99);
  check("overlap: … where Jaccard scores 0.20 and would have refused it",
    Math.abs(jaccard(icpe, entreeIcpe) - 0.2) < 0.01
      && jaccard(icpe, entreeIcpe) < SEUIL_RAPPROCHEMENT);

  // ⚠️ THE load-bearing measurement, and the reason this is a sweep rather than one
  // hand-picked pair: a single example can flatter either metric. Over 13 real queries
  // against the real guide, four are accepted here and refused under Jaccard.
  // A previous version of this test asserted the claim on « arrosage du golf », where
  // Jaccard scores 0.50 and would have ACCEPTED — the example proved nothing.
  const requetes = [
    "arrosage des espaces verts", "arrosage du golf", "lavage de véhicules en station",
    "abreuvement du troupeau", "remplissage de la piscine collective",
    "irrigation par aspersion", "navigation fluviale", "travaux en cours d'eau",
    "arrosage des terrains de sport", "nettoyage des trottoirs", "fontaine d'ornement",
    "prélèvement en canal", "ICPE",
  ];
  const meilleur = (q: string, f: (a: string[], b: string[]) => number) =>
    Math.max(...guide.map((e) => f(tokens(q), tokens(e.usage))));
  const acceptes = requetes.filter((q) => meilleur(q, recouvrement) >= SEUIL_RAPPROCHEMENT);
  const refusesParJaccard = requetes.filter(
    (q) => meilleur(q, recouvrement) >= SEUIL_RAPPROCHEMENT
      && meilleur(q, jaccard) < SEUIL_RAPPROCHEMENT,
  );
  check("overlap: all 13 real queries are accepted by the chosen metric",
    acceptes.length === requetes.length);
  check("overlap: … and Jaccard would have refused 4 of them",
    refusesParJaccard.length === 4);
  check("overlap: … the perfect subsets among them being ICPE and trottoirs",
    refusesParJaccard.includes("ICPE") && refusesParJaccard.includes("nettoyage des trottoirs"));

  check("overlap: nothing in common scores 0", recouvrement(tokens("navire"), tokens("golf")) === 0);
  check("overlap: an empty side scores 0", recouvrement([], tokens("golf")) === 0);
}

// ---- 2 bis. Negation, and the compound the tokeniser used to invent ----
{
  // ⚠️ Both checks below cover defects the FIRST run of this suite found. Neither was
  // hypothetical: the matcher shipped them until measured.

  // « piscine collective » scored 1.00 against « piscines NON collective » — the
  // opposite usage, at full confidence — because a bag of words has no polarity.
  check("negation: 'non' in a label is detected as negating it",
    nie(tokens("Remplissage et vidange de piscines non collective")) && !nie(tokens("piscine collective")));
  check("negation: a hyphenated 'non-' negates exactly like the spaced form",
    nie(tokens("piscine non-collective")));
  {
    const r = rapprocherUsage("remplissage de la piscine collective", guide);
    check("negation: the affirmative query reaches the COLLECTIF entry…",
      r.usage !== undefined && /collectif/i.test(r.usage));
    check("negation: … and the negating entry is not even offered as a candidate",
      !r.candidats.some((c) => /non collective/i.test(c.usage)));
    // The gate is one-directional: a negating query must still reach the negating entry.
    const rn = rapprocherUsage("remplissage de la piscine non collective", guide);
    check("negation: a negating query reaches the NON-COLLECTIVE entry instead",
      rn.usage !== undefined && /non collective/i.test(rn.usage));
  }

  // "micro-aspersion" was split into "micro" + "aspersion", inventing a token entry 13
  // does not contain, which tied it with entry 12 and made the match ambiguous.
  check("compound: 'micro-aspersion' is one token, not two",
    tokens("micro-aspersion").includes("microaspersion")
      && !tokens("micro-aspersion").includes("aspersion"));
  // ⚠️ …while a hyphen between two ordinary words still splits, so a user writing
  // "goutte-à-goutte" is not penalised for the punctuation they chose.
  check("compound: … but 'goutte-à-goutte' still splits, being no bound prefix",
    tokens("goutte-à-goutte").includes("goutte"));
  {
    const r = rapprocherUsage("irrigation par aspersion", guide);
    check("compound: 'irrigation par aspersion' is no longer falsely ambiguous",
      r.ambigu === false && r.usage !== undefined && /aspersion des cultures/i.test(r.usage));
    // The distinction is not cosmetic: the two entries carry different measures.
    check("compound: … and the localised-irrigation entry now scores strictly lower",
      (r.candidats.find((c) => /localisee|localisée/i.test(c.usage))?.score ?? 1) < (r.score ?? 0));
  }
}

// ---- 3. Real matches against the real guide ----
{
  const cas: [string, RegExp][] = [
    ["arrosage des espaces verts", /espaces arborés|espaces verts/i],
    ["arrosage du golf", /golfs/i],
    ["lavage de véhicules en station", /Lavage de véhicules en station/i],
    ["abreuvement du troupeau", /Abreuvement/i],
    ["remplissage de la piscine collective", /piscines à usage collectif/i],
    ["irrigation par aspersion", /Irrigation par aspersion/i],
    ["navigation fluviale", /Navigation fluviale/i],
    ["travaux en cours d'eau", /Travaux en cours d/i],
  ];
  for (const [saisi, attendu] of cas) {
    const r = rapprocherUsage(saisi, guide);
    check(`match: « ${saisi} » → ${attendu.source}`, r.usage !== undefined && attendu.test(r.usage));
  }
  const r = rapprocherUsage("arrosage du golf", guide);
  check("match: the trail names the score", /% de recouvrement/.test(r.detail));
  // ⚠️ The threshold is a judgement, and the trail must say so wherever a match is
  // applied — not only in the module's own comments.
  check("match: … and warns the threshold is uncalibrated", /non calibré/.test(r.detail));
  check("match: the thematique travels with the match", r.thematique === "Arrosage");
}

// ---- 4. What has NO entry gets NO measure ----
{
  // The nomenclature is about watering, car washing and livestock. An industrial
  // cooling circuit is not in it, and attaching a lawn-watering ban to one would be
  // the worst possible outcome — a plausible ρ nobody would question.
  for (const saisi of ["refroidissement du process", "eau ultrapure pour la lithographie"]) {
    const r = rapprocherUsage(saisi, guide);
    check(`refusal: « ${saisi} » is not matched`, r.usage === undefined);
    check(`refusal: … and says no measure is attached`,
      /Aucune mesure ne lui est attachée/.test(r.detail));
  }
  const r = rapprocherUsage("refroidissement du process", guide);
  // The refusal must explain WHERE such a usage is described instead, or it reads as
  // a dead end.
  check("refusal: … and points at what does describe it",
    /exemption|seuil technique/.test(r.detail));
  check("refusal: candidates are still returned for a human to look at",
    Array.isArray(r.candidats));

  check("refusal: an empty usage is 'nothing to match', not a failed match",
    rapprocherUsage("", guide).detail.includes("Aucun usage saisi"));
  check("refusal: a usage of only stop words asks for precision",
    /Précisez l'usage/.test(rapprocherUsage("de l'eau", guide).detail));
}

// ---- 5. Ambiguity is not resolved ----
{
  // Two watering entries in the guide are close: potagers and espaces verts. A bare
  // "arrosage" is equally near both.
  const r = rapprocherUsage("arrosage", guide);
  check("ambiguity: a bare 'arrosage' does not silently pick one entry",
    r.usage === undefined || r.ambigu);
  if (r.ambigu) {
    check("ambiguity: … and says the tool refuses to draw lots", /tirer au sort/.test(r.detail));
    check("ambiguity: … naming both candidates", (r.candidats.length ?? 0) >= 2);
  }
  check("ambiguity: the gap threshold is small enough to be meaningful",
    ECART_AMBIGUITE_USAGE > 0 && ECART_AMBIGUITE_USAGE < 0.2);
}

// ---- 6. Vector coverage: the share of VOLUME, not the count of usages ----
{
  const vecteur = [
    { usageCode: "arrosage des espaces verts", part: 0.15 },
    { usageCode: "lavage de véhicules en station", part: 0.05 },
    // The big one has no entry in the nomenclature.
    { usageCode: "refroidissement du process", part: 0.8 },
  ];
  const c = couvertureVecteur(vecteur, guide);
  // ⚠️ THE point of this function. Two usages out of three matched sounds like 67 %
  // coverage and is actually 20 % of the volume — and a per-usage ρ computed on 20 %
  // of the volume, presented as the site's figure, would be worse than the blended
  // one it replaces.
  check("coverage: 2 of 3 usages matched…", c.rapproches === 2 && c.nonRapproches === 1);
  check("coverage: … but only 20 % of the volume", Math.abs((c.partVolumeCouverte ?? 0) - 0.2) < 1e-9);
  check("coverage: and the uncovered share is called unknown, not unrestricted",
    /on ne sait pas s'il l'est/.test(c.detail));

  // Exempt usages are excluded: no measure can restrict them, so whether they match
  // is irrelevant, and counting them would inflate coverage.
  const avecExempt = couvertureVecteur(
    [
      { usageCode: "sanitaires", part: 0.9, isExempt: true },
      { usageCode: "arrosage des espaces verts", part: 0.1 },
    ],
    guide,
  );
  check("coverage: an exempt usage is excluded from the denominator",
    Math.abs((avecExempt.partVolumeCouverte ?? 0) - 1) < 1e-9);
  check("coverage: … and from the counts too", avecExempt.nonRapproches === 0);

  const complet = couvertureVecteur(
    [
      { usageCode: "arrosage des espaces verts", part: 0.5 },
      { usageCode: "abreuvement des animaux", part: 0.5 },
    ],
    guide,
  );
  check("coverage: a fully matched vector says so", /Tous les usages/.test(complet.detail));
  check("coverage: no declared share → no weighted coverage, rather than 0 %",
    couvertureVecteur([{ usageCode: "arrosage des espaces verts" }], guide)
      .partVolumeCouverte === undefined);

  // -------------------------------------------------------------------------
  // Les usages orphelins sont NOMMÉS (vu en ligne le 2026-08-13)
  // -------------------------------------------------------------------------
  // Un site industriel lisait « 1 usage rapproché · 2 sans correspondance »
  // sans savoir lesquels — alors que c'est la seule chose sur laquelle il peut
  // agir : reformuler un libellé, ou constater que l'arrêté de sa zone ne nomme
  // jamais son usage principal.
  {
    const industriel = couvertureVecteur(
      [
        { usageCode: "refroidissement", part: 70 },
        { usageCode: "arrosage des espaces verts", part: 20 },
        { usageCode: "sanitaires", part: 10 },
      ],
      guide,
    );
    check("orphelins: les usages sans correspondance sont nommés",
      industriel.nonRapprochesLabels.includes("refroidissement"));
    check("orphelins: … et pas seulement comptés",
      industriel.nonRapprochesLabels.length === industriel.nonRapproches);
    check("orphelins: l'usage rapproché n'y figure pas",
      !industriel.nonRapprochesLabels.includes("arrosage des espaces verts"));
    // ⚠️ La mesure du 2026-08-13, sur un vrai site : 20 % du volume couvert,
    // parce que le refroidissement porte 70 % du volume et ne correspond à
    // aucune mesure. Ce test la fige — si le rapprochement change un jour, on
    // saura que ce chiffre a bougé et pourquoi.
    check("orphelins: le refroidissement reste non rapproché — 20 % du volume couvert",
      industriel.partVolumeCouverte !== undefined
        && Math.round(industriel.partVolumeCouverte * 100) === 20);
  }

  // Un usage EXEMPTÉ est exclu du calcul : le présenter comme orphelin
  // laisserait croire qu'une mesure lui manque, alors qu'aucune ne le concerne.
  {
    const avecExempt = couvertureVecteur(
      [
        { usageCode: "arrosage des espaces verts", part: 50 },
        { usageCode: "procédé secret", part: 50, isExempt: true },
      ],
      guide,
    );
    check("orphelins: un usage exempté n'est pas listé comme sans correspondance",
      !avecExempt.nonRapprochesLabels.includes("procédé secret"));
  }

  // -------------------------------------------------------------------------
  // La cause, lue dans les arrêtés RÉELS d'un département (sprint 56)
  // -------------------------------------------------------------------------
  // ⚠️ Ce bloc lit `data/restrictions/zones/57.json` — les arrêtés de la Moselle
  // tels qu'ils sont embarqués — et non un bouchon. C'est ce qui a clos la
  // question ouverte par la capture du 2026-08-13 : le refroidissement n'est pas
  // mal rapproché, il n'est **nommé nulle part**.
  {
    const moselle = JSON.parse(readFileSync("data/restrictions/zones/57.json", "utf-8")) as Record<
      string,
      unknown
    >;
    const usagesMoselle = new Map<string, EntreeNomenclature>();
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) {
        for (const x of o) walk(x);
      } else if (o && typeof o === "object") {
        const rec = o as Record<string, unknown>;
        if (typeof rec.usage === "string" && !usagesMoselle.has(rec.usage)) {
          usagesMoselle.set(rec.usage, {
            usage: rec.usage,
            thematique: typeof rec.thematique === "string" ? rec.thematique : undefined,
          });
        }
        for (const [k, v] of Object.entries(rec)) if (k !== "_arretes") walk(v);
      }
    };
    walk({ ...moselle, _arretes: undefined });
    const nomenclatureReelle = [...usagesMoselle.values()];

    check("Moselle: les arrêtés nomment une nomenclature non vide",
      nomenclatureReelle.length >= 20);
    // La mesure qui a clos la question. Si un arrêté nommait un jour le
    // refroidissement, CE test échouerait — et ce serait la bonne nouvelle.
    check("Moselle: ⚠️ aucun usage ne nomme le refroidissement, le procédé ou les sanitaires",
      !nomenclatureReelle.some((e) =>
        /refroid|procéd|proced|sanitaire|industr/i.test(e.usage)));
    check("Moselle: mais une entrée ICPE adresse l'installation en bloc",
      nomenclatureReelle.some((e) => (e.thematique ?? "").toUpperCase().includes("ICPE")));

    const industriel = couvertureVecteur(
      [
        { usageCode: "refroidissement", part: 70 },
        { usageCode: "arrosage des espaces verts", part: 20 },
        { usageCode: "sanitaires", part: 10 },
      ],
      nomenclatureReelle,
    );
    check("Moselle: la couverture réelle du vecteur industriel est de 20 %",
      industriel.partVolumeCouverte !== undefined
        && Math.round(industriel.partVolumeCouverte * 100) === 20);
    check("Moselle: la ligne ICPE est signalée au lecteur",
      industriel.adressageCollectif.some((u) => /ICPE/.test(u)));
    // ⚠️⚠️ LE test de ce sprint : citer n'est pas rattacher. Si un jour la ligne
    // ICPE se mettait à combler le volume orphelin, la couverture passerait de
    // 20 % à 100 % et ce test tomberait — ce qui est exactement ce qu'on veut
    // d'un garde-fou contre une inférence silencieuse.
    check("Moselle: ⚠️ la citer ne change PAS la part de volume couverte",
      industriel.rapproches === 1
        && industriel.nonRapproches === 2
        && Math.round((industriel.partVolumeCouverte ?? 0) * 100) === 20);
  }

  // Sans entrée ICPE, aucune cause n'est inventée.
  {
    const sansIcpe = couvertureVecteur(
      [{ usageCode: "refroidissement", part: 100 }],
      guide.filter((e) => !(e.thematique ?? "").toUpperCase().includes("ICPE")),
    );
    check("cause: sans entrée ICPE, aucun adressage collectif n'est inventé",
      sansIcpe.adressageCollectif.length === 0);
  }
}

console.log(failures === 0 ? "nomenclature: all checks pass" : `nomenclature: ${failures} FAILED`);
if (failures > 0) process.exit(1);
