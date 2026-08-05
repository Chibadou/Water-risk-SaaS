# Compte rendu — Ressource en eau par site (Sprint 27)

**Date** : 2026-08-05 · **Branche** : `claude/outil-portefeuille-sites-pertinence-1y4e3a` · **Sprint** : 27

---

## 1. La question initiale

> « J'aimerais trouver d'autres sources pour les restrictions d'eau. Serait-il possible de faire un
> modèle permettant d'estimer la ressource en eau disponible pour chaque site ? »

Puis, en arbitrage : chercher les sources qui expliquent **la cause en amont** (plus : restrictions
non préfectorales, réseau d'eau potable, historique plus profond) ; pour la ressource, aller jusqu'au
**volet officiel couvrant le souterrain** ; et garder l'indicateur **hors du score** dans un premier
temps.

**Ce que j'ai compris** : les deux questions n'en font qu'une. Il n'existe pas de seconde source des
restrictions — la vraie profondeur est en amont, dans l'état de la ressource qui *déclenche* ces
restrictions.

**Ce que j'ai délibérément laissé de côté** : SISPEA (fiabilité du réseau d'eau potable) et les
restrictions non préfectorales (plafonds ICPE, quotas OUGC), tous deux retenus dans l'arbitrage mais
non instruits faute de temps sur ce sprint. Ils restent en tête du backlog.

**⚠️ Ce que je n'ai pas pu livrer** : le **volet officiel** — l'état quantitatif par masse d'eau, qui
devait couvrir les sites sur forage. Ce n'est pas un renoncement de confort : **la donnée n'existe
pas** sous forme nationale exploitable (§3).

---

## 2. Ce qui a été réalisé

**En une phrase** : l'outil sait désormais estimer combien d'eau renouvelable le territoire d'un site
produit chaque année, et quelle part en est déjà prélevée — un verrou que le HANDBOOK déclarait
bloqué depuis le Sprint 10.

**Dans les grandes lignes** :

- **Le blocage n'en était pas un.** « BNPE bloqué sur les données de ressource renouvelable par
  sous-bassin » était vrai tant qu'on cherchait un *jeu de données tout fait*. La ressource **se
  calcule** — et depuis des séries que l'application téléchargeait déjà.
- **Le module était sous nos yeux.** `lib/hubeau.ts` télécharge 18 ans de débit journalier pour en
  tirer le VCN10, puis jette le reste. La **moyenne de cette même série** est le module, mesure
  standard de la ressource renouvelable de surface. Zéro téléchargement supplémentaire.
- **Trois passes de sonde avant la moindre ligne de modèle**, dont deux ont changé sa conception.
- **Le modèle refuse de répondre** là où il n'a rien à dire, et c'est sa propriété la plus
  importante.
- **Fenêtre d'historique 10 → 14 ans**, avec le biais qu'elle amplifie rendu visible plutôt que
  tranché en silence.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/ressource.ts` | neuf | `computeRessource` : débit spécifique → ressource → taux WRI → part du site, et les refus motivés |
| `lib/hubeau.ts` | modifié | `computeModule` (même série), `siteCatchment` (jointure station→site pour `surface_bv`) |
| `lib/history.ts` | modifié | fenêtre 14 ans, `ZoneHistory.premiereAnnee` |
| `components/RessourcePanel.tsx` | neuf | la chaîne de calcul visible étape par étape, hors score |
| `components/SiteIndicators.tsx` | modifié | remonte `ressource` dans `IndicatorSummary` |
| `scripts/diag/prod-diag.sh` | modifié | mode `ressource` (3 passes) + sondes du modèle en mode `app` |
| `scripts/diag/replay-ressource.ts` | neuf | rejeu sur bassins contrastés + bornes de plausibilité |
| `scripts/test/ressource.test.ts` | neuf | 59 vérifications |

---

## 3. Erreurs potentielles

### Ce que les sondes ont trouvé, et qui a changé la conception

- **`surface_bv` n'est pas là où je l'attendais.** Le plan supposait qu'il pourrait être sur
  `referentiel/stations` — l'endpoint que l'application interroge. Mesuré : `stations_has_surface_bv:
  false`, `sites_has_surface_bv: true`. Une **jointure supplémentaire** par `code_site` s'impose.
  Coder sans sonder aurait produit un modèle silencieusement vide.
- **Le champ manque une fois sur deux.** **895 sites sur 2 000** portent une surface de bassin. Le
  modèle est donc **muet sur plus de la moitié du réseau hydrométrique**. Ce n'est pas un bug, c'est
  la couverture réelle — mais c'est une limite de premier ordre pour l'utilité du panneau, et elle
  n'est pas visible depuis l'interface d'un site qui, lui, fonctionne.
- **La nomenclature de `influence_generale_site` est restée illisible** (400 sur deux formes d'URL).
  Ce champ dit si le débit est influencé par un barrage ou des prélèvements amont — auquel cas le
  module ne mesure pas un régime naturel. Faute de pouvoir lire l'échelle, le code est **affiché
  brut et n'entre dans aucun calcul**. Conséquence assumée : une station fortement influencée produit
  un module trompeur, et l'outil ne peut que le signaler, pas le corriger.
- **Aucun état quantitatif national des masses d'eau.** Le WFS Sandre expose 699 couches, dont
  `sa:MasseDEauSouterraine_VRAP2022_FXX` (nationale, SDAGE 2022-2027). Ses **18 attributs sont du
  référentiel pur** — identité, surface, karstique, multicouches — et **aucun ne porte d'état ni
  d'objectif quantitatif**. L'état des lieux existe, mais fragmenté par agence et par région, en zip,
  shapefile et MapInfo. **Le volet souterrain du plan est donc impossible tel que cadré.**

### Ce que le rejeu sur données réelles a trouvé, et corrigé

Quatre villes de bassins contrastés (mode `app`, run 29). **Le protocole a encore payé** :

| Site | Résultat | Lecture |
| --- | --- | --- |
| **Chartres** | 4,14 l/s/km², 2,21 Mm³/an, **37 % « Élevé »** | Plausible : la Beauce crayeuse produit peu, et l'irrigation y est intense. |
| **Orléans** | **refus** — la Loire draine 36 970 km² pour une commune de 28 (rapport 1 338) | La borne de transposition fonctionne sur un cas réel. |
| **Toulouse** | **487 %**, classé « Extrême » | **Défaut trouvé** — voir ci-dessous. |
| **Rennes** | pas de module — station d'étiage, chronique trop courte | Dégradation propre. |

**Le défaut de Toulouse.** 62 Mm³ prélevés contre ~13 Mm³ produits par ses 118 km². Le calcul est
juste : la ville boit l'eau de la Garonne, produite dans les Pyrénées. Mais **l'étiqueter « Extrême »
sur l'échelle WRI est faux** — cette échelle rapporte les prélèvements à la ressource *disponible*,
apports amont compris, là où mon dénominateur est la seule production locale. Un ratio supérieur à
100 % ne dit pas « surexploitation », il dit « dépendance à l'amont », ce qui est la situation
ordinaire de toute ville de grand fleuve.

**Corrigé** : au-delà de 100 %, la lecture change de nature — plus de classe WRI, un indicateur
« × N fois sa production locale » et une réserve dédiée. Non-régression ajoutée aux deux bornes
(99 % garde la classe, 490 % bascule).

**Couverture réelle mesurée** : 4 sites sur 4 ont une station rattachée, **3 sur 4** ont une surface
de bassin, mais **1 seul sur 4** produit une estimation complète. C'est le chiffre le plus important
de ce sprint, et il est bas.

### Non vérifié

- **Le rendu visuel du panneau n'a jamais été vu avec de vraies données** — en bac à sable, tous les
  appels amont échouent. Les sondes valident les nombres, pas l'affichage.
- **Trois bassins seulement**, et aucun de montagne ni méditerranéen : la borne de plausibilité
  (1-60 l/s/km²) n'a pas été éprouvée sur ses extrêmes.
- **La borne du rapport de surfaces (200) est une convention, pas une mesure.** Elle est justifiée et
  documentée comme telle, mais un hydrologue la placerait peut-être ailleurs.

### Hypothèses qui pourraient ne pas tenir

- **La commune n'est pas un bassin versant.** On transpose un débit spécifique à une emprise
  administrative, et on y rapporte des prélèvements eux aussi communaux. Les deux erreurs vont dans
  le même sens et se compensent partiellement — mais « partiellement » n'est pas « exactement ».
- **18 ans ne font pas une période de référence.** Les années récentes étant plus sèches, le module
  est probablement **sous-estimé**, donc le taux d'exploitation **surestimé**. Conservateur, et écrit.
- **`premiereAnnee` expose un biais sans le résoudre.** Une zone créée en 2022 reçoit des années à
  zéro avant son existence. Ni diviser par les années du fichier (sous-estime) ni par les siennes
  (surestime — c'est le bug du Sprint 26) n'est juste. Le champ rend l'ambiguïté visible ; **aucun
  consommateur ne s'en sert encore**.

---

## 4. Points d'amélioration

**Dette assumée** :

- Volet souterrain absent : la donnée n'existe pas. Le refus explicite vaut mieux qu'un volume inventé.
- L'influence du site signalée mais non corrigée : sa nomenclature est illisible.
- La borne de transposition est une convention, exposée comme telle.

**À reprendre** :

- **La couverture de `surface_bv` devrait être visible côté produit** — « le modèle ne s'applique
  qu'à environ la moitié des sites » est une information de cadrage, pas une note de bas de page.
- **`premiereAnnee` n'est consommé nulle part.** Le champ existe et est testé, mais ni l'UI ni le
  portefeuille n'en tirent d'avertissement. Il est à moitié livré.
- **Le taux d'exploitation mériterait un dénominateur d'étiage** (QMNA5 plutôt que le module) : c'est
  en basses eaux que la contrainte mord, et le module lisse précisément ce moment-là.
- **`lib/hubeau.ts` dépasse 780 lignes** et enchaîne maintenant trois appels séquentiels sur le
  chemin de la fiche site (série, référence, bassin versant).

---

## 5. État Git

- **Branche de session** : `claude/outil-portefeuille-sites-pertinence-1y4e3a`
- **`main` touché ?** : **OUI** — merge `7a48490`, **à la demande explicite de l'utilisateur**
  (« push to main ») en fin de session, après que ce compte rendu ait été rédigé. La ligne
  précédente disait « non » et était exacte à l'écriture ; elle est corrigée plutôt que laissée
  fausse, un compte rendu devant décrire l'état final de la session.
- **Déployé en prod ?** : oui, via le déploiement Vercel de `main`. ⚠️ **Le modèle avait déjà tourné
  contre les vraies sources** avant le merge (mode `app` du diagnostic, réseau réel sur le runner) —
  c'est ce qui a fait apparaître le défaut de Toulouse. Ce qui reste non vérifié est le **rendu
  visuel** du panneau, qu'aucune sonde ne peut contrôler.
- **Vérifications passées** : `npm run build` ✅ · `npm run lint` ✅ · **17/17 suites** (1 neuve) ·
  **22/22 e2e** · **rejeu sur données réelles** ✅ après correctif (4 bassins, `data/diag` purgé).

---

## 6. Prochaines étapes

| # | Étape | Ce qui la conditionne |
| --- | --- | --- |
| 1 | **Voir le panneau avec de vraies données** | Rien — un déploiement de preview suffit. C'est la vérification que ce sprint ne pouvait pas faire. |
| 1 bis | **Élargir la validation à un bassin de montagne et un méditerranéen** | Rien — ajouter deux sites au mode `app`. La borne de plausibilité n'a vu que des plaines. |
| 2 | **Import CSV + géocodage batch BAN** | Rien. Reste le blocage n°1 du produit depuis le Sprint 26 : une entreprise de 80 sites ne peut toujours pas entrer son parc. |
| 3 | **Consommer `premiereAnnee`** | Rien — le champ est là. Afficher « historique partiel, moyenne probablement sous-estimée » là où il est récent. |
| 4 | **Dénominateur d'étiage (QMNA5)** | `computeLowFlow` calcule déjà le QMNA5 mais ne l'expose pas. Petit chantier, gain de pertinence réel. |
| 5 | **SISPEA** (fiabilité du réseau AEP) | Jointure commune → service à confirmer. Retenu dans l'arbitrage, non instruit. |
| 6 | **Restrictions non préfectorales** (ICPE, OUGC) | Existence en open data **non vérifiée** — sonder avant de coder. |

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

L'outil savait dire « votre site est en restriction 46 jours par an ». Il ne savait pas dire
**pourquoi**. Or la raison est toujours la même : le territoire consomme une part trop importante de
l'eau qu'il produit.

« L'eau qu'un territoire produit » est une idée physique simple. Il pleut sur une surface ; une
partie s'évapore, une partie s'infiltre, le reste finit dans les rivières. Ce qui finit dans les
rivières, mesuré à la sortie du territoire, c'est la ressource renouvelable — celle qui se
reconstitue chaque année, par opposition à un stock qu'on viderait.

La question de ce sprint : peut-on chiffrer cette production pour la commune de n'importe quel site,
et la comparer à ce qu'on y prélève ?

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Débit** | Le volume d'eau qui passe en un point par seconde, en m³/s. Une station hydrométrique le mesure en continu. |
| **Module** | Le débit **moyen sur plusieurs années** d'une rivière en un point. C'est la mesure standard de la ressource renouvelable produite en amont de ce point. |
| **Bassin versant** | La surface de terrain dont toute l'eau converge vers ce point. Le module mesure ce que cette surface produit. |
| **Débit spécifique** | Le module divisé par la surface du bassin, en l/s/km². Autrement dit : combien d'eau produit **un kilomètre carré** de ce territoire. C'est la grandeur qui se transporte d'un endroit à l'autre. |
| **Étiage** | La période de l'année où les rivières sont au plus bas. C'est là que les restrictions tombent. |
| **VCN10 / QMNA5** | Deux mesures de sévérité d'étiage, déjà utilisées ailleurs dans le projet. |
| **Taux d'exploitation** | Prélèvements ÷ ressource renouvelable. Au-delà de 40 %, les hydrologues parlent de stress hydrique élevé. |

### 7.3 Comment le code s'y prend

**Étape 1 — récupérer un chiffre qu'on jetait.**

L'application téléchargeait déjà 18 ans de débit journalier pour calculer le VCN10. La moyenne de
cette même série *est* le module :

```ts
// lib/hubeau.ts — computeModule
for (const [, pts] of byYear) {
  if (pts.length < 330) continue;              // année incomplète : écartée
  annual.push(pts.reduce((s, p) => s + p.value, 0) / pts.length);
}
const moduleM3s = annual.reduce((s, v) => s + v, 0) / annual.length;
```

Le `if (pts.length < 330) continue` mérite un arrêt. Sans lui, une année où la station n'aurait
mesuré que juillet et août tirerait la moyenne vers l'étiage — or un module doit précisément
*moyenner* le cycle des saisons. Une année incomplète est donc écartée, pas rattrapée.

**Étape 2 — passer d'une rivière à une commune.**

La station est quelque part sur une rivière ; le site est ailleurs. On ne peut pas transposer un
débit tel quel : une grande rivière débite plus qu'un ruisseau, simplement parce qu'elle draine plus
de terrain. Mais on peut transposer le débit **par kilomètre carré** :

```ts
// lib/ressource.ts
const debitSpecifiqueLsKm2 = (moduleM3s * 1000) / surfaceBvKm2;
const ressourceCommuneM3An =
  (debitSpecifiqueLsKm2 / 1000) * surfaceCommuneKm2 * SECONDS_PER_YEAR;
```

Trois lignes, et c'est tout le modèle. Une rivière qui débite 10 m³/s en drainant 1 000 km² produit
10 l/s par km² ; une commune de 50 km² dans la même région produit donc environ 0,5 m³/s, soit
environ 15,8 millions de m³ par an.

**Étape 3 — ce que le code refuse de faire.**

C'est la partie la plus importante, et la moins spectaculaire :

```ts
if (input.origine === "souterrain") {
  return { available: false, applicable: false, message: "…" };
}
```

Un site qui pompe dans une nappe ne prélève pas dans la rivière. Un débit de surface ne dit rien de
son eau. Le code refuse donc de produire un chiffre — plutôt que d'en produire un « à titre
indicatif », ce qui ressemblerait à une réponse.

Même logique pour la transposition :

```ts
const ratio = surfaceBvKm2 / surfaceCommuneKm2;
if (ratio > RATIO_MAX || ratio < RATIO_MIN) {
  return { available: false, /* … */ message: "…régimes non comparables…" };
}
```

### 7.4 Pourquoi ces choix plutôt que d'autres

**Calculer plutôt que chercher.** Le premier réflexe — et celui du HANDBOOK pendant dix-sept sprints —
était de chercher un jeu de données « ressource par sous-bassin ». Il n'existe pas. Le déblocage n'est
pas venu d'une source trouvée, mais d'un changement de question : *cette donnée, peut-on la produire
avec ce qu'on a déjà ?* C'est le même mouvement qu'au Sprint 25 (l'aquifère) et au Sprint 26 (les
volumes). Trois fois de suite, le blocage était dans la formulation.

**Sonder avant de coder.** Trois allers-retours vers GitHub Actions avant la moindre ligne du modèle.
Coûteux — et deux d'entre eux ont changé la conception : sans eux, le modèle aurait cherché
`surface_bv` sur le mauvais endpoint et se serait tu partout, silencieusement.

**Refuser plutôt qu'approximer.** Le vrai danger n'est pas le chiffre absurde, qu'on repère. C'est
le chiffre **plausible**. Mesuré : sans la borne de transposition, appliquer le débit spécifique de
la Loire (40 500 km²) à une commune de 20 km² donne 5,45 Mm³/an et un taux de 14,7 %, classé
« Modéré ». Rien dans ce résultat n'alerte — et il ne veut rien dire, car le débit de la Loire intègre
la fonte des neiges du Massif central, qui ne dit rien de cette commune.

**Réutiliser l'échelle WRI plutôt qu'en inventer une.** Les seuils 10/20/40/80 % viennent d'Aqueduct
(World Resources Institute). Un lecteur ESG les connaît déjà. Inventer une échelle maison aurait
obligé chaque lecteur à l'apprendre, sans rien gagner.

### 7.5 Pour expérimenter soi-même

**Expérience 1 — voir le modèle refuser.**

```bash
npx tsx scripts/test/ressource.test.ts
```

Repérez les lignes de la section 4 : `a borehole gets no surface figure at all`, `an absurd area
ratio refuses rather than producing a number`, `no catchment area → no figure`. Presque un tiers de
la suite teste des **refus**. C'est délibéré : un modèle qui répond partout est un modèle auquel il
ne faut pas se fier.

**Expérience 2 — fabriquer le chiffre plausible** (la plus instructive).
Dans `lib/ressource.ts`, désactivez la borne :

```ts
const RATIO_MAX = 200;   // ← remplacez par 1e9
```

Relancez les tests : deux échouent, dont `an absurd area ratio refuses rather than producing a
number`. Puis calculez le cas de la Loire :

```ts
computeRessource({ moduleM3s: 350, anneesModule: 18, surfaceBvKm2: 40500,
                   surfaceCommuneKm2: 20, prelevementsCommuneM3: 800_000,
                   origine: "superficiel" })
```

Vous obtiendrez **5,45 Mm³/an, taux 14,7 %, « Modéré »** — un résultat parfaitement présentable et
entièrement dénué de sens. C'est cela que la borne protège : pas contre une erreur visible, contre
une erreur crédible.

**Expérience 3 — vérifier la proportionnalité à la main.**
Dans les tests, section 1, changez `surfaceCommuneKm2: 50` en `100` et relancez : l'assertion
`doubling the commune doubles the resource` continue de passer, mais la valeur affichée double. Puis
doublez `surfaceBvKm2` : le débit spécifique est divisé par deux. Ces deux gestes suffisent à
comprendre pourquoi le modèle tient en trois lignes — tout le reste du fichier est de la prudence.
