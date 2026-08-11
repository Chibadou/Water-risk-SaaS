# Compte rendu — VNP et JEA à l'écran, pondérés par la saison (Sprint 42a)

**Date** : 2026-08-10 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 42a

---

## 1. La question initiale

> « go »

Un « go » qui suit les quatre arbitrages G16–G19 tranchés juste avant. L'objet du sprint était donc
déjà fixé par ces arbitrages, et notamment par G16 :

> **G16 — brancher d'abord, retirer ensuite.** Les deux nouveaux indicateurs s'affichent *à côté* de
> `joursContraints`, pas à sa place. `lib/interruption.ts` ne sera retiré qu'au sprint suivant.

**Ce que j'ai compris** : les Sprints 41 et 42 ont livré deux moteurs de calcul — le VNP en m³ et
l'IA en jours-équivalents d'arrêt (JEA) — que **rien n'affichait**. Le sprint consiste à les brancher
sur la fiche site, avec la pondération mensuelle du VNP (G19) au passage puisqu'elle conditionne la
justesse du chiffre affiché.

**Ce que j'ai délibérément laissé de côté** :

- **Le retrait de `lib/interruption.ts`, de `Dependance` et de `REVENUE_SHARE_PER_DAY`** (G1, G10,
  G6). C'est exactement ce que G16 ordonne de reporter : tant que le nouveau chiffre n'a pas été
  comparé à l'ancien sur les mêmes données, supprimer l'ancien c'est supprimer le témoin. Ces trois
  retraits forment le Sprint 42b.
- **Les champs de saisie** de `profilMensuel`, `tamponM3`, `seuilTechniqueM3`, `paliers` et `reponse`.
  Le moteur les lit, le formulaire ne les propose pas. Le panneau **dit** lesquels manquent, ce qui
  rend le trou visible sans le combler. Décision assumée : un sprint qui ajoute cinq champs de
  formulaire n'aurait pas eu la place de vérifier que le câblage fonctionne, et le défaut décrit en
  §3 montre que c'était précisément la vérification qui manquait.
- **Le rattachement de `usageCode` à la nomenclature du Guide Sécheresse**, qui reste le plus gros
  gain restant (il débloquerait un VNP par usage). Hors périmètre d'un sprint d'affichage.

---

## 2. Ce qui a été réalisé

**En une phrase** : les deux indicateurs physiques de la note technique — les mètres cubes qu'on ne
pourra pas prélever, et les jours d'arrêt équivalents — sont lisibles sur la fiche site, avec leur
fourchette et la liste de ce qu'ils supposent, sans avoir à exporter un rapport.

**Dans les grandes lignes** :

- **La pondération mensuelle du VNP (G19)** parce qu'un besoin en eau étalé à plat sur l'année
  **sous-estime d'un facteur trois** un site à pic estival dont les restrictions tombent en août. Ce
  n'est pas un raffinement : c'est l'écart entre 29 400 m³ et 10 000 m³ sur le même arrêté.
- **Un panneau dédié** plutôt qu'une ligne ajoutée au panneau existant, parce que les deux
  composantes du VNP **ne doivent jamais être additionnées** (anti-pattern n°3) et qu'une mise en
  page qui les met côte à côte dans deux cartouches distinctes, avec l'interdiction écrite entre les
  deux, est le seul endroit où cette contrainte devient visible pour le lecteur.
- **La fourchette jusqu'au mètre cube (G2)** parce qu'un intervalle `[0, ρ_max]` propagé à travers
  quatre couches de calcul pour être écrasé au moment de l'affichage n'aurait servi à rien.
- **Le fetch `/api/restrictions` remonté dans `HomeClient`** parce que le VNP a besoin du même
  intervalle ρ que le modèle de jours, et que le composant qui possédait cette requête est celui que
  G1 supprime au sprint suivant. Une requête, un propriétaire, et le propriétaire survit à la
  migration.
- **Dix vérifications e2e neuves** (69 → 79) qui ont **immédiatement trouvé un vrai défaut**
  (§3), invisible aux 52 assertions unitaires du VNP.
- **La suite e2e imprime désormais ses résultats même quand elle trébuche**, faille découverte en
  cassant volontairement le panneau pour voir ce que la vérification protégeait.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/vnp.ts` | modifié | Accepte `daysByMonthAndLevel` et `profilMensuel` ; répartit le volume journalier selon le profil au lieu de l'étaler. `meanDaysByMonth` moyenne l'historique sur les **années complètes seules**. |
| `components/IndicateursNote.tsx` | **neuf** | Le panneau : deux cartouches VNP jamais additionnés, les JEA avec le nombre d'épisodes réels et le plus long, les manques du profil, le journal d'hypothèses en `<details>`. |
| `components/HomeClient.tsx` | modifié | Porte le fetch `/api/restrictions`, ajoute `?periodes=1` à l'appel d'historique, calcule `joursParNiveau` sur les années complètes, rend le panneau. |
| `components/InterruptionPanel.tsx` | modifié | Reçoit `restrictions` en prop au lieu de le chercher. Perd les props `profil`, `departement`, `zoneType`, qui ne servaient qu'à cette requête. |
| `scripts/test/vnp.test.ts` | modifié | 43 → **52** assertions ; section 8 neuve sur la pondération saisonnière, avec les trois chiffres mesurés (août / janvier / à plat). |
| `scripts/test/e2e.mjs` | modifié | 69 → **79** vérifications ; section « indicateurs » avec toutes les sources bouchonnées. Plus un garde-fou qui imprime les résultats acquis en cas d'interruption. |
| `docs/SPRINTS.md` | modifié | Section Sprint 42a : ce qui est fait, le défaut trouvé, et les trois points restés ouverts. |

---

## 3. Erreurs potentielles

### Le bug trouvé pendant la session, et pourquoi aucun test unitaire ne pouvait le voir

Au premier passage des dix vérifications neuves, **deux tombaient** : seul le **VNP structurel**
s'affichait, le VNP de crise était absent.

```
   … Volume non prélevable (m³/an)VNP structurel36 500 m³Réduction de 10 % du volume autorisé…
FAIL le VNP de crise apparaît
FAIL l'interdiction d'additionner est écrite
```

La cause : `setExposureInterval` avait été posé **à l'intérieur du callback d'export de rapport**
(`exportReport`), c'est-à-dire dans une fonction qui ne s'exécute que si l'utilisateur clique sur
« Exporter ». L'intervalle ρ restait donc `undefined` en permanence, et `computeVnp` — qui refuse
correctement de compter des jours dont il ne sait pas ce qu'ils coûtent — ne produisait aucune
composante de crise. La seconde vérification tombait par ricochet : l'avertissement
« ne s'additionnent pas » ne s'affiche que quand les deux composantes sont là.

**Les 52 assertions de `vnp.test.ts` passaient toutes pendant ce temps.** Le défaut ne portait pas
sur la formule mais sur **qui va chercher quoi** : un test unitaire appelle `computeVnp` avec ses
arguments en main, il ne peut par construction rien dire sur la question de savoir si l'application
les lui fournit. C'est l'argument entier en faveur d'une vérification qui traverse l'écran, et la
raison pour laquelle ces dix vérifications sont allées dans `e2e.mjs` plutôt que de rester un script
jetable.

### La faille de la suite e2e, trouvée en la cassant exprès

Pour rédiger le §7.5, j'ai retiré l'`ariaLabel` du panneau et relancé la suite. Elle n'a pas affiché
« FAIL » : elle a affiché une pile d'appels `TimeoutError` et **aucune** des 69 vérifications déjà
passées. Une suite qui perd ses constats quand elle trébuche ne peut pas servir à localiser ce qui a
cassé, ce qui est sa seule fonction. Corrigé dans la foulée : `uncaughtException` et
`unhandledRejection` impriment les résultats acquis, avec une ligne `FAIL suite interrompue`. Le
résultat mesuré après correctif : 69 PASS + 1 ligne `FAIL suite interrompue` au lieu d'une pile
d'appels.

### Non vérifié en conditions réelles

- **Aucun de ces chiffres n'a été vu sur un vrai site avec de vraies données.** L'egress est bloqué
  dans le bac à sable (403 CONNECT sur tous les hôtes open data français) ; les dix vérifications
  e2e tournent sur des **bouchons**, de forme copiée sur les types réels mais de contenu inventé.
  Ce qui est démontré est le **câblage**, pas la justesse d'un chiffre. La dette du HANDBOOK §5
  (« livré mais jamais vu avec de vraies données ») grossit encore ce sprint.
- **La pondération saisonnière n'a jamais tourné sur un `parMoisNiveau` réel.** Les valeurs de la
  section 8 de `vnp.test.ts` sont construites à la main. `meanDaysByMonth` moyenne des clés d'années
  que je suppose être des chaînes `"2024"` : c'est ce que `lib/history.ts` produit aujourd'hui, mais
  je ne l'ai vérifié que par lecture du code, pas sur une réponse d'API.
- **La boucle de moyenne de `HomeClient` suppose que l'historique couvre les `annees` dernières
  années révolues** (`currentYear - annees` … `currentYear - 1`). Si l'archive avait un trou au
  milieu, la moyenne serait divisée par `annees` alors que moins d'années y contribuent — donc
  **sous-estimée**. Le sens de l'erreur est prudent, mais le comportement n'est pas testé.

### Hypothèses qui pourraient ne pas tenir

- **`DAYS_PER_MONTH` utilise 28,25 pour février.** Approximation assumée ; l'erreur est inférieure à
  1 % sur un mois qui porte rarement des restrictions sécheresse.
- **Un profil mensuel déclaré mais dont les parts ne somment pas à 1** est utilisé tel quel. Le VNP
  sera proportionnellement faux, dans le sens de la somme. Rien ne le signale aujourd'hui.
- **`κ = 1`** reste l'hypothèse prudentielle déclarée (ADR-005) : on suppose que le volume non
  prélevé est intégralement perdu, sans substitution ni report. C'est journalisé, en majuscules, et
  faux dans la plupart des cas réels — mais faux **dans le sens prudent**.
- **L'ICPE V_ref n'est toujours pas implémenté.** `resolveVref` étiquette le régime et dit dans sa
  trace que la définition réglementaire « n'est pas encore appliquée » ; Légifrance répond 403 sous
  les deux UA essayés au Sprint 41. C'est un trou étiqueté, pas une formule.

### Ce qui casserait si une source amont changeait

- Si `/api/history` cessait de renvoyer `parMoisNiveau`, la pondération retomberait silencieusement
  à plat — avec le journal d'hypothèses qui le dirait (`supposé PLAT`, `SOUS-ESTIMÉ`), donc pas
  silencieusement pour un lecteur attentif, mais sans erreur.
- Si `/api/restrictions` cessait de renvoyer `exposureInterval`, le VNP de crise disparaîtrait
  exactement comme dans le bug ci-dessus. `RestrictionsPayload` retype la charge utile **à la main**
  (le commentaire du fichier le dit déjà) : TypeScript ne dirait rien.
- Le format RLE `periodes` (triplets `[jour, durée, rang]`) est lu par `episodesFromPeriodes` sans
  version ni garde. Un quatrième champ inséré en amont décalerait tout.

---

## 4. Points d'amélioration

**Dette assumée** (choix conscients, motivés) :

- **Deux décomptes de jours à l'écran simultanément** : `joursContraints` dans le panneau existant,
  les JEA dans le nouveau. C'est inconfortable pour l'utilisateur et c'est le prix explicite de G16.
  À solder au Sprint 42b — ce n'est pas une omission, c'est une étape.
- **Cinq paramètres lus mais non saisissables** (`profilMensuel`, `tamponM3`, `seuilTechniqueM3`,
  `paliers`, `reponse`). Le panneau annonce lesquels manquent ; c'est la moins mauvaise version d'un
  trou qu'on ne comble pas ce sprint.
- **`RestrictionsPayload` retypé à la main** plutôt qu'importé de `lib/restrictions.ts`. Le
  commentaire en place depuis le Sprint 39 explique pourquoi c'est un piège ; le corriger relève du
  Sprint 44 (auditabilité), où les types de sortie sont de toute façon revus.

**À reprendre** (raccourcis qu'il faudra payer) :

- **`profileCompleteness` n'est appelé que par le nouveau panneau.** La fonction est testée
  (49 assertions dans `site-profile.test.ts`) et sert à un seul endroit ; la fiche site et le
  portefeuille auraient tous deux besoin de dire ce qui manque.
- **Aucune borne de plausibilité sur V_ref.** Un volume déclaré à 3 650 000 000 m³ produirait un VNP
  absurde sans un mot. Un plancher/plafond avec message serait quelques lignes.
- **`useMemo` sur tout le calcul du panneau, avec `interne` et `usages` en dépendances objet.** Ces
  deux références changent à chaque frappe dans le formulaire, donc le mémo ne mémorise pas
  grand-chose. Le calcul est pur et rapide ; c'est cosmétique, mais le `useMemo` donne l'illusion
  d'une optimisation qui n'a pas lieu.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — dernier commit de sprint
  « Sprint 42a: publish VNP and IA on the site sheet, weighted by season », suivi d'un commit de
  correctif e2e (« make the e2e suite report its results when it trips »).
- **`main` touché ?** : **NON**. Aucun merge, aucun rebase sur `main`. La branche attend une revue.
- **Pull request ?** : **NON** — non demandée.
- **Déployé en prod ?** : **NON**, et **toujours pas regardé**. La prod
  (`https://water-risk-saa-s.vercel.app`) suit `main`, qui n'a pas bougé. ⚠️ « Regarder la prod »
  reste en attente depuis huit sessions.
- **Vérifications passées** :
  - `npm run build` — clean
  - `npm run lint` — clean, 0 avertissement
  - **25 suites** de tests unitaires, toutes vertes (`vnp.test.ts` : 52 assertions)
  - **79/79** vérifications e2e, dont 10 neuves, sur serveur de production local (port 3300)

---

## 6. Prochaines étapes

Par valeur décroissante, avec le verrou de chacune.

1. **Sprint 42b — retirer `lib/interruption.ts`, `Dependance`, `REVENUE_SHARE_PER_DAY`** (G1, G10,
   G6). *Verrou* : six consommateurs à migrer, et un piège nommé —
   `scripts/test/portefeuille.test.ts:377-383` garde `DEPENDANCE_FACTOR` en phase **en lisant le
   texte source** de `interruption.ts`. Il cassera au `readFileSync`, pas au typage, dans une suite
   dont le nom ne mentionne ni l'un ni l'autre. À traiter avec le retrait, pas après.
2. **Les champs de saisie des cinq paramètres manquants.** *Verrou* : aucun, c'est du travail de
   formulaire — mais `reponse` demande un libellé compréhensible pour trois formes de réponse
   (`linear`, `threshold`, `stepwise`) que l'utilisateur n'a aucune raison de connaître. La
   difficulté est rédactionnelle, pas technique.
3. **Rattacher `usageCode` à la nomenclature du Guide Sécheresse embarquée.** *Verrou* : la
   correspondance entre les libellés d'usage des arrêtés et la nomenclature est partielle, et
   l'établir demande un échantillon lu à la main — travail humain, pas tâche d'agent.
4. **Faire tourner `episodesFromPeriodes` sur les fixtures réelles de `history-parser.test.ts`.**
   *Verrou* : aucun, c'est une heure de travail. C'est la vérification la moins chère qui reste.
5. **Regarder la prod.** *Verrou* : le bac à sable n'a pas d'egress ; il faut soit l'échappatoire
   GitHub Actions (HANDBOOK §3), soit que l'utilisateur ouvre l'URL lui-même.
6. **Sprint 43 — JS par ressource et fin de `maxGravite`** (anti-pattern n°1). *Verrou* : cinq sites
   d'appel de `maxGravite`, et le correctif existe déjà (`levelForOrigin`) sans être généralisé.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Quand il ne pleut pas assez, le préfet publie un arrêté qui limite l'usage de l'eau : « arrosage
interdit », « prélèvement réduit de 50 % », « interdit entre 8 h et 20 h ». Une entreprise qui a
besoin d'eau pour produire veut savoir ce que ça lui coûte.

La réponse habituelle est « tel nombre de jours de restriction par an ». C'est une mauvaise réponse,
pour deux raisons.

D'abord, **un jour de restriction n'est pas un jour d'arrêt**. Une réduction de 20 % un jour où
l'usine avait de la marge ne coûte rien ; la même réduction un jour de pointe arrête la ligne. Le
nombre de jours mélange les deux.

Ensuite, **le décompte de jours dépend du vocabulaire réglementaire**, et ce vocabulaire change : la
France est passée de trois à quatre niveaux de gravité en 2021. Un indicateur qui compte des jours
« en alerte » devient incomparable dès que l'administration renomme ses paliers.

Ce sprint affiche donc deux mesures en **unités physiques**, qui ne dépendent d'aucune nomenclature :

- **combien de mètres cubes l'entreprise ne pourra pas prélever cette année** (le VNP) ;
- **à combien de jours d'arrêt complet ces restrictions équivalent** (les JEA).

Et une subtilité qui compte plus qu'on ne croit : ces mètres cubes ne se répartissent pas
uniformément dans l'année. Une conserverie de légumes consomme la moitié de son eau annuelle en
juillet-août — précisément quand les arrêtés sécheresse tombent. Calculer son besoin comme une
moyenne journalière plate la fait apparaître **trois fois moins exposée** qu'elle ne l'est. C'est le
correctif principal de ce sprint.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Arrêté sécheresse** | Décision préfectorale qui restreint les usages de l'eau sur une zone, pour une durée donnée. |
| **Zone d'alerte** | Découpage administratif sur lequel porte un arrêté. Un même point peut appartenir à trois zones : eau de surface (SUP), eau souterraine (SOU), eau potable (AEP). |
| **Niveau de gravité** | Le palier de l'arrêté : `vigilance`, `alerte`, `alerte_renforcee`, `crise`. Nomenclature française, changeante — d'où l'intérêt des unités physiques. |
| **ρ (rho)** | Fraction du prélèvement effectivement empêchée par une mesure. ρ = 0,5 pour « réduction de 50 % ». Vaut un **intervalle** `[min, max]` quand le texte est trop vague pour être chiffré. |
| **VNP** | Volume non prélevable, en m³/an. Deux composantes qu'il est **interdit** d'additionner : le VNP *de crise* (ce que les arrêtés coûtent cette année) et le VNP *structurel* (ce que la baisse programmée des volumes autorisés coûtera). |
| **JEA** | Jour-équivalent d'arrêt. Deux jours à 50 % d'empêchement font un JEA. Unité qui rend comparables des restrictions d'intensités différentes. |
| **V_ref** | Volume de référence : le prélèvement annuel sur lequel les pourcentages s'appliquent. |
| **Taux de restitution** | Part de l'eau prélevée rendue au même milieu. Un refroidissement en circuit ouvert restitue ~95 % ; une évaporation ~5 %. **Facteur 19 sur le VNP.** |
| **Profil mensuel** | Répartition de la consommation annuelle sur les douze mois, en parts sommant à 1. |
| **RLE** (run-length encoding) | Compression d'un calendrier en triplets `[jour, durée, niveau]` plutôt qu'un tableau de 3 650 jours. |
| **Convexité en durée d'épisode** | Avec une réserve d'eau, quarante coupures d'un jour ne coûtent presque rien là où deux coupures de vingt jours coûtent la quasi-totalité. Le nombre total de jours est le même. |
| **Landmark ARIA** | Région de page qu'un lecteur d'écran peut atteindre directement. Un `<section>` n'en devient un **que s'il a un nom accessible**. |
| **Bouchon** (stub) | Fausse réponse d'API injectée dans un test, pour vérifier le comportement de l'application sans dépendre du réseau. |

### 7.3 Comment le code s'y prend

**Étape 1 — récupérer le calendrier détaillé, pas seulement le total.** L'appel d'historique gagne un
paramètre :

```ts
// components/HomeClient.tsx
// `?periodes=1` opts into the run-length calendar (Sprint 26). Measured
// cost: 271 bytes for 22 runs — the episode structure the IA needs is far
// cheaper than recomputing it.
const res = await fetch(
  `/api/history?periodes=1&zones=${encodeURIComponent(codes.join(","))}`,
);
```

Sans `periodes`, l'API répond « 40 jours de restriction en moyenne ». Avec, elle répond « une plage
de 20 jours à partir du jour 19570, une autre de 20 jours à partir du jour 19700 ». La différence est
tout : la première formulation ne permet pas de savoir si c'était quarante coupures d'un jour ou deux
de vingt.

**Étape 2 — moyenner sur les années complètes seulement.** Nous sommes en août : 2026 est à moitié
écoulée. L'inclure dans une moyenne annuelle inventerait des mois calmes.

```ts
// components/HomeClient.tsx
// Mean days per level over the COMPLETE years only. `parAnnee` also holds
// the partial current year, and averaging it in would invent calm days.
const annees = best?.anneesCompletes ?? 0;
if (best?.parAnnee && annees > 0) {
  const currentYear = new Date().getUTCFullYear();
  const acc: Partial<Record<NiveauGravite, number>> = {};
  for (let y = currentYear - annees; y <= currentYear - 1; y++) {
    const jpn = best.parAnnee[String(y)]?.joursParNiveau;
    if (!jpn) continue;
    for (const [lvl, d] of Object.entries(jpn)) {
      const k = lvl as NiveauGravite;
      acc[k] = (acc[k] ?? 0) + (d ?? 0);
    }
  }
  for (const k of Object.keys(acc) as NiveauGravite[]) acc[k] = (acc[k] ?? 0) / annees;
  if (Object.keys(acc).length > 0) joursParNiveau = acc;
}
```

Notez le `if (Object.keys(acc).length > 0)` final : si rien n'a été accumulé, `joursParNiveau` reste
`undefined` au lieu de devenir `{}`. C'est la règle du projet — **une donnée absente n'est jamais un
zéro** — et ici elle a un effet concret : `{}` se lirait « ce site n'a jamais eu de restriction »,
`undefined` se lit « l'historique n'a rien pu dire ».

**Étape 3 — répartir le volume journalier selon la saison.** Le cœur de G19 :

```ts
// lib/vnp.ts
// Seasonal weighting (G19). Only possible when BOTH the monthly consumption
// split and the monthly restriction days are known: weighting one by the other
// is the whole point, and having only one of the two would be worse than flat.
const profil = input.profilMensuel;
const parMois = input.daysByMonthAndLevel;
const saisonnier = Boolean(profil && profil.length === 12 && parMois);

const volumeJournalier = (month: number | undefined): number => {
  if (!saisonnier || month === undefined || !profil) return volumeJournalierPlat;
  const share = profil[month];
  if (!Number.isFinite(share) || share < 0) return volumeJournalierPlat;
  return (consommable * share) / DAYS_PER_MONTH[month];
};
```

Le commentaire porte la décision la plus intéressante du fichier : **il faut les deux informations**.
Connaître le profil de consommation sans savoir en quels mois tombent les restrictions ne permet
rien ; savoir en quels mois elles tombent sans connaître le profil ne permet rien non plus. La
pondération est un produit, et un produit dont un facteur manque n'est pas à moitié calculé — il est
faux. Quand une seule des deux moitiés est là, le code retombe à plat **et le dit** :

```ts
if (!input.profilMensuel || input.profilMensuel.length !== 12 || !input.daysByMonthAndLevel) {
  hypotheses.push(
    "Profil de consommation mensuel supposé PLAT … " +
      "Pour un usage saisonnier, le VNP est SOUS-ESTIMÉ …",
  );
}
```

C'est le **journal d'hypothèses** (ADR-006) : une liste de phrases produites **au moment du calcul**,
qui voyagent avec le chiffre jusqu'à l'écran et jusqu'à l'export. Pas une note de méthodologie rédigée
à côté, qui se périme dès la première modification du code.

**Étape 4 — une boucle unique pour les deux chemins.** Un détail de structure qui évite une classe
entière de bugs :

```ts
// lib/vnp.ts
// Each entry is [days, level, month] — one pass whether or not the month is
// known, so the seasonal and flat paths cannot drift apart.
const entries: [number, NiveauGravite, number | undefined][] = [];
if (saisonnier && parMois) {
  for (const [m, byLevel] of Object.entries(parMois)) {
    for (const level of LEVELS) {
      const d = byLevel[level] ?? 0;
      if (d > 0) entries.push([d, level, Number(m)]);
    }
  }
} else {
  for (const level of LEVELS) {
    const d = input.daysByLevel[level] ?? 0;
    if (d > 0) entries.push([d, level, undefined]);
  }
}
```

Le mois est `undefined` dans le cas plat, et `volumeJournalier(undefined)` rend la valeur plate. Un
seul corps de boucle applique ensuite ρ, κ et l'exclusion des niveaux illisibles. L'alternative — deux
boucles, une par cas — aurait fonctionné le premier jour et divergé au premier correctif appliqué à
une seule des deux.

**Étape 5 — refuser plutôt que produire un zéro.** Dans la même boucle :

```ts
const e = input.exposure[level];
if (e === undefined) {
  // A level whose measures could not be read contributes NOTHING rather
  // than zero, and the caller is told how many days fell out.
  joursSansExposition += d;
  continue;
}
```

Trente jours de restriction dont on n'a pas su lire l'intensité ne valent pas 0 m³. Ils sortent du
calcul, et le nombre de jours sortis est journalisé — le lecteur voit « le VNP porte sur 10 jours
sur 40 » plutôt qu'un total faussement rassurant.

**Étape 6 — afficher un intervalle quand c'en est un.** À l'écran :

```tsx
// components/IndicateursNote.tsx
/** "12 000 m³" ou "12 000 à 19 000 m³" — jamais un point là où une fourchette est réelle. */
function fourchette(min: number, max: number, unite: string): string {
  return Math.abs(max - min) < 1
    ? `${fmt(min)} ${unite}`
    : `${fmt(min)} à ${fmt(max)} ${unite}`;
}
```

Quatre lignes, mais elles sont l'aboutissement de tout l'édifice : un arrêté qui dit « limiter les
prélèvements non prioritaires » sans chiffre produit ρ ∈ [0, 1], qui se propage à travers le moteur
et ressort ici en « 22 000 à 31 000 m³ ». Écraser cette fourchette sur sa borne basse au moment de
l'affichage aurait rendu inutile tout le travail des Sprints 39 à 41.

**Étape 7 — nommer le panneau pour qu'il existe.**

```tsx
<Panel
  // `modele` and not `reglementaire`: these are computed figures, not the
  // content of an arrêté. The variant is what makes that visible.
  variant="modele"
  as="section"
  ariaLabel="Volume non prélevable et interruption d'activité"
  id="indicateurs-physiques"
```

Deux choses ici. `variant="modele"` distingue visuellement un chiffre **calculé par nous** du contenu
d'un arrêté : c'est une question d'honnêteté, pas de décoration. Et `ariaLabel` est ce qui fait qu'un
`<section>` devient un **landmark** — sans lui, la région disparaît de la navigation par lecteur
d'écran tout en paraissant intacte à l'œil. C'est l'expérience proposée en 7.5.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Remonter le fetch au lieu d'ajouter un callback.** `InterruptionPanel` allait chercher
`/api/restrictions` lui-même, et le nouveau panneau avait besoin exactement de la même réponse. Trois
options :

1. *Deux fetches* — deux requêtes pour une donnée, et le risque qu'elles divergent (un site verrait
   ρ = 0,7 dans un panneau et ρ = 0,5 dans l'autre pendant le chargement).
2. *Un callback `onExposure` sur `InterruptionPanel`* — le plus court à écrire, et le pire : ce
   composant est supprimé au sprint suivant (G1). Le callback aurait été à refaire quinze jours plus
   tard.
3. *Remonter le fetch dans `HomeClient`* — retenu. `InterruptionPanel` reçoit la réponse en prop, et
   perd au passage trois props (`profil`, `departement`, `zoneType`) qui ne servaient qu'à construire
   l'URL. Le composant devient plus petit **et** la donnée appartient à celui qui survivra.

La règle générale : quand deux composants ont besoin d'une même donnée, elle appartient à leur
ancêtre commun — et si l'un des deux est condamné, le choix est déjà fait.

**Un panneau séparé plutôt qu'une ligne de plus.** Ajouter « VNP : 22 000 m³ » au panneau existant
aurait été plus discret. Mais l'anti-pattern n°3 interdit d'additionner les deux composantes du VNP,
et une contrainte de ce genre ne se respecte durablement que si la mise en page la rend évidente :
deux cartouches distinctes, avec l'interdiction écrite entre elles. Une ligne unique aurait invité
quelqu'un, dans six mois, à afficher le total.

**Afficher les deux modèles côte à côte pendant un sprint.** L'utilisateur voit temporairement deux
décomptes de jours qui ne concordent pas — c'est laid. L'alternative était de supprimer l'ancien en
même temps qu'on branche le nouveau. Refusé : si le nouveau chiffre est faux, l'ancien est le seul
témoin qui permette de s'en apercevoir. Le §3 montre que ce n'était pas une précaution théorique.

**Mettre les vérifications dans `e2e.mjs` plutôt que dans un script jetable.** Elles ont été écrites
comme un script temporaire, et ce script a trouvé un bug que 52 assertions unitaires ne pouvaient pas
voir. Une vérification qui trouve un vrai défaut le jour de sa naissance a démontré sa valeur ; la
jeter aurait été jeter la seule protection contre ce type de défaut.

### 7.5 Pour expérimenter soi-même

**Expérience A — voir la pondération saisonnière protéger un facteur trois.**

Dans `lib/vnp.ts`, remplacez le calcul du volume journalier mensuel par la valeur plate :

```ts
// return (consommable * share) / DAYS_PER_MONTH[month];
return volumeJournalierPlat;
```

Puis lancez :

```
npx tsx scripts/test/vnp.test.ts
```

**Trois assertions tombent** (mesuré) :

```
FAIL seasonal: 10 crisis days in August for a summer site → ~29 400 m³
FAIL seasonal: the same 10 days in January → ~5 900 m³
FAIL seasonal: the flat reading UNDERSTATES the August case by ~3×
vnp: 3 FAILED
```

La troisième est celle qu'il faut lire : elle n'affirme pas une valeur, elle affirme un **rapport**.
Un test qui dit « la lecture à plat sous-estime le cas d'août d'un facteur supérieur à 2,5 » survit à
tout changement de V_ref, de ρ ou de calendrier — il protège la propriété, pas le nombre.

**Expérience B — voir ce qu'un nom accessible protège.**

Dans `components/IndicateursNote.tsx`, supprimez la ligne `ariaLabel="…"`. Reconstruisez, relancez le
serveur, puis la suite e2e :

```
npm run build
npx next start -p 3300 &
BASE=http://localhost:3300 node scripts/test/e2e.mjs
```

À l'écran, **rien ne change** : le titre est toujours là, le panneau est toujours visible. Mais
`page.getByRole("region", { name: /Volume non prélevable/ })` ne trouve plus rien, parce qu'un
`<section>` sans nom accessible n'est pas une `region`. La suite s'arrête et affiche :

```
FAIL suite interrompue avant la fin — locator.waitFor: Timeout 20000ms exceeded.
```

C'est cette expérience qui a révélé la faille décrite en §3 : avant le correctif de ce sprint, la
suite n'affichait **aucun** des 69 constats déjà acquis, seulement une pile d'appels. Le correctif
tient en un `process.on("unhandledRejection", …)` qui imprime les résultats avant de sortir.
Comparez les deux comportements en commentant ces deux `process.on` en tête de `e2e.mjs`.

**Expérience C — voir l'anti-pattern n°3 se défendre tout seul.**

Dans `lib/vnp.ts`, ajoutez un champ pratique à l'objet retourné par `computeVnp`, juste avant
`available` :

```ts
total: (crise?.min ?? 0) + (structurel?.min ?? 0),
```

Lancez `npx tsx scripts/test/vnp.test.ts`. **Deux** assertions tombent (mesuré) :

```
FAIL shape: no `total` field on the result
FAIL shape: no expression in lib/vnp.ts adds the two components
vnp: 2 FAILED
```

La première inspecte les clés de l'objet retourné. La seconde est la plus inhabituelle :

```ts
// scripts/test/vnp.test.ts, section 5
const src = readFileSync("lib/vnp.ts", "utf-8");
const sums = [/crise\s*\+\s*structurel/, /structurel\s*\+\s*crise/, …];
check("shape: no expression in lib/vnp.ts adds the two components",
  !sums.some((re) => re.test(src)));
```

Un test qui **lit le texte source du module qu'il teste**. C'est inhabituel, et c'est délibéré :
« ne jamais additionner ces deux nombres » est une contrainte sur la **forme** du code, pas sur ses
valeurs. Aucun test de valeur ne peut l'attraper — on peut toujours calculer une somme correcte d'un
point de vue arithmétique. Le seul moyen de faire échouer la suite le jour où quelqu'un ajoute un
`total` bien intentionné est de regarder le code lui-même. Le motif existait déjà dans
`portefeuille.test.ts` pour `DEPENDANCE_FACTOR` ; c'est sa deuxième application.
