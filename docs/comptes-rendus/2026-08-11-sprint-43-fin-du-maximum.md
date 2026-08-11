# Compte rendu — JS par ressource, et fin du maximum (Sprint 43)

**Date** : 2026-08-11 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 43

---

## 1. La question initiale

> « lance tous les sprints (incluant les comptes rendus). on tranchera à la fin si il reste des points
> en suspend »

**Ce que j'ai compris pour ce sprint** : livrer JS en vecteur par ressource, appliquer l'ADR-003
(pondération par les parts volumiques), et solder G5 — le retrait du maximum entre SUP/SOU/AEP, qui est
l'anti-pattern n°1 de la note.

**Ce que j'ai élargi par rapport à l'énoncé** : le sprint disait « Exigences : version de modèle datée
(Sprint 44), mention dans l'interface, et section dédiée dans la note méthodologique ». Impossible de
livrer un changement de méthode **daté** sans le versionnement, donc `lib/modele.ts` est **avancé du
Sprint 44**. C'est une dépendance, pas une extension de périmètre.

**Ce que j'ai laissé de côté** : rien de l'énoncé, mais **le critère d'acceptation n'est mesuré qu'à
moitié** — voir §3.

---

## 2. Ce qui a été réalisé

**En une phrase** : le niveau réglementaire affiché est désormais celui auquel **ce site** est soumis,
pondéré par l'endroit d'où il tire son eau — et quand l'outil doit se replier sur le pire des niveaux, il
le dit.

**Dans les grandes lignes** :

- **`lib/rattachement.ts` (neuf)** publie JS comme un **vecteur** : SUP / SOU / AEP côte à côte,
  **toujours les trois**, pour qu'une absence de couverture soit visible. « Aucune zone à ce point » et
  « une zone sans restriction » sont deux faits différents et un seul dit quelque chose sur le site.
- **Le niveau effectif est un rang réel, pas un niveau nommé.** 99 % de réseau en vigilance + 1 % de
  rivière en crise donne **1,03**. Arrondir ici à « vigilance » est précisément ce qui perd le 1 %.
- **Le maximum ne disparaît pas du produit : il devient un barreau nommé.** La résolution est une
  échelle à trois barreaux — `vecteur` → `origine_unique` → `maximum` — et **`base` et `degrade`
  reviennent avec le chiffre**. C'est ce que l'ancien `maxGravite(zones)` rendait impossible.
- **Le changement de méthode est daté, annoncé, et pas silencieux.** `lib/modele.ts` porte une version
  `2026.08.1` et un journal des changements avec, pour chaque entrée, **le sens du décalage**.
  `ChangementMethode.tsx` l'affiche en tête du portefeuille.
- **`rattachement_ambigu`** liste les zones candidates avec leurs codes et leurs niveaux, dans deux cas :
  plusieurs zones du même type couvrant le point, ou une source déclarée **sans zone correspondante**.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/rattachement.ts` | **neuf** | Vecteur par ressource, niveau effectif pondéré, état ambigu, provenance du chiffre. |
| `lib/modele.ts` | **neuf** | Version de modèle datée + journal des changements avec le sens du décalage. |
| `components/ChangementMethode.tsx` | **neuf** | L'avertissement en tête du portefeuille, refermable par version. |
| `components/ResultPanel.tsx` | modifié | Le vecteur par ressource et le bloc « rattachement ambigu ». |
| `components/SitesDashboard.tsx` | modifié | Mentions « ⚠︎ repli » / « ⚠︎ ambigu » sur chaque ligne, via un composant partagé. |
| `components/HomeClient.tsx` | modifié | `resolveRattachement` remplace `maxGravite` et `levelForOrigin`. |
| `app/api/carte/etat/route.ts`, `components/CarteEau.tsx` | modifiés | Le popup dit que la couleur est le maximum, faute de vecteur d'usages pour un point. |
| `lib/report.ts` | modifié | Section « Version du modèle et changements de méthode ». |
| `scripts/test/rattachement.test.ts` | **neuf** | 30 assertions, dont un test miroir sur les quatre fichiers appelants. |

---

## 3. Erreurs potentielles

### Le défaut trouvé en écrivant les tests, et pourquoi un test naïf ne l'aurait pas vu

La première version de `lib/rattachement.ts` traduisait les types de source vers les types de zone avec
une table :

```ts
const SOURCE_TO_ZONE = { superficiel: "SUP", souterrain: "SOU", reseau: "AEP" };
```

Or `SourceType` **est déjà** `"SUP" | "SOU" | "AEP"`. La table ne correspondait à rien : toutes les parts
revenaient à 0,5 et le rang pondéré sortait à **0**.

Ce qui rend ce défaut instructif : **un test à un seul usage n'aurait rien vu.** Avec 100 % d'une source,
le niveau sort juste par accident — la pondération dégénère. Il a fallu deux usages avec des parts
inégales pour que l'erreur devienne visible. Deux vocabulaires d'apparence identique, une table fausse,
et un test insuffisamment discriminant : les trois ensemble donnent une fonction qui a l'air de marcher.

### Le critère d'acceptation n'est tenu qu'à moitié

Le critère de §8 est : *« ≥ 98 % des adresses d'un jeu de test rattachées sans ambiguïté ; les
ambiguïtés restantes explicitement signalées, jamais résolues silencieusement »*.

- **La seconde moitié est tenue** et testée : `rattachement_ambigu` liste les candidats et ne tranche pas.
- **La première ne l'est pas, et ne peut pas l'être ici.** Mesurer un taux sur un jeu d'adresses demande
  l'egress. C'est un critère **non mesuré**, pas un critère atteint, et il ne faut pas le lire autrement.

### Le changement de chiffre, et ce que je ne peux pas garantir

C'est le premier cas dans ce dépôt où une correction de justesse **déplace un chiffre que quelqu'un a
déjà lu**. Les scores vont généralement **baisser** — un site AEP cesse d'hériter d'une nappe qu'il ne
pompe pas — et un classement de portefeuille peut se réordonner.

Ce que le sprint fait : l'annonce est datée, versionnée, affichée avant les chiffres, et dit
explicitement « ce n'est pas une évolution de votre exposition ».

Ce que je ne peux pas garantir :

- **Je n'ai pas mesuré l'ampleur du décalage.** « Généralement à la baisse » est un raisonnement sur le
  mécanisme (un maximum est toujours ≥ une moyenne pondérée), pas une mesure sur un parc réel. L'ampleur
  dépend entièrement de la répartition des usages, que presque aucun site ne déclare aujourd'hui.
- **Et justement** : comme presque aucun site ne déclare de vecteur d'usages, presque tous tombent
  aujourd'hui sur le barreau `maximum` — donc **presque aucun chiffre ne bouge en pratique**. L'avertissement
  est donc prudent au point d'être, pour l'instant, presque sans objet. Il devient exact au fur et à
  mesure que les vecteurs se remplissent.

### Hypothèses qui pourraient ne pas tenir

- **Le maximum à l'intérieur d'une ressource.** Quand deux zones SUP couvrent un point, je retiens la
  pire pour cette ressource. Ce n'est pas l'anti-pattern n°1 — le site est réellement soumis aux deux
  arrêtés sur l'eau qu'il tire de cette ressource — mais c'est un choix, et l'arrêté pourrait dire
  autrement selon le point de prélèvement exact.
- **Les parts sont des fractions de 0 à 1**, et un vecteur dont les parts somment à 1,3 est utilisé tel
  quel. Le formulaire signale l'écart sans l'empêcher (décision du Sprint 40) ; la pondération sera
  proportionnellement fausse.
- **`weightedLevel` pondère sur le volume RESTREIGNABLE**, donc exclut les usages exemptés. C'est juste —
  une eau qu'on ne peut pas restreindre ne doit pas diluer un niveau de restriction — mais ça veut dire
  qu'un site dont 90 % des usages sont exemptés voit son niveau gouverné par les 10 % restants. C'est
  voulu et contre-intuitif.

### Ce qui casserait si une source amont changeait

Si VigiEau ajoutait un quatrième type de zone, `ZONE_TYPES` ne le connaîtrait pas et la ressource serait
**silencieusement ignorée** — ni dans le vecteur, ni dans les candidats ambigus. C'est le trou le plus
sérieux de ce module et aucun test ne le couvre.

---

## 4. Points d'amélioration

**Dette assumée** :

- **`levelForOrigin` (Sprint 21) survit dans `lib/vigieau.ts`** sans appelant côté fiche site. Il reste
  utilisé ailleurs ; le retirer demande un passage que ce sprint n'a pas fait.
- **L'infobulle `title` pour « ⚠︎ repli »** est invisible sur un écran tactile. Le dépôt a déjà payé ce
  piège au Sprint 33. C'est un raccourci conscient : le texte complet est sur la fiche site.

**À reprendre** :

- **Aucun test ne couvre un type de zone inconnu** (voir §3).
- **`ChangementMethode` se referme par version dans `localStorage`**, donc un utilisateur en navigation
  privée le reverra à chaque visite. Choix délibéré (« mieux vu deux fois que jamais »), mais un
  utilisateur qui l'a lu et le revoit va cesser de le lire.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — commit
  « Sprint 43: weight the level by resource shares, and end max(SUP, SOU, AEP) ».
- **`main` touché ?** : **NON**.
- **Pull request ?** : **NON**.
- **Déployé en prod ?** : **NON**, et non regardé.
- **Vérifications** : build clean · lint clean · **27 suites** vertes · **97/97** e2e dont 9 neuves.

---

## 6. Prochaines étapes

1. **Mesurer le taux de rattachement sans ambiguïté** sur un jeu d'adresses. *Verrou* : egress, donc
   l'échappatoire Actions.
2. **Couvrir le cas d'un type de zone inconnu.** *Verrou* : aucun.
3. **Retirer `levelForOrigin`.** *Verrou* : trouver et migrer ses appelants restants.
4. **Mesurer l'ampleur réelle du décalage de scores** sur un parc dont les vecteurs sont renseignés.
   *Verrou* : personne n'a de parc renseigné, ce qui est un problème produit avant d'être technique.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Quand la sécheresse s'installe, le préfet ne publie pas un seul niveau d'alerte. Il en publie **un par
type de ressource** : un pour les rivières, un pour les nappes souterraines, un pour l'eau potable du
robinet. Les trois peuvent différer le même jour au même endroit — la rivière peut être en crise pendant
que la nappe est simplement sous surveillance.

L'outil affichait le **pire des trois**. Prenons une usine raccordée au réseau d'eau potable, qui possède
en plus une petite prise d'eau en rivière pour son bassin incendie — disons 1 % de ses prélèvements.
Rivière en crise, réseau en vigilance. L'outil affichait **crise**.

C'est faux de façon particulière : le chiffre ressemble à une lecture des arrêtés. Il en a l'air, il en a
l'unité, il vient bien de VigiEau. Rien ne dit au lecteur qu'un bassin incendie portant 1 % de l'eau
gouverne le diagnostic de toute son usine.

Ce sprint pondère par la part de volume tirée de chaque ressource. Et quand il ne peut pas — parce que
l'entreprise n'a rien déclaré — il retombe sur le pire des niveaux, **ce qui est la bonne réponse
prudente**, et il l'écrit.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **SUP / SOU / AEP** | Les trois types de zone : eaux superficielles (rivières), eaux souterraines (nappes), eau potable (réseau). |
| **Zone d'alerte** | Découpage administratif sur lequel porte un arrêté sécheresse. |
| **Niveau de gravité** | `vigilance`, `alerte`, `alerte_renforcee`, `crise` — du plus léger au plus sévère. |
| **Rang** | Le niveau traduit en nombre : 1 à 4. Permet de faire une moyenne. |
| **Vecteur d'usages** | La description d'un site comme une liste d'usages avec, pour chacun, sa part de volume et sa source. |
| **Volume restreignable** | Le volume sur lequel une restriction peut mordre — hors usages exemptés (sanitaires, sécurité incendie). |
| **ADR-003** | La décision d'architecture qui impose la pondération volumique plutôt que le maximum. |
| **Anti-pattern n°1** | Le nom que la note donne à l'erreur corrigée ici : prendre le maximum des niveaux. |
| **Rattachement ambigu** | Le point est couvert par plusieurs zones du même type, ou une source déclarée n'a aucune zone. |
| **Version de modèle** | Un identifiant qui ne change **que** quand la méthode de calcul change. |

### 7.3 Comment le code s'y prend

**Étape 1 — une échelle de résolution, et chaque barreau se nomme.** C'est la décision structurante :

```ts
// lib/rattachement.ts
//   1. `vecteur`         — weighted by declared restrictable volume per source.
//   2. `origine_unique`  — one declared origin, so that zone governs.
//   3. `maximum`         — nothing declared: fall back to the worst level, and
//                          say that it is a fallback, not a reading.
//
// The point is not that rung 3 disappears — with no declaration the conservative
// reading IS the right default. The point is that a caller can no longer confuse
// it with rung 1, because `base` and `degrade` come back with the number.
```

**Étape 2 — le rang effectif est un nombre réel, et il ne s'arrondit pas.** Le cœur du calcul :

```ts
let rank = 0;
for (const [src, share] of Object.entries(parts) as [SourceType, number][]) {
  rank += rankOf(SOURCE_OF_ZONE[src]) * share;
}
```

Pour notre usine : `1 × 0,99 + 4 × 0,01 = 1,03`. Le niveau nommé le plus proche est « vigilance », et
c'est ce qu'affiche le badge — mais **le calcul garde 1,03**. La différence compte : arrondir d'abord
ferait disparaître le 1 % en crise, et le test l'affirme :

```ts
// scripts/test/rattachement.test.ts
check("vector: the 1 % in crisis still moves the figure — it is not rounded away",
  pondere.rangEffectif > GRAVITE.vigilance.rank);
```

**Étape 3 — la signature interdit de perdre la provenance.** C'est là que tient tout le sprint :

```ts
export function niveauEffectif(
  zones: VigieauZone[],
  site: Pick<SavedSite, "usages" | "origine">,
): { niveau?: NiveauGravite; degrade: boolean; base: Rattachement["base"] } {
```

L'ancienne fonction s'appelait `maxGravite(niveaux)` et rendait un niveau nu. Aucun appelant ne pouvait
savoir s'il tenait une lecture ou un repli — **et c'est ainsi que l'anti-pattern n°1 a survécu à sa
propre correction au Sprint 21** : `levelForOrigin` existait déjà, il faisait le bon calcul, et rien ne
disait *où il n'était pas appliqué*. Un correctif non généralisé et invisible est un correctif qui
n'existe pas.

**Étape 4 — un test qui lit le code des appelants.** Parce qu'avec une seule ressource couvrante, le
maximum et la pondération donnent le même chiffre : aucun test de valeur ne peut distinguer les deux.

```ts
const files = [
  "components/HomeClient.tsx",
  "components/SitesDashboard.tsx",
  "app/api/carte/etat/route.ts",
  "components/ResultPanel.tsx",
];
for (const f of files) {
  const src = readFileSync(f, "utf-8");
  const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\s*\{\/\*)/.test(l)).join("\n");
  check(`${f} no longer calls maxGravite`, !/\bmaxGravite\s*\(/.test(code));
}
```

**Étape 5 — annoncer que le chiffre a changé de méthode, pas de risque.** Un journal typé :

```ts
// lib/modele.ts
sens: "baisse",
motif:
  "Un site raccordé au réseau héritait du niveau de gravité d'une nappe qu'il ne pompe pas. " +
  "… ⚠️ Conséquence pratique : les scores affichés BAISSENT généralement, et un classement de " +
  "portefeuille peut se réordonner. Ce n'est pas une amélioration du risque, c'est une " +
  "correction de méthode.",
```

Le champ `sens` est le plus important du type. « La méthode a changé » sans direction laisse le lecteur
interpréter une baisse comme une amélioration de **son** exposition — et c'est nous qui l'aurions causée.

**Étape 6 — la carte est le cas où le maximum est légitime.** Un point sur une carte n'a pas de vecteur
d'usages : la couleur *est* le maximum. Ce qui change, c'est que le popup le dit :

```tsx
(data.degrade
  ? `<div>Niveau le <b>plus sévère</b> des zones couvrantes… Un site raccordé au réseau n'est pas
     forcément soumis à celui de la nappe : la fiche site pondère par la répartition des usages.</div>`
  : "")
```

### 7.4 Pourquoi ces choix plutôt que d'autres

**Ne pas supprimer `maxGravite`, mais l'encapsuler dans un barreau nommé.** Trois options :

1. *Le supprimer et refuser de calculer sans vecteur* — cohérent avec « une donnée absente n'est jamais
   un zéro », et le produit devenait inutilisable : presque aucun site ne déclare de vecteur, donc
   presque aucun n'aurait eu de niveau. On aurait échangé un chiffre imprécis contre pas de chiffre.
2. *Le garder tel quel et ajouter la pondération à côté* — deux chiffres à l'écran sans règle pour
   choisir.
3. *En faire le dernier barreau d'une échelle, avec la provenance qui remonte* — retenu. Le
   comportement par défaut ne change pas ; ce qui change, c'est qu'on ne peut plus l'ignorer.

**Un rang réel plutôt qu'un niveau nommé.** L'alternative était de rendre directement un
`NiveauGravite`. Refusé parce que le nommage est une perte d'information irréversible : 1,03 et 1,49
s'arrondissent tous deux en « vigilance » alors que le second est presque en alerte. Le rang réel est
gardé pour le calcul, le nom pour l'affichage.

**Pondérer sur le volume restreignable et non sur le volume total.** Un usage exempté (eau sanitaire,
sécurité incendie) ne peut pas être restreint. L'inclure dans la pondération diluerait le niveau avec de
l'eau qu'aucun arrêté ne touche — un site à 90 % d'eau sanitaire apparaîtrait presque insensible. C'est
contre-intuitif et c'est juste, et un test le fixe.

**Avancer `lib/modele.ts` du Sprint 44.** L'énoncé du 43 exigeait un changement de méthode **daté**, ce
qui suppose un versionnement. Deux options : livrer sans date (donc sans le faire), ou avancer le module.
Avancer était le seul choix cohérent, et ça a réduit le Sprint 44 d'autant.

### 7.5 Pour expérimenter soi-même

**Expérience A — voir la pondération faire son travail.**

```
npx tsx scripts/test/rattachement.test.ts
```

Puis dans `lib/rattachement.ts`, forcez le repli sur le maximum en neutralisant la branche `vecteur` :

```ts
const weighted = { ...weightedLevel(levels, site), base: "aucune" as const };
```

Relancez. **Sept** assertions tombent (mesuré) :

```
FAIL vector: 99 % network under vigilance + 1 % river in crisis is NOT in crisis
FAIL vector: the effective rank is a real number, not a named level
FAIL vector: it is not degraded — it is a reading of this site
FAIL shares: 95 % from the river in crisis lands near crisis
FAIL shares: the SAME zones give opposite levels by share alone
FAIL origine: a single declared origin selects its resource
FAIL origine: it is NOT presented as a weighting
```

La cinquième est celle qui démontre que le module fait quelque chose : **les mêmes zones, des réponses
opposées, par la seule part de volume**. Si elle passait avec le maximum, le module serait inutile.

⚠️ Et une observation utile : l'assertion de la **section 3** (« un usage exempté est exclu de la
pondération ») **continue de passer**. Pas parce qu'elle est mauvaise, mais parce que dans ce cas précis
le maximum et la pondération donnent tous deux « crise » — une coïncidence du jeu de test. C'est le même
piège que celui décrit en §3 : une assertion peut passer pour la mauvaise raison, et il faut plusieurs
cas pour s'en apercevoir.

**Expérience B — reproduire le défaut des deux vocabulaires.**

Dans `lib/rattachement.ts`, remplacez `const part = weighted.parts[t];` par une traduction inutile :

```ts
const SOURCE_TO_ZONE: Record<string, ZoneType> = { superficiel: "SUP", souterrain: "SOU", reseau: "AEP" };
const part = Object.entries(weighted.parts).find(([src]) => SOURCE_TO_ZONE[src] === t)?.[1];
```

Puis remplacez aussi `rankOf(SOURCE_OF_ZONE[src])` par une lecture via cette table dans
`lib/siteProfile.ts`. Vous retrouverez exactement l'état initial : toutes les parts à 0,5 et un rang de 0.

Ce qu'il faut observer : **modifiez maintenant le test pour n'utiliser qu'un seul usage à 100 %** et
relancez. Il passe. C'est la leçon de l'expérience : un test de pondération avec un seul poids ne teste
pas la pondération.

**Expérience C — casser le test miroir en réintroduisant le maximum.**

Dans `components/HomeClient.tsx`, remettez un appel direct :

```ts
const worstNiveau = data ? maxGravite(data.zones.map((z) => z.niveauGravite)) : undefined;
```

Lancez `npx tsx scripts/test/rattachement.test.ts` :

```
FAIL components/HomeClient.tsx no longer calls maxGravite
```

Notez que la fonction `maxGravite` **existe toujours** dans `lib/gravite.ts`, délibérément : c'est le
repli honnête quand il n'y a réellement rien à pondérer, et `lib/rattachement.ts` appelle ce chemin
`maximum`. Ce que le test interdit, ce n'est pas la fonction — c'est un appel **non étiqueté** dans un
composant. Le test filtre d'ailleurs les commentaires, pour que le code puisse continuer à **nommer** ce
qu'il a retiré.
