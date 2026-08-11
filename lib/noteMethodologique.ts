// The methodology note, GENERATED — ADR-006, anti-pattern n°7.
//
// ⚠️ Generated rather than written, and that is the whole point. Anti-pattern n°7
// is literally "adding auditability afterwards", and a hand-written methodology
// note is the purest form of it: it is accurate on the day it is written and
// silently wrong from the next commit. This file assembles the note from the
// structures the ENGINES themselves expose — the model version and its change log
// (lib/modele), the confidence assignment (lib/confiance), the jurisdiction and
// its reforms (lib/juridiction), the ρ typology (lib/restrictions) — so a change
// to the method changes the note in the same commit or not at all.
//
// It is attached to EVERY export. The note's §8 criterion for chantier 1 is "every
// figure traceable to its source document in one click"; a report that carries its
// own method is the half of that which does not need a network.

import { CONFIANCES, HORIZONS_CSRD, PREUVES } from "./confiance";
import { juridiction } from "./juridiction";
import { CHANGEMENTS_METHODE, MODELE_VERSION, modeleLigne } from "./modele";
import { RHO_MAX_UNQUANTIFIED, RHO_MIN_CONDITIONAL_BAN } from "./restrictions";

export interface NoteMethodologiqueOptions {
  /** ISO date of the report the note is attached to */
  generatedAt?: Date;
  /** heading level to start at, so it nests under a report's own hierarchy */
  niveauTitre?: 2 | 3;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

/**
 * The methodology note as Markdown, ready to append to any export.
 *
 * ⚠️ Every section here answers a question an auditor actually asks. Sections that
 * would only describe the code are left out: a methodology note that reads like
 * documentation is not read.
 */
export function noteMethodologique(options: NoteMethodologiqueOptions = {}): string {
  const h = options.niveauTitre ?? 2;
  const H = "#".repeat(h);
  const HH = "#".repeat(h + 1);
  const j = juridiction();
  const L: string[] = [];

  L.push(`${H} Note méthodologique`);
  L.push("");
  L.push(
    `**${modeleLigne()}** Cette note est **générée** à partir des structures que le moteur ` +
      `expose lui-même : elle ne peut pas se désynchroniser du calcul, contrairement à une note ` +
      `rédigée à côté.`,
  );
  L.push("");

  // --- 1. Three outputs, and only three ------------------------------------
  L.push(`${HH} Ce que l'outil publie`);
  L.push("");
  L.push(
    `Trois sorties, en trois unités différentes, **jamais combinées en un chiffre unique** : ` +
      `les **jours sous statut** (jours/an), le **volume non prélevable** (m³/an) et ` +
      `l'**interruption d'activité** (jours-équivalents d'arrêt/an). Un indicateur unique aurait ` +
      `dû choisir une unité et masquer les deux autres.`,
  );
  L.push("");
  L.push(
    `⚠️ Les deux composantes du volume non prélevable — **de crise** (ce que les arrêtés coûtent ` +
      `cette année) et **structurelle** (ce que la baisse programmée des volumes autorisés coûtera) ` +
      `— **ne s'additionnent pas**. Elles répondent à deux questions et, à l'horizon 2050, la ` +
      `seconde pèsera probablement davantage : les additionner masquerait le signal dominant.`,
  );
  L.push("");

  // --- 2. Confidence by output (ADR-004) -----------------------------------
  L.push(`${HH} Ce que chaque chiffre peut porter`);
  L.push("");
  L.push(
    `L'outil est **le plus fiable là où il est le moins précis**. Le tableau ci-dessous dit, ` +
      `sortie par sortie, quelle décision elle peut soutenir — et laquelle elle ne peut pas.`,
  );
  L.push("");
  L.push(`| Sortie | Confiance | Pourquoi | Usage légitime |`);
  L.push(`| --- | :---: | --- | --- |`);
  for (const c of CONFIANCES) {
    L.push(
      `| ${c.label} | **${c.niveau}** | ${c.motif.replace(/\n/g, " ")} | ${c.usage.replace(/\n/g, " ")} |`,
    );
  }
  L.push("");

  // --- 3. Evidence levels (§0.1, G8) ---------------------------------------
  L.push(`${HH} Niveaux de preuve`);
  L.push("");
  L.push(
    `Chaque chiffre porte l'un de ces trois niveaux. Ils disent **comment** il a été obtenu, ce ` +
      `qui est une question différente de « combien peut-il porter » ci-dessus.`,
  );
  L.push("");
  for (const p of Object.values(PREUVES)) {
    L.push(`- **${p.id} — ${p.label}.** ${p.quoi}`);
  }
  L.push("");
  L.push(
    `⚠️ **Deux natures, deux traitements** (arbitrage G8). Les **jours sous arrêté passés** sont ` +
      `un fait public opposable : les arrêtés sont publiés, ils restent affichés. Le **volume non ` +
      `prélevable et l'interruption reconstitués** sur l'historique sont des sorties de modèle, ` +
      `servant à calibrer et à contrôler : ils ne sont pas présentés comme des faits.`,
  );
  L.push("");

  // --- 4. Reading a measure: the ρ typology --------------------------------
  L.push(`${HH} Comment une mesure d'arrêté devient un chiffre`);
  L.push("");
  L.push(
    `Un arrêté ne dit pas « réduisez de 40 % ». Il dit « arrosage interdit entre 8 h et 20 h », ` +
      `« un jour sur deux », « tour d'eau », ou simplement « limiter les prélèvements non ` +
      `prioritaires ». Chaque mesure est lue et convertie en une **part de prélèvement empêchée** ` +
      `(notée ρ), et les dimensions quantifiées se composent : une interdiction 3 jours sur 7 ` +
      `entre 8 h et 20 h empêche davantage que chacune prise seule.`,
  );
  L.push("");
  L.push(
    `⚠️ **Une mesure non chiffrée n'est jamais imputée à une valeur unique.** Elle produit ` +
      `l'intervalle [0 ; ${pct(RHO_MAX_UNQUANTIFIED)}], et cet intervalle **se propage jusqu'au ` +
      `mètre cube affiché**. C'est pourquoi un chiffre peut se présenter en fourchette : la ` +
      `fourchette est l'information, pas un défaut de finition. Une interdiction conditionnelle ` +
      `(« sauf dérogation ») est plafonnée à ${pct(RHO_MIN_CONDITIONAL_BAN)} au minimum.`,
  );
  L.push("");
  L.push(
    `Trois catégories de mesures sont **comptées à part et n'entrent pas dans la moyenne** : les ` +
      `mesures illisibles (elles élargissent l'intervalle), les recommandations de sensibilisation ` +
      `(aucun volume perdu) et les obligations de déclaration (une charge de conformité, pas une ` +
      `réduction). Les confondre reviendrait à traiter une campagne d'affichage comme une ` +
      `restriction.`,
  );
  L.push("");

  // --- 5. Which level applies to a site (ADR-003) --------------------------
  L.push(`${HH} Quel niveau s'applique à un site`);
  L.push("");
  L.push(
    `${j.label} publie un niveau **par ressource** : eaux superficielles, eaux souterraines, eau ` +
      `potable. Un site n'est exposé qu'à celles dont il prélève. Le niveau effectif est donc ` +
      `**pondéré par la part de volume** tirée de chacune, et non pris au maximum : un site ` +
      `raccordé au réseau n'est pas en crise parce que la rivière l'est.`,
  );
  L.push("");
  L.push(
    `Quand la répartition par usage n'est pas renseignée, l'outil retombe sur le niveau le plus ` +
      `sévère — **et le signale** (mention « repli »). Quand plusieurs zones du même type couvrent ` +
      `le point, le rattachement est déclaré **ambigu** et les candidats sont listés : l'outil ne ` +
      `tranche pas à votre place.`,
  );
  L.push("");

  // --- 6. Jurisdiction and its reforms (G3, anti-pattern n°9) --------------
  L.push(`${HH} Cadre réglementaire retenu, et ses ruptures`);
  L.push("");
  L.push(
    `Périmètre : **${j.label}** uniquement. Les niveaux retenus sont ` +
      `${j.niveaux.map((n) => `\`${n}\``).join(", ")}, du moins au plus sévère. Le premier niveau ` +
      `porteur d'une **obligation** est \`${j.premierNiveauContraignant}\` : en dessous, il s'agit ` +
      `d'un appel à la modération, jamais compté comme une contrainte.`,
  );
  L.push("");
  L.push(
    `⚠️ **Ruptures de comparabilité.** Un décompte de jours de part et d'autre de ces dates ne se ` +
      `compare pas :`,
  );
  L.push("");
  for (const r of j.reformes) {
    L.push(`- **${new Date(r.date).toLocaleDateString("fr-FR")}** — ${r.quoi}`);
  }
  L.push("");
  L.push(
    `Un site hors de ce périmètre est **accepté dans le portefeuille, compté dans les effectifs, ` +
      `et marqué non couvert**. Aucun indicateur n'est produit pour lui et il ne compte pas pour ` +
      `zéro. Aucune source étrangère n'est substituée : mélanger deux méthodologies incomparables ` +
      `dans un même classement est exactement ce que l'ADR-004 interdit.`,
  );
  L.push("");

  // --- 7. Declared assumptions --------------------------------------------
  L.push(`${HH} Hypothèses déclarées`);
  L.push("");
  L.push(
    `- **κ = 1** (ADR-005) : le volume non prélevé est supposé **intégralement perdu**, sans ` +
      `substitution ni report. C'est une hypothèse **prudentielle**, nommée comme telle, et fausse ` +
      `dans la plupart des cas réels — mais fausse dans le sens prudent. Le chiffre publié est donc ` +
      `un volume **nominal**.`,
  );
  L.push(
    `- **Une donnée absente n'est jamais un zéro.** Quand une déclaration manque, l'outil refuse de ` +
      `calculer et dit laquelle manque. Un zéro se lirait « aucun risque ».`,
  );
  L.push(
    `- **Une source injoignable n'est pas une source muette.** « Le service n'a pas répondu » et ` +
      `« il n'y a rien à cet endroit » sont deux faits distincts, et un seul dit quelque chose sur ` +
      `le site.`,
  );
  L.push(
    `- **Aucune lacune d'archive n'est interpolée.** Les discontinuités sont étiquetées ; la ` +
      `première année réellement couverte est publiée et sert de dénominateur.`,
  );
  L.push(
    `- **Les scénarios climatiques ne se moyennent pas.** Les projections sont restituées en ` +
      `quantiles (q05 / médiane / q95) sous un narratif nommé, jamais en moyenne d'ensemble.`,
  );
  L.push("");
  L.push(
    `Chaque calcul produit en outre son **journal d'hypothèses propre**, au moment du calcul, qui ` +
      `voyage avec le chiffre jusqu'à ce rapport. Il est reproduit dans la section des trois ` +
      `sorties.`,
  );
  L.push("");

  // --- 8. CSRD horizons (§11.2) -------------------------------------------
  L.push(`${HH} Correspondance des horizons (CSRD / ESRS)`);
  L.push("");
  L.push(
    `L'outil raisonne en horizons opérationnels — « puis-je prélever en août » n'est pas « quel ` +
      `est mon risque de transition à moyen terme ». La correspondance est publiée pour qu'un ` +
      `auditeur n'ait pas à la deviner.`,
  );
  L.push("");
  L.push(`| Horizon HydroVigie | Horizon CSRD | Définition ESRS | Preuve |`);
  L.push(`| --- | --- | --- | :---: |`);
  for (const hz of HORIZONS_CSRD) {
    L.push(`| ${hz.produit} | ${hz.csrd} | ${hz.esrs} | ${hz.preuve} |`);
  }
  L.push("");

  // --- 9. Method changes --------------------------------------------------
  L.push(`${HH} Changements de méthode`);
  L.push("");
  L.push(
    `Un rapport portant la version **${MODELE_VERSION}** a été produit par la méthode décrite ` +
      `ci-dessus. Les entrées suivantes disent ce qui a changé depuis, et **dans quel sens** les ` +
      `chiffres déjà publiés en diffèrent — sans quoi un chiffre qui bouge parce que la méthode a ` +
      `changé se lit comme un risque qui a bougé.`,
  );
  L.push("");
  for (const c of CHANGEMENTS_METHODE) {
    const sens =
      c.sens === "baisse"
        ? "les chiffres antérieurs étaient généralement PLUS ÉLEVÉS"
        : c.sens === "hausse"
          ? "les chiffres antérieurs étaient généralement PLUS BAS"
          : c.sens === "les deux"
            ? "les chiffres ont pu bouger dans les DEUX SENS"
            : c.sens === "aucun"
              ? "aucun chiffre déjà publié n'est affecté"
              : "le sens du décalage n'a pas été mesuré";
    L.push(`- **${c.version}** (${new Date(c.date).toLocaleDateString("fr-FR")}) — ${c.quoi} `);
    L.push(`  *Sorties : ${c.sorties.join(", ")}. Effet : ${sens}.*`);
  }
  L.push("");

  // --- 10. Limits ---------------------------------------------------------
  L.push(`${HH} Limites connues`);
  L.push("");
  L.push(
    `- **Le volume de référence opposable pour les installations classées n'est pas implémenté.** ` +
      `L'arrêté du 30 juin 2023 le définit ; sa transcription reste à faire, et la trace du calcul ` +
      `le dit à chaque fois qu'un site ICPE est traité.`,
  );
  L.push(
    `- **Aucun contrôle a posteriori sur la métrique finale n'a encore été publié.** La ` +
      `validation d'un modèle sur son niveau d'alerte plutôt que sur la sortie qui intéresse ` +
      `l'utilisateur est un piège connu ; l'outil ne l'évite pas encore, il ne prétend simplement ` +
      `pas l'avoir évité.`,
  );
  // ⚠️ Measured on the real archive, 2026-08-11 (runs 31490333194 / 31491804305).
  // The +0.69 must never appear without the −1.16 next to it: reported alone it would
  // read as "the model works", which the second figure directly contradicts. Putting
  // it in the note that travels with every export is the only way a reader who never
  // opens the repository can know.
  L.push(
    `- **HydroVigie ne prévoit PAS l'évolution de votre niveau de restriction, et c'est mesuré.** ` +
      `Le modèle probabiliste (niveau de preuve N2) a été ajusté le 11 août 2026 sur l'archive ` +
      `réelle des arrêtés — 10 221 zones, 5,4 millions de journées observées depuis 2011. Résultat : ` +
      `comparé à une simple moyenne historique, il paraît excellent (gain de 0,69 point de score de ` +
      `Brier, sur 100 départements testés un par un, sans en perdre aucun). **Ce chiffre est ` +
      `trompeur et le contrôle le montre** : une restriction dure, donc « demain comme aujourd'hui » ` +
      `suffit déjà à battre une moyenne. En notant la même prévision sur les seules 67 335 journées ` +
      `où le niveau a réellement CHANGÉ, le gain devient **−1,16, et le modèle perd dans les 100 ` +
      `départements**. Autrement dit : sur la question « mon niveau va-t-il empirer ? », il fait ` +
      `**moins bien** qu'une moyenne historique. Aucun chiffre publié par l'outil n'en dépend ` +
      `aujourd'hui, et aucun n'en dépendra avant que ce contrôle soit repassé.`,
  );
  // ⚠️ Rewritten after the fifth state was actually added and measured (run 31495086087).
  // The previous version said the model "cannot say anything about the onset" because the
  // state did not exist — an explanation. It now exists, and the model still cannot: a
  // MEASUREMENT, which is a stronger and more useful thing to tell a reader.
  L.push(
    `- **Le déclenchement d'une restriction n'est pas prévu davantage, et cela a été vérifié en ` +
      `ajoutant ce qui manquait.** Le modèle ne décrivait au départ que le passage d'un niveau ` +
      `d'arrêté à un autre : l'état « aucune restriction » n'existait pas, donc l'arrivée d'une ` +
      `première restriction ne pouvait même pas être représentée. Cet état a été ajouté et ajusté ` +
      `sur l'archive réelle (2 844 zones, 100 départements, 6 millions de journées dont 73 % sans ` +
      `arrêté). Résultat : sur les 14 723 journées où une zone est effectivement passée de « libre » ` +
      `à « sous arrêté », le modèle reste **moins bon qu'une simple moyenne historique, dans les 100 ` +
      `départements**. Rendre l'événement représentable ne l'a pas rendu prévisible. La cause n'est ` +
      `donc pas là : elle est que ce modèle ne regarde **aucune donnée hydrologique** — ni pluie, ni ` +
      `débit, ni niveau de nappe — et que rien en lui ne peut savoir qu'il ne pleut pas.`,
  );
  // ⚠️ Third measurement, run 31498428653. Kept as its own bullet because it is the one a
  // sceptical reader will reach for on their own ("surely knowing the season helps?") — and
  // the answer is that it was tried, it does not, and the reason is instructive.
  L.push(
    `- **Et savoir la saison n'y change rien, ce qui a aussi été mesuré.** L'objection naturelle est ` +
      `qu'une restriction est un événement d'été : le modèle a donc été refait avec une matrice par ` +
      `mois. Le mois est bien un signal très fort — la probabilité qu'une zone passe sous arrêté vaut ` +
      `**0,010 % par jour en janvier contre 1,479 % en juillet**, soit 148 fois plus. Et pourtant, ` +
      `comparé à une moyenne historique **calculée mois par mois** (la seule comparaison honnête, ` +
      `puisqu'un modèle qui connaît les saisons doit affronter une référence qui les connaît aussi), ` +
      `le gain reste **négatif dans les 100 départements**. La raison est simple à dire : le mois ` +
      `renseigne sur le **rythme** — combien d'arrêtés en juillet — et pas sur la **date** : tous les ` +
      `jours de juillet reçoivent le même chiffre. Prévoir « quel jour » demande une information qui ` +
      `change d'un jour à l'autre, et l'outil n'en a aucune.`,
  );
  L.push(
    `- **Les fréquences par niveau se lisent « parmi les journées sous restriction »**, jamais ` +
      `« parmi les journées de l'année », sauf mention explicite du contraire.`,
  );
  L.push(
    `- **Le profil horaire d'un prélèvement est subi, pas modélisé.** Une interdiction horaire est ` +
      `comptée en fraction de journée, ce qui suppose un prélèvement uniforme sur les 24 heures.`,
  );
  L.push(
    `- **La traçabilité s'arrête au NUMÉRO d'arrêté, pas à son PDF.** Chaque mesure lue porte le ` +
      `numéro de l'arrêté dont elle sort, ce qui en fait une **référence citable** : un lecteur peut ` +
      `demander le document par ce numéro. Le critère « traçable jusqu'au PDF source en un clic » ` +
      `n'est donc **pas tenu**, et c'est une décision assumée : le jeu de données publie un numéro et ` +
      `non une URL, et il n'existe pas de résolution numéro → document publique et stable. Mieux vaut ` +
      `une référence exacte qu'un lien qui se casse.`,
  );
  L.push(
    `- **Ces informations ne se substituent pas aux arrêtés préfectoraux** : seul le texte de ` +
      `l'arrêté fait foi.`,
  );
  L.push("");

  return L.join("\n");
}
