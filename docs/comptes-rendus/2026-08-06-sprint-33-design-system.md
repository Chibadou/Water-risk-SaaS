# Compte rendu — Design system et honnêteté visuelle (Sprint 33)

**Date** : 2026-08-06 · **Branche** : `claude/project-ui-ux-audit-b7e8a3` · **Sprint** : 33

---

## 1. La question initiale

> Tu vas désormais agir en tant qu'expert UI/UX pour cette session.
> Réalise un audit de ce projet pour améliorer son UI/UX (carte blanche, avec un oeil neuf)
> Ensuite pose moi des questions pour l'améliorer ensemble.

**Ce que j'ai compris** : produire un audit UI/UX du produit tel qu'il est, sans hériter de l'ordre
historique des sprints, puis arbitrer avec l'utilisateur les suites à donner. L'audit a rendu dix
constats (P1→P10) ; quatre questions ont été posées, puis deux autres sur les décisions
structurantes. Ce sprint 33 est le **premier des cinq** décidés à l'issue de ces échanges.

**Arbitrages retenus par l'utilisateur** : refonte de la fiche site avec **synthèse rédigée +
sommaire latéral collant** (page unique, donc imprimable et cherchable au Ctrl+F, ce qui compte
pour un rapport ESG) ; design system léger avec identité ; **pas de mode sombre** ; badge « Démo —
Sprint 32 » remplacé par une mention de fraîcheur ; **audit traité en plusieurs sprints**.

**Ce que j'ai délibérément laissé de côté** dans ce sprint : tout ce qui relève des sprints 34→37
(réordonnancement de la fiche site, squelettes de chargement, accessibilité, ancres de
méthodologie). En particulier, `focus-visible`, le lien d'évitement et `prefers-reduced-motion`
auraient pu tenir dans `globals.css` ici — je les ai laissés au sprint 36 pour que le découpage
annoncé reste lisible, quitte à rouvrir `globals.css` une seconde fois.

**Écart assumé au plan** : le plan disait « le mode sombre est hors périmètre, et pas de variables
préparatoires non plus ». Les tokens posés ici sont **sémantiques** (`--color-ink-subtle` plutôt que
`slate-500`), ce qui rendrait un thème sombre plus facile un jour — mais ce n'est pas de
l'échafaudage pour le sombre : c'est ce qui permet de corriger un contraste en un endroit au lieu de
69. Aucune variable de thème sombre n'a été écrite.

---

## 2. Ce qui a été réalisé

**En une phrase** : l'interface distingue désormais à l'œil ce que le code distinguait déjà en
interne — un **fait réglementaire opposable**, une **estimation HydroVigie**, une **projection
incertaine**, un **encart pédagogique** — et le texte de détail repasse au-dessus du seuil de
contraste WCAG AA.

**Dans les grandes lignes** :

- **Le produit n'avait aucune frontière visuelle entre ses natures d'énoncé.** 31 blocs répétaient
  à l'identique `rounded-xl border border-slate-200 bg-white shadow-sm` : un arrêté préfectoral
  ressemblait exactement à un chiffre modélisé par l'outil, et exactement à une projection 2050.
  `components/ui/Panel.tsx` porte cette distinction en quatre variantes, appliquées aux 31 blocs.
- **69 occurrences de `text-slate-400` (#94a3b8) tombaient à ≈ 2,9:1 sur blanc**, sous le 4,5:1 de
  WCAG AA, et servaient précisément aux lignes de détail d'un rapport de risque (unités,
  fourchettes, « non estimé »). Des **tokens sémantiques** remplacent la palette brute, et la
  couleur fautive a disparu du vocabulaire.
- **17 fragments en 10-11 px** ont été ramenés au plancher, lui-même relevé : `--text-xs` passe de
  12 px à **13 px**.
- **Le défaut d'espacement de `RessourcePanel` est corrigé** (P3) : le bloc était collé au bas de la
  projection 2050 faute de `mt-8`, et son titre était un `h3 text-sm` là où ses pairs sont des
  `h2 text-lg` — il *avait l'air* d'un sous-bloc de la projection alors qu'il répond à une autre
  question.
- **Le badge « Démo — Sprint 32 » est remplacé** par la cadence de rafraîchissement de la source
  (voir §3 pour la contrainte d'honnêteté qui a façonné la formulation).
- **Deux chiffres faux dans la copie** : la page d'accueil et la méthodologie annonçaient une
  fenêtre d'historique de **5 ans** alors qu'elle est passée à **10 ans au sprint 22** et a été
  vérifiée à `windowYears: 10` en production. Le README annonçait « État actuel (Sprint 10) ».

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `components/ui/Panel.tsx` | neuf | Le cadre unique de l'application. `variant` (`reglementaire` / `modele` / `projection` / `pedagogie`) rend visible la nature de l'énoncé ; `tag` est **opt-in** ; `titleAs` tient la hiérarchie de titres ; `ariaLabel` et `id` préservent les landmarks et préparent les ancres du sprint 37. |
| `app/globals.css` | modifié | Bloc `@theme` Tailwind 4 : tokens de surface, de trait et **trois tokens de texte** dont les ratios sont commentés dans le fichier. `--text-xs` relevé à 13 px. |
| `components/ResultPanel.tsx` | modifié | La réponse VigiEau passe en `reglementaire` (liseré d'accent) et porte une note de source sur la cadence j-1. |
| `components/RessourcePanel.tsx` | modifié | `mt-8` + `h2` : correction du défaut P3. |
| `components/Shell.tsx` | modifié | Badge de sprint → mention de fraîcheur de la source. |
| 26 autres composants | modifiés | Migration des 31 cartes vers `<Panel>` et passage aux tokens de couleur. |
| `components/Landing.tsx`, `app/methodologie/page.tsx`, `README.md` | modifiés | Correction de « 5 ans » → « 10 ans » et de l'entête du README. |
| `docs/AUDIT-UI-UX.md` | neuf | L'audit complet (P1→P10), avec les preuves chiffrées et les fichiers concernés. |
| `package.json` | modifié | `playwright` ajouté en devDependency — la suite e2e était sinon injouable depuis un checkout propre (aucun workflow CI ne l'installe). |

**Mesures avant / après**, comptées sur `components/*.tsx` et `app/**/*.tsx` :

| Motif | Avant | Après |
| --- | --- | --- |
| `text-slate-400` (≈ 2,9:1 sur blanc) | **69** | **0** |
| `text-[10px]` + `text-[11px]` | **17** | **0** |
| `rounded-xl border border-slate-200 bg-white` répété | **31** | **0** (31 `<Panel>`) |

---

## 3. Erreurs potentielles

**Bug trouvé et corrigé pendant la session — attrapé par l'e2e, pas par moi.** La migration de
`PortfolioExecutiveSummary` vers `<Panel>` a **supprimé son `aria-label="Synthèse du portefeuille"`**,
parce que `Panel` ne le transmettait pas. Un `<section>` ne devient un *landmark* qu'une fois nommé :
la région disparaissait donc silencieusement de la liste des repères du document. Le test
`getByRole("region", { name: "Synthèse du portefeuille" })` a échoué en 15 s. Corrigé à la source
(prop `ariaLabel` sur `Panel`, plus `id` dans la foulée) et non au point d'appel, pour que les
prochaines migrations ne puissent pas refaire la même perte. **C'est exactement le genre de
régression qu'une revue visuelle n'aurait jamais vue** : la page était identique à l'écran.

**Non vérifié en conditions réelles :**

- **La fiche site avec des résultats n'a jamais été vue.** L'egress est bloqué en bac à sable : sur
  `/`, aucune adresse ne se géocode, donc **aucun** des blocs migrés de la fiche site
  (`ResultPanel`, `ScorePanel`, `InterruptionPanel`, `AnticipationPanel`, `SiteIndicators`,
  `Projection2050`, `RessourcePanel`, `TransitionRiskPanel`, `BnpePanel`) n'a été rendu avec ses
  données. **Ce sont 9 des 12 blocs du sprint.** Les captures prises en 1280×900 et 390×844 ne
  couvrent que `/`, `/sites` et `/methodologie` **à vide**. La correction d'espacement de
  `RessourcePanel` (P3), en particulier, est **raisonnée sur le code et non constatée à l'écran**.
  À vérifier sur la preview Vercel avant toute mise en prod.
- **Les ratios de contraste sont calculés, pas mesurés par un outil.** `#64748b` sur `#ffffff` donne
  4,79:1 et `#475569` 7,0:1 d'après la formule WCAG ; aucun analyseur n'a été passé sur les pages
  rendues. Les paires **texte sur fond coloré** (badges de gravité, encarts ambre, classes WRI) n'ont
  **pas** été revues du tout — elles gardent leur palette d'origine.
- **Le rendu des quatre variantes côte à côte n'a jamais été observé.** `projection` (trait
  discontinu) et `pedagogie` (fond teinté) n'apparaissent que sur la fiche site et dans
  `TransitionRiskPanel`, donc dans la zone invisible en bac à sable. Rien ne garantit encore que les
  quatre se distinguent réellement au premier coup d'œil — c'est pourtant toute la raison d'être du
  composant.

**Hypothèses qui pourraient ne pas tenir :**

- **Le relèvement de `--text-xs` de 12 à 13 px est global.** Il touche les 146 usages de `text-xs`,
  y compris dans des zones denses jamais revues à cette taille : en-têtes du tableau de bord,
  légende du calendrier saisonnier, popups de la carte MapLibre. Un débordement quelque part est
  possible ; aucun n'a été constaté sur les trois pages rendues.
- **La correspondance `slate-700`/`slate-800` → `ink-muted`/`ink` allège légèrement deux graisses de
  gris** (slate-700 → slate-600). C'est un choix de vocabulaire — trois tokens de texte plutôt que
  six — et non une correction de contraste : les deux valeurs d'origine passaient déjà AA.
- **La mention de fraîcheur est une affirmation sur VigiEau, pas sur la page.** Voir ci-dessous.

**Ce qui casserait si une source amont changeait :** si VigiEau cessait de publier quotidiennement,
le badge « mise à jour quotidienne (j-1) » deviendrait faux **sans que rien dans le code ne le
détecte** — c'est une constante de texte, pas une mesure. C'est la limite assumée du compromis
décrit juste après.

**Sur le badge de fraîcheur — j'ai signalé un désaccord et proposé un découpage.** La demande était
de remplacer « Démo — Sprint 32 » par la fraîcheur des données. Or `ZonesResponse`
(`lib/types.ts:51`) **ne porte aucun horodatage**, et aucune réponse amont n'en fournit : écrire
« à jour au 6 août 2026 » aurait été **inventer un fait**, ce que ce dépôt s'interdit partout
ailleurs. La demande a donc été honorée en deux énoncés vérifiables plutôt qu'un seul faux : (a)
dans `Shell`, la **cadence de publication de la source**, qui est documentée et vraie
indépendamment de la page ; (b) sur la fiche site, la **date réelle** de l'arrêté en vigueur, qui
existe déjà dans la donnée (`zone.arrete.dateDebutValidite`) et était déjà affichée par `ZoneCard`.

---

## 4. Points d'amélioration

**Dette assumée :**

- **Le lecteur n'a nulle part la légende des quatre variantes.** Chaque panneau porte sa pastille
  (« Fait réglementaire », « Estimation HydroVigie », « Projection »), ce qui est auto-suffisant
  bloc par bloc, mais rien n'explique le système. Sa place naturelle est la synthèse de tête du
  sprint 34, ou une section de méthodologie au sprint 37.
- **`tag` est posé à la main, panneau par panneau.** C'était voulu — automatique, il aurait mis une
  pastille sur chaque sous-carte imbriquée — mais rien n'empêche un futur panneau d'oublier la
  sienne, ou de la mettre deux fois dans une même colonne.
- **La mention de fraîcheur reste masquée sous 640 px** (`hidden sm:inline`, hérité du badge
  d'origine). Elle porte maintenant une information utile, donc le masquage se défend moins bien
  qu'avant ; l'information reste présente dans le pied de page.

**À reprendre :**

- **6 panneaux ont perdu leur `<h3>` au profit d'un `eyebrow`** (`ScorePanel`, `SiteIndicators`,
  `PortfolioExecutiveSummary`…) : `eyebrow` rend un `<p>`, pas un titre. Le plan d'ensemble du
  document s'en trouve **appauvri**, alors que le sprint prétend l'améliorer. À arbitrer au sprint
  34, quand les chapitres seront posés — probablement en rendant `eyebrow` capable d'être un titre.
- **`padding` est une prop de classe Tailwind brute** (`padding="p-0"`). Ça marche, mais ça laisse
  passer n'importe quelle chaîne et contourne l'idée même du composant. Une énumération
  (`dense` / `normal` / `none`) vaudrait mieux.
- **`Projection2050` reste le seul bloc à ne pas afficher son cadre `projection` autour de tout son
  contenu** : les encarts `ThresholdInsight` et `BenchmarkInsight` sont des sous-cartes à cadre plein
  à l'intérieur d'un cadre discontinu. Cohérent avec la règle « pas de pastille sur les sous-cartes »,
  mais visuellement à revoir une fois la page vue en vrai.

---

## 5. État Git

- **Branche de session** : `claude/project-ui-ux-audit-b7e8a3` — commit de ce sprint : voir
  `git log -1` (le hash est écrit après validation des vérifications ci-dessous).
- **`main` touché ?** : **NON**. Aucun merge, aucune demande de mise en prod. La branche attend une
  revue et une preview Vercel.
- **Déployé en prod ?** : **non**. Aucune vérification sur déploiement réel n'a été faite (§3).
- **Vérifications passées** :
  - `npm run build` — **succès** (compilation en 4,6 s, 24 routes)
  - `npm run lint` — **clean**, aucun avertissement
  - **18 suites de tests au vert, 0 en échec** (`scripts/test/*.test.ts` via `npx tsx`)
  - **60/60 e2e** (`node scripts/test/e2e.mjs` contre `next start -p 3200`), après correction du
    `aria-label` décrite en §3 — l'exécution **avant** correction était à 1 échec bloquant
  - `npx tsc --noEmit` — aucune erreur dans `components/` ni `app/` (une erreur préexistante et non
    liée subsiste dans `scripts/test/report.test.ts`, drapeau d'expression régulière `es2018`)
  - **Rendu observé** en 1280×900 et 390×844 sur `/`, `/sites` et `/methodologie` — pages à vide,
    voir la limite en §3

⚠️ **Piège d'environnement rencontré, à noter pour la prochaine session** : après un `npm run build`,
un `next start` déjà lancé continue de servir **l'ancien manifeste de chunks** et la page casse en
`ChunkLoadError` — l'e2e échoue alors sur des sélecteurs sans rapport (« nav badge shows 2 »), ce qui
envoie chercher un bug d'interface inexistant. Il faut **tuer le serveur par son PID puis le
relancer** après chaque build ; `pkill -f "next start"` ne suffit pas, le processus réel s'appelle
`next-server`.

---

## 6. Prochaines étapes

Par valeur décroissante, avec leur verrou :

1. **Voir la fiche site avec des données réelles** (preview Vercel). *Verrou* : rien à coder, mais
   tant que ce n'est pas fait, 9 des 12 blocs migrés restent non constatés, et la correction P3 avec
   eux. C'est la première chose à faire, avant d'empiler le sprint 34 par-dessus.
2. **Sprint 34 — synthèse rédigée + sommaire latéral collant** (P1, P9). *Verrou* : dépend du point 1
   pour ne pas réordonner à l'aveugle des blocs dont on n'a jamais vu le rendu peuplé.
3. **Sprint 35 — squelettes de chargement** (P2). *Verrou* : les hauteurs des squelettes doivent
   correspondre aux hauteurs réelles des blocs, donc dépend elle aussi du point 1.
4. **Sprint 36 — accessibilité** (P4, P5, P8). *Verrou* : aucun, tout est mesurable hors ligne —
   c'est le sprint le plus autonome des quatre, il pourrait passer avant les autres si la preview
   tardait.
5. **Sprint 37 — ancres de méthodologie** (P6). *Verrou* : aucun. `Panel` accepte déjà un `id`,
   la moitié du chemin est faite.
6. **Revoir les contrastes sur fond coloré** (badges de gravité, encarts ambre, classes WRI) —
   explicitement **non traités** ici. *Verrou* : la palette de gravité est partagée avec MapLibre
   (`lib/gravite.ts`), donc la toucher déplace aussi les couleurs de la carte.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Cette application dit à une entreprise si l'eau va lui manquer sur un de ses sites. Pour cela elle
mélange trois choses très différentes : ce que le préfet a **écrit dans un arrêté** (c'est du droit,
on peut le citer devant un juge), ce que l'application **calcule elle-même** à partir de dix ans
d'historique (c'est une estimation, elle peut se tromper), et ce que des modèles climatiques
**projettent pour 2050** (c'est une tendance, personne ne sait vraiment).

À l'écran, ces trois choses avaient exactement la même apparence : un rectangle blanc, un liseré
gris, une petite ombre. Trente et une fois le même rectangle. Un lecteur pressé ne pouvait donc pas
savoir lequel des chiffres il avait le droit d'écrire dans un rapport officiel et lequel était une
supposition maison. Le code, lui, faisait très soigneusement la différence en interne — il n'en
disait simplement rien à l'écran.

Deuxième problème, plus bête : une bonne partie du texte fin était écrite dans un gris trop clair
pour être lisible confortablement, y compris les mentions « donnée non estimée » — c'est-à-dire
exactement les phrases qu'il ne faut pas rater.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| VigiEau | Le service public qui publie, chaque jour, quelles zones de France sont en restriction d'eau et à quel niveau. |
| Arrêté préfectoral | Le texte de loi local qui décrète la restriction. C'est lui qui fait foi, pas notre application. |
| Zone SUP / SOU / AEP | Trois familles de zones de restriction : eaux de surface (rivières), eaux souterraines (nappes), eau potable. |
| VCN10, IPS | Deux indicateurs chiffrés de l'état d'un cours d'eau et d'une nappe. Ici, seulement des exemples de « chiffres calculés ». |
| WCAG AA | La norme d'accessibilité du web. Elle exige qu'un texte normal ait un contraste d'au moins **4,5:1** avec son fond. |
| Ratio de contraste | Un nombre entre 1:1 (invisible) et 21:1 (noir sur blanc) mesurant l'écart de luminosité entre deux couleurs. |
| Tailwind | La bibliothèque de style utilisée ici : au lieu d'écrire du CSS, on empile des classes courtes (`p-5` = padding, `text-sm` = petit texte). |
| Token (jeton de design) | Une variable de style nommée par son **rôle** (« la couleur du texte discret ») et non par sa valeur (« gris 400 »). |
| `@theme` | Le bloc où Tailwind 4 déclare ces variables. Chaque variable y devient automatiquement une classe utilisable. |
| Landmark ARIA | Une région de page qu'un lecteur d'écran annonce et permet d'atteindre directement. Une `<section>` n'en devient une **que si elle a un nom**. |
| e2e (end-to-end) | Un test qui pilote un vrai navigateur sur l'application réelle, par opposition à un test qui n'appelle qu'une fonction. |

### 7.3 Comment le code s'y prend

**Étape 1 — nommer les couleurs par leur rôle.** Avant, chaque composant écrivait `text-slate-400`,
c'est-à-dire « le gris numéro 400 de la palette ». 69 fois. Pour corriger un contraste, il fallait
donc modifier 69 endroits — et n'en oublier aucun. Le fichier `app/globals.css` déclare maintenant
des rôles :

```css
/* app/globals.css */
@theme {
  --color-ink: #0f172a;        /* 16.9:1 — titres, chiffres */
  --color-ink-muted: #475569;  /*  7.0:1 — texte courant   */
  --color-ink-subtle: #64748b; /*  4.8:1 — la couleur discrète */
}
```

Chaque ligne porte son ratio en commentaire, parce que c'est **le** chiffre qui décide si la couleur
a le droit d'exister. `#94a3b8` (l'ancien `slate-400`, à 2,9:1) n'apparaît nulle part : il n'est pas
« déconseillé », il est absent du vocabulaire. Tailwind transforme ces variables en classes, et les
composants écrivent désormais `text-ink-subtle`. Corriger un contraste redevient un geste unique.

**Étape 2 — donner un cadre unique à l'application, avec quatre variantes.** Le nouveau fichier
`components/ui/Panel.tsx` tient la liste des apparences possibles :

```tsx
// components/ui/Panel.tsx
const FRAME: Record<PanelVariant, string> = {
  reglementaire:
    "rounded-xl border border-line bg-surface shadow-sm border-l-4 border-l-brand",
  modele: "rounded-xl border border-line bg-surface shadow-sm",
  projection: "rounded-xl border border-dashed border-line-strong bg-surface shadow-sm",
  pedagogie: "rounded-xl border border-line bg-canvas",
};
```

Lisez les différences, elles sont volontairement **sémantiques et pas décoratives** :

- `reglementaire` ajoute un **liseré bleu épais à gauche** (`border-l-4`). C'est le bloc qu'on a le
  droit de citer.
- `projection` utilise un **trait discontinu** (`border-dashed`). Le contour d'une chose incertaine
  ne doit pas avoir l'air solide.
- `pedagogie` **enlève l'ombre** et teinte le fond : le bloc recule au lieu d'avancer.

Et chaque variante peut afficher une étiquette qui **dit en toutes lettres** ce que le cadre suggère :

```tsx
const TAG_LABEL: Record<PanelVariant, string | null> = {
  reglementaire: "Fait réglementaire",
  modele: "Estimation HydroVigie",
  projection: "Projection",
  pedagogie: null,
};
```

C'est important : si l'information n'existait que dans la **forme du trait**, elle serait invisible
pour un daltonien et pour quiconque n'a pas appris le code. Le texte, lui, se lit toujours.

**Étape 3 — le point d'appel.** Côté composant, la réponse officielle de VigiEau devient :

```tsx
// components/ResultPanel.tsx
<Panel
  variant="reglementaire"
  eyebrow="Site analysé"
  title={address.label}
  titleAs="h2"
  aside={<GraviteBadge niveau={worst} />}
  source="Situation officielle VigiEau, rafraîchie quotidiennement (j-1).
          Seul le texte de l'arrêté fait foi."
>
```

`titleAs="h2"` mérite un mot : ce n'est pas de la mise en forme, c'est la **structure du document**.
Un lecteur d'écran construit un sommaire à partir des `h1`/`h2`/`h3` ; se tromper de niveau, c'est
publier un livre dont la table des matières est fausse. C'est d'ailleurs ce défaut-là que corrige
`RessourcePanel`, qui s'annonçait en `h3` alors qu'il est un chapitre.

**Étape 4 — la donnée circule ainsi.** VigiEau → route serveur `/api/zones` → état React de
`HomeClient` → props de `ResultPanel` → `Panel variant="reglementaire"` → un rectangle à liseré bleu
portant l'étiquette « Fait réglementaire ». Le chiffre n'a pas changé de valeur en route ; ce qui a
changé, c'est que son **statut épistémique** est maintenant visible à l'arrivée.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Pourquoi un composant, et pas simplement une classe CSS partagée ?** Une classe
`.panel--reglementaire` aurait unifié l'apparence, mais chaque appelant aurait continué d'écrire son
titre à la main — donc de choisir son niveau (`h2` ? `h3` ?) et sa taille au hasard, ce qui est
précisément l'origine du défaut de `RessourcePanel`. Le composant **impose la structure** en même
temps que l'apparence.

**Pourquoi une étiquette optionnelle plutôt qu'automatique ?** Une pastille « Estimation
HydroVigie » sur chaque sous-carte imbriquée aurait produit une page bruyante où personne ne lit
plus rien. La règle retenue est : l'étiquette au niveau du chapitre, jamais sur ses sous-cartes.
Le prix, honnêtement, c'est qu'on peut l'oublier — c'est écrit dans les points d'amélioration.

**Pourquoi ne pas avoir laissé `text-xs` à 12 px ?** Parce que 146 fragments de cette application
sont en `text-xs`, et que ce sont les lignes qui portent les réserves : « fourchette 12-38 j »,
« non estimé », « service injoignable ». Un rapport de risque dont les réserves sont illisibles est
un rapport qui ment par omission. 13 px reste compact, mais franchit le seuil du confort.

**Pourquoi avoir refusé d'écrire « à jour au 6 août 2026 » ?** C'était pourtant la formulation la
plus naturelle. Mais aucune réponse de VigiEau ne porte d'horodatage : la seule date qu'on aurait pu
afficher est **celle du navigateur du lecteur**, qui ne dit rien de la donnée. Ç'aurait été un
chiffre juste d'apparence et faux en substance — le contraire de ce que ce dépôt fait partout
ailleurs (« une donnée absente n'est jamais un zéro »). D'où deux énoncés vrais à la place d'un seul
faux : la **cadence** de la source dans l'en-tête, la **date réelle de l'arrêté** sur la fiche.

**Pourquoi trois tokens de texte et pas six ?** `slate-700` et `slate-800` passaient déjà le seuil
de contraste : les garder aurait été défendable. Mais six gris, c'est six décisions à reprendre à
chaque nouveau composant, et personne ne se souvient de la nuance entre 600 et 700. Trois rôles —
titre, texte, discret — se retiennent. C'est un choix de vocabulaire, pas de conformité, et il est
signalé comme tel en §3.

### 7.5 Pour expérimenter soi-même

**a) Voir le système de variantes en action.** Dans `components/ResultPanel.tsx`, remplacez
`variant="reglementaire"` par `variant="projection"`, puis :

```bash
npm run build && npx next start -p 3200
```

Ouvrez `http://localhost:3200/sites` : le bloc du haut passe du liseré bleu au contour en pointillés
et l'étiquette devient « Projection ». Vous venez de faire dire à l'interface qu'un arrêté
préfectoral est une hypothèse — ce qui est exactement l'erreur que le composant sert à rendre
visible. ⚠️ Après chaque `npm run build`, **tuez le serveur et relancez-le** (`kill <pid>` sur le
processus `next-server`), sinon il sert d'anciens fichiers et la page casse.

**b) Casser un test, et voir ce qu'il protégeait.** C'est l'expérience la plus instructive du lot,
parce qu'elle rejoue le vrai bug de cette session. Dans `components/PortfolioExecutiveSummary.tsx`,
supprimez la ligne :

```tsx
ariaLabel="Synthèse du portefeuille"
```

Rebâtissez, relancez le serveur, puis :

```bash
node scripts/test/e2e.mjs
```

Le test s'arrête au bout de 15 secondes sur
`waiting for getByRole('region', { name: 'Synthèse du portefeuille' })`.

Regardez maintenant la page dans un navigateur : **elle est visuellement identique**. Rien ne
manque, rien n'est décalé. Ce que vous venez de supprimer est le *nom* de la région — et sans nom,
une `<section>` cesse d'être un repère qu'un lecteur d'écran peut annoncer ou atteindre. Le bloc
existe toujours pour l'œil et a disparu pour l'oreille. C'est précisément ce que ce test protège, et
c'est une catégorie de régression qu'aucune relecture de captures d'écran ne peut attraper.

**c) Mesurer le seuil de contraste plutôt que le croire.** Ouvrez `app/globals.css` et remplacez :

```css
--color-ink-subtle: #64748b;  /* 4.8:1 */
```

par l'ancienne valeur `#94a3b8` (2,9:1). Rebâtissez, ouvrez `/sites`, et regardez les lignes de
détail sous les chiffres — « j/an cumulés », « 3 sites estimés », les tirets « non estimé ».
Comparez les deux versions côte à côte, de préférence sur un écran mal réglé ou en plein jour :
c'est cet écart-là, invisible quand on connaît déjà le texte par cœur, que 69 occurrences imposaient
à chaque lecteur.
