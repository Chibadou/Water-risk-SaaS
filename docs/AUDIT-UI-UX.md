# Audit UI/UX — HydroVigie

> Audit à œil neuf du produit tel qu'il est au sprint 32, et feuille de route des sprints 33→37
> qui en découlent. Réalisé le 2026-08-06. Les constats sont numérotés P1→P10 et référencés
> tels quels dans les comptes rendus de sprint.

## Contexte

HydroVigie est un outil d'analyse du risque eau par site, riche en données réelles et
méthodologiquement solide (32 sprints, sources publiques, refus explicites plutôt que chiffres
inventés). Le produit a été construit **fonctionnalité par fonctionnalité** : chaque sprint a
ajouté un panneau, et personne n'a jamais repris la page dans son ensemble.

Résultat : la **rigueur des données n'est pas rendue par l'interface**. Un lecteur ouvre une page
de ~3 500 px empilant 12 blocs visuellement identiques, où la réponse à la question posée par le
titre arrive en quatrième position.

Décisions prises avec l'utilisateur : refonte de la fiche site avec **synthèse rédigée + sommaire
latéral collant** (page unique, donc imprimable et cherchable au Ctrl+F — ce qui compte pour un
rapport ESG) ; design system léger avec identité ; **pas de mode sombre** ; badge « Démo — Sprint
32 » remplacé par une mention de fraîcheur ; l'ensemble de l'audit traité **en plusieurs sprints**.

---

## 1. Ce qui marche déjà

- **`/carte` (sprints 30-32) est la meilleure page de l'app** et a déjà tiré la bonne leçon, écrite
  dans son propre code : *« descriptions live here rather than in `title` tooltips, which do not
  exist on a touch screen »*. Couches groupées par question, légende en page, section « Ce que la
  carte ne dit pas ». **C'est le modèle à généraliser.**
- L'honnêteté est déjà dans l'UI : `—` plutôt que `0`, badge de confiance, fourchettes lo/hi,
  « non estimé » explicite.
- `PortfolioExecutiveSummary` + `lib/executive.ts` : la seule zone où l'on écrit une *phrase*
  plutôt qu'aligner des chiffres. **C'est le patron à répliquer sur la fiche site.**

## 2. Constats (référencés P1→P10 dans les sprints ci-dessous)

| # | Constat | Preuve |
|---|---|---|
| P1 | La fiche répond à sa propre question en 4ᵉ position ; les 4 boutons d'export sont placés **avant** tout résultat | `HomeClient.tsx:517-661` |
| P2 | La page saute ~15 s : `loading` ne couvre que `/api/zones`, 7 blocs s'insèrent au fil de l'eau, **un seul squelette** dans tout le projet | `InterruptionPanel.tsx:188` ; HANDBOOK : `/api/hydro` 16,0 s, `/api/piezo` 11,0 s en prod |
| P3 | `RessourcePanel` **sans marge haute** (voisins en `mt-8`) → collé au bloc 2050 ; titre `h3 text-sm` là où ses pairs sont `h2 text-lg` | `RessourcePanel.tsx:96,98` |
| P4 | 24 `title=""` portent l'information essentielle (définition de « Jours contraints », sens des badges SUP/SOU/AEP, rôle du secteur) — inexistants au doigt, donc jamais sur mobile | 7 composants |
| P5 | **69** `text-slate-400` (#94a3b8) sur blanc ≈ **2,9:1** (AA = 4,5:1), souvent en 11-12 px ; `TypeBadge` encode la gravité **par la couleur seule** ; autocomplete sans rôle `combobox` ni flèches | `SitesDashboard.tsx:96-109`, `AddressAutocomplete.tsx` |
| P6 | 26 sections de méthodologie, **aucune ancre, aucun sommaire** ; tous les panneaux lient `/methodologie` tout court | `app/methodologie/page.tsx` (758 l.) |
| P7 | **31** occurrences exactes de `rounded-xl border border-slate-200 bg-white shadow-sm` : rien ne distingue un fait opposable d'une modélisation ou d'une projection. Typo : **146 `text-xs`, 118 `text-sm`, 34 ≥ 16 px** — rapport inversé | tout le projet |
| P8 | 5 tuiles KPI dans 640 px ; table 6 colonnes en scroll horizontal sans affordance ; **`Supprimer` sans confirmation ni annulation** (perte définitive en localStorage) | `SitesDashboard.tsx:649,755,874` |
| P9 | 3 selects + 4 champs avant tout résultat ; « Origine » / « Dépendance » modifient **silencieusement** les chiffres plus bas | `AddressSearch.tsx` |
| P10 | `Landing` annonce « sur 5 ans » alors que la fenêtre est à **10 ans** depuis le sprint 22 (vérifié en prod) ; badge « Démo » ; README « Sprint 10 » | `Landing.tsx:16` |

---

## 3. Plan d'exécution — sprints 33 → 37

Branche : `claude/project-ui-ux-audit-b7e8a3`. UI en français, code et commentaires en anglais.
**Compte rendu obligatoire par sprint** dans `docs/comptes-rendus/`, suivant exactement
`docs/TEMPLATE-COMPTE-RENDU.md` (7 sections). Pas de merge vers `main` sans demande explicite.

### Sprint 33 — Design system et honnêteté visuelle (P7, P5-contraste, P3, P10)

Le socle : sans lui, les sprints suivants recodent 31 fois la même carte.

- `app/globals.css` : bloc `@theme` Tailwind 4 avec une **échelle typographique** (5 niveaux, corps
  de base à 16 px) et des **couleurs sémantiques**. Les palettes de gravité restent dans
  `lib/gravite.ts` — source de vérité déjà partagée avec MapLibre, à ne pas dupliquer.
- **`components/ui/Panel.tsx`** — le composant qui n'existe pas et qui manque partout. Quatre
  variantes rendant visible la distinction que le code tient déjà en interne :
  `reglementaire` (fait opposable — VigiEau, arrêté daté) · `modele` (calcul HydroVigie, porte son
  badge de confiance) · `projection` (2050, incertain par construction) · `pedagogie` (encart
  explicatif). Remplace les 31 occurrences.
- **`text-slate-400` → `text-slate-500`** partout où le texte porte du sens ; supprimer les 17
  tailles 10-11 px. Vérifier chaque paire au ratio 4,5:1.
- Fix P3 : `RessourcePanel` en `<section className="mt-8">` + `<h2 className="text-lg">`.
- Corriger `Landing.tsx:16` (5 ans → 10 ans) et l'entête du README.
- **Badge « Démo — Sprint 32 » → fraîcheur.** ⚠️ Contrainte d'honnêteté : `ZonesResponse`
  (`lib/types.ts:51`) **ne porte aucun horodatage**, et aucune source amont n'en fournit — écrire
  « à jour au <date du jour> » serait inventer un fait, exactement ce que ce dépôt s'interdit. Donc
  deux choses distinctes : (a) dans `Shell`, une mention **factuelle sur la cadence de la source**
  (« Situation VigiEau rafraîchie quotidiennement, j-1 »), (b) sur la fiche site, une date **réelle
  et mesurée** tirée de `zone.arrete.dateDebutValidite`, déjà disponible.

### Sprint 34 — Refonte de la fiche site : synthèse + sommaire collant (P1, P9)

- **`lib/synthese.ts`** — fonction pure `buildSiteSummary(input)`, testée hors ligne, calquée sur
  `lib/executive.ts` (déjà écrit, testé, et dont le rendu fonctionne). Sort une accroche et des
  lignes tonalisées `neutre | attention | alerte`. Aucune donnée nouvelle : elle relit ce qui est
  déjà en state dans `HomeClient` — même règle que `computeAnticipation`.
- **`components/SiteSummary.tsx`** — miroir de `PortfolioExecutiveSummary.tsx`, réutilisant sa
  structure `dl`/pastille de ton.
- **`components/SiteToc.tsx`** — sommaire ancré, section active suivie à l'`IntersectionObserver`,
  dégradé en **chips horizontales collantes sous `lg`**. Ancres réelles (`#situation`, `#impact`…) :
  la page reste partageable au niveau du chapitre.
- Réordonner `HomeClient` en 5 chapitres, la réponse réglementaire en premier :
  1. **Situation réglementaire** — `ResultPanel` + `ZonesMap` + `ScorePanel`
  2. **Impact sur l'activité** — `InterruptionPanel` + `SectorImpactPanel` + `RestrictionHistory`
  3. **Anticipation** — `AnticipationPanel` + `SiteIndicators`
  4. **Horizon 2050** — `Projection2050`
  5. **Ressource et transition** — `RessourcePanel` + `TransitionRiskPanel` + `BnpePanel`
- Déplacer la barre d'actions (Ajouter / Partager / Rapport ESG / PDF) **après** la synthèse.
- P9 : signaler visuellement qu'un changement d'« Origine » ou de « Dépendance » a recalculé, et
  lequel des chapitres il touche.

### Sprint 35 — Chargement sans saut (P2)

- Un squelette **par chapitre**, à la hauteur réelle du bloc rendu, pour supprimer le layout shift.
- Un indicateur de progression des sources (« 4 des 7 sources chargées »), dans l'esprit du budget
  de 6 s déjà arbitré au sprint 32 pour les popups de carte.
- Distinguer, comme la carte le fait déjà, **service injoignable** et **donnée absente**.

### Sprint 36 — Accessibilité et mobile (P4, P5, P8)

- **Purger les 24 `title` porteurs de sens** : texte en page, `<details>`, ou popover atteignable au
  clavier. `/carte` a déjà tranché contre ce pattern, il s'agit de la suivre.
- `TypeBadge` : ajouter un libellé ou un glyphe de niveau — la couleur seule est une violation
  WCAG 1.4.1.
- `AddressAutocomplete` → **combobox ARIA complet** : `role`, `aria-expanded`,
  `aria-activedescendant`, flèches, Entrée, Échap. C'est le contrôle central de l'application.
- `focus-visible` dessiné, lien d'évitement, `prefers-reduced-motion`.
- Tableau de bord : KPI en `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` ; **table → liste de cartes
  sous 768 px** ; `Supprimer` avec **annulation** (undo ~8 s) plutôt qu'une confirmation modale.

### Sprint 37 — Méthodologie navigable (P6)

- **`lib/methodologie.ts`** : registre unique `{ id, titre }` des 26 sections, consommé **à la fois**
  par `app/methodologie/page.tsx` (qui génère ses `id` et son sommaire) et par les panneaux (qui
  lient leur ancre). Une seule source, donc pas d'ancre morte quand une section est renommée.
- Sommaire collant sur la page, et remplacement de chaque lien générique `/methodologie` par
  `/methodologie#<ancre>`.
- Test : une suite qui échoue si un panneau référence une ancre absente du registre.

---

## 4. Vérification

À chaque sprint, avant tout push :

```bash
npm run build && npm run lint
for f in scripts/test/*.test.ts; do npx tsx "$f"; done   # 18 suites, doivent rester au vert
node scripts/test/e2e.mjs                                # 60/60 attendus
```

- **Tests neufs attendus** : `scripts/test/synthese.test.ts` (sprint 34) et
  `scripts/test/methodologie.test.ts` (sprint 37, ancres). Les fonctions pures se testent hors
  ligne, comme `executive`/`portefeuille`/`interruption`.
- **Rendu vérifié en 390×844** à chaque sprint touchant la mise en page — c'est la mesure qui a
  attrapé les défauts des sprints 31 et 32.
- **Contraste** : vérifier au ratio les paires texte/fond modifiées au sprint 33 (cible AA 4,5:1).
- ⚠️ **Egress bloqué en bac à sable** : la fiche site ne se peuplera pas en local. Le rendu réel des
  chapitres 2 à 5 se juge sur la **preview Vercel**, pas ici — et se dit comme non vérifié en §3 du
  compte rendu tant que ça n'a pas été fait.
- ⚠️ Le sprint 33 touche 31 blocs : le risque est la **régression silencieuse d'espacement**. Passer
  chaque page (`/`, `/sites`, `/carte`, `/methodologie`) en revue visuelle sur la preview.

## 5. Hors périmètre (décidé)

Mode sombre — les palettes de gravité VigiEau et les fonds de carte sont calibrés pour le clair.
Pas de variables préparatoires non plus : on ne pose pas d'échafaudage pour un thème non décidé.
