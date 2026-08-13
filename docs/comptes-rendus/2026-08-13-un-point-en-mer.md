# Compte rendu — Un point en mer rendait des chiffres (Sprint 54)

**Date** : 2026-08-13 · **Branche** : `claude/bassins-versants-carte-6crhsl` · **Sprint** : 54

---

## 1. La question initiale

> « Réalise un artefact pour lister 10 actions simples à réaliser par un utilisateur novice te
> permettant de vérifier certains sujets. » — puis, en retour, le compte rendu des dix gestes,
> réalisés sur la prévisualisation.

**Ce que j'ai compris** : deux demandes en une. D'abord produire la liste ; ensuite, quand le retour
est arrivé, **agir dessus**. C'est la première fois en quatorze sessions que quelqu'un regarde le
produit déployé, et le retour contient trois anomalies.

**Ce que j'ai délibérément laissé de côté** : le geste nº 8 (rapprochement des usages), dont la
capture dédiée n'est pas encore arrivée. Le code montre que l'encadré exige **deux** conditions
simultanées ; corriger avant de savoir laquelle a manqué serait deviner. Les gestes nº 6
(téléphone) et nº 10 (rapport ESG) n'ont pas été réalisés et restent ouverts.

---

## 2. Ce qui a été réalisé

**En une phrase** : un point en pleine mer affichait une fiche complète, alimentée par les stations
du littoral à trente kilomètres — il affiche désormais une phrase.

**Dans les grandes lignes** :

- **Le défaut le plus grave que ce produit puisse avoir.** `/?lat=43.0&lon=5.5` — au large de
  Toulon — rendait un score, des jours, des mètres cubes. La boîte englobante de la France
  métropolitaine contient toute la Méditerranée occidentale, `couverture()` répondait « couvert », et
  **seule `/api/zones` consultait cette fonction**.
- **Atteignable en deux clics**, pas en fabriquant une URL : la bulle de la carte propose
  « Analyser ce point → », qui construit exactement ce lien.
- **Le signal qui tranche était déjà dans le dépôt** : en mer, il n'y a pas de commune. Mais
  `reverseCommune` **repliait le tableau vide et la panne réseau sur le même `null`** — l'anti-pattern
  que ce dépôt nomme partout ailleurs, écrit ici avant que la règle ne soit formulée.
- **Ma première coupe était trop large, et la suite e2e l'a démentie en une exécution** (§3).
- **Trois correctifs de carte** venus du même retour : fond de plan sans étiquettes, croix de
  fermeture à 44 px, bassin versant qui ne manque plus juste après une recherche.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/juridiction.ts` | modifié | `Situation` à trois états + `situationPoint()`, fonction **pure** — la seule façon de tester un état qu'on ne peut pas provoquer depuis un bac à sable |
| `lib/communes.ts` | neuf | Le rattachement inverse, avec la distinction « a répondu vide » / « n'a pas répondu » |
| `app/api/situation/route.ts` | neuf | Le point est-il un lieu ? Ne met en cache que les réponses fermes |
| `app/api/projection/route.ts` | modifié | `reverseCommune` retiré ; deux échecs, deux phrases |
| `components/HomeClient.tsx` | modifié | Bandeau + suppression des chiffres sur `hors-terre` uniquement |
| `components/CarteEau.tsx` | modifié | Fond `light_nolabels`, étiquettes étagées par zoom, Échap, contours chargés plus tôt, absence dite |
| `app/globals.css` | modifié | Cible de fermeture 44 × 44 px (WCAG 2.2), survol, focus visible |
| `scripts/test/auditabilite.test.ts` | modifié | 15 cas sur les trois états et sur la forme de la coupe |
| `scripts/test/e2e.mjs` | modifié | Le point en mer, la panne, la contre-épreuve, la croix, Échap |

---

## 3. Erreurs potentielles

### Bugs trouvés et corrigés pendant la session

- **Le point en mer**, décrit ci-dessus. ⚠️ **Il ne date pas de ce sprint** : il existe depuis que
  le lien profond existe. Ce qui est neuf, c'est que quelqu'un a regardé.
- **Ma première coupe éteignait la fiche sur DEUX états** — `hors-terre` et `indeterminee`. L'e2e a
  échoué immédiatement : avec l'egress bloqué, le référentiel des communes est **toujours**
  injoignable, donc toute fiche ouverte par lien profond devenait vide. Transposé en production, une
  panne d'un référentiel **auxiliaire** aurait éteint le produit entier pour tous les liens du
  tableau de bord — un rayon de souffle sans commune mesure avec le défaut corrigé. La coupe ne
  porte plus que sur l'état où l'on **sait** qu'il n'y a rien.
- **Ma première assertion e2e cherchait un mot, pas un chiffre** : « jours contraints » figure dans
  le libellé du formulaire (« convertit les jours contraints en m³ et en € »), donc le test échouait
  sur une page pourtant correcte. Elle vise maintenant une **valeur**.

### Non vérifié en conditions réelles

- **Le fond de plan sans étiquettes n'a pas été vu.** C'est le correctif nº 2 et je ne peux pas le
  juger : les tuiles sont injoignables ici, donc mes captures restent blanches. Il est possible que,
  sans les noms de villes, la carte devienne difficile à se repérer — c'est un arbitrage pris avec
  l'utilisateur, pas une certitude.
- **L'étagement des étiquettes par zoom** (grands bassins ≤ 7,5 ; bassins versants ≥ 8,5 ; rivières
  ≥ 9) est choisi au jugé. Les seuils sont plausibles, **aucun n'est mesuré**.
- **Le correctif du point en mer n'a jamais tourné contre le vrai référentiel.**
  `geo.api.gouv.fr` est bloqué ici : les trois états sont testés sur des réponses que j'écris
  moi-même. Que le service réponde bien `[]` en mer est une **hypothèse**, cohérente avec sa
  documentation, non vérifiée.
- **Le nº 8 n'est pas instruit** faute de capture.

### Hypothèses qui pourraient ne pas tenir

- **« Liste vide ⇒ hors du territoire »** suppose que le service ne rend jamais une liste vide par
  autre chose qu'une absence de commune (une erreur silencieuse renvoyant `200 []`, par exemple,
  serait lue comme la mer). C'est le point faible du correctif, et il est assumé : l'inverse — ne
  jamais rien conclure — laissait les chiffres.
- **Les sites enregistrés portent-ils un code INSEE ?** Si un site sauvegardé n'en a pas, son lien
  depuis le tableau de bord déclenchera un appel au référentiel à chaque ouverture. Non vérifié.

### Ce qui casserait si une source amont changeait

- Un changement de format de `geo.api.gouv.fr` ferait basculer tous les points en `indeterminee` :
  les fiches resteraient affichées, avec leur réserve. **Le repli est du bon côté** — c'était le but
  du recalibrage.
- La disparition de `light_nolabels` chez CARTO laisserait la carte sans fond, comme aujourd'hui en
  bac à sable, et le message « Contours indisponibles » ne couvre pas ce cas.

---

## 4. Points d'amélioration

**Dette assumée**

- **La situation est résolue en parallèle des autres appels**, pas en amont : un point en mer
  déclenche donc quand même les requêtes Hub'Eau, dont on jette le résultat. Sérialiser coûterait une
  seconde à **chaque** recherche légitime pour un cas rare. C'est l'affichage qui est protégé, pas
  le réseau.
- **Le bandeau d'indétermination est une phrase, pas un blocage.** Un lecteur pressé peut le sauter.

**À reprendre**

- **Le geste nº 8**, dès la capture reçue.
- **Les seuils de zoom des étiquettes**, à ajuster sur une vraie capture.
- **`app/globals.css` utilise trois `!important`** contre la feuille de MapLibre, importée après la
  nôtre. Ça marche et c'est fragile ; une couche de styles portée par le composant serait plus sûre.

---

## 5. État Git

- **Branche de session** : `claude/bassins-versants-carte-6crhsl` — commit `747536d`, poussé.
- **`main` touché ?** : **NON**. Aucun merge demandé, aucun fait.
- **Déployé en prod ?** : non. Les correctifs sont sur la branche ; c'est sa **prévisualisation**
  que l'utilisateur a testée et devra retester.
- **Vérifications passées** : `npm run build` ✅, `npm run lint` ✅, `npm run typecheck` ✅ (0 erreur),
  **32 suites unitaires** au vert, **e2e 161/161** — 152 du sprint précédent plus 9 neuves.
- **Aucun run Actions** : aucune donnée refabriquée.

---

## 6. Prochaines étapes

1. **Rejouer les gestes nº 3, 4 et 9** sur la prévisualisation. *Verrou* : le déploiement doit être
   à jour. C'est la seule preuve qui vaille pour ce lot — surtout le fond sans étiquettes, que je
   n'ai pas pu voir.
2. **La capture du geste nº 8.** *Verrou* : elle arrive.
3. **Les gestes nº 6 et nº 10**, non réalisés. *Verrou* : aucun — le nº 6 porte sur le format où
   deux régressions ont déjà eu lieu.
4. **Vérifier que les sites enregistrés portent un code INSEE.** *Verrou* : aucun, une lecture de
   `lib/sites.ts` suffit.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

L'outil dit à une entreprise si l'eau va lui manquer à une adresse donnée. Pour vérifier que
l'adresse est bien en France, il regardait si elle tombait dans un grand rectangle tracé autour du
pays. Or un rectangle autour de la France contient aussi une bonne partie de la Méditerranée. Un
point choisi en pleine mer passait donc le contrôle, et l'outil produisait une analyse complète en
allant chercher les stations de mesure les plus proches — sur la côte, à trente kilomètres. Des
chiffres parfaitement calculés, à propos d'un endroit où il n'y a rien, présentés comme s'ils
décrivaient un site.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| Boîte englobante | Le plus petit rectangle contenant une forme. Simple à tester, mais grossier : celui de la France contient la mer et un bout de l'Espagne. |
| Code INSEE | L'identifiant à cinq caractères d'une commune française. Le posséder prouve qu'on est en France. |
| Rattachement inverse | Partir de coordonnées et demander « quelle commune contient ce point ? ». |
| Référentiel | Une base officielle qui fait foi — ici, la liste des communes publiée par l'État. |
| Type somme | En TypeScript, un type qui vaut « ceci **ou** cela **ou** cela ». Le compilateur refuse alors d'oublier un cas. |
| Fonction pure | Une fonction qui ne fait que calculer : mêmes entrées, mêmes sorties, aucun appel réseau. Donc testable partout. |
| e2e | Test « de bout en bout » : un vrai navigateur pilote la vraie page. |
| Bouchon | Une fausse réponse qu'on substitue à un vrai service pour tester sans réseau. |

### 7.3 Comment le code s'y prend

**Étape 1 — séparer deux questions qu'on avait confondues.** « Ce point est-il dans le périmètre ? »
et « ce point est-il un lieu ? » ne sont pas la même question. La première est le rectangle, elle
reste. La seconde est neuve :

```ts
// lib/juridiction.ts
export type Situation =
  | { etat: "commune"; code: string; nom?: string; detail: string }
  | { etat: "hors-terre"; detail: string }       // le référentiel a répondu : rien ici
  | { etat: "indeterminee"; detail: string };    // le référentiel n'a pas répondu
```

**Trois** états, pas deux. C'est le cœur de la session. Le code existant faisait ceci :

```ts
if (!res.ok) return null;                       // panne
const arr = await res.json();
return arr?.[0]?.code ? {...} : null;           // ⚠️ mer → le MÊME null
```

Une panne du service et un point en pleine mer devenaient indiscernables. Le message affiché
accusait alors le service (« service de géographie indisponible ») même quand le service avait
parfaitement fait son travail en répondant « il n'y a aucune commune ici ».

**Étape 2 — rendre l'interprétation testable.** L'appel réseau vit dans `lib/communes.ts`, la
décision dans une fonction pure. On ne peut pas provoquer une panne d'un service public à volonté ;
on peut lui passer `{ injoignable: true }` :

```ts
const mer = situationPoint({ injoignable: false, communes: [] });
check("une liste VIDE veut dire « hors du territoire »", mer.etat === "hors-terre");
const panne = situationPoint({ injoignable: true });
check("une panne n'est JAMAIS annoncée comme un point hors du territoire",
  panne.etat === "indeterminee");
```

**Étape 3 — ne pas afficher de chiffres pour un endroit qui n'existe pas.** Un bandeau au-dessus des
chiffres ne suffit pas : un chiffre affiché a été lu. La page ne rend donc rien du tout :

```tsx
{resultsReady && address && data && synthese && situation && situation.etat !== "hors-terre" && (
```

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Pas de contour de la France.** La solution évidente est d'embarquer la forme exacte du pays et
  de tester si le point est dedans. Elle avait déjà été écartée pour son poids (une centaine de
  kilo-octets de littoral). La commune donne la même réponse pour rien, et elle en donne une
  meilleure : elle **nomme** le lieu au lieu de dire seulement oui ou non.
- **Couper sur un seul état, et pas sur deux.** J'ai d'abord éteint la page dans les deux cas
  d'échec. C'était plus « sûr » en apparence, et c'était pire : le référentiel des communes est un
  service **auxiliaire**, et sa moindre panne aurait éteint le produit entier pour tous les liens du
  tableau de bord. Quand on sait qu'il n'y a rien, on ne montre rien. Quand on ne sait pas, on
  montre **et on le dit**.
- **Un test qui échoue avant d'être vrai.** C'est l'e2e qui a démenti ma première version, en une
  exécution. Sans elle je livrais un correctif dont l'effet de bord dépassait le défaut.
- **Le fond de carte sans noms.** Les noms qui se superposaient venaient pour moitié du fond de plan,
  et il les écrivait en deux langues. Alléger mes propres étiquettes n'aurait pas réglé le mélange
  français/anglais ; enlever ceux du fond, si — au prix des noms de villes.

### 7.5 Pour expérimenter soi-même

**1. Voir le défaut d'origine.** Dans `components/HomeClient.tsx`, retirez la condition de situation :

```tsx
{resultsReady && address && data && synthese && (
```

puis lancez la suite :

```bash
npm run build && (setsid nohup npx next start -p 3200 >/dev/null 2>&1 &) ; sleep 6
BASE=http://localhost:3200 node scripts/test/e2e.mjs | grep "mer:"
```

`FAIL mer: ⚠️ AUCUN chapitre de résultat n'est rendu` — la page affiche une fiche complète pour un
point en pleine mer.

**2. Casser la distinction entre les deux échecs.** Dans `lib/juridiction.ts`, faites répondre la
même chose aux deux :

```ts
if (reponse.injoignable) {
  return { etat: "hors-terre", detail: "Aucune commune ici." };
}
```

puis `npx tsx scripts/test/auditabilite.test.ts`. Deux tests tombent, dont
`situation: ⚠️ une panne n'est JAMAIS annoncée comme un point hors du territoire`. Ce qu'ils
protègent : dire à quelqu'un « votre site n'est pas en France » parce qu'un serveur n'a pas répondu.

**3. Rétrécir la croix de fermeture.** Dans `app/globals.css`, ramenez `.maplibregl-popup-close-button`
à `width: 1rem`. L'e2e échoue sur `la croix de fermeture atteint la cible de 44 px` — la règle
WCAG 2.2 qui demande qu'une cible tactile soit atteignable au doigt, et qui manquait ici.
