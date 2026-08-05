# Compte rendu — Lisibilité de la carte (Sprint 30)

**Date** : 2026-08-05 · **Branche** : `claude/france-map-water-data-2oe6h6` · **Sprint** : 30

---

## 1. La question initiale

> « 1. Corrige la superposition des ouvrages d'une même commune.
> 2. Il faut que l'on puisse voir le nom et les caractéristiques des nappes, stations etc quand on
> clique dessus via la carte.
> 3. Ajouter les cours d'eau également. »

**Ce que j'ai compris** : trois corrections de la carte livrée au Sprint 29, toutes constatées en la
regardant. La première était déjà écrite comme étape n°1 du compte rendu précédent — l'utilisateur
l'a vue avant que je la traite. La deuxième porte sur un manque plus large qu'il n'y paraît : les
stations ouvraient une popup minimale, mais **les nappes ne répondaient à aucun clic**. La
troisième ajoute une couche.

**Ambiguïtés arbitrées** (deux questions posées, restées sans réponse — j'ai tranché et je le dis) :

- **Comment dégrouper ?** Deux voies : écarter les points en pétale, ou les fusionner en un marqueur
  compté. J'ai retenu **le marqueur compté**. Ces coordonnées sont le centroïde de la commune : les
  écarter dessinerait des positions que la BNPE ne publie pas, ce qu'un sprint plus tôt on avait
  refusé de faire en rejetant l'idée de placer un ouvrage sans coordonnées au centre de sa commune.
- **Quels cours d'eau ?** Le réseau hydrographique français compte des centaines de milliers de
  tronçons. J'ai retenu les **masses d'eau cours d'eau**, pendant surface exact de la couche de
  nappes déjà embarquée.

**Ce que j'ai délibérément laissé de côté** :

- L'**éclatement au clic** des marqueurs groupés (« spiderfy »). La popup liste les membres, ce qui
  répond à « qu'y a-t-il là-dessous » sans prétendre les situer.
- Les codes `NatureEcoulement` et `TypeMasseDEauSouterraine` des nappes, pourtant **renseignés** :
  sans la nomenclature Sandre, afficher « Nature d'écoulement : 3 » n'apprend rien.
- Le **lien profond entrant** `/carte?lat=&lon=`, toujours absent (déjà signalé au Sprint 29).

---

## 2. Ce qui a été réalisé

**En une phrase** : la carte ne cache plus rien derrière un point, chaque objet se présente quand on
le clique, et les rivières y sont.

**Dans les grandes lignes** :

- **Un sondage avant de coder, une quatrième fois — et il a de nouveau changé la conception.** Deux
  risques que le compte rendu du Sprint 29 laissait explicitement ouverts sont refermés ; trois
  champs se sont révélés inutilisables ou trompeurs (§3).
- **Le groupement se fait côté serveur, dans une fonction pure**, donc testable sans navigateur —
  et il devait précéder le plafond de marqueurs, sous peine de jeter des communes entières.
- **Un compteur qui ment est pire qu'un compteur absent** : grouper transforme « 300 ouvrages » en
  « 120 marqueurs ». `MapLayers.totals` sépare les deux.
- **Les cours d'eau ont exigé une conception différente de celle des nappes**, parce que la mesure a
  montré que la simplification n'y sert presque à rien.
- **Une erreur de conception commise et corrigée dans le sprint** : le premier build des rivières a
  appliqué le budget d'octets des nappes et n'a gardé que 6 % du réseau.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/carteEau.ts` | modifié | `finalize()` fusionne les objets co-localisés ; `countObjects()` compte les objets ; `caracteristiques` et `fiche` par objet ; `httpUrl()` refuse ce qui n'est pas une URL |
| `components/CarteEau.tsx` | modifié | `popupHtml()` / `nappePopupHtml()` ; marqueurs dimensionnés et **numérotés** ; nappes et rivières cliquables ; couche `cours-eau` |
| `components/CarteClient.tsx` | modifié | compteur lu sur `totals` ; bascule et réserves « cours d'eau » |
| `scripts/refdata/fetch_cours_eau.py` | neuf | télécharge, **découvre ses colonnes**, filtre, simplifie jusqu'à tenir un budget |
| `app/api/cours-eau/route.ts` | neuf | **filtre par bbox** : ~50 Ko envoyés là où le fichier en fait 5 840 |
| `data/refdata/cours-eau.geojson` | neuf | 9 746 masses d'eau rivière, tolérance 600 m |
| `scripts/diag/prod-diag.sh` | modifié | mode `carte2` : colonnes réelles, URI, couches cours d'eau, valeurs de `Karstique` |
| `scripts/test/carte.test.ts` | modifié | +11 vérifications (groupement, ordre groupement/plafond, comptage) |
| `scripts/test/e2e.mjs` | modifié | +12 vérifications (clic nappe, marqueur groupé, filtrage rivières) |
| `next.config.ts`, `.github/workflows/fetch-refdata.yml`, `components/Shell.tsx` | modifiés | embarquement du fichier, mode `cours-eau`, badge Sprint 30 |

---

## 3. Erreurs potentielles

### Bugs et erreurs trouvés et corrigés pendant la session

1. **Le premier build des rivières ne gardait que 6 % du réseau.** J'ai réutilisé sans réfléchir le
   budget d'octets des nappes (2 Mo), qui avait un sens pour un fichier téléchargé en entier par le
   navigateur. Le script a donc durci son filtre jusqu'à tenir : **Strahler ≥ 5, 569 rivières sur
   9 746**. La plupart des adresses n'auraient eu aucune rivière tracée — soit précisément
   l'inverse de la demande. Corrigé en changeant de conception : le budget porte sur le **fichier**,
   et la route filtre par emprise.
2. **`libelle_usage_principal` version rivières** : j'allais afficher `LongueurTotKm` en kilomètres.
   Le contrôle de distribution a montré une **médiane de 38 contre un maximum de 180 748** — deux
   unités dans la même colonne. Non affiché.
3. **Le compteur allait mentir.** Après groupement, `features[kind].length` compte des marqueurs.
   Sans `totals`, la barre serait passée de « 300 » à « 120 » sans que rien ne le signale.
4. **Contraste des nombres sur marqueur translucide** : les ouvrages au centroïde sont dessinés
   translucides, et un chiffre blanc y était illisible. Couleur du texte conditionnée à
   `approximate`.

### Vérifié en conditions réelles

- **Le sondage `carte2`** a interrogé les vrais référentiels : listes de colonnes complètes pour
  l'hydrométrie, la piézométrie et les **observations** ONDE, 699 couches Sandre énumérées, et les
  valeurs brutes de `Karstique` sur 200 masses d'eau.
- **Le build des rivières** a tourné deux fois sur le runner, avec ses mesures : 162 Mo téléchargés,
  9 746 entités, échelle de 12 combinaisons (Strahler × tolérance) toutes consignées au manifeste.
- **Le filtrage par bbox** est mesuré en local sur le vrai fichier : **569 entités / 716 Ko** en vue
  France, **82 entités / 49 Ko** autour de Chartres, **77 / 55 Ko** autour de Perpignan.
- **Le rendu a été regardé**, avec une charge utile réaliste : marqueur « 12 » cliqué, popup listant
  ses douze ouvrages et expliquant la position partagée ; clic sur une nappe renvoyant **deux**
  masses d'eau superposées (Alluvions quaternaires **et** Multicouche pliocène du Roussillon) avec
  leurs surfaces ; rivières tracées.

### Non vérifié en conditions réelles

- **Les popups des quatre couches de points n'ont jamais été vues avec de vraies données.** Les
  champs sont confirmés colonne par colonne par le sondage, mais **la route n'a pas été rejouée**
  après l'ajout de ces champs à `fields=`. Si l'un d'eux est refusé par Hub'Eau dans une combinaison
  que le sondage n'a pas testée, **la couche entière tombe en 400** — c'est le mode d'échec connu, et
  il n'est pas refermé par une exécution de bout en bout. **C'est le risque n°1 de ce sprint.**
- **La couche rivières n'a jamais été vue sur les vraies données de la route** : les captures
  utilisent le fichier réel (donc de vraies rivières), mais dans une page dont les points sont
  simulés.
- **`nom_departement` (piézo) et `libelle_departement` (BNPE)** sont demandés d'après la liste de
  colonnes, mais je n'ai pas vérifié qu'ils portent une valeur non nulle : ils pourraient être
  systématiquement absents et donc silencieusement retirés des popups.
- **Aucun déploiement Vercel.** Les deux entrées `outputFileTracingIncludes` (nappes, cours d'eau)
  ne sont vérifiées qu'en local, où elles ne servent à rien.
- **Le comportement à fort zoom** (étiquettes de rivières, densité de marqueurs numérotés) n'a été vu
  qu'au niveau de zoom d'une recherche à 10 et 30 km.

### Hypothèses qui pourraient ne pas tenir

- **La clé de groupement au mètre** (5 décimales) suppose qu'aucune paire d'objets réellement
  distincts ne partage un mètre carré. Vrai pour des ouvrages, **non vérifié** pour deux piézomètres
  d'un même forage à des profondeurs différentes.
- **`MAJOR = 5`** (Strahler à partir duquel une rivière est dessinée sans bbox) est un choix
  d'esthétique, pas une mesure : il donne 569 rivières, ce qui « fait une France lisible ».
- **Le padding de 1,3×** appliqué à la bbox des rivières est arbitraire.
- **Le plafond de 6 caractéristiques** par popup est un choix de mise en page.

### Ce qui casserait si une source amont changeait

- **Un renommage de colonne Hub'Eau** ⇒ 400 sur la couche concernée (les autres survivent).
- **Une nouvelle version de rapportage Sandre** ⇒ `sa:MasseDEauRiviere_VRAP2022_FXX` figé dans le
  script ; le fichier vieillirait en silence, **rien ne surveille sa péremption** (déjà vrai pour les
  nappes).
- **Le script des rivières découvre ses colonnes** (`NomMasseDEau`, `StrahlMax`… cherchés parmi des
  candidats) : un renommage change le résultat mais **n'échoue pas silencieusement**, le manifeste
  consigne la colonne retenue.

---

## 4. Points d'amélioration

**Dette assumée**

- **La popup des nappes s'ouvre à presque chaque clic sur la carte**, puisque le territoire est
  couvert de masses d'eau. C'est la demande (« voir le nom des nappes quand on clique dessus »), mais
  cela rend le clic « à côté » bavard.
- **Les nappes profondes restent absentes** et les codes `NatureEcoulement` / `TypeMasseDEauSouterraine`
  restent non traduits.
- **`data-map-ready`** reste un attribut posé impérativement sur le DOM depuis un effet React.
- **Deux fichiers embarqués** (2,35 Mo de nappes + 5,84 Mo de rivières) alourdissent le bundle
  serverless. Les nappes, elles, sont toujours envoyées **en entier** au navigateur : elles
  mériteraient le même filtrage par bbox que les rivières.

**À reprendre**

- **Rejouer `/api/carte` de bout en bout** après l'élargissement des `fields=` — le risque n°1.
- **Dégrouper visuellement au clic** si l'utilisateur trouve la liste insuffisante.
- **Compter les objets cachés dans le compteur de couche** lorsqu'un plafond a coupé : aujourd'hui
  `totals` compte ce qui est représenté, pas ce qui existe.

---

## 5. État Git

- **Branche de session** : `claude/france-map-water-data-2oe6h6`
- **`main` touché ?** : **NON.** Aucun merge, aucun rebase sur `main`. La branche attend la revue.
- **Déployé en prod ?** : **non.** Aucun déploiement Vercel déclenché ni vérifié.
- **Vérifications passées** : `npm run build` ✅ · `npm run lint` ✅ · **18 suites unitaires au vert**
  (`carte.test.ts` porte 43 vérifications) · **47/47 e2e** (35 existants + 12 neufs) · rendu
  **regardé** avec charge utile réaliste · `/api/cours-eau` mesuré sur le vrai fichier.
- **Sortie de diagnostic** : `data/diag/` purgé après lecture, selon la convention.

---

## 6. Prochaines étapes

1. **Rejouer `/api/carte` contre les vrais services** après l'élargissement des `fields=`.
   *Verrou* : aucun — le mode `carte` du diagnostic fait déjà exactement cela, il suffit de le
   relancer. **C'est la vérification manquante la plus risquée du sprint.**
2. **Filtrer les nappes par bbox comme les rivières.** *Verrou* : aucun ; le code de `/api/cours-eau`
   se transpose. Diviserait par ~40 ce que la page télécharge.
3. **Traduire les nomenclatures Sandre** (`NatureEcoulement`, `TypeMasseDEauSouterraine`) pour
   enrichir la popup des nappes. *Verrou* : trouver la table de nomenclature — à sonder.
4. **Lien profond entrant `/carte?lat=&lon=`.** *Verrou* : aucun.
5. **Croiser les ouvrages BNPE avec `code_entite_hydro_cours_eau`** pour corriger l'artefact Toulouse
   du Sprint 28. *Verrou* : le champ était `null` sur l'échantillon vu — mesurer sa couverture.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Une carte affiche des points. Trois choses n'allaient pas. D'abord, plusieurs points pouvaient se
trouver **exactement au même endroit** : on en voyait un, il y en avait douze, et rien ne le disait.
Ensuite, cliquer sur un objet ne racontait presque rien, et cliquer sur une nappe d'eau souterraine
ne faisait **rien du tout**. Enfin, il manquait les rivières : difficile de comprendre qu'une station
mesure « le débit » sans voir de quel cours d'eau on parle.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Centroïde** | Le centre géométrique d'une forme. Ici : le centre d'une commune, utilisé comme position par défaut quand la vraie position d'un ouvrage n'est pas publiée. |
| **Masse d'eau** | L'unité de découpage de la réglementation européenne sur l'eau. Il en existe pour les nappes (souterraines) et pour les rivières (de surface). |
| **Ordre de Strahler** | Une façon de mesurer l'importance d'un cours d'eau : un ruisseau de tête vaut 1, et le chiffre monte à chaque confluence de deux cours d'eau de même rang. La Loire est autour de 7. |
| **bbox** | « Bounding box » : un rectangle géographique, utilisé pour ne demander que ce qui est dans la vue. |
| **Simplification** | Retirer des points d'un tracé pour l'alléger, en gardant sa forme générale. La « tolérance » est l'écart maximal toléré. |
| **Popup** | La bulle d'information qui s'ouvre au clic. |
| **Référentiel** | Le catalogue officiel d'objets (stations, ouvrages, masses d'eau) publié par l'État. |

### 7.3 Comment le code s'y prend

**Étape 1 — regrouper ce qui est au même endroit.** La règle tient en une clé :

```ts
// lib/carteEau.ts
// 5 décimales ≈ 1 m : deux ouvrages réellement relevés ne tombent jamais sur le
// même mètre, deux centroïdes de la même commune si.
function positionKey(f: MapFeature): string {
  return `${f.lon.toFixed(5)},${f.lat.toFixed(5)}`;
}
```

Puis on range les objets par clé, et un groupe de plusieurs devient **un** marqueur qui se souvient
des autres :

```ts
markers.push({
  ...head,                       // il garde l'identité du plus proche
  groupe: {
    total: bucket.length,
    membres: bucket.map((f) => ({ code: f.code, label: f.label, detail: f.detail })),
  },
});
```

⚠️ **L'ordre des opérations est le vrai piège.** La carte plafonne à 300 marqueurs pour ne pas
étouffer le navigateur. Si l'on plafonnait **avant** de regrouper, les 300 places partiraient en
doublons de quelques communes, et des communes plus proches disparaîtraient — la carte serait plus
fausse qu'avant. Le commentaire dans le code le dit, parce que c'est le genre de détail qu'une
relecture inverse par mégarde.

**Étape 2 — ne pas laisser le compteur mentir.** La barre du haut affiche « Ouvrages (300) ». Après
regroupement, la liste ne contient plus que ~120 marqueurs. Deux vérités différentes :

```ts
// lib/carteEau.ts — un marqueur groupé compte pour tous ses membres
export function countObjects(features: MapFeature[]): number {
  return features.reduce((sum, f) => sum + (f.groupe?.total ?? 1), 0);
}
```

Le plafond compte des **marqueurs**, le compteur affiche des **objets**, et la réponse de l'API porte
désormais les deux.

**Étape 3 — dire ce qu'on affiche, et seulement ce qu'on a vérifié.** Chaque objet porte une liste de
caractéristiques :

```ts
caracteristiques: [
  { label: "Masse d'eau", valeur: masses[0] },
  { label: "Profondeur d'investigation", valeur: fmtNumber(num(r.profondeur_investigation), "m", 1) },
  { label: "Mesures", valeur: fmtPeriode(str(r.date_debut_mesure), str(r.date_fin_mesure)) },
],
```

Deux règles s'y cachent. La première : **chaque nom de colonne ci-dessus a été lu dans une vraie
réponse** avant d'être écrit, parce que l'API répond `400` sur un champ inconnu — et un `400` fait
tomber toute la couche, pas seulement le champ. La deuxième :

```ts
// Une caractéristique sans valeur est RETIRÉE, jamais rendue en « — » :
// « Profondeur : — » se lit comme une absence mesurée.
const caracteristiques = extra?.caracteristiques?.filter((c) => Boolean(c.valeur));
```

**Étape 4 — les liens, seulement quand ils existent.** Certains référentiels publient l'adresse de la
fiche officielle. La tentation est de deviner l'URL. Le code refuse :

```ts
// Le nom de colonne ment dans les deux sens : `urn_bss` contient une URL http,
// tandis que l'hydrométrie ne publie aucune URI de station. La valeur décide.
function httpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : undefined;
}
```

Résultat : les piézomètres, les points ONDE et les ouvrages ont un lien ; **les stations de débit
n'en ont pas**, et c'est volontaire.

**Étape 5 — les rivières, ou pourquoi la solution des nappes ne marchait pas.** Pour les nappes, on
avait téléchargé un gros fichier, simplifié les contours, et embarqué le résultat. Appliqué aux
rivières, le même script a donné ceci (mesures réelles, toutes au manifeste) :

```
toutes les 9 746 rivières   150 m → 7,64 Mo      1 200 m → 5,64 Mo
```

Huit fois plus de tolérance pour 26 % de gain : la simplification ne servait à rien. La raison est
que les coordonnées sont **déjà** arrondies à ~100 m — le poids vient du **nombre de rivières**, pas
de la finesse de leur tracé. Le script a donc fait la seule chose qu'il pouvait pour tenir le budget :
supprimer des rivières, jusqu'à n'en garder que 569 sur 9 746.

La sortie n'était pas de mieux simplifier, mais de **changer de question** : le fichier n'a pas besoin
d'être petit, c'est la **réponse** qui doit l'être.

```ts
// app/api/cours-eau/route.ts
const features = box
  ? data.features.filter((f) => overlaps(f, box))          // ce qui est dans la vue
  : data.features.filter((f) => (f.properties?.strahler ?? 0) >= MAJOR); // squelette national
```

Mesuré : 5,84 Mo sur le disque, **49 Ko** envoyés au navigateur autour de Chartres.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Pourquoi ne pas écarter les points superposés en pétale ?** Parce que ces positions ne sont pas
  des positions : c'est le centre de la commune, publié faute de mieux. Les écarter produirait douze
  emplacements dont **aucun** ne figure dans les données. Le marqueur compté dit la seule chose
  vraie : « il y a douze objets ici, et voici lesquels ».
- **Pourquoi compter les objets et pas les marqueurs ?** Parce que le lecteur de « Ouvrages (300) »
  compte des ouvrages. Un compteur qui change de sens sans le dire est pire qu'un compteur absent.
- **Pourquoi les masses d'eau rivière et pas le vrai réseau hydrographique ?** Le réseau complet
  compte des centaines de milliers de tronçons. Les masses d'eau rivière sont **le pendant exact de
  la couche de nappes déjà embarquée** — même producteur, même version, même logique réglementaire —
  et elles portent un nom et un ordre de Strahler. La contrepartie est écrite dans l'encart de la
  page : les petits ruisseaux non découpés en masses d'eau n'y figurent pas.
- **Pourquoi refuser d'afficher `Karstique` et la longueur ?** Parce que les deux sont faux ou
  invérifiables. `Karstique` vaut 0 sur les 200 masses d'eau sondées, y compris des calcaires
  notoirement karstiques : le champ n'est pas renseigné, et afficher « Karstique : non » sur les
  Causses serait inventer. La longueur mélange deux unités dans la même colonne. Une carte qui
  affiche moins mais juste vaut mieux qu'une carte complète et fausse.

### 7.5 Pour expérimenter soi-même

**A. Casser le test qui protège l'ordre des opérations.**

Dans `lib/carteEau.ts`, inversez le regroupement et le plafond — appliquez `.slice(0, MAX_FEATURES_PER_LAYER)`
sur `unique` **avant** de construire les groupes. Puis :

```bash
npx tsx scripts/test/carte.test.ts
```

`FAIL no structure is lost to the cap by grouping first` et `FAIL the nearer distinct structure
survives the crowd`. Le test construit exprès 400 ouvrages sur un seul centroïde **plus loin** qu'un
ouvrage isolé : en plafonnant d'abord, les 400 doublons mangent les places et l'ouvrage proche
disparaît. C'est un bug qu'on ne verrait jamais sur un jeu de données de dix lignes, et qui rendrait
la carte fausse précisément là où elle est dense.

**B. Voir le compteur mentir.**

Dans `components/CarteClient.tsx`, remplacez :

```ts
const counts = layers?.totals ?? null;
```

par un comptage des marqueurs :

```ts
const counts = layers
  ? Object.fromEntries(LAYERS.map((l) => [l.kind, layers.features[l.kind].length]))
  : null;
```

Puis lancez l'e2e (`npm run build`, `npx next start -p 3300`, puis
`BASE=http://localhost:3300 node scripts/test/e2e.mjs`). Le test
`the counter shows objects, not markers` échoue : la charge utile contient douze ouvrages regroupés
en un marqueur, et la barre affiche « (1) ». C'est exactement le mensonge que `totals` évite.

**C. Sentir le compromis des rivières.**

Dans `app/api/cours-eau/route.ts`, passez `MAJOR` de `5` à `3`, reconstruisez, et comparez :

```bash
curl -s -o /dev/null -w "%{size_download} octets\n" http://localhost:3300/api/cours-eau
```

Vous passerez d'environ 716 Ko à plusieurs mégaoctets pour la vue France entière — et vous verrez, en
ouvrant `/carte` sans chercher d'adresse, la carte se couvrir de rivières jusqu'à devenir illisible.
Le même réglage vu des deux côtés : ce que le navigateur télécharge, et ce que l'œil peut lire.
