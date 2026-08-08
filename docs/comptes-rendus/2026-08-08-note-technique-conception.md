# Compte rendu — intégration de la note technique de conception (hors sprint)

**Date** : 2026-08-08 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : hors sprint (session documentaire, avant les sprints 38→45)

---

## 1. La question initiale

> « @hydrovigienotetechnique.md Intègre ce fichier au repository et applique le plan »

**Ce que j'ai compris** : verser au dépôt la note technique de conception v1.0 fournie, puis exécuter
le plan qu'elle décrit. Deux ambiguïtés à lever avant d'agir, et je les ai levées en posant la
question plutôt qu'en décidant seul :

1. **« Appliquer le plan » ne peut pas signifier tout l'implémenter.** La note séquence **cinq
   chantiers** dont un modèle à transitions markoviennes calibré sur dix ans d'arrêtés avec validation
   *leave-one-department-out*, une extraction LLM de 77 000 lignes de mesures avec validation humaine
   sur échantillon stratifié, et une seconde juridiction. C'est un programme de plusieurs mois, dont
   au moins deux verrous ne sont pas du code (annotation humaine, sites pilotes commerciaux).
2. **La note contredit des indicateurs déjà livrés et mergés en production.** Elle interdit
   explicitement dix pratiques ; le dépôt en commet quatre. Décider quoi refaire demandait de savoir
   d'abord, précisément, où l'on se trouve.

**Périmètre arbitré par l'utilisateur : documentaire seul.** Aucun code produit n'est modifié. Trois
décisions d'implémentation ont malgré tout été tranchées par l'utilisateur dans le même échange, pour
être **écrites dans la roadmap** et appliquées aux sprints suivants — pas maintenant.

**Ce que j'ai délibérément laissé de côté** :

- **Tout le code produit.** `lib/`, `components/`, `app/`, `scripts/` sont inchangés. C'est vérifiable
  en une commande, et c'est le critère d'acceptation principal de la session (§5).
- **Les trois options de code que j'avais proposées** (socle + triptyque JS/VNP/IA ; ρ + VNP seuls ;
  socle + import par lot) — écartées par l'utilisateur au profit de l'option documentaire.
- **Trancher les arbitrages qui restent ouverts.** Trois questions relèvent d'une décision produit,
  pas d'une décision technique : le score composite survit-il aux « trois indicateurs et trois
  seulement » ? `REVENUE_SHARE_PER_DAY` reste-t-il un repli labellisé ? l'énergie et l'agriculture,
  hors périmètre de la note mais proposées par `lib/secteur.ts`, sortent-elles du produit ? Je les ai
  **posées et documentées**, pas résolues.

---

## 2. Ce qui a été réalisé

**En une phrase** : le dépôt sait désormais, exigence par exigence et fichier par fichier, où il se
situe par rapport à sa spécification de référence — dont un audit qui nomme les quatre anti-patterns
qu'il commet et deux constats qui changent l'ordre des chantiers.

**Dans les grandes lignes** :

- **La note est versée verbatim** et déclarée prioritaire sur `PLAN.md`. Elle est une pièce de
  référence, pas un document vivant : un encadré de provenance le dit, et un commentaire HTML en tête
  interdit de la corriger — toute divergence se consigne ailleurs.
- **L'analyse d'écart est le vrai livrable.** Sept sections, chacune avec un verdict et un chemin de
  fichier réel. Elle a été écrite dans la forme des deux documents de réflexion déjà au dépôt
  (`IDEATION-PORTEFEUILLE.md`, `AUDIT-UI-UX.md`) : jamais une appréciation, toujours une preuve.
- **L'audit des dix anti-patterns était la partie la plus utile, et la plus inconfortable.** Quatre
  sont commis (n°1 max des niveaux, n°9 nomenclature en dur, n°5 secteur dans le moteur, n°10 perte
  financière estimée), deux évités et documentés avec soin, un évité « par prudence » sans être résolu.
- **Deux constats ont changé l'ordre de la roadmap**, et l'un des deux m'a fait corriger le plan
  approuvé en cours de route (voir §3).
- **La roadmap reprend les critères d'acceptation de la note tels qu'ils sont écrits**, et attache à
  chaque chantier son **verrou réel** — plusieurs ne sont pas du code.
- **Le HANDBOOK ne perd rien.** Sa liste « À faire » n'est pas remplacée mais **recoupée** avec la
  note, item par item : c'est la règle qu'il s'est lui-même donnée le 2026-08-05.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `docs/NOTE-TECHNIQUE-HYDROVIGIE.md` | neuf | La note verbatim (445 lignes), précédée d'un encadré de provenance : reçue le 2026-08-08, v1.0, **prime sur `PLAN.md`** sur les indicateurs de sortie et la méthode |
| `docs/ANALYSE-ECART-NOTE-TECHNIQUE.md` | neuf | Sections A→G : les trois indicateurs, les six ADR, **l'audit des dix anti-patterns**, le modèle de données, les sources, les questions ouvertes, les arbitrages |
| `docs/SPRINTS.md` | modifié (+249 l.) | Sprints **38→45** : ρ à intervalles → vecteur d'usages → VNP → IA → JS par ressource → auditabilité + juridiction → N1/N2 → N3 + import par lot. Plus le module κ et les secteurs hors périmètre |
| `docs/HANDBOOK.md` | modifié (+93 l.) | Entrée de session, tableau des anti-patterns commis, les trois décisions structurantes G1-G3, les deux arbitrages ouverts, et le recoupement item par item du §5 |
| `AGENTS.md` | modifié | Section « Design authority » : la note prime sur `PLAN.md`, et l'analyse d'écart se lit **avant** d'écrire du code moteur |
| `docs/comptes-rendus/2026-08-08-…md` | neuf | Ce fichier |

**Les trois décisions structurantes prises par l'utilisateur** (écrites, non implémentées) :

| # | Décision | Ce qu'elle coûtera |
| --- | --- | --- |
| **G1** | `joursContraints` (Sprint 21) est **remplacé** par JS + IA | Migration de `InterruptionPanel`, `SitesDashboard` (colonne, tuile, CSV), `portefeuille`, `executive`, `report` §6, et 3 suites de tests. **Rupture assumée** de continuité des exports |
| **G2** | **Fourchette partout** — l'intervalle `[0, ρ_max]` se propage jusqu'aux exports | Les tuiles et colonnes doivent accueillir deux nombres ; la forme des exports change |
| **G3** | **FR seule**, abstraction préparée, ES non écrit | ⚠️ Écart assumé avec l'ADR-002. Son avertissement est recopié dans la roadmap pour que le coût soit visible quand il se paiera : « sans une seconde juridiction réelle, l'abstraction sera fictive » |

---

## 3. Erreurs potentielles

### Une erreur trouvée et corrigée en cours de session — la plus instructive

**J'avais écrit dans le plan approuvé que l'indicateur IA était absent du dépôt. C'était faux.**

Le raisonnement de départ n'était pas absurde : `lib/interruption.ts` calcule `jours × exposition`,
sans fonction de production ni tampon, donc sans la convexité en durée d'épisode que la note §4.3
désigne comme l'erreur majeure. Vrai pour ce module. Mais en vérifiant un tout autre point — l'usage
de `coutJourEuros` pour l'anti-pattern n°10 — je suis tombé sur ceci, trente lignes plus bas dans un
fichier que je n'avais pas prévu de lire :

```ts
// lib/portefeuille.ts:375-386
// Days of actual stoppage, once each episode has spent the storage buffer.
// Only the run-length calendar can answer this: a three-day tank absorbs a
// two-day restriction, and no annual total can see that.
if (s.autonomieJours !== undefined && s.autonomieJours >= 0 && s.periodes?.length) {
  const eps = episodes(s.periodes);
  …
  net += Math.max(0, len - s.autonomieJours);
```

C'est le mécanisme de §4.3, épisode par épisode, sur le calendrier réel, testé. Le chantier IA est donc
une **généralisation** (le remonter dans le noyau, l'exposer au site seul, lui ajouter `response_type`)
et non une création. La roadmap a été réécrite en conséquence, et l'analyse d'écart porte le constat
en toutes lettres (§A.1) plutôt que de le corriger en silence.

**La leçon, pour la prochaine session** : un audit d'écart conduit fichier par fichier depuis la
spécification **rate ce qui est implémenté au bon endroit sous un autre nom**. Ici la fonctionnalité
n'était pas manquante, elle était **rangée dans le portefeuille**. Chercher par mécanisme
(`autonomie`, `buffer`, `episodes`) aurait trouvé tout de suite ; chercher par indicateur ne trouvait
rien.

**Une seconde correction, plus petite** : j'allais écrire « une trentaine de fichiers » pour l'ampleur
de l'anti-pattern n°9. Mesuré : **18 fichiers** référencent `NiveauGravite`, **17** référencent
`GRAVITE`. La règle du dépôt (« les chiffres sont mesurés, jamais estimés ») s'applique aussi à un
document d'analyse.

### Ce qui peut être faux dans ce livrable

- **L'analyse d'écart est une lecture de code, pas une exécution.** Rien n'a été lancé pour vérifier
  un verdict. Un « évité » signifie exactement « je n'ai pas trouvé le chemin d'appel fautif », ce qui
  n'est pas « il n'existe pas ». Les deux verdicts les plus fragiles :
  - **n°5 (moteur branché sur le secteur)** : « partiellement commis » repose sur la présence de
    tables sectorielles dans `lib/secteur.ts`, `lib/arbitrage.ts`, `lib/ressource.ts`. Je n'ai pas
    tracé **chaque** appel pour établir si elles entrent dans un calcul ou seulement dans un texte
    affiché. La différence est exactement celle que l'ADR-001 sanctionne.
  - **n°6 (valider sur le niveau d'alerte)** : « commis par omission » est une affirmation
    d'**absence** — la plus difficile à prouver. Je me suis appuyé sur les validations documentées au
    HANDBOOK, pas sur une revue exhaustive de `scripts/test/` et `scripts/diag/`.
- **Les numéros de ligne se périmeront au premier refactoring.** Ils sont exacts au commit `425db22`,
  et l'analyse le dit en tête. Les noms de symboles sont la référence durable ; c'est écrit, mais un
  lecteur pressé citera la ligne.
- **Ce que je n'ai PAS relu** : les 18 fichiers touchés par la nomenclature n'ont pas été ouverts un
  par un — le chiffre vient d'un `grep -rl`, qui compte les mentions et **non** les points où la
  nomenclature à quatre niveaux est réellement présupposée. L'ampleur réelle du Sprint 43 peut être
  plus faible (de simples imports de type) ou plus élevée (des `switch` exhaustifs invisibles au grep).
- **Le recoupement du §5 du HANDBOOK est un jugement, pas une mesure.** Dire que l'item 11
  (« restrictions non préfectorales ») « remonte fortement » parce que le V_ref du Sprint 40 est
  l'arrêté ICPE du 30 juin 2023 est une inférence de ma part. Elle est probablement juste ; elle n'est
  pas vérifiée sur le texte de l'arrêté, que je n'ai pas lu (egress bloqué, et hors périmètre).
- **La roadmap chiffre des chantiers dont le coût est inconnu.** Sprints 38→45 est une numérotation, pas
  une estimation. Aucun de ces chantiers n'a été instruit par un sondage ; en particulier le sprint 40
  suppose que la définition de V_ref de l'arrêté ICPE est **accessible et implémentable**, ce qui n'a
  pas été vérifié — d'où la consigne « sonder avant de coder » écrite dans le sprint lui-même.

### Non vérifié en conditions réelles

**Tout.** Aucune des affirmations de l'analyse d'écart portant sur le comportement en production n'a
été rejouée cette session : elles sont **reprises du HANDBOOK**, qui les tient de diags réels
antérieurs (runs 19, 24, 25, 39, 40). Si l'un de ces constats a vieilli, mon document le propage.

⚠️ **La dette de non-constaté du dépôt n'a pas bougé.** L'avertissement en tête du §5 du HANDBOOK
reste entièrement valable : les sprints 33→37 et la session du 2026-08-07 sont partis en production
sans avoir jamais été vus avec de vraies données, et **cette session ne réduit pas cet écart d'un
pouce**. Elle ne l'aggrave pas non plus — c'est le seul mérite d'une session sans code.

### Ce qui casserait si une source amont changeait

Rien : aucun code n'a été ajouté. En revanche, **la note elle-même vieillira**, et de deux façons
prévisibles. Elle cite l'« API Adresse » comme source de géocodage recommandée alors que
`api-adresse.data.gouv.fr` est **décommissionné** (le dépôt utilise `data.geopf.fr/geocodage` depuis le
Sprint 1) — écart relevé dans l'analyse §E, et **non corrigé dans la note**, qui est verbatim par
construction. Et elle décrit une collection Explore2 dont le Sprint 22 a déjà établi par énumération
qu'elle **ne contient ni QMNA5 ni recharge**.

---

## 4. Points d'amélioration

**Dette assumée** (choix conscients, motivés) :

- **La note n'est pas corrigée là où elle est déjà périmée** (API Adresse, contenu de la collection
  Explore2). C'est le prix du verbatim : une pièce de référence qu'on amende n'est plus une référence.
  Les écarts sont consignés dans l'analyse, qui est le document vivant.
- **Aucune ligne de code, donc aucun test.** Une session documentaire n'est vérifiable que par
  relecture. Je le dis en §5 plutôt que d'habiller la vérification.
- **Sept sections d'analyse, c'est long.** J'ai ajouté un récapitulatif final « par où commencer » pour
  que le document soit exploitable sans être lu en entier — mais le récapitulatif peut dériver du corps
  s'il n'est pas maintenu avec lui.

**À reprendre** (raccourcis qu'il faudra payer) :

- **Les deux verdicts fragiles du §3 méritent une vérification ciblée** avant d'ouvrir le sprint
  concerné : tracer les appels des tables sectorielles (n°5) est une demi-heure de travail qui évitera
  soit un chantier inutile, soit un chantier sous-estimé.
- **Les `fichier:ligne` devraient être des ancres testables.** Le dépôt sait déjà faire cela pour la
  méthodologie : `lib/methodologie.ts` + `scripts/test/methodologie.test.ts` cassent le build quand une
  ancre et sa cible divergent. Un test qui vérifierait que les symboles cités par l'analyse d'écart
  existent encore serait le même patron, appliqué à la documentation. **Non fait** : ce serait du code,
  et le périmètre était documentaire.
- **Les deux arbitrages ouverts bloquent la restitution du sprint 40**, pas son moteur. Ils sont
  écrits en deux endroits (analyse §G.2, HANDBOOK §1) mais rien ne force à les trancher avant d'y
  arriver. Le risque concret : livrer un VNP puis découvrir qu'on ne sait pas s'il remplace le score
  composite ou cohabite avec lui.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — commit `033b98f`
- **`main` touché ?** : **NON**. La branche attend une revue.
- **Déployé en prod ?** : **non**, et sans objet — aucun code produit n'a changé, donc un déploiement
  ne montrerait rien de neuf.
- **Vérifications passées** :
  - **Critère principal — non-régression par absence de changement** : `git diff --stat` sur la
    session ne touche que `docs/` (5 fichiers) et `AGENTS.md`. **Aucun fichier de `lib/`,
    `components/`, `app/`, `scripts/`, `data/` n'est modifié.** C'est le seul critère qui compte pour
    une session documentaire, et il est vérifié.
  - `npm run build` ✅ et `npm run lint` ✅ — inchangés, ce qui prouve simplement que rien n'a été cassé.
  - **22 suites de tests au vert**, boucle du HANDBOOK §6, inchangées.
  - **62/62 e2e** (`scripts/test/e2e.mjs` sur `next start -p 3300`). ⚠️ J'avais d'abord écrit ici que
    l'e2e n'était pas rejoué, au motif qu'aucun fichier servi n'avait changé — c'était un raisonnement,
    pas une vérification. Il a donc été lancé : 62 PASS, 0 FAIL.
  - ⚠️ **Piège d'environnement rencontré, et déjà documenté au HANDBOOK §3** : `npm run build` a
    d'abord répondu `sh: 1: next: not found` — `node_modules` était **vide** (le conteneur a perdu ses
    dépendances en cours de session). `npm ci` répare, et le symptôme trompe : il ressemble à une panne
    d'outillage, pas à une perte d'état. Confirmation vécue du piège, pas une découverte.
  - **Garde-fou HANDBOOK** : 591 → **684 lignes** (+93). Le contrôle existe à cause du bug du
    2026-08-05 (fichier gonflé à 175 Mo par un découpage d'index) : édition par `Edit` ciblé
    uniquement, et comptage avant/après.
  - **Note versée byte-identique** : `diff` du corps (à partir de la ligne 22) contre le fichier
    d'origine — aucune différence. Le verbatim est prouvé, pas affirmé.

---

## 6. Prochaines étapes

Par valeur décroissante, chacune avec **ce qui la bloque** :

1. **Trancher les deux arbitrages ouverts.** *Verrou : une décision produit de l'utilisateur, pas un
   travail technique.* « Trois indicateurs et trois seulement » condamne-t-il le score composite, les
   classes WRI/CDP et l'indice d'anticipation ? `REVENUE_SHARE_PER_DAY` survit-il ? L'énergie et
   l'agriculture sortent-elles du produit ? Ces réponses **dimensionnent la restitution** des sprints
   40 et 41 ; les ignorer, c'est risquer de livrer un VNP sans savoir à côté de quoi il s'affiche.
2. **Sprint 38 — typologie ρ à intervalles.** *Verrou : aucun, c'est le chantier le plus prêt.*
   Extension de type sur un fichier de 212 lignes déjà couvert par 29 tests calibrés sur du verbatim
   d'arrêté. Il débloque tout le reste, parce que sans `[rhoMin, rhoMax]` aucune sortie ne peut porter
   la fourchette exigée par G2.
3. **Vérifier les deux verdicts fragiles** (§3) avant d'ouvrir les sprints 42 et 43. *Verrou : rien —
   une demi-heure de lecture d'appels.* Le gain est de ne pas dimensionner un chantier sur un grep.
4. **Ce que le HANDBOOK §5 réclame depuis deux sessions : regarder la production.** *Verrou : un œil
   humain sur `https://water-risk-saa-s.vercel.app` — l'egress est bloqué en bac à sable, aucune sonde
   HTTP ne juge un rendu.* Cette session n'y a rien changé, et la dette continue de courir.
5. **Sprint 39 — vecteur d'usages du site.** *Verrou : une décision d'ergonomie.* Le modèle de données
   est clair (§2.2 de la note) ; ce qui ne l'est pas, c'est comment faire saisir un vecteur d'usages
   pondérés en volume à un utilisateur qui remplit aujourd'hui trois menus déroulants.
6. **Sondage V_ref** avant le sprint 40. *Verrou : l'egress, donc l'escape hatch Actions.* La
   définition réglementaire du volume de référence (arrêté ICPE du 30 juin 2023 modifié le 3 juillet
   2024) doit être **lue** avant d'être implémentée — la note prévient qu'une moyenne maison créerait
   un désaccord avec la DREAL.

---

## 7. Explication à un novice

> Lecteur visé : quelqu'un qui sait programmer, mais qui ne connaît ni ce dépôt ni la réglementation
> française sur l'eau. Cette session n'a produit **aucun code**, donc ce qu'il y a à comprendre est
> **conceptuel** : pourquoi une spécification peut condamner un produit qui marche.

### 7.1 Le problème, en langage courant

Quand il ne pleut pas assez, le préfet d'un département publie un arrêté qui interdit ou limite
certains usages de l'eau, zone par zone. Une entreprise qui a trente sites en France voudrait savoir :
combien de jours par an chacun de mes sites est-il gêné, combien de mètres cubes je ne pourrai pas
prélever, et combien de jours de production je vais perdre ?

Le dépôt répond déjà à des questions voisines, et plutôt bien : il sait dire « votre site est en alerte
renforcée », « cette zone a connu 46 jours de restriction par an en moyenne sur neuf ans », « l'étiage
baissera de 13 % d'ici 2050 ».

La note technique arrive et dit : ce n'est pas encore la bonne réponse. Non pas parce que les chiffres
sont faux, mais parce que **la façon de les assembler contient des erreurs de raisonnement** — dont
dix sont nommées une par une. Mon travail cette session a été de vérifier, pour chacune, si le code la
commet. Réponse : quatre oui, deux non, et quelques cas intermédiaires plus intéressants que les deux
extrêmes.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Arrêté de restriction** | Décision d'un préfet limitant les usages de l'eau sur une zone, avec une date de début et une date de fin. Le seul document qui fait foi. |
| **Zone d'alerte** | Découpage administratif sur lequel s'applique un niveau de restriction. Trois découpages **différents et non superposés** coexistent : eaux de surface (SUP), eaux souterraines (SOU), réseau d'eau potable (AEP). |
| **Niveau de gravité** | En France : vigilance → alerte → alerte renforcée → crise. **Quatre niveaux, propres à la France**, et déjà changés en 2021. |
| **JS** | « Jours sous statut » : combien de jours par an la zone est sous restriction, par niveau. |
| **VNP** | « Volume non prélevable » : les mètres cubes que le site n'a pas le droit de pomper, en m³/an. |
| **IA / JEA** | « Interruption d'activité », mesurée en « jours-équivalents d'arrêt » : si l'usine tourne à 60 % pendant dix jours, cela fait quatre JEA. |
| **ρ (rho)** | La part d'un usage qui est bloquée par une mesure. Une interdiction totale vaut 1 ; « réduction de 50 % » vaut 0,5 ; « interdiction de 8 h à 20 h » vaut 12/24 = 0,5. |
| **Mesure non quantifiée** | Une mesure dont on ne peut pas déduire de chiffre : « limiter au strict nécessaire ». Fréquente. |
| **Étiage** | La période de l'année où les rivières sont au plus bas — en France, l'été. |
| **RLE (run-length encoding)** | Compression qui stocke « 40 jours identiques à partir du jour 12 » au lieu de 40 entrées. Le dépôt s'en sert pour garder le calendrier jour par jour de chaque zone sans exploser en taille. |
| **ADR** | *Architecture Decision Record* : une décision d'architecture écrite, avec son motif, pour qu'on sache plus tard pourquoi elle a été prise. |
| **Anti-pattern** | Une solution qui paraît raisonnable et qui est fausse. Les nommer permet de les refuser explicitement. |

### 7.3 Comment le code s'y prend — et où la note l'attaque

Prenons **l'anti-pattern le plus intéressant de la liste : celui de la durée des épisodes.**

Le dépôt calcule les jours d'activité contrainte comme ceci :

```ts
// lib/interruption.ts:127-138 — pour chaque niveau de gravité,
// on multiplie les jours passés à ce niveau par la part d'usage bloquée
for (const level of LEVELS) {
  const d = days[level] ?? 0;
  if (d <= 0) continue;
  const e = exposure[level];
  if (e === undefined) {
    covered = false;   // niveau non lisible : on ne compte RIEN, jamais zéro
    continue;
  }
  const weighted = d * clamp(e * factor, 0, 1);
  jours += weighted;
}
```

C'est propre, et le détail `covered` montre une bonne habitude du dépôt : quand on ne sait pas, on ne
compte pas zéro, on signale qu'on ne sait pas.

**Mais ce calcul ne peut pas voir la différence entre deux mondes.** Supposons deux sites, chacun avec
40 jours de restriction par an :

- Site A : **quarante épisodes d'un jour**, répartis dans l'année.
- Site B : **deux épisodes de vingt jours**.

Le code ci-dessus donne le **même** résultat pour les deux. Or si le site a une réserve d'eau de trois
jours, le site A ne s'arrête **jamais** — chaque coupure est absorbée par la réserve — et le site B
s'arrête **34 jours**. La perte n'est pas proportionnelle aux jours : elle est **convexe** en durée
d'épisode. C'est le sens de l'avertissement de la note §4.3, et c'est la raison pour laquelle elle
exige un modèle qui produise la **distribution des durées d'épisode**, pas un total annuel.

Et voici le retournement de cette session : **le dépôt sait déjà faire ce calcul.** Il le fait
ailleurs, pour le portefeuille :

```ts
// lib/portefeuille.ts:378-386
if (s.autonomieJours !== undefined && s.autonomieJours >= 0 && s.periodes?.length) {
  const eps = episodes(s.periodes);          // le calendrier réel, épisode par épisode
  for (const [start, len] of eps) {
    …
    net += Math.max(0, len - s.autonomieJours);  // ← la réserve absorbe les courts épisodes
  }
```

`s.periodes` est le calendrier RLE : la liste des périodes contiguës de restriction, avec leur durée.
Il est produit par une fonction qui balaye le jour par jour et compresse les runs :

```ts
// lib/history.ts:256-268 — un balayage, pas un tri : la fenêtre est bornée (~3 650 jours)
for (let d = fromDay; d <= toDay; d++) {
  const r = days.get(d);
  if (r === rank) continue;                     // même niveau qu'hier : le run continue
  if (start >= 0) out.push(start, d - start, rank);   // le run se termine : on l'émet
  …
}
```

Le chemin complet de la donnée, donc : le CSV national des arrêtés → un `Map<jour, niveau>` par zone →
compressé en runs (`history.ts`) → parcouru épisode par épisode en retranchant la réserve d'eau
(`portefeuille.ts`) → affiché sur le tableau de bord. **Il ne manque que trois choses** : que ce
chemin serve aussi un site seul, qu'il connaisse d'autres formes de réponse qu'« ça marche ou ça
s'arrête », et qu'il sorte des JEA.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Pourquoi ne pas avoir commencé à coder ?** C'était l'option que je recommandais, et l'utilisateur
  a choisi le documentaire. Avec le recul, c'était le bon appel : la découverte du §3 — une
  fonctionnalité que je croyais absente et qui existait — aurait transformé un sprint de création en
  refactoring **au milieu du sprint**. Cartographier avant de creuser a un rendement mesurable ici.
- **Pourquoi verser la note verbatim, alors qu'elle contient deux passages déjà périmés ?** Parce
  qu'une référence qu'on amende cesse d'être une référence : dans six mois, personne ne saurait plus
  ce que l'utilisateur avait écrit et ce que j'avais « corrigé ». L'alternative retenue est celle que
  le dépôt applique déjà à ses arrêtés : conserver le texte source intégralement, et mettre les
  divergences dans un document vivant à côté.
- **Pourquoi un tableau « verdict + fichier:ligne » plutôt qu'une prose d'audit ?** Parce qu'une prose
  ne se réfute pas. Un verdict avec un chemin de fichier peut être **vérifié en dix secondes par un
  lecteur sceptique** — et il l'a été par moi-même, ce qui a produit la correction du §3.
- **Pourquoi ne pas avoir supprimé la liste « À faire » du HANDBOOK, que la note recouvre en partie ?**
  Parce que le dépôt s'est fait mordre exactement là : une réécriture du 2026-08-05 avait déclaré
  « bloqués » trois chantiers que les sprints suivants avaient livrés. Un document de passation qui
  perd un item décourage de le rouvrir. Le recoupement item par item coûte quinze lignes et ne perd rien.
- **Pourquoi accepter G3 (FR seule) alors que l'ADR-002 prévient que l'abstraction sera fictive ?**
  Ce n'est pas mon arbitrage, c'est celui de l'utilisateur, et il est défendable : écrire une
  juridiction espagnole sans jamais la confronter à de vraies données produirait du code non éprouvé,
  ce qui est le défaut dominant du dépôt. Mon travail était de faire en sorte que le coût soit
  **visible au moment où il se paiera** — d'où l'avertissement de l'ADR recopié mot pour mot dans le
  sprint 43, plutôt que résumé.

### 7.5 Pour expérimenter soi-même

**a) Refaire l'audit de l'anti-pattern n°1, et voir si mon verdict tient.** La note interdit de prendre
le maximum des niveaux entre SUP, SOU et AEP. Cherchez qui le fait :

```bash
grep -rn "maxGravite\|worstLevel" --include=*.ts --include=*.tsx . | grep -v node_modules
```

Vous devriez retrouver mes cinq points d'appel — plus `levelForOrigin` dans `lib/vigieau.ts`, écrit au
Sprint 21 **pour corriger ce biais** et jamais généralisé. Lisez le commentaire au-dessus : il énonce
la règle de la note avant que la note n'existe. C'est le motif récurrent de cet audit — le dépôt a
souvent la bonne idée, rangée au mauvais endroit.

**b) Voir la convexité de vos propres yeux, sur les vrais tests.** Ouvrez
`scripts/test/portefeuille.test.ts`, trouvez un cas qui utilise `autonomieJours`, et lancez :

```bash
npx tsx scripts/test/portefeuille.test.ts    # npm i --no-save tsx si absent
```

Puis, dans `lib/portefeuille.ts:386`, remplacez :

```ts
net += Math.max(0, len - s.autonomieJours);
```

par :

```ts
net += len;                                  // ← la réserve d'eau ne sert plus à rien
```

**Le test doit échouer**, et son message vous dira de combien de jours l'estimation dérape. Vous venez
de supprimer la convexité — exactement l'erreur que la note §4.3 décrit comme donnant « une perte
proche de zéro là où elle est maximale », ici dans l'autre sens. Remettez le `Math.max` : c'est la
manière la plus rapide de comprendre ce qu'une seule ligne protège. **N'oubliez pas de le remettre** —
`git checkout lib/portefeuille.ts` si besoin.

**c) Mesurer l'ampleur réelle du sprint 43, et corriger ma mesure.** J'ai écrit « 18 fichiers
référencent `NiveauGravite` », obtenu par :

```bash
grep -rl "NiveauGravite" --include=*.ts --include=*.tsx . | grep -v node_modules | wc -l
```

Mais ce chiffre compte les **mentions**, pas les endroits où la nomenclature à quatre niveaux est
réellement présupposée. Ouvrez ces 18 fichiers et classez-les : simple import de type, ou logique qui
casserait si un cinquième niveau apparaissait (par exemple un tableau littéral des quatre niveaux,
comme `LEVELS` dans `lib/interruption.ts:86`) ? Le second nombre est le vrai coût du chantier, et il
n'a jamais été établi — c'est écrit dans mes limites au §3, et c'est une contribution utile qui prend
une demi-heure.
