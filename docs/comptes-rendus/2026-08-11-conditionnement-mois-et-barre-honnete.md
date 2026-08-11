# Compte rendu — conditionner au mois, et la barre honnête (Sprint 49)

**Date** : 2026-08-11 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 49

---

## 1. La question initiale

> « Continue »

(boucle `/loop 30m`, à la suite de l'arbitrage « Le run Actions » du sprint 47)

**Ce que j'ai compris** : poursuivre la piste que la calibration avait laissée ouverte. Deux
hypothèses sur l'absence de pouvoir d'anticipation du modèle N2 avaient été mesurées et écartées
(sprints 47 et 48) ; il restait celle de l'**inconditionnalité** — la chaîne ne regarde aucune
donnée, donc rien en elle ne peut savoir qu'il ne pleut pas. `docs/SPRINTS.md` la désignait comme le
premier travail de modèle.

**Ce que j'ai délibérément laissé de côté**, et pourquoi :

- **Les covariables hydrologiques elles-mêmes (SWI, IPS, débit, étiage).** J'ai commencé par
  **vérifier le verrou** que j'avais moi-même écrit — « aucun verrou sur les données » — et il est
  **faux** (§3). Trois des quatre covariables sont hors de portée sans un chantier de données, et il
  existe en plus un verrou spatial que je n'avais pas vu. Le mois est la seule covariable disponible
  à coût nul, donc c'est par elle qu'il fallait commencer.
- **Une régression logistique ordonnée**, forme « propre » d'un modèle conditionné. Écartée pour ce
  sprint : une matrice par contexte répond à la même question pour un dixième du travail, et si le
  conditionnement n'apporte rien, changer de forme d'estimateur n'y aurait rien changé non plus. Le
  test bon marché d'abord.
- **Le SWI départemental**, désormais chiffré comme reste n° 8 dans `SPRINTS.md` avec ses deux étapes
  de données. ⚠️ Avec, écrit **avant** de mesurer, ce qu'on peut en attendre : le SWI est mensuel,
  donc il varie entre deux juillets mais pas d'un jour à l'autre dans un mois.

---

## 2. Ce qui a été réalisé

**En une phrase** : le conditionnement existe, le mois s'avère un signal **très fort** (facteur 148
entre janvier et juillet) et **n'améliore pas d'un cheveu** la prévision du déclenchement — et on sait
maintenant pourquoi, ce qui contraint la suite.

**Dans les grandes lignes** :

- **La machinerie de conditionnement** (`fitConditionnel`) est indifférente à ce sur quoi on
  conditionne : un contexte est une chaîne de caractères, donc une bande d'humidité des sols sera une
  nouvelle fonction `contexteDe` et non une modification de l'estimateur.
- **La barre devient un paramètre** (`Reference`, `referenceParContexte`). C'est le vrai apport du
  sprint : la barre par défaut **devient fausse** dès que le modèle gagne une covariable.
- **Le mois est retrouvé proprement** : `P(quitte l'état libre)` va de 0,010 %/jour en janvier à
  1,479 % en juillet, sur 12 contextes tous bien fournis et **aucun mutualisé**.
- **Troisième réfutation** : −0,58 contre la barre annuelle, **−0,76 contre la barre mensuelle**,
  100 plis perdus sur 100. À barre égale, conditionner au mois rapporte **+0,016**.
- **Une erreur à moi, corrigée par vérification fichier par fichier** : le « verrou : aucun » de
  `SPRINTS.md` était faux, y compris sur un point que je n'avais pas vu du tout (aucune géométrie de
  zone d'alerte au dépôt).

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/markov.ts` | modifié | `Contexte`, `contexteMois`, `fitConditionnel`, `ligneConditionnelle`. Une matrice par contexte, contextes minces **mutualisés et listés**, contexte inconnu → repli sur la matrice inconditionnelle (jamais une prévision vide). En-tête : le résultat mesuré et **sa raison**. |
| `lib/validation.ts` | modifié | `Reference`, `REFERENCE_CLIMATOLOGIQUE`, `referenceParContexte`. `validationCroisee` prend sa référence en paramètre et **la nomme dans le résultat**. |
| `scripts/calibration/run.ts` | modifié | Section 6, fusionnée dans le bloc à cinq états pour réutiliser son échantillon et son ensemble de **déclenchements**. Le même modèle noté **deux fois**, contre les deux barres. `departsParMois` publié indépendamment de tout score. |
| `scripts/test/markov.test.ts` | modifié | Section 5 ter : **17** vérifications, dont la **récupération** d'un processus saisonnier et la **propriété d'équité** de la barre. 103 vérifications au total (86 avant). |
| `lib/noteMethodologique.ts` | modifié | Une limite de plus, en français grand public : « savoir la saison n'y change rien », avec les deux chiffres et la raison. |
| `docs/SPRINTS.md` | modifié | Reste n° 7 mesuré et clos ; **tableau de vérité des quatre covariables** remplaçant mon « verrou : aucun » ; reste n° 8 (SWI départemental) chiffré. |
| `docs/HANDBOOK.md` | modifié | Entrée sprint 49, idiomes **12** et **13**. |

---

## 3. Erreurs potentielles

### Bugs et erreurs trouvés et corrigés pendant la session

**1. « *Verrou* : aucun sur les données » était faux, et je l'avais écrit moi-même.** En ouvrant les
fichiers plutôt qu'en me relisant, j'ai confondu deux choses : *le code qui calcule une covariable est
au dépôt* et *l'historique de cette covariable est au dépôt*. Vérifié :

| Covariable | Ce que j'avais supposé | Ce qui est vrai |
| --- | --- | --- |
| **Mois** | — | ✅ disponible sans rien fetcher |
| **SWI** | « déjà dans le dépôt » | ⚠️ `data/swi/` n'embarque que la **climatologie** (quantiles 1990-2019 par maille) ; les valeurs mensuelles sont dans 7 CSV décennaux sur data.gouv |
| **IPS** | « déjà dans le dépôt » | ❌ `computeIps` rend **une valeur ponctuelle** (« où se situe le dernier mois »), pas une série ; fetch en `daysAgoIso(...)`, station par station |
| **Débit / étiage** | « déjà dans le dépôt » | ❌ même problème (`computeLowFlow`) |

**2. Et un verrou que je n'avais pas vu du tout : il n'y a aucune géométrie de zone d'alerte au
dépôt.** L'archive ne porte que `zones_alerte.code` et `departement`. **Aucune covariable spatiale ne
peut donc être rattachée à une zone**, au mieux à un département. C'est le verrou le plus structurant
de la suite, et il était absent de ma roadmap.

**3. La section de conditionnement notait la mauvaise chose.** Écrite d'abord sur `observations` — le
jeu à quatre états, jours restreints seulement. Sur ces données, un « jour de transition » est un
changement de niveau **à l'intérieur** d'une restriction : le **déclenchement n'existe pas comme
événement**. Corrigé en fusionnant la section dans le bloc à cinq états pour réutiliser son
échantillon et son ensemble `declenchements`. ⚠️ Sans cette correction, le sprint aurait produit un
chiffre sur une question qui n'est pas celle qu'on pose.

**4. La barre par défaut serait devenue silencieusement injuste.** `validationCroisee` construisait
toujours une climatologie inconditionnelle. C'est la bonne barre pour un modèle inconditionnel et la
mauvaise dès que le modèle connaît le mois. Non corrigé, ce sprint aurait publié **−0,58** au lieu de
**−0,76**, soit **0,18 de Brier** de flatterie. Ici la conclusion ne s'inverse pas ; c'est un hasard,
pas une garantie.

### Non vérifié en conditions réelles

- **Le SWI n'a pas été testé.** Tout ce qui est écrit sur son intérêt attendu est une **prédiction**,
  y compris la réserve « il est mensuel, donc il ne bougera pas d'un jour à l'autre ».
- **Un seul découpage de validation.** Les trois réfutations reposent sur du
  *leave-one-department-out*. Aucune n'a été rejouée en *leave-one-year-out* sur les déclenchements.
- **L'échantillon à cinq états est le même qu'au sprint 48** (2 844 zones sur 10 221). Le
  conditionnement n'a donc pas été mesuré sur l'archive entière, et le résultat en hérite des trois
  limites du sprint 48 — dont la contamination des 1 523 lignes sans zone.
- **`departsParMois` n'a pas été confronté à une source externe.** Le profil (pic en juillet-août)
  est cohérent avec ce qu'on sait des sécheresses françaises, mais « cohérent avec l'intuition » n'est
  pas une validation.

### Hypothèses qui pourraient ne pas tenir

- **12 mois est peut-être le mauvais découpage.** Des saisons (4 contextes) donneraient plus de
  données par contexte, un découpage par décade (36) en donnerait moins mais collerait mieux aux
  arrêtés. Rien n'a été essayé d'autre : le choix « mois » est un **choix par défaut**, pas un optimum
  mesuré.
- **`minParContexte = 100`** dans `referenceParContexte` est un seuil **posé à la main**. Aucun
  contexte ne l'a déclenché sur ces données, donc **ce repli n'a jamais été exercé en réel**.
- **La raison avancée pour l'échec** — « le mois ne varie pas à l'intérieur de son contexte » — est
  une **explication cohérente avec les chiffres**, pas une démonstration. Elle prédit qu'une
  covariable qui varie dans le mois ferait mieux ; c'est cette prédiction qu'il faut tester, et elle
  peut être fausse.
- **L'ordre de grandeur du temps de calcul** est devenu un facteur : le run a pris **~28 minutes**
  contre ~3,5 au sprint 47. Un contexte plus fin ou une covariable de plus, et il faudra optimiser
  plutôt que d'ajouter.

### Ce qui casserait si une source amont changeait

- **Un fuseau différent sur les dates d'arrêté** décalerait `contexteMois` d'un jour aux bornes de
  mois. Sans effet sur un signal saisonnier, mais réel.
- **Une archive rebâtie avec d'autres codes de zone** invaliderait l'échantillon (le round-robin est
  déterministe **pour un fichier donné**, pas entre deux versions du fichier).

---

## 4. Points d'amélioration

**Dette assumée**

- **Une matrice par contexte plutôt qu'une régression.** Assumé : c'est le test le moins cher de
  l'hypothèse, et il a suffi à la réfuter. Une régression aurait coûté dix fois plus pour la même
  conclusion.
- **Le mois comme unique contexte.** Assumé pour ce sprint, avec la raison de son échec écrite.
- **Les deux barres sont publiées ensemble**, pas seulement la plus favorable. C'est le point du
  sprint, pas une précaution.

**À reprendre**

- **`fitConditionnel` recalcule l'a priori inconditionnel à chaque appel**, donc à chaque pli. C'est
  la moitié du coût de calcul, et elle est redondante : l'a priori pourrait être passé en option comme
  `fitTransitions` le permet déjà. À faire **avant** d'ajouter une covariable, pas après.
- **Trois passes de validation sur le même échantillon** (global, transitions, déclenchements) refont
  chacune l'ajustement par pli. Un seul passage renvoyant plusieurs scores diviserait le temps par
  trois. C'est ce qui rendra le SWI abordable.
- **`departsParMois` ne va nulle part dans l'interface.** C'est pourtant le chiffre le plus
  présentable de tout le sprint — « une restriction démarre 148 fois plus souvent en juillet qu'en
  janvier » se comprend sans rien connaître au sujet.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — dernier commit de code
  `cac9ca2`, puis `9cc084f` écrit par le workflow Actions (rapport de calibration).
- **`main` touché ?** : **NON.** Aucun merge, aucune demande en ce sens.
- **Pull request** : **aucune** — non demandée.
- **Déployé en prod ?** : **non.** Vercel suit `main`, qui n'a pas bougé. ⚠️ Onzième session sans
  regarder la prod. Ce sprint ne touche aucune interface, mais la dette d'interface reste entière.
- **Vérifications passées** :
  - `npm run build` — clean
  - `npm run lint` — clean
  - **31 suites**, 0 échec — `markov.test.ts` passe de **86 à 103** vérifications
  - e2e **non rejoué** ce sprint : aucun fichier de `components/` ou `app/` n'a été touché
    (`git diff --stat` ne porte que sur `lib/`, `scripts/` et `docs/`). ⚠️ Dit ici plutôt que
    d'annoncer 119/119 sans les avoir lancés.
  - **1 run GitHub Actions** : 31498428653, `success`, **~28 minutes**
  - ⚠️ `npx tsc --noEmit` : toujours l'erreur `TS1501` **pré-existante** dans `report.test.ts`

---

## 6. Prochaines étapes

1. **Réduire le coût d'un run avant d'ajouter une covariable.** Passer l'a priori en option à
   `fitConditionnel`, et faire une passe de validation qui rend plusieurs scores. *Verrou* : aucun.
   ⚠️ À faire d'abord : à 28 minutes par run, la prochaine mesure est déjà inconfortable.
2. **Conditionner sur le SWI départemental.** *Verrou* : deux étapes de données, toutes deux
   faisables — récupérer les 7 CSV décennaux (egress → Actions) et rattacher les départements aux
   mailles SAFRAN (`departements.geojson` et `cells.json` sont au dépôt). ⚠️ Avec la réserve écrite
   d'avance : le SWI est mensuel.
3. **Regarder la prod.** *Verrou* : humain. **Onze sessions.**
4. **Publier `departsParMois` quelque part.** *Verrou* : décider où — c'est un chiffre pédagogique,
   pas un chiffre d'exploitation.
5. **Rejouer une réfutation en *leave-one-year-out*.** *Verrou* : aucun, sinon le temps de calcul du
   point 1.
6. **Trois à cinq sites pilotes.** *Verrou* : **commercial**, et toujours le seul que le code ne
   lèvera pas.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Un industriel veut savoir si l'eau va lui être coupée. Nous avons un modèle statistique censé
répondre, et depuis trois sessions il répond mal. Chaque session teste une explication et l'élimine.

Cette fois, l'explication testée est : **le modèle ne regarde rien**. Il sait seulement dans quel état
la zone était hier, et il en déduit l'état de demain à partir de ce qui s'est passé en moyenne dans le
passé. Il ne sait pas s'il a plu, ni quelle saison on est. Un modèle aveugle.

Le test le moins coûteux consiste à lui donner **une** information : le mois. Ça ne demande aucune
donnée nouvelle, puisque les dates des arrêtés sont déjà là.

Et là se trouve le piège de la session, qui est un piège de **méthode** et pas de code. Si je donne le
mois au modèle et que je le compare à un adversaire qui ignore le mois, le modèle va gagner — mais il
n'aura rien appris sur l'eau, il aura appris que les sécheresses sont estivales, et son adversaire
était simplement handicapé. Pour que la comparaison veuille dire quelque chose, **l'adversaire doit
connaître le mois aussi**.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Arrêté sécheresse** | Décision préfectorale qui restreint des usages de l'eau sur une zone, avec des dates. |
| **Zone d'alerte** | Découpage administratif sur lequel un niveau s'applique. Plus de 10 000 en France. |
| **Chaîne de Markov** | Modèle où l'état de demain ne dépend que de l'état d'aujourd'hui. |
| **Matrice de transition** | Le tableau des probabilités de passer d'un état à un autre en un jour. |
| **État libre** | Notre cinquième état : « aucun arrêté en vigueur » (ajouté au sprint 48). |
| **Déclenchement** | Le jour où une zone passe de libre à sous arrêté. **La question du client.** |
| **Conditionner** | Ajuster un modèle séparément selon une circonstance (ici : le mois). |
| **Contexte** | Une valeur de cette circonstance — ici « 07 » pour juillet. |
| **Score de Brier** | Note d'une prévision probabiliste. **Plus bas = meilleur.** |
| **Baseline / référence** | La prévision bête qu'il faut battre pour prétendre servir à quelque chose. |
| **Climatologie** | Une référence : « la répartition moyenne observée dans le passé ». |
| **Gain** | `Brier(référence) − Brier(modèle)`. **Positif = le modèle est meilleur.** |
| **Leave-one-department-out** | Retirer un département, ajuster sur les 99 autres, noter sur celui-là, 100 fois. |
| **Mutualiser (pooling)** | Remplacer une estimation trop peu fournie par une estimation globale, **et le dire**. |

### 7.3 Comment le code s'y prend

#### a) Conditionner : une matrice par mois

Un contexte est une simple chaîne de caractères, et c'est un choix de conception, pas de la paresse
(`lib/markov.ts`) :

```ts
export type Contexte = string;

/** Calendar month of a day index, as a context: "01".."12". */
export function contexteMois(day: number): Contexte {
  const mois = new Date(day * 86_400_000).getUTCMonth() + 1;
  return String(mois).padStart(2, "0");
}
```

L'ajustement groupe les observations par contexte et ajuste une matrice par groupe, en mutualisant les
groupes trop minces vers la matrice **inconditionnelle** :

```ts
const prior = fitTransitions(observations, { minParLigne: 1 });   // la matrice inconditionnelle
for (const [c, subset] of groupes) {
  const m = fitTransitions(subset, { ...options, prior });
  parContexte[c] = enforceMonotonicity(m).matrix;
  if (m.donneesInsuffisantes.length > 0) contextesMutualises.push(c);   // signalé, pas caché
}
```

Et pour un contexte jamais vu, le repli est la matrice inconditionnelle, **jamais** une prévision
vide :

```ts
export function ligneConditionnelle(modele, contexte, etat) {
  const row = modele.parContexte[contexte]?.p[etat];
  if (row && Object.keys(row).length > 0) return row;
  return modele.prior.p[etat] ?? {};
}
```

Pourquoi cette précaution ? Parce qu'une prévision vide **n'est pas une absence de note**. Le score de
Brier lit chaque état manquant comme « probabilité 0 », donc une prévision vide est notée comme une
affirmation *certaine et fausse*. Un mois inconnu n'est pas une preuve qu'il ne se passe rien : c'est
une absence de preuve.

#### b) La barre, et pourquoi elle est devenue un paramètre

Voici le cœur de la session. Avant, `validationCroisee` fabriquait toujours la même référence.
Maintenant elle la reçoit (`lib/validation.ts`) :

```ts
export interface Reference {
  nom: string;
  construire: (entrainement: JourEvalue[]) => (jour: JourEvalue) => Prevision;
}
```

La forme en **deux temps** — construire depuis le pli d'entraînement, puis appliquer jour par jour —
n'est pas de la complication : c'est ce qui permet à la référence de dépendre du jour qu'on note *tout
en* n'étant bâtie que sur des données d'entraînement. Si on la construisait sur tout, elle
connaîtrait le pli de test, et la comparaison serait faussée.

La référence mensuelle regroupe l'entraînement par mois :

```ts
for (const [c, sous] of groupes) {
  parContexte.set(c, sous.length >= minParContexte ? baselineClimatologique(sous) : global);
}
return (jour) => parContexte.get(contexteDe(jour)) ?? global;
```

Et dans la validation, la seule ligne qui change tout :

```ts
const prevoirReference = reference.construire(entrainement);
// …
const brierBaseline = brier(testNotes.map((j) => ({ ...j, prevu: prevoirReference(j) })));
```

Enfin le nom de la barre **voyage avec le résultat**, parce qu'un gain sans sa barre ne veut rien
dire :

```ts
return { mode, restriction: restriction?.nom, reference: reference.nom, plis, /* … */ };
```

#### c) Ce que la mesure a donné

Le mois est un signal très fort. Voici la probabilité qu'une zone libre passe sous arrêté, par mois :

| Mois | 01 | 02 | 03 | 04 | 05 | 06 | **07** | 08 | 09 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| %/jour | 0,010 | 0,024 | 0,083 | 0,182 | 0,258 | 0,776 | **1,479** | 1,386 | 0,714 | 0,157 | 0,099 | 0,026 |

Facteur **148** entre janvier et juillet, sur 12 contextes tous fournis à plus de 150 000 transitions.
La machinerie fonctionne et la saisonnalité est réelle.

Et pourtant, sur les 14 723 déclenchements :

| Barre | Gain | Plis perdus |
| --- | --- | --- |
| climatologie **annuelle** | **−0,58** | 100 / 100 |
| climatologie **mensuelle** | **−0,76** | 100 / 100 |

**La raison, qui est la vraie leçon.** Une covariable n'aide à désigner un **jour** que si elle varie
**à l'intérieur de son propre contexte**. Le mois ne varie pas : tous les jours de juillet reçoivent
le même 1,479 %. Il améliore donc le **taux** — combien d'arrêtés en juillet — et jamais la **date**.
Et la climatologie mensuelle connaît déjà ce taux : voilà pourquoi la barre honnête efface le gain.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Une matrice par mois plutôt qu'une régression.** Une régression logistique ordonnée est la forme
« propre » d'un modèle conditionné et aurait pris dix fois plus longtemps. Or la question était
binaire : *le conditionnement apporte-t-il quelque chose ?* Une matrice par contexte y répond, et la
réponse étant non, la forme de l'estimateur n'était pas le sujet. Choisir le test le moins cher qui
peut réfuter, c'est ce qui a permis trois réfutations en une journée.

**Un contexte en `string` plutôt qu'un type énuméré.** Un `type Contexte = string` laisse
`fitConditionnel` indifférent à ce sur quoi on conditionne. Ajouter le SWI sera une nouvelle fonction
`contexteDe`, pas une modification de l'estimateur. Le prix est qu'aucun compilateur ne vérifiera les
contextes ; c'est acceptable parce qu'ils sont produits par une seule fonction chacun.

**Deux barres publiées plutôt qu'une.** J'aurais pu ne garder que la barre mensuelle, la seule
honnête. Publier les deux montre **combien** la barre facile flatte — 0,18 de Brier ici — et c'est
cette quantité qui rend l'exigence convaincante plutôt que dogmatique.

**Noter les déclenchements et pas tous les jours de transition.** Un changement de niveau à
l'intérieur d'une restriction est déjà un événement rare et intéressant, mais ce n'est pas la question
du client. Restreindre à l'événement dont il se soucie est ce qui donne au chiffre un sens.

**Vérifier mon propre verrou avant de construire.** `SPRINTS.md` disait « aucun verrou sur les
données ». J'ai ouvert les fichiers, et c'était faux. Une demi-heure de lecture a évité d'attaquer un
chantier de covariables hydrologiques qui aurait buté sur l'absence de géométrie de zone — un mur
invisible depuis la roadmap.

### 7.5 Pour expérimenter soi-même

**Expérience A — rendre la barre aveugle, et voir la flatterie apparaître.**
Dans `scripts/calibration/run.ts`, notez le modèle deux fois contre la **même** référence annuelle :

```ts
const contreMensuelle = validationCroisee(
  jours, "leave_one_department_out", informeMois, surDeclenchements,   // refMois retiré
);
```

Vous n'avez pas de quoi rejouer le run réel (egress bloqué), mais la même propriété est testée sur du
synthétique : `npx tsx scripts/test/markov.test.ts`. **Mesuré : 3 échecs** —
`reference: the bar is NAMED in the result…`, `reference: the same model scores HIGHER against a
month-blind bar…` et `reference: … and the difference is the seasonality the blind bar was denied`.
(Le premier tombe parce que le nom de la barre voyage avec le résultat : retirer la référence change ce
nom, et c'est voulu — un gain ne doit jamais pouvoir être cité sans sa barre.) Pour voir l'écart en clair,
lancez le script de mesure décrit dans le commentaire de la section 6 : **+0,4534** contre la barre
aveugle, **+0,0971** contre la barre informée. **79 % du gain apparent** n'était que la saisonnalité
dont la barre avait été privée. C'est l'expérience à faire si vous n'en faites qu'une.

**Expérience B — casser le repli de contexte inconnu.**
Dans `lib/markov.ts`, faites répondre `ligneConditionnelle` par du vide :

```ts
export function ligneConditionnelle(modele, contexte, etat) {
  return modele.parContexte[contexte]?.p[etat] ?? {};   // plus de repli sur le prior
}
```

`npx tsx scripts/test/markov.test.ts` → **mesuré : 2 échecs**,
`conditionnel: an unseen context falls back to the unconditional row` et
`conditionnel: … and that fallback IS the unconditional row, not a guess`. Puis mesurez ce que coûte
une prévision vide :

```ts
console.log(brier([{ zone: "z", day: 1, observe: "crise", prevu: {} }]));           // mesuré : 1
console.log(brier([{ zone: "z", day: 1, observe: "crise", prevu: { crise: 1 } }])); // mesuré : 0
```

Une prévision vide est notée **1**, pas « non notée ». Un mois jamais observé serait donc puni comme
une erreur certaine, alors qu'il n'est qu'une absence d'information.

**Expérience C — donner au modèle une covariable qui ne varie pas du tout.**
Conditionnez sur une constante, ce qui doit ramener exactement le modèle inconditionnel :

```ts
const cond = fitConditionnel(saisonnier, () => "tout", { minParLigne: 20 });
console.log(cond.contextes);                                     // mesuré : [ 'tout' ]
console.log(JSON.stringify(cond.parContexte.tout.p.vigilance));
console.log(JSON.stringify(cond.prior.p.vigilance));
```

Mesuré, les deux lignes sont **identiques au chiffre près** :
`{"aucune_restriction":0.1571…,"vigilance":0.6857…,"alerte":0.1571…,"alerte_renforcee":0,"crise":0}`.

C'est le cas limite qui rend concrète la leçon du sprint : une covariable qui ne varie pas n'apporte
rien, et le mois est plus proche de ce cas qu'on ne le croit — il ne varie **pas à l'intérieur d'un
mois**, qui est précisément l'échelle à laquelle il faudrait désigner un jour.
