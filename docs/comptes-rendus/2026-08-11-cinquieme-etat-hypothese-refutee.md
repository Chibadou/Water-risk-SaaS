# Compte rendu — le cinquième état, et une hypothèse réfutée (Sprint 48)

**Date** : 2026-08-11 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 48

---

## 1. La question initiale

> `/loop 30m Continue`

**Ce que j'ai compris** : reprendre le travail au point le plus utile sans nouvelle instruction, en
boucle toutes les 30 minutes. Le point le plus utile était désigné par le sprint précédent
lui-même : la calibration du 2026-08-11 avait mesuré que le modèle N2 n'anticipe rien (−1,16 de
Brier sur les jours de transition) et nommé **une cause probable** — la chaîne n'avait pas d'état
« aucune restriction », donc elle ne pouvait pas *représenter* l'arrivée d'une restriction. C'était
le seul reste non bloqué à forte valeur (`SPRINTS.md`, reste n° 6).

**Ce que j'ai délibérément laissé de côté** :

- **Les covariables de §5.3 comme régresseurs.** Devenues la piste n° 1 *à cause* du résultat de
  cette session, mais ouvrir les deux chantiers ensemble aurait rendu impossible d'attribuer un
  changement de score à l'un ou à l'autre. On mesure un changement de modèle à la fois.
- **Faire consommer le modèle par le produit.** Rien dans l'interface ne lit `ModeleN2`, et le
  résultat de cette session est une raison de plus : `calibre` reste `false`.
- **L'archive entière pour l'ajustement à cinq états.** Matérialiser les journées libres des 10 221
  zones fait ~50 M d'observations (~5 Go), au-delà du runner. Échantillon **déclaré** de 2 844 zones
  tiré en round-robin sur les départements — voir §3 pour ce que ça coûte en portée.

---

## 2. Ce qui a été réalisé

**En une phrase** : la chaîne N2 sait maintenant représenter l'arrivée et la fin d'une restriction,
et cela a servi à **éliminer** l'explication qu'on lui prêtait plutôt qu'à améliorer le modèle.

**Dans les grandes lignes** :

- **Le cinquième état existe, dans `lib/markov` et pas dans `lib/juridiche`.** « Aucune restriction »
  n'est pas un cinquième niveau qu'un préfet peut déclarer : c'est un état du *modèle*. Deux listes,
  deux propriétaires — `NIVEAUX` garde exactement quatre entrées, et un test miroir vérifie que la
  chaîne ne s'est pas glissée dans le fichier de la juridiction (anti-pattern n°9).
- **Il est bien peuplé, pas symbolique** : 6,0 M d'observations dont **73,5 % de journées libres**,
  `P(libre → libre)` = **0,9967** estimé sur 4,4 M de transitions, `donneesInsuffisantes` vide.
- **L'hypothèse est réfutée.** Sur les **14 723 déclenchements** (libre → sous arrêté), le gain de
  Brier vaut **−0,60 et le modèle perd dans les 100 départements**. Rendre l'événement
  représentable ne l'a pas rendu prévisible.
- **`enforceMonotonicity` a dû être réécrite, pas étendue** : elle indexait par *rang* en supposant
  que le premier état valait 1. Avec un état de rang 0, chaque probabilité aurait atterri une case
  trop sévère — **en laissant chaque ligne sommer à 1**, donc invisible à toute vérification par
  totaux.
- **Une confirmation en prime** : l'hystérésis restreinte aux quatre niveaux ressort à **1,78** sur
  ce nouvel échantillon à cinq états, contre **1,77** sur les 10 221 zones à quatre états. Deux
  mesures indépendantes du même argument physique.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/markov.ts` | modifié | `ETAT_LIBRE`, `EtatChaine`, `ETATS_CHAINE`, `rangEtat`, `verifierOrdreEtats`. Matrices, comptage, ajustement, monotonie, asymétrie et tirage généralisés aux cinq états. `asymetrie` prend son ensemble d'états **explicitement**. |
| `lib/validation.ts` | modifié | `Prevision` et `JourEvalue.observe` portent un `EtatChaine`. Sans quoi la masse de probabilité placée sur « aucune restriction » **disparaîtrait** du score de Brier et le modèle serait sous-facturé. |
| `scripts/calibration/run.ts` | modifié | `observationsAvecEtatLibre` (complément du calendrier, bornes conservatrices), échantillonnage round-robin par département, ajustement à cinq états, validation sur **transitions** et sur **déclenchements**, verdict et trois limites embarquées. |
| `scripts/test/markov.test.ts` | modifié | Section 5 bis : 20 vérifications sur le nouvel espace d'états, dont le test miroir sur `lib/juridiction` et l'écart mesuré entre les deux asymétries. Trois assertions antérieures corrigées (§3). |
| `lib/noteMethodologique.ts` | modifié | La limite passe d'une **explication** (« l'état n'existe pas ») à une **mesure** (« l'état existe et le modèle échoue quand même »), en français grand public. |
| `docs/SPRINTS.md` | modifié | Reste n° 6 clos et **réfuté** ; reste n° 7 (covariables) promu premier travail de modèle, par élimination. |
| `data/calibration/report.json` | régénéré | Bloc `cinqEtats` : échantillon, deux asymétries, ligne depuis l'état libre, trois validations, verdict, limites. |

---

## 3. Erreurs potentielles

### Bugs trouvés et corrigés pendant la session

**1. `enforceMonotonicity` aurait décalé toutes les probabilités d'une case, silencieusement.**
Elle construisait sa fonction de survie en indexant par rang : `s[k] = P(rang ≥ k+1)`, ce qui suppose
que le premier état a le rang 1. `ETAT_LIBRE` a le rang 0. La reconstruction
`p[NIVEAUX[k]] = s[k] − s[k+1]` aurait donc écrit la probabilité de « libre » dans la case
« vigilance », celle de vigilance dans « alerte », etc. — **et chaque ligne aurait continué de sommer
à 1**, donc aucune vérification par totaux ne l'aurait vu. Réécrite pour indexer **par position**,
ce qui supprime l'hypothèse au lieu de la mettre à jour, avec `verifierOrdreEtats()` qui affirme
l'invariant dont elle dépend.

**2. La boucle de mutualisation parcourait `NIVEAUX`.** Sur cinq états, elle aurait purement et
simplement omis la colonne « libre » de chaque ligne mutualisée, laissant la ligne sommer à moins de
1. Une fuite de probabilité qu'aucune assertion en aval n'aurait su rattacher à cet endroit.

**3. `brier` sommait sur les quatre niveaux.** La masse que le modèle place sur « aucune
restriction » aurait disparu du total, **sous-facturant** le modèle : l'ensemble de notation et le
support de la prévision doivent être le même ensemble.

**4. Un `TypeError` sur une matrice écrite à la main.** Le type dit `Record<EtatChaine, …>`, donc
l'omission de la cinquième ligne dans une fixture *devrait* être une erreur de compilation. Elle ne
l'a pas été : **`npm run build` ne typecheck pas `scripts/`**. Le crash venait du fond d'une boucle
d'accumulation. Corrigé des deux côtés — fixture complétée, et lecture d'une ligne absente traitée
comme une ligne vide, cas que la fonction gérait déjà.

**5. Trois assertions devenues fausses — et le nouveau comportement est le bon.** Un état jamais
observé est désormais signalé `donneesInsuffisantes`, ce qui est correct (§5.4 interdit d'inventer
une distribution pour un état jamais vu) et faisait échouer « rien n'est signalé sur 40 000 jours ».
Surtout, `donneesInsuffisantes` mélange maintenant deux cas que l'ancienne assertion confondait : une
ligne **mince** est mutualisée et somme à 1, une ligne **vide** somme à 0. Ce qui ne doit jamais
arriver est une ligne **partiellement** remplie — c'est ce que la nouvelle assertion vérifie.

**6. Une variable locale nommée `rang`.** Dans le bloc d'échantillonnage, `rang` désignait un
index de zone alors que `rang` signifie « rang de sévérité » dans tout le dépôt. Renommée
`indexZone` avant que quiconque, moi compris, ne s'y trompe.

### Non vérifié en conditions réelles

- **L'ajustement à cinq états ne porte que sur 2 844 zones sur 10 221** (28 %). Les 100 départements
  sont représentés, mais le résultat est un résultat **d'échantillon**. Le verdict le dit ;
  l'extrapoler à l'archive entière serait une inférence, pas une lecture.
- **Le verdict négatif n'a pas été reproduit sur un second échantillon.** Il est net (−0,60, 100 plis
  perdus sur 100), mais un tirage indépendant n'a pas été fait.
- **La cause suivante — la chaîne inconditionnelle — n'est pas démontrée, c'est une élimination.**
  Deux explications ont été mesurées et écartées ; il en reste une plausible. Ce n'est pas la même
  chose que de l'avoir prouvée.
- **Rien de tout cela n'a été vu à l'écran.** Aucun élément d'interface ne consomme le modèle, donc
  il n'y avait rien à regarder — mais la dette « jamais vu en prod » n'est pas réduite pour autant,
  et elle atteint **dix sessions**.

### Hypothèses qui pourraient ne pas tenir

- **⚠️ La plus lourde : les journées libres sont DÉDUITES, pas observées.** Elles viennent du
  complément du calendrier. « Aucune période ne couvre ce jour » peut aussi signifier « un arrêté qui
  le couvrait a été perdu par le parseur » — et le même run mesure **1 523 lignes d'archive sans zone
  attribuable (12,1 %)**. Une fraction des 4,4 M de journées « libres » sont donc des journées
  restreintes déguisées. Cela biaise la chaîne vers une sortie de restriction trop facile, et rend
  tout résultat à cinq états une **borne supérieure de liberté**, pas une mesure. C'est écrit dans le
  rapport et dans le code.
- **Les deux bornes du complément sont des choix conservateurs, donc des choix.** Le span va du
  premier au dernier arrêté observé. Avant, on ne sait pas si la zone existait ; après, on ne sait pas
  si elle existe encore (VigiEau redessine son référentiel). Remplir jusqu'à la fin de l'archive
  aurait inventé **sept ans** de liberté pour toute zone muette depuis 2019 — il y en a des milliers.
  Le prix payé est de perdre les périodes libres terminales, donc de sous-représenter les sorties de
  restriction longues.
- **L'échantillonnage round-robin suppose que les zones d'un département sont interchangeables.**
  Prendre la n-ième zone de chaque département n'est pas un tirage aléatoire : si l'ordre des zones
  dans le fichier est corrélé à quelque chose (ancienneté du code, taille), l'échantillon l'est aussi.

### Ce qui casserait si une source amont changeait

- **Un cinquième niveau légal ajouté à `NIVEAUX`** casserait `verifierOrdreEtats()` — c'est
  exactement ce que ce garde-fou est là pour attraper, puisque l'indexation par position de
  `enforceMonotonicity` en dépend.
- **Une étiquette de gravité inconnue dans l'archive** ferait monter `rejets.niveauIllisible`
  (compteur ajouté au sprint 47, à 0 aujourd'hui) et, ici, **gonflerait faussement les journées
  libres** : une ligne rejetée devient un jour « sans arrêté ». Les deux défauts se composent.

---

## 4. Points d'amélioration

**Dette assumée**

- **Le résultat est publié négatif, deux fois de suite.** Le +0,44 global de l'ajustement à cinq
  états est le même mirage que le +0,69 du sprint 47, pour la même raison, et il part avec ses deux
  contre-mesures accolées.
- **Deux asymétries au lieu d'une.** Plus encombrant à lire, mais un seul nombre aurait invalidé le
  1,77 publié sans que rien ne le signale : 1,78 contre 0,63 selon l'ensemble d'états.
- **L'échantillon plafonné à 6 M d'observations** est calibré sur le temps de calcul (trois passes
  de leave-one-department-out, ~100 ajustements chacune), pas sur la statistique.

**À reprendre**

- **`scripts/` n'est pas typechecké.** C'est ce qui a laissé passer le `TypeError` du §3.4, alors que
  le type l'interdisait. Un `tsc --noEmit` couvrant `scripts/` est la vérification la moins chère qui
  reste — le blocage est l'erreur `TS1501` pré-existante dans `report.test.ts`, à corriger d'abord.
- **Les trois validations refont chacune l'ajustement par pli.** Trois passes redondantes là où un
  seul ajustement pourrait servir plusieurs ensembles de notation. `validationCroisee` gagnerait à
  accepter *plusieurs* sous-ensembles en une passe — à faire quand un quatrième apparaîtra.
- **`observationsAvecEtatLibre` vit dans le script de calibration** alors que c'est une transformation
  de données réutilisable. À déplacer dans `lib/` le jour où un second appelant existe.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — dernier commit de code
  `31dca3d`, puis `9b25dbe` écrit par le workflow (rapport de calibration).
- **`main` touché ?** : **NON.** Aucun merge, aucune demande.
- **Pull request** : **aucune** — non demandée.
- **Déployé en prod ?** : **non.** Vercel suit `main`, qui n'a pas bougé.
- **Vérifications passées** :
  - `npm run build` — clean
  - `npm run lint` — clean
  - **31 suites**, 0 échec (`markov.test.ts` passe de 65 à **86** vérifications)
  - **119/119** e2e (inchangé : aucun élément d'interface touché)
  - **Logique du complément vérifiée localement** sur une archive synthétique, l'egress étant bloqué :
    span exactement `[premier, dernier]` arrêté, 50 journées restreintes / 335 libres, lignes sommant
    à 1 sur les cinq états.
  - **1 run GitHub Actions** : 31495086087, `success`, ~18 minutes.
  - ⚠️ `npx tsc --noEmit` : l'erreur `TS1501` dans `report.test.ts` reste **pré-existante** (vérifiée
    sur arbre propre au sprint 47).

---

## 6. Prochaines étapes

1. **Faire des covariables de §5.3 de vrais régresseurs.** Première piste qui pourrait plausiblement
   marcher, obtenue **par élimination** de deux autres. *Verrou* : aucun sur les données — quatre des
   six covariables sont déjà dans le dépôt (SWI, IPS, débit standardisé, étiage). C'est un changement
   de **forme** du modèle : une régression conditionnée remplace une matrice de comptages, avec son
   propre re-run sur les déclenchements.
2. **Regarder la prod.** *Verrou* : humain. ⚠️ **Dix sessions.**
3. **Typechecker `scripts/`.** *Verrou* : corriger d'abord `TS1501` dans `report.test.ts`.
4. **Reproduire le verdict sur un second échantillon de zones.** *Verrou* : aucun, un run Actions.
5. **Quatre champs de saisie** (`profilMensuel`, `tamponM3`, `seuilTechniqueM3`, `paliers`).
   *Verrou* : rédactionnel.
6. **Trois à cinq sites pilotes.** *Verrou* : **commercial**, et toujours le seul que le code ne
   lèvera pas.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Nous avons un modèle qui essaie de dire comment les restrictions d'eau vont évoluer. La session
précédente avait établi qu'il **ne prévoit rien** : il paraît bon quand on le note de la façon
habituelle, et il est mauvais dès qu'on le note sur les journées où quelque chose change.

Nous avions une explication séduisante. Le modèle ne connaissait que quatre situations — les quatre
degrés de restriction que peut décréter un préfet. Il n'avait **aucune façon de représenter « il n'y a
pas de restriction »**. Or c'est justement la question qu'une entreprise pose en premier : « est-ce
qu'une restriction va tomber chez moi ? » Un modèle qui n'a pas de mot pour « pas de restriction » ne
peut évidemment pas prédire qu'on va en sortir. L'explication tenait debout.

Cette session a ajouté ce mot manquant, puis remesuré. **Le modèle échoue toujours.** L'explication
était fausse. C'est le genre de résultat qui n'a l'air de rien et qui fait avancer : il reste une
explication plausible au lieu de deux, et on sait laquelle essayer ensuite.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Arrêté sécheresse** | Décision du préfet restreignant des usages de l'eau sur une zone, entre deux dates. |
| **Niveau de gravité** | Les quatre échelons légaux : vigilance, alerte, alerte renforcée, crise. |
| **État de la chaîne** | Ce que le modèle sait distinguer. Désormais cinq : les quatre niveaux **plus** « aucune restriction ». Ce n'est pas la même liste que les niveaux légaux. |
| **Chaîne de Markov** | Modèle supposant que l'état de demain ne dépend que de l'état d'aujourd'hui. |
| **Matrice de transition** | Le tableau des probabilités de passer d'un état à un autre en un jour. |
| **Diagonale** | Dans cette matrice, les probabilités de **rester** au même état. Ici jusqu'à 0,9967. |
| **Déclenchement** | Le jour où une zone passe de « libre » à « sous arrêté ». L'événement qui intéresse l'utilisateur. |
| **Score de Brier** | Note d'une prévision probabiliste. **Plus bas = meilleur.** |
| **Baseline climatologique** | Prévision de référence bête : « la répartition moyenne du passé ». Il faut la battre. |
| **Leave-one-department-out** | On retire un département, on ajuste sur les 99 autres, on note sur celui-là, 100 fois. |
| **Calendrier RLE** | Le calendrier compressé : au lieu d'une ligne par jour, des triplets `[jour de début, durée, niveau]`. |
| **Complément** | Déduire les jours *sans* restriction comme étant tous ceux que le calendrier ne couvre pas. |
| **Fonction de survie** | Ici : `P(l'état de demain est au moins aussi grave que X)`. Sert à corriger la matrice. |
| **Monotonie stochastique** | Contrainte de bon sens : être en crise aujourd'hui ne peut pas rendre la crise de demain *moins* probable qu'être en simple alerte. |

### 7.3 Comment le code s'y prend

#### a) Deux listes, deux propriétaires

Le piège le plus facile aurait été d'ajouter « aucune restriction » à la liste des niveaux. Ç'aurait
été faux : ce n'est pas un cinquième degré de sévérité qu'un préfet peut décréter. Alors la liste
légale reste où elle est, et le modèle déclare la sienne (`lib/markov.ts`) :

```ts
export const ETAT_LIBRE = "aucune_restriction" as const;
export type EtatChaine = NiveauGravite | typeof ETAT_LIBRE;
/** ordonnés par sévérité, le moins grave d'abord */
export const ETATS_CHAINE: EtatChaine[] = [ETAT_LIBRE, ...NIVEAUX];
export function rangEtat(etat: EtatChaine | undefined | null): number {
  if (etat === undefined || etat === null || etat === ETAT_LIBRE) return 0;
  return rang(etat);
}
```

Un test *miroir* — qui lit le code source au lieu d'appeler une fonction — vérifie que la chaîne ne
s'est pas glissée dans le fichier de la juridiction :

```ts
check("etats: the fifth state is declared by the MODEL, not by the jurisdiction",
  !/aucune_restriction/.test(readFileSync("lib/juridiction.ts", "utf-8")));
```

Aucun test de valeur ne pourrait voir ça : les deux versions calculeraient les mêmes nombres.

#### b) Le bug le plus intéressant : un décalage qui aurait sommé à 1

La correction de monotonie travaille sur des fonctions de survie. L'ancienne version les indexait par
**rang** :

```ts
// AVANT — suppose que le premier état a le rang 1
for (let k = 1; k <= NIVEAUX.length; k++) {
  let acc = 0;
  for (const to of NIVEAUX) if (rang(to) >= k) acc += out.p[from][to] ?? 0;
  s.push(acc);
}
// …puis : p[NIVEAUX[k]] = s[k] − s[k+1]
```

Ça marchait parce que `rang(NIVEAUX[k]) === k + 1`. `ETAT_LIBRE` a le rang **0** : l'hypothèse
devient fausse, et la probabilité de « libre » serait écrite dans la case « vigilance », celle de
vigilance dans « alerte », et ainsi de suite. **Chaque ligne aurait continué de sommer à 1.** Un
décalage de tout le vecteur est invisible pour qui vérifie des totaux.

La correction n'est pas de mettre l'hypothèse à jour, mais de la **supprimer** — indexer par position :

```ts
// APRÈS — s[j] = P(l'état de demain est ETATS_CHAINE[j] ou plus grave)
const survie = (from: EtatChaine): number[] => {
  const row = out.p[from] ?? {};
  const s: number[] = [];
  for (let j = 0; j < ETATS_CHAINE.length; j++) {
    let acc = 0;
    for (let k = j; k < ETATS_CHAINE.length; k++) acc += row[ETATS_CHAINE[k]] ?? 0;
    s.push(acc);
  }
  return s;
};
```

Cette version vaut pour **n'importe quel** espace d'états ordonné et contigu. L'invariant dont elle
dépend est vérifié plutôt que supposé :

```ts
export function verifierOrdreEtats(): boolean {
  return ETATS_CHAINE.every((e, i) => rangEtat(e) === i);
}
```

#### c) Fabriquer les journées libres sans les inventer

L'archive liste des arrêtés. Un jour qu'aucun arrêté ne couvre est donc un jour **sans restriction**…
mais seulement sur une période où l'on sait que la zone était surveillée. Les deux bords sont des
pièges, coupés de la même façon prudente (`scripts/calibration/run.ts`) :

```ts
const out: Observation[] = [];
for (let d = premier; d <= dernier; d++) {   // premier/dernier arrêté OBSERVÉ
  const observee = parJour.get(d);
  out.push(observee ?? { zone: code, day: d, niveau: ETAT_LIBRE, departement: zone.departement });
}
```

`premier` et `dernier` sont le premier et le dernier jour **effectivement vus sous arrêté**. Avant, on
ne sait pas si la zone existait ; après, on ne sait pas si elle existe encore — VigiEau redessine son
découpage, donc une zone muette depuis 2019 a peut-être été *supprimée* et non *épargnée*. Remplir
jusqu'à la fin de l'archive aurait inventé sept ans de tranquillité pour des milliers de zones.

#### d) Le contrôle qui a réfuté l'hypothèse

On construit l'ensemble des déclenchements, puis on note la **même** prévision dessus :

```ts
for (const o of echantillon) {
  const hier = parJourEtat.get(`${o.zone}|${o.day - 1}`);
  if (hier === undefined || hier === o.niveau) continue;
  transitions.add(`${o.zone}|${o.day}`);
  if (hier === ETAT_LIBRE && o.niveau !== ETAT_LIBRE) declenchements.add(`${o.zone}|${o.day}`);
}
```

Résultats mesurés, sur 6,0 M de journées et 100 départements :

| Ensemble noté | Gain de Brier | Plis perdus |
| --- | --- | --- |
| toutes les journées | **+0,44** | 0 / 100 |
| jours de transition | **−0,98** | **100 / 100** |
| **déclenchements** (14 723 journées) | **−0,60** | **100 / 100** |

La raison du mirage est lisible dans la matrice : `P(libre → libre) = 0,9967`. Une prévision qui
recopie hier a raison 997 fois sur 1 000. La baseline, elle, étale sa probabilité sur cinq états et se
trompe sans arrêt. Le +0,44 mesure la **persistance des situations**, pas la clairvoyance du modèle.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Pourquoi ne pas ajouter l'état à `NIVEAUX`.** Une ligne au lieu de trente. Mais `NIVEAUX` est
consommé par la carte, les badges de couleur, les libellés réglementaires : le produit aurait gagné un
cinquième niveau de gravité qui n'existe pas en droit. Le dépôt appelle ça l'anti-pattern n°9 (coder
en dur la nomenclature française), et la parade est qu'elle ait **un seul foyer**. Un état de modèle
n'est pas un niveau légal.

**Pourquoi indexer par position et non corriger l'arithmétique des rangs.** Écrire `rang(to) >= k + 1`
aurait marché aujourd'hui et cassé à la prochaine modification de l'espace d'états. Indexer par
position ne suppose plus rien sur les valeurs de rang.

**Pourquoi un échantillon, et pourquoi round-robin.** Les 10 221 zones × ~5 000 jours font ~50 M
d'observations, ~5 Go : le runner n'en a pas. Restait à choisir *comment* échantillonner. Prendre les
N premières zones par code aurait pris quelques départements entiers — et la validation
*leave-one-department-out* serait devenue triviale, parce que retirer un département dont il ne reste
qu'une zone ne teste plus rien. Le tirage round-robin garantit les 100 départements présents, donc
préserve la validation la plus dure. **La façon d'échantillonner peut changer la difficulté du test,
pas seulement sa précision.**

**Pourquoi séparer les deux asymétries.** Un seul nombre était plus simple. Mais restreint aux quatre
niveaux le rapport vaut **1,78** (« une fois sous arrêté, la sévérité monte-t-elle plus vite qu'elle ne
descend ? ») et sur les cinq états **0,63** (« les restrictions arrivent-elles plus vite qu'elles ne
finissent ? »). Les deux sont vrais et répondent à des questions différentes. Fusionnés, le 1,77 déjà
publié aurait été remplacé par 0,63 **sans qu'aucun test ne tombe**. C'est pourquoi le paramètre est
obligatoire à la lecture et non deviné.

**Pourquoi publier un second résultat négatif.** Parce qu'il en dit plus que le premier : il
**élimine** une explication. Un modèle qu'on n'arrive pas à améliorer mais dont on a écarté deux
causes est plus proche d'être compris qu'un modèle dont on ignore pourquoi il échoue.

### 7.5 Pour expérimenter soi-même

**Expérience A — remettre l'indexation par rang, et voir un décalage sommer à 1.**
Dans `lib/markov.ts`, revenez à l'ancienne survie :

```ts
for (let j = 0; j < ETATS_CHAINE.length; j++) {
  let acc = 0;
  for (const to of ETATS_CHAINE) if (rangEtat(to) >= j + 1) acc += row[to] ?? 0;
  s.push(acc);
}
```

`npx tsx scripts/test/markov.test.ts` → **2 échecs mesurés**, et lesquels est toute la leçon :
`monotone: every corrected row still sums to 1 over the four LEVELS` et
`monotone: the correction never invents mass into a state the input never used`.

⚠️ **J'avais prédit deux autres échecs, et j'avais tort** (voir §3 : c'est la troisième session de
suite où rédiger cette section corrige mes propres affirmations). Ce qui compte est ce qui **ne**
casse pas. Mesurez les totaux vous-même sur une matrice ajustée :

```ts
for (const f of ETATS_CHAINE) {
  const sum = ETATS_CHAINE.reduce((a, t) => a + (corr.p[f][t] ?? 0), 0);
  console.log(f, "somme:", sum.toFixed(6), "P(->libre):", (corr.p[f][ETAT_LIBRE] ?? 0).toFixed(4));
}
```

Résultat mesuré, avec l'indexation cassée :

```
aucune_restriction somme: 1.000000  P(->libre): 1.0000
vigilance          somme: 1.000000  P(->libre): 0.8801   ← valait 0.1045 avant
alerte             somme: 1.000000  P(->libre): 0.0479
```

**Chaque ligne somme exactement à 1,000000**, et la ligne `vigilance` a vu sa masse
`vigilance → vigilance` (0,79) glisser dans `vigilance → libre` (0,88). Tout le vecteur est décalé
d'un état, et **aucune vérification par totaux sur l'espace complet ne peut le voir** — la
renormalisation finale répare le total tout en conservant le décalage.

Alors pourquoi un test tombe-t-il ? Parce qu'il somme sur les **quatre niveaux** et non sur les cinq
états : la masse partie dans le cinquième manque à *ce* sous-total. Le garde-fou fonctionne par un
détour, ce qui n'est pas une base solide — d'où l'assertion ajoutée cette session, qui énonce
l'invariant **directement** (« corriger une matrice qui ne visite jamais l'état libre ne doit pas
inventer de transition vers lui ») au lieu de l'espérer d'un total. **Mesuré : 2 échecs, dont 0 sur
les totaux à cinq états.**

**Expérience B — casser la séparation des deux asymétries.**
Rendez l'ensemble d'états implicite en forçant le défaut :

```ts
export function asymetrie(m: TransitionMatrix, _etats: EtatChaine[] = ETATS_CHAINE) {
  const etats = ETATS_CHAINE;   // on ignore le paramètre
  // …
```

`npx tsx scripts/test/markov.test.ts` → **1 échec mesuré** :
`etats: … and are genuinely different numbers, so conflating them would mislead`.
Puis affichez les deux valeurs sur la matrice réelle du rapport : **1,78** contre **0,63**. Ce test
est le seul obstacle entre « les niveaux montent 1,8 fois plus vite qu'ils ne descendent » et son
contraire apparent.

**Expérience C — remplir les journées libres jusqu'à la fin de l'archive.**
Dans `observationsAvecEtatLibre`, remplacez la borne haute par une date fixe récente :

```ts
const finArchive = Math.floor(Date.UTC(2026, 7, 11) / 86_400_000);
for (let d = premier; d <= finArchive; d++) {
```

Les tests unitaires ne verront rien — c'est le point. Lancez plutôt le script de vérification locale
(`/tmp/.../complement.ts` du §5, ou réécrivez-le : une zone avec un arrêté en 2018 et plus rien
ensuite) et comparez le nombre de journées « libres ». Vous verrez **huit ans** de liberté fabriquée
pour une zone qui a peut-être simplement disparu du référentiel. Aucun test ne vous arrêtera : c'est
une hypothèse sur le monde, pas une erreur de code, et c'est pourquoi elle est écrite en commentaire
au-dessus de la fonction plutôt que confiée à une assertion.

**Expérience D — reproduire le mirage de la persistance à la main.**
Sans rien modifier :

```ts
import { brier } from "./lib/validation";
// Une journée où la zone reste libre, prévue « libre à 99,7 % » :
console.log(brier([{ zone: "z", day: 1, observe: "aucune_restriction",
  prevu: { aucune_restriction: 0.997, vigilance: 0.002, alerte: 0.001 } }]));
// La même prévision, le jour où la restriction tombe :
console.log(brier([{ zone: "z", day: 2, observe: "alerte",
  prevu: { aucune_restriction: 0.997, vigilance: 0.002, alerte: 0.001 } }]));
```

Vous obtenez ≈ **0,000** puis ≈ **1,99**. Comme les journées libres sont 73,5 % de l'échantillon et
les déclenchements 0,25 %, la moyenne est excellente et la seule journée qui intéresse l'utilisateur
est ratée aussi complètement qu'il est possible. **C'est tout le sprint en deux lignes.**
