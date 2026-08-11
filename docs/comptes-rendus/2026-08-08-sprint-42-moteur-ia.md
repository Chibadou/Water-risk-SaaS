# Compte rendu — Sprint 42 : le moteur d'interruption d'activité

**Date** : 2026-08-08 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 42 (partiel)

> Septième compte rendu du 2026-08-08. Le Sprint 42 est le pivot de la file : il devait livrer l'IA
> **et** retirer `interruption.ts`. Seul le moteur est fait ; la migration ne l'est pas, et ce compte
> rendu dit pourquoi.

---

## 1. La question initiale

> « continue » — enchaîner sur le Sprint 42.

**Ce que j'ai compris** : généraliser la convexité déjà écrite dans `portefeuille.ts` en un moteur
d'interruption d'activité complet — trois fonctions de réponse, seuil technique, sortie en JEA — et en
faire le module qui remplacera `lib/interruption.ts`.

**Ce que j'ai délibérément laissé de côté, et c'est la moitié du sprint** :

- **Le retrait de `interruption.ts` (G1)**, de `Dependance` (G10) et de `REVENUE_SHARE_PER_DAY` (G6).
  Six consommateurs et trois suites de tests. Motif : c'est un changement **cassant pour les exports
  d'un client**, et j'ai préféré poser une question à l'utilisateur avant de trancher entre une bascule
  d'un coup et une colonne dépréciée le temps d'une version.
- **L'affichage.** Comme au Sprint 41, le moteur n'atteint pas l'écran.

⚠️ **Le sprint est donc explicitement partiel.** Le marquer ✅ aurait été faux.

---

## 2. Ce qui a été réalisé

**En une phrase** : la perte d'activité se calcule désormais épisode par épisode avec une fonction de
production déclarée, ce qui rend enfin visible qu'à nombre de jours égal, la **structure** des épisodes
change tout.

**Dans les grandes lignes** :

- **La logique d'épisode est remontée dans le noyau** et sert un site seul, là où elle ne servait que
  le portefeuille.
- **Les trois fonctions de réponse existent**, et se distinguent à volume égal — un test l'exige.
- **Le seuil technique est un plancher sous toutes les réponses**, pas une quatrième réponse.
- **La fourchette de ρ atteint les JEA.**
- **La distribution des durées et le maximum consécutif sont exposés**, parce que §5.5 en fait un
  critère de validation et qu'on ne compare pas ce qu'on ne publie pas.
- **Une erreur de modélisation a été trouvée par le test central**, et c'est le fait marquant du sprint.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/ia.ts` | neuf | `episodesFromPeriodes`, `computeIa`, `durationDistribution`, les trois réponses |
| `scripts/test/ia.test.ts` | neuf | **42 assertions**, dont la section 2 qui épingle l'exemple de la note |
| `docs/SPRINTS.md` | modifié | Sprint 42 marqué ⏳, avec ce qui reste nommé |

---

## 3. Erreurs potentielles

### L'erreur de modélisation, trouvée par le test qui comptait

Ma première version traitait la réserve comme **un stock dépensé une fois pour la vie du site**. Le
test de convexité — celui pour lequel le module existe — l'a attrapée immédiatement : avec une cuve de
trois jours, quarante épisodes d'un jour coûtaient **exactement autant** que deux épisodes de vingt
(37 JEA dans les deux cas).

C'est-à-dire : mon moteur de convexité n'était **pas convexe**.

La correction est physique. Une cuve se remplit dès que la restriction cesse — et c'est déjà ce que
`portefeuille.ts` supposait avec son `max(0, durée − autonomieJours)` par épisode. **J'avais généralisé
un mécanisme existant en me trompant sur son hypothèse implicite**, ce qui est le risque propre à toute
généralisation : le code source dit ce qu'il fait, pas ce qu'il présuppose.

Après correction, sur les mêmes 40 jours :

| Structure | JEA |
|---|---|
| Quarante épisodes d'un jour | **0** |
| Deux épisodes de vingt jours | **34** |

⚠️ **La leçon utile n'est pas « j'ai fait une erreur »**, c'est que le test qui l'a trouvée était le
test **central du module** — celui écrit d'après l'exemple de la note plutôt que d'après mon code. Un
test dérivé de l'implémentation aurait confirmé les 37 JEA.

### Un second réglage corrigé par un test

Le journal d'hypothèses annonçait « la réserve ne se reconstitue pas entre deux épisodes » **même quand
aucune réserve n'était déclarée** — un avertissement sur un paramètre sans objet. Corrigé, et un test
exige désormais qu'avec aucune réserve, aucune hypothèse de recharge ne soit revendiquée.

### Les hypothèses qui peuvent ne pas tenir

- **`stepwise` utilise 4 paliers par défaut.** Chiffre inventé. Il est paramétrable (`paliers`), mais
  le défaut est arbitraire — et à 50 % de volume, `stepwise` et `linear` donnent le même résultat par
  coïncidence de ce choix. C'est le coefficient calibré à la main de ce module.
- **`threshold` sans seuil déclaré arrête le site au moindre manque.** Défendable (« il tourne ou il ne
  tourne pas ») et brutal : un manque de 1 % coûte une journée entière. Un site réel a probablement une
  tolérance, et elle se déclare via `seuilTechniqueM3` — mais rien ne force à la déclarer.
- **Le besoin journalier est plat** (`V_ref / 365`), même limite qu'au Sprint 41 : les restrictions
  tombent en été, quand beaucoup de procédés consomment plus. **Cette limite n'est pas dans le journal
  d'hypothèses de `ia.ts` non plus** — même omission, deux fois.
- **Le volume exempté est réparti uniformément** sur l'année, comme le besoin.
- **Les épisodes sont traités dans l'ordre chronologique et indépendamment** : aucun effet de fatigue,
  aucun coût de redémarrage. Un arrêt de vingt jours coûte probablement plus que vingt jours de
  production perdue.

### Non vérifié en conditions réelles

**Tout.** Le module n'a jamais reçu un `periodes` réel, alors que la fonction qui le décode est écrite
pour un format que la production utilise déjà (9 162 arrêtés parsés au dernier diag). C'est vérifiable
**sans egress** — le format est dans le dépôt, en fixtures de `history-parser.test.ts` — et je ne l'ai
pas fait. C'est le manque le plus facile à combler de ce sprint.

---

## 4. Points d'amélioration

**Dette assumée** :

- **Sprint partiel.** Deux moteurs (VNP, IA) attendent leur interface, et `interruption.ts` continue de
  servir le chiffre affiché — donc le produit montre aujourd'hui l'ancien indicateur pendant que le
  nouveau existe à côté. **C'est l'état le plus inconfortable de la file**, et il ne doit pas durer.
- **Le critère d'acceptation de la note est hors de portée ici** : il compare une distribution
  **simulée** à l'observée, or il n'y a pas de simulation avant N2 (Sprint 45). Ce sprint livre
  l'observée et le moteur qui la consomme. Écrit tel quel dans `SPRINTS.md`.

**À reprendre** :

- **Faire tourner `episodesFromPeriodes` sur les fixtures réelles** de `history-parser.test.ts` (§3).
  Une demi-heure, aucun verrou.
- **Ajouter la saisonnalité au journal d'hypothèses**, dans `ia.ts` comme dans `vnp.ts`.
- **Interroger le défaut de 4 paliers**, ou l'exiger déclaré.

---

## 5. État Git

- **Branche** : `claude/integrate-file-apply-plan-k5t009` — commit « Sprint 42: the IA engine… »
- **`main` touché ?** : **NON**.
- **Déployé en prod ?** : **non**.
- **Vérifications** : build ✅, lint ✅, **25 suites** (une neuve, 42 assertions), e2e inchangés
  (aucune interface touchée).

---

## 6. Prochaines étapes

1. **Trancher la continuité des exports**, puis migrer. *Verrou : une décision produit* — bascule d'un
   coup, ou `joursContraints` en colonne dépréciée le temps d'une version. ⚠️ Le piège identifié est à
   traiter **avec** le retrait : `portefeuille.test.ts:377-383` lit le **texte source** de
   `interruption.ts`, donc il cassera au `readFileSync`, pas au typage.
2. **Brancher VNP et JEA à l'écran.** *Verrou : la plomberie de `HomeClient`, commune aux deux.*
3. **Épisodes réels sur fixtures.** *Verrou : aucun.*
4. **Regarder la production.** ⚠️ Septième session.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Deux usines, même département, même année : chacune a subi **40 jours de restriction d'eau**. Toutes
deux ont une réserve de trois jours dans une cuve.

La première a eu quarante coupures d'une journée, éparpillées. Chaque fois, la cuve a suffi : elle n'a
**jamais** arrêté la production.

La seconde a eu deux coupures de vingt jours. Les trois premiers jours de chaque coupure sont passés
sur la cuve ; les dix-sept suivants, non. Elle a perdu **34 jours** de production.

Même chiffre en entrée, même réserve, et un écart total en sortie. Un outil qui ne compte que « 40 jours
de restriction » ne peut pas faire la différence — et c'est précisément la différence qui intéresse
l'exploitant.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Épisode** | Une période **continue** de restriction. Deux épisodes de vingt jours ≠ quarante épisodes d'un jour, même si le total est identique. |
| **JEA** | Jours-équivalents d'arrêt. Une usine à 60 % pendant dix jours perd quatre JEA. |
| **Convexe** | Une perte qui augmente **plus vite** que sa cause : doubler la durée d'un épisode fait plus que doubler la perte, dès qu'il y a une réserve. |
| **Fonction de réponse** | Comment la production réagit au manque d'eau. Trois formes possibles, décrites ci-dessous. |
| **Seuil technique** | Le débit minimal sous lequel l'installation s'arrête, quoi qu'il arrive. |
| **RLE** | *Run-length encoding* : stocker « 20 jours identiques à partir du jour 137 » au lieu de 20 entrées. |

### 7.3 Comment le code s'y prend

**Trois façons de réagir au manque, et elles ne coûtent pas la même chose** :

```ts
switch (reponse) {
  case "threshold":
    // Une usine de semi-conducteurs tourne ou ne tourne pas ; elle ne tourne
    // pas à 60 % de son eau ultra-pure.
    return ratio >= 1 ? 1 : 0;
  case "stepwise": {
    // Une usine multi-lignes perd des lignes par paliers : la production tombe
    // au palier inférieur, jamais entre deux.
    const step = Math.floor(ratio * paliers) / paliers;
    return Math.min(1, step);
  }
  case "linear":
  default:
    return ratio;   // une tour de refroidissement : la production suit le volume
}
```

Avec la moitié du volume bloquée sur dix jours : `linear` perd 5 JEA, `threshold` en perd **10**. Même
arrêté, même volume, le double de perte — parce que la nature de l'installation diffère. C'est ce que
la note veut dire en écrivant que la fonction de production « est renseignée par le client » et non
devinée.

**La réserve, et l'erreur que j'ai faite.** Le cœur du calcul tire sur la cuve pour combler le manque :

```ts
const manque = Math.max(0, besoinJour - dispo);
if (manque > 0 && stock > 0) {
  const tire = Math.min(stock, manque);
  stock -= tire;
  dispo += tire;
}
```

Ma première version s'arrêtait là : `stock` diminuait et **ne remontait jamais**. Conséquence — la cuve
couvrait les trois premiers jours de restriction de toute l'histoire du site, puis plus rien. Les
quarante coupures d'un jour coûtaient alors 37 JEA, exactement comme les deux coupures de vingt.

Le correctif tient en trois lignes, entre deux épisodes :

```ts
if (lastEnd !== undefined) {
  const gap = Math.max(0, ep.startDay - lastEnd);
  stock = recharge > 0 ? Math.min(tampon, stock + gap * recharge) : tampon;
}
```

Sans débit de recharge déclaré, la cuve est **pleine** au prochain épisode : c'est ce qui se passe
réellement, l'eau revenant dès la fin de la restriction. Avec un débit déclaré, elle se remplit
progressivement — et deux épisodes rapprochés la trouvent à moitié vide, ce qui coûte plus cher. Un
test le vérifie.

**D'où viennent les épisodes ?** D'un calendrier que le dépôt conservait déjà, compressé :

```ts
for (let i = 0; i + 2 < periodes.length; i += 3) {
  const lengthDays = periodes[i + 1];
  const rank = periodes[i + 2];
  if (lengthDays > 0 && rank > 0) out.push({ startDay: periodes[i], lengthDays, rank });
}
```

Trois nombres par épisode : jour de début, durée, niveau de gravité. Ce calendrier existe depuis le
Sprint 26 — il avait été gardé parce qu'aucun total annuel ne peut répondre à « ces deux sites
étaient-ils contraints le même jour ». Il répond aussi à « combien de temps a duré cet épisode », et
c'est ce qui rend ce sprint possible sans nouvelle donnée.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Pourquoi une réserve pleine par défaut plutôt que jamais rechargée ?** Parce que c'est
  physiquement ce qui arrive, et parce que `portefeuille.ts` le supposait déjà. Mon erreur initiale
  venait d'avoir lu son **code** (`max(0, durée − autonomie)`) sans lire son **hypothèse**.
- **Pourquoi les JEA plutôt que des jours d'arrêt ?** Parce que « jours d'arrêt » suppose une production
  binaire. Une usine à 60 % n'est pas arrêtée, et pourtant elle perd. Les JEA additionnent des fractions
  de journée, ce qui est la seule unité compatible avec les trois fonctions de réponse.
- **Pourquoi exposer la distribution des durées, alors que personne ne l'affiche encore ?** Parce que
  §5.5 en fait un **critère de renoncement** : si le modèle N2 ne reproduit pas la distribution
  observée, il ne faut pas livrer l'IA. Ce critère est invérifiable si l'observé n'est pas publié.
- **Pourquoi ne pas avoir supprimé `interruption.ts` dans le même sprint ?** Parce que ça casse la
  continuité des exports d'un client, et que ce genre de décision se pose à l'utilisateur plutôt que se
  prend au passage — même quand elle a été validée en principe.

### 7.5 Pour expérimenter soi-même

**a) Voir la convexité, chiffres en main.**

```bash
npx tsx scripts/test/ia.test.ts
```

Trois lignes à lire dans l'ordre : « both cases are 40 restriction days », « forty 1-day episodes cost
~0 JEA », « two 20-day episodes cost 34 JEA ». C'est tout l'argument du §4.3 en trois assertions.

**b) Reproduire mon bug, et le voir casser le test.** Dans `lib/ia.ts`, remplacez la ligne de recharge
par :

```ts
stock = recharge > 0 ? Math.min(tampon, stock + gap * recharge) : stock;   // au lieu de : tampon
```

Relancez. **Quatre tests tombent** — vérifié, pas supposé : « forty 1-day episodes cost ~0 JEA », « two
20-day episodes cost 34 JEA », « the SAME 40 days give wildly different losses » et « a slow refill
costs more than a full one ». Les quarante épisodes d'un jour coûtent soudain 37 JEA, comme les deux de
vingt. Vous venez de rendre non convexe un moteur de convexité — et c'est exactement l'état dans lequel
j'avais écrit ce fichier la première fois.

**c) Comparer les trois fonctions de réponse sur le même arrêté.** Dans le fichier de test, changez la
`reponse` de `base()` de `"linear"` à `"threshold"`, puis relancez. Beaucoup de tests tombent, et les
écarts vous donnent la sensibilité du résultat à ce seul champ déclaré par le client. C'est la
démonstration la plus courte de pourquoi la note refuse que le modèle le devine.
