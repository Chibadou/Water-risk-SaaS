# Compte rendu — scénarios de politique publique, décomposition de variance, import par lot (Sprint 46)

**Date** : 2026-08-11 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 46

---

## 1. La question initiale

> « lance tous les sprints (incluant les comptes rendus). on tranchera à la fin si il reste des points
> en suspend »

**Ce que j'ai compris pour ce sprint** : le second axe de scénario (politique publique) qui n'existait pas,
la décomposition de variance de §6.4, la convention de prudence étiquetée de §6.3, et l'import par lot de
50 à 500 adresses — le « blocage n°1 du produit » du HANDBOOK §5 depuis le Sprint 26.

**Ce que je n'ai pas fait, et il faut le dire ici plutôt qu'en §3** :

- **narraTRACC par secteur hydrographique** : ni relu dans la collection énumérée au Sprint 22, ni sondé.
  Les scénarios livrés consomment les narratifs Explore2 **par commune**, déjà embarqués. C'est un manque,
  pas une équivalence — la note demande explicitement les 187 secteurs hydrographiques.
- **Le seuil de matérialité du classement** : il demande de décider ce qui est matériel pour un client
  donné, ce qui est un arbitrage produit non tranché.

---

## 2. Ce qui a été réalisé

**En une phrase** : le volume non prélevable d'un site peut désormais bouger **sans un jour sec de plus**,
parce que la politique publique est devenue un axe de scénario ; et une entreprise de 80 sites peut enfin
charger un fichier.

**Dans les grandes lignes** :

- **`lib/scenarios.ts`** croise deux axes : les narratifs hydro-climatiques (qui agissent sur les
  **jours**) et les scénarios de politique publique (qui agissent sur **V_ref lui-même**). Un test le
  démontre : à jours de restriction **identiques**, les trois scénarios donnent trois VNP différents.
- **Trois scénarios, chacun disant ce qu'il suppose.** Deux des trois portent `source: "aucun"` : le
  −25 % « ZRE généralisée » est une **borne construite pour encadrer** qu'aucun instrument n'annonce, et le
  statu quo est une référence explicitement pas le cas le plus probable.
- **La décomposition de variance est testée, pas affirmée.** Chacun des trois termes reçoit son propre cas
  de test où il est construit pour dominer, et la décomposition doit le nommer. Quand c'est le terme
  hydro-climatique qui domine, le module écrit que l'hypothèse de §6.4 **n'est pas vérifiée**.
- **§6.3 : jamais un chiffre nu.** `restituerN3` ne rend rien sans intervalle **et** étiquette de scénario,
  et chaque convention porte l'usage à ne **pas** en faire.
- **`lib/importLot.ts` + `components/ImportLot.tsx`** : le blocage n°1 est levé. **Trois seaux et non
  deux** — importable, **à arbitrer**, échec — parce qu'un géocodage silencieusement faux est pire qu'un
  géocodage manquant.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/scenarios.ts` | **neuf** | Deux axes croisés, décomposition de variance, convention de prudence, ρ moyen. |
| `lib/importLot.ts` | **neuf** | Parseur CSV, règles d'acceptation, rapport par ligne, export CSV du rapport. |
| `components/ImportLot.tsx` | **neuf** | L'écran d'import : progression, verdicts, détail par ligne, journal. |
| `lib/sites.ts` | modifié | `addSites` : ajout en lot avec génération d'`id` et déduplication intra-lot. |
| `components/SitesDashboard.tsx` | modifié | L'import en tête du tableau de bord ; « Importer » devient « Importer (JSON) ». |
| `scripts/test/n3.test.ts` | **neuf** | 63 assertions, puis 67 avec le correctif des colonnes jetées. |

**Chiffres mesurés** :

- VNP de crise sur 60 jours à ρ = 1 avec V_ref = 365 000 m³/an : **60 000 m³** au statu quo,
  **54 000 m³** sous Plan Eau (−10 %). Mêmes jours.
- Décomposition : les trois termes somment à 1, et le terme dominant change selon le cas construit.
- Import : sur un CSV de quatre lignes (une propre, une ambiguë, une introuvable, une sans adresse),
  **un seul site** est proposé à la création.

---

## 3. Erreurs potentielles

### Deux défauts trouvés en branchant, tous deux silencieux

**Le premier aurait annoncé un succès en n'écrivant rien.** `importSites` du hook filtre par
`isValidSite`, qui **exige un `id`** — or une ligne de CSV n'en a pas. L'import aurait écrit **zéro site en
rapportant un succès**, parce que « rien de nouveau à ajouter » et « tout a été rejeté » rendent tous deux
`0` dans cette fonction.

Corrigé par une fonction dédiée `addSites`, qui génère l'`id` **de la même façon qu'`addSite`** — pour que
les deux chemins ne produisent pas des clés différentes pour les mêmes coordonnées — et qui déduplique
aussi **à l'intérieur du lot**, parce qu'un CSV liste couramment deux fois la même adresse.

Ce qui l'a attrapé : une vérification e2e qui lit `localStorage` **après** le clic, plutôt que de se
contenter du message affiché.

**Le second était dans la vérification elle-même.** Le stub de géocodeur filtrait sur le **libellé** de la
ligne (« Site Ambigu »), alors que le géocodeur ne reçoit jamais que l'**adresse assemblée** (« 3 rue X
34000 Montpellier »). Le cas ambigu tombait donc dans « aucun résultat », et trois vérifications passaient
pour la mauvaise raison. **Un bouchon dont la clé n'est pas celle du code testé teste le bouchon.**

### Les deux seuils de l'import sont des jugements, pas des mesures

`SEUIL_SCORE_ACCEPTE = 0,6` et `ECART_AMBIGUITE = 0,05` n'ont **pas** été calibrés sur un échantillon
annoté — il n'en existe pas, et le bac à sable ne permet pas d'en construire un. Ils sont délibérément
prudents : le coût d'une ligne de plus à arbitrer est un clic, le coût d'un géocodage faux accepté est une
réponse fausse que personne ne remarque.

Le journal de l'import le dit à l'utilisateur, et c'est le premier nombre à vérifier quand un vrai
échantillon existera.

### La décomposition de variance n'a jamais tourné sur un site réel

Les trois cas de test sont **construits** pour qu'un terme donné domine. Ça démontre que la décomposition
sait nommer le terme dominant ; ça ne dit rien de ce qu'elle nommerait sur un vrai site.

Or c'est précisément là que réside l'intérêt : §6.4 pose comme **hypothèse à tester** que les termes
décisionnel et traductionnel dominent le terme hydro-climatique à l'horizon 2050 et à l'échelle du site. Si
c'est vrai, mieux typer les arrêtés rapporte plus qu'améliorer les projections — une conclusion de pilotage
produit. **Cette hypothèse n'est pas testée par ce sprint** ; l'outil pour la tester l'est.

### Hypothèses qui pourraient ne pas tenir

- **Le facteur −10 % du Plan Eau est appliqué uniformément** aux volumes autorisés. La répartition réelle
  entre usages et territoires n'est pas arrêtée, et un secteur peut porter bien plus que 10 %. Le scénario
  le dit dans son champ `hypothese`.
- **Le −25 % « ZRE généralisée » est une borne que j'ai construite.** Aucun instrument publié ne l'annonce.
  C'est écrit dans `source`, et c'est le genre de chiffre qu'on retrouve cité hors contexte.
- **Le terme traductionnel est calculé en supposant le VNP linéaire en ρ**, ce qui est vrai dans la formule
  actuelle mais ne le resterait pas si une réponse `threshold` intervenait.
- **La décomposition utilise la médiane q50 de chaque narratif** pour construire une cellule ; l'étalement
  vient d'avoir plusieurs narratifs, pas d'élargir un seul. Un choix, pas une nécessité.
- **`MAX_LIGNES = 500`** est le plafond de la note. Au-delà, le fichier est tronqué **et le message le
  dit** — ce qui est le minimum : importer silencieusement 500 lignes sur 800 serait le pire résultat,
  puisque l'utilisateur n'a aucune raison de regarder.

### Ce qui casserait si une source amont changeait

- **Le géocodage passe par `/api/geocode` ligne par ligne**, pas par l'endpoint batch de la BAN. Si la
  route changeait sa forme de réponse, tous les scores tomberaient à `0` — donc tout deviendrait
  « à arbitrer ». C'est la bonne direction de défaillance, obtenue par un `?? 0` délibéré plutôt que
  `?? 1` : une réponse sans score est traitée comme la **plus faible possible**.
- **500 requêtes séquentielles par vagues de 5** n'a jamais été mesuré contre la vraie BAN. Si c'est trop
  lent, l'endpoint batch est l'optimisation, et il se glisse derrière le même rapport.

---

## 4. Points d'amélioration

**Dette assumée** :

- **narraTRACC absent** (voir §1). Les scénarios climatiques restent par commune.
- **Le géocodage ligne par ligne** au lieu de l'endpoint batch. Justifié par l'impossibilité de tester un
  POST multipart depuis le bac à sable, et par le fait que la route existante est éprouvée.
- **Les lignes à arbitrer ne sont pas arbitrables dans l'interface.** L'utilisateur doit corriger son
  fichier et relancer, ou ajouter le site à la main. Une interface de choix parmi les candidats serait
  mieux ; ce n'est pas ce sprint.

**Corrigé en rédigeant ce compte rendu** :

- ⚠️ **Le volume et le coût journalier étaient lus, annoncés comme reconnus, puis JETÉS à la création.**
  Trouvé en écrivant le §4 : un import qui écarte silencieusement la moitié de ce que l'utilisateur a fourni
  est un échec plus grave qu'un import qui refuse la colonne. Corrigé, avec `lireNombre` qui tolère le
  format français — « 365 000 » (espace insécable fine) et « 1 200,50 € » (virgule décimale). `Number()`
  sur l'un ou l'autre rend `NaN`, et un `NaN` devient silencieusement « non déclaré » : l'utilisateur qui
  avait rempli la colonne se serait fait dire qu'elle manque. Une cellule illisible rend `undefined`,
  jamais 0.

**À reprendre** :

- **Tous les sites importés reçoivent `profil: "entreprise"`.** Raisonnable pour un parc professionnel,
  arbitraire quand même — et ce n'est pas cosmétique : le profil décide quels drapeaux d'audience VigiEau
  s'appliquent. Il n'y a pas de colonne pour ça, parce que deviner un secteur depuis un libellé serait pire.
- **La décomposition de variance n'est branchée nulle part dans l'interface.** Elle est calculable et
  invisible.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — commit
  « Sprint 46: the policy scenario axis, variance decomposition, and batch CSV import ».
- **`main` touché ?** : **NON**.
- **Pull request ?** : **NON**.
- **Déployé en prod ?** : **NON**, et non regardé.
- **Vérifications** : build clean · lint clean · **30 suites** vertes · **114/114** e2e dont 12 neuves.

---

## 6. Prochaines étapes

1. **Brancher la décomposition de variance sur la fiche site.** *Verrou* : décider où — c'est un chiffre
   de pilotage, pas un chiffre d'exploitation, et sa place n'est pas évidente.
3. **Calibrer les deux seuils de l'import** sur un échantillon annoté. *Verrou* : construire l'échantillon,
   ce qui demande l'egress et un jugement humain sur chaque ligne.
4. **Instruire narraTRACC** : relire la collection du Sprint 22 avant de sonder. *Verrou* : egress.
5. **Une interface d'arbitrage des lignes ambiguës.** *Verrou* : aucun, c'est du travail d'interface.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

**Deux problèmes sans rapport, réunis dans un sprint parce que la note les met au même chantier.**

*Le premier.* Jusqu'ici, tout ce que l'outil projetait en 2050 venait du climat : il fera plus sec, les
périodes de basses eaux s'allongeront, il y aura plus de jours de restriction. C'est incomplet, et d'une
façon qui saute aux yeux dès qu'on la nomme.

Le volume qu'une usine a le **droit** de prélever est fixé par une autorisation administrative. Cette
autorisation peut baisser sans qu'il ne pleuve un millimètre de moins — le Plan Eau français programme
déjà −10 % de prélèvements pour 2030. Une usine peut donc voir son volume non prélevable augmenter **sans
un seul jour sec supplémentaire**.

Il fallait donc un second axe de scénario, qui agit non pas sur les jours mais sur le volume de référence
lui-même. Et une fois qu'on a deux axes, une question nouvelle devient calculable : **lequel des deux
compte le plus ?** La note fait de la réponse une hypothèse à tester, avec une conséquence pratique : si
c'est l'axe réglementaire qui domine, alors mieux lire les arrêtés rapporte plus que mieux prévoir le
climat.

*Le second.* L'outil ne permettait d'ajouter qu'un site à la fois. Une entreprise de 80 sites ne pouvait
pas s'en servir — c'était écrit « blocage n°1 du produit » dans les notes du dépôt depuis vingt sprints.

Et l'import a un piège particulier. Le réflexe serait de géocoder chaque ligne et de créer les sites.
Mais un géocodage **faux** ne ressemble pas à une erreur : une adresse mal reconnue tombe à 40 km, reçoit
une zone d'alerte plausible, un niveau plausible, et produit une réponse entièrement fausse que rien ne
distingue d'une bonne. Une adresse qui **échoue**, elle, est visible et se corrige. **Un géocodage
silencieusement faux est donc pire qu'un géocodage manquant** — et toute l'architecture de l'import découle
de cette phrase.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **V_ref** | Volume de référence : le prélèvement annuel sur lequel les pourcentages s'appliquent. |
| **VNP** | Volume non prélevable, en m³/an. |
| **ρ (rho)** | Fraction du prélèvement qu'une mesure d'arrêté empêche. Un **intervalle** quand le texte n'est pas chiffrable. |
| **N3** | Le niveau de preuve « scénarisé » : conditionnel à un scénario, jamais une prévision. |
| **Narratif climatique** | Un scénario hydro-climatique publié (ici Explore2), rendu en quantiles q05/q50/q95. |
| **Décomposition de variance** | Répartir l'étalement d'un résultat entre les sources d'incertitude qui le causent. |
| **ZRE** | Zone de répartition des eaux : classement qui révise à la baisse les volumes prélevables. |
| **Quantile** | La valeur en dessous de laquelle tombe une proportion donnée des cas. |
| **Géocodage** | Transformer une adresse écrite en coordonnées. |
| **BAN** | Base Adresse Nationale, le référentiel français. Ne contient que des adresses françaises. |
| **BOM** | Trois octets invisibles qu'Excel place en tête d'un CSV et qui corrompent le premier en-tête. |
| **Code INSEE** | Identifiant de commune française. Sa présence prouve qu'une adresse est française. |

### 7.3 Comment le code s'y prend

**Étape 1 — le second axe agit sur V_ref, jamais sur les jours.** La distinction est structurelle :

```ts
// lib/scenarios.ts
// Everything the repo had was hydro-climatic: Explore2 narratives change the flow,
// and the model turns that into days. But the volume a site is ALLOWED to withdraw
// is set by policy, and policy moves independently of the climate…
// A public-policy scenario therefore modifies **V_ref itself**, not the days.
```

Et le test le démontre en isolant chaque axe :

```ts
check("policy: every cell shares the same day total — the climate axis is fixed",
  new Set(cellules.map((c) => c.joursTotal)).size === 1);
check("policy: … yet the VNP differs across them, with no extra dry day",
  new Set(cellules.map((c) => Math.round(c.vnpM3))).size === 3);
```

**Étape 2 — chaque coefficient dit ce qu'il suppose.** Un exemple, et c'est le plus fragile des trois :

```ts
{
  id: "zre_generalisee",
  facteurVref: 0.75,
  hypothese:
    "… ⚠️ Le −25 % est une BORNE plausible construite pour " +
    "encadrer, pas une valeur publiée : aucun instrument ne l'annonce.",
  source: "aucun — borne haute construite à partir des révisions ZRE observées",
},
```

Un test exige que chaque scénario ait une hypothèse d'au moins 60 caractères. C'est grossier et efficace :
un coefficient nu est un chiffre que quelqu'un citera hors contexte.

**Étape 3 — croiser les axes plutôt que choisir des « storylines ».** Un détail qui décide de tout :

```ts
// ⚠️ Deliberately a CROSS and not a list of "storylines". Crossing them is what
// makes the decomposition below possible: with a handful of hand-picked combined
// storylines there is no way to tell which axis carries the spread…
```

**Étape 4 — la décomposition, et le terme qui n'est pas un axe.** Les deux premiers termes sont la variance
des moyennes de cellules le long de chaque axe. Le troisième est différent :

```ts
hypotheses.push(
  "Le terme traductionnel est calculé à narratif ET politique fixés : c'est l'écart que le MÊME " +
    "arrêté produit selon la lecture de ses mesures non chiffrées. Ce n'est pas un axe de " +
    "scénario, c'est la largeur de ce qu'on n'a pas su lire.",
);
```

**Étape 5 — la décomposition dit quand la note a tort.** C'est le point le plus important de ce sprint :

```ts
hypotheses.push(
  hypotheseVerifiee
    ? `✅ L'hypothèse de §6.4 est VÉRIFIÉE sur ce site : le terme ${dominante} domine. …`
    : "⚠️ L'hypothèse de §6.4 n'est PAS vérifiée sur ce site : c'est le terme hydro-climatique " +
      "qui domine. Améliorer les projections y rapporterait plus que mieux typer les arrêtés — " +
      "l'inverse de ce que la note anticipe, et donc un résultat à regarder de près plutôt qu'à " +
      "écarter.",
);
```

Et les tests construisent **les trois cas**, un par terme dominant. Une décomposition qui confirmerait
toujours la note ne serait pas une mesure, ce serait une paraphrase.

**Étape 6 — jamais un chiffre nu (§6.3).** Chaque convention porte l'usage à ne pas en faire :

```ts
detail:
  input.convention === "mediane"
    ? "Médiane des scénarios croisés — convention de reporting. ⚠️ À NE PAS utiliser pour " +
      "dimensionner un stockage : la moitié des scénarios la dépassent."
    : "Quantile 90 % des scénarios croisés — convention de dimensionnement. ⚠️ À NE PAS " +
      "publier comme une valeur attendue : c'est une borne haute assumée.",
```

Publier la médiane à quelqu'un qui va couler du béton est l'erreur coûteuse ; publier le quantile 90 % dans
un rapport annuel est l'erreur inverse. Les deux se produisent en donnant « le chiffre » sans sa convention.

**Étape 7 — découper un CSV français à la main, et pourquoi.**

```ts
// ⚠️ Written rather than imported because the failure mode matters more than the
// feature set: a French address routinely contains a comma ("12, rue de la Paix"),
// and a naive `split(",")` shifts every following column by one. The row then
// geocodes to something plausible with the postcode in the city column — the exact
// silent-wrongness this file exists to prevent.
```

Trois pièges, chacun testé, et **aucun ne produit d'erreur** :

- la virgule dans une adresse citée — décale les colonnes ;
- le point-virgule des exports Excel français, imposé par la virgule décimale — donne une seule colonne ;
- le BOM d'Excel — corrompt **le premier en-tête seulement**, donc `label` cesse de correspondre, et tous
  les sites s'appellent « Ligne N » sans autre symptôme.

**Étape 8 — l'ambiguïté n'est pas résolue.** La règle avec des dents :

```ts
if (second && premier.score - second.score < ECART_AMBIGUITE) {
  return {
    ...base,
    verdict: "ambigu",
    candidats: tries.slice(0, 5),
    message:
      `Deux adresses également plausibles (…) : « ${premier.label} » et « ${second.label} ». ` +
      "L'outil ne choisit pas — retenir la première serait tirer au sort.",
  };
}
```

Un score de 0,92 contre 0,91 : les deux sont indiscernables. Prendre le premier serait un tirage au sort
présenté comme un résultat. Le rapport rend les deux candidats et compte la ligne dans un **troisième
seau** — ni importée, ni écartée.

**Étape 9 — la défaillance dans le bon sens.** Un `??` qui compte :

```tsx
// ⚠️ `?? 0` and not `?? 1`: a BAN answer with no score is treated as
// the WEAKEST possible, so it lands in "à arbitrer" rather than
// being accepted. Defaulting to 1 would auto-accept exactly the
// answers we know least about.
score: r.score ?? 0,
```

### 7.4 Pourquoi ces choix plutôt que d'autres

**Trois seaux plutôt que deux.** Le réflexe est « ça a marché / ça a échoué ». Insuffisant : la catégorie
dangereuse n'est ni l'une ni l'autre, c'est **« ça a l'air d'avoir marché »**. Un troisième seau la sort du
lot. Le coût est réel — l'utilisateur a du travail à faire — et c'est exactement le point : ce travail
existait déjà, il était juste invisible.

**Le géocodage ligne par ligne plutôt que l'endpoint batch.** La BAN offre un endpoint batch (POST
multipart, réponse CSV) qui serait plus rapide et plus poli. Deux raisons de ne pas l'utiliser
aujourd'hui : il est **impossible à exercer depuis le bac à sable**, donc j'aurais livré du code non
vérifié sur le chemin critique ; et la route par ligne existe et est éprouvée. Le batch reste
l'optimisation, et il se glisse derrière le **même rapport** — c'est ce que le rapport, comme frontière,
rend possible.

**Croiser les axes plutôt que composer des récits.** Le GIEC et les exercices de scénarios travaillent
souvent en « storylines » : des combinaisons cohérentes choisies à la main. C'est meilleur pour raconter et
inutilisable pour décomposer : avec cinq récits combinés, on ne peut pas dire quel axe porte l'étalement.
Le croisement est moins élégant et répond à la question.

**Faire dire à la décomposition que la note peut avoir tort.** L'alternative aurait été d'affirmer §6.4 —
la note est la référence, après tout. Refusé : la note elle-même la formule comme une **hypothèse à
tester**, et un module qui la confirmerait toujours ne testerait rien. Le cas « pas vérifiée » a donc son
propre message, avec la conclusion inverse.

**Une fonction `addSites` distincte plutôt que réutiliser `importSites`.** Réutiliser était tentant : la
fonction existe, elle prend une liste, elle rend un compte. Elle exige un `id` que le CSV n'a pas, et elle
rend `0` aussi bien pour « rien de nouveau » que pour « tout rejeté ». Une fonction qui ne peut pas
distinguer le succès de l'échec ne doit pas porter un chemin d'écriture.

### 7.5 Pour expérimenter soi-même

**Expérience A — faire dominer chaque terme à tour de rôle.**

```
npx tsx scripts/test/n3.test.ts
```

Puis dans `lib/scenarios.ts`, forcez le verdict :

```ts
const dominante = "hydroClimatique"; // au lieu du reduce
```

**Quatre** assertions tombent (mesuré) :

```
FAIL variance: with one narrative and three policies, the decisional term dominates
FAIL variance: … and §6.4's hypothesis is verified
FAIL variance: … with the steering conclusion spelled out
FAIL variance: with a fully unquantified ρ, the translational term dominates
```

Ce qu'il faut regarder, c'est **laquelle ne tombe pas** : le cas « climat dominant » continue de passer,
puisqu'il attend justement ce verdict. Un test unique aurait donc validé une fonction qui répond toujours la
même chose. C'est pour cette raison qu'il y a **trois** cas construits, un par terme — et les deux cas qui
tombent ici sont exactement ceux que le cas unique aurait manqués.

**Expérience B — remettre un découpage CSV naïf, et voir une adresse française se décaler.**

Dans `lib/importLot.ts`, remplacez `decouperLigneCsv` par un `split` :

```ts
export function decouperLigneCsv(ligne: string, separateur: string): string[] {
  return ligne.split(separateur).map((v) => v.trim());
}
```

Lancez `npx tsx scripts/test/n3.test.ts`. **Trois** assertions tombent (mesuré) :

```
FAIL csv: a comma inside a quoted field does not split it
FAIL csv: doubled quotes are unescaped
FAIL csv: the address is assembled from the columns present
```

La troisième est la plus parlante : elle ne parle pas de découpage, elle constate que l'**adresse assemblée
est fausse** — c'est-à-dire que ce qui part au géocodeur n'est pas ce que l'utilisateur a écrit. Puis
regardez ce que ça produit concrètement. La ligne
`Usine A;"12, rue de la Paix";28000;Chartres` découpée à la virgule donnerait quatre champs dont
`"12` et ` rue de la Paix";28000;Chartres`. Le géocodeur recevrait une adresse tronquée — et
**il rendrait quelque chose**, parce qu'un géocodeur rend toujours quelque chose. C'est ça, un géocodage
silencieusement faux.

**Expérience C — accepter les réponses sans score, et voir le garde-fou disparaître.**

Dans `components/ImportLot.tsx`, remplacez `score: r.score ?? 0` par `score: r.score ?? 1`.

Reconstruisez et relancez la suite e2e :

```
npm run build && npx next start -p 3300 &
BASE=http://localhost:3300 node scripts/test/e2e.mjs
```

Rien ne tombe — parce que le stub fournit toujours un score. **C'est le trou de l'expérience, et c'est
volontaire de le montrer** : ce `?? 0` protège contre un comportement de la BAN réelle (une réponse sans
score) que le bouchon ne reproduit pas. Aucun test ne le couvre, et le seul garde-fou est le commentaire
qui explique pourquoi ce n'est pas `?? 1`.

**Expérience D — vérifier que l'import écrit vraiment.**

Retirez la fonction `addSites` de `lib/sites.ts` et rebranchez `importSites` dans `SitesDashboard` :

```tsx
<ImportLot onImport={importSites} />
```

TypeScript se plaindra du type ; forcez avec un `as never` pour reproduire l'état initial. Reconstruisez,
relancez l'e2e :

```
FAIL import: the site is actually written to storage, with a generated id
```

L'interface, elle, affichera **« 0 site enregistré »** sans erreur ni avertissement. C'est exactement le
défaut décrit en §3, et la seule chose qui l'attrape est une assertion qui lit `localStorage` au lieu de
croire le message à l'écran.
