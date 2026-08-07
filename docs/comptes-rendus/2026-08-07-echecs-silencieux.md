# Compte rendu — Neuf échecs silencieux trouvés et corrigés (hors sprint)

**Date** : 2026-08-07 · **Branche** : `claude/ecc-github-content-review-ua4nci` · **Sprint** : hors
sprint (suite directe de l'import d'outillage ECC du matin)

---

## 1. La question initiale

> cherche plus loin et corrige tout

**Ce que j'ai compris** : la session précédente avait importé l'outillage ECC puis, à la demande
suivante (« lance prochaine étape »), fait tourner `silent-failure-hunter` sur `lib/hubeau.ts`,
`lib/swi.ts` et les 18 routes — trois défauts confirmés, **documentés mais non corrigés**. La demande
enchaîne deux choses : **étendre** l'audit à la surface que la première passe n'avait pas ouverte, et
**corriger** l'ensemble, ancien et nouveau.

**Ce que j'ai délibérément laissé de côté** :

- **Rien du périmètre demandé.** Les 4 défauts de la 1ʳᵉ passe et les 5 de la 2ᵈᵉ sont tous corrigés.
- **Le seuil de dérive partielle** dans `build_restrictions.py` : au-delà de 50 % de lignes écartées
  le script **avertit** mais n'échoue pas. Faire échouer sur un seuil arbitraire aurait rendu la CI
  instable au premier changement mineur de schéma ; 100 % d'écart, lui, est sans ambiguïté.
- **Le fond de tuiles de `/carte` et les cinq chapitres peuplés**, qui restent les deux points en
  attente d'un œil humain depuis la session UI/UX. Hors sujet ici.

---

## 2. Ce qui a été réalisé

**En une phrase** : neuf endroits où l'outil disait « rien à signaler » alors qu'il voulait dire « je
n'ai pas pu savoir » — dont trois qui alimentaient directement le score de risque et la confiance
affichée — disent désormais lequel des deux.

**Dans les grandes lignes** :

- **La règle du Sprint 32 (« service injoignable ≠ station muette ») n'avait jamais quitté la carte.**
  Elle est maintenant tenue en amont : dans le client Hub'Eau, dans BNPE, dans Onde, dans le
  référentiel des bassins, et jusque dans le score composite et le rapport ESG.
- **Le défaut le plus grave était invisible depuis le bac à sable** : quand le référentiel de stations
  répond mais que **tous** les appels de séries échouent, l'utilisateur lisait « Stations proches sans
  données récentes de débit ni de hauteur ». Un serveur bouchon local (`HUBEAU_BASE_URL` était déjà
  surchargeable) permet enfin d'**exécuter** ce chemin ; il est couvert par un test.
- **Deux défauts n'ont rien à voir avec le réseau**, et ce sont peut-être les plus vicieux : un
  `?? 0` faisait qu'une zone absente de l'archive contribuait **0 jour de restriction** au maximum,
  donnant un « 0 j en alerte+ » parfaitement affirmatif ; et un `dispatchEvent` placé **dans** le
  `try` faisait que le bouton « Ajouter à mes sites » ne faisait **rien du tout**, sans message, quand
  le stockage local était plein.
- **Trois scripts de build sortaient en code 0 même après avoir tout jeté.** La CI committait alors
  un jeu de données vide ou périmé sous une coche verte — le pire cas, parce que la panne ne se voit
  que des semaines plus tard, sous la forme d'une fonctionnalité qui paraît vide plutôt que cassée.
- **L'arithmétique du score n'a délibérément pas bougé** : une composante injoignable reste **hors** de
  la moyenne pondérée, exactement comme avant. Ce qui change, c'est ce qui est **dit**. Un test le
  vérifie explicitement (score et couverture identiques, libellés différents).

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/hubeau.ts` | modifié | `failed: Set` par sonde ; `StationOption.unreachable` ; `IndicatorsPayload.serviceDegraded` ; `noSelection()` distingue les deux messages |
| `lib/bnpe.ts` | modifié | `BnpeLookup = BnpeSummary \| null \| "service-error"` |
| `lib/onde.ts` | modifié | `OndeLookup = OndeResult \| null \| "service-error"` |
| `lib/swi.ts` | modifié | `SwiLookup` ajoute `"format-inconnu"` ; en-tête partiel refusé |
| `lib/score.ts` | modifié | `ScoreInputs.indisponibles` ; libellés dédiés ; `scoreConfidence` nomme la panne, y compris en confiance haute |
| `lib/projections.ts` | modifié | `ReadOutcome` sépare `absent` d'`illisible` ; un fichier illisible est **journalisé et non mémoïsé** |
| `lib/sites.ts` | modifié | `persist()` renvoie un booléen ; `dispatchEvent` sorti du `try` (dans `finally`) |
| `lib/report.ts` | modifié | le rapport ESG nomme les sources injoignables |
| `app/api/{bnpe,onde,swi}/route.ts` | modifié | trois issues distinctes, drapeau `serviceIndisponible` |
| `components/SiteIndicators.tsx` | modifié | 3ᵉ argument `reason: "empty" \| "unreachable"` |
| `components/HomeClient.tsx` | modifié | états `indicatorsInjoignables` / `ondeInjoignable` / `saveError` ; correction du `?? 0` ; message d'échec d'enregistrement |
| `components/SitesDashboard.tsx` | modifié | même correction du `?? 0` ; import et annulation signalent leur échec |
| `components/TransitionRiskPanel.tsx` | modifié | le bloc bassin gagne l'état « référentiel injoignable » |
| `components/ScorePanel.tsx` | modifié | passe `indisponibles` à `scoreConfidence` |
| `scripts/restrictions/build_restrictions.py` | modifié | planchers de vraisemblance + `sys.exit(1)` |
| `scripts/refdata/fetch_bassins.py` | modifié | échoue sous 30 000 communes rattachées |
| `scripts/refdata/fetch_refdata.py` | modifié | échoue si la couche départements < 90 entités (tolérance ZRE conservée) |
| `scripts/test/hubeau-degrade.test.ts` | **neuf** | serveur bouchon : panne partielle vs silence réel |
| `scripts/test/score-indisponible.test.ts` | **neuf** | 18 assertions sur les libellés **et** sur l'invariance du calcul |
| `scripts/test/swi.test.ts` | modifié | 4 assertions neuves sur les en-têtes dérivés |

---

## 3. Erreurs potentielles

> La section la plus importante. Ce qui peut être faux, ce qui n'a pas été vérifié.

**Bugs trouvés et corrigés pendant la session** — les neuf sont listés au §2 ; les trois qui disent le
mieux où le code est fragile :

1. `probeHydroFlow` renvoie `null` **seulement** en cas d'échec d'appel, et ce `null` était jeté par
   un `if (p)`. Toute la distinction existait déjà dans les types, elle était perdue à une ligne.
2. `Math.max(0, ...codes.map((c) => zones[c]?.joursAlertePlus ?? 0))` : le `?? 0` **à l'intérieur du
   map**. Le `Math.max(0, …)` extérieur est légitime, celui de l'intérieur transformait une zone non
   appariée en zone jamais restreinte.
3. `window.dispatchEvent` **après** `setItem` dans le même `try`. Le commentaire affirmait « l'UI
   garde son état en mémoire » — il n'y a pas d'état en mémoire, la liste est relue à chaque
   événement. Le commentaire était faux, et c'est lui qui rendait le bug invisible à la relecture.

**Non vérifié en conditions réelles** — et c'est la limite majeure de cette session :

- ⚠️ **Aucune des neuf corrections n'a été vue sur le déploiement Vercel.** L'egress est bloqué en bac
  à sable : aucune réponse réelle de VigiEau, Hub'Eau, BNPE, Onde ou Météo-France n'a été reçue. Ce
  qui est prouvé, c'est le comportement du code face à des réponses **simulées**.
- ⚠️ **Les trois messages de panne n'ont jamais été lus à l'écran.** Ils sont vérifiés par des
  assertions de chaîne, pas par un rendu — donc ni leur longueur, ni leur passage à la ligne en
  390 px, ni leur lecture par un lecteur d'écran ne sont connus. Le sprint 32 avait justement fait
  revenir un défaut d'affichage par cette porte.
- ⚠️ **Les trois `sys.exit(1)` des scripts Python n'ont jamais été exécutés**, ni en succès ni en
  échec : ces scripts ne tournent que sur un runner GitHub. Un seuil mal placé **casserait la CI de
  rafraîchissement des données** au prochain lancement. Les seuils sont chiffrés à partir du HANDBOOK
  (35 186 communes au Sprint 24 → plancher 30 000 ; 101 départements → plancher 90), mais **un
  plancher n'est juste que si la donnée de référence l'est**.
- ⚠️ **`lib/projections.ts` : le chemin « fichier illisible » n'a pas été déclenché.** Il est écrit,
  typé, mais aucun test ne corrompt un fichier pour le voir passer. C'est la correction la moins
  éprouvée du lot.
- ⚠️ **Le rendu de `TransitionRiskPanel` en état dégradé n'a pas été observé**, seulement écrit.

**Hypothèses qui pourraient ne pas tenir** :

- Dans `hydroIndicators`, une station dont la sonde **débit** échoue mais dont la sonde **hauteur**
  répond est retirée de `failed` : je la considère joignable. C'est défendable — elle a répondu — mais
  cela signifie qu'une panne partielle **du seul service de débit** ne lèvera pas `serviceDegraded`
  si la hauteur répond. Choix assumé, non validé sur le comportement réel de Hub'Eau.
- `serviceDegraded` n'est levé que **lorsque aucune station n'est sélectionnable**. Si une station
  répond et que trois autres sont injoignables, le drapeau reste absent — seules les stations portent
  `unreachable`. C'est voulu (on a une mesure), mais le sélecteur de station est alors le seul endroit
  où l'information existe.
- Le seuil de 50 % d'avertissement dans `build_restrictions.py` est **arbitraire**, assumé comme tel.

**Ce qui casserait si une source amont changeait** : c'est précisément l'objet de la session — trois
des corrections (`swi`, `build_restrictions`, `fetch_bassins`) existent pour que ce cas **échoue
bruyamment** au lieu de passer inaperçu. En contrepartie, **un changement de schéma amont fera
désormais échouer la CI** là où elle passait au vert : c'est le comportement voulu, il faut savoir
qu'il arrivera.

---

## 4. Points d'amélioration

**Dette assumée** :

- **`ScoreInputs.indisponibles` est un tableau de chaînes en parallèle des champs qu'il qualifie.** Un
  type somme par composante (`{ statut: "ok" | "vide" | "injoignable", … }`) serait plus juste : rien
  n'empêche aujourd'hui de déclarer `hydro` injoignable tout en fournissant une mesure. La forme
  actuelle a été retenue parce qu'elle est **additive** — elle ne touche à aucun appelant existant, et
  `undefined` signifie déjà « en attente » côté `HomeClient` (Sprint 35), ce qui interdisait de
  réutiliser l'idiome `null`/`undefined`. À reprendre si un troisième consommateur apparaît.
- **`importSites` renvoie `-1` pour signaler un échec d'écriture.** Un code sentinelle dans un
  compteur : correct mais laid. Un `{ added: number; ok: boolean }` serait plus honnête.
- **Trois libellés de panne sont dupliqués** entre `lib/score.ts` et les routes. Une constante
  partagée éviterait qu'ils divergent.

**À reprendre** :

- **`lib/projections.ts` mérite son test** : écrire un JSON tronqué dans un répertoire temporaire,
  vérifier que deux appels successifs relisent le fichier au lieu de mémoïser l'échec. C'est cinq
  lignes et cela couvrirait la correction la moins éprouvée.
- **Les scripts Python n'ont aucun test.** Les planchers sont du code non couvert dans un langage sans
  filet ici. Au minimum, un `--dry-run` qui exerce la logique de seuil sur un `meta` fabriqué.
- **La deuxième passe n'a pas ouvert `app/` (pages et layouts) ni `lib/carteEau.ts` en profondeur**,
  déjà jugé correct par la première. Une troisième passe aurait un rendement décroissant, mais le dire
  vaut mieux que laisser croire à une couverture exhaustive.

---

## 5. État Git

- **Branche de session** : `claude/ecc-github-content-review-ua4nci` — trois commits ce jour (import
  ECC, consignation de l'audit, puis ces corrections)
- **`main` touché ?** : **NON**. Aucun merge, aucune demande en ce sens. La branche attend une revue.
- **Déployé en prod ?** : **non**, et donc **aucune correction n'est vérifiée sur données réelles**
  (cf. §3).
- **Vérifications passées** : `npm run build` **clean**, `npm run lint` **clean**, **22 suites de
  tests au vert** (dont 2 neuves), **62/62 e2e** sur `next start` en local.
  ⚠️ `npx tsc --noEmit` remonte **une erreur préexistante** — `scripts/test/report.test.ts(231,66)`,
  drapeau d'expression régulière `es2018` — **antérieure à cette session et non corrigée ici** (elle
  n'apparaît pas dans `npm run build`, qui utilise la configuration du projet).

---

## 6. Prochaines étapes

1. **Regarder les cinq nouveaux messages sur un déploiement de preview.** *Verrou* : un merge ou un
   push déclenchant une preview Vercel, puis un œil humain. C'est la seule étape qui transforme « le
   code fait la distinction » en « l'utilisateur la lit ».
2. **Provoquer une vraie panne partielle en prod.** `HUBEAU_BASE_URL` est surchargeable : pointer un
   déploiement de preview vers un hôte mort le temps d'un diagnostic ferait tomber le chemin
   `serviceDegraded` **en conditions réelles**, ce que le bouchon local ne prouve pas. *Verrou* :
   accepter un déploiement volontairement dégradé quelques minutes.
3. **Faire échouer un script Python exprès.** Lancer `fetch_bassins.py` avec une URL de communes
   invalide sur le runner et vérifier que le job **rougit** au lieu de committer. *Verrou* : un
   lancement d'Actions, et l'acceptation d'un run rouge délibéré.
4. **Ajouter le test de `lib/projections.ts`** (§4). *Verrou* : aucun.
5. **Corriger l'erreur `tsc` préexistante de `report.test.ts`.** *Verrou* : aucun — décider si la
   cible TypeScript des scripts de test doit monter, ou si l'expression régulière doit être réécrite.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Cet outil dit à une entreprise si son usine risque de manquer d'eau. Pour cela il interroge cinq ou
six services publics : les arrêtés préfectoraux, le débit des rivières, le niveau des nappes, les
assecs, l'humidité des sols. Chacun peut répondre trois choses — une mesure, « je n'ai rien pour cet
endroit », ou rien du tout parce qu'il est en panne.

Le problème, c'est que le code confondait les deux dernières. Et cette confusion n'est pas neutre :
elle penche toujours du même côté. « Pas de donnée » se lit comme « rien à signaler », donc comme
« tout va bien ». Un service en panne devenait donc, à l'écran, une rivière en bonne santé. C'est
l'erreur la plus dangereuse possible pour un outil dont le seul métier est d'alerter.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Hub'Eau** | Le portail public français qui expose les mesures d'eau (débits, nappes, prélèvements) sous forme d'API |
| **VigiEau** | Le service officiel des restrictions d'eau en vigueur, commune par commune |
| **Onde** | Un réseau d'observateurs qui notent si de petits cours d'eau sont à sec, de mai à septembre |
| **BNPE** | La banque des prélèvements en eau : qui pompe combien, par commune |
| **SWI** | *Soil Wetness Index*, l'indice d'humidité des sols publié par Météo-France |
| **Station muette** | Une station qui existe, qu'on a réussi à interroger, et qui n'a pas de mesure récente |
| **Service injoignable** | Le serveur n'a pas répondu. On ne sait **rien**, pas même s'il y a une mesure |
| **Échec silencieux** | Un programme qui échoue sans le dire : il renvoie une liste vide ou « tout va bien » |
| **Type somme (union)** | Un type qui vaut « ceci **ou** cela », par exemple `Résultat \| null \| "erreur"` |
| **Mémoïser** | Retenir un résultat pour ne pas le recalculer. Piège : si on mémoïse une erreur, elle devient permanente |
| **Egress bloqué** | Dans notre environnement de développement, les appels réseau sortants sont interdits |
| **Serveur bouchon (stub)** | Un faux serveur local qu'on écrit soi-même pour simuler les réponses du vrai |

### 7.3 Comment le code s'y prend

**Le cas d'école : deux `null` qui ne voulaient pas dire la même chose.**

Dans `lib/hubeau.ts`, chaque station est interrogée par une « sonde ». Cette sonde renvoie `null`
**uniquement** quand l'appel réseau a échoué. Si l'appel réussit et que la station n'a rien, elle
renvoie un objet avec `available: false`. La distinction existait donc déjà, proprement, dans les
types. Elle était perdue à cette ligne :

```ts
// lib/hubeau.ts — AVANT
candidates.forEach((c, i) => {
  const p = flowResults[i];
  if (p) probes.set(c.code, p);   // ← le null (= panne) part à la poubelle
});
```

Une fois le `null` jeté, plus bas :

```ts
available: probe?.available ?? false,   // pas de sonde ⇒ false, comme une station muette
```

Les deux cas deviennent le même objet. Le correctif ne change pas la logique, il **garde ce qui était
jeté** :

```ts
// lib/hubeau.ts — APRÈS
// A null probe means the series call FAILED — not that the station is quiet.
const failed = new Set<string>();
candidates.forEach((c, i) => {
  const p = flowResults[i];
  if (p) probes.set(c.code, p);
  else failed.add(c.code);
});
```

et, au moment de dire qu'on n'a rien à offrir, il regarde **pourquoi** :

```ts
function noSelection(stations, emptyMessage, failedCount): IndicatorsPayload {
  if (failedCount === 0) return { stations, message: emptyMessage };   // vrai silence
  return {
    stations,
    serviceDegraded: true,
    message: failedCount >= stations.length
      ? "Service Hub'Eau injoignable : aucune station proche n'a pu être interrogée. " +
        "L'absence de donnée n'est pas un constat sur la ressource."
      : `${emptyMessage} Attention : ${failedCount} station(s) sur ${stations.length} …`,
  };
}
```

**Le trajet jusqu'au score.** Le drapeau doit voyager, sinon il meurt dans le panneau qui l'affiche.
Il traverse trois étages : le composant qui charge (`SiteIndicators`) le convertit en une **raison**,
la page (`HomeClient`) la range dans un état, et le score la reçoit. Une subtilité vaut d'être
comprise, parce qu'elle explique une décision qui paraît maladroite :

```ts
// components/HomeClient.tsx
const [indicatorsInjoignables, setIndicatorsInjoignables] = useState<{…}>({});
```

Pourquoi un état **à côté** plutôt qu'une troisième valeur dans `indicators` ? Parce que dans
`indicators`, `undefined` et `null` sont **déjà pris** et veulent dire des choses différentes :
`undefined` = « la réponse n'est pas encore arrivée » (c'est le correctif du Sprint 35, sans lequel la
page affirmait puis se dédisait), `null` = « la réponse est arrivée, il n'y a rien ». Ajouter une
troisième valeur dans le même champ aurait cassé cette distinction-là pour en gagner une autre.

Enfin, le score. Le point important est **ce qui ne change pas** :

```ts
// lib/score.ts
detail: input?.trend ? undefined
  : unreachable ? "service injoignable — non mesuré, pas « pas de risque »"
  : "donnée indisponible",
```

Le `score` de la composante reste `undefined` dans les deux cas, donc elle reste **exclue** de la
moyenne pondérée. On ne fabrique aucun chiffre. Seul le texte change — et le test l'exige :

```ts
check("panne: le score chiffré est identique (aucune composante inventée)",
  outageScore.score === quiet.score);
```

**Le bug sans réseau.** Celui-ci tient en trois caractères :

```ts
// AVANT — components/HomeClient.tsx
const worst = Math.max(0, ...codes.map((c) => body.zones[c]?.joursAlertePlus ?? 0));
```

`codes` = les zones qui couvrent le site. `body.zones` = celles que l'archive a su retrouver. Le
`?? 0` **à l'intérieur du map** fait qu'une zone introuvable pèse « 0 jour de restriction » dans le
maximum. Si la seule zone du site est introuvable, le résultat est `0` — un chiffre affirmatif, lu
comme « ce site n'a jamais été restreint ». Le correctif exclut au lieu de remplacer :

```ts
const matched = codes.map((c) => body.zones[c]?.joursAlertePlus).filter((v) => v !== undefined);
setJoursAlertePlus(matched.length > 0 ? Math.max(0, ...matched) : undefined);
```

`undefined` déclenche alors les chemins « non estimé » qui existaient déjà.

**Le bug de dix caractères.** Dans `lib/sites.ts` :

```ts
try {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
  window.dispatchEvent(new Event("hydrovigie:sites"));   // ← jamais atteint si setItem lève
} catch { /* fail silently */ }
```

`dispatchEvent` est le **seul** mécanisme qui rafraîchit la liste à l'écran. Si `setItem` échoue
(stockage plein, navigation privée), l'événement ne part pas : le bouton « Ajouter à mes sites » ne
fait **rien**, sans erreur. Le correctif déplace l'événement dans un `finally` et fait remonter un
booléen que l'appelant doit afficher.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Pourquoi une chaîne `"service-error"` plutôt qu'une exception ?** Une exception aurait obligé chaque
appelant à l'attraper, et un `catch` oublié aurait produit une page 500 là où l'ancien code affichait
au moins quelque chose. Le type somme (`Résultat | null | "service-error"`) force TypeScript à
**refuser de compiler** tant que le troisième cas n'est pas traité. Le compilateur remplace la
discipline humaine — c'est exactement ce que l'agent `type-design-analyzer` importé le matin cherche à
faire faire aux types.

**Pourquoi ne pas exclure la composante injoignable du calcul de couverture ?** Tentant : « on n'a pas
pu mesurer, ne comptons pas cette composante ». Mais la couverture sert à dire *à quel point le score
est fondé* — masquer un trou le rendrait meilleur qu'il n'est. La couverture baisse donc, comme avant,
et c'est le **libellé** qui explique pourquoi.

**Pourquoi faire échouer les scripts de build, au risque de casser la CI ?** C'est le compromis
central de la session. Un script qui sort en code 0 après avoir tout jeté produit un commit vert avec
un jeu de données vide, et la panne se manifeste des semaines plus tard sous la forme d'une
fonctionnalité qui **paraît vide plutôt que cassée**. Une CI rouge est bruyante ; une CI verte qui
ment est indétectable. Le prix à payer est réel et il faut le savoir : au prochain changement de
schéma chez data.gouv, le job rougira.

**Pourquoi un serveur bouchon plutôt qu'un simple test unitaire ?** Parce que la fonction fautive
(`assemble`) n'est pas exportée, et surtout parce que le bug vivait dans l'**enchaînement** :
référentiel qui répond, séries qui échouent. Un test unitaire sur `assemble` aurait vérifié ma
correction ; le bouchon vérifie le **chemin réel**, en faisant vraiment échouer des requêtes HTTP.
`HUBEAU_BASE_URL` était déjà surchargeable « pour les tests » — la porte existait, personne ne l'avait
franchie.

### 7.5 Pour expérimenter soi-même

**1 — Voir la distinction apparaître.** Le test bouchon fait tourner les deux scénarios côte à côte :

```bash
npx tsx scripts/test/hubeau-degrade.test.ts
```

Ouvrir ensuite le fichier et remplacer, dans le serveur bouchon, `res.writeHead(503, …)` par
`res.writeHead(200, …)` avec `{ data: [] }`. La panne devient un silence réel : les assertions
`serviceDegraded` échouent. C'est la démonstration que le test teste bien ce qu'il prétend.

**2 — Casser un test pour voir ce qu'il protège** (l'exercice le plus rapide pour comprendre) :

```bash
npx tsx scripts/test/score-indisponible.test.ts   # 18 PASS
```

Ouvrir `lib/score.ts` et supprimer le paramètre `unreachable` du ternaire, pour revenir à
`detail: "donnée indisponible"` dans tous les cas. Relancer : **six assertions tombent**, dont
`panne: le détail diffère du silence — c'est tout l'objet du correctif`. Ce que le test protège n'est
pas un calcul, c'est **une phrase** — et c'est justement parce qu'aucun test ne gardait les phrases
que ces bugs ont vécu si longtemps.

Variante plus instructive encore : garder le libellé mais faire entrer la composante injoignable dans
la moyenne avec un score de `0`. Le test `panne: le score chiffré est identique` tombe, et il tombe
avec un message qui dit exactement pourquoi c'est interdit : un `0` en risque hydrique signifie
« aucun risque », c'est l'affirmation la plus forte que l'outil puisse faire — sur une mesure qu'il
n'a jamais obtenue.

**3 — Réintroduire le bug des trois caractères.** Dans `components/HomeClient.tsx`, remettre le
`?? 0` :

```ts
const worst = Math.max(0, ...codes.map((c) => body.zones[c]?.joursAlertePlus ?? 0));
```

Aucun test ne tombe — il n'y en a pas sur ce chemin. C'est le meilleur argument en faveur du point 4
du §4 : ce bug a survécu parce qu'il était **dans un composant React, pas dans une fonction pure**, et
que ce dépôt teste très bien les secondes.
