# Compte rendu — Un chargement qui ne ment pas (Sprint 35)

**Date** : 2026-08-06 · **Branche** : `claude/project-ui-ux-audit-b7e8a3` · **Sprint** : 35

---

## 1. La question initiale

> Tu vas désormais agir en tant qu'expert UI/UX pour cette session.
> Réalise un audit de ce projet pour améliorer son UI/UX (carte blanche, avec un oeil neuf)
> Ensuite pose moi des questions pour l'améliorer ensemble.

**Ce que j'ai compris** : troisième des cinq sprints issus de l'[audit](../AUDIT-UI-UX.md). Il traite
le constat **P2** — la fiche site lance sept requêtes indépendantes et insère chaque bloc à son
arrivée, sans jamais dire au lecteur combien il en reste. Les mesures de production du HANDBOOK
(run 39) donnent `/api/hydro` à **16,0 s** et `/api/piezo` à **11,0 s** : la page grandit sous le
curseur pendant un quart de minute.

**Ce que j'ai élargi en cours de route, et pourquoi** : le sprint devait poser des squelettes. En
regardant la page se charger avec des réponses volontairement lentes, j'ai trouvé **deux endroits où
l'interface affirme une absence qui n'est qu'une attente** — un défaut de véracité, pas de confort.
Les corriger était plus important que les squelettes eux-mêmes, et relève de la même règle que le
sprint 32 avait rendue structurelle sur la carte.

**Ce que j'ai laissé de côté** : `prefers-reduced-motion` (les squelettes introduisent une animation
`animate-pulse` non désactivable pour l'instant) — c'est le sprint 36, comme prévu.

---

## 2. Ce qui a été réalisé

**En une phrase** : pendant les quinze secondes de chargement, la page ne bouge presque plus, dit
combien de sources restent, nomme lesquelles — et surtout ne prétend plus qu'une donnée qui arrive
est une donnée qui manque.

**Dans les grandes lignes** :

- **Deux mensonges transitoires corrigés.** (1) La ligne « ce que cette synthèse ne sait pas »
  affirmait, trois secondes après l'ouverture, que « la projection 2050 n'est pas disponible pour ce
  bassin » — puis se contredisait à l'arrivée de la réponse. (2) `TransitionRiskPanel` affichait
  « Statut ZRE indisponible » pendant toute l'attente, puis basculait sur « Commune classée en ZRE ».
  Les deux affirmaient une absence là où il n'y avait qu'une attente.
- **Des squelettes qui réservent la hauteur.** `lines` n'est pas une décoration, c'est une
  **revendication de hauteur** : chaque appelant déclare approximativement ce que son bloc occupera.
- **Un bandeau de progression** qui compte les sources **réglées** (répondu **ou** échoué, pas
  « réussi »), **nomme celles qui manquent**, et disparaît une fois tout arrivé.
- **Le saut de largeur du sprint 34 est supprimé** : `Shell wide` basculait à l'arrivée des
  **données** ; il bascule désormais au choix de l'**adresse** — un geste que l'utilisateur a fait.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `components/ui/Skeleton.tsx` | neuf | `Skeleton` (rangées) et `PanelSkeleton` (cadre + libellé). `aria-hidden` sur les barres, toujours accompagnées d'un texte lisible. |
| `components/SourceProgress.tsx` | neuf | « 4 / 7 sources chargées » + « En attente : Débit du cours d'eau · Nappe souterraine · Projection 2050 ». `role="progressbar"` avec ses bornes. |
| `lib/synthese.ts` | modifié | Nouveau champ `enAttente` : une source en vol est **ignorée** de la ligne des manques. |
| `components/TransitionRiskPanel.tsx` | modifié | État `pending` distinct : « Lecture du statut ZRE… » au lieu de « indisponible ». |
| `components/HomeClient.tsx` | modifié | Recense les 7 sources, transmet `enAttente`, et `wide` suit l'adresse et non les données. |
| `SiteIndicators`, `Projection2050`, `BnpePanel`, `RessourcePanel`, `InterruptionPanel` | modifiés | Squelettes dimensionnés à la place des lignes « Chargement… ». |
| `scripts/test/synthese.test.ts` | modifié | **57 vérifications** (+5) sur la distinction attente / absence. |

**Mesures :**

| Ce qui est mesuré | Valeur |
| --- | --- |
| Déplacement du chapitre 4 pendant un chargement complet (bouchons retardés à 5/4/3/2/1,8 s) | **59 px** sur une page de 9 512 px |
| Ligne des manques à mi-chargement vs après chargement | **identique** (avant : deux affirmations qui se contredisaient) |
| Progression observée | 4 → 5 → 6 → le bandeau disparaît |

---

## 3. Erreurs potentielles

**Bugs trouvés et corrigés pendant la session** — les deux ont été trouvés **en regardant la page se
charger**, jamais par un test, et aucun n'était dans le périmètre annoncé du sprint :

1. **La synthèse se contredisait pendant le chargement.** À 3 s : « la projection 2050 n'est pas
   disponible pour ce bassin ; aucune station de mesure rattachée n'a publié d'état exploitable ».
   À 12 s : ces deux phrases disparaissaient. Un lecteur qui exportait son rapport ESG entre les deux
   emportait une affirmation fausse. ⚠️ **La règle générale à retenir** : une source *en attente*
   n'est ni un fait ni un manque, et la ligne des manques doit l'ignorer, pas la compter.
2. **`TransitionRiskPanel` n'avait aucun état de chargement.** Il rendait immédiatement ses trois
   cartes avec « Statut ZRE indisponible », puis basculait. C'est le même défaut que la carte avait
   corrigé au sprint 32 (« service injoignable ≠ station muette »), réapparu dans un autre composant.

**Non vérifié en conditions réelles :**

- ⚠️ **Toujours aucune donnée réelle.** Comme au sprint 34, tout a été vu à travers des bouchons
  Playwright. Les délais (5 s, 4 s, 3 s…) sont **simulés** : je n'ai jamais observé le comportement
  sous les **16,0 s réelles** de `/api/hydro` en production. À 16 s, le lecteur aura eu le temps de
  faire défiler la page, et le comportement du sommaire collant pendant l'insertion d'un bloc
  au-dessus de sa position **n'a pas été observé du tout**.
- **Les 59 px sont mesurés sur UN scénario**, avec l'ordre d'arrivée que mes délais imposent. Un
  ordre différent (la projection avant l'historique, par exemple) donnerait un autre chiffre.
- ⚠️ **Les hauteurs de squelette sont estimées à l'œil, pas calibrées.** J'ai passé `lines={6}`,
  `lines={7}`, `lines={8}` d'après ce que les blocs paraissaient occuper. Aucun n'a été comparé
  au pixel avec sa hauteur chargée réelle — c'est précisément ce qui produirait un déplacement
  résiduel, et c'est probablement l'essentiel des 59 px restants.
- **Le bandeau de progression n'a jamais été vu en état d'échec.** Si une source échoue, elle compte
  comme réglée et le bandeau disparaît — voulu, mais non observé.

**Hypothèses qui pourraient ne pas tenir :**

- **`interruption === null && !histLoaded` sert d'indicateur d'attente pour les jours contraints.**
  C'est indirect : `InterruptionPanel` peut avoir répondu `null` légitimement (données
  insuffisantes) alors que l'historique n'est pas encore arrivé, auquel cas le manque est masqué à
  tort pendant quelques instants. Le cas n'a pas été observé.
- **Le décompte est figé à 7 sources.** Elles sont listées à la main dans `HomeClient` ; ajouter un
  panneau sans l'y inscrire donnerait un bandeau qui atteint 7/7 alors qu'un bloc charge encore.
- **`SourceProgress` disparaît dès que tout est réglé**, y compris si tout échoue — le lecteur voit
  alors une page de messages d'erreur sans indication qu'elle est « terminée ».

**Ce qui casserait si une source amont changeait** : rien de nouveau. Le bandeau compte des
promesses réglées, pas des contenus ; une source qui change de forme est déjà couverte par les
gardes des panneaux.

---

## 4. Points d'amélioration

**Dette assumée :**

- **`animate-pulse` n'est pas désactivable** tant que `prefers-reduced-motion` n'est pas posé
  (sprint 36). Le sprint ajoute donc de l'animation à une application qui n'en avait presque pas,
  en sachant que le garde-fou arrive au sprint suivant.
- **Les squelettes ne sont pas au pixel** (voir §3). Une calibration honnête demanderait de mesurer
  chaque bloc chargé et d'en déduire `lines`.
- **`SourceProgress` liste des sources en dur.** Un registre partagé avec les panneaux serait plus
  sûr, mais surdimensionné pour sept entrées.

**À reprendre :**

- **La synthèse peut encore être en retard d'un cycle sur ses chapitres** (dette signalée au sprint
  34, inchangée) : elle lit `interruption` remonté par callback.
- **`eyebrow` ne rend toujours pas un titre** — dette du sprint 33, toujours ouverte, prévue au 36.
- **Le bandeau n'a pas de temps estimé.** « En attente : Débit du cours d'eau » ne dit pas si c'est
  deux secondes ou seize. Les mesures de production existent (16,0 s / 11,0 s) et pourraient
  alimenter une estimation — au risque de promettre un délai qu'on ne tient pas.

---

## 5. État Git

- **Branche de session** : `claude/project-ui-ux-audit-b7e8a3`
- **`main` touché ?** : **NON**. Aucun merge, aucune demande de mise en prod.
- **Déployé en prod ?** : **non**, et rien de ce sprint n'a été vu sur un déploiement réel.
- **Vérifications passées** :
  - `npm run build` — **succès** · `npm run lint` — **clean** (3 avertissements d'import inutilisé
    apparus en cours de route, corrigés)
  - **19 suites au vert, 0 échec** — `synthese.test.ts` passe de 52 à **57 vérifications**
  - **60/60 e2e**
  - **Déplacement mesuré** : 59 px sur 9 512 px · **ligne des manques identique** avant/après
    chargement · progression 4 → 5 → 6 → disparition
  - **Rendu observé** en 1440×1050, à mi-chargement et après — **avec des bouchons**, voir §3

---

## 6. Prochaines étapes

1. **Voir la fiche sur la preview Vercel avec de vraies données.** *Verrou* : rien à coder. Trois
   sprints s'empilent désormais sur du non-constaté, et celui-ci est le premier dont le comportement
   dépend directement de délais réseau **réels** — c'est le plus mal servi par les bouchons.
2. **Sprint 36 — accessibilité et mobile.** *Verrou* : aucun. Il doit **aussi** poser
   `prefers-reduced-motion`, que ce sprint rend nécessaire.
3. **Sprint 37 — ancres de méthodologie.** *Verrou* : aucun.
4. **Calibrer les hauteurs de squelette au pixel.** *Verrou* : demande un rendu peuplé stable, donc
   dépend du point 1.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Cette page ne se charge pas d'un coup. Elle pose sept questions à sept services publics différents,
et affiche chaque réponse dès qu'elle arrive. Deux de ces services sont lents : en production, l'un
met seize secondes, l'autre onze.

Pendant ces quinze secondes il se passait deux choses désagréables. D'abord la page **grandissait
sous le curseur** : chaque réponse insérait un bloc, ce qui poussait vers le bas tout ce qu'il y
avait en dessous — on visait un lien, il partait. Ensuite, et c'est plus grave, la page **disait des
choses fausses**. Le résumé du haut annonçait « la projection 2050 n'est pas disponible pour ce
bassin »… alors qu'elle était simplement en route. Douze secondes plus tard, la phrase disparaissait.

Quelqu'un qui exportait son rapport entre les deux emportait une affirmation fausse dans un document
destiné à un auditeur.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| Requête / réponse | L'application demande une donnée à un serveur et attend. Chaque attente est indépendante des autres. |
| *Layout shift* | Le déplacement du contenu quand un élément s'insère au-dessus. C'est ce qui fait rater un clic. |
| Squelette (*skeleton*) | Des rectangles gris de la taille du contenu à venir, affichés pendant l'attente. |
| Promesse **réglée** (*settled*) | Une requête terminée — **soit** réussie, **soit** échouée. À ne pas confondre avec « réussie ». |
| ZRE | « Zone de Répartition des Eaux » : une désignation réglementaire des secteurs où les prélèvements dépassent la ressource. |
| `role="status"` / `aria-live` | Marquages qui font annoncer un texte par un lecteur d'écran quand il change. |
| `aria-hidden` | L'inverse : « cet élément est décoratif, ne l'annonce pas ». |

### 7.3 Comment le code s'y prend

**Étape 1 — réserver la place avant de la remplir.** Un squelette n'est pas un ornement, c'est une
promesse de hauteur :

```tsx
// components/ui/Skeleton.tsx
export default function Skeleton({ lines = 3, className = "" }) {
  return (
    <div className={`animate-pulse ${className}`.trim()} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`h-3.5 rounded bg-slate-200/70 ${i > 0 ? "mt-2.5" : ""} ${
          i === lines - 1 ? "w-2/3" : i % 3 === 1 ? "w-11/12" : "w-full"
        }`} />
      ))}
    </div>
  );
}
```

Deux détails valent d'être remarqués. La dernière barre fait `w-2/3` : une pile de barres égales se
lit comme un tableau, une dernière ligne plus courte se lit comme **du texte pas encore arrivé**. Et
le tout est `aria-hidden` — un lecteur d'écran n'a rien à faire d'une description de rectangles gris.
Il doit entendre le texte que l'appelant met à côté :

```tsx
// components/SiteIndicators.tsx
<div role="status">
  <p className="mt-3 text-sm text-ink-subtle">
    Recherche des stations les plus proches… (jusqu&apos;à une quinzaine de secondes)
  </p>
  <Skeleton lines={6} className="mt-4" />
</div>
```

**Étape 2 — compter les sources réglées, pas les sources réussies.** C'est la subtilité centrale du
bandeau de progression :

```tsx
// components/SourceProgress.tsx
export interface SourceState {
  id: string;
  label: string;
  /** true once the request has SETTLED — answered or failed. Not "succeeded". */
  ready: boolean;
}
```

Si l'on comptait les réussites, un site sans station de mesure à proximité verrait une barre bloquée
à 5/7 pour toujours. Une source qui répond « je n'ai rien » a fini de faire attendre : elle compte.

Et le bandeau **nomme** ce qui manque, parce que « chargement en cours » ne dit pas au lecteur si le
chapitre qu'il attend est le lent ou celui qui ne viendra jamais :

```tsx
<p className="text-xs text-ink-subtle">En attente : {pending.join(" · ")}</p>
```

**Étape 3 — ne pas confondre « en attente » et « absent ».** C'est le vrai correctif du sprint. Le
résumé du haut a une dernière ligne qui énumère ce qu'il ne sait pas. Elle prenait le silence pour
une absence :

```ts
// lib/synthese.ts — AVANT
if (input.vcn10Delta2050 === undefined) {
  manques.push("la projection 2050 n'est pas disponible pour ce bassin");
}
```

`undefined` voulait dire deux choses différentes : « la réponse a dit non » et « la réponse n'est pas
arrivée ». Le correctif ajoute cette information, qui n'existait nulle part :

```ts
// lib/synthese.ts — APRÈS
const attend = (src: SyntheseSource) => input.enAttente?.includes(src) ?? false;
// ...
if (!attend("projection") && input.vcn10Delta2050 === undefined) {
  manques.push("la projection 2050 n'est pas disponible pour ce bassin");
}
```

Une exception délibérée, et elle mérite d'être comprise : le **volume prélevé** n'est jamais masqué,
parce qu'il ne dépend d'aucune requête — c'est un champ que le lecteur remplit lui-même. Le masquer
pendant le chargement le ferait apparaître seulement à la toute fin, au moment où l'utilisateur a
cessé de regarder.

**Étape 4 — la donnée circule ainsi.** Chaque `fetch` de `HomeClient` fait passer un état de
`undefined` (en vol) à une valeur ou `null` (réglé). `HomeClient` traduit ces sept états en une liste
`SourceState[]` pour le bandeau, **et** en une liste `enAttente` pour le résumé. Le même fait — « la
projection n'est pas encore là » — nourrit donc les deux, ce qui les empêche de se contredire.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Pourquoi ne pas simplement tout attendre avant d'afficher ?** Ce serait la solution la plus simple
au *layout shift* : un seul écran de chargement, puis la page complète. Mais elle coûterait seize
secondes d'écran vide alors que la réponse réglementaire — la plus importante, et la plus rapide —
est disponible en moins d'une seconde. On ferait attendre le fait opposable derrière une projection
climatique.

**Pourquoi des squelettes plutôt qu'un simple bloc de hauteur fixe ?** Un rectangle gris uni ne dit
pas s'il est un chargement ou un contenu vide. Des barres de longueurs inégales, animées, disent
« du texte arrive ». C'est de la convention, mais elle est acquise.

**Pourquoi compter les sources réglées plutôt que les réussies ?** Voir l'étape 2 : parce que la
barre doit finir. Une barre qui n'atteint jamais 100 % apprend au lecteur à l'ignorer, ce qui est
pire que pas de barre du tout.

**Pourquoi avoir déplacé la bascule de largeur ?** Le sprint précédent élargissait la page au moment
où les **données** arrivaient. C'était le pire moment possible : un saut de largeur, non demandé,
pendant que le lecteur commence à lire. La bascule suit désormais le **choix d'adresse** — un geste
que l'utilisateur vient de faire, où un changement de mise en page se lit comme une réponse et non
comme un bug.

**Pourquoi corriger la ZRE dans ce sprint alors que ce n'était pas prévu ?** Parce que c'était le
même défaut que celui du résumé, dans un autre composant, et que le trouver sans le corriger aurait
demandé de l'écrire dans les « points d'amélioration » — soit exactement le genre de dette qui ne se
paie jamais. Le correctif faisait trois lignes.

### 7.5 Pour expérimenter soi-même

**a) Voir la page se charger au ralenti.** Le plus instructif : ouvrez les outils de développement
du navigateur, onglet Réseau, et choisissez une limitation (« Slow 3G »). Rechargez une fiche. Vous
verrez le bandeau compter, les squelettes tenir la place, et les chapitres se remplir de haut en bas.
Comparez en faisant défiler pendant le chargement : c'est là que le *layout shift* se ressent.

**b) Casser un test, et voir ce qu'il protégeait.** Dans `lib/synthese.ts`, retirez la garde
d'attente sur la projection :

```ts
if (input.vcn10Delta2050 === undefined) {
  manques.push("la projection 2050 n'est pas disponible pour ce bassin");
}
```

Puis :

```bash
npx tsx scripts/test/synthese.test.ts
```

`FAIL a pending source produces no gap line at all` et `FAIL only the pending source is suppressed`
tombent. Reconstruisez et rechargez avec la limitation réseau : pendant les premières secondes, le
résumé affirme que la projection n'est pas disponible — puis se dédit. Le test protège contre une
phrase **grammaticalement correcte, factuellement fausse pendant trois secondes**, et vraie ensuite.
Aucun typage ne peut attraper cela ; seule la distinction explicite entre « pas encore » et « pas
du tout » le peut.

**c) Mesurer le déplacement plutôt que le deviner.** Collez ceci dans la console pendant un
chargement lent :

```js
const el = document.getElementById("horizon-2050");
setInterval(() => console.log(Math.round(el.getBoundingClientRect().top + scrollY)), 500);
```

Vous verrez le chapitre 4 bouger d'une soixantaine de pixels sur toute la durée. Retirez ensuite le
`lines={8}` du squelette de `Projection2050` (mettez `lines={1}`), reconstruisez, et refaites la
mesure : le déplacement enfle immédiatement. C'est la démonstration que `lines` n'est pas un réglage
esthétique mais la revendication de hauteur qui tient la page en place.
