# Compte rendu — L'état des sources sur la carte (Sprint 32)

**Date** : 2026-08-05 · **Branche** : `claude/france-map-water-data-2oe6h6` · **Sprint** : 32

---

## 1. La question initiale

> « peux-tu donner plus de détails sur l'état des sources (similaires à ceux donnés dans l'onglet
> principal) »

**Ce que j'ai compris** : les popups de la carte décrivent l'**identité** d'un objet — nom, code,
commune, profondeur, usage — mais jamais sa **situation**. La fiche site, elle, donne la dernière
mesure, sa date, la tendance sur 14 jours et surtout la **référence standardisée** (« nappe très
basse pour un mois d'août, décile le plus bas sur 25 ans »). C'est cette dernière qui fait la
différence : sans elle, « 2,3 m³/s » n'apprend rien, parce que le lecteur ne sait pas si c'est haut
ou bas pour la saison.

**Ambiguïtés arbitrées avec l'utilisateur** :

- **Quels objets** ? Les trois familles ont été retenues, ce qui obligeait à définir « état » trois
  fois : une station **mesure**, un ouvrage **exerce une pression**, une masse d'eau **n'a pas
  d'état physique national**.
- **Quelle profondeur** ? « Tout en une fois » a été choisi contre « mesure d'abord, référence
  ensuite ». ⚠️ Cela m'obligeait à traiter le coût de la référence autrement : elle est lancée en
  parallèle et **abandonnée après 6 s**, sans quoi une popup pouvait rester vide 15 s.

**Ce que j'ai délibérément laissé de côté** : l'état d'un plan d'eau autre que réglementaire (aucune
mesure de remplissage en open data national) ; l'historique long affiché sous forme de graphique
(la sparkline montre 35 jours, pas 25 ans) ; le lien profond entrant `/carte?lat=&lon=`, toujours
absent depuis le Sprint 29.

---

## 2. Ce qui a été réalisé

**En une phrase** : cliquer un objet de la carte dit désormais où il en est, avec les mêmes chiffres
et le même vocabulaire que la fiche site.

**Dans les grandes lignes** :

- **Rien n'a été réécrit.** Les sondes et les statistiques existaient déjà, en privé, dans
  `lib/hubeau.ts` : `stationEtat` les assemble pour un code **déjà connu**, là où
  `hydroIndicators` télécharge d'abord un référentiel de bbox pour *choisir* une station.
- **Un appel par clic**, jamais en amont : sonder la chronique de chaque station visible coûterait
  des centaines d'appels pour servir une popup.
- **Deux phrases pour deux échecs.** La première version disait « cette station ne publie pas de
  mesure récente » pendant une simple panne de service — une accusation portée contre une station en
  bonne santé.
- **La référence ne bloque pas la popup.** 18 à 25 ans d'historique, abandonnés au-delà de 6 s.
- **Le défaut du Sprint 31 est revenu par une autre porte**, et a été retrouvé en regardant l'écran.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/hubeau.ts` | modifié | `stationEtat()` : état d'une station de code connu, référence sous budget de temps, et **deux échecs distincts** |
| `lib/carteEau.ts` | modifié | `parseVolumesOuvrage()` ; `MapFeature.altCode` (le `bss_id` piézo, sans quoi l'état retombe sur la série d'archive) |
| `app/api/carte/etat/route.ts` | neuf | un objet, un état ; dégradation explicite et **jamais inventée** |
| `lib/sparkline.ts` | neuf | géométrie **partagée** entre le composant React et les popups en chaîne |
| `components/Sparkline.tsx` | modifié | consomme la géométrie partagée |
| `components/CarteEau.tsx` | modifié | case d'état, **jeton de séquence**, popup bornée à 240 px, bouton flottant qui s'efface |
| `scripts/test/carte.test.ts` | modifié | +10 vérifications (volumes, sparkline) — 64 au total |
| `scripts/test/e2e.mjs` | modifié | +4 vérifications, dont « la case d'état se résout au lieu de tourner indéfiniment » |
| `scripts/diag/prod-diag.sh` | modifié | le rejeu **chronomètre** l'état sur les trois sites |

---

## 3. Erreurs potentielles

### Bugs et erreurs trouvés et corrigés pendant la session

1. **Une panne de service était présentée comme une station muette.** `/api/carte/etat?kind=hydro`
   répondait « Cette station ne publie pas de mesure récente exploitable » alors que l'egress était
   bloqué. C'est une **affirmation fausse sur un objet réel** : la station peut être parfaitement
   active. `stationEtat` distingue désormais `"service-indisponible"` (la sonde rend `null`) de
   `"station-muette"` (la sonde rend `available: false`), et la route emploie deux phrases.
2. **La popup débordait la carte et repassait sous le bouton flottant.** L'ajout de l'état a triplé
   sa hauteur : mesuré **338 px, débordant de 90 px** au-dessus de la carte, sur un téléphone. C'est
   exactement le défaut signalé au Sprint 31, revenu par une autre porte. Bornée à 240 px avec
   défilement interne (**débordement ramené à 22 px**), et le bouton « Rechercher dans cette zone »
   s'efface tant qu'une popup est ouverte.
3. **L'arbre local avait été ramené à la fin du Sprint 30** en cours de session, alors que le travail
   du Sprint 31 était sur le distant. Détecté en cherchant une ancre de code absente. Résolu par
   `merge --ff-only` (aucun commit local à écraser, vérifié avant) et réapplication de mon travail en
   cours — aucune perte.

### Vérifié en conditions réelles

- **Dégradation de la route**, en bac à sable : `kind=nappes` répond
  « Service VigiEau indisponible (403) », `kind=hydro` répond « Service Hub'Eau injoignable » — deux
  messages différents pour deux sources, et **aucun état inventé**.
- **Le rendu a été regardé sur téléphone** (390×844, `isMobile`), avec un état réaliste : la popup
  affiche **« 1,02 m³/s · ↘ en baisse sur 14 j »**, le libellé de la grandeur et la date, un badge
  rouge **82/100 « Débit proche de l'étiage quinquennal »**, sa base (« 1,1 fois le VCN10 quinquennal
  (0,95 m³/s) · 18 ans de recul ») et la sparkline descendante.
- **La géométrie de la popup a été mesurée** avant et après correction : 338 px / 90 px de
  débordement, puis 270 px / 22 px.
- **Un e2e interdit désormais la case d'état bloquée sur « Chargement… »** : elle doit se résoudre,
  fût-ce en indisponibilité.
- **`/api/carte/etat` chronométré sur les vrais services** (diag `carte`, run 38), station par
  station :

  | Objet | Chartres | Lyon | Perpignan |
  |---|---|---|---|
  | station de débit | 3,0 s — réf. 10 ans | 1,5 s — **sans référence** | 2,0 s — réf. 19 ans |
  | piézomètre | 3,4 s — IPS 26 ans | 2,6 s — IPS 21 ans | 0,3 s — **station muette** |
  | ouvrage | 0,16 s | 0,15 s | 0,15 s |
  | zone réglementaire | 0,83 s | — | — |

  **Le budget de 6 s est validé par la mesure** : la référence la plus lente est arrivée en 3,4 s,
  soit une marge de 1,8×. Elle n'a donc **jamais été abandonnée** sur ces six stations.
- **Références réellement calculées et lisibles** : « Nappe proche des normales (IPS) » sur 26 ans à
  Chartres, « Nappe basse (IPS) » sur 21 ans à Lyon, « Débit au-dessus de l'étiage » sur 19 ans à
  Perpignan.
- **Les deux cas d'absence ont été observés en vrai**, ce qui vaut mieux qu'un test : le piézomètre
  de Perpignan répond « Cette station ne publie pas de mesure récente exploitable » (**station
  muette**, en 0,3 s), et la station de Lyon renvoie une mesure **sans référence** — moins de six ans
  d'historique, donc pas de VCN10 calculable. Dans les deux cas la popup l'écrit au lieu de laisser
  un vide.

### Non vérifié en conditions réelles

- **Le budget de 6 s n'a jamais été mis à l'épreuve.** Il est désormais **corroboré** (3,4 s au pire
  sur six stations), mais aucune des mesures ne l'a atteint : le chemin « référence abandonnée » du
  code n'a donc **jamais été exécuté en réel**. Il reste testé sur fixtures uniquement.
- **Six stations ne sont pas un échantillon.** Les temps ci-dessus viennent d'un runner GitHub, pas
  de Vercel, et de trois sites choisis pour leur contraste — pas pour leur représentativité.
- **Aucun état réel n'a été vu à l'écran.** Les captures utilisent une charge simulée ; les valeurs
  réelles n'ont été vues, au mieux, que dans la réponse JSON de la route.
- **Le cas « référence absente faute d'historique » est observé** (Lyon), mais l'affichage de sa
  phrase n'a pas été vu à l'écran, seulement dans la réponse JSON.
- **`altCode` n'a pas été vérifié bout en bout** : je l'ai ajouté pour que la chronique piézo temps
  réel soit atteinte, mais aucune mesure ne montre qu'elle l'est effectivement plutôt que l'archive.
- **Aucun déploiement Vercel.**

### Hypothèses qui pourraient ne pas tenir

- **6 s de budget pour la référence** — voir ci-dessus.
- **240 px de hauteur de popup** est calibré sur un écran de 844 px et sur une carte de 560 px. Sur
  une tablette, la popup sera inutilement bornée.
- **Le jeton de séquence** suppose qu'un seul objet est décrit à la fois — vrai depuis le Sprint 31
  (popup unique), mais les deux mécanismes doivent rester cohérents.
- **La référence n'est pas calculée sur la hauteur d'eau** (repli), ce qui est correct, mais le
  lecteur voit alors « Référence non calculable sur une hauteur d'eau » sans savoir que c'est un
  signal secondaire — la mention existe juste au-dessus, à confirmer qu'elle se lit.

### Ce qui casserait si une source amont changeait

- **Un changement de nom de grandeur Hub'Eau** (`QmnJ`) ⇒ la station passerait au repli hauteur, et
  la popup le dirait — dégradation visible, pas silencieuse.
- **Une panne VigiEau** ⇒ les masses d'eau perdent leur état réglementaire, et le disent.
- **Un ralentissement durable de Hub'Eau** ⇒ la référence disparaîtrait des popups sans autre
  symptôme que sa phrase d'absence. C'est le mode de dégradation le plus discret du sprint.

---

## 4. Points d'amélioration

**Dette assumée**

- **Un appel par clic** : pas de mise en cache côté client. Recliquer le même objet le refait.
- **La popup mélange trois natures d'information** (identité, caractéristiques, état) dans une seule
  colonne défilante. Sur 240 px, l'état peut demander de faire défiler.
- **La sparkline n'a ni axe ni échelle** : c'est un choix (elle montre une forme, la valeur est dans
  le texte), mais elle ne dit pas l'amplitude.

**À reprendre**

- **Mesurer, puis recalibrer le budget de 6 s** avec les temps du rejeu.
- **Mettre en cache l'état par code** côté client, le temps d'une session de navigation.
- **Afficher l'état des piézomètres avec leur profondeur du jour**, pas seulement le niveau NGF —
  deux lectures du même chiffre selon le public.

---

## 5. État Git

- **Branche de session** : `claude/france-map-water-data-2oe6h6`
- **`main` touché ?** : **OUI, le 2026-08-06, sur demande explicite de l'utilisateur** (« pousse en
  prod ») — merge des sprints 29→32, après build + lint + 18 suites + 60/60 e2e rejoués sur l'arbre
  final. Le merge inclut aussi le badge `Shell.tsx` passé à « Démo — Sprint 32 » et la mise à jour
  du HANDBOOK.
- **Déployé en prod ?** : **oui** — ⚠️ mais *déployé* n'est pas *vérifié* : la carte n'a jamais été
  vue avec un vrai fond de tuiles, et aucun des trois GeoJSON neufs n'a été servi par Vercel. Voir
  l'entrée « Mise en prod 2026-08-06 » du HANDBOOK pour les trois points à contrôler.
- **Vérifications passées** : `npm run build` ✅ · `npm run lint` ✅ · **18 suites unitaires au vert**
  (`carte.test.ts` : 64 vérifications) · **60/60 e2e** (4 neufs) · **rendu 390×844 regardé** avec un
  état réaliste · géométrie de la popup **mesurée avant/après** · **`/api/carte/etat` chronométré
  contre les vrais services** sur six stations (§3).
- ⚠️ **Incident sans perte** : l'arbre local avait régressé au Sprint 30 en cours de session (§3).

---

## 6. Prochaines étapes

1. **Voir un état réel à l'écran.** *Verrou* : egress ; contournable en rejouant la charge utile du
   diag dans l'interception, comme au Sprint 30.
2. **Mettre en cache l'état par code** côté client. *Verrou* : aucun.
3. **Filtrer les nappes par bbox** (dette héritée du Sprint 31). *Verrou* : aucun.
4. **Lien profond entrant `/carte?lat=&lon=`.** *Verrou* : aucun.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

La carte savait dire « ici il y a une station qui mesure le débit de l'Eure, à 2,6 km, mise en
service en 2017 ». Elle ne savait pas dire « et en ce moment, cette rivière est basse ». Or c'est la
seule chose qui intéresse quelqu'un qui se demande si son site risque de manquer d'eau. Le reste de
l'application le disait déjà, sur une autre page : il fallait amener la même information sur la
carte.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Débit** | Le volume d'eau qui passe par seconde dans une rivière, en m³/s. |
| **Étiage** | La période de plus basses eaux de l'année. |
| **VCN10 quinquennal** | Le débit minimal sur 10 jours consécutifs, atteint en moyenne une année sur cinq. Un repère de sécheresse sévère mais normale. |
| **IPS** | Indice de la position d'un niveau de nappe dans l'histoire de la même station **pour le même mois** : il compare août à des mois d'août. |
| **Chronique** | La série des mesures d'une station au fil du temps. |
| **Sparkline** | Un mini-graphique sans axes, qui montre une forme et non des valeurs. |
| **Popup** | La bulle qui s'ouvre au clic. |
| **Jeton de séquence** | Un numéro qui croît à chaque nouvelle demande, pour ignorer les réponses tardives d'une demande abandonnée. |

### 7.3 Comment le code s'y prend

**Étape 1 — ne pas refaire ce qui existe.** Le module `lib/hubeau.ts` savait déjà interroger une
station et calculer sa référence. Il avait même une fonction qui fait exactement le calcul voulu,
`hydroIndicators(lat, lon, code)`. Mais elle commence par télécharger toutes les stations d'un carré
de 60 km pour **choisir** laquelle utiliser — un travail inutile ici, puisque l'utilisateur vient de
cliquer sur une station précise. D'où une fonction de plus, qui assemble les briques existantes :

```ts
// lib/hubeau.ts
export async function stationEtat(input: { kind: "hydro" | "piezo"; code: string; altCode?: string })
  : Promise<EtatStation | "service-indisponible" | "station-muette">
```

**Étape 2 — la distinction qui évite un mensonge.** Le type de retour ci-dessus contient deux
chaînes plutôt qu'un simple `null`, et c'est le cœur du sprint :

```ts
// ⚠️ Deux échecs très différents qui ne doivent pas partager une phrase. Une
// sonde nulle veut dire que le SERVICE n'a pas répondu ; une sonde qui répond
// `available: false` veut dire que la STATION ne publie rien d'exploitable.
if (probe === null) return "service-indisponible";
if (!probe.available || !probe.series || probe.series.length === 0) return "station-muette";
```

La première version renvoyait `null` dans les deux cas, et la popup affichait « cette station ne
publie pas de mesure récente ». Je l'ai découvert en interrogeant la route depuis le bac à sable, où
le réseau est coupé : le message accusait une station qui n'y était pour rien.

**Étape 3 — la référence ne prend pas la popup en otage.** Calculer « ce débit est-il bas pour la
saison ? » demande de télécharger 18 à 25 ans de mesures. C'est long. La mesure du jour, elle, arrive
vite. On lance les deux ensemble et on renonce à la seconde si elle traîne :

```ts
const reference = await withBudget(referencePromise, ETAT_REFERENCE_BUDGET_MS); // 6 s
```

Si elle n'arrive pas, la popup affiche quand même la mesure **et dit** que la référence manque. Une
popup vide pendant 15 secondes serait pire qu'une popup incomplète.

**Étape 4 — écrire l'état dans une bulle déjà ouverte.** La popup est construite comme une chaîne de
HTML, avant que l'état soit connu. On y laisse donc un emplacement vide, puis on le remplit :

```ts
// components/CarteEau.tsx
const ETAT_SLOT = `<div data-etat …><span …>Chargement de l'état…</span></div>`;
```

Et le piège classique, celui des interfaces asynchrones :

```ts
// Jeton de séquence. Un clic sur un autre objet pendant le chargement ne doit
// pas écrire cet état-là dans la nouvelle popup.
let etatToken = 0;
const loadEtat = (query, couleur) => {
  const mine = etatToken;          // le numéro de MA demande
  …
  if (mine !== etatToken) return;  // quelqu'un a cliqué ailleurs : j'abandonne
};
```

Sans ces trois lignes, cliquer vite sur deux stations afficherait l'état de la première dans la bulle
de la seconde — une erreur invisible en test lent, systématique en usage réel.

**Étape 5 — un enrichissement a un poids.** L'état a triplé la hauteur de la bulle. Mesuré sur un
écran de téléphone : **338 px, dépassant de 90 px au-dessus de la carte**, jusqu'à repasser sous le
bouton flottant. C'est exactement le défaut signalé au sprint précédent, revenu autrement. Deux
lignes le referment :

```ts
.setHTML(`<div style="max-height:min(40vh,240px);overflow-y:auto">${html}</div>`)
```

et le bouton s'efface tant qu'une bulle est ouverte. Après correction : 270 px, dépassement de 22 px.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Pourquoi un appel par clic, et pas l'état de toutes les stations d'un coup ?** Parce qu'une vue
  peut contenir 90 piézomètres : ce serait 90 téléchargements de chroniques pour afficher une bulle
  que l'utilisateur ouvrira peut-être une fois.
- **Pourquoi abandonner la référence au lieu d'attendre ?** Parce que l'utilisateur a explicitement
  demandé « tout en une fois » plutôt qu'un affichage en deux temps. Le seul moyen d'honorer ce choix
  sans imposer 15 secondes d'attente est de renoncer à ce qui traîne — et de le dire.
- **Pourquoi montrer un volume prélevé alors que ce n'est pas un état ?** Parce que c'est ce que la
  BNPE publie, et que c'est utile : savoir qu'un forage voisin prélève 15 500 m³ éclaire la
  concurrence sur la ressource. Mais la bulle écrit noir sur blanc que c'est une **pression**, pas un
  état, et que la déclaration a plusieurs années de retard.
- **Pourquoi un niveau réglementaire pour les nappes ?** Parce que l'état physique national des
  masses d'eau n'existe pas en open data — piste instruite et close au Sprint 27. Plutôt que de ne
  rien dire, la bulle donne l'état de la **zone d'arrêté**, en précisant que ce n'est pas la même
  chose.

### 7.5 Pour expérimenter soi-même

**A. Casser la règle qui distingue deux échecs.**

Dans `lib/hubeau.ts`, fusionnez les deux retours :

```ts
if (probe === null) return "station-muette";   // au lieu de "service-indisponible"
```

Reconstruisez et interrogez la route depuis le bac à sable :

```bash
curl -s "http://localhost:3300/api/carte/etat?kind=hydro&code=H404021101"
```

Vous lirez « Cette station ne publie pas de mesure récente exploitable » alors que le réseau est
simplement coupé. Aucun test unitaire ne l'attrape — c'est une phrase, pas un calcul — mais l'e2e
`an outage is not blamed on the station` échoue. C'est un bon exemple d'erreur qui ne casse rien et
trompe tout le monde.

**B. Voir le mini-graphique mentir.**

Dans `lib/sparkline.ts`, supprimez le traitement de la série plate :

```ts
const y = (v: number) => height - pad - ((v - min) / span) * (height - 2 * pad);
```

(c'est-à-dire retirez le `max === min ? height / 2 : …`). Puis :

```bash
npx tsx scripts/test/carte.test.ts
```

`FAIL sparkline: a flat series is drawn flat, mid-height`. Une nappe parfaitement stable serait
dessinée **collée en haut du cadre** — ce qui se lit « au plus haut » alors que cela veut dire
« sans variation ». Le test protège une lecture, pas un nombre.

**C. Sentir le budget de la référence.**

Dans `lib/hubeau.ts`, passez `ETAT_REFERENCE_BUDGET_MS` de `6000` à `200`, reconstruisez, et ouvrez
une popup de station sur un déploiement ayant accès au réseau. La mesure et la tendance s'affichent,
mais le badge coloré disparaît au profit de « Référence historique non disponible pour cette
station ». C'est exactement ce que verront les utilisateurs les jours où Hub'Eau est lent — et cela
montre pourquoi la phrase d'absence compte autant que le chiffre.
