# Compte rendu — La carte répond « d'où vient mon eau ? » (Sprint 31)

**Date** : 2026-08-05 · **Branche** : `claude/france-map-water-data-2oe6h6` · **Sprint** : 31

---

## 1. La question initiale

> « 1. Légende et contenu cliquable se superposent sur mobile.
> 2. Ajoute une description de prélèvement, nappe, etc.
> 3. Serait-il pertinent de mieux scinder ces éléments entre les "éléments d'observation" type
> station de débit, piézomètres, les sources types nappes & cours d'eau etc.
> 4. D'autres sources d'eau pourraient etre pertinentes à ajouter (comme des glaciers si cela est
> pertinent etc etc) -> le but de la carte est pour l'utilisateur de comprendre quelles sont les
> sources d'eau autour de ses sites »

Accompagnée d'une **capture d'écran de téléphone**, qui montre le défaut d'un coup : deux encarts
blancs superposés, la légende par-dessus la popup.

**Ce que j'ai compris** : la dernière phrase donne la clé et recadre les trois autres points. La
carte montrait des objets ; elle doit répondre à **« d'où vient l'eau autour de mon site »**. Les
points 1 à 3 sont trois obstacles à cette lecture — un encart qui cache, un vocabulaire non expliqué,
un mélange entre ce qui *est* de l'eau et ce qui la *mesure*.

**Ambiguïtés arbitrées** :

- Le point 4 me demandait explicitement de **juger la pertinence** (« comme des glaciers si cela est
  pertinent »). J'ai donné mon avis couche par couche plutôt que d'exécuter : plans d'eau (haute,
  partout), captages AEP (la plus haute pour un site raccordé au réseau), glaciers (réelle mais
  **locale et indirecte** — leur rôle se lit déjà dans le débit des rivières affichées), barrages
  (moyenne, risque de bruit). **Retenus par l'utilisateur : plans d'eau et captages.**
- Le point 1 pouvait se traiter en CSS (légende repliable, déplacée). J'ai choisi de **supprimer** la
  légende : elle dupliquait la barre de bascules, qui porte déjà les mêmes pastilles, les mêmes
  libellés **et** les compteurs. Le vrai contenu propre à la légende — les notes de lecture — est
  parti dans le panneau du point 2. Un défaut réglé par soustraction plutôt que par mise en page.

**Ce que j'ai délibérément laissé de côté** : les glaciers et les barrages (écartés à l'arbitrage) ;
la traduction des nomenclatures Sandre `NatureEcoulement` / `TypeMasseDEauSouterraine` ; le lien
profond entrant `/carte?lat=&lon=`, toujours absent depuis le Sprint 29.

---

## 2. Ce qui a été réalisé

**En une phrase** : la carte ne cache plus rien derrière un encart, elle explique ce qu'elle montre,
et elle classe ses objets selon les trois questions qu'un lecteur se pose vraiment.

**Dans les grandes lignes** :

- **Le point 4 ne demandait pas la source qu'on croyait.** Les captages d'eau potable n'exigeaient
  aucune donnée nouvelle : la BNPE publie l'usage sur ses **chroniques**, joignables par
  `code_ouvrage` — un fait déjà écrit dans le code depuis le Sprint 30, jamais exploité.
- **Un registre unique remplace des booléens qui allaient proliférer.** Deux couches de plus par
  l'ancien chemin auraient fait quatre `showXxx` traversant trois composants.
- **Le défaut signalé se reproduisait ailleurs** : une fois la légende retirée, deux **popups**
  pouvaient encore se recouvrir. Une instance partagée règle la classe entière du problème.
- **Le sondage a corrigé le code avant livraison**, pour la cinquième fois : la taille de page que
  j'avais réutilisée aurait perdu l'usage de la plupart des ouvrages.
- **La vérification a été faite sur le terrain du bug** : viewport 390×844, popup ouverte, sur la
  vue même de la capture.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/carteEau.ts` | modifié | `LAYERS` devient le registre unique (`groupe`, `forme`, `description`) ; `parseUsageByOuvrage` ; `parseBnpeOuvrages` renvoie la scission AEP / autres |
| `components/CarteEau.tsx` | modifié | **légende supprimée** ; **popup unique partagée** ; couche plans d'eau ; visibilité pilotée par le registre |
| `components/CarteClient.tsx` | modifié | bascules **groupées par question** ; panneau « Comprendre la carte » ; mise en page resserrée pour mobile |
| `scripts/refdata/fetch_plans_eau.py` | neuf | **calcule la surface** (le référentiel n'en publie pas) et filtre dessus avant de dégrader le tracé |
| `app/api/plans-eau/route.ts` | neuf | filtre bbox, comme les cours d'eau |
| `data/refdata/plans-eau.geojson` | neuf | 7 563 plans d'eau ≥ 5 ha, 5,57 Mo |
| `scripts/diag/prod-diag.sh` | modifié | mode `carte3` (couverture d'usage, plans d'eau) ; le rejeu mesure la couverture |
| `scripts/test/carte.test.ts` | modifié | +11 vérifications sur la scission d'usage (54 au total) |
| `scripts/test/e2e.mjs` | modifié | +9 vérifications, dont **l'interdiction de tout encart flottant** |

---

## 3. Erreurs potentielles

### Bugs et erreurs trouvés et corrigés pendant la session

1. **La taille de page des chroniques aurait perdu la plupart des usages.** J'avais réutilisé
   `BNPE_MAX_ROWS` (5 000). Le sondage a mesuré **16 566 lignes de chroniques à Chartres pour 1 820
   ouvrages** : une ligne par an et par ouvrage. Sans le sondage, la couche captages aurait paru
   fonctionner tout en manquant la majorité des ouvrages — le pire mode d'échec, celui qui ne se
   voit pas.
2. **Le défaut signalé se reproduisait entre popups.** Après suppression de la légende, la capture de
   contrôle a montré **deux popups superposées** (celle d'un cours d'eau et celle du marqueur
   d'adresse). Corrigé par une instance partagée et par la suppression de la popup du marqueur.
3. **La carte passait sous la ligne de flottaison sur mobile.** Les trois groupes empilés
   verticalement repoussaient la carte hors du premier écran. Corrigé (grille 2 colonnes,
   introduction raccourcie) : la carte commence désormais à **y = 286** dans un écran de 844.
4. **Un test e2e reposait sur un pixel chanceux.** « Cliquer une nappe » visait le centre exact de la
   carte ; avec les rivières et les plans d'eau désormais prioritaires au clic, ce pixel pouvait
   tomber sur autre chose. Le test balaie maintenant quelques points — il teste une capacité, pas une
   coïncidence.

### Vérifié en conditions réelles

- **Couverture de l'usage BNPE** (sondage `carte3`) : **1 498/1 820 (82 %)** à Chartres,
  **607/607** à Lyon, **3 143/3 143** à Perpignan. Usages distincts observés : EAU POTABLE,
  INDUSTRIE, IRRIGATION, CANAUX, ENERGIE, EAU TURBINEE (barrage). Années 2008→2023.
- **Plans d'eau** : 34 513 entités, 205 Mo, `TopoOH` renseigné pour **19 540** d'entre elles,
  `NaturePE` exploitable. Médiane de surface **1,9 ha**, maximum 57 707 ha.
- **Échelle de décision du script**, mesurée et consignée au manifeste : tout garder coûtait 10,6 à
  14,2 Mo selon la tolérance ; **≥ 5 ha à 20 m tient en 5,57 Mo pour 7 563 entités**.
- **Routes mesurées en local sur les vrais fichiers** : `/api/plans-eau` renvoie 410 entités
  (1,49 Mo) sans bbox et **100 entités (52 Ko)** autour de Chartres.
- **Rendu mobile** : viewport 390×844, `isMobile`, sur Saint-Julien-en-Genevois — la vue de la
  capture. Popup ouverte : **aucun recouvrement**, **une seule popup** après six clics successifs,
  carte visible sans défilement.
- **`/api/carte` rejoué de bout en bout** (diag `carte`, run 37), **après** l'ajout de l'appel de
  chroniques et de la scission :

  | | Chartres 30 km | Lyon 10 km | Perpignan 60 km |
  |---|---|---|---|
  | captages d'eau potable | **115** | 2 | **215** |
  | autres prélèvements (marqueurs) | 300 (plafond) | 271 | 300 (plafond) |
  | usage connu / inconnu parmi eux | 380 / **35** | 273 / **0** | 515 / **0** |

  Exemple réel renvoyé : **« FORAGE EN NAPPE MAS BRUNO »**, usage EAU POTABLE, milieu souterrain,
  commune de Perpignan, à 2,1 km — c'est exactement la réponse à « d'où vient l'eau de mon site ».
  Aucune couche ne tombe en 400, et le message d'incomplétude reste celui du **plafond local**, pas
  d'une troncature amont.
- **La règle « inconnu ≠ autre » se voit en réel** : 35 ouvrages autour de Chartres affichent « usage
  non renseigné » et **aucun** n'est présenté comme non-AEP.

### Non vérifié en conditions réelles

- **Les popups n'ont pas été vues à l'écran avec ces valeurs réelles.** Le contenu est validé par la
  route (ci-dessous), le rendu par des données simulées : les deux vérifications ne se recouvrent
  toujours pas, comme au Sprint 30.
- **Le nouvel appel de chroniques n'a pas été chronométré** : `/api/carte` fait désormais un appel de
  plus, sur 16-18 k lignes. L'effet sur le temps de réponse est **inconnu**.
- **Le plafond de 20 000 lignes de chroniques n'a jamais été atteint** dans les mesures (maximum
  18 214, à 60 km autour de Perpignan). Une zone plus dense le franchirait ; le message existe et le
  code le gère, mais **ce chemin n'a jamais été exécuté**.
- **Aucun déploiement Vercel.** Les trois entrées `outputFileTracingIncludes` (nappes, cours d'eau,
  plans d'eau) ne sont vérifiées qu'en local, où elles ne servent à rien.
- **Le rendu a été vu sur un navigateur émulant un téléphone**, pas sur un vrai téléphone — ni le
  toucher réel, ni les polices système d'Android.

### Hypothèses qui pourraient ne pas tenir

- **Le seuil de 5 ha** vient du budget d'octets, pas d'un besoin métier. Une retenue de 3 ha peut
  être la ressource d'un site ; elle n'est pas affichée, et l'interface le dit.
- **`MAJOR_HA = 100`** (plans d'eau visibles sans bbox) est un choix esthétique, comme le
  `MAJOR = 5` des rivières.
- **La jointure retient l'usage de l'année la plus récente.** Un ouvrage ayant changé d'usage affiche
  le dernier déclaré, ce qui est défendable mais n'est pas dit dans la popup.
- **« EAU TURBINEE (barrage) » et « CANAUX »** tombent dans « Autres » de `normalizeUsage` : cela
  n'affecte pas le test AEP, mais ces libellés sont affichés bruts dans la popup.
- **Des dates d'exploitation manifestement conventionnelles sont affichées telles quelles** : le rejeu
  a renvoyé « Exploité depuis 1900-01-01 » sur un captage de Perpignan. C'est la valeur publiée, donc
  elle n'est pas censurée — mais elle se lit comme une date réelle, ce qu'elle n'est visiblement pas.
  À trancher : masquer les dates antérieures à un seuil, ou les marquer comme conventionnelles.

### Ce qui casserait si une source amont changeait

- **Un changement du libellé « EAU POTABLE »** ⇒ la couche captages se viderait **en silence**, les
  ouvrages restant affichés dans « Autres prélèvements ». Rien ne surveille cela.
- **Une nouvelle version BD Topage** ⇒ `sa:PlanEau_FXX_Topage2026` est figé dans le script.
- **Un renommage de `TopoOH` ou `NaturePE`** ⇒ le script **découvre** ses colonnes et le consigne au
  manifeste : dégradation visible, pas silencieuse.

---

## 4. Points d'amélioration

**Dette assumée**

- **Trois fichiers embarqués** (nappes 2,35 Mo, cours d'eau 5,84 Mo, plans d'eau 5,57 Mo). Les nappes
  restent envoyées **en entier** au navigateur alors que les deux autres sont filtrées : c'est
  l'incohérence la plus visible du lot.
- **Le panneau « Comprendre la carte » est long.** Sur mobile il demande du défilement. Il est sous la
  carte, donc il ne gêne plus rien — mais il n'est pas replié.
- **Un appel Hub'Eau de plus par requête**, non chronométré.

**À reprendre**

- **Filtrer les nappes par bbox** — le code de `/api/cours-eau` se transpose, et diviserait par ~40
  ce que la page télécharge.
- **Surveiller le libellé AEP** : un test de bout en bout qui échoue si la couche captages devient
  vide sur les trois sites de référence.
- **Dire dans la popup de quelle année vient l'usage.**

---

## 5. État Git

- **Branche de session** : `claude/france-map-water-data-2oe6h6`
- **`main` touché ?** : **NON.** Aucun merge, aucun rebase sur `main`.
- **Déployé en prod ?** : **non.**
- **Vérifications passées** : `npm run build` ✅ · `npm run lint` ✅ · **18 suites unitaires au vert**
  (`carte.test.ts` : 54 vérifications) · **56/56 e2e** (9 neufs) · **rendu mobile 390×844 vérifié
  avec popup ouverte** · routes plans d'eau mesurées sur le vrai fichier ·
  **`/api/carte` rejoué contre les vrais services** sur trois points (§3).
- ⚠️ **Un message de commit a dû être corrigé** : des accents graves dans le texte ont été
  interprétés par le shell et ont mangé un mot. Corrigé par `--amend` puis `push --force` sur la
  branche de session (aucun commit d'autrui réécrit).
- **Sortie de diagnostic** : `data/diag/` purgé **après lecture**.

---

## 6. Prochaines étapes

1. **Chronométrer `/api/carte`** avec l'appel de chroniques en plus. *Verrou* : aucun ; c'est une
   mesure, pas un développement.
2. **Filtrer les nappes par bbox.** *Verrou* : aucun, le code existe pour deux autres couches.
3. **Trancher les dates conventionnelles** (« Exploité depuis 1900-01-01 »). *Verrou* : aucun, c'est
   une décision d'affichage.
4. **Traduire les nomenclatures Sandre** pour enrichir la popup des nappes. *Verrou* : trouver la
   table — à sonder.
5. **Lien profond entrant `/carte?lat=&lon=`.** *Verrou* : aucun.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Une carte affichait des ronds de couleur et des formes bleues, avec un petit encadré de légende posé
par-dessus. Sur un téléphone, cet encadré occupait un tiers de l'écran et se plaçait exactement là où
s'ouvraient les bulles d'information : on ne pouvait plus lire ce qu'on venait de cliquer. Par
ailleurs, rien n'expliquait ce qu'était un « piézomètre » ou un « ouvrage de prélèvement », et tous
ces objets étaient mélangés alors qu'ils répondent à des questions différentes : une rivière **est**
de l'eau, une station **mesure** l'eau, un forage **prend** l'eau. Enfin il manquait deux choses
qu'un lecteur cherche naturellement : les lacs, et l'endroit d'où vient l'eau du robinet.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Captage d'eau potable** | Un ouvrage dont l'eau part vers le réseau public d'eau potable. |
| **BNPE** | Base nationale des prélèvements en eau : qui prend de l'eau, où, pour quel usage. |
| **Chronique** | Une ligne par année et par ouvrage, disant le volume prélevé et l'usage. |
| **Référentiel** | Le catalogue des objets (un ouvrage, une station), sans les mesures. |
| **Jointure** | Rapprocher deux tables par une colonne commune — ici le code de l'ouvrage. |
| **Plan d'eau** | Lac, étang ou retenue. |
| **Popup** | La bulle qui s'ouvre au clic sur un objet. |
| **Viewport** | La zone visible de l'écran, sans défiler. |
| **bbox** | Un rectangle géographique servant à ne demander que ce qui est dans la vue. |
| **Registre (dans le code)** | Une liste unique décrivant tous les objets d'un même genre, plutôt qu'un réglage séparé pour chacun. |

### 7.3 Comment le code s'y prend

**Étape 1 — supprimer plutôt que déplacer.** Le premier réflexe devant « deux encadrés se
superposent » est de bouger l'un des deux. Le bon réflexe était de regarder ce que chacun contenait :

```
Barre de bascules (au-dessus de la carte)  : pastille de couleur + libellé + compteur
Légende (posée sur la carte)               : pastille de couleur + libellé
```

La légende était donc une copie appauvrie de quelque chose déjà affiché, qui masquait la carte. Elle
est supprimée ; ce qu'elle avait d'unique — comment lire les symboles — est descendu dans un panneau
sous la carte, où il ne cache rien.

**Étape 2 — le même défaut, une classe plus haut.** Après suppression, la capture de contrôle a
montré **deux popups** superposées. MapLibre en autorise autant qu'on en crée. Le correctif ne
consiste pas à fermer l'une, mais à n'en avoir **qu'une** :

```ts
// components/CarteEau.tsx
// ⚠️ UNE popup pour toute la carte. MapLibre en ouvre volontiers plusieurs, et
// sur un téléphone deux popups qui se recouvrent reproduisent exactement le
// défaut que ce sprint devait corriger.
const popup = new maplibregl.Popup({ offset: 12, maxWidth: "300px", closeButton: true });
const showPopup = (lngLat, html) => { popup.setLngLat(lngLat).setHTML(html).addTo(map); };
```

Chaque gestionnaire de clic appelle `showPopup`. « Un objet décrit à la fois » devient une propriété
du code, pas une intention.

**Étape 3 — un registre au lieu d'interrupteurs qui se multiplient.** Avant, les points vivaient dans
une liste, mais les nappes et les rivières étaient deux variables séparées transportées à la main
d'un composant à l'autre. Ajouter les lacs et les captages aurait porté ça à quatre. Désormais :

```ts
export const LAYERS: LayerSpecUi[] = [
  { id: "nappes",  groupe: "ressource",   label: "Nappes souterraines", forme: "surface",
    description: "L'eau contenue dans les roches sous vos pieds, …" },
  { id: "hydro",   groupe: "observation", label: "Stations de débit",   forme: "point",
    description: "Points de rivière équipés pour mesurer le débit, …" },
  …
];
```

Le `groupe` est ce que l'utilisateur demandait au point 3 : l'interface parcourt la liste, en tire
trois colonnes titrées, et la même liste sert à écrire les descriptions. Une couche s'ajoute
désormais **en un seul endroit**.

**Étape 4 — les captages, ou la source qui n'en était pas une.** Le point 4 semblait demander une
nouvelle donnée. Or un commentaire écrit au sprint précédent disait déjà :

> *There is no usage column here (verified against the full key list): usage lives on the chronicles.*

Autrement dit, l'information existait, à un endroit qu'on avait constaté sans l'exploiter. Il suffit
de rapprocher les deux tables par le code de l'ouvrage :

```ts
// lib/carteEau.ts
export function parseUsageByOuvrage(rows: unknown[]): Map<string, string> {
  const byCode = new Map<string, { annee: number; usage: string }>();
  for (const raw of rows) {
    …
    // L'année la plus récente gagne : un forage peut changer d'usage.
    if (!seen || annee > seen.annee) byCode.set(code, { annee, usage });
  }
  …
}
```

Et la règle qui compte, celle qui distingue une carte honnête d'une carte séduisante :

```ts
// ⚠️ « usage non renseigné » et JAMAIS « autre usage » : la jointure n'atteint
// qu'une partie du référentiel, et un ouvrage non atteint a un usage inconnu,
// pas un usage différent.
{ label: "Usage", valeur: usage ?? "non renseigné" },
```

Sans cette règle, la carte affirmerait que 322 ouvrages autour de Chartres ne sont pas des captages,
alors qu'elle ne sait pas ce qu'ils sont.

**Étape 5 — les lacs, et une donnée qu'il a fallu fabriquer.** Le référentiel des plans d'eau
contient 34 513 objets pour 205 Mo — bien trop. Il faut donc en écarter, et l'idée naturelle est
« gardons les grands ». Sauf que **le référentiel ne publie aucune surface**. Le script la calcule :

```python
# scripts/refdata/fetch_plans_eau.py
projected = gdf.to_crs(2154)          # Lambert-93 : les mètres sont des mètres
area_ha = projected.geometry.area / 10_000.0
```

puis descend une échelle de compromis jusqu'à tenir un budget, en **dégradant le dessin avant de
supprimer des objets** — parce qu'un lac un peu anguleux reste un lac, alors qu'un lac absent est
une information perdue. Mesuré : tout garder coûtait 10,6 Mo ; à partir de 5 ha, 5,57 Mo. Le seuil
retenu est **écrit dans l'interface**, pour que « il manque les petits étangs » soit une chose que le
lecteur peut apprendre.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Pourquoi supprimer la légende plutôt que la replier ?** Parce qu'elle n'apportait rien que la
  barre de bascules n'affichait déjà. Replier un doublon, c'est garder le doublon.
- **Pourquoi une popup partagée plutôt que fermer l'ancienne à chaque clic ?** Les deux marchent,
  mais l'une repose sur le fait de ne jamais oublier un `close()`. L'autre rend la règle impossible
  à violer.
- **Pourquoi les captages restent dans « Qui prélève » et non dans « Où est l'eau » ?** Un captage
  n'est pas une source : c'est un tuyau planté dans une nappe ou une rivière. Le ranger parmi les
  ressources aurait fait croire que l'eau vient du captage, alors qu'il faut regarder la nappe qui
  est dessous.
- **Pourquoi calculer la surface au lieu de garder les plans d'eau nommés ?** Un nom dépend du travail
  de saisie, pas de l'importance : 4 plans d'eau sur 10 n'en ont pas, et parmi eux des retenues
  utiles. La surface est une propriété de l'objet, pas de sa fiche.
- **Pourquoi les glaciers n'ont-ils pas été proposés en priorité ?** Parce que leur pertinence est
  réelle mais **indirecte** : leur fonte soutient le débit des rivières en été, et ce débit est déjà
  sur la carte. Ils auraient été jolis et faiblement utiles ; je l'ai dit plutôt que de les ajouter.

### 7.5 Pour expérimenter soi-même

**A. Casser la règle la plus importante du sprint.**

Dans `lib/carteEau.ts`, remplacez la valeur d'usage inconnu par une déduction :

```ts
{ label: "Usage", valeur: usage ?? "autre usage" },   // au lieu de "non renseigné"
```

Puis :

```bash
npx tsx scripts/test/carte.test.ts
```

`FAIL aep: an unknown use reads « non renseigné », never « autre usage »`. Ce test protège la
différence entre « je sais que ce n'est pas de l'eau potable » et « je ne sais pas ». Sur les données
réelles de Chartres, cela concerne 322 ouvrages sur 1 820 : la version fausse aurait affirmé quelque
chose de faux sur 18 % de la couche, sans que rien ne le signale.

**B. Faire revenir le bug d'origine, et le voir.**

Dans `components/CarteEau.tsx`, redonnez sa popup au marqueur d'adresse :

```ts
markerRef.current = new maplibregl.Marker({ color: "#0f172a" })
  .setLngLat([centre.lon, centre.lat])
  .setPopup(new maplibregl.Popup({ offset: 24 }).setText(centre.label))
  .addTo(map);
```

Reconstruisez, puis lancez l'e2e : le test `only one popup at a time` échoue dès qu'un clic ouvre
une bulle alors que celle du marqueur est ouverte. C'est exactement la superposition de la capture,
reproduite à la demande.

**C. Déplacer le seuil des plans d'eau et sentir le compromis.**

Dans `scripts/refdata/fetch_plans_eau.py`, mettez `BYTE_BUDGET = 12_000_000`, relancez le script via
le workflow (`data/refdata-request.json` en mode `plans-eau`), et comparez le manifeste : le seuil
retenu descendra probablement à 0 ou 0,5 ha, le fichier doublera, et la carte se couvrira de mares.
Le même réglage vu des deux côtés : ce que le disque porte, et ce que l'œil peut lire.
