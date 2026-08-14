# Compte rendu — Le bassin versant réel, et le ratio qui reste communal (Sprint 57)

**Date** : 2026-08-14 · **Branche** : `claude/bassins-versants-carte-6crhsl` · **Sprint** : 57

---

## 1. La question initiale

> « Tranchons quelques points si besoin » — puis, sur les trois options d'arbitrage proposées :
> **« Ressource au bassin, ratio à la commune »**.

**Ce que j'ai compris** : lever l'item 10 du HANDBOOK (§5) — `lib/ressource.ts` transpose depuis le
sprint 27 un débit spécifique sur l'**emprise communale**, une géométrie administrative sans aucun
sens hydrologique, et le dit dans sa propre réserve. Le verrou de données est levé depuis le
sprint 52 : les 6 190 bassins versants de BD Topage sont embarqués, avec leur surface.

L'ambiguïté était réelle et elle a été tranchée explicitement : le taux d'exploitation est un
**rapport** dont les deux termes sont aujourd'hui sur la commune. La décision retenue déplace la
**production** sur le bassin versant et **laisse le ratio sur la commune**.

**Ce que j'ai délibérément laissé de côté** :

- **Agréger les prélèvements BNPE par bassin versant.** Ce serait la seule façon d'obtenir un vrai
  taux d'exploitation à l'échelle hydrologique. Deux motifs de refus, tous deux consignés : aucune
  de ces requêtes n'est vérifiable depuis le bac à sable (egress bloqué), et un bassin sans ouvrage
  BNPE renverrait **0** — un taux d'exploitation nul qui serait un mensonge, exactement la faute que
  ce dépôt refuse partout ailleurs.
- **Le verrou de méthode que j'avais moi-même annoncé** (« quel bassin retenir quand une commune en
  chevauche plusieurs ») : il **n'existe pas**. On part du **point** du site, jamais de sa commune.
  Piste close, par écrit, avec son motif.

---

## 2. Ce qui a été réalisé

**En une phrase** : la production locale affichée sur une fiche n'est plus celle d'un périmètre
administratif, mais celle du **territoire qui s'écoule réellement autour du site** — et le rapport
qui l'accompagne dit désormais explicitement sur quelle emprise il porte.

**Dans les grandes lignes** :

- **Un vrai test point-dans-polygone** (`lib/geoPoint.ts`), séparé de `lib/geoBbox.ts` parce que
  l'en-tête de ce dernier énonce sa règle : *« un recouvrement de BOÎTES ENGLOBANTES, jamais une
  intersection géométrique réelle »*. C'est le bon compromis pour **dessiner** une carte, et le
  mauvais pour **rattacher** un site : là, une seule réponse est correcte.
- **La convention de frontière est ce qui fait de la couche une partition.** Les bassins pavent le
  territoire ; un point sur une ligne de partage doit tomber dans **un** bassin, pas deux, pas zéro.
  La règle semi-ouverte est écrite dans le commentaire, et vérifiée sur le fichier réel : sur une
  grille de 285 points, **aucun** n'appartient à deux bassins.
- **Une route à trois états** (`/api/bassin-versant`), sur le patron de `/api/situation` :
  `trouve`, `hors-couverture`, `indisponible`. ⚠️ `hors-couverture` ne dit **pas** « ce point n'a pas
  de bassin versant » : la couche s'arrête à la métropole, pas le territoire. Un site en Guadeloupe
  aurait sinon reçu la faute du sprint 54 **à l'envers** — les limites d'un référentiel présentées
  comme une propriété du monde.
- **La lecture du référentiel a changé le vocabulaire autant que l'arithmétique.** 54 % des noms
  sont des tronçons inter-confluences (*« L'Arrats du confluent du Campunau au confluent de la
  Garonne »*) et le plus grand bassin fait 1 333 km² là où le bassin de la Loire en fait 117 000 :
  ce sont des **unités élémentaires**, le territoire qui s'écoule directement dans **un tronçon**.
  C'est le bon dénominateur pour « ce que ce territoire produit » et le mauvais pour « ce qui passe
  devant le site ». L'écran le dit, en toutes lettres.
- **Deux garde-fous imposés par la donnée, mesurés et non supposés** : sous 1 km², **70 %** des
  polygones sont des biefs de canal (*« de l'écluse numéro 11 à l'écluse numéro 10 »*, 0,0 km²) —
  ils sont **nommés mais jamais multipliés par**. Et **dix** des 6 190 noms sont **coupés** au
  plafond de 120 caractères de la source — dont celui qui couvre **Metz**, l'adresse ouverte par
  l'utilisateur : la coupure est **signalée**, jamais réparée (les mots manquants ne sont pas dans
  le fichier).

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/geoPoint.ts` | neuf | Lancer de rayon avec trous, `Polygon` et `MultiPolygon`, préfiltre par boîte englobante. Convention de frontière semi-ouverte. |
| `lib/bassinVersant.ts` | neuf | Le type à trois états, le plancher `BASSIN_MIN_KM2`, le repérage des noms coupés, `bassinDuPoint()`. **Pur** : ni disque ni réseau, donc importable côté navigateur. |
| `lib/bassinsData.ts` | neuf | Lit et **partage** le fichier national entre les deux routes qui en ont besoin — 4,35 Mo analysés une fois au lieu de deux. |
| `app/api/bassin-versant/route.ts` | neuf | La route à trois états. 200 ms au premier appel, 12 ms ensuite (mesuré). |
| `app/api/bassins-versants/route.ts` | modifié | Passe au chargeur partagé ; son cache local disparaît. |
| `lib/ressource.ts` | modifié | `bassinVersant` en entrée, `productionBassinM3An` en sortie, quatre réserves neuves, une réécrite. La branche communale est **inchangée**. |
| `components/RessourcePanel.tsx` | modifié | Second `fetch`, encadré de production du bassin, texte d'autonomie rendu explicitement communal. |
| `components/HomeClient.tsx` | modifié | Passe `lat`/`lon` au panneau. |
| `next.config.ts` | modifié | `outputFileTracingIncludes` pour la nouvelle route — sans quoi elle répond 503 en prod en marchant en dev. |
| `scripts/test/geoPoint.test.ts` | neuf | 21 vérifications, dont la divide partagée. |
| `scripts/test/bassinVersant.test.ts` | neuf | 25 vérifications **sur le fichier réel**, hors ligne. |
| `scripts/test/ressource.test.ts` | modifié | 12 vérifications de plus, dont celle qui **porte l'arbitrage**. |
| `scripts/test/e2e.mjs` | modifié | 10 scénarios de plus + une trace des requêtes en vol quand la suite meurt sur une attente réseau. |

---

## 3. Erreurs potentielles

### Bugs trouvés et corrigés pendant la session

- **Mes bouchons e2e faisaient planter la page, pas le code testé.** Un `{}` sur `/api/zones` casse
  le rendu (`.flatMap` sur `undefined`), une chronique sans `latest` aussi, et un `parUsage` dont le
  champ s'appelait `m3` au lieu de `volumeM3` encore. Résultat : `main` absent, `innerText` en
  timeout, et des vérifications qui échouaient **pour une raison sans rapport avec le bassin
  versant**. Corrigé en écrivant des bouchons **complets** — et le commentaire du bloc le dit
  maintenant, parce que la prochaine personne fera la même erreur.
- **Sans `ccode` dans l'URL, la moitié de mes vérifications ne vérifiaient rien.** Pas de commune →
  pas de prélèvements → ni pression ni autonomie à l'écran. Les tests seraient passés en ne trouvant
  rien à tester. C'est le même piège que le test de clic enchaîné du sprint 53, sous une autre forme.
- **`bassinDuPoint` lisait le disque**, donc `lib/ressource.ts` — importé par un composant client —
  aurait tiré `node:fs` dans le bundle du navigateur. Module scindé en deux : la lecture d'un côté,
  la décision de l'autre.

### Non vérifié en conditions réelles

- ⚠️ **Rien de ce sprint n'a été vu sur le déploiement.** Le proxy renvoie 403 CONNECT sur l'URL
  Vercel : aucune session ne peut le vérifier d'ici. C'est un **fait**, pas une absence de problème.
- ⚠️ **La chaîne complète n'a jamais tourné sur une vraie station.** Le module (10 m³/s), la surface
  du bassin de la station (1 000 km²) et les prélèvements (2 Mm³) des tests e2e sont **inventés** :
  seuls le bassin versant et sa surface sont réels. `scripts/diag/replay-ressource.ts`, qui existe
  pour ça, **n'a aucune capture** (`data/diag/` est absent) — et il annonce « ✓ Rejeu réel plausible »
  après avoir examiné **0 site sur 4**, ce qui est un « vide qui se lit comme un succès ».
  L'invariant `pression < autonomie` a donc été porté dans un test unitaire, où il s'exécute
  vraiment.
- **La suite e2e a échoué deux fois de suite, puis réussi trois fois de suite**, sur une attente
  `networkidle` d'un bloc **antérieur** au mien (le point en mer du sprint 54). Je **n'ai pas trouvé
  la cause** ; je n'ai pas non plus de raison de l'imputer à ce lot, dont le bloc s'exécute après.
  Ce que j'ai fait à la place : la trace de la suite nomme désormais les **requêtes encore en vol**
  quand elle meurt sur un timeout. La prochaine occurrence coûtera une exécution, pas cinq.

### Hypothèses qui pourraient ne pas tenir

- **`BASSIN_MIN_KM2 = 1` est une convention**, assumée comme telle. Elle est adossée à une mesure
  (70 % de biefs sous 1 km², 4 % au-delà de 20 km²), mais rien ne garantit qu'un bief de 3 km² ne
  passe pas au travers. Le vrai garde-fou n'est pas le seuil, c'est que **le nom est affiché** : un
  lecteur voyant « de l'écluse numéro 11 à l'écluse numéro 10 » n'a besoin d'aucun seuil.
- **La garde de transposition (`RATIO_MAX = 200`) est réutilisée telle quelle** sur le rapport
  station/bassin. Elle a été calibrée en 2026 pour le rapport station/commune, et les bassins étant
  plus grands que les communes, elle **refuse moins souvent** — ce qui va dans le sens de plus de
  chiffres affichés, donc dans le sens du risque.
- **Le tracé est simplifié à 200 m.** Un site à quelques dizaines de mètres d'une ligne de partage
  peut être rattaché au bassin voisin. La **surface**, elle, est celle du polygone non simplifié
  (calculée en Lambert-93 avant simplification) — c'est vérifié dans le script de collecte, pas
  supposé.

### Ce qui casserait si une source amont changeait

- Un rafraîchissement de BD Topage qui **renommerait** les colonnes (`nom`, `surfaceKm2`) ferait
  répondre `indisponible` à toutes les requêtes — et non « aucun bassin », ce qui est la bonne
  faute à commettre.
- Un rafraîchissement qui **relèverait le plafond des noms** au-delà de 120 caractères ferait
  échouer `bassinVersant.test.ts` : c'est voulu, `NOM_LONGUEUR_MAX` deviendrait faux et la marque
  « […] » cesserait de désigner de vraies coupures.
- Si le fichier passait sous les **93 polygones de moins de 1 km²** aujourd'hui recensés, le test du
  plancher tomberait aussi : la mesure qui justifie la constante est **rejouée**, pas recopiée.

---

## 4. Points d'amélioration

**Dette assumée**

- **Aucun taux d'exploitation à l'échelle du bassin.** C'est la décision du sprint, pas un oubli, et
  la réserve `pasDeTauxAuBassin` le dit à l'écran. Le lot suivant, s'il est voulu, agrège les
  ouvrages BNPE par bassin — avec un état « aucun ouvrage recensé » qui ne peut **pas** s'écrire 0.
- **Deux volumes à l'écran** (production du bassin, production communale dans la chaîne d'étapes).
  C'est un choix : ce panneau affiche sa dérivation entière, et masquer le dénominateur du ratio
  d'autonomie serait exactement ce qu'il refuse de faire depuis le sprint 27.

**À reprendre**

- **La retype en ligne de `ImpactPanel.tsx` survit** (elle a déjà coûté deux champs perdus, dont un
  au sprint 56). Elle n'est pas dans ce lot, elle reste due.
- **`volume()` dans `lib/ressource.ts` arrondit encore** (`fmt(m3, 0)`), là où `lib/format.ts` existe
  depuis le sprint 55 précisément pour ne pas écrire zéro un petit positif. Les volumes concernés se
  comptent en millions de m³, donc le cas ne se présente pas aujourd'hui — mais c'est le même
  formateur en double, et c'est ainsi que les deux finissent par diverger.
- **Le nom du bassin est long** (jusqu'à 120 caractères) et s'affiche en entier. Sur mobile, il
  occupe trois lignes. Non traité, non mesuré sur un vrai téléphone.

---

## 5. État Git

- **Branche de session** : `claude/bassins-versants-carte-6crhsl` — dernier commit `63c66be`
- **`main` touché ?** : **NON** — la branche attend une revue. (Le merge `a817b29` du sprint 56
  reste le dernier passage sur `main`, à la demande explicite de l'utilisateur.)
- **Déployé en prod ?** : **non vérifié — et non vérifiable d'ici**. Le proxy du bac à sable renvoie
  403 CONNECT sur l'URL Vercel (mesuré, pas supposé).
- **Vérifications passées** : `npm run build` ✅, `npm run lint` ✅, `npm run typecheck` ✅ (0 erreur),
  **34 suites unitaires** vertes (32 auparavant, + `geoPoint` + `bassinVersant`), **e2e 172/172**
  (162 auparavant). Aucun run GitHub Actions.

---

## 6. Prochaines étapes

Par valeur décroissante, chacune avec son verrou.

1. **Rejouer les gestes nº 3, 4, 8, 9 et le nouveau chapitre 5 sur la prévisualisation.**
   *Verrou* : moi, je ne peux pas — 403 CONNECT. Il faut des captures.
   ⚠️ La fiche n'a **toujours** jamais été vue avec un volume industriel réaliste.
2. **Agréger les prélèvements BNPE par bassin versant**, pour obtenir un vrai taux d'exploitation.
   *Verrou* : les requêtes ne sont pas vérifiables d'ici, et l'état « aucun ouvrage recensé » doit
   être conçu **avant** d'écrire le calcul, faute de quoi il s'écrira 0.
3. **Lire les 98 autres départements** pour savoir si « aucun usage industriel nommé » est général ou
   propre à la Moselle. *Verrou* : aucun — les fichiers sont dans le dépôt. C'est du temps, pas un
   blocage.
4. **Rejouer le modèle de ressource sur de vraies stations** (`replay-ressource.ts`).
   *Verrou* : il faut un run Actions qui commite `data/diag/`, la seule porte de sortie réseau.
5. **Le modèle N2 non calibré**, le plus ancien écart du projet. *Verrou* : inchangé.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

On veut dire à une entreprise combien d'eau tombe et s'écoule sur **son** territoire chaque année.
Pour ça on part d'une station de mesure sur une rivière voisine : elle donne un débit moyen, et on
connaît la surface qu'elle draine. En divisant, on obtient une **production par kilomètre carré**,
qu'on peut appliquer ailleurs.

Restait la question : **appliquer à quoi ?** Jusqu'ici, à la commune du site. Or une commune est un
découpage administratif : ses limites suivent des chemins, des haies, des accords du XIXᵉ siècle.
L'eau, elle, ne les connaît pas. Elle suit le relief, et le territoire qu'elle dessine s'appelle un
**bassin versant** : toute la surface dont les gouttes finissent au même endroit.

Ce sprint remplace le découpage administratif par le découpage de l'eau. Avec une conséquence qui a
demandé un arbitrage : on connaît aussi les **prélèvements** (l'eau pompée), mais uniquement par
commune. Diviser une production de bassin versant par des prélèvements de commune donnerait une
fraction dont le haut et le bas ne parlent pas du même endroit — et elle s'afficherait quand même
sagement en pourcentage. On a donc déplacé la production, **pas** le rapport, et on l'écrit à
l'écran.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Bassin versant** | Toute la surface dont l'eau converge vers un même point. Le territoire naturel de l'eau. |
| **Bassin élémentaire / de tronçon** | Ici, la surface qui s'écoule directement dans **un tronçon** de rivière, entre deux confluences — pas tout ce qui est en amont. |
| **Module** | Débit moyen d'une rivière sur plusieurs années, en m³/s. |
| **Débit spécifique** | Module ÷ surface drainée, en litres/seconde/km². La grandeur qui se transporte d'un territoire à l'autre. |
| **Transposition** | Appliquer le débit spécifique mesuré ici à une surface là-bas. Méthode de référence pour un territoire non jaugé. |
| **BNPE** | Banque nationale des prélèvements en eau. Publie les volumes pompés **par commune**. |
| **BD Topage** | Le référentiel hydrographique français. Fournit les 6 190 polygones de bassins. |
| **GeoJSON** | Un format JSON pour la géométrie : chaque objet a des `properties` et une `geometry` faite de listes de coordonnées `[longitude, latitude]`. |
| **Lancer de rayon** | Technique pour savoir si un point est dans un polygone : on trace une demi-droite et on compte les côtés traversés. Impair = dedans. |
| **Boîte englobante** | Le plus petit rectangle contenant une forme. Test grossier et très rapide. |
| **Anneau intérieur (trou)** | Un polygone GeoJSON commence par son contour, puis liste ses trous. |

### 7.3 Comment le code s'y prend

**Étape 1 — trouver le bassin.** Le cœur tient en quinze lignes, dans `lib/geoPoint.ts` :

```ts
// lib/geoPoint.ts
function ringContains(ring: Ring, lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]; const yi = ring[i]![1];
    const xj = ring[j]![0]; const yj = ring[j]![1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;   // un côté traversé de plus
    }
  }
  return inside;
}
```

Lisez `yi > lat !== yj > lat` comme : *« ce côté enjambe-t-il ma latitude ? »*. Si oui, on calcule où
il la croise, et s'il la croise **à ma droite**, on bascule `inside`. Un nombre impair de croisements
signifie qu'on est à l'intérieur.

⚠️ Le détail qui n'a l'air de rien : `>` d'un côté, pas `>=`. Deux bassins se partagent une frontière
— celle du bassin de droite et celle du bassin de gauche sont **la même ligne**. Avec `>=` des deux
côtés, un site pile sur la ligne appartiendrait aux **deux** ; avec le mauvais mélange, à
**aucun**. La règle semi-ouverte fait que le point est réclamé exactement une fois. C'est ce qui
transforme 6 190 polygones en une vraie **partition** du territoire.

Le contour vient avant les trous :

```ts
function polygonContains(rings: Ring[], lon: number, lat: number): boolean {
  if (rings.length === 0 || !ringContains(rings[0]!, lon, lat)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (ringContains(rings[i]!, lon, lat)) return false;   // dans un trou → dehors
  }
  return true;
}
```

**Étape 2 — répondre, y compris quand on ne sait pas.** `lib/bassinVersant.ts` ne renvoie pas
`Bassin | null`, mais **trois** états distincts :

```ts
export type BassinVersant =
  | { etat: "trouve"; nom: string; code?: string; surfaceKm2: number; detail: string }
  | { etat: "hors-couverture"; detail: string }
  | { etat: "indisponible"; detail: string };
```

`hors-couverture` = « le fichier a répondu, aucun bassin ne contient ce point » (en mer, hors
frontière, outre-mer). `indisponible` = « on n'a pas pu poser la question ». Les confondre, c'est
transformer une panne en affirmation sur le monde.

**Étape 3 — calculer, et refuser de calculer.** Dans `lib/ressource.ts` :

```ts
const bv = input.bassinVersant;
if (bv && bv.surfaceKm2 > 0) {
  etapes.push({ label: "Bassin versant du site", valeur: `${fmt(bv.surfaceKm2, 0)} km²`, detail: bv.nom });
  const ratioBv = surfaceBvKm2 / bv.surfaceKm2;
  if (bv.surfaceKm2 < BASSIN_MIN_KM2) {
    bassinRefuse = RESSOURCE_RESERVES.bassinTropPetit;          // un bief de canal
  } else if (ratioBv > RATIO_MAX || ratioBv < RATIO_MIN) {
    bassinRefuse = `La station draine ${fmt(surfaceBvKm2, 0)} km² pour un bassin de …`;
  } else {
    productionBassinM3An = (debitSpecifiqueLsKm2 / 1000) * bv.surfaceKm2 * SECONDS_PER_YEAR;
  }
}
```

Notez que le nom du bassin est poussé dans les étapes **avant** les deux refus : même quand on
refuse de calculer, on dit **dans quoi** le site tombe. Un refus muet et une absence de donnée se
ressemblent trop.

Et juste en dessous, le commentaire qui protège l'arbitrage :

```ts
// ⚠️ Do not "improve" this by swapping in the watershed area: the ratio
// below divides it by COMMUNE withdrawals. Changing one term alone would
// produce a fraction whose numerator and denominator describe two different
// territories — and it would still look like a percentage.
```

**Étape 4 — à l'écran.** `RessourcePanel.tsx` fait un second appel réseau. Le point important est ce
qu'il **ne** fait **pas** :

```ts
const loading = bnpe === undefined && citycode !== undefined;
```

`loading` ne mentionne pas le bassin versant. Une panne du référentiel des bassins coûte une réserve
et rien d'autre : le chiffre de tête, la pression sur le cours d'eau, ne dépend d'aucune surface et
reste affiché. Un test e2e vérifie précisément ça, en cassant la route exprès.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Pourquoi un nouveau fichier plutôt qu'ajouter au module géométrique existant ?** `lib/geoBbox.ts`
parcourt déjà exactement ces coordonnées, et il aurait été tentant d'y ajouter une fonction. Son
en-tête l'interdit, et il a raison : sa règle assumée est de tester des **boîtes englobantes**, parce
que sur une carte, trop dessiner est la bonne façon de se tromper. Pour rattacher un site à un
bassin, il n'y a **qu'une** réponse correcte. Deux questions différentes, deux modules — la boîte
englobante reste, comme **préfiltre**.

**Pourquoi ne pas avoir simplement remplacé la commune ?** Parce que le ratio d'autonomie divise les
prélèvements par la production. Remplacer la production sans remplacer les prélèvements aurait donné
un pourcentage faux — et un pourcentage faux ne se voit pas : il a l'air d'un pourcentage.

**Pourquoi ne pas avoir agrégé les prélèvements par bassin, alors ?** C'est faisable en principe (les
ouvrages BNPE portent des coordonnées). Deux raisons de ne pas le faire aujourd'hui : rien de tout
cela n'est vérifiable depuis cet environnement, et surtout un bassin **sans ouvrage recensé**
renverrait 0 — le lecteur y lirait « territoire préservé » là où la vérité est « on ne sait pas ».
C'est la règle centrale du dépôt, et elle vaut aussi contre les bonnes idées.

**Pourquoi un plancher plutôt qu'un filtre sur les noms ?** On aurait pu écarter les polygones dont
le nom contient « canal » ou « écluse ». C'est un sac de mots, et ce dépôt s'en méfie — il a déjà
mesuré ses limites au sprint 55. Une surface est un fait ; un nom est une chaîne de caractères. Le
plancher est chiffré, adossé à une mesure, et cette mesure est **rejouée** par le test plutôt que
recopiée dans un commentaire.

**Pourquoi signaler les noms coupés au lieu de les raccourcir proprement ?** Parce que les mots
manquants ne sont **pas dans le fichier**. Couper à la virgule précédente donnerait un nom d'aspect
propre et faux. « […] » dit la vérité : ce nom est incomplet, et ça ne vient pas de nous.

### 7.5 Pour expérimenter soi-même

**a) Casser un test, pour voir ce qu'il protège.** C'est le plus instructif. Ouvrez
`lib/ressource.ts` et faites l'« amélioration » que le commentaire interdit — remplacez la surface
communale par celle du bassin dans le calcul de l'autonomie :

```ts
// dans la branche 2b, remplacer :
ressourceCommuneM3An = (debitSpecifiqueLsKm2 / 1000) * surfaceCommuneKm2 * SECONDS_PER_YEAR;
// par :
ressourceCommuneM3An = (debitSpecifiqueLsKm2 / 1000) * (input.bassinVersant?.surfaceKm2 ?? surfaceCommuneKm2) * SECONDS_PER_YEAR;
```

Puis `npx tsx scripts/test/ressource.test.ts`. Une seule ligne tombe :

```
FAIL adding a watershed moves NOTHING on the commune scale
```

Tout le reste passe — y compris l'affichage, qui produirait un pourcentage parfaitement plausible.
C'est exactement pour ce genre de faute qu'on écrit un test d'**invariance** plutôt qu'un test de
valeur.

**b) Voir la partition de près — et voir aussi ce qu'un test ne voit pas.** Dans `lib/geoPoint.ts`,
remplacez `yi > lat !== yj > lat` par `yi >= lat !== yj >= lat`, puis lancez
`npx tsx scripts/test/geoPoint.test.ts`. **Une seule** ligne tombe (mesuré) :

```
FAIL a point on the shared divide (lat 0) belongs to exactly one basin
```

Une seule, parce que le bug ne se manifeste qu'au **sommet** partagé, pas le long de l'arête. Et
c'est là que l'expérience devient intéressante : relancez maintenant
`npx tsx scripts/test/bassinVersant.test.ts`, celui qui balaie 285 points sur les 6 190 bassins
réels. Il passe **entièrement**. Un balayage sur données réelles ne tombe jamais pile sur un sommet ;
il faut un polygone fabriqué pour ça. Les deux tests ne se remplacent donc pas : le fichier réel
prouve que la couche est bien une partition, le carré fabriqué prouve **pourquoi**. Remettez `>`,
relancez : tout revient.

**c) Interroger le vrai référentiel, sans réseau.** Le fichier est dans le dépôt :

```bash
npm run build && npx next start -p 3200 &
curl -s "http://localhost:3200/api/bassin-versant?lat=49.1193&lon=6.1757"   # Metz
curl -s "http://localhost:3200/api/bassin-versant?lat=43.0&lon=5.5"          # pleine mer
curl -s "http://localhost:3200/api/bassin-versant?lat=16.241&lon=-61.533"    # Guadeloupe
```

Le premier renvoie `trouve` et un nom coupé, marqué « […] ». Les deux autres renvoient
`hors-couverture` — la **même** réponse pour deux situations très différentes, et c'est délibéré :
le référentiel s'arrête à la métropole, il ne dit rien de plus. Changez les coordonnées pour votre
propre adresse et regardez dans quel tronçon de rivière vous vivez.
