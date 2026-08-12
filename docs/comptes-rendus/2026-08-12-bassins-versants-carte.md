# Compte rendu — Les bassins versants sur la carte (Sprint 52)

**Date** : 2026-08-12 · **Branche** : `claude/bassins-versants-carte-6crhsl` · **Sprint** : 52

---

## 1. La question initiale

> « Ajoutons les bassins versants à la page "carte" »

**Ce que j'ai compris** : la page `/carte` montre l'eau — nappes, cours d'eau, plans d'eau — mais
jamais **le territoire qui la produit**. Il manquait la réponse à « d'où vient l'eau qui arrive
ici ». La demande étant ambiguë sur l'échelle (« bassin versant » désigne aussi bien le bassin
élémentaire d'un ruisseau que la circonscription Seine-Normandie), j'ai posé la question : réponse
utilisateur = **les deux couches**, en **contours + noms** plutôt qu'en aplats.

**Ce que j'ai délibérément laissé de côté** :

- **Le branchement sur `lib/ressource.ts`.** Le HANDBOOK §5 item 10 attend ce référentiel pour
  remplacer l'emprise communale par le bassin versant réel dans le calcul de ressource renouvelable.
  La géométrie existe désormais, mais la demande portait sur la carte : le moteur n'est pas touché.
- **La fiche site.** Aucun « votre site est dans le bassin versant X » ailleurs que sur la carte.
- **Le rattachement zone d'alerte ↔ bassin versant.** Ce sont deux découpages différents et le
  second n'explique pas le premier ; la carte le dit, elle ne le calcule pas.

---

## 2. Ce qui a été réalisé

**En une phrase** : la carte montre désormais le territoire qui produit l'eau — 6 190 bassins
versants BD Topage — et le bassin qui décide, avec son agence de l'eau et le lien vers ses aides.

**Dans les grandes lignes** :

- **Une sonde avant tout téléchargement.** Le même WFS Sandre a déjà rendu 237 Mo (nappes) et 205 Mo
  (plans d'eau) ; le workflow a 30 minutes. Le script mesure chaque candidat par `RESULTTYPE=hits`
  puis un échantillon de 20 entités, et ne télécharge que celui qui tient sous le plafond estimé.
- **Deux couches, une seule grammaire visuelle.** Contours + toponymes, aucun aplat permanent : la
  carte portait déjà deux aplats bleus, un troisième l'aurait rendue illisible. Le bassin **cliqué**
  reçoit une teinte, le temps de sa popup.
- **Le clic répond « qu'est-ce qui couvre ce point ? »** L'ancien handler ne savait nommer qu'une
  nappe. Il énumère maintenant, de la plus petite emprise à la plus grande : nappe(s), bassin
  versant, circonscription — cette dernière avec son agence de l'eau, via `lib/bassins.ts` déjà
  écrit et testé.
- **Les contours sont une cible impossible au doigt**, donc un remplissage totalement transparent
  (`fill-opacity: 0`, toujours interrogeable) capte le clic sur toute la surface du bassin.
- **Les helpers bbox, dupliqués mot pour mot** entre `/api/cours-eau` et `/api/plans-eau`, sont
  sortis dans `lib/geoBbox.ts` avant qu'une troisième copie n'existe.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `scripts/refdata/fetch_bassins_versants.py` | neuf | Sonde 3 candidats fins + `sa:BassinDCE`, télécharge le retenu, échelle surface × tolérance, écrit 2 GeoJSON + 1 manifeste |
| `.github/workflows/fetch-refdata.yml` | modifié | Branche de session ajoutée à `on.push.branches` (sans quoi **rien ne se déclenche, en silence**) + mode `bassins-versants` |
| `data/refdata/bassins-versants.geojson` | neuf (runner) | 6 190 bassins, 4,35 Mo, tolérance 200 m, **aucun bassin écarté** |
| `data/refdata/grands-bassins.geojson` | neuf (runner) | 14 circonscriptions + 14 points d'étiquette |
| `data/refdata/bassins-versants-manifest.json` | neuf (runner) | Provenance, mesure des candidats sondés, colonnes trouvées, échelle parcourue |
| `app/api/bassins-versants/route.ts` | neuf | Fichier entier en mémoire, réponse filtrée par bbox ; sans bbox, les 244 bassins ≥ 250 km² |
| `app/api/grands-bassins/route.ts` | neuf | Fichier entier, 14 polygones |
| `lib/geoBbox.ts` | neuf | `parseBbox` / `bounds` / `overlaps`, extraits des deux routes qui les dupliquaient |
| `lib/carteEau.ts` | modifié | Deux entrées au registre, `MilieuKind` étendu, champ `trait` (plein/tirets), `LAYER_BY_ID` |
| `lib/bassins.ts` | modifié | `nomCourt` par circonscription — « Loire-Bretagne » là où le référentiel écrit une phrase |
| `components/CarteEau.tsx` | modifié | Sources, contours, étiquettes, surbrillance, popup de couverture, bascules, rafraîchissement bbox |
| `components/CarteClient.tsx` | modifié | Pastille en tirets, trois réserves neuves sous la carte |
| `scripts/test/carte.test.ts` | modifié | 8 cas sur les helpers bbox extraits |
| `scripts/test/e2e.mjs` | modifié | 8 vérifications neuves + **correction du piège de coordonnées** (§3) |

---

## 3. Erreurs potentielles

### Bugs trouvés et corrigés pendant la session

- **Huit vérifications e2e cassées par deux cases à cocher.** Après l'ajout des couches, les huit
  contrôles de clic sur la carte échouaient. Ils ne parlaient pas des bassins mais des nappes, ce
  qui a d'abord fait croire à une régression du handler de clic. La cause réelle :
  `boundingBox()` rend des coordonnées **de page**, `mouse.click()` en attend **de viewport** ; la
  barre de bascules ayant grandi de deux lignes, le centre du canvas est passé à **y = 791 dans un
  viewport de 720 px**, et chaque clic tombait hors écran. Vérifié en rejouant la suite d'origine
  sur l'arbre sans mes modifications : 134/134. Correctif : `scrollIntoViewIfNeeded()` avant de
  viser, aux deux endroits qui cliquent sur la carte.
- **« Loire-Bretagne » écrit quatre fois.** MapLibre ancre un symbole sur **chaque partie** d'un
  multipolygone. Vu sur la capture France, corrigé en faisant produire au script un point
  d'étiquette par circonscription (partie la plus grande), la carte filtrant la source par type de
  géométrie.
- **Les noms de circonscription illisibles.** Dessinés tels que publiés (« La Loire, les cours d'eau
  côtiers vendéens et bretons »), ils se replient sur cinq lignes et recouvrent le bassin qu'ils
  nomment. D'où `nomCourt`. Le nom complet reste dans la popup.
- **La popup atteignait le bas de la carte sur mobile** (390×844, trois sections empilées) — le
  défaut exact des sprints 31 et 32. La phrase explicative de la circonscription a été retirée de la
  popup ; elle est sous la carte, où elle ne cache rien.
- **`dbg.mjs`, script de capture jetable, committé par erreur** via un `git add -A`, retiré au
  commit suivant.

### Non vérifié en conditions réelles

- **La carte n'a jamais été vue avec un vrai fond de tuiles.** L'egress est bloqué : les captures de
  cette session montrent les couches sur fond blanc. Elles valident **la mise en page et le tracé,
  jamais la lisibilité sur un fond réel** — l'ocre des lignes de partage se comporte peut-être tout
  autrement sur des tuiles CARTO grises.
- **La prod n'a pas été regardée** (403 CONNECT sur l'URL Vercel, mesuré, politique). En
  particulier, `outputFileTracingIncludes` a bien été complété pour les deux fichiers, mais **rien
  en local ne prouve** que le tracing les embarque : cette classe d'erreur ne se manifeste qu'en
  production.
- **Le seuil de vue France (250 km²) n'a été jugé que sur une capture sans fond de carte.** 244
  bassins sur fond blanc paraissent lisibles ; sur un fond de tuiles, c'est à revoir.
- **Aucun clic n'a été testé sur un bassin versant PETIT** (< 250 km²) : il faut une recherche
  d'adresse pour les charger, et le mock du géocodeur n'a pas abouti dans le temps de la session.
  Le chemin est couvert côté route (18 bassins autour de Chartres, vérifié par l'e2e), **pas côté
  interface**.

### Hypothèses qui pourraient ne pas tenir

- **Le repli « code du bassin absent = outre-mer »** dans la popup. C'est vrai des 14 codes du
  référentiel actuel (A…H métropole, I…M outre-mer), et ce serait faux si Sandre ajoutait un code
  métropolitain. La phrase affirmerait alors un office de l'eau départemental à tort.
- **`MAJOR_KM2 = 250` est un choix de lisibilité**, pas un seuil hydrologique. Un bassin de 249 km²
  n'est pas moins réel que celui de 251 ; il attend juste une recherche d'adresse.
- **La surface est calculée ici** (Lambert-93), le référentiel n'en publie pas. Une erreur de
  projection se lirait comme une erreur de bassin.

### Ce qui casserait si une source amont changeait

- **Un renommage de `sa:BassinVersantTopographique_FXX_Topage2026`** ferait basculer le script sur le
  millésime 2025 puis sur `BVSpeMasseDEauSurface` — les trois sont sondés dans le même run, et le
  manifeste consigne lequel a servi. Le script sort en erreur plutôt que de commiter un fichier
  partiel.
- **Un changement de colonne** (`TopoOH`, `CdOH`) : les noms sont **découverts**, pas supposés, mais
  un référentiel qui cesserait de publier un toponyme donnerait des bassins sans nom — visible
  immédiatement, `features_named` est au manifeste (6 190 / 6 190 aujourd'hui).

---

## 4. Points d'amélioration

**Dette assumée**

- **Le nom d'un bassin versant est celui du tronçon qu'il draine** (médiane 53 caractères, max 120).
  L'étiquette de carte est tronquée à 24 caractères + « … », la popup donne le nom entier. Un vrai
  nom court demanderait une heuristique de découpe sur « du confluent de… » : inventer un toponyme
  n'est pas le rôle de cette couche.
- **Pas de point d'étiquette pour les bassins fins.** Ils sont mono-polygone dans l'immense majorité
  des cas, donc le défaut du multipolygone ne les touche pas — mais ce n'est pas garanti par
  construction.
- **Deux bascules de plus poussent la carte vers le bas de la page.** Sur un portable en 720 px de
  haut, il faut désormais défiler un peu plus pour voir la carte entière.

**À reprendre**

- **La popup de couverture peut atteindre trois sections + le bloc d'état.** Sur mobile elle tient
  dans ses 240 px avec ascenseur interne, mais elle est dense. Un repliement (« ▸ Bassin versant »)
  serait plus lisible.
- **`bassins-versants.geojson` pèse 4,35 Mo sur disque.** C'est le choix cours-d'eau (filtrage à la
  requête) et non le choix nappes (simplification), assumé — mais le dépôt grossit.

---

## 5. État Git

- **Branche de session** : `claude/bassins-versants-carte-6crhsl`
- **`main` touché ?** : **NON** — la branche attend une revue. Aucun merge n'a été demandé.
- **Déployé en prod ?** : non vérifiable d'ici (403 CONNECT sur l'URL Vercel, mesuré, politique du
  proxy — voir `AGENTS.md`). La branche est poussée ; le déploiement de preview, s'il existe, n'a pas
  pu être consulté.
- **Vérifications passées** : `npm run build` ✅, `npm run lint` ✅, `npm run typecheck` ✅
  (0 erreur), **32 suites unitaires** au vert, **e2e 142/142** — dont 8 vérifications neuves.
- **Deux runs Actions** : 31633769365 (sonde + construction) et 31636322898 (points d'étiquette),
  tous deux verts, chacun ~2 min 30.

---

## 6. Prochaines étapes

1. **Regarder la carte avec un vrai fond de tuiles.** *Verrou* : egress. C'est une capture à
   demander à l'utilisateur — et le seul moyen de juger si l'ocre des lignes de partage tient sur
   un fond CARTO. À ajouter à `docs/CHECK-PROD-10-CAPTURES.md`.
2. **Bassin versant réel dans `lib/ressource.ts`** (HANDBOOK §5 item 10) : la géométrie est
   désormais dans le dépôt, ce qui **lève le verrou de données**. Reste un verrou de méthode :
   `ressource.ts` transpose sur l'emprise communale ; passer au bassin versant demande de choisir
   quel bassin quand une commune en chevauche plusieurs.
3. **Cliquer un petit bassin depuis l'interface**, pas seulement depuis la route. *Verrou* : faire
   aboutir le mock du géocodeur dans le scénario e2e.
4. **Rattacher un bassin versant à sa masse d'eau rivière.** `CdExutoire_1` et `CdBH` sont dans les
   colonnes sondées mais ne sont pas conservés dans le fichier. *Verrou* : aucun — un run de plus.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Une carte de l'eau qui montre les rivières et les nappes ne dit pas d'où vient l'eau. Quand il
pleut sur une colline, l'eau descend d'un côté ou de l'autre selon le versant : tout ce qui tombe
d'un même côté finit dans le même ruisseau. Le morceau de territoire qui alimente un cours d'eau
donné s'appelle son bassin versant. Pour une entreprise, c'est ce qui décide si une sécheresse « en
amont » la concerne ou pas. On voulait donc dessiner ces territoires — et, à plus grande échelle,
les quelques grandes régions administratives de l'eau, parce que ce sont elles qui fixent les règles
et distribuent les aides.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| Bassin versant | Le territoire dont toutes les eaux de pluie convergent vers un même point de sortie. |
| Ligne de partage des eaux | La crête qui sépare deux bassins voisins : de part et d'autre, l'eau part vers deux rivières différentes. |
| BD Topage | Le référentiel national des objets hydrographiques (Sandre) : cours d'eau, plans d'eau, bassins versants. |
| Circonscription de bassin (DCE) | Un des grands découpages administratifs de l'eau (Seine-Normandie, Loire-Bretagne…), chacun géré par une agence de l'eau. |
| Agence de l'eau | L'établissement qui perçoit les redevances de prélèvement et finance les aides, à l'échelle d'une circonscription. |
| WFS | Un service web standard qui sert des données géographiques ; on lui demande une couche, il rend du GeoJSON. |
| GeoJSON | Un format JSON décrivant des formes géographiques (points, lignes, polygones) et leurs propriétés. |
| Bbox | Une boîte rectangulaire `lonMin,latMin,lonMax,latMax` : ici, ce que l'utilisateur a à l'écran. |
| Tolérance de simplification | De combien de mètres on a le droit de « lisser » un contour pour alléger le fichier. |
| MapLibre | La bibliothèque JavaScript qui dessine la carte dans le navigateur. |

### 7.3 Comment le code s'y prend

**Étape 1 — mesurer avant de télécharger.** Le bac à sable de développement n'a pas accès aux
serveurs français : la récupération se fait sur un runner GitHub Actions, déclenché en poussant un
fichier de requête. Or ce service a déjà rendu 237 Mo pour une autre couche, et le job a 30 minutes.
On demande donc d'abord le **nombre** d'entités, puis **vingt** d'entre elles :

```python
# scripts/refdata/fetch_bassins_versants.py
r = requests.get(wfs_url(layer, RESULTTYPE="hits"), headers=UA, timeout=180)
found = re.search(r'numberMatched="(\d+|unknown)"', r.text)
result["hits"] = int(found.group(1)) if found and found.group(1).isdigit() else None
...
result["bytes_per_feature"] = int(len(content) / len(g))
result["estimated_full_bytes"] = result["hits"] * result["bytes_per_feature"]
```

Mesuré : **6 190 bassins, 17 987 octets par entité, soit ~111 Mo** — sous le plafond, donc téléchargé.

**Étape 2 — faire tenir le fichier dans un budget.** On projette en Lambert-93 (des mètres, pas des
degrés), puis on parcourt une échelle : d'abord on grossit le trait, et seulement si ça ne suffit
pas on écarte les petits bassins. Ici la première case a suffi (200 m → 4,35 Mo), donc **aucun
bassin n'est perdu**.

**Étape 3 — n'envoyer au navigateur que ce qui est à l'écran.** Le fichier reste sur le disque du
serveur ; la route filtre :

```ts
// app/api/bassins-versants/route.ts
const box = parseBbox(request.nextUrl.searchParams.get("bbox"));
const features = box
  ? data.features.filter((f) => overlaps(f, box))
  : data.features.filter((f) => (f.properties?.surfaceKm2 ?? 0) >= MAJOR_KM2);
```

Sans boîte (vue France entière), on ne garde que les 244 bassins de plus de 250 km² : **0,33 Mo**.
Avec une boîte autour de Chartres, on obtient les **18** bassins locaux, dont 14 seraient invisibles
au niveau national.

**Étape 4 — dessiner, et rendre le contour cliquable.** Un trait fait deux pixels de large : viser
ça au doigt est illusoire. On ajoute donc un remplissage **totalement transparent** qui couvre tout
le bassin — invisible, mais toujours interrogeable, contrairement à une couche masquée :

```ts
// components/CarteEau.tsx
map.addLayer({ id: `${prefix}-fill`, type: "fill", source, filter: surfaces,
               paint: { "fill-color": spec.color, "fill-opacity": 0 } });
```

**Étape 5 — répondre à « qu'est-ce qui couvre ce point ? »** Le clic interroge les couches de la
plus petite emprise à la plus grande et compose une seule popup :

```ts
const covering = (id: string) =>
  map.getLayer(id) ? map.queryRenderedFeatures(e.point, { layers: [id] }) : [];
const nappes = covering("nappes-fill");
const bassinsVersants = covering("bassins-versants-fill");
const grandsBassins = covering("grands-bassins-fill");
```

Une couche décochée n'est plus dessinée, donc plus interrogée : la case à cocher fait disparaître
l'objet **et** sa mention dans la popup. Le code du grand bassin (`H`) est ensuite donné à
`bassinInfo()` — une table déjà écrite pour le panneau de transition — qui rend « Agence de l'eau
Seine-Normandie » et le lien vers ses aides.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Contours plutôt qu'aplats colorés.** Un aplat par bassin, c'est joli sur une capture ; sur cette
  carte-là, deux aplats bleus existent déjà (nappes, plans d'eau) et le troisième les noyait. Le
  bassin cliqué reçoit une teinte : on colore ce qu'on a demandé, pas tout en permanence.
- **Filtrer à la requête plutôt que simplifier davantage.** Les deux stratégies existent dans ce
  dépôt. Simplifier plus fort aurait gardé un fichier léger mais des contours faux ; on préfère un
  fichier gros sur le disque du serveur et une réponse minuscule sur le réseau.
- **Le clic sur la carte plutôt que sur la couche.** MapLibre sait déclencher un handler « quand on
  clique cette couche ». C'est ce que faisait le code pour les nappes. Mais avec trois couches
  superposées, trois handlers auraient ouvert trois popups au même endroit. Un seul handler qui
  interroge et compose garantit **une popup à la fois** — la règle que ce fichier défend depuis le
  sprint 31.
- **`nomCourt` dans le code plutôt que dans les données.** On aurait pu faire calculer le nom court
  au script Python. Mais c'est une décision d'affichage, pas une donnée du référentiel : elle est
  au même endroit que l'agence de l'eau, dans `lib/bassins.ts`, où un humain la relit.
- **Ne pas toucher `fetch_bassins.py`.** Le script existant télécharge déjà la même couche
  `sa:BassinDCE` : y ajouter deux lignes aurait évité un fichier. Mais il porte aussi une jointure
  sur 35 186 communes, livrée et protégée par un garde-fou qui n'a jamais tourné. Le refaire tourner
  pour récupérer un contour, c'était risquer un référentiel en production pour une commodité.

### 7.5 Pour expérimenter soi-même

**1. Voir ce que le filtrage par bbox économise.**

```bash
npm run build && (setsid nohup npx next start -p 3200 &) ; sleep 5
curl -s 'localhost:3200/api/bassins-versants' | wc -c                        # ~330 000
curl -s 'localhost:3200/api/bassins-versants?bbox=1.2,48.3,1.8,48.6' | wc -c # ~90 000
```

Puis mettez `MAJOR_KM2 = 0` dans `app/api/bassins-versants/route.ts`, rebâtissez, et refaites la
première commande : **4,3 Mo**, envoyés à chaque ouverture de la page. C'est ce que la constante
évite.

**2. Casser un test, exprès.** Dans `lib/geoBbox.ts`, remplacez le retour de `parseBbox` par la
version « naïve », sans remise en ordre des coins :

```ts
return [lonMin, latMin, lonMax, latMax];
```

Puis :

```bash
npx tsx scripts/test/carte.test.ts
```

Vous verrez `FAIL bbox: corners given in any order are put back in order`. Ce que ce test protège :
une carte qui envoie sa boîte du haut vers le bas ne recevrait **aucun bassin** — et une carte vide
ne se distingue pas d'un territoire sans bassin. C'est précisément la confusion que tout ce dépôt
s'interdit.

**3. Voir la couche mentir, puis se taire.** Renommez le fichier de données :

```bash
mv data/refdata/bassins-versants.geojson /tmp/ && npm run build && npx next start -p 3200
```

Ouvrez `/carte` : aucun contour, et en bas à droite « Contours indisponibles : bassins versants. »
Sans ce message — c'est le comportement qu'avait la page avant qu'on l'étende à toutes les couches
de référence — la carte afficherait exactement la même chose qu'un pays sans bassins versants.
Remettez le fichier en place pour la suite.
