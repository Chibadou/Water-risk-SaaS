# Compte rendu — quinze arbitrages tranchés, et la file de sprints qui en découle (hors sprint)

**Date** : 2026-08-08 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : hors sprint (cadrage des sprints 38→46)

> Second compte rendu du 2026-08-08. Le premier
> ([`2026-08-08-note-technique-conception.md`](./2026-08-08-note-technique-conception.md)) raconte
> l'intégration de la note et l'analyse d'écart ; celui-ci raconte l'**arbitrage** des questions que
> cette analyse avait laissées ouvertes, et la **file de sprints** qui en découle. Deux unités de
> travail distinctes, deux fichiers datés — la convention interdit de réécrire un compte rendu.

---

## 1. La question initiale

> « tranchons les arbitrages restants et autres zones d'ombres, ensuite je te demanderai de faire un
> plan pour lancer les sprints à la suite »
>
> puis : « Rédige ce plan de sprints »

**Ce que j'ai compris** : deux temps explicitement séparés par l'utilisateur. D'abord **fermer toutes
les questions ouvertes** — les trois que mon analyse d'écart avait laissées en suspens, les quatre du
§11 de la note, et les zones d'ombre que l'analyse avait révélées sans les nommer comme telles.
Ensuite seulement, écrire la file de sprints, une fois qu'elle peut être écrite **avec** les décisions
plutôt qu'en les contournant.

**Ce que j'ai délibérément laissé de côté** :

- **Trancher moi-même ce qui relevait du produit.** Quinze questions sont parties à l'utilisateur en
  trois passes de quatre. Je n'ai décidé seul que deux points de faible enjeu (les horizons CSRD, où
  la note recommande elle-même « les deux » ; et le fait de sonder `rotation` avant de l'écrire), et
  je le dis ici plutôt que de les faire passer pour des décisions utilisateur.
- **Écrire du code.** La file décrit neuf sprints ; aucun n'est commencé.
- **Estimer des durées.** « Sprint 38→46 » est une numérotation et un ordre de dépendance, **pas un
  calendrier**. Aucun de ces chantiers n'a été instruit par un sondage — c'est précisément l'objet du
  Sprint 38.

---

## 2. Ce qui a été réalisé

**En une phrase** : les quinze questions qui empêchaient d'écrire une file de sprints exécutable sont
tranchées, et la file est écrite avec les décisions incorporées à l'endroit exact où chacune mord.

**Dans les grandes lignes** :

- **Trois passes de quatre questions**, chacune posée avec son coût réel plutôt qu'en abstrait — parce
  qu'une question d'arbitrage sans son prix n'est pas une question, c'est un sondage d'opinion.
- **Deux vérifications de code avant de poser les questions**, et toutes deux ont changé ce que je
  m'apprêtais à demander (voir §3).
- **La file passe de 8 à 9 sprints** (38→46) : un **Sprint 38 de probe préalable** est apparu comme
  conséquence directe de trois décisions qui, chacune, demandaient de mesurer avant de choisir.
- **Deux divergences avec la note sont désormais assumées et écrites** (G3, G4) plutôt que subies.
- **Un danger a été identifié qui n'existait dans aucune des questions prises isolément** : G4 et G5
  se combinent en un déplacement silencieux de tous les scores affichés.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `docs/SPRINTS.md` | modifié (section réécrite, 948 → 1 343 l.) | Les sprints 38→46 avec un graphe de dépendances, les critères d'acceptation de la note recopiés, et G1→G15 rappelés là où ils s'appliquent |
| `docs/ANALYSE-ECART-NOTE-TECHNIQUE.md` | modifié | §G réécrit : les 15 décisions avec leur coût, l'avertissement G4+G5, les deux divergences assumées, et « ce qui reste ouvert : rien qui bloque un sprint ». §A.2 et §F marqués tranchés |
| `docs/HANDBOOK.md` | modifié (684 → 700 l.) | Le bloc « trois décisions + deux arbitrages ouverts » remplacé par la table des quinze, plus l'avertissement G4+G5 en gras |
| `docs/comptes-rendus/2026-08-08-arbitrages…md` | neuf | Ce fichier |

**Les quinze décisions** :

| # | Zone | Décision |
|---|---|---|
| G1 | Sprint 21 | `joursContraints` remplacé par JS + IA |
| G2 | Intervalles | Fourchette partout, jusqu'aux exports |
| G3 | Juridictions | FR seule, abstraction préparée |
| G4 | Score 0-100 | Gardé en 4ᵉ indicateur |
| G5 | Anti-pattern n°1 | Niveau pondéré partout, score inclus |
| G6 | Euros | Repli CA supprimé |
| G7 | Énergie / agriculture | Gardées, avec avertissement |
| G8 | N1 | Fait public affiché / reconstitution interne |
| G9 | V_ref | Typé par régime |
| G10 | Réponse | `response_type` remplace `Dependance` |
| G11 | Profils de charge | Saisie client, défaut uniforme nommé |
| G12 | Validation ρ | Protocole annotable, taux laissé vide |
| G13 | SISPEA | Sonder d'abord |
| G14 | Hydroportail | Calcul maison gardé, écart mesuré |
| G15 | Hors France | « Non couvert », explicite |

---

## 3. Erreurs potentielles

### Deux vérifications qui ont corrigé mes questions avant que je les pose

**J'allais écrire que retirer `Dependance` (G10) touchait « `interruption.ts` et `portefeuille.ts` ».**
La vérification a montré trois choses de plus, dont une piégeuse :

1. `DEPENDANCE_FACTOR` est **dupliqué volontairement** (`interruption.ts:92` **et**
   `portefeuille.ts:48`), avec un commentaire qui assume la duplication.
2. `scripts/test/portefeuille.test.ts:377-383` garde les deux copies en phase **en lisant le texte
   source** de `interruption.ts` par `readFileSync` + regex. Or **G1 supprime ce fichier** : le test
   ne cassera pas au typage, il cassera à la lecture du fichier. Un échec qui ne ressemblera pas à sa
   cause — exactement le mode d'échec que le HANDBOOK §3 documente sous « le symptôme trompe ».
3. `dependanceAmont` dans `lib/ressource.ts` est un **homonyme sans rapport** (dépendance territoriale
   amont). Un `grep` sur « dependance » le remonte et aurait gonflé l'estimation.

**J'ai annoncé à l'utilisateur « 17 fichiers » avant cette vérification.** C'était le résultat brut
d'un `grep -l`, et il était trompeur. La correction est faite dans la file de sprints, qui nomme les
trois pièges plutôt que de citer un décompte.

**Seconde vérification** : `eurosARisque` (G6) ne vit pas que dans `portefeuille.ts` — il alimente la
**colonne CSV** (`SitesDashboard.tsx:531`) et une **phrase de la synthèse** qui teste `eurosParRepli`
(`executive.ts:143`), plus 3 vérifications de test. Le retrait est donc un peu plus large qu'un
`const` supprimé.

### Ce qui peut être faux dans ce livrable

- **Le Sprint 44 est le seul dont je ne sais pas dire la taille**, et je l'écris dans le sprint
  lui-même. `NiveauGravite` est référencé par 18 fichiers, `GRAVITE` par 17 — mais ces chiffres
  comptent des **mentions**, pas des endroits où la nomenclature à quatre niveaux est réellement
  présupposée. Un import de type ne coûte rien ; un tableau littéral des quatre niveaux (comme
  `LEVELS`, `interruption.ts:86`) est le vrai travail. **Ce tri n'a jamais été fait**, donc le sprint
  est numéroté mais pas dimensionné.
- **L'ordre des sprints est un jugement, pas une optimisation.** Il suit les dépendances techniques
  (ρ avant VNP, vecteur d'usages avant niveau pondéré), ce qui est vérifiable ; mais placer
  l'auditabilité en 44 plutôt qu'en 39 est un arbitrage de ma part, appuyé sur l'ADR-006 (« son coût
  augmente avec le retard ») et contredit par lui : à la lettre, l'auditabilité devrait passer en
  premier. J'ai choisi 44 parce que le Sprint 43 **crée** le besoin de versionnement, ce qui rend le
  chantier concret plutôt que théorique. C'est défendable, ce n'est pas démontré.
- **Le graphe de dépendances en ASCII est une simplification.** Il montre les dépendances dures ; il
  ne montre pas que 41 et 42 partagent des consommateurs, donc qu'ils se marcheront dessus s'ils sont
  menés en parallèle.
- **Les critères d'acceptation recopiés de la note ne sont pas tous atteignables**, et deux le disent
  explicitement : le taux d'accord ρ (G12, verrou humain) et le critère de renoncement de l'IA (« si
  la distribution des durées d'épisode n'est pas reproduite, ne pas livrer IA »). Un lecteur pressé
  pourrait les lire comme des objectifs ordinaires.
- **G5 suppose que le score baissera « généralement ».** C'est une inférence — un site dont l'usage
  dominant est en zone SUP dégradée pourrait voir son score **monter** si le maximum était porté par
  une zone AEP moins sévère. Je n'ai simulé aucun cas. La direction du déplacement est **supposée**,
  seul le fait qu'il y ait déplacement est certain.

### Non vérifié en conditions réelles

**Tout, et cette fois c'est structurel** : un plan de sprints ne se vérifie pas, il s'exécute. Aucune
des estimations de difficulté n'a été éprouvée, aucun probe n'a tourné, et les quatre questions du
Sprint 38 sont ouvertes précisément parce que personne ne connaît leurs réponses.

⚠️ **La dette de non-constaté du dépôt reste intacte** : l'avertissement en tête du HANDBOOK §5 vaut
toujours, et deux sessions documentaires consécutives ne l'ont pas réduit d'un pouce.

---

## 4. Points d'amélioration

**Dette assumée** :

- **La file est longue** (neuf sprints) et son horizon dépasse ce que le dépôt a jamais planifié
  d'avance. Le risque connu est celui que le HANDBOOK a déjà documenté le 2026-08-05 : une roadmap qui
  vieillit mal décourage de la rouvrir. Atténuation : chaque sprint porte son **verrou** plutôt qu'une
  estimation, et un verrou se re-vérifie facilement.
- **Trois sprints dépendent d'un travail humain ou commercial** (annotation ρ, numérisation des
  annexes d'arrêtés-cadres, sites pilotes). Ils sont écrits comme des sprints alors que ce sont
  partiellement des démarches. C'est volontaire — les cacher les rendrait invisibles — mais ça rend la
  file moins homogène qu'elle n'en a l'air.

**À reprendre** :

- **Dimensionner le Sprint 44 avant de l'ouvrir** : trier les 18 fichiers entre import de type et
  présupposé de nomenclature. Une demi-heure, et c'est la seule inconnue de taille de la file.
- **Décider comment le changement de méthode du Sprint 43 sera annoncé** — bandeau, date de version,
  double affichage temporaire ? La file exige l'annonce sans en fixer la forme, et c'est le genre de
  détail qui se règle mal en fin de sprint.
- **Rien ne force à trancher l'ordre 41/42** si les deux devaient être menés ensemble ; le graphe le
  suggère mais ne l'interdit pas.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — commit « Settle the fifteen arbitrations, and sequence the work they imply » (le hash exact se lit dans `git log` : un compte rendu ne peut pas citer le hash du commit qui le contient)
- **`main` touché ?** : **NON**. La branche attend une revue.
- **Déployé en prod ?** : **non**, sans objet — aucun code produit modifié.
- **Vérifications passées** :
  - **Critère principal** : `git diff --stat` ne touche que `docs/`. Aucun fichier de `lib/`,
    `components/`, `app/`, `scripts/`, `data/` modifié.
  - `npm run build` ✅, `npm run lint` ✅, **22 suites au vert**, **62/62 e2e** — rejoués.
  - **Garde-fou HANDBOOK** : 684 → **700 lignes** (+16, un bloc remplacé par un plus dense). Le
    contrôle existe à cause du bug du 2026-08-05 (fichier gonflé à 175 Mo).
  - **Découpage par numéro de ligne, avec assertion** : les deux remplacements de section (SPRINTS §
    chantiers, ANALYSE §G) ont été faits en Python **en asservissant les bornes à une assertion de
    contenu** avant écriture, jamais par `str.replace("")` — la recette imposée par le HANDBOOK §3
    après l'incident du découpage d'index.

---

## 6. Prochaines étapes

1. **Sprint 38 — le probe.** *Verrou : l'egress, donc l'escape hatch Actions ; penser à
   `on.push.branches`.* C'est le seul sprint qu'on peut ouvrir sans rien savoir de plus, et il
   débloque quatre décisions d'un coup. **À faire en premier, littéralement.**
2. **Dimensionner le Sprint 44** (§4). *Verrou : rien.* La seule inconnue de taille de la file.
3. **Sprint 39 — ρ à intervalles.** *Verrou : le verdict `rotation` du Sprint 38, pour ce seul type.*
   Le reste du sprint ne dépend de rien.
4. **Regarder la production**, toujours en attente depuis trois sessions. *Verrou : un œil humain sur
   `https://water-risk-saa-s.vercel.app`.* ⚠️ Deux sessions documentaires n'y ont rien changé, et la
   file de sprints qui commence va empiler du code par-dessus du non-constaté.
5. **Décider la forme de l'annonce du Sprint 43** (§4). *Verrou : une décision produit, à prendre
   avant le sprint et non pendant.*

---

## 7. Explication à un novice

> Aucun code n'a été écrit ici non plus. Ce qu'il y a à comprendre, c'est **comment on décide** quand
> une spécification arrive sur un produit qui existe déjà — et pourquoi deux décisions séparément
> raisonnables peuvent produire ensemble un résultat trompeur.

### 7.1 Le problème, en langage courant

Imaginez un outil qui donne une note de risque sur 100 à chacun de vos sites. Vous le consultez depuis
des mois. Un expert arrive et signale une erreur de méthode : pour calculer cette note, l'outil prend
le **pire** des trois niveaux d'alerte qui concernent le site — celui des rivières, celui des nappes,
celui du réseau d'eau potable — alors qu'un site branché sur le réseau se moque de l'état d'une nappe
dans laquelle il ne pompe pas.

On corrige. Les notes baissent. Et c'est là que le piège se referme : **vous allez lire cette baisse
comme une bonne nouvelle**. « Mes sites vont mieux. » Non : vos sites vont exactement pareil, c'est la
règle de calcul qui a changé. Personne ne vous l'a dit, parce que rien dans le produit n'était prévu
pour dire « ce chiffre a changé de définition le 12 mars ».

C'est le principal résultat de cette session : la découverte que deux décisions justes prises
séparément — garder la note (G4), corriger la méthode (G5) — se combinent en un mensonge involontaire.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Arbitrage** | Une question à laquelle le code ne peut pas répondre parce qu'elle engage le produit, pas la technique. Ici, quinze. |
| **Zone d'alerte SUP / SOU / AEP** | Trois découpages **différents et non superposés** : eaux de surface, eaux souterraines, réseau d'eau potable. Un site relève des trois à la fois, avec un niveau de gravité par découpage. |
| **Niveau effectif pondéré** | Au lieu de prendre le pire des trois niveaux, on les moyenne **en proportion des volumes** que le site prélève dans chacun. Un site à 95 % sur le réseau est à 95 % gouverné par le niveau du réseau. |
| **ρ (rho)** | La part d'un usage bloquée par une mesure : interdiction totale = 1, « réduction de 50 % » = 0,5. |
| **Mesure non quantifiée** | « Limiter au strict nécessaire » — impossible d'en tirer un chiffre. Fréquent. |
| **Probe** | Un programme jetable dont le seul but est de **répondre à une question factuelle** sur une source de données, avant d'écrire le vrai code. |
| **Critère d'acceptation** | La condition écrite d'avance qui dit si un sprint est fini. Sans lui, « fini » veut dire « fatigué ». |
| **Verrou** | Ce qui empêche un chantier de démarrer. Un chantier sans son verrou identifié n'est pas une étape, c'est un souhait. |
| **JEA** | Jours-équivalents d'arrêt : une usine à 60 % pendant 10 jours = 4 JEA. |

### 7.3 Comment on s'y est pris

**Poser une question d'arbitrage avec son prix.** Une question sans coût affiché ne se décide pas, elle
s'opine. Exemple réel : plutôt que « faut-il garder le score sur 100 ? », la question posée était
« le score est aujourd'hui la **clé de tri du portefeuille** (`SitesDashboard.tsx:439`) — donc le
support du classement que l'ADR-004 désigne comme le livrable le plus fiable. Le retirer signifie
classer par volumes déclarés, donc rendre inclassable tout site dont le client n'a rien saisi. »
La réponse a changé en conséquence : le score reste, comme divergence **assumée** avec la note.

**Vérifier le code avant de poser la question, pas après.** Deux fois, la vérification a modifié la
question. Le meilleur exemple est ce test :

```ts
// scripts/test/portefeuille.test.ts:377-382
// Les deux modules gardent leur propre copie exprès ; ceci attrape la dérive
// qui ferait diverger l'une de l'autre en silence.
const source = readFileSync("lib/interruption.ts", "utf-8");
const ok = (["faible", "moyenne", "forte", "critique"] as const).every((k) =>
  new RegExp(`${k}:\\s*${DEPENDANCE_FACTOR[k]}\\b`).test(source),
);
```

Ce test lit le **texte** d'un fichier. Or une des décisions (G1) **supprime ce fichier**. Le test ne
va donc pas échouer proprement avec « la valeur attendue est 1.4 » : il va planter sur un fichier
introuvable, dans un test dont le nom parle de portefeuille et pas d'interruption. Quelqu'un y perdra
une demi-heure. C'est maintenant écrit dans le sprint concerné.

**Laisser un sprint naître des décisions.** Trois réponses disaient la même chose sous trois formes :
« mesure avant de choisir » (SISPEA, Hydroportail, `rotation`). Plutôt que d'éparpiller trois probes,
la file en fait un **Sprint 38** qui répond aux quatre questions en un seul run — sur le patron de
`scripts/restrictions/probe_backlog.py`, qui au Sprint 22 avait instruit trois questions d'un coup et
**en avait fermé deux par constat négatif**. Un probe qui ne trouve rien n'a pas échoué : il a fermé
une question, et une question fermée par écrit ne se re-pose pas six mois plus tard.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Pourquoi accepter que le score contredise la note ?** Parce que la note se contredit elle-même sur
  ce point : elle dit « trois indicateurs et trois seulement », et son ADR-004 dit que **le classement
  est le livrable le plus fiable**. Retirer le score, c'était classer par volumes déclarés — donc ne
  plus classer du tout les sites dont le client n'a rien saisi. Respecter la lettre aurait coûté
  l'esprit.
- **Pourquoi trois passes de questions plutôt qu'une longue liste ?** Parce que les réponses de la
  première passe changeaient le sens des questions suivantes. Décider que le score survit (G4) rend la
  question « jusqu'où va la correction du niveau pondéré ? » (G5) beaucoup plus lourde : sans G4, elle
  n'aurait touché aucun chiffre déjà affiché.
- **Pourquoi mettre l'auditabilité en 44 alors que l'ADR-006 dit qu'elle coûte plus cher tard ?**
  Choix contestable, et je l'écris comme tel en §4. La raison : le Sprint 43 **crée** le besoin (un
  changement de méthode a besoin d'une version datée pour être annonçable), ce qui donne au chantier
  un client concret au lieu d'une exigence abstraite. Un chantier d'auditabilité sans utilisateur
  produit des champs que personne ne lit.
- **Pourquoi écrire les critères d'acceptation qu'on ne peut pas atteindre ?** Le taux d'accord ρ
  demande une annotation humaine ; l'écrire quand même, en disant qu'il restera vide, vaut mieux que
  l'omettre ou que le remplacer par un chiffre d'auto-évaluation. Un agent qui note sa propre
  extraction ne mesure rien du tout, et un chiffre faux est pire qu'une case vide.

### 7.5 Pour expérimenter soi-même

**a) Voir de vos yeux l'effet G4 + G5.** Ouvrez `components/SitesDashboard.tsx` autour de la ligne 81 :

```ts
function dashboardScore(st: SiteStatus | undefined): number | undefined {
  if (!st || st.state !== "ok") return undefined;
  return computeScore({ worst: st.worst, … }).score;
}
```

`st.worst` vient de `maxGravite(...)`, le maximum sur les trois zones. Remplacez temporairement le
`worst` par le niveau d'une seule zone — par exemple celle de type AEP — et relancez les tests :

```bash
npx tsx scripts/test/score-indisponible.test.ts
```

Vous verrez lesquelles des garanties tiennent encore. C'est, en miniature, ce que fera le Sprint 43 —
sauf qu'il pondérera par les volumes au lieu de choisir une zone. **Remettez le code d'origine ensuite**
(`git checkout components/SitesDashboard.tsx`).

**b) Casser le test piégeux, exprès.** Renommez `lib/interruption.ts` en `lib/interruption.old.ts` et
lancez :

```bash
npx tsx scripts/test/portefeuille.test.ts
```

Regardez le message d'erreur : il parle d'un fichier introuvable, dans une suite dont le nom évoque le
portefeuille. **C'est exactement ce qui arrivera au Sprint 42** si personne n'a lu l'avertissement.
Comprendre à quoi ressemble un échec est aussi utile que comprendre à quoi ressemble un succès.
Renommez en sens inverse ensuite.

**c) Chiffrer vous-même l'inconnue du Sprint 44.** Listez les fichiers concernés :

```bash
grep -rl "NiveauGravite" --include=*.ts --include=*.tsx . | grep -v node_modules
```

Ouvrez-les et classez-les en deux tas : ceux qui importent seulement le type (coût nul) et ceux qui
énumèrent réellement les quatre niveaux — cherchez les tableaux littéraux, par exemple `LEVELS` dans
`lib/interruption.ts:86`. Le second tas est le vrai coût du chantier de juridiction, et **personne ne
l'a encore compté**. C'est la contribution la plus utile qu'un lecteur puisse apporter à cette file en
une demi-heure.
