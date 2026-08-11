# Compte rendu — lever les blocages (Sprint 51)

**Date** : 2026-08-11 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 51

---

## 1. La question initiale

> « Let's résolve blocking points »

puis, après arbitrage :

> **Prod** : « Merger sur `main` maintenant »
> **Arbitrages** : les 4 champs de saisie, le seuil de matérialité, où publier `departsParMois`
> **Pilotes** : « Des contacts en cours »

puis :

> « proceed with things you can without my intervention »

**Ce que j'ai compris** : passer en revue les blocages listés depuis plusieurs sprints, séparer ceux
qui m'appartiennent de ceux qui demandent une décision, faire les premiers et poser les seconds. La
seconde consigne a tranché l'ordre de la suite : tout ce qui ne demande pas l'utilisateur.

**Ce que j'ai délibérément laissé de côté** :

- **Regarder la prod moi-même.** Impossible : le proxy du bac à sable bloque aussi Vercel
  (403 CONNECT sur `water-risk-saa-s.vercel.app`, mesuré). Le merge est fait et poussé, la
  vérification visuelle reste à l'utilisateur — dit plutôt que laissé entendre.
- **Rattacher effectivement le SWI aux zones.** La sonde a établi que c'est possible ; le faire est
  un chantier de données à part.
- **La transcription ICPE de V_ref** (Légifrance 403) et **narraTRACC** (egress) : verrous inchangés.

---

## 2. Ce qui a été réalisé

**En une phrase** : `main` reçoit trois jours de travail, deux arbitrages produit sont tranchés avec
des règles qui n'inventent aucun coefficient, et deux affirmations de ma propre roadmap sont
démenties par vérification.

**Dans les grandes lignes** :

- **`main` mergé et poussé** — 50 commits, sprints 42b → 50, après build + lint + typecheck +
  31 suites + 119/119 e2e.
- **`npx tsc --noEmit` passe**, donc `scripts/` est typechecké pour la première fois. Une seule
  erreur `TS1501` bloquait ça, et tant qu'elle tenait le seul contrôle sur `scripts/` était « ça
  tourne aujourd'hui ».
- **Deux champs de saisie** livrés (`paliers`, `profilMensuel`) — et **deux des quatre annoncés
  étaient déjà là**.
- **Le seuil de matérialité tranché par les intervalles**, pas par un seuil inventé.
- **`departsParMois` publié** dans la page méthodologie, avec sa portée.
- **Le verrou spatial levé** : la géométrie des zones **est** joignable, contrairement à ce que
  j'avais écrit.
- **La validation §5.5 outillée** : gabarit et comparaison prêts pour le jour où un pilote répond.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `main` (merge `bf017a3`) | — | Sprints 42b → 50 en production. |
| `scripts/test/report.test.ts` + `package.json` | modifiés | `TS1501` corrigé (`[\s\S]*` au lieu du drapeau `s`) ; `npm run typecheck` ajouté. |
| `components/AddressSearch.tsx` | modifié | `paliers` en ligne et conditionnel ; `profilMensuel` en douze parts mensuelles, total **rapporté** jamais imposé. |
| `lib/portefeuille.ts` | modifié | `classementMateriel` — classes de matérialité par **recouvrement d'intervalles**, composantes connexes. |
| `lib/executive.ts` | modifié | La ligne « Où agir » signale quand son classement coupe un groupe indissociable. |
| `lib/saisonnalite.ts` | **neuf** | Les taux mensuels mesurés, constante **datée avec son run**, et leur portée. |
| `app/methodologie/page.tsx` | modifié | L'ancre saisonnière porte enfin sa mesure ; le caveat de portée est placé **avant** la méthode. |
| `lib/pilote.ts` + `docs/pilotes/gabarit-donnees-pilote.csv` | **neufs** | Gabarit à 7 colonnes et comparaison prédit/réel de §5.5. |
| `scripts/restrictions/probe_geometrie_zones.py` | modifié | Ordre des candidats, précision vs rappel, WFS, lecture **dBase sans dépendance**, membre de juillet. |
| `scripts/test/pilote.test.ts` | **neuf** | 34 vérifications. |

---

## 3. Erreurs potentielles

### Trouvés et corrigés pendant la session

**1. Ma sonde géométrie a rendu un FAUX NÉGATIF, et j'ai failli le publier comme un résultat.**
Le premier run concluait « aucune géométrie joignable ». Trois défauts, tous dans la sonde :
la ressource nommée `HISTORIQUE - Géométrie des zones d'alerte` **n'a jamais été téléchargée**
(candidats pris dans l'ordre du jeu de données, boucle coupée à quatre) ; je jugeais sur le
**rappel** alors que la **précision** répond à la question ; et j'ai lu un `400 Bad Request` comme
une réponse sur la couche alors qu'il parlait de **ma requête**. ⚠️ Une sonde qui rend un faux
négatif est pire qu'une sonde qui échoue : elle **ferme une voie qui était ouverte**.

**2. « Au mieux le département » était faux.** Corrigé : `all_zones.dbf` porte `code_zone` joignable
à **précision 0,572 / rappel 0,508**, plus `type_zone` (SUP/SOU/AEP), le département, le bassin, et
des champs de **version de zone**. Deuxième affirmation de ma roadmap démentie en deux sprints.

**3. Un espace perdu, et une vérification à moi qui le masquait.** Le DOM rendait
« **Mesurésur** l'archive » — JSX a mangé l'espace après un `</strong>`. Mon premier contrôle ne l'a
pas vu parce que je vérifiais avec `curl` et une substitution `<[^>]+>` → `" "`, **qui insère un
espace là où était une balise** et fabrique donc exactement l'espacement qu'elle prétend tester.
`innerText` est la lecture honnête. ⚠️ C'est le même défaut de méthode que le bouchon de géocodeur
du sprint 46 : *un test qui passe à cause de la façon dont il lit la donnée*.

**4. Mon gabarit pilote ne survivait pas à son propre exemple.** L'adresse d'exemple contient une
virgule — les adresses françaises en contiennent, par convention — donc la ligne avait **19 champs
contre 18 en-têtes** et le fichier cassait dans un tableur dès l'ouverture. Un gabarit qui ne
survit pas à son exemple **enseigne le mauvais format**. Corrigé par échappement, et une
vérification compare désormais les deux comptes.

**4 bis. « 4 champs manquants » en valait 2.** `tamponM3` et `seuilTechniqueM3` étaient déjà dans le
formulaire. Mesuré en ouvrant le fichier, pas en relisant ma roadmap.

**5. Un `};` de trop** dans `classementMateriel` (`TS1128`), et **une assertion visant la mauvaise
branche** du message de matérialité : deux sites dans une classe déclenchent le message « une seule
classe », pas celui « ex æquo ». Les deux textes existent parce que les deux situations diffèrent ;
j'ai ajouté le cas mixte qui exerce vraiment le second.

**6. Un `import type` transformé en import de valeur** (`TS1361`) par une substitution trop naïve.

**7. Un commentaire de justification qui ne décrivait rien — trouvé en écrivant §7.5, comme aux trois
sprints précédents.** `classementMateriel` vantait « des composantes connexes plutôt qu'une
comparaison deux à deux ». **Mesuré : les deux formulations sont identiques ici**, parce que trié par
borne basse décroissante le site précédent est toujours le dernier ajouté à la classe, donc
`courante.jeaMin === precedent.jea` identiquement. La mutation que j'annonçais comme fatale ne casse
**aucun** test. Celle qui casse vraiment (6 échecs) est de comparer au `jeaMax` de la classe. ⚠️ Une
justification écrite dans un commentaire **n'est pas vérifiée par le fait que les tests passent** ;
il faut essayer de la casser pour savoir si elle dit quelque chose.

### Non vérifié en conditions réelles

- ⚠️ **La prod n'a pas été regardée**, et je ne peux pas : proxy bloqué (403 CONNECT mesuré). Le
  merge est fait ; la confrontation aux vraies réponses VigiEau reste entière.
- **Les deux nouveaux champs n'ont été vus que par Playwright.** `profilMensuel` a douze entrées sur
  une grille : sur un écran de 390 px, `grid-cols-4` donne trois lignes — jamais observé à l'œil.
- **`classementMateriel` n'a jamais tourné sur un vrai portefeuille.** Toutes ses vérifications sont
  synthétiques. On ne sait donc pas si, en pratique, les intervalles sont si larges que tout un parc
  s'effondre en une classe — le cas que le code annonce comme correct mais que personne n'a vu.
- **`lib/pilote` n'a jamais vu une donnée de pilote** : c'est de la machinerie en attente d'entrée,
  et §5.5 reste **NON FAIT**. Une vérification miroir le rattache au rapport de calibration pour
  que ce constat ne dépende pas de ma mémoire.
- **Les 43 % de `code_zone` du shapefile absents de l'archive** ne sont pas expliqués : l'échantillon
  de 8 000 lignes peut en être la cause, ce n'est pas vérifié.

### Hypothèses qui pourraient ne pas tenir

- **La matérialité par recouvrement suppose que `jeaMax` est renseigné.** Quand une mesure n'est pas
  chiffrée, l'intervalle s'élargit et le classement se dissout — c'est voulu. Mais si `jeaMax`
  manque partout, chaque site devient son propre point et le classement redevient **faussement
  précis**, sans que rien ne le signale.
- **La précision de 0,572 est mesurée contre un échantillon d'archive**, pas contre l'archive.
- **Le gabarit pilote suppose que les journées perdues sont mémorisables.** Sur deux années passées,
  c'est une mémoire d'entreprise, probablement arrondie et plutôt vers le bas — écrit dans les
  limites, mais ça biaise la validation dans le sens de la **sous-estimation apparente**.

### Ce qui casserait si une source amont changeait

- **`lib/saisonnalite` est une constante datée** : si une recalibration change les taux, la page
  méthodologie affichera les anciens jusqu'à mise à jour manuelle. Choix assumé — une page statique
  ne doit pas dépendre d'un rapport qu'un run réécrit — mais c'est une dette de fraîcheur, et le
  `run` affiché est ce qui permet de s'en apercevoir.
- **Le shapefile `all_zones`** peut être republié avec d'autres noms de champs ; la sonde essaie
  **tous** les champs, donc elle le suivrait.

---

## 4. Points d'amélioration

**Dette assumée**

- **Correctif étroit pour `TS1501`** (réécrire la regex) plutôt que remonter la cible du projet :
  changer `target` aurait modifié la surface de typecheck de tout le dépôt pour une ligne.
- **`lib/saisonnalite` en dur** — motivé ci-dessus.
- **La matérialité n'est câblée que dans « Où agir »**, pas dans le tri du tableau de bord. Le tri
  reste un tri ; ce qui change est qu'une **affirmation** sur l'ordre porte sa réserve.

**À reprendre**

- **Le tableau de bord devrait montrer les classes**, pas seulement l'ordre. Aujourd'hui deux sites
  ex æquo s'affichent l'un au-dessus de l'autre sans rien qui le dise.
- **`gabaritCsv` réimplémente un échappement CSV** que `lib/importLot` possède déjà en lecture.
  Deux moitiés du même format à deux endroits : à réunir avant d'y toucher à nouveau.
- **Le shapefile n'est pas lu pour ses polygones.** Le `.shp` porte une **boîte englobante par
  enregistrement**, donc un centre de zone s'obtient sans trianguler — et sans dépendance non plus.
  C'est la prochaine étape concrète du SWI.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — dernier commit `f3b9fcd`.
- **`main` touché ?** : **OUI** — merge `bf017a3`, **à la demande explicite de l'utilisateur**
  (« Merger sur `main` maintenant »). 50 commits, arbre identique à la branche vérifié par
  `git diff --stat main branche` (vide).
- **Pull request** : **aucune** — non demandée.
- **Déployé en prod ?** : **poussé**, donc Vercel déploie. ⚠️ **Non vérifié** : le proxy du bac à
  sable rend 403 CONNECT sur l'URL de prod. Dit comme tel.
- **Vérifications passées** :
  - `npm run build` — clean · `npm run lint` — clean · **`npm run typecheck` — clean (nouveau)**
  - **32 suites**, 0 échec (`pilote.test.ts` neuve, 34 vérifications ; `portefeuille` 105 → 114 ;
    `executive` 40 → 47)
  - **e2e 119 → 134** vérifications
  - **4 runs Actions** : 31536… (géométrie 1), 31541631223 (géométrie 2), 31542743956 (shapefile),
    tous `success`
  - ⚠️ L'erreur `TS1501` n'est plus « pré-existante et acceptée » : elle est **corrigée**.

---

## 6. Prochaines étapes

1. **Regarder la prod.** *Verrou* : **humain**, et c'est le seul point de cette session que je ne
   peux pas faire. Douze sessions.
2. **Centres de zone depuis le `.shp`, puis appariement aux mailles SAFRAN.** *Verrou* : aucun — la
   boîte englobante par enregistrement suffit, `cells.json` est au dépôt.
3. **Afficher les classes de matérialité dans le tableau de bord.** *Verrou* : aucun.
4. **Vérifier la précision 0,572 sur l'archive entière.** *Verrou* : aucun (un run).
5. **Trois à cinq pilotes.** *Verrou* : **commercial**. L'outil est prêt ; le gabarit est dans
   `docs/pilotes/`.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Cette session n'a pas construit une fonctionnalité : elle a **débloqué** des choses arrêtées depuis
longtemps. Trois valent d'être racontées.

D'abord, un outil de vérification que nous n'utilisions pas. Le langage de ce projet (TypeScript)
sait vérifier la cohérence du code **avant** de l'exécuter. Cette vérification échouait sur **une**
ligne, dans un fichier de test, pour une raison mineure. Comme elle échouait, personne ne la
lançait, donc tout un dossier du projet n'était vérifié que par « ça marche quand on l'exécute ».
Une ligne corrigée, et un vrai filet réapparaît. On a vérifié qu'il attrape un bug réel : un bug
qui, trois sprints plus tôt, n'était apparu qu'à l'exécution.

Ensuite, une question de fond : **quand deux sites sont-ils vraiment classés différemment ?** Notre
outil dit « ce site perd entre 10 et 25 jours » — une fourchette, parce que les arrêtés préfectoraux
ne sont pas toujours chiffrables. Si un site est à « 10 à 25 » et un autre à « 12 à 30 », les
classer revient à ordonner du bruit. La tentation est de choisir un écart minimum (« au-delà de
5 jours »), mais ce 5 serait inventé. La réponse était déjà dans les données : **deux sites sont
classés quand leurs fourchettes ne se chevauchent pas**. Aucune constante, et la précision du
classement devient celle des arrêtés eux-mêmes.

Enfin, une leçon sur les sondes. Pour savoir si une donnée publique existe, on écrit un petit
programme qui va voir. Le mien a répondu **non**, et il avait tort — trois fois. Le plus instructif :
il a reçu une erreur `400` (« ta requête est mal formée ») et l'a comptée comme « cette donnée est
inutilisable ». Ce n'est pas la même phrase.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Arrêté sécheresse** | Décision préfectorale restreignant des usages de l'eau, avec des dates. |
| **Zone d'alerte** | Découpage sur lequel un niveau s'applique. Plus de 10 000 en France. |
| **JEA** | Jour-équivalent d'arrêt : l'unité d'interruption d'activité. |
| **ρ (rho)** | Part d'un prélèvement qu'une mesure empêche. Souvent une **fourchette**. |
| **Fourchette / intervalle** | `[min, max]`. Quand un arrêté n'est pas chiffrable, elle s'élargit. |
| **Matérialité** | Le fait qu'un écart soit réel plutôt que du bruit. |
| **Composantes connexes** | Groupes formés par une relation « se touche », en chaîne. |
| **Typecheck** | Vérifier la cohérence du code sans l'exécuter. |
| **Sonde (probe)** | Petit programme qui va voir si une donnée publique existe et est utilisable. |
| **Précision / rappel** | Deux taux : « ce que j'ai trouvé est-il juste » contre « ai-je tout trouvé ». |
| **Shapefile** | Format de cartographie : `.shp` (géométries) + `.dbf` (attributs) + annexes. |
| **dBase / .dbf** | Vieux format tabulaire binaire, très simple à lire à la main. |
| **WFS** | Protocole de serveur cartographique. |
| **`innerText`** | Le texte tel qu'un navigateur l'affiche vraiment. |
| **§5.5** | La section de la note qui demande de comparer nos prédictions au vécu de vrais sites. |

### 7.3 Comment le code s'y prend

#### a) La matérialité : grouper au lieu d'ordonner

Les sites sont triés par borne basse décroissante, puis on ouvre une classe et on n'en ouvre une
nouvelle que quand un site ne touche plus la classe en cours (`lib/portefeuille.ts`) :

```ts
for (const s of avec) {
  const haut = s.jeaMax ?? s.jea;
  const courante = classes[classes.length - 1];
  // Sorted descending, so `s` joins the current class when its UPPER bound still
  // reaches the class's lowest lower bound — i.e. the intervals touch.
  if (courante && haut >= courante.jeaMin) {
    courante.sites.push(s.id);
    courante.jeaMin = Math.min(courante.jeaMin, s.jea);
    courante.jeaMax = Math.max(courante.jeaMax, haut);
  } else {
    classes.push({ rang: classes.length + 1, sites: [s.id], jeaMin: s.jea, jeaMax: haut });
  }
}
```

Pourquoi une classe **grandit** au lieu de comparer deux voisins ? Parce que « se chevaucher »
n'est pas transitive. A = [30, 40], B = [25, 35], C = [20, 26] : A touche B, B touche C, **A ne
touche pas C**. Si on comparait deux à deux, on séparerait A de C tout en les déclarant tous deux à
égalité avec B — un classement qui se contredit. En balayant du plus haut au plus bas et en
étendant l'enveloppe, on obtient les **composantes connexes** en une passe. Un test épingle
exactement cette chaîne.

Le résultat est branché là où il peut faire du mal (`lib/executive.ts`) :

```ts
const classeCoupee = classes.classes.find(
  (c) => c.sites.some((id) => teteIds.has(id)) && c.sites.some((id) => !teteIds.has(id)),
);
```

« Ces deux sites concentrent 60 % des jours contraints » est une affirmation sur un **ordre**. Si la
coupe tombe au milieu d'un groupe indissociable, la phrase ajoute que l'effort vaut autant sur l'un
que sur l'autre — sans retirer le pourcentage, qui reste l'information utile.

#### b) Lire un shapefile sans installer de bibliothèque

La question était : les zones du shapefile portent-elles les mêmes codes que notre archive ? Les
polygones n'ont aucune importance pour ça — seuls les **identifiants** comptent, et dans un
shapefile ils vivent dans le `.dbf`, un format des années 1980 :

```py
n_records = int.from_bytes(octets[4:8], "little")
header_len = int.from_bytes(octets[8:10], "little")
record_len = int.from_bytes(octets[10:12], "little")
limite = min(header_len, len(octets))          # ⚠️ borné par la taille RÉELLE
while pos + 32 <= limite and octets[pos] != 0x0D:
    nom = octets[pos:pos + 11].split(b"\x00")[0].decode("latin-1").strip()
    taille = octets[pos + 16]
    champs.append((nom, taille))
    pos += 32
```

Trente lignes contre une dépendance de plusieurs centaines de mégaoctets. Et le `min(header_len,
len(octets))` vient d'un bug trouvé en le testant sur un fichier tronqué : la boucle faisait
confiance à la taille **déclarée** dans l'en-tête et levait `index out of range`, ce qui aurait fait
perdre **tout** le rapport à cause d'un seul téléchargement abîmé.

Le lecteur rend **tous** les champs plutôt que de deviner lequel porte le code :

```py
for nom in champs:
    ids = {str(l.get(nom, "")) for l in lignes if re.fullmatch(r"[0-9]{2}[A-Z]?_[0-9A-Z_]+", str(l.get(nom, "")))}
    if ids:
        par_champ[nom] = tester_jointure(..., ids)
```

Deviner est exactement la façon dont une sonde annonce « aucun identifiant trouvé » alors qu'elle a
regardé la mauvaise colonne. Résultat : `code_zone`, précision 0,572, rappel 0,508.

#### c) Précision et rappel — le taux qui répond à la question

```py
precision = len(inter) / len(ids)              # les ids DU CALQUE qui sont des codes d'archive
recall    = len(inter) / len(codes_archive)     # les codes d'archive que le calque couvre
```

Un calque des zones **en vigueur aujourd'hui** ne peut pas couvrir quinze ans de zones créées,
fusionnées et retirées : son rappel sera bas quoi qu'il arrive. Mais s'il parle notre langue
d'identifiants, sa **précision** sera haute. Ma première version jugeait sur le rappel, a lu 0,17
et a conclu « non joignable » — alors que 58 % des identifiants du calque étaient nos codes.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Les intervalles plutôt qu'un seuil, pour la matérialité.** Un seuil est plus simple à expliquer et
plus facile à coder. Il aurait fallu l'inventer, et l'ADR-004 désigne le classement comme la sortie
la plus fiable de l'outil : un nombre inventé **là** discrédite la seule chose qu'on peut défendre.
Les fourchettes étaient déjà partout ; il suffisait de les lire.

**Douze champs mensuels plutôt que des « profils types ».** J'ai d'abord envisagé un seul champ
(« part du volume consommée en été »). Le type lui-même avait déjà tranché, avec la bonne raison :
un profil type demande des multiplicateurs que personne n'a mesurés. Douze champs paraissent
lourds — jusqu'à ce qu'on remarque que **l'eau est facturée mensuellement** : c'est un formulaire
qu'on remplit avec une facture, pas de mémoire.

**Une constante datée pour la saisonnalité, plutôt qu'une lecture du rapport de calibration.** La
page méthodologie est statique et ne doit pas dépendre d'un fichier qu'un run réécrit. Et un chiffre
montré à un lecteur doit porter sa provenance : « une valeur dans un JSON du dépôt » n'est pas
auditable, « run 31498428653 » l'est. Le prix est une dette de fraîcheur, et le numéro de run est
précisément ce qui permet de la voir.

**Sept colonnes pour les pilotes, pas quinze.** Chaque colonne est une raison de ne pas répondre. Un
pilote qui envoie quatre colonnes vaut mieux qu'un pilote qui n'envoie rien parce que le formulaire
en demandait vingt.

**Le sens de l'erreur plutôt que sa taille, pour §5.5.** Avec cinq sites, une erreur moyenne existe
arithmétiquement et ne veut rien dire. « L'outil a sous-estimé sur quatre sites sur cinq » est
actionnable. Et les deux sens ne s'équivalent pas : surestimer fait perdre la confiance,
sous-estimer laisse un client démuni.

### 7.5 Pour expérimenter soi-même

**Expérience A — casser la matérialité, et découvrir au passage que mon commentaire mentait.**
Cette expérience s'est retournée contre moi, ce qui la rend la plus utile des quatre.

*Ce que j'avais annoncé.* Comparer au **site précédent** plutôt qu'à l'enveloppe de la classe :

```ts
const precedent = avec[avec.indexOf(s) - 1];
if (courante && precedent && haut >= precedent.jea) { /* même classe */ }
```

`npx tsx scripts/test/portefeuille.test.ts` → **mesuré : 0 échec.** Et la raison est instructive :
trié par borne basse **décroissante**, le site précédent dans la liste est **toujours** le dernier
ajouté à la classe en cours, donc `courante.jeaMin === precedent.jea` **identiquement**. Vérifié :

```
b  courante.jeaMin = 30 | precedent.jea = 30 | identiques : true
c  courante.jeaMin = 25 | precedent.jea = 25 | identiques : true
```

Mon commentaire dans `lib/portefeuille.ts` vantait donc une distinction **vide** — « composantes
connexes plutôt que comparaison deux à deux » — alors que le tri rend les deux formulations
identiques. Le commentaire a été corrigé pour dire ce qui fait réellement le travail : le **couple
(tri décroissant, minimum courant)**.

*La mutation qui casse vraiment.* Comparer au `jeaMax` de la classe au lieu de son `jeaMin` :

```ts
if (courante && haut >= courante.jeaMax) {
```

A = [30, 40] puis B = [35, 45] se recouvrent, et pourtant `35 >= 40` est faux : B ouvre sa propre
classe et l'outil ordonne deux sites indissociables. **Mesuré : 6 échecs**, dont
`materialite: overlap is treated as NON-transitive-safe (connected components)` et
`materialite: … and the class envelope spans the whole chain`.

⚠️ La leçon vaut plus que le test : **une justification écrite dans un commentaire n'est pas
vérifiée par le fait que les tests passent.** Il a fallu tenter de la casser pour découvrir qu'elle
ne décrivait rien.

**Expérience B — remettre le bug de l'espace, et voir pourquoi `curl` ne l'attrape pas.**
Dans `app/methodologie/page.tsx`, remplacez `<strong>Mesuré</strong>{" "}` par
`<strong>Mesuré</strong> ` (espace ordinaire), puis :

```bash
npm run build && (npx next start -p 3200 &) && sleep 3
curl -s localhost:3200/methodologie | grep -o 'Mesuré</strong>.\{0,12\}'
```

Vous verrez `Mesuré</strong>sur l'archi` — **l'espace n'est pas dans le HTML**. Puis lancez l'e2e :
`node scripts/test/e2e.mjs` → **attendu : l'échec de**
`methodo: the seasonal anchor now carries its measurement`. La leçon est dans la méthode : si vous
« vérifiez » en supprimant les balises par `sed 's/<[^>]*>/ /g'`, vous **ajoutez** un espace là où
était la balise et le test passe. C'est exactement l'erreur que j'ai commise.

**Expérience C — nourrir la comparaison pilote d'une observation dans la fourchette.**

```ts
import { comparerPilote } from "./lib/pilote";
console.log(comparerPilote({ site: "X", annee: 2022, jeaPreditMin: 10, jeaPreditMax: 25, joursReels: 18, partEau: 1 }).sens);
// mesuré : "dans_la_fourchette"
console.log(comparerPilote({ site: "X", annee: 2022, jeaPreditMin: 10, jeaPreditMax: 25, joursReels: 18 }).detail);
// mesuré : le même verdict, PLUS « ⚠️ La part imputable à l'eau n'est pas déclarée … l'écart est une borne. »
```

Puis retirez la réserve dans `lib/pilote.ts` (mettez `const reserve = ""`) et lancez
`npx tsx scripts/test/pilote.test.ts` → **3 échecs mesurés** :
`refus: an unattributed loss is not silently taken as 100 % water`,
`refus: … and the resulting gap is called a BOUND, not a value`, et
`synthese: an unattributed site adds its own explicit limit`. Le troisième est celui auquel je ne
m'attendais pas et c'est le plus intéressant : la réserve ne sert pas qu'à annoter **une** ligne, elle
**remonte dans la synthèse** pour dire que l'écart global est une borne. Ce que ces tests protègent :
sans elle, l'outil s'attribue le mérite de journées d'arrêt qui pouvaient être des pannes, et la
synthèse le présente comme une mesure.

**Expérience D — voir le gabarit casser sur son propre exemple.**
Dans `lib/pilote.ts`, retirez `.map(champCsv)` de la ligne d'exemple, puis :

```bash
npx tsx -e 'import {gabaritCsv} from "./lib/pilote"; console.log(gabaritCsv())' > /tmp/g.csv
python3 -c "
ls=[l for l in open('/tmp/g.csv') if l.strip() and not l.startswith('#')]
print('en-têtes:', len(ls[0].split(',')), '| exemple:', len(ls[1].split(',')))"
```

**Mesuré : 18 contre 19.** Un fichier qui se décale d'une colonne dès l'exemple, donc un pilote qui
remplit ses volumes dans la mauvaise colonne. `npx tsx scripts/test/pilote.test.ts` → **2 échecs
mesurés** : `gabarit: the example row has exactly as many fields as the header` et
`gabarit: … and the comma-bearing address is quoted, not mangled`. Les deux comptent : le premier
attrape le décalage, le second attrape la tentation de « corriger » en retirant la virgule de
l'adresse — ce qui produirait un exemple qu'aucun pilote français ne reconnaîtrait comme le sien.
