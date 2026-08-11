# Compte rendu — une seule boucle de plis (Sprint 50)

**Date** : 2026-08-11 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 50

---

## 1. La question initiale

> « Continue »

(boucle `/loop 30m`)

**Ce que j'ai compris** : la première des « prochaines étapes » que le compte rendu du sprint 49 avait
lui-même écrites — *réduire le coût d'un run avant d'ajouter une covariable*. Le run 4 avait pris
**26,0 minutes** contre 3,5 pour le run 2, et le chantier suivant (le SWI) en ajouterait encore. À ce
rythme la mesure d'après devenait inconfortable, donc payer la dette maintenant plutôt qu'après.

**Ce que j'ai délibérément laissé de côté** :

- **Le SWI**, qui est le vrai sujet de fond. C'était précisément l'objet de cette étape : ne pas
  l'attaquer avant que le banc soit abordable.
- **Optimiser l'ajustement lui-même** (`countTransitions`, `fitTransitions`). Non touché : la
  redondance était ailleurs, et corriger d'abord le gaspillage structurel évite d'optimiser du code
  qu'on appelait sept fois de trop.
- **Paralléliser les plis.** Écarté : ça change le déterminisme du résultat pour un gain que
  l'élimination de la redondance obtenait sans risque.

---

## 2. Ce qui a été réalisé

**En une phrase** : le run passe de **26,0 à 14,0 minutes** en posant les sept questions dans une
**seule** boucle de plis, avec tous les chiffres **identiques**.

**Dans les grandes lignes** :

- **La cause était structurelle, pas algorithmique.** Le script posait aux mêmes données sept
  questions — global, jours de transition, déclenchements, chacune contre une ou deux barres — et
  chacune relançait toute la boucle de plis **en réajustant le modèle dans chacun des ~100 plis**.
  L'ajustement domine le coût et il est **identique** entre les sept : seule la notation diffère.
- **`validationCroiseeMulti`** : une boucle, un ajustement par pli, toutes les demandes
  (sous-ensemble × barre) notées à partir de là. Les références sont construites **une fois par pli**
  et partagées par identité ; la garde anti-fuite est inchangée.
- **`validationCroisee` devient une enveloppe mince** par-dessus, pas une seconde implémentation :
  les deux ne peuvent plus divergemment interpréter la garde anti-fuite ou le sous-ensemble noté.
- **L'identité des résultats est le critère d'acceptation**, pas la vitesse. Deux vérifications
  l'affirment, dont une **pli par pli** et pas seulement sur la moyenne.
- **`FitOptions.prior` était un paramètre mort** — `fitConditionnel` le recevait et l'ignorait.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/validation.ts` | modifié | `DemandeScore`, `validationCroiseeMulti`, `assembler` (privée, partagée). `validationCroisee` réécrite en enveloppe de trois lignes. |
| `lib/markov.ts` | modifié | `fitConditionnel` honore `options.prior`. ⚠️ Commentaire disant ce que ça rapporte **aujourd'hui** : rien. |
| `scripts/calibration/run.ts` | modifié | Trois blocs regroupés en trois appels multi (2 + 3 + 2 demandes) au lieu de sept appels séparés. La passe *leave-one-year-out* reste seule. |
| `scripts/test/markov.test.ts` | modifié | Section 5 quater : **11** vérifications (identité, journaux par demande, réutilisation de l'a priori). 103 → **114**. |
| `data/restrictions-probe-request.json` | modifié | Liste **à l'avance** chaque valeur attendue inchangée. |
| `docs/SPRINTS.md`, `docs/HANDBOOK.md` | modifiés | Reste n° 8 clos et chiffré, liste renumérotée (1-14), idiome n° 14. |

---

## 3. Erreurs potentielles

### Trouvés et corrigés pendant la session

**1. Le bloc de test ne compilait pas — variables hors de portée.** J'ai écrit la nouvelle section
5 quater comme un bloc `{ … }` séparé, alors que `jours`, `informeMois` et `saisonnier` sont déclarés
dans le bloc 5 ter. Résultat : `ReferenceError: jours is not defined`, et la suite s'est arrêtée à
**59 vérifications sur 114** — elle a donc *paru* passer moins de choses plutôt que d'échouer
franchement. Corrigé en fusionnant les deux blocs. ⚠️ À retenir : dans cette suite, un plantage
tronque le compte de PASS sans qu'aucune ligne `FAIL` n'apparaisse ; le nombre de PASS est donc à
lire autant que l'absence de FAIL.

**2. J'ai d'abord annoncé un gain que le correctif ne produit pas.** Mon commentaire sur
`options.prior` affirmait que l'ignorer « doublait le coût d'une validation ». **C'est faux aux
appels actuels** : aucun n'a d'a priori sous la main, donc le pli doit en ajuster un de toute façon.
Le commentaire dit maintenant que ça ne rapporte **rien aujourd'hui** et à qui ça servira. C'était une
justification plausible et non mesurée — exactement le défaut que le sprint 47 avait déjà relevé chez
moi sur Jaccard.

**3. Je me suis trompé trois fois de suite sur ce que fait `options.prior`** — trouvé, comme les
sprints précédents, en écrivant §7.5 et en la lançant. J'avais annoncé qu'un a priori étranger
changerait les matrices : faux. Puis sur série mince : encore faux. L'a priori n'agit que si la ligne
a **au moins une** transition (sinon elle reste vide et la fonction sort avant la mutualisation),
**moins que `minParLigne`**, et que l'a priori a une valeur pour la case. Mes deux premières tentatives
cassaient la **consécutivité des jours** en filtrant une journée sur quarante — il n'y avait donc plus
« peu » de transitions mais **zéro**. ⚠️ Corollaire utile : *une ligne vide et une ligne mince ne sont
pas le même cas*, et seule la seconde est mutualisée.

**4. L'accélération synthétique n'est pas l'accélération réelle.** Mesuré ×4,11 sur une série de
62 500 observations, **×1,86** sur le vrai run. Citer le ×4,11 aurait été vrai et trompeur. L'écart
est la part non partageable : téléchargement, parsing, expansion des 6 M d'observations, et la passe
*leave-one-year-out* qui est un autre découpage.

### Non vérifié en conditions réelles

- **L'identité n'est vérifiée que sur les valeurs que j'ai listées** (huit gains, les rejets, la
  reconstruction, deux `departsParMois`). Le rapport en contient davantage ; je n'ai pas fait de
  `diff` complet des deux JSON, ce qui aurait été plus fort et plus simple. **À faire au prochain
  run.**
- **Le partage de référence par identité n'a jamais été exercé sur un cas où deux demandes
  partagent la même barre par erreur** (deux objets `Reference` distincts mais équivalents). Le
  comportement serait alors de construire la barre deux fois — correct, juste plus lent, et non
  testé.
- **Aucune mesure de mémoire.** La passe multi garde `prevus` et les deux ensembles filtrés vivants
  simultanément ; sur 6 M d'observations ça a tenu, mais rien ne le surveille.

### Hypothèses qui pourraient ne pas tenir

- **« L'ajustement domine le coût »** est une inférence de la structure, confirmée *a posteriori* par
  le ×1,86, mais je n'ai pas profilé. Si une part du temps était ailleurs (les `filter`, par exemple),
  le prochain gain ne viendra pas d'où je l'annonce.
- **×1,86 est la borne de ce qu'on gagne ainsi.** Les sept questions sont devenues trois passes ; les
  regrouper davantage n'est pas possible (la LOYO est un autre découpage). La suite demanderait de
  toucher au coût de l'ajustement lui-même.
- **14 minutes reste long** pour une boucle d'expérimentation. Le SWI ajoutera des contextes, donc des
  matrices par pli.

### Ce qui casserait si une source amont changeait

- **Rien de nouveau** : ce sprint ne touche aucune source. Le seul risque introduit est qu'une
  optimisation future de `validationCroiseeMulti` fasse divergemment l'enveloppe — d'où le choix de
  n'avoir **qu'une** implémentation.

---

## 4. Points d'amélioration

**Dette assumée**

- **`assembler` est une fonction privée** plutôt qu'une méthode ou une classe. Assumé : elle n'a
  qu'un rôle, transformer des plis accumulés en résultat avec son journal, et deux appelants.
- **Le partage de référence se fait par identité d'objet** (`Map<Reference, …>`), documenté comme
  tel. Une comparaison structurelle serait plus indulgente et moins prévisible.
- **`validationCroisee` conservée.** Elle est la forme lisible pour une question unique, et tous les
  appels existants l'utilisent.

**À reprendre**

- **Comparer les deux rapports JSON par `diff`** plutôt que par une liste de valeurs choisies par
  moi. C'est plus simple *et* plus fort : je n'aurais pas eu à choisir quoi vérifier.
- **Profiler avant le prochain gain.** Je sais que l'ajustement dominait ; je ne sais pas ce qui
  domine maintenant.
- **`departsParMois` n'est toujours pas dans l'interface** (dette héritée du sprint 49) : c'est le
  chiffre le plus présentable produit par toute cette série de runs.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — dernier commit de code
  `44f3b77`, puis `374e150` écrit par le workflow Actions.
- **`main` touché ?** : **NON.**
- **Pull request** : **aucune** — non demandée.
- **Déployé en prod ?** : **non.** Vercel suit `main`. ⚠️ **Douzième session sans regarder la prod.**
- **Vérifications passées** :
  - `npm run build` — clean · `npm run lint` — clean
  - **31 suites**, 0 échec — `markov.test.ts` de **103 à 114** vérifications
  - e2e **non rejoué** : aucun fichier de `components/` ou `app/` touché
  - **1 run Actions** : 31519221578, `success`, **841 s (14,0 min)** contre **1 561 s (26,0 min)**
    pour le run 31498428653 — mesuré via `get_workflow_run_usage`, pas estimé
  - ⚠️ `npx tsc --noEmit` : toujours l'erreur `TS1501` **pré-existante** dans `report.test.ts`

---

## 6. Prochaines étapes

1. **Conditionner sur le SWI départemental.** *Verrou* : deux étapes de données, faisables —
   récupérer les 7 CSV décennaux (egress → Actions) et rattacher les départements aux mailles SAFRAN
   (`departements.geojson` et `cells.json` sont au dépôt). ⚠️ Réserve écrite d'avance : le SWI est
   **mensuel**, donc il varie entre deux juillets mais pas d'un jour à l'autre — et l'idiome n° 12 dit
   qu'une covariable qui ne varie pas dans son contexte ne peut pas désigner un jour.
2. **Comparer les rapports par `diff` complet** au prochain run. *Verrou* : aucun.
3. **Regarder la prod.** *Verrou* : humain. **Douze sessions.**
4. **Publier `departsParMois`.** *Verrou* : décider où.
5. **Trois à cinq sites pilotes.** *Verrou* : **commercial**, toujours le seul que le code ne lèvera
   pas.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Nous vérifions un modèle de prévision en le mettant à l'épreuve 100 fois : on retire un département,
on entraîne le modèle sur les 99 autres, on note ses prévisions sur celui qu'on a retiré, et on
recommence. C'est long mais c'est la seule façon honnête de savoir s'il généralise.

Le problème n'était pas la lenteur de ce calcul : c'est qu'on le faisait **sept fois**. Nous voulions
sept réponses différentes — « et sur les jours où le niveau change ? », « et sur les jours où une
restriction démarre ? », « et si on compare à une référence plus exigeante ? » — et pour chacune on
relançait tout depuis le début, **en réentraînant le modèle**.

Or l'entraînement est la partie coûteuse, et il est **exactement le même** dans les sept cas. Ce qui
change, c'est seulement quelles journées on regarde à la fin, et à quoi on compare. Autrement dit : on
refaisait sept fois la cuisine pour goûter sept plats identiques de sept façons différentes.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Pli (fold)** | Un des 100 découpages : 99 départements pour entraîner, 1 pour noter. |
| **Validation croisée** | Répéter l'opération sur tous les plis et moyenner. |
| **Ajuster / entraîner** | Calculer les probabilités du modèle à partir de données. La partie coûteuse. |
| **Noter (scorer)** | Comparer les prévisions à ce qui s'est réellement passé. Peu coûteux. |
| **Score de Brier** | La note d'une prévision probabiliste. Plus bas = meilleur. |
| **Référence / barre** | La prévision bête à battre. |
| **Sous-ensemble noté** | Les seules journées sur lesquelles on note (ex. les déclenchements). |
| **Fuite (leakage)** | Laisser une information du pli de test entrer dans l'entraînement. Fausse tout. |
| **Enveloppe (wrapper)** | Une fonction courte qui en appelle une plus générale. |

### 7.3 Comment le code s'y prend

Avant, chaque question était un appel complet (`scripts/calibration/run.ts`) :

```ts
const global5 = validationCroisee(jours, "leave_one_department_out", informe5);
const trans5  = validationCroisee(jours, "leave_one_department_out", informe5, { … });
const decl5   = validationCroisee(jours, "leave_one_department_out", informe5, { … });
```

Trois appels, trois boucles de 100 plis, **300 entraînements** pour 100 entraînements utiles.
Maintenant :

```ts
const cinq = validationCroiseeMulti(jours, "leave_one_department_out", informe5, [
  { nom: "global" },
  { nom: "transitions",    restriction: { nom: "jours de transition (5 états)", cles: transitions } },
  { nom: "declenchements", restriction: { nom: "déclenchements (libre → sous arrêté)", cles: declenchements } },
]);
```

Le cœur de la nouvelle fonction (`lib/validation.ts`) — l'entraînement sort de la boucle des
demandes :

```ts
for (const k of cles) {
  const test = jours.filter((j) => cle(j) === k);
  const entrainement = jours.filter((j) => cle(j) !== k);
  if (test.length === 0 || entrainement.length === 0) continue;

  // The expensive part, done ONCE for every request.
  const prevus = ajuster(entrainement, test);

  const refCache = new Map<Reference, (jour: JourEvalue) => Prevision>();
  for (const e of etat) {
    if (!refCache.has(e.reference)) refCache.set(e.reference, e.reference.construire(entrainement));
  }

  for (const e of etat) {
    // … filtrer selon la demande, puis noter
  }
}
```

Deux détails qui comptent plus qu'ils n'en ont l'air.

**Les références sont construites dans la boucle des plis, pas avant.** C'est la garde anti-fuite :
chaque barre est bâtie sur le **pli d'entraînement seul**. La sortir de la boucle la ferait apprendre
sur toutes les données, y compris celles sur lesquelles on va la noter.

**Le `refCache` est indexé par l'objet lui-même**, pas par son nom. Deux demandes qui passent le
*même* objet `Reference` partagent la construction ; deux objets équivalents mais distincts la font
deux fois. C'est correct dans les deux cas, seulement plus lent dans le second, et c'est écrit dans le
commentaire pour que personne ne s'étonne.

Enfin, l'ancienne fonction n'a pas été supprimée : elle **délègue** :

```ts
export function validationCroisee(jours, mode, ajuster, restriction?, reference = REFERENCE_CLIMATOLOGIQUE) {
  return validationCroiseeMulti(jours, mode, ajuster, [{ nom: "unique", restriction, reference }]).unique;
}
```

Elle reste la forme lisible pour une question unique, et surtout : il n'y a **qu'une**
implémentation. Deux versions du même calcul finissent toujours par ne plus être d'accord sur un
détail — ici, ce détail serait la garde anti-fuite.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Regrouper les questions plutôt que paralléliser les plis.** Paralléliser aurait aussi accéléré,
mais en changeant le déterminisme (l'ordre d'accumulation) et donc potentiellement les derniers
chiffres. Supprimer du travail redondant ne change **rien** au résultat, et c'était vérifiable.

**Exiger l'identité des chiffres comme critère d'acceptation.** Une optimisation qui déplace la mesure
n'est pas une optimisation, c'est une réécriture — et une réécriture d'un banc de mesure invalide tout
ce qu'on a mesuré avec. Le fichier de requête du run listait donc **à l'avance** chaque valeur
attendue inchangée. Écrire l'attendu avant de voir le résultat est ce qui empêche de trouver une
explication à un chiffre qui a bougé.

**Garder l'ancienne fonction comme enveloppe.** J'aurais pu remplacer tous les appels par la nouvelle
API. Ça aurait rendu les tests existants moins lisibles (un tableau d'une seule demande pour une
question unique) sans rien garantir de plus.

**Annoncer ×1,86 et pas ×4,11.** Le banc synthétique donne ×4,11 parce qu'il ne fait *que* de la
validation croisée. Le run réel télécharge 11 Mo, parse 12 584 lignes, développe 6 millions
d'observations et exécute une passe *leave-one-year-out* qui ne peut pas être partagée. Le chiffre
utile est celui du travail réel.

### 7.5 Pour expérimenter soi-même

**Expérience A — casser l'identité, et voir ce que le test protège.**
Dans `lib/validation.ts`, faites que la restriction filtre aussi le pli (au lieu de la seule
notation) :

```ts
const test = jours.filter((j) => cle(j) === k);
// devient, pour la démonstration :
const test = jours.filter((j) => cle(j) === k && (!e.demande.restriction || e.demande.restriction.cles.has(`${j.zone}|${j.day}`)));
```

Ce n'est pas compilable tel quel (`e` n'existe pas à cet endroit) — et **c'est le point** : la
structure de la nouvelle fonction rend cette erreur difficile à écrire, parce que l'entraînement est
calculé **avant** de connaître la demande. L'ancienne version, où tout était dans la même portée, la
rendait facile ; c'est exactement le bug que le sprint 49 avait dû traquer en trois assertions.

**Expérience B — supprimer le partage de référence.**
Construisez la barre à l'intérieur de la boucle des demandes :

```ts
for (const e of etat) {
  const prevoirReference = e.reference.construire(entrainement);   // au lieu du refCache
  // …
}
```

`npx tsx scripts/test/markov.test.ts` → **aucun échec**, et c'est instructif : le résultat est
identique, seul le temps change. Une optimisation invisible aux tests est une optimisation qu'il faut
**mesurer** pour justifier, pas seulement asserter. C'est pourquoi le chiffre du sprint est un temps
de run et pas une couleur de suite.

**Expérience C — découvrir à quelles conditions l'a priori agit réellement.**
C'est l'expérience où je me suis trompé **trois fois**, et elle vaut d'être refaite pour ça.

```ts
const prior = fitTransitions(saisonnier, { minParLigne: 1 });
const avec = fitConditionnel(saisonnier, (o) => contexteMois(o.day), { minParLigne: 20, prior });
const sans = fitConditionnel(saisonnier, (o) => contexteMois(o.day), { minParLigne: 20 });
console.log(avec.prior === prior);                                                    // mesuré : true
console.log(JSON.stringify(avec.parContexte) === JSON.stringify(sans.parContexte));   // mesuré : true
```

J'avais écrit qu'en passant l'a priori d'un **autre** jeu de données le second `console.log`
deviendrait `false`. **Mesuré : il reste `true`.** Puis, en rendant la série mince pour déclencher la
mutualisation : **encore `true`**. Il a fallu comprendre `fitTransitions` ligne à ligne pour voir que
l'a priori ne modifie une ligne que si **trois** conditions sont réunies **ensemble** :

1. la ligne a **au moins une** transition — sinon `total === 0`, la ligne reste **vide** et la fonction
   `continue` **avant** d'atteindre le code de mutualisation ;
2. elle en a **moins que `minParLigne`** — sinon `poids` vaut `mutualisation`, dont le défaut est `0` ;
3. l'a priori a **une valeur pour cette case** — sinon `priorRow?.[to] ?? e` retombe sur la valeur
   empirique.

Mes deux premières tentatives échouaient sur (1) et (2) : rendre la série mince en gardant une journée
sur quarante **casse la consécutivité des jours**, donc il n'y a plus aucune transition du tout — pas
« peu », **zéro**. Voici la version qui marche (jours consécutifs, une seule zone, seuil élevé) :

```ts
const petit = /* 730 jours consécutifs, 1 zone */;
const etranger = fitTransitions(/* autres dynamiques, toutes lignes peuplées */, { minParLigne: 1 });
const sans = fitConditionnel(petit, (o) => contexteMois(o.day), { minParLigne: 200 });
const avec = fitConditionnel(petit, (o) => contexteMois(o.day), { minParLigne: 200, prior: etranger });
```

**Mesuré** : 12 contextes sur 12 mutualisés, et la ligne `vigilance` de juillet passe de
`{libre: 0.246, vigilance: 0.408, alerte: 0.345}` à
`{libre: 0.167, vigilance: 0.111, alerte: 0.336, AR: 0.136, crise: 0.25}`.

La leçon est plus utile que celle que j'avais annoncée : **une ligne vide et une ligne mince ne sont
pas le même cas**, et seule la seconde est mutualisée. Une ligne sans aucune transition n'est pas
estimée « faiblement », elle n'est **pas estimée** — ce que `donneesInsuffisantes` dit, et ce que le
sprint 48 avait déjà dû distinguer dans ses assertions.
