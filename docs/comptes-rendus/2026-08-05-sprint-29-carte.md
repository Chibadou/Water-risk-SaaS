# Compte rendu — Carte des ressources en eau (Sprint 29)

**Date** : 2026-08-05 · **Branche** : `claude/france-map-water-data-2oe6h6` · **Sprint** : 29

---

## 1. La question initiale

> « Je voudrais ajouter une page avec une carte de la France affichant les nappes et stations (et
> autres données). Ainsi l'utilisateur pourrait voir ces sites important en terme d'eau à proximité
> d'une adresse voulue. »

**Ce que j'ai compris** : l'outil ne sait répondre qu'à une question ponctuelle — « quel est le
risque à cette adresse ? ». Il ne montre nulle part **où sont les objets physiques de la ressource**
autour de ce point. La demande est un outil de **repérage** : je tape une adresse, je vois ce qui
existe autour en matière d'eau, et je peux passer de là à l'analyse d'un point.

Deux ambiguïtés, arbitrées avec l'utilisateur avant de coder :

- **« les nappes »** — les piézomètres qui les suivent, ou leur emprise géographique ? Réponse : les
  deux, points **et** polygones.
- **« et autres données »** — quatre couches proposées, trois retenues : stations Hub'Eau (débit,
  piézomètres, ONDE), contours de nappes, ouvrages de prélèvement BNPE.

**Ce que j'ai délibérément laissé de côté** :

- **Les zones de restriction VigiEau**, proposées et **non retenues** par l'utilisateur. Elles
  seraient pourtant quasi gratuites (`/api/pmtiles` et `ZonesMap.tsx` existent déjà) — je le note
  parce que c'est un ajout d'une dizaine de lignes si l'envie revient, pas un chantier.
- **Un lien profond entrant vers `/carte`** (`?lat=&lon=`). La popup sort vers `/`, mais on ne peut
  pas partager une vue de carte. Non demandé, non fait ; c'est un manque de symétrie assumé.
- **Les sites enregistrés en marqueurs** sur cette carte. Non demandé.

---

## 2. Ce qui a été réalisé

**En une phrase** : une page `/carte` qui montre, autour d'une adresse, les stations qui mesurent
l'eau, les ouvrages qui la prélèvent et l'emprise des nappes — un repère, qui n'entre dans aucun
score du produit.

**Dans les grandes lignes** :

- **Trois passes de sondage avant la moindre ligne de code produit**, parce que deux des trois
  couches demandées reposaient sur des données que le dépôt n'avait jamais regardées. Deux des trois
  réponses ont changé la conception (détail au §3).
- **Une couche de données neuve plutôt qu'un réemploi forcé** : `/api/hydro` et `/api/piezo`
  rattachent **une** station à un site en sondant chaque candidate, et `StationOption` **ne porte
  même pas de coordonnées**. Une carte veut l'inverse : tout ce qui est dans la vue, positionné, sans
  chronique.
- **Chaque couche échoue seule.** Une panne Hub'Eau sur les piézomètres ne doit pas vider la carte,
  et une couche qui revient tronquée doit le **dire** au lieu d'avoir l'air complète.
- **Les nappes ont exigé de changer d'approche** : le service Sandre filtre *quelles* entités il
  renvoie, jamais leur résolution. Ni l'embarqué brut ni le live par viewport n'étaient viables ; la
  simplification se fait une fois, hors ligne, sur le runner.
- **Un bug d'affichage vieux de six sprints a été trouvé — en regardant la page.** `map.on("load")`
  n'installe aucune couche quand le fond de carte est injoignable. Aucune sonde de nombres ne pouvait
  le voir ; il a fallu ouvrir la page dans un navigateur.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/carteEau.ts` | neuf | Parseurs **purs** par référentiel Hub'Eau + orchestrateur où chaque couche échoue seule. Constantes de rayon, bornage, plafonds. |
| `app/api/carte/route.ts` | neuf | `?lat=&lon=&rayon=` → les quatre couches. Rayon **borné côté serveur** (5-100 km). |
| `scripts/refdata/fetch_nappes.py` | neuf | Télécharge les 237 Mo une fois sur le runner, garde les masses d'eau **affleurantes**, simplifie jusqu'à tenir un budget d'octets. |
| `app/api/nappes/route.ts` | neuf | Sert `data/refdata/nappes.geojson` (jumeau de `/api/departements`). |
| `data/refdata/nappes.geojson` | neuf | **621 masses d'eau affleurantes**, 2,35 Mo, tolérance 400 m. |
| `components/CarteEau.tsx` | neuf | La carte MapLibre : couches, légende, popup, cadrage sur le rayon, « Rechercher dans cette zone ». |
| `components/CarteClient.tsx` | neuf | La page : adresse, rayon, bascules, messages par couche, encart « ce que la carte ne dit pas ». |
| `components/AddressAutocomplete.tsx` | neuf | Autocomplete BAN **extrait** de `AddressSearch` pour être réutilisable. |
| `app/carte/page.tsx` | neuf | La route Next + ses métadonnées. |
| `components/AddressSearch.tsx` | modifié | Consomme l'autocomplete extrait ; ses sélecteurs métier sont inchangés. |
| `components/ZonesMap.tsx` | modifié | **Correction du même bug `load`** qu'il portait en silence depuis le Sprint 3. |
| `lib/hubeau.ts` | modifié | `bboxAround`/`haversineKm`/`hubeauJson`/`num`/`str` exportés ; `bboxAround` prend un rayon **optionnel** — aucun appelant existant touché. |
| `components/Shell.tsx` | modifié | Entrée de nav « Carte », badge Sprint 29. |
| `next.config.ts` | modifié | `outputFileTracingIncludes` pour `/api/nappes`. |
| `scripts/diag/prod-diag.sh` | modifié | Mode `carte` : sondage des schémas **et** exécution de bout en bout de `/api/carte`. |
| `scripts/test/carte.test.ts` | neuf | 30 vérifications sur les parseurs. |
| `scripts/test/e2e.mjs` | modifié | +13 vérifications sur la page. |

---

## 3. Erreurs potentielles

### Bugs trouvés et corrigés pendant la session

1. **`map.on("load")` n'installe jamais rien quand le fond de carte est injoignable.** C'est le plus
   grave, et il **préexistait** : `ZonesMap.tsx` le porte depuis le Sprint 3. `load` — et
   `map.isStyleLoaded()` aussi — attend que **toutes** les sources se stabilisent, fond raster
   compris. Mesuré : avec l'egress bloqué, aucune couche n'était créée et `/api/nappes`, servi
   **localement** et sans besoin de réseau, **n'était jamais requêté**. Corrigé en installant sur
   `styledata`. ⚠️ En production les tuiles répondent, donc `ZonesMap` fonctionnait — mais une panne
   de CDN aurait suffi à faire disparaître les zones d'arrêté sans un mot.
2. **`libelle_usage_principal` n'existe pas sur `referentiel/ouvrages`.** Je l'avais écrit d'après
   l'intuition « un ouvrage a un usage ». Hub'Eau répond **400 sur un champ inconnu** : la couche
   entière serait tombée. Le sondage a listé les vraies colonnes avant le premier appel réel.
3. **Le cadrage ignorait le rayon** : une recherche à 10 km et une à 60 km atterrissaient au même
   zoom, les points tassés au centre. Remplacé par un `fitBounds` sur le disque réellement interrogé.
4. **Collision de couleurs sur les points ONDE** : leur remplissage code l'écoulement observé, et le
   violet « assec » est celui des piézomètres, le vert « visible » proche du vert des ouvrages. La
   carte se lisait donc de travers. Les points ONDE portent maintenant un **anneau** à la couleur de
   leur couche : remplissage = ce qui a été observé, anneau = de quelle couche il s'agit.
5. **Deux espaces avalés par JSX** autour de balises `<strong>` (« sert à situer— elle »). Corrigés
   par `{" "}`, la convention déjà en place dans le dépôt.
6. **La couche des ouvrages était tronquée à *tous* les rayons** — trouvé par l'exécution de bout en
   bout sur données réelles, pas avant. Les ouvrages de prélèvement sont bien plus denses que les
   réseaux de mesure : **même un rayon de 10 km sur Lyon saturait une page de 500 lignes**, donc
   chaque requête revenait incomplète, y compris au rayon le plus petit que propose l'interface. Deux
   corrections : page portée à **5 000** pour cette couche seule (`lib/bnpe.ts` demande cette taille
   au même référentiel depuis le Sprint 10, elle est donc connue pour passer), et **distinction de
   deux messages** qui étaient confondus — « le serveur s'est arrêté, on ignore ce qui manque »
   (avertissement) contre « on a gardé les 300 plus proches » (simple constat, rien d'inconnu).

Les points 3 et 4 n'ont été vus **ni par les tests unitaires, ni par les sondes de données** : ils
n'existent qu'à l'écran (voir §7.5). Le point 6, à l'inverse, n'était visible **que** sur données
réelles : aucune fixture n'a la densité du réseau BNPE lyonnais.

### Vérifié en conditions réelles (mode diag `carte`, run 32)

`/api/carte` a été **construit et exécuté sur le runner**, contre les vrais services, sur trois points
contrastés. Ce qui est mesuré, et non supposé :

| | Chartres (30 km) | Lyon (10 km) | Perpignan (60 km) |
|---|---|---|---|
| Stations de débit | 10 | 10 | 83 |
| Piézomètres | 24 | 7 | 91 |
| Observations ONDE | 13 | 2 | 46 |
| Ouvrages BNPE | 300 (plafond) | 300 (plafond) | 300 (plafond) |
| Ouvrages en position approchée | 60 | 2 | 178 |
| Distance maximale rendue | 29,8 km | 9,8 km | 59,9 km |

- **Le filtre de rayon tient exactement** : 29,8 / 9,8 / 59,9 km pour des rayons demandés de 30 / 10 /
  60. Aucun point de la bbox carrée n'a fui hors du disque.
- **Les libellés et positions sont réels et justes** : « L'Eure à Lèves » à 2,6 km de Chartres, « La
  Saône à Lyon [Pont La Feuillée] » à 0,9 km, « La Têt [partielle] à Perpignan » à 0,6 km.
- **Deux risques du plan sont refermés** : `libelle_cours_eau` **existe bien** sur le référentiel
  hydrométrique (il remonte « L'Eure », « La Saône », « La Têt »), et les **observations ONDE portent
  bien un libellé de station** (« La Roguenette à Nogent-le-Phaye ») — le retrait du filtre `fields=`
  sur cet appel était la bonne prudence, et sa raison d'être est levée.
- **Le classifieur d'écoulement lit les vrais libellés** : 13/13, 2/2 et 46/46 observations ont reçu
  une sévérité, sur des textes réels non accentués (« Ecoulement visible faible »).
- **Les positions approchées ne sont pas anecdotiques** : 178 ouvrages sur 300 autour de Perpignan
  sont publiés au centroïde de leur commune. Sans le signalement, ce serait la majorité de la couche
  qui mentirait sur sa position.

### Non vérifié en conditions réelles

- **La correction du plafond BNPE (5 000 lignes) n'a pas été re-mesurée en réel.** Elle est déduite du
  fait que `lib/bnpe.ts` utilise cette taille depuis le Sprint 10 sur le **même** référentiel, pas
  d'une nouvelle sonde : le temps de réponse et le volume à 5 000 lignes sur un rayon de 60 km ne sont
  **pas** mesurés. Par conséquent, la carte rendue ci-dessous l'a été avec la charge utile capturée
  **avant** ce correctif — après, le nombre d'ouvrages dans le disque peut être bien supérieur à 300,
  et c'est toujours 300 qui seront dessinés.
- **La charge utile réelle a été rejouée à l'écran** (Perpignan, 60 km : 83 + 91 + 46 + 300 = **520
  points**) : la carte reste lisible, les ouvrages au centroïde de commune se distinguent bien à
  l'œil par leur transparence, et les points ONDE se lisent par leur anneau. Ce que cela ne dit pas :
  plusieurs ouvrages d'une même commune se superposent **exactement** (ils partagent le centroïde),
  donc un point translucide peut en cacher dix. Rien dans l'interface ne le laisse deviner.
- **Le mode « Rechercher dans cette zone » n'a jamais tourné contre les vrais services** — seulement
  contre l'interception. Le centre du viewport peut tomber en mer ou hors de France, cas non testé.
- **Aucun déploiement Vercel n'a été fait.** L'entrée `outputFileTracingIncludes` de `/api/nappes`
  n'est donc vérifiée qu'en local, où elle ne sert à rien : son oubli ne casse **que** la production.
- **`libelle_site`** (référentiel hydrométrique) reste demandé sans avoir été observé dans une
  réponse ; il n'a jamais servi de repli, `libelle_cours_eau` ayant toujours répondu. Le risque de 400
  sur ce champ n'est donc **pas** formellement refermé, contrairement aux deux autres.

### Hypothèses qui pourraient ne pas tenir

- **`SurfaceAffKm > 0` comme définition de « affleurant »** : c'est le champ du référentiel, pas un
  seuil inventé, mais il exclut **18 masses d'eau sur 639** dont je n'ai pas regardé la nature.
- **La tolérance de 400 m** a été choisie par un budget d'octets (2,35 Mo), pas par une exigence
  cartographique. Une nappe étroite peut y perdre sa forme.
- **`PIEZO_STALE_DAYS = 365`** et **`ONDE_LOOKBACK_DAYS = 365`** sont des réglages de lisibilité que
  j'ai posés : assez larges pour qu'une campagne ONDE saisonnière reste visible en hiver, assez
  étroits pour ne pas afficher des piézomètres arrêtés depuis dix ans. Non calibrés sur des données.
- **Le plafond `MAX_FEATURES_PER_LAYER = 300`** protège le navigateur mais **coupe après tri par
  distance** : au-delà, la carte est honnêtement incomplète, et le dit.

### Ce qui casserait si une source amont changeait

- **Un renommage de colonne Hub'Eau** ⇒ 400 sur la couche concernée (les autres survivent).
- **Une nouvelle version SDAGE des masses d'eau** ⇒ le nom de couche `sa:MasseDEauSouterraine_VRAP2022_FXX`
  est figé dans le script : il faudra le relancer avec le nouveau nom, sans quoi les contours vieillissent
  en silence — **rien ne surveille leur péremption**.
- **Un CDN de tuiles indisponible** ⇒ fond gris, mais **les couches s'affichent quand même** depuis
  ce sprint. C'était précisément le bug.

---

## 4. Points d'amélioration

**Dette assumée**

- **2,35 Mo de GeoJSON envoyés au navigateur** à chaque ouverture de la page (mis en cache une
  journée). Des tuiles vectorielles seraient la bonne réponse ; elles supposent une chaîne de
  génération que le dépôt n'a pas.
- **Les nappes profondes ne sont pas représentées** — décision motivée (leur emprise recouvrirait
  celle qui affleure), écrite dans l'encart « ce que la carte ne dit pas », mais c'est une amputation
  du sujet « les nappes ».
- **`lib/onde.ts` garde ses propres copies** de `bboxAround`/`haversineKm`. J'ai exporté celles de
  `lib/hubeau.ts` sans aller dédupliquer ailleurs, pour ne pas mêler un nettoyage à ce sprint.

**À reprendre**

- **Fermer le risque `fields=` une bonne fois** : un sondage qui liste les colonnes de **chaque**
  endpoint réellement appelé, plutôt qu'un endpoint voisin (cf. §3).
- **La popup ne dit pas la fraîcheur** de la mesure pour les stations de débit et les piézomètres —
  l'information existe (`date_fin_mesure`), elle n'est pas remontée.
- **`data-map-ready` est un attribut posé à la main sur le DOM** depuis un effet React. Ça marche et
  c'est testable, mais c'est du DOM impératif dans un composant déclaratif.

---

## 5. État Git

- **Branche de session** : `claude/france-map-water-data-2oe6h6`
- **`main` touché ?** : **NON.** Aucun merge, aucun rebase sur `main`. La branche attend la revue.
- **Déployé en prod ?** : **non.** Aucun déploiement Vercel déclenché ni vérifié pendant la session.
- **Vérifications passées** : `npm run build` ✅ · `npm run lint` ✅ · **18 suites unitaires au vert**
  (dont `carte.test.ts`, neuve, 32 vérifications) · **35/35 e2e** (22 existants + 13 neufs) · rendu de
  la page **regardé** en navigateur, en état dégradé puis avec données simulées · **`/api/carte`
  exécuté de bout en bout contre les vrais services** sur trois points (§3).
- **Sortie de diagnostic** : `data/diag/` purgé après lecture, selon la convention.

---

## 6. Prochaines étapes

1. **Dégrouper les ouvrages superposés.** Constaté en rejouant la charge utile réelle : les ouvrages
   d'une même commune partagent exactement le centroïde, donc un point peut en cacher dix, et
   **rien ne le laisse deviner**. Un compteur dans la popup (« 7 ouvrages à cette position ») ou un
   décalage en pétale règlerait le plus gros du problème. *Verrou* : aucun, c'est du code client.
2. **Décider quoi faire de la densité BNPE.** Le plafond à 300 est un garde-fou, pas une réponse :
   une agrégation par commune, ou un affichage conditionné au zoom, dirait la même chose sans noyer
   la carte. *Verrou* : mesurer d'abord combien d'ouvrages remontent réellement depuis le passage à
   5 000 lignes — le chiffre n'est pas connu.
3. **Appliquer la méthode d'inspection visuelle aux panneaux des Sprints 26-28**, signalés « jamais
   vus » trois sprints de suite. *Verrou* : levé — voir §7.5, l'interception `page.route()` marche
   depuis le bac à sable.
4. **Lien profond entrant `/carte?lat=&lon=`** pour partager une vue. *Verrou* : aucun, c'est du
   confort — mais c'est la symétrie manquante avec le reste de l'app.
5. **Croiser les ouvrages BNPE avec le réseau hydrographique** (`code_entite_hydro_cours_eau`) pour
   corriger l'artefact Toulouse du Sprint 28 au lieu de l'annoter. *Verrou* : le champ était `null`
   sur l'échantillon vu — mesurer sa couverture avant d'investir.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Quand une entreprise veut savoir si son usine risque de manquer d'eau, elle regarde des chiffres :
des jours de restriction, des niveaux d'alerte. Ces chiffres viennent d'appareils bien réels —
des capteurs dans les rivières, des tubes plantés dans le sol pour mesurer le niveau de l'eau
souterraine, des observateurs qui vont voir chaque été si un ruisseau est à sec. Jusqu'ici notre
outil utilisait ces mesures sans jamais montrer **d'où elles viennent**, ni **ce qu'il y a autour**.
Cette page répond à « qu'est-ce qu'il y a, en matière d'eau, autour de cette adresse ? » — et rien
d'autre : elle ne note rien, elle montre.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Nappe** | Eau contenue dans les roches sous nos pieds. On y puise par des forages. |
| **Masse d'eau souterraine** | Le découpage administratif des nappes utilisé par la réglementation européenne — l'unité dans laquelle l'État raisonne. |
| **Affleurante** | Une masse d'eau qui touche la surface du sol quelque part. Les autres sont recouvertes par d'autres couches. |
| **Piézomètre** | Un tube foré jusqu'à la nappe, où l'on mesure la hauteur de l'eau. |
| **Station hydrométrique** | Un point de rivière équipé pour mesurer le débit. |
| **ONDE** | Réseau d'observateurs de terrain qui notent l'été, à l'œil, si un petit cours d'eau coule encore ou s'il est à sec. |
| **BNPE** | Base nationale des prélèvements en eau : qui pompe, où, dans quel milieu. |
| **Hub'Eau** | Le portail d'API publiques qui expose toutes ces données. |
| **Sandre** | Le service qui publie les référentiels géographiques de l'eau (les contours). |
| **WFS** | Un protocole standard pour demander des objets géographiques à un serveur. |
| **GeoJSON** | Un format de fichier décrivant des formes géographiques en JSON. |
| **bbox** | Un rectangle « du coin sud-ouest au coin nord-est » servant à filtrer par zone. |
| **MapLibre** | La bibliothèque JavaScript qui dessine la carte dans le navigateur. |
| **Tuile / fond de carte** | Les petites images qui composent le décor de la carte (routes, villes). |

### 7.3 Comment le code s'y prend

**Étape 1 — l'adresse devient un point.** L'utilisateur tape une adresse, un service public renvoie
des coordonnées. Ce bout de code existait déjà dans le formulaire d'analyse ; je l'ai **sorti** dans
son propre composant (`components/AddressAutocomplete.tsx`) pour que la carte l'utilise sans hériter
des menus « secteur d'activité », « origine de l'eau » qui ne la concernent pas.

**Étape 2 — le point devient quatre requêtes.** Chaque source a son adresse et ses colonnes. Le
point important est que les quatre partent ensemble et que **l'échec de l'une n'emporte pas les
autres** (`lib/carteEau.ts`) :

```ts
const results = await Promise.all(
  SPECS.map(async (spec) => {
    const rows = await hubeauJson(spec.url(bbox), spec.revalidate, UPSTREAM_TIMEOUT_MS);
    if (rows === null) return { spec, features: [], message: spec.down };
    // Une page pleine signifie que le serveur s'est arrêté sur SON ordre à lui,
    // qui n'est pas la distance : des points proches manquent peut-être.
    const truncated = rows.length >= MAX_ROWS;
    ...
```

Ce `truncated` n'est pas une précaution théorique : le sondage a mesuré que le référentiel des
piézomètres renvoie **exactement 500 lignes** dans un rayon de 60 km. C'est le maximum d'une page. Au
delà, on ne sait pas ce qui manque — donc on l'écrit à l'écran plutôt que de montrer une carte qui a
l'air complète.

**Étape 3 — les lignes deviennent des points.** Chaque source a ses pièges. Le plus instructif est
celui des piézomètres :

```ts
// lib/carteEau.ts
// ⚠️ Le référentiel piézo n'a AUCUNE colonne longitude/latitude (vérifié au
// Sprint 9) : les coordonnées sont dans `geometry` (vide en format=json) avec
// x/y en repli.
const geom = row(r.geometry);
const coords = Array.isArray(geom?.coordinates) ? geom.coordinates : undefined;
const lon = (coords ? num(coords[0]) : undefined) ?? num(r.x);
const lat = (coords ? num(coords[1]) : undefined) ?? num(r.y);
```

Le sondage a confirmé la bizarrerie : sur 500 stations, **0 avaient un `geometry` rempli et 500
avaient `x`/`y`**. Lire uniquement `geometry`, comme le nom le suggère, aurait donné une carte
totalement vide — sans erreur, sans message.

Une règle traverse tout le fichier : **une ligne sans coordonnées est jetée, jamais placée en 0/0**.

```ts
if (!code || lon === undefined || lat === undefined) return undefined;
// Hub'Eau porte parfois 0/0 pour un objet non positionné ; c'est l'Atlantique.
if (lon === 0 && lat === 0) return undefined;
```

**Étape 4 — le cas le plus intéressant : quand la donnée avoue être fausse.** Les ouvrages de
prélèvement ont bien des coordonnées. Mais le référentiel publie aussi la **qualité** de ces
coordonnées, et une valeur signifie littéralement « centre de la commune » :

```ts
const precision = str(r.libelle_precision_coord);
const approximate = str(r.code_precision_coord) === "5" || /centro[iï]de/i.test(precision ?? "");
```

Trois attitudes possibles : les cacher (on masquerait un prélèvement réel), les afficher comme les
autres (on ferait croire qu'il y a un forage sur la place de la mairie), ou les afficher **en
disant ce qu'ils sont**. C'est la troisième : le point est dessiné translucide et la popup l'écrit.

**Étape 5 — les nappes.** Elles ne viennent pas d'une API interrogée à la volée, et la raison est
mesurée : le fichier national fait **237 Mo**, et une requête limitée à l'écran visible en fait
encore **19,5 Mo**. Le serveur filtre *quels* contours il envoie, jamais leur **finesse**. On
télécharge donc une fois, hors ligne, et on simplifie jusqu'à tenir un budget
(`scripts/refdata/fetch_nappes.py`) :

```python
for tol in TOLERANCES_M:            # 200, 400, 800, 1500, 3000 mètres
    trial["geometry"] = trial.geometry.simplify(tol, preserve_topology=True).buffer(0)
    payload = serialize(trial.to_crs(4326))
    if len(payload.encode("utf-8")) <= BYTE_BUDGET:
        chosen = (tol, payload, ...)
        break
```

Mesure réelle : 200 m donnait 3,78 Mo, **400 m donne 2,35 Mo** — retenu. La simplification se fait
en Lambert-93 (le système de coordonnées français en mètres) pour que « 400 » veuille dire 400 mètres
et non 400 degrés.

**Étape 6 — l'affichage, et le bug qui s'y cachait.** Pour ajouter des couches, il faut attendre que
la carte soit prête. Le réflexe est `map.on("load")`. C'est un piège :

```ts
// components/CarteEau.tsx
// ⚠️ PAS `map.on("load")`, et PAS `map.isStyleLoaded()` non plus. Les deux
// attendent que TOUTES les sources se stabilisent, fond raster compris — donc
// quand l'hôte des tuiles est injoignable, aucun des deux ne devient vrai et
// la carte n'installe rien du tout.
let installed = false;
const install = () => {
  if (installed) return;
  installed = true;
  ...
};
map.on("styledata", install);
```

Le symptôme, en bac à sable, était une carte parfaitement blanche. On peut l'attribuer à l'absence de
fond de carte — c'est ce que j'ai cru d'abord. La vérification a montré autre chose : le fichier de
nappes, **servi par notre propre serveur, sans réseau extérieur**, n'était même pas demandé. La carte
n'attendait pas des données : elle attendait un fond qui ne viendrait jamais.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Pourquoi ne pas réutiliser `/api/hydro` ?** Parce qu'elle répond à une autre question. Elle
  choisit **une** station pour un site, et pour cela interroge la chronique de chaque candidate. Une
  carte veut **toutes** les stations, positionnées, sans chronique. Et `StationOption`, son type de
  sortie, ne porte pas de coordonnées : on l'aurait forcé à devenir autre chose.
- **Pourquoi embarquer les nappes plutôt que les interroger en direct ?** Les deux options avaient
  été écrites dans le plan, et **les deux sont tombées** devant la mesure : 237 Mo en national, 19,5
  Mo par écran. Le problème n'était pas le nombre d'objets mais leur finesse — ce que seule une
  simplification hors ligne corrige.
- **Pourquoi écarter les nappes profondes ?** Parce qu'elles se superposent. Dessiner l'emprise d'une
  nappe située sous une autre, à plat sur une carte, dirait au lecteur que l'eau est là où elle n'est
  pas. Le référentiel publie lui-même la surface affleurante ; on s'en sert plutôt que d'inventer un
  critère.
- **Pourquoi garder les ouvrages mal positionnés ?** Voir §7.3, étape 4 : ne rien afficher serait
  cacher un prélèvement réel. Les afficher comme les autres serait mentir. On les affiche en le
  disant — c'est la règle générale du dépôt : une donnée absente ou douteuse est **signalée**, jamais
  silencieusement remplacée.
- **Pourquoi une page séparée plutôt qu'un onglet dans la fiche site ?** Parce que la question est
  différente. La fiche répond « quel est mon risque », la carte « qu'y a-t-il autour ». Mélanger les
  deux ferait croire que les points de la carte **sont** les sources du site, ce qui est faux : le
  rattachement hydrologique est un calcul, pas une proximité à l'œil. C'est écrit noir sur blanc dans
  l'encart en bas de page.

### 7.5 Pour expérimenter soi-même

**A. Casser un test, et voir ce qu'il protège.**

Ouvrez `lib/carteEau.ts` et supprimez le repli `x`/`y` des piézomètres :

```ts
const lon = (coords ? num(coords[0]) : undefined);   // on a retiré  ?? num(r.x)
const lat = (coords ? num(coords[1]) : undefined);   // on a retiré  ?? num(r.y)
```

Puis lancez :

```bash
npx tsx scripts/test/carte.test.ts
```

Vous verrez `FAIL piezo: falls back to x/y`. Ce test seul vous dit ce que la ligne supprimée
protégeait : **la totalité de la couche piézomètres en production**, puisque le vrai service renvoie
`geometry` vide sur 500 stations sur 500. Un test qui échoue est ici la version rapide d'un incident
de production.

Autre variante, plus insidieuse : remplacez le rejet des lignes sans coordonnées par une valeur par
défaut.

```ts
if (!code) return undefined;
const safeLon = lon ?? 0, safeLat = lat ?? 0;   // « ça évite les trous »
```

`FAIL hydro: drops rows without coordinates`. Le test refuse un comportement qui, à l'écran, se
serait traduit par des stations françaises au large de l'Afrique — visible seulement si quelqu'un
dézoome.

**B. Voir la page avec des données, sans accès aux serveurs publics.**

C'est la manipulation la plus utile du sprint, parce qu'elle débloque un problème signalé trois
sprints de suite. Démarrez l'app :

```bash
npm run build && npx next start -p 3300     # arrêt : fuser -k 3300/tcp
```

Puis, dans un script Playwright, **interceptez l'API** au lieu d'essayer de l'atteindre :

```js
await page.route("**/api/carte**", (r) => r.fulfill({ json: { /* charge utile réaliste */ } }));
```

Tout le reste — React, MapLibre, WebGL, les polygones de nappes — est réel ; seules les données sont
simulées. C'est ainsi que le cadrage qui ignorait le rayon et la collision de couleurs ONDE ont été
trouvés. **Aucun test unitaire ne pouvait les voir** : ils ne sont ni dans les données ni dans la
logique, ils sont dans l'image.

**C. Changer la finesse des nappes, et sentir le compromis.**

Dans `scripts/refdata/fetch_nappes.py`, mettez `BYTE_BUDGET = 500_000` puis relancez le script via le
workflow (`data/refdata-request.json` en mode `nappes`). L'échelle de tolérances descendra plus bas —
probablement 1500 m — et vous verrez, en rechargeant `/carte`, des contours de nappes visiblement
anguleux. Le budget d'octets et la fidélité du dessin sont le même réglage vu des deux côtés ; le
script rend ce compromis explicite au lieu de le laisser à un nombre magique.
