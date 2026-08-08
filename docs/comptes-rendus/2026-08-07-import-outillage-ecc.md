# Compte rendu — Revue du dépôt ECC et import sélectif d'outillage agent (hors sprint)

**Date** : 2026-08-07 · **Branche** : `claude/ecc-github-content-review-ua4nci` · **Sprint** : hors
sprint (aucun code produit modifié)

---

## 1. La question initiale

> https://github.com/affaan-m/ECC
>
> Est-ce que ce github dispose de contenu intéressant pour ce projet ? Importe les

**Ce que j'ai compris** : deux demandes enchaînées — d'abord un **jugement** (y a-t-il quelque chose
d'utile ?), ensuite un **import** de ce qui aura été jugé utile. L'ambiguïté était sur le « les » :
il pouvait désigner *tout le dépôt* ou *le contenu intéressant*. J'ai retenu la seconde lecture,
parce que la première est incompatible avec la question qui la précède — si l'import était
inconditionnel, il n'y avait pas de jugement à rendre.

**Ce que j'ai délibérément laissé de côté** :

- **Le dépôt dans son ensemble.** ECC pèse 92 Mo, 67 agents, 284 skills, 94 commandes, 122 fichiers
  de règles. Six fichiers ont été retenus, soit **1,7 %** des agents et skills. Le motif de chaque
  écart est écrit dans [`.claude/README.md`](../../.claude/README.md) — aucune piste n'est close en
  silence.
- **`hooks/`, `scripts/` (247 fichiers), `install.sh`, `mcp-configs/`.** Du code tiers exécutable et
  des instructions chargées automatiquement dans le contexte d'un agent. Rien de suspect n'y a été
  trouvé, mais **rien n'y a été audité non plus**, et l'apport fonctionnel était nul.
- **Toute modification du code produit.** Aucun fichier de `app/`, `lib/`, `components/` ou
  `scripts/` n'est touché par cette session.

---

## 2. Ce qui a été réalisé

**En une phrase** : le dépôt ECC ne contient **aucun contenu métier eau**, mais six de ses fichiers
d'outillage recoupent précisément trois défauts que ce projet a déjà payés — ils sont importés, avec
leurs réserves écrites à côté.

**Dans les grandes lignes** :

- **Le verdict d'abord** : ECC est un dépôt d'outillage pour agents de code (« optimize the context
  window, persist everything else »). Ni hydrologie, ni réglementation, ni données publiques
  françaises, ni cartographie. La recherche a porté sur les 284 noms de skills et les 67 noms
  d'agents : **zéro occurrence** d'un sujet métier de ce projet.
- **Trois agents retenus** parce que chacun répond à un bug **déjà survenu ici**, pas à un risque
  théorique : `silent-failure-hunter` (le `/api/swi` qui répondait 200 en écartant toutes ses
  lignes), `type-design-analyzer` (le `undefined` du Sprint 35 qui signifiait deux choses),
  `a11y-architect` (qui impose de décrire l'arbre ARIA produit — la règle du protocole maison).
- **Trois skills retenus** : `accessibility` (le référentiel WCAG 2.2 qui manquait — le projet avait
  la méthode de vérification, pas la liste des critères), `frontend-a11y` (patrons React), et
  `click-path-audit`, qui trace les handlers s'annulant entre eux : c'est le mode d'échec exact du
  bug vieux de six sprints trouvé au Sprint 29, celui qu'aucune sonde de nombres ne pouvait montrer.
- **Deux skills écartés pour redondance affaiblissante**, ce qui est le résultat le moins attendu de
  la revue : `verification-loop` s'arrête à build + types + lint + tests + 80 % de couverture, et
  `rules/common/testing.md` érige la couverture en critère d'acceptation. Ce dépôt a précisément un
  problème que la couverture ne mesure pas — du code qui **passait** ses tests et était **faux en
  prod**. Les adopter, ce serait baisser la barre.
- **`nextjs-turbopack` écarté pour contradiction directe** avec `AGENTS.md`, qui impose de lire
  `node_modules/next/dist/docs/` plutôt que des conseils Next.js de seconde main.
- **Fichiers repris verbatim**, réserves écrites à côté : les six fichiers ne sont pas retouchés,
  pour que la comparaison avec l'amont reste possible à la prochaine mise à jour.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `.claude/README.md` | neuf | Provenance, licence, tri motivé, réserves d'usage, procédure de réimport |
| `.claude/LICENSE-ECC` | neuf | Licence MIT d'ECC (Copyright 2026 Affaan Mustafa) — obligation d'attribution |
| `.claude/agents/silent-failure-hunter.md` | importé verbatim | Traque `catch {}`, `.catch(() => [])`, replis qui masquent un échec |
| `.claude/agents/type-design-analyzer.md` | importé verbatim | Évalue si les types rendent les états illégaux impossibles |
| `.claude/agents/a11y-architect.md` | importé verbatim | WCAG 2.2 AA ; sortie incluant l'arbre d'accessibilité |
| `.claude/skills/accessibility/SKILL.md` | importé verbatim | Critères WCAG 2.2, anti-patrons, checklist |
| `.claude/skills/frontend-a11y/SKILL.md` | importé verbatim | Patrons a11y React/Next (labels, `aria-live`, focus, clavier) |
| `.claude/skills/click-path-audit/SKILL.md` | importé verbatim | Audit de séquence d'états par point de clic |
| `docs/HANDBOOK.md` | modifié | Entrée de session |

---

## 3. Erreurs potentielles

- **Aucun de ces six fichiers n'a été mis à l'épreuve sur ce dépôt.** C'est la réserve principale et
  elle vaut pour l'import entier : ils ont été **lus intégralement** (1 096 lignes) et jugés
  pertinents *par rapport à des bugs passés*, mais aucun n'a encore tourné sur `lib/` ni sur
  `components/`. Leur utilité est **argumentée, pas démontrée**. La seule façon de la démontrer est
  de lancer `silent-failure-hunter` sur `lib/hubeau.ts` et de regarder si ce qu'il sort était déjà
  connu.
- **`click-path-audit` suppose une architecture que ce projet n'a pas.** Son exemple et sa méthode
  reposent sur un store global (Zustand) dont les actions réinitialisent des champs qu'elles ne
  possèdent pas. Ici l'état vit en `localStorage` et dans des `useState` de composants : la mécanique
  de bug qu'il décrit **peut ne pas exister sous cette forme**. Le squelette (cartographier les
  écritures, puis tracer chaque handler) reste valable, mais je ne peux pas affirmer que le skill
  trouvera quoi que ce soit ici.
- **Le skill renvoie à des skills `/superpowers:*` inexistants dans ce dépôt.** Un agent qui le suit
  à la lettre échouera sur ces renvois. Signalé dans `.claude/README.md`, **pas corrigé dans le
  fichier** — choix assumé de garder l'amont intact, qui se paie par une réserve à lire.
- **Le tri est une opinion, pas une mesure.** « `verification-loop` est plus faible que le workflow
  maison » repose sur une lecture comparée des deux, pas sur un essai. Un lecteur peut légitimement
  vouloir l'importer quand même.
- **Aucune vérification de sécurité n'a été menée sur les fichiers importés au-delà de leur
  lecture.** Ils ne contiennent pas de code exécutable et n'ont pas d'effet tant qu'aucun agent ne
  les invoque, mais ce sont des **instructions** : elles entrent dans un contexte d'agent. Le
  préambule « Prompt Defense Baseline » qu'ils portent vient d'ECC et **n'a pas préséance sur
  `AGENTS.md`** — c'est écrit dans le README, ce n'est pas garanti par un mécanisme.
- **Ce qui casserait si l'amont changeait** : rien, l'import est une copie figée. En sens inverse,
  les six fichiers ne recevront **aucune correction publiée par ECC** — la mise à jour est manuelle,
  et la procédure est dans le README.
- **`npm run build`, `lint`, les 20 suites et les e2e n'ont pas été relancés.** Aucun fichier
  compilé, testé ou servi n'est modifié : `.claude/` et `docs/` sont hors du périmètre de build. Ce
  n'est pas une omission, c'est un constat — mais c'est aussi la raison pour laquelle **rien ici
  n'est prouvé par une exécution**.

---

## 4. Points d'amélioration

**Dette assumée** :

- **Fichiers non adaptés au projet.** `accessibility` et `a11y-architect` couvrent iOS et Android,
  sans objet ici. Les élaguer les rendrait plus courts à lire mais casserait la comparaison avec
  l'amont. Le choix est réversible : si la mise à jour depuis ECC n'a jamais lieu, l'argument tombe
  et l'élagage devient gratuit.
- **La règle maison la plus utile n'est dans aucun des fichiers importés** : *un attribut ARIA
  présent dans le DOM n'est pas un attribut exposé* (`aria-label` sur un `<span>` nu est ignoré).
  ECC ne la connaît pas. Elle reste dans le HANDBOOK et dans `CHECK-LECTEUR-ECRAN.md`, donc un agent
  qui n'ouvrirait que `.claude/skills/frontend-a11y/SKILL.md` la manquerait.

**À reprendre** :

- **`.claude/` n'existait pas avant cette session**, et l'ajouter change la façon dont les outils
  agent lisent ce dépôt. C'est un effet de bord de l'import, pas une décision produit : si la
  convention ne convient pas, tout est dans un seul répertoire à supprimer.
- **Le tri mérite d'être rejoué après usage.** Trois agents et trois skills, c'est un pari sur ce qui
  servira. Après deux ou trois sessions, ce qui n'a jamais été invoqué devrait être retiré plutôt que
  gardé « au cas où ».

---

## 5. État Git

- **Branche de session** : `claude/ecc-github-content-review-ua4nci` — voir le dernier commit poussé
- **`main` touché ?** : **NON**. Aucun merge, aucune demande en ce sens.
- **Déployé en prod ?** : **non**, et sans objet — aucun fichier servi par l'application n'est
  modifié. Un déploiement Vercel de cette branche serait identique à `main`.
- **Vérifications passées** : **aucune, et c'est délibéré**. `.claude/` et `docs/` ne sont ni
  compilés, ni lintés, ni testés, ni servis. ⚠️ **Ne pas lire cette ligne comme « tout est au
  vert »** : la vérité est que rien n'a été exécuté parce qu'il n'y avait rien à exécuter.

---

## 6. Prochaines étapes

Par valeur décroissante, avec leur verrou :

1. **Lancer `silent-failure-hunter` sur `lib/hubeau.ts`, `lib/swi.ts` et les routes `app/api/`.**
   C'est le seul moyen de savoir si l'import valait quelque chose, et le terrain est le meilleur
   possible : ces fichiers ont **déjà** produit un échec silencieux en prod. *Verrou* : aucun —
   faisable immédiatement, sans egress.
2. **Reprendre les points de la §5 du HANDBOOK avant tout nouvel outillage.** Deux tâches y attendent
   un œil humain (le fond de tuiles de `/carte`, les cinq chapitres de la fiche site avec de vraies
   données). Elles produisent de la valeur produit ; cet import n'en produit aucune tant qu'il n'est
   pas utilisé. *Verrou* : un navigateur sur le déploiement de prod.
3. **Passer `frontend-a11y` sur `SiteToc`, les bascules de couches et les popups de carte.** Le
   Sprint 36 n'a traité que le champ d'adresse. *Verrou* : aucun — l'arbre ARIA se lit sous Playwright
   avec des bouchons, egress ou pas.
4. **Essayer `click-path-audit` sur la page `/carte`.** C'est là que les états interagissent le plus
   (bascules, popup ouverte, objet sélectionné, cadrage). *Verrou* : la méthode suppose un store
   global — il faudra d'abord cartographier ce qui en tient lieu ici, et ça peut révéler que le skill
   est sans objet.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Quelqu'un signale un dépôt public sur internet et demande : « est-ce qu'il y a là-dedans quelque
chose d'utile pour nous ? Prends-le. » Le dépôt en question ne parle pas du tout du même sujet que
notre projet — nous faisons un outil sur le risque de manque d'eau en France, lui contient des
**modes d'emploi pour assistants de programmation**. Le travail n'est donc pas de traduire ou de
brancher du code : c'est de **trier**. Et trier, ici, veut surtout dire refuser, parce que le dépôt
contient 351 modes d'emploi et que la quasi-totalité concerne des technologies que nous n'employons
pas. Le piège est qu'un mode d'emploi inutile n'est pas neutre : il occupe de la place, et surtout il
peut **contredire** les règles que ce projet s'est données au prix de vrais bugs.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Agent** (ici) | Un fichier Markdown décrivant un rôle spécialisé qu'un assistant de code peut endosser (« relecteur de sécurité », « chasseur d'échecs silencieux ») |
| **Skill** (ici) | Un fichier Markdown décrivant une méthode réutilisable, chargé au besoin plutôt que collé dans chaque demande |
| **`.claude/`** | Répertoire où les outils agent vont chercher agents et skills propres à un dépôt |
| **Échec silencieux** | Un programme qui échoue sans le dire : il renvoie « tout va bien » ou une liste vide, et le bug se voit des étapes plus loin |
| **Arbre ARIA** | La version de la page que « voit » un lecteur d'écran. Différente du HTML : certains attributs y sont ignorés |
| **WCAG 2.2 AA** | Le référentiel international d'accessibilité web, et son niveau de conformité courant |
| **Egress bloqué** | Dans notre bac à sable de développement, les appels réseau sortants sont interdits : les API françaises de l'eau sont donc injoignables en local |
| **VigiEau / Hub'Eau** | Les services publics français d'où viennent nos données (arrêtés de restriction, débits de rivières, niveaux de nappes) |
| **Licence MIT** | Licence libre très permissive : on peut copier et modifier, à condition de conserver la mention de copyright |

### 7.3 Comment le code s'y prend

Il n'y a pas de code dans cette session — seulement des fichiers de documentation et de
configuration. Le « cheminement » est donc celui de la décision, et il est reproductible :

**Étape 1 — inventorier avant de juger.** Cloner en surface (`--depth 1`, l'historique ne sert à
rien) et compter, plutôt que se fier au README :

```bash
git clone --depth 1 https://github.com/affaan-m/ECC.git /tmp/ecc
for d in agents skills commands rules hooks scripts; do
  echo "$d: $(find $d -type f | wc -l) fichiers, $(du -sh $d | cut -f1)"
done
# skills: 460 fichiers, 5,4M   ·   docs: 1510 fichiers, 18M   ·   scripts: 247 fichiers, 2,6M
```

**Étape 2 — chercher le métier, et acter son absence.** Lister les 284 noms de skills et y chercher
notre sujet. Le résultat est un **constat négatif**, et il vaut d'être écrit : `accessibility`,
`django-celery`, `homelab-vlan-segmentation`, `defi-amm-security`… rien sur l'eau, l'hydrologie, la
réglementation environnementale ou la cartographie. C'est cette absence qui détermine tout le reste :
l'import ne pourra jamais apporter de **valeur produit**, seulement de la **méthode**.

**Étape 3 — retenir uniquement ce qui répond à un bug déjà survenu.** C'est le critère qui fait le
tri, et il est plus dur qu'il n'en a l'air : il interdit de garder un fichier parce qu'il est bien
écrit. Exemple pour `silent-failure-hunter`, dont le fichier dit :

```markdown
### 3. Dangerous Fallbacks
- default values that hide real failure
- `.catch(() => [])`
- graceful-looking paths that make downstream bugs harder to diagnose
```

Ce n'est pas une inquiétude abstraite ici. Le 31 juillet, notre route `/api/swi` répondait `200 OK`
avec le message « aucune mesure récente ». Elle était en réalité **totalement cassée** : les fichiers
de Météo-France sont des `.csv.gz` dont la dernière colonne se termine par un retour chariot Windows,
si bien que `Number("0.949\r")` vaut `NaN` et que **toutes** les lignes étaient écartées. Un `.gz`
mal déballé plus un `\r` mal coupé, et l'endpoint annonçait sereinement qu'il n'y avait rien à dire.
Un fichier qui apprend à chercher exactement ce motif mérite sa place.

**Étape 4 — écrire les refus, pas seulement les acceptations.** C'est la moitié du travail, et elle
vit dans `.claude/README.md`. Deux cas valent d'être compris :

- *Redondance affaiblissante* : le skill `verification-loop` propose « build, types, lint, tests,
  80 % de couverture ». C'est raisonnable, et c'est **moins** que ce que ce projet exige déjà (les
  e2e en plus, et surtout une vérification sur données réelles). L'importer donnerait à un agent une
  définition plus laxiste de « c'est vérifié ». Un bon conseil peut nuire s'il remplace un meilleur.
- *Contradiction* : `nextjs-turbopack` explique Next.js 16. Or `AGENTS.md`, la première chose que lit
  un agent sur ce dépôt, commence par « This is NOT the Next.js you know » et impose de lire la
  documentation embarquée dans `node_modules/`. Deux sources d'autorité concurrentes sur le même
  sujet, c'est pire qu'une seule.

**Étape 5 — copier sans retoucher, et mettre les réserves à côté.**

```bash
for a in silent-failure-hunter type-design-analyzer a11y-architect; do
  cp /tmp/ecc/agents/$a.md .claude/agents/
done
cp /tmp/ecc/LICENSE .claude/LICENSE-ECC   # MIT : l'attribution est une obligation
```

### 7.4 Pourquoi ces choix plutôt que d'autres

**Tout importer, puisque c'est gratuit ?** Non, et c'est le point le moins intuitif. La place disque
est gratuite, l'**attention** ne l'est pas : ces fichiers existent pour être lus par un assistant qui
a une fenêtre de contexte finie. 351 modes d'emploi dont 345 hors sujet, c'est un moteur de recherche
avec 98 % de bruit. Pire, plusieurs contrediraient nos propres règles — et un lecteur qui rencontre
deux règles opposées ne suit pas la meilleure, il suit la dernière lue.

**Ne rien importer, puisqu'il n'y a rien sur l'eau ?** Non plus. Nos trois bugs les plus coûteux
n'étaient pas des bugs métier : un échec silencieux, un `undefined` qui voulait dire deux choses, un
attribut d'accessibilité présent mais ignoré. Ce sont des défauts d'artisanat, et l'artisanat se
partage entre projets qui n'ont rien à voir.

**Réécrire les fichiers à notre sauce ?** Tentant — ils parlent d'iOS et d'Android dont nous n'avons
que faire. Mais un fichier réécrit ne se compare plus à son amont : à la prochaine version d'ECC, on
ne saurait plus dire ce qui a changé chez eux et ce qu'on avait modifié. Réserves à côté, fichiers
intacts. Ce choix se paie d'une lecture en deux endroits, et il est réversible dans un sens
seulement — d'où le fait de commencer par là.

**Pourquoi `.claude/` et pas `docs/` ?** Parce que ce n'est pas de la documentation destinée à un
humain : ce sont des instructions destinées à être **chargées** par un outil, qui les cherche à cet
endroit précis. Les mettre dans `docs/` les rendrait invisibles à l'outil et polluerait un répertoire
qui, lui, s'adresse à des lecteurs.

### 7.5 Pour expérimenter soi-même

**1 — Refaire le tri soi-même, et voir s'il tient.** Le jugement rendu ici est contestable ; le
vérifier prend cinq minutes :

```bash
git clone --depth 1 https://github.com/affaan-m/ECC.git /tmp/ecc
ls /tmp/ecc/skills | wc -l                                  # 284
ls /tmp/ecc/skills | grep -iE "water|eau|hydro|geo|gis|map"  # attendu : rien
head -40 /tmp/ecc/skills/verification-loop/SKILL.md          # comparer à la §6 du HANDBOOK
```

La dernière ligne est la plus instructive : mettre côte à côte ce que propose ECC et ce
qu'exige `docs/HANDBOOK.md` §6, puis se demander lequel on voudrait voir suivi.

**2 — Mettre l'import à l'épreuve du vrai terrain.** Demander à un assistant d'appliquer
`.claude/agents/silent-failure-hunter.md` à `lib/hubeau.ts`, puis relire `docs/HANDBOOK.md` §1 à la
date du 31 juillet 2026. Question à se poser : *aurait-il trouvé le bug du SWI ?* S'il ne trouve que
des choses déjà connues, l'import n'a rien coûté mais n'a rien rapporté — et il faudra le dire.

**3 — Casser un test pour voir ce qu'il protège** (l'exercice le plus formateur, et il ne concerne
pas l'import) :

```bash
npx tsx scripts/test/swi.test.ts       # doit passer
```

Ouvrir ensuite `lib/swi.ts` et supprimer le nettoyage du retour chariot en fin de ligne — c'est
exactement le bug de production du 31 juillet, réintroduit à la main. Relancer le test : il échoue.
L'intérêt n'est pas l'échec, c'est **ce qu'il dit** : ce test existe parce qu'un jour, faute de lui,
un endpoint a répondu « aucune mesure récente » pendant des semaines en ayant l'air parfaitement en
bonne santé. C'est aussi, très exactement, ce que `silent-failure-hunter` est censé apprendre à
flairer avant que ça n'arrive.
