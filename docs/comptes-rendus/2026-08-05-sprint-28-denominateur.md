# Compte rendu — Deux dénominateurs, deux questions (Sprint 28)

**Date** : 2026-08-05 · **Branche** : `claude/outil-portefeuille-sites-pertinence-1y4e3a` · **Sprint** : 28

---

## 1. La question initiale

> « Règle les 4 manques. » puis, après clarification : « ces 2 points ne nécessitent pas une
> correction du modèle ? »

**Ce que j'ai compris** — et c'est une correction qui m'a été apportée, pas une intuition. J'avais
présenté quatre trous du HANDBOOK comme comblés parce que je les avais *écrits*. La question a pointé
que deux d'entre eux — la dépendance à l'amont et le bassin versant réel — ne sont pas des trous de
documentation mais des défauts du modèle, et qu'écrire un défaut ne le corrige pas.

**Vérification faite, la question était fondée pour le premier.** Le modèle du Sprint 27 divise les
prélèvements par la production locale (`lib/ressource.ts:288`) tout en appelant le résultat « taux
d'exploitation » et en le graduant sur l'échelle WRI — laquelle rapporte les prélèvements à la
ressource *disponible, apports amont compris*. Le nom et l'échelle désignaient une grandeur, le
calcul en faisait une autre.

**Arbitrage** : corriger le modèle d'abord ; le bassin versant réel (`sa:BVSpeMasseDEauSurface`) est
d'une autre nature — une amélioration de géométrie sur une branche que cette correction reclasse en
secondaire — et attendra.

---

## 2. Ce qui a été réalisé

**En une phrase** : un seul nombre portait deux questions incompatibles ; il y en a désormais deux,
chacun nommé par la question à laquelle il répond.

**Dans les grandes lignes** :

- **Le correctif du Sprint 27 traitait le symptôme.** Il retirait la classe WRI au-delà de 100 %,
  là où le résultat crevait les yeux (Toulouse à 487 %). Mais le défaut existait **à tous les
  niveaux** — invisible en dessous, parce qu'un chiffre entre 0 et 100 % *a l'air* d'un taux
  d'exploitation.
- **Deux dénominateurs.** `pressionCoursEau` rapporte les prélèvements au **débit disponible au
  point** (le module, qui intègre tout l'amont) : « le cours d'eau a-t-il assez d'eau ? ».
  `autonomieTerritoire` garde l'ancien calcul mais **perd l'échelle WRI** : « ce territoire vit-il
  de sa propre eau ? ».
- **`dependanceAmont` devient une lecture**, plus un cas spécial câblé à un seuil.
- **Gain de couverture, non cherché.** La pression ne demande **que le module** — pas `surface_bv`,
  absent sur 55 % du réseau et qui faisait jusqu'ici échouer le panneau entier.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/ressource.ts` | modifié | deux dénominateurs, cascade de refus par branche, réserve `stationPasSource` |
| `components/RessourcePanel.tsx` | modifié | pression en tête avec sa classe, autonomie ensuite comme ratio |
| `scripts/test/ressource.test.ts` | modifié | Chartres et Orléans en fixtures réelles, garde anti-régression sur la classe |
| `scripts/diag/replay-ressource.ts` | modifié | invariant pression < autonomie |

---

## 3. Erreurs potentielles

### Le défaut corrigé, et ce qu'il dit de ma manière de travailler

Le Sprint 27 avait **trouvé** le bon fait (Toulouse à 487 % n'est pas une surexploitation) et en
avait tiré **le mauvais correctif** : un cas particulier au-dessus d'un seuil, au lieu de remonter à
la cause. J'ai patché là où le résultat était visiblement absurde, sans me demander ce que le chiffre
valait là où il ne l'était pas. **Chartres à 37 % « Élevé » ne choquait personne — et était tout
aussi faux** (0,8 % en pression réelle).

### Ce que le rejeu réel a confirmé, et ajouté

Quatre villes (mode `app`, run 30) :

| Site | Pression | Autonomie | Lecture |
| --- | --- | --- | --- |
| **Orléans** | **0,03 % « Faible »** | refusée (rapport 1 338) | **Produit enfin un chiffre** — le modèle refusait tout avant. Le gain de couverture est réel. |
| **Chartres** | **0,83 % « Faible »** | **37 %** | Exactement les deux ordres de grandeur prédits, sur les mêmes entrées. |
| **Toulouse** | **74,96 % « Très élevé »** | **× 4,9** | Voir ci-dessous. |
| **Rennes** | — | — | Pas de module : dégradation propre. |

**Ce que Toulouse a encore montré.** Sa pression sort à 75 % « Très élevé » — et c'est un artefact :
la station rattachée est **l'Hers** (768 km²), pas la **Garonne** où la ville puise. Le chiffre est
arithmétiquement juste et porte sur la mauvaise rivière.

**Ajouté en conséquence** : quand les **deux** signaux concordent — la commune dépasse sa production
locale *et* la pression sur le cours d'eau le plus proche est forte — c'est la signature d'une
commune alimentée par un cours d'eau plus important que celui mesuré. Une réserve dédiée le dit,
là où la réserve générique se contentait de mentionner l'éventualité. Les deux ratios pris ensemble
disent quelque chose qu'aucun ne dit seul.

### Ce qui reste incertain

- **Quel dénominateur est « le bon » dépend de la question**, et l'outil ne peut pas la deviner. Le
  choix fait — la pression en tête, avec la classe WRI — suppose que « le cours d'eau a-t-il assez
  d'eau » est la question principale. C'est défendable et aligné sur les référentiels ESG, mais
  c'est un choix, pas une vérité.
- **La station rattachée n'est pas forcément la source**, et la réserve combinée ne fait que le
  **signaler** : le 75 % de Toulouse est toujours affiché, avec sa classe « Très élevé ». Un lecteur
  pressé le prendra pour argent comptant. Corriger vraiment demanderait de savoir dans quel cours
  d'eau la commune puise — les coordonnées des ouvrages BNPE le permettraient peut-être.
- **Les prélèvements restent communaux**, rapportés à un débit ponctuel. La géométrie ne coïncide
  pas plus qu'avant ; elle est simplement moins fausse.
- **Le rendu visuel n'a toujours pas été vu avec de vraies données** — troisième sprint consécutif où
  je le signale sans pouvoir y remédier depuis le bac à sable.

### Hypothèses qui pourraient ne pas tenir

- **Le module comme « débit disponible »** ignore qu'une part doit rester au milieu (débit réservé,
  DOE). La réserve `pasUnDroit` le dit, mais le dénominateur reste le débit total.
- **L'invariant « pression < autonomie »** ajouté au rejeu suppose que la commune est plus petite que
  le bassin de la station. Vrai partout où je l'ai vérifié, faux en principe pour une très grande
  commune sur un tout petit bassin — le test le signalerait à tort.

---

## 4. Points d'amélioration

**Dette assumée** :

- Le bassin versant réel (BVSpe) écarté sur arbitrage : il n'améliore que la branche autonomie.
- Le débit réservé non déduit : la donnée DOE par point nodal n'est pas disponible.

**À reprendre** :

- **Identifier le vrai cours d'eau d'une commune.** La réserve combinée ajoutée en fin de sprint
  *signale* le cas Toulouse mais ne le corrige pas : le 75 % reste affiché. Les coordonnées des
  ouvrages BNPE, rattachées au réseau hydrographique, diraient où la commune puise réellement.
- **`lib/ressource.ts` approche les 400 lignes** avec deux branches imbriquées ; la cascade de refus
  gagnerait à être extraite.
- **Trois sprints à signaler la même chose** (rendu visuel non vérifié) : il faudrait soit un
  déploiement de preview systématique, soit accepter que ce point ne se règle pas depuis ici.

---

## 5. État Git

- **Branche de session** : `claude/outil-portefeuille-sites-pertinence-1y4e3a`
- **`main` touché ?** : **OUI** — merge `467455b`, **à la demande explicite de l'utilisateur** en fin de session, après rédaction de ce compte rendu. La ligne précédente disait « non » et était exacte à l'écriture ; corrigée plutôt que laissée fausse, un compte rendu devant décrire l'état final de sa session.
- **Déployé en prod ?** : oui, via le déploiement Vercel de `main`. ⚠️ Le modèle avait déjà tourné contre les vraies sources avant le merge (mode `app`, run 30) — c'est ce qui a fait apparaître l'artefact toulousain. Reste non vérifié : le **rendu visuel**, qu'aucune sonde ne contrôle.
- **Vérifications passées** : `npm run build` ✅ · `npm run lint` ✅ · **17/17 suites** · **22/22 e2e**
  · **rejeu sur données réelles** ✅ (4 bassins, run 30, `data/diag` purgé).

---

## 6. Prochaines étapes

| # | Étape | Ce qui la conditionne |
| --- | --- | --- |
| 1 | **Import CSV + géocodage batch BAN** | Rien. Reste le blocage n°1 du produit. |
| 2 | **Voir les panneaux à l'écran avec de vraies données** | Un déploiement de preview. Signalé au 26, au 27, et encore ici. |
| 3 | **Identifier le vrai cours d'eau d'une commune** | Les ouvrages BNPE portent des coordonnées ; les rattacher au réseau hydrographique dirait où la commune puise réellement. Lèverait l'artefact Toulouse au lieu de le signaler. |
| 4 | **Bassin versant réel (BVSpe)** | Sonde, script de construction, shards embarqués. À évaluer maintenant que l'autonomie est secondaire. |
| 5 | **Consommer `ZoneHistory.premiereAnnee`** | Rien — le champ est là depuis le Sprint 27, toujours sans consommateur. |

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Imaginez une ville traversée par un grand fleuve. On veut savoir si elle consomme trop d'eau. Deux
manières de poser la question, qui n'ont pas la même réponse :

1. **« Le fleuve a-t-il assez d'eau ? »** On compare ce que la ville pompe à ce qui passe dans le
   fleuve. Comme le fleuve arrive déjà chargé de l'eau tombée en amont, souvent à des centaines de
   kilomètres, il en passe beaucoup : le pourcentage est petit.
2. **« Cette ville vit-elle de sa propre eau ? »** On compare ce qu'elle pompe à ce que la pluie
   produit **sur son territoire à elle**. Là, une ville dense sur un grand fleuve dépasse largement
   les 100 % — non parce qu'elle épuise quoi que ce soit, mais parce qu'elle boit l'eau des autres.

Le modèle livré au sprint précédent calculait la **deuxième**, l'appelait « taux d'exploitation » et
la notait sur une échelle internationale conçue pour la **première**. Les chiffres étaient justes ;
l'étiquette dessus ne l'était pas.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Module** | Le débit moyen d'une rivière en un point, sur plusieurs années. Il inclut **tout** ce qui vient de l'amont. |
| **Débit spécifique** | Le module divisé par la surface du bassin, en l/s/km² : ce que produit **un km²** de ce territoire. |
| **Production locale** | Le débit spécifique multiplié par la surface de la commune : ce que la commune génère elle-même. |
| **Échelle WRI Aqueduct** | Les seuils 10/20/40/80 % du World Resources Institute. Conçus pour un rapport prélèvements / ressource **disponible**, apports amont compris. |
| **Dénominateur** | Ce par quoi on divise. Toute la question de ce sprint. |

### 7.3 Comment le code s'y prend

**Avant** — un seul chemin, et il divisait par la production locale :

```ts
const ressourceCommuneM3An =
  (debitSpecifiqueLsKm2 / 1000) * surfaceCommuneKm2 * SECONDS_PER_YEAR;
tauxExploitation = input.prelevementsCommuneM3 / ressourceCommuneM3An;
classe = classeWri(tauxExploitation);       // ← l'échelle de l'AUTRE question
```

**Après** — deux calculs, et l'échelle ne suit plus qu'un seul :

```ts
// lib/ressource.ts — question 1 : le cours d'eau a-t-il assez d'eau ?
const debitDisponibleM3An = moduleM3s * SECONDS_PER_YEAR;
pressionCoursEau = preleve / debitDisponibleM3An;
classePression = classeWri(pressionCoursEau);   // la classe reste ICI, et nulle part ailleurs

// question 2 : ce territoire vit-il de sa propre eau ?
autonomieTerritoire = preleve / ressourceCommuneM3An;
dependanceAmont = autonomieTerritoire > 1;      // une lecture, pas un mode de secours
```

Remarquez ce qui a **disparu** : il n'y a plus d'appel à `classeWri` sur l'autonomie. C'est tout le
correctif. Un test l'interdit explicitement, parce que c'est la ligne qu'un futur contributeur
rajouterait de bonne foi en trouvant bizarre qu'un des deux chiffres n'ait pas de classe.

**L'effet de bord heureux.** L'ancienne garde refusait tout dès que la surface du bassin manquait :

```ts
if (!(moduleM3s && moduleM3s > 0) || !(surfaceBvKm2 && surfaceBvKm2 > 0)) return { available: false, … };
```

Or la pression n'a pas besoin de cette surface — seulement du module. La garde ne porte donc plus
que sur le module, et la surface du bassin ne conditionne que la seconde branche. Comme ce champ
manque sur 55 % du réseau français, le panneau passe de « muet une fois sur deux » à « donne au
moins le chiffre principal ».

### 7.4 Pourquoi ces choix plutôt que d'autres

**Deux nombres plutôt qu'un mieux nommé.** On aurait pu garder un seul ratio et corriger son
libellé. Mais les deux questions sont légitimes et un utilisateur veut souvent les deux : « est-ce
que je pèse sur la rivière » et « est-ce que mon territoire dépend de l'extérieur ». Les fusionner
obligerait à trancher pour lui.

**Ne pas plafonner l'autonomie à 100 %.** Tentant, pour que le chiffre « rentre » dans un
pourcentage. Ce serait détruire l'information la plus intéressante : × 4,9 pour Toulouse *dit*
quelque chose de vrai sur sa dépendance.

**Restreindre les refus à leur branche.** Avant, un rapport de surfaces aberrant annulait tout.
Or ce rapport ne concerne que la transposition, donc l'autonomie. Orléans conserve désormais sa
pression et perd seulement son autonomie — le refus est devenu *proportionné* à ce qui pose problème.

### 7.5 Pour expérimenter soi-même

**Expérience 1 — voir les deux réponses sur les mêmes entrées.**

```bash
npx tsx scripts/test/ressource.test.ts
```

Section 2 : `Chartres: pressure under 1 %, classed 'faible'` et `Chartres: autonomy near 37 %`
passent tous les deux, à partir d'un **unique** jeu de chiffres — ceux relevés sur la vraie station
de l'Eure à Lèves. C'est la démonstration entière du sprint en deux assertions.

**Expérience 2 — remettre le bug** (la plus instructive).
Dans `lib/ressource.ts`, ajoutez la ligne que le sprint a supprimée, juste après le calcul de
l'autonomie :

```ts
autonomieTerritoire = preleve / ressourceCommuneM3An;
classePression = classeWri(autonomieTerritoire);   // ← la faute d'origine
```

Relancez : `Chartres: pressure under 1 %, classed 'faible'` échoue, parce que Chartres redevient
« Élevé ». Vous venez de reproduire le défaut du Sprint 27 en une ligne — et de voir qu'il ne
ressemble pas à un bug, mais à une amélioration.

**Expérience 3 — mesurer le gain de couverture.**
Toujours dans les tests, section 2 bis : `no catchment area → the pressure is still produced`.
Commentez la ligne `if (surfaceBvKm2 && surfaceBvKm2 > 0) {` et son bloc dans `lib/ressource.ts`
pour revenir à l'ancienne garde, et ce test échoue. C'est 55 % du réseau hydrométrique français qui
bascule entre les deux versions.
