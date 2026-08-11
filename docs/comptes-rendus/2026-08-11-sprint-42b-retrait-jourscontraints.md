# Compte rendu — retrait de `joursContraints` (Sprint 42b)

**Date** : 2026-08-11 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 42b

---

## 1. La question initiale

> « lance tous les sprints (incluant les comptes rendus). on tranchera à la fin si il reste des points
> en suspend »

**Ce que j'ai compris** : enchaîner 42b, 43, 44, 45 et 46 tels que `docs/SPRINTS.md` les spécifie, avec
un compte rendu par sprint, et laisser à l'utilisateur les arbitrages qui subsistent au bout.

Pour le 42b précisément : solder G1 (retrait de `lib/interruption.ts`), G6 (retrait du repli euros sur
le chiffre d'affaires) et G10 (`Dependance` remplacée par la forme de réponse de §4.3).

**Ce que j'ai délibérément laissé de côté**, et pourquoi c'est un écart avec l'énoncé du sprint :

- **Je n'ai pas supprimé `lib/interruption.ts` en bloc**, alors que G1 dit « `interruption.ts`
  disparaît ». Le module faisait deux choses : un mauvais calcul (`jours × exposition ×
  DEPENDANCE_FACTOR`) **et** une machinerie d'horizons — année type, fin de saison, 2050 par
  allongement Explore2 — que `lib/ia.ts` ne remplaçait pas. Le supprimer entier aurait fait
  **disparaître l'horizon 2050 et la fin de saison de la fiche site**. J'ai donc séparé les deux : le
  mauvais calcul est supprimé, la machinerie migre dans `lib/js.ts` en jours purs. Le fichier disparaît
  bien ; ce qui n'a pas disparu, c'est ce qu'il faisait de juste.
- **Les champs de saisie de `profilMensuel`, `tamponM3`, `seuilTechniqueM3` et `paliers`** restent
  absents. `reponse` en a un, parce que le retrait de `Dependance` laissait un trou dans l'interface
  qu'il fallait bien combler.

---

## 2. Ce qui a été réalisé

**En une phrase** : les trois sorties de la note technique sont désormais **les seules** sorties du
produit, et les deux coefficients que j'avais inventés ont disparu de la base.

**Dans les grandes lignes** :

- **`lib/js.ts` (neuf)** reprend les horizons **sans pondération ni coefficient**, et publie un
  **vecteur de jours par niveau** plus un **niveau de preuve** par horizon. Un test miroir lit le
  source du module et échoue si le mot `exposure` y réapparaît : c'est une contrainte de forme, et
  aucun test de valeur ne peut la voir — les deux versions produisent des nombres.
- **`computeIaHorizon` + `scaleEpisodes`** projettent les JEA en **allongeant les épisodes observés**.
  Ce choix vaut **70 % du résultat**, mesuré : sur 54 jours de crise avec une réserve de 10 jours,
  allonger deux épisodes de 20 j en 27 j coûte **17 JEA**, répartir les mêmes 54 jours en épisodes plus
  courts en coûte **10**. Multiplier un total de jours aurait produit le chiffre optimiste sans le dire.
- **`lib/indicateurs.ts` (neuf)** : un point de calcul unique. Avant, la fiche site, la synthèse
  rédigée et le rapport exporté dérivaient chacun sa version des mêmes chiffres — `synthese.ts` avait
  son propre `volume / 365 × jours`. Rien ne garantissait que le PDF et l'écran concordent.
- **`ImpactPanel` remplace `InterruptionPanel`** et devient le **chapitre de preuve** : la ρ lue par
  niveau et par usage, en fourchette, placée **avant** les sorties qu'elle justifie. L'ancien panneau
  mettait un chiffre de tête au-dessus des mesures dont il venait.
- **`Dependance` → réponse de production** dans l'interface, libellée par la machine
  (« Tout ou rien (seuil technique) ») et non par la catégorie, avec « non renseignée » comme défaut.
- **Les euros ne viennent plus que d'un coût journalier déclaré.** Quand des sites manquent au total,
  la phrase du portefeuille **dit combien** — un total partiel lu comme complet est le seul risque du
  retrait.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/js.ts` | **neuf** | Les horizons en jours purs, vecteur par niveau, niveau de preuve N1/N2/N3. |
| `lib/indicateurs.ts` | **neuf** | Calcule JS + VNP + IA une seule fois pour un site. |
| `components/ImpactPanel.tsx` | **neuf** | Le chapitre de preuve : ρ par niveau et par usage, en fourchette. |
| `lib/interruption.ts` | **supprimé** | 422 lignes. Sa machinerie d'horizons survit dans `js.ts`. |
| `components/InterruptionPanel.tsx` | **supprimé** | Remplacé par `ImpactPanel`. |
| `scripts/test/interruption.test.ts` | **supprimé** | Remplacé par `js.test.ts` et `indicateurs.test.ts`. |
| `lib/ia.ts` | modifié | `scaleEpisodes`, `computeIaHorizon`, et le correctif de recharge à écart nul. |
| `lib/portefeuille.ts` | modifié | VNP réel au lieu de `volume × jours / 365` ; JEA au lieu de `joursArretNet` ; les deux coefficients retirés. |
| `lib/executive.ts`, `lib/synthese.ts`, `lib/report.ts` | modifiés | Migrés sur les trois sorties ; §6 du rapport devient trois sous-sections en trois unités. |
| `lib/exposition.ts`, `lib/sites.ts`, `components/AddressSearch.tsx` | modifiés | `REPONSES` remplace `DEPENDANCES`. |
| `scripts/test/js.test.ts`, `indicateurs.test.ts` | **neufs** | 30 et 22 assertions. |
| `scripts/test/ia.test.ts` | modifié | +3 assertions sur l'écart nul, ajoutées en rédigeant ce compte rendu (§7.5, expérience B). |

---

## 3. Erreurs potentielles

### Le défaut réel que le retrait a exposé, et qui a vécu le temps d'une édition

`portefeuille.ts` décodait ses épisodes lui-même et **fusionnait les plages contiguës** de niveaux
différents, avec un commentaire qui disait pourquoi : *une alerte qui durcit en crise ne laisse pas la
cuve se remplir*. `episodesFromPeriodes`, que j'ai substitué, **ne fusionne pas** — le calendrier RLE
stocke deux plages dès que le rang change.

Résultat : la réserve se remplissait **entre les deux moitiés d'une restriction continue**, absorbant
trois jours **deux fois**. Mesuré sur le cas de test : **14 JEA au lieu de 17**.

Le correctif est dans `lib/ia.ts` — un écart nul entre deux épisodes ne remplit rien, quel que soit le
taux de recharge déclaré. Ce qui rend ce défaut instructif : il a été introduit en **supprimant** du
code correct, pas en écrivant du code faux, et la fonction supprimée portait la justification en
commentaire.

### Deux défauts trouvés par les garde-fous, dont un déjà livré une fois

- **`react-hooks/exhaustive-deps`** a signalé que le callback d'export ne déclarait ni `interne`, ni
  `usages`, ni `restrictions`. **C'est exactement la classe de bug livrée au Sprint 42a** : un rapport
  exporté après saisie du volume aurait été calculé sur l'état d'avant, donc **le PDF aurait contredit
  l'écran**. Un avertissement ignoré deux fois est un bug.
- **La vérification de débordement à 390 px** a attrapé le nouveau sélecteur : un `<select>` est
  dimensionné par son **option la plus longue**, et « Par paliers (lignes de production) » le portait à
  278 px, poussant la ligne 90 px au-delà du viewport.

### Une régression assumée, et il faut l'appeler ainsi

**Le JEA exige plus de déclarations que l'ancien `joursArretNet`** : un volume de référence et une ρ
lisible, là où l'ancien se contentait d'`autonomieJours` et d'un calendrier. **Moins de sites obtiennent
un chiffre.** Le contrepoint est réel — l'ancien comptait tout jour restreint au-delà de la réserve
comme un arrêt **total**, donc surestimait en supposant le pire, et il ignorait complètement
l'intensité de la restriction. Mais une entreprise qui voyait une colonne remplie hier verra des tirets
aujourd'hui, et c'est une dégradation de son point de vue.

### Non vérifié en conditions réelles

- **Rien de tout cela n'a tourné sur de vraies données.** Les 114 vérifications e2e tournent sur des
  bouchons. Le facteur 70 % entre allonger et multiplier est calculé sur une série construite.
- **La rupture des noms de colonnes CSV** (`jours_contraints_*` → `jours_sous_arrete_*`, `jea_*`,
  `vnp_crise_m3_*`) est assumée et voulue : un tableur bâti sur les anciens noms ne lira pas
  silencieusement les nouveaux. Personne n'a testé ce que ça fait à un tableur réel.
- **Le paramètre d'URL `dep` n'est pas migré.** Un lien profond ancien perd le réglage. C'est délibéré :
  les quatre valeurs de `Dependance` désignaient un coefficient, pas un comportement, et il n'existe pas
  de traduction honnête vers `linear` / `threshold` / `stepwise`.

### Ce qui casserait si une source amont changeait

- `RestrictionsPayload` retype la charge utile de `/api/restrictions` **à la main**. Si le champ
  `exposureInterval` disparaissait, le VNP de crise et le JEA s'évanouiraient sans erreur de typage.
- Le format RLE `periodes` est lu par `episodesFromPeriodes` sans version ni garde. Un quatrième champ
  inséré en amont décalerait tout — et, comme on vient de le voir, un décalage d'épisodes produit un
  chiffre plausible.

---

## 4. Points d'amélioration

**Dette assumée** :

- **`RestrictionsPayload` retypé à la main.** Le commentaire en place depuis le Sprint 39 explique
  pourquoi c'est un piège. Le corriger relève du chantier de typage des sorties, pas d'ici.
- **Quatre paramètres lus sans champ de saisie.** Le panneau dit lesquels manquent.
- **`portefeuille.ts` recalcule un `computeIa` par site** dans un `useMemo`. Sur un parc de 500 sites
  après l'import par lot du Sprint 46, ça n'a jamais été mesuré.

**À reprendre** :

- **`js.ts` et `vnp.ts` gardaient chacun leur `LEVELS`.** Corrigé au Sprint 44, mais ça montre que le
  découpage en modules a reproduit le problème qu'il devait éviter.
- **`ImpactPanel` a perdu le `PanelSkeleton` sur un des deux chemins** de chargement : quand
  `restrictions === null`, il affiche un refus, ce qui est correct, mais l'état `undefined` et l'état
  `null` se ressemblent visuellement plus qu'ils ne devraient.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — commit
  « Sprint 42b: retire joursContraints for the note's three outputs (G1, G6, G10) ».
- **`main` touché ?** : **NON**.
- **Pull request ?** : **NON** — non demandée.
- **Déployé en prod ?** : **NON**, et **toujours pas regardé**. La prod suit `main`, qui n'a pas bougé.
- **Vérifications** : build clean · lint clean (0 avertissement) · **26 suites** vertes ·
  **88/88** e2e dont 9 neuves. (Les trois assertions ajoutées ensuite à `ia.test.ts` portent la suite
  à 59 ; elles sont incluses dans le commit du Sprint 46.)

---

## 6. Prochaines étapes

1. **Les quatre champs de saisie manquants.** *Verrou* : rédactionnel — nommer un seuil technique en
   m³/jour pour quelqu'un qui ne sait pas ce que c'est.
2. **Mesurer `computePortfolio` sur 500 sites.** *Verrou* : aucun, il faut un jeu de test. Devient
   urgent maintenant que l'import par lot existe.
3. **Importer `RestrictionsPayload` de `lib/restrictions.ts` au lieu de le retyper.** *Verrou* : la
   route API sérialise une forme légèrement différente ; il faut un type de transport partagé.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

L'outil affichait un nombre appelé « jours d'activité contrainte ». Il était calculé comme ceci :

    jours d'arrêté × part d'activité empêchée × un facteur de dépendance

Les deux premiers facteurs sont défendables. Le troisième était un nombre que j'avais inventé : un menu
déroulant à quatre valeurs (« faible / moyenne / forte / critique ») traduites en 0,6 / 1 / 1,4 / 1,8.
Rien ne sourçait ces valeurs. Et il multipliait une **quantité mesurée** — les jours d'arrêté sont
publiés au Journal officiel — par une **opinion**. Trente jours mesurés pouvaient devenir 54.

Pire : le produit s'appelait « des jours ». Un lecteur voyait une unité familière et n'avait aucun moyen
de savoir qu'elle contenait un coefficient.

Ce sprint remplace ce nombre unique par **trois nombres dans trois unités différentes**, et supprime les
deux coefficients inventés (le second était un repli qui transformait un chiffre d'affaires en euros de
perte à 0,5 % par jour).

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **JS** | Jours sous statut. Un décompte de jours passés sous chaque niveau d'arrêté. Les arrêtés étant publiés, c'est un **fait**. |
| **VNP** | Volume non prélevable, en m³/an. Ce que les restrictions empêchent de pomper. |
| **JEA** | Jour-équivalent d'arrêt. Deux jours à 50 % d'empêchement font un JEA. |
| **ρ (rho)** | Fraction du prélèvement qu'une mesure d'arrêté empêche. Vaut un **intervalle** quand le texte n'est pas chiffrable. |
| **Épisode** | Une plage continue de restriction. Sa **durée** compte plus que le total de jours dès qu'une réserve existe. |
| **Convexité en durée** | Avec une cuve, quarante coupures d'un jour ne coûtent presque rien là où deux coupures de vingt jours coûtent presque tout. |
| **RLE** (run-length encoding) | Compression d'un calendrier en triplets `[jour, durée, niveau]`. |
| **Niveau de preuve N1/N2/N3** | Constaté / calibré / scénarisé. Dit **comment** un chiffre a été obtenu. |
| **Test miroir** | Un test qui lit le **texte source** d'un module pour vérifier une contrainte de forme. |
| **Stale closure** | En React, une fonction qui capture une variable et continue de voir son ancienne valeur. |

### 7.3 Comment le code s'y prend

**Étape 1 — séparer le fait du modèle.** L'ancien module mélangeait les deux dans un chiffre. Le
nouveau les sépare en deux modules, et `lib/js.ts` porte l'explication en tête :

```ts
// lib/js.ts
//   1. `DEPENDANCE_FACTOR` (0.6 / 1 / 1.4 / 1.8) was a coefficient I invented.
//      It multiplied a measured quantity by a number nobody could source, and it
//      could push a measured 30 days to 54.
//   2. Weighting days by exposure and then calling the product "days" mixes a
//      fact with a model in one figure that carries neither's error bar.
```

**Étape 2 — un test qui lit le code, parce qu'aucun test de valeur ne peut voir la différence.** Si
`js.ts` remettait une pondération demain, il produirait toujours des nombres, et tous les tests de
valeur passeraient. Donc :

```ts
// scripts/test/js.test.ts
const src = readFileSync("lib/js.ts", "utf-8");
const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
check("shape: the module never reads an exposure", !/\bexposure\b/.test(code));
check("shape: nor a dependence factor", !/DEPENDANCE|dependance/i.test(code));
// Its input type must not even ACCEPT one: an unused field is an invitation.
check("shape: JsInput does not accept an exposure at all", !/exposure\??:/.test(src));
```

Notez le filtre sur les commentaires : le module a le **droit** de nommer ce qu'il a retiré — c'est
ainsi que le retrait reste explicable — mais pas de le lire.

**Étape 3 — projeter en allongeant, pas en multipliant.** C'est la décision la plus lourde du sprint.
Un horizon 2050 qui ajoute 30 % de jours de restriction peut signifier deux choses très différentes :

```ts
// lib/ia.ts
//   - 30 % MORE episodes of the same length — a site with a buffer barely feels it;
//   - the SAME episodes, each 30 % longer — the buffer is overrun in every one.
//
// With a storage buffer the second costs several times the first (§4.3's
// convexity). A projection that multiplies the annual day count picks neither and
// silently produces the first, which is the optimistic one.
```

Et l'argument physique qui tranche : `dtBE_yr`, la variable qu'Explore2 publie, est un **allongement de
la période de basses eaux en jours**. Une période de basses eaux plus longue étire les épisodes qui s'y
trouvent ; elle ne disperse pas de nouveaux épisodes indépendants en hiver. Donc on allonge.

Le chiffre, mesuré : **17 JEA contre 10** sur les mêmes 54 jours. Une différence de 70 %, produite par
un choix de modélisation, pas par une donnée.

**Étape 4 — l'écart nul ne remplit rien.** Le correctif du défaut décrit en §3 :

```ts
// lib/ia.ts
// ⚠️ A gap of ZERO refills nothing, whatever the rate. Two runs that touch
// are one continuous restriction — an alerte hardening into crise on the
// next day — and the tank has had no water to refill from.
if (lastEnd !== undefined) {
  const gap = Math.max(0, ep.startDay - lastEnd);
  if (gap > 0) stock = recharge > 0 ? Math.min(tampon, stock + gap * recharge) : tampon;
}
```

Trois caractères — `if (gap > 0)` — et 3 JEA d'écart sur un cas de test.

**Étape 5 — un point de calcul unique.** `lib/indicateurs.ts` existe pour une raison qui n'est pas le
rangement :

```ts
// lib/indicateurs.ts
// At Sprint 42a the three engines were called from inside the panel that displays
// them. That worked, and it was wrong for one reason: the site report and the
// written synthesis needed the SAME numbers, and each was computing its own —
// `synthese.ts` had its own `volume / 365 × jours` for cubic metres.
```

Un chiffre à l'écran et le même chiffre dans le PDF exporté viennent désormais du même appel. C'est un
**prérequis de l'auditabilité**, pas une question de propreté.

**Étape 6 — le garde durable, à la place du garde de dérive.** L'ancien test miroir vérifiait que les
deux copies de `DEPENDANCE_FACTOR` restaient en phase, **en lisant le texte source de l'autre module**.
Le module a disparu, donc le test aurait cassé au `readFileSync`. `SPRINTS.md` l'avait signalé
précisément pour qu'il soit traité **avec** le retrait. Ce qui le remplace ne surveille plus la dérive
mais le retour :

```ts
// scripts/test/portefeuille.test.ts
const forbidden = [
  { pattern: /DEPENDANCE_FACTOR\s*[:=]/, why: "invented 0.6-1.8 multiplier on a measured count" },
  { pattern: /REVENUE_SHARE_PER_DAY\s*[:=]/, why: "0.5 %/day of revenue — anti-pattern n°10" },
  { pattern: /caAnnuelEuros\s*\*/, why: "any arithmetic on annual revenue" },
  { pattern: /\*\s*0\.005\b/, why: "the same 0.5 % written as a literal" },
];
```

Le quatrième motif est le plus utile : quelqu'un qui veut « remettre quelque chose dans la colonne
euros » n'écrira pas `REVENUE_SHARE_PER_DAY`, il écrira `* 0.005`.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Ne pas supprimer le module en bloc, alors que l'arbitrage disait de le supprimer.** Trois options :

1. *Tout supprimer* — conforme à la lettre de G1, et la fiche site perdait l'horizon 2050 et la fin de
   saison. Un utilisateur aurait constaté une régression sans rapport avec l'arbitrage qu'on appliquait.
2. *Tout garder en le renommant* — l'inverse : le coefficient inventé survivait sous un autre nom.
3. *Séparer* — retenu. Le mauvais calcul disparaît, la machinerie migre en jours purs. Le fichier
   disparaît bien ; ce qui n'a pas disparu, c'est ce qu'il faisait de juste.

La règle générale qui s'en dégage : quand un module fait deux choses et qu'une seule est fausse, la
suppression est un refactoring, pas une suppression.

**Retirer le repli euros sans le remplacer.** Le repli calculait 0,5 % du chiffre d'affaires par jour
d'interruption, d'après un ordre de grandeur Swiss Re **tous périls confondus**. Il était étiqueté
`repli_ca`, donc honnête en apparence. Mais une étiquette ne transforme pas un chiffre qui ne parle pas
de sécheresse en un chiffre qui en parle. La colonne est désormais **vide** quand le client n'a pas
déclaré son coût journalier — et la phrase du portefeuille dit combien de sites manquent au total, parce
qu'un total partiel lu comme complet serait le seul vrai risque du retrait.

**Remplacer `Dependance` par une forme de réponse, et non par rien.** Le retrait laissait un trou dans
le formulaire. `ResponseType` le comble en nommant un **comportement physique** au lieu d'une catégorie,
et surtout : le moteur **refuse de calculer** quand la déclaration qu'il faut manque (`stepwise` sans
son nombre de paliers, `threshold` sans son seuil). C'est l'inverse d'un défaut. Le libellé des options
nomme une machine — « Tour de refroidissement, lavage, irrigation » — parce que personne hors de ce
dépôt ne sait ce que `stepwise` veut dire.

**Ne pas migrer le paramètre d'URL `dep`.** Un lien ancien perd le réglage. L'alternative était de
traduire « critique » en `threshold`, ce qui aurait mis dans la bouche de l'utilisateur une déclaration
qu'il n'a jamais faite. Perdre un réglage est visible ; le réinterpréter ne l'est pas.

### 7.5 Pour expérimenter soi-même

**Expérience A — voir les 70 % que vaut « allonger » contre « multiplier ».**

Dans `lib/ia.ts`, faites que `scaleEpisodes` **multiplie le nombre** d'épisodes au lieu d'allonger
chacun — remplacez son corps par une duplication de la liste :

```ts
const copies = Math.max(1, Math.round(facteurCroissance));
const out: Episode[] = [];
for (let c = 0; c < copies; c++) for (const e of episodes) out.push({ ...e, startDay: e.startDay + c * 400 });
return out;
```

Puis `npx tsx scripts/test/indicateurs.test.ts`. **Cinq** assertions tombent (mesuré) :

```
FAIL 2050: lengthening and multiplying spend the SAME number of days
FAIL 2050: yet lengthening costs strictly more JEA — the convexity of §4.3
FAIL 2050: … and by a margin worth reporting, not a rounding difference
FAIL scale: a +10 % scenario does lengthen a 4-day episode
FAIL scale: and lengthens a 30-day one proportionally
```

Les trois premières sont l'argument de modélisation, les deux dernières le contrat de la fonction. La
troisième est celle à lire de près : elle exige un écart d'**au moins 3 JEA**, pas seulement un écart de
signe. Un test qui se contenterait de `allonge > multiplie` passerait avec une différence de 0,01 et
n'attesterait de rien.

**Expérience B — recasser la recharge de la réserve, et voir 17 devenir 14.**

Dans `lib/ia.ts`, retirez la condition `if (gap > 0)` :

```ts
// stock = recharge > 0 ? Math.min(tampon, stock + gap * recharge) : tampon;
```

Puis `npx tsx scripts/test/ia.test.ts`. **Deux** assertions tombent (mesuré) :

```
FAIL adjacent: two touching episodes are ONE continuous restriction — 17 JEA
FAIL adjacent: so touching costs strictly more than separated, at equal days
```

C'est **le** défaut de ce sprint, et les valeurs disent tout : deux épisodes contigus de 10 jours
coûtent **17 JEA** (une restriction continue de 20 jours, réserve de 3 jours dépensée une fois) ; les
mêmes deux épisodes espacés en coûtent **14** (la réserve absorbe 3 jours de chacun). Le test énonce la
physique : une cuve ne se remplit pas pendant une restriction.

⚠️ **Ces deux assertions n'existaient pas quand le défaut est survenu.** Le seul test qui tombait était
dans `portefeuille.test.ts`, dont le nom ne mentionne ni réserve ni épisode — j'ai donc ajouté la
couverture directe dans `ia.test.ts` en écrivant ce compte rendu. Un défaut de `lib/ia.ts` doit être
attrapable depuis `ia.test.ts` ; le trouver depuis une suite de portefeuille était un coup de chance de
localisation.

**Expérience C — faire revenir l'anti-pattern n°10 et voir le garde le refuser.**

Dans `lib/portefeuille.ts`, ajoutez dans la boucle de valeur :

```ts
if (v.eurosARisque === undefined && s.volumeM3) v.eurosARisque = Math.round(s.volumeM3 * 0.005);
```

C'est exactement la forme qu'un tel repli reprend : plausible, une ligne, bien intentionnée. Lancez
`npx tsx scripts/test/portefeuille.test.ts`. **Deux** assertions tombent (mesuré) :

```
FAIL a site that declares no cost per day gets NO euro figure (G6)
FAIL lib/portefeuille.ts does not reintroduce the same 0.5 % written as a literal
```

La première est un test de valeur, la seconde un test de forme — et c'est la seconde qui compte, parce
qu'un repli légèrement différent (0,004 par exemple, sur un autre champ) passerait la première.

Le motif qui l'attrape n'est pas le nom de la constante — personne ne réécrira
`REVENUE_SHARE_PER_DAY` — c'est `/\*\s*0\.005\b/`. Un garde-fou n'attrape que ce qu'on a imaginé qu'on
écrirait ; celui-ci a été écrit en imaginant la version paresseuse, pas la version documentée.
