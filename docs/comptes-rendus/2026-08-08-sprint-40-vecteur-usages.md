# Compte rendu — Sprint 40 : le site devient un vecteur d'usages

**Date** : 2026-08-08 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 40

> Cinquième compte rendu du 2026-08-08. Sprint 38 : le probe et trois défauts trouvés. Sprint 39 : la
> typologie ρ à intervalles, et ces trois défauts corrigés. Celui-ci pose le modèle de données que
> l'ADR-001 exige, et sans lequel le VNP du Sprint 41 est incalculable.

---

## 1. La question initiale

> « go » — enchaîner sur le Sprint 40 de la file.

**Ce que j'ai compris** : décrire un site comme un **vecteur d'usages pondérés en volume** plutôt que
par un secteur et une origine unique, et en tirer les deux fonctions que la note réclame — le niveau
effectif pondéré (ADR-003, anti-pattern n°1) et la distinction prélèvement / consommation (§4.2c).

**Une question posée en cours de route**, parce que le sprint l'avait identifiée comme son verrou :
comment faire saisir un vecteur pondéré à quelqu'un qui remplit aujourd'hui trois menus déroulants.
Réponse de l'utilisateur : **en parts du volume total**, et les m³ du VNP **déduits avec étiquetage de
provenance**.

**Ce que j'ai délibérément laissé de côté** :

- **Le retrait de `Dependance` (G10)** → déplacé au Sprint 42, avec motif écrit (voir §3).
- **Les défauts sectoriels** que la note demande au §8 — voir §4, c'est un refus motivé.
- **La nomenclature du Guide Sécheresse** pour `usageCode` : le champ est du texte libre avec des
  suggestions. Inventer une taxonomie concurrente serait pire que d'attendre (§3.3).

---

## 2. Ce qui a été réalisé

**En une phrase** : un site peut désormais dire de quoi son eau est faite, et l'outil en tire un niveau
**pondéré** au lieu du maximum — tout en disant clairement ce qu'il ignore encore.

**Dans les grandes lignes** :

- **`SiteUsage[]`** sur `SavedSite`, plus `tauxRestitution`, `reponse`, `tamponM3`,
  `seuilTechniqueM3`. Tout optionnel : aucun site enregistré ne casse.
- **`weightedLevel()` rend un rang réel**, pas un niveau nommé. 95 % AEP en vigilance + 5 % SUP en
  crise = **1,15**, et aucun niveau nommé ne peut exprimer ça.
- **La saisie se fait en parts**, et les m³ sont **déduits avec leur provenance** jusqu'à l'export.
- **`profileCompleteness()`** fait dire à un site incomplet qu'il l'est, chaque manque assorti de ce
  qu'il coûte.
- **Regarder la page a trouvé deux défauts** qu'aucun test unitaire ne montrait.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/sites.ts` | étendu | `SiteUsage`, `ResponseType`, `LoadProfile`, `SourceType`, trois champs internes ; `Dependance` marqué `@deprecated` avec la date de son retrait |
| `lib/siteProfile.ts` | neuf | `usageTotals`, `volumeConsomme`, `resolveUsageVolume`, `vectorSum`, `weightedLevel`, `profileCompleteness` — tout pur, tout hors ligne |
| `components/UsageVectorEditor.tsx` | neuf | Saisie en parts, somme reportée, m³ déduit affiché et étiqueté |
| `components/AddressSearch.tsx` | modifié | Trois champs numériques + le sous-formulaire ; le descripteur de champ gagne `max` et `scale` |
| `components/HomeClient.tsx` | modifié | État du vecteur, persistance conditionnelle, dépendance de callback corrigée |
| `scripts/test/site-profile.test.ts` | neuf | **49 assertions** |
| `scripts/test/e2e.mjs` | étendu | 62 → **69** contrôles |

---

## 3. Erreurs potentielles

### Un bug attrapé par le linter, et il aurait été silencieux

`useCallback` d'ajout de site **capturait `usages` sans le déclarer** en dépendance. Conséquence : un
site enregistré aurait embarqué un vecteur **périmé** — celui d'avant la dernière modification. Aucun
test ne l'aurait vu (le vecteur existe, il est simplement décalé d'une frappe), et à l'écran rien ne
distingue un vecteur périmé d'un vecteur juste. C'est `react-hooks/exhaustive-deps` qui l'a signalé.

### Deux défauts trouvés en regardant la page

- **Un espace manquant** : « 80 000 m³/an(déduit de la part) ».
- **Le champ d'usage est exposé en `combobox`, pas en `textbox`**, parce qu'il porte un
  `list="usage-suggestions"`. Sémantiquement juste — un datalist *est* un combobox — mais je ne l'ai su
  qu'en lisant l'**arbre ARIA**, après que mon propre contrôle a expiré en cherchant un `textbox`. La
  leçon de la session lecteur d'écran, repayée : le DOM ne dit pas ce que le lecteur d'écran entend.

⚠️ **Et un troisième défaut dans mon test, pas dans le produit** : le contrôle de débordement annonçait
« 390 px » alors que l'e2e tourne au viewport par défaut. Une étiquette qui affirme une vérification
non faite est pire qu'une vérification absente. Le viewport est désormais **forcé** dans ce bloc.

### Les hypothèses qui peuvent ne pas tenir

- **Le rang réel de `weightedLevel` est une moyenne pondérée de rangs entiers**, et rien ne garantit
  que les rangs de gravité soient **linéaires** : passer de alerte (2) à alerte renforcée (3) n'est
  peut-être pas « un cran », et la crise n'est peut-être pas quatre fois la vigilance. Le rang est
  **ordinal traité comme cardinal**. C'est la faiblesse méthodologique la plus sérieuse de ce sprint,
  et je ne connais pas de meilleure option sans un modèle de sévérité que la note ne fournit pas.
- **Le niveau nommé est un arrondi au plus proche.** À rang 1,5 le choix entre vigilance et alerte se
  joue sur un départage arbitraire (le premier trouvé). À corriger si un affichage s'appuie dessus
  pour une décision.
- **La pondération porte sur le volume restreignable**, donc un site dont tout le volume est exempté
  rend `restreignable = 0` et bascule en dégradé. Correct, mais c'est un chemin non testé sur un cas
  réel.
- **`vectorSum` tolère un total > 100 %** en le signalant. Un utilisateur qui saisit 80 + 80 obtient
  une pondération sur 160 %, donc des parts renormalisées silencieusement par la division. Le message
  le dit, le calcul ne refuse pas.
- **`newId()` utilise `Date.now()` + un compteur de module.** Suffisant pour un formulaire, mais deux
  onglets ouverts à la même milliseconde pourraient produire le même id. Sans conséquence ici (les
  vecteurs ne se fusionnent pas entre onglets), à revoir si l'import par lot arrive.

### Non vérifié en conditions réelles

- **Aucune donnée réelle**, comme depuis quatre sessions. ⚠️ **Nuance importante** : le
  sous-formulaire est **entièrement client**, donc les 7 contrôles e2e exercent le **vrai** composant
  et non un bouchon. C'est la première fois de cette session qu'un livrable d'interface est vérifié
  autrement qu'à travers des données inventées.
- **`weightedLevel` n'a jamais tourné sur une réponse VigiEau réelle.** Ses 49 assertions sont sur
  fixtures.
- **Aucun site réel ne possède de vecteur** : la fonctionnalité est livrée, personne ne l'a remplie.
  Tant que c'est le cas, tous les sites sont « incomplets » et la dégradation est le chemin normal.

---

## 4. Points d'amélioration

**Dette assumée** :

- **Pas de défauts sectoriels dans le vecteur**, alors que la note en demande (§8, « valeurs par défaut
  sectorielles clairement marquées comme hypothèses »). Refus motivé : son anti-pattern n°5 interdit de
  brancher le moteur sur le secteur, et la revue du Sprint 21 avait déjà fait retirer une table
  « secteur × niveau ». Un pré-remplissage de formulaire éditable n'est pas le moteur — la frontière
  est défendable — mais elle est **fine**, et j'ai préféré ne pas la franchir sans arbitrage.
- **`usageCode` en texte libre.** La cible est la nomenclature du Guide Sécheresse (§3.3), déjà
  embarquée dans `data/restrictions/guide.json`. La brancher permettrait de **joindre** un usage du
  site à un usage restreint par l'arrêté — c'est-à-dire de calculer ρ par usage du site plutôt que par
  moyenne. **C'est probablement le plus grand gain restant du chantier**, et il n'est pas fait.
- **`Dependance` survit deux sprints de plus.** Motif : `DEPENDANCE_FACTOR` est dupliqué dans
  `interruption.ts` et `portefeuille.ts`, et G1 supprime le premier au Sprint 42. Écrire une couche de
  compatibilité pour la jeter quinze jours plus tard n'avait pas de sens.

**À reprendre** :

- **Joindre `usageCode` à la nomenclature** (ci-dessus). Prérequis pour que le VNP soit calculé par
  usage et non par moyenne d'exposition.
- **Interroger la linéarité des rangs** (§3). Peut-être en exprimant le niveau effectif comme une
  **distribution** de parts par niveau plutôt qu'un scalaire — plus honnête, plus difficile à afficher.
- **Afficher `profileCompleteness` à l'écran.** La fonction existe et est testée ; **aucun composant ne
  l'appelle encore**. Elle est à moitié livrée, exactement comme `ZoneHistory.premiereAnnee` l'était
  (item 5 du HANDBOOK §5).

---

## 5. État Git

- **Branche** : `claude/integrate-file-apply-plan-k5t009` — deux commits (modèle, puis saisie)
- **`main` touché ?** : **NON**.
- **Déployé en prod ?** : **non**.
- **Vérifications** : `npm run build` ✅, `npm run lint` ✅ (après correction du warning, qui était un
  vrai bug), **23 suites** dont `site-profile.test.ts` à **49 assertions**, **69/69 e2e** (7 neufs).

⚠️ **Piège d'environnement** : `pkill -f next-server` **tue le shell qui l'exécute**. Vécu au sprint
précédent, revécu ici — la recette qui marche est `pgrep -f "next-serve[r]" | xargs -r kill -9`.
⚠️ **Playwright hors du script officiel** : `chromium.launch()` échoue seul, il faut le repli
`executablePath: "/opt/pw-browsers/chromium"` que `e2e.mjs` porte déjà.

---

## 6. Prochaines étapes

1. **Sprint 41 — VNP.** *Verrou : levé par le Sprint 38* — Légifrance répond 403 aux deux UA, donc la
   définition de V_ref se transcrit à la main avec citation d'article.
2. **Brancher `usageCode` sur la nomenclature du Guide Sécheresse.** *Verrou : aucun, le fichier est
   embarqué.* C'est ce qui ferait passer le VNP d'une moyenne d'exposition à un calcul par usage.
3. **Afficher `profileCompleteness`.** *Verrou : aucun.* Une fonction testée que personne n'appelle est
   une demi-livraison.
4. **Regarder la production.** ⚠️ Cinquième session consécutive.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Un arrêté sécheresse ne s'applique pas à une entreprise : il s'applique à des **usages de l'eau**.
Arroser des espaces verts, refroidir une machine, remplir des sanitaires — chacun peut être restreint
différemment, et chacun peut venir d'une source différente : le réseau d'eau potable, une rivière, un
forage.

Jusqu'ici l'outil décrivait un site par une seule origine. Résultat : un site qui prend 95 % de son eau
au robinet et 5 % dans une rivière était déclaré « en crise » dès que la rivière l'était. C'est faux,
et c'est le premier des dix anti-patterns que la note interdit.

La solution est de décrire le site comme un **mélange** : 80 % ici, 15 % là, 5 % ailleurs. Le niveau
qu'il subit devient alors une moyenne pondérée, pas un maximum.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Vecteur d'usages** | La liste des usages d'un site avec, pour chacun, sa part du volume et sa source. |
| **SUP / SOU / AEP** | Eaux de surface (rivière), eaux souterraines (nappe), réseau d'eau potable. Trois zonages différents, avec chacun son niveau de gravité. |
| **Niveau pondéré** | La moyenne des niveaux, pondérée par les parts de volume, au lieu du pire des trois. |
| **Volume exempté** | L'eau qu'une restriction ne peut pas toucher : sécurité, défense incendie, santé publique. |
| **Prélèvement / consommation** | Prélever, c'est prendre ; consommer, c'est ne pas rendre. Un refroidissement en circuit ouvert prélève beaucoup et consomme peu. |
| **Taux de restitution** | La part rendue au même cours d'eau ou à la même nappe. |
| **Sans échelle** | Une pondération ne dépend que des proportions : 80/15/5 donne le même résultat pour 1 000 m³ ou 1 000 000. |
| **Provenance** | D'où vient un chiffre : déclaré par le client, ou déduit d'autre chose. À conserver jusqu'à l'export. |

### 7.3 Comment le code s'y prend

**La pondération, en une dizaine de lignes** (`lib/siteProfile.ts`) :

```ts
let rank = 0;
for (const [src, share] of Object.entries(parts) as [SourceType, number][]) {
  rank += rankOf(SOURCE_OF_ZONE[src]) * share;
}
```

`rankOf` donne 1 pour vigilance, 2 pour alerte, 3 pour alerte renforcée, 4 pour crise. Avec 95 % en AEP
(vigilance) et 5 % en SUP (crise) : `1 × 0,95 + 4 × 0,05 = 1,15`.

**Et c'est un nombre à virgule, délibérément.** L'outil pourrait arrondir à « vigilance » et n'afficher
que ça. Mais 1,15 dit quelque chose qu'aucun nom ne dit : « essentiellement en vigilance, avec un
soupçon de crise ». Le niveau nommé est fourni à côté, comme un **arrondi d'affichage**, jamais comme
le résultat.

**Le piège que le code refuse de tomber dedans.** Un site enregistré avant ce sprint n'a pas de
vecteur. La tentation est de le traiter comme un usage unique à 100 % du volume déclaré — ça marche, ça
ne plante pas, et **c'est une invention**. Le code refuse :

```ts
if (base === "aucune") {
  // Returning 0 here would read as "no restriction", so the caller is told the
  // answer is degraded and must not be displayed as a level.
  return { rank: 0, parts: {}, base: "aucune", degrade: true };
}
```

Le drapeau `degrade` et le champ `base` (`"vecteur"` / `"origine_unique"` / `"aucune"`) sont là pour
qu'aucun appelant ne puisse confondre un calcul avec un repli.

**Prélever n'est pas consommer**, et l'écart est énorme :

```ts
export function volumeConsomme(volumeM3, tauxRestitution) {
  if (volumeM3 === undefined || !Number.isFinite(volumeM3)) return undefined;
  if (tauxRestitution === undefined || !Number.isFinite(tauxRestitution)) return undefined;
  const r = Math.min(1, Math.max(0, tauxRestitution));
  return volumeM3 * (1 - r);
}
```

Deux `return undefined` avant tout calcul. Le second est le plus important : sans taux déclaré, la
fonction **refuse de répondre** plutôt que de supposer 0 — car supposer 0 signifierait « ce site
consomme tout ce qu'il prend », ce qui surestime le volume non prélevable d'un facteur mesuré à **19**
entre un circuit ouvert et un procédé évaporatif.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Pourquoi demander des pourcentages et non des m³ ?** Parce qu'un exploitant sait dire « environ 80 %
  part au procédé » et ne sait pas dire « mon circuit de refroidissement a pris 14 300 m³ l'an
  dernier ». Un formulaire qu'on ne peut pas remplir ne collecte rien, et la pondération n'a de toute
  façon besoin que des proportions.
- **Pourquoi étiqueter les m³ déduits ?** Parce que « 80 000 m³ déclarés pour cet usage » et
  « 80 000 m³ calculés depuis une part de 80 % » ne sont pas la même preuve. Un vérificateur en
  assurance limitée demandera l'origine du chiffre ; l'ADR-006 exige qu'on puisse la donner.
- **Pourquoi reporter la somme au lieu de l'imposer ?** Un exploitant qui ne ventile que 85 % de son
  volume dit quelque chose de vrai à 85 %. Refuser sa saisie perdrait les 85 % connus pour punir les
  15 % manquants. Le message nomme l'écart et la pondération porte sur ce qui est décrit.
- **Pourquoi ne pas pré-remplir selon le secteur ?** Parce que ce serait une table calibrée à la main
  branchée sur le secteur, et le Sprint 21 en avait déjà retiré une pour cette raison exacte. La note
  demande des défauts sectoriels **et** interdit de brancher le moteur sur le secteur ; entre les deux,
  j'ai choisi de ne rien inventer et de le documenter.

### 7.5 Pour expérimenter soi-même

**a) Voir la pondération refuser le maximum.**

```bash
npx tsx scripts/test/site-profile.test.ts
```

Cherchez « 95 % AEP vigilance + 5 % SUP crise → rank 1.15 » et, juste après, « NOT the maximum (which
would be crise, rank 4) ». Ces deux lignes sont l'anti-pattern n°1 et son correctif, côte à côte.

**b) Casser la dégradation honnête, et voir ce qu'elle protège.** Dans `lib/siteProfile.ts`, remplacez
le bloc final `if (base === "aucune")` par :

```ts
if (base === "aucune") return { rank: 0, parts: {}, base: "aucune", degrade: false };
```

Relancez. **Un test tombe** : « nothing declared: rank 0 but flagged degraded, so 0 is not read as 'no
restriction' ». Vous venez de rendre un site non décrit indiscernable d'un site sans restriction — la
forme exacte du bug du SWI, cette fois dans le modèle de données.

**c) Manipuler le formulaire pour de vrai.** Lancez l'application, dépliez « Données internes du
site », ajoutez deux usages, mettez 80 % et 15 %. Le message dit **« il manque 5 % »**. Passez le
second à 20 % : il devient « réparti ». Saisissez ensuite 100 000 dans « Volume prélevé » : chaque
ligne affiche son équivalent en m³, suivi de **« (déduit de la part) »**. Ce dernier mot est tout
l'objet de l'étiquetage de provenance — retirez-le mentalement et vous ne sauriez plus si le chiffre
vient de vous ou de l'outil.
