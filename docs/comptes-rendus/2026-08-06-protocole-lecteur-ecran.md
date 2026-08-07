# Compte rendu — Protocole lecteur d'écran, et les quatre défauts qu'il a trouvés

**Date** : 2026-08-06 · **Branche** : `claude/project-ui-ux-audit-b7e8a3` · **Sprint** : hors sprint
(suite de la session UI/UX 33→37)

---

## 1. La question initiale

> Dresse une liste de 10 screens (téléphone) à réaliser des cas concrets pour te permettre de faire
> un check de lecteur d'écran réel (UX/UI mais aussi data).

**Ce que j'ai compris** : le sprint 36 a posé le balisage d'accessibilité et son compte rendu écrit
noir sur blanc qu'**aucun lecteur d'écran réel n'a été utilisé**. La demande ferme cet écart. « Pour
te permettre de faire un check » : je ne peux pas exécuter NVDA ou VoiceOver — la demande est donc
lue comme *produire le matériel qui rend ce test possible*, et non *faire le test*.

**Ce que j'ai livré au-delà de la liste demandée**, parce que la liste seule ne suffit pas :

- les **10 captures** réelles en 390 × 844, chacune dans son état de données ;
- l'**arbre ARIA** de chaque écran (`locator.ariaSnapshot()`), c'est-à-dire **ce que le lecteur
  d'écran parcourt réellement** — sans quoi le test serait une exploration à l'aveugle plutôt qu'une
  comparaison ;
- pour chaque écran, ce qu'il faut **entendre** et le **mode d'échec** correspondant.

**Le « mais aussi data » a structuré la sélection** : cinq des dix cas sont des **états de données
qui se ressemblent à l'œil et ne doivent surtout pas se ressembler à l'oreille** (crise · service
injoignable · territoire non couvert · chargement · aucune station). C'est là que se joue la
véracité du produit, pas dans les gestes.

**Ce que j'ai délibérément laissé de côté** : la carte MapLibre (chantier à part entière), le
formulaire de données internes (peu risqué, des `<label>` natifs), et l'audit automatisé `axe-core`
— qui reste à faire et trouverait ce que personne n'a pensé à écouter.

---

## 2. Ce qui a été réalisé

**En une phrase** : construire le matériel du test au lecteur d'écran a suffi à trouver **quatre
défauts d'accessibilité que le sprint 36 avait manqués**, tous invisibles sur une capture, dont un
qui rendait **muet** le correctif principal de ce sprint.

**Dans les grandes lignes** :

- **`docs/CHECK-LECTEUR-ECRAN.md`** — 10 cas, chacun avec son URL, son état, ses ✅ attendus et son
  ❌ mode d'échec. Pensé comme une **comparaison** (l'arbre ARIA est le contrat, le lecteur d'écran
  est le juge), pas comme une checklist d'exploration.
- **`docs/captures/arbres-aria.md`** — les 10 arbres, versionnés. **Les PNG ne le sont pas** : 19 Mo
  de captures pleine page en 2×, alors que ce qui se vérifie est l'arbre. Une capture ne prouve rien
  sur ce qui est prononcé.
- **Quatre correctifs d'accessibilité**, trouvés en lisant les arbres et vérifiés sur les arbres
  régénérés.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `docs/CHECK-LECTEUR-ECRAN.md` | neuf | Le protocole des 10 écrans. |
| `docs/captures/arbres-aria.md` | neuf | Les 10 arbres ARIA (192 Ko). |
| `components/SitesDashboard.tsx` | modifié | `TypeBadge` : `role="img"` — sans lui, `aria-label` n'était **pas exposé**. |
| `components/ResultPanel.tsx` | modifié | Le code de zone sort du titre. |
| `components/ScorePanel.tsx` | modifié | `sr-only "non estimé"` sur les composantes absentes. |
| `components/SectorImpactPanel.tsx` | modifié | L'émoji de secteur passe en `aria-hidden`. |
| `scripts/test/methodologie.test.ts` | modifié | `Set<string>` explicite — la suite passait sous `tsx` mais ne typait pas. |

**Les quatre défauts, et pourquoi ils avaient échappé** :

| # | Défaut | Ce que l'arbre disait | Pourquoi invisible |
| --- | --- | --- | --- |
| 1 | `aria-label` sur un `<span>` **sans rôle** n'est pas exposé | `text: SUP SOU AEP` — **sans aucun niveau** | Le correctif P5 du sprint 36 (« plus d'encodage par la couleur seule ») était **muet**. L'attribut était bien dans le DOM. |
| 2 | Code de zone concaténé au nom **dans le titre** | `heading "Eure Moyen haut24_028_0003"` | Séparé par une marge à l'écran, collé dans le nom accessible. |
| 3 | Composantes non estimées lues « tiret » ou rien | `text: … (12,5 %) —` | La règle « une absence n'est jamais un zéro » n'était tenue **qu'à l'œil**. |
| 4 | Émoji de secteur prononcé | `heading "🏭 Impact pour le secteur Industrie"` | Décoratif à l'écran, contenu dans l'arbre. |

**Après correction, vérifié sur les arbres régénérés** :

```yaml
- img "Eaux superficielles (cours d'eau) : Alerte renforcée": SUP
- img "Eaux souterraines (nappes) : Alerte": SOU
- img "Eau potable : Vigilance": AEP
- heading "Eure Moyen haut" [level=3]
- paragraph: Code de zone 24_028_0003
- heading "Impact pour le secteur Industrie" [level=3]
- text: Assecs des cours d'eau (Onde)(10 %) non estimé
```

**Ce que les arbres ont aussi confirmé comme correct** (et qui n'a donc pas été touché) : le patron
combobox complet (`combobox [expanded]` + `status: 2 adresses proposées…` + `listbox` + `option
[selected]`), la distinction panne / non-couverture, et l'absence de tout manque affirmé pendant le
chargement.

---

## 3. Erreurs potentielles

**Le fait majeur de cette session** : **le sprint 36 a livré une correction d'accessibilité qui ne
corrigeait rien.** `aria-label` posé sur un `<span>` sans rôle est ignoré — l'élément est
« generic » dans l'arbre. J'avais vérifié que l'attribut était présent dans le DOM et conclu que
c'était fait. **C'est une erreur de méthode, pas d'inattention** : la présence d'un attribut ne dit
rien de son exposition, et je n'avais aucun moyen de m'en apercevoir sans regarder l'arbre.

**Non vérifié en conditions réelles :**

- ⚠️ **Le test lui-même n'a pas été fait.** C'est tout l'objet du document : il rend le test
  possible, il ne le remplace pas. Les ✅ du protocole sont des **attentes déduites de l'arbre**, pas
  des observations. NVDA, JAWS, VoiceOver et TalkBack divergent notamment sur
  `aria-activedescendant` — c'est le point 6 du protocole, et **le risque n° 1 de tout l'édifice**.
- ⚠️ **Toujours aucune donnée réelle.** Les 10 écrans sont produits avec des routes bouchonnées ; les
  chiffres visibles sont inventés. Les **états** sont fidèles, les **valeurs** non.
- **Deux points du protocole sont des hypothèses non testables sans humain** : que les annonces live
  du bandeau de progression ne coupent pas la lecture en cours, et que **8 secondes** suffisent à un
  utilisateur au lecteur d'écran pour atteindre « Annuler la suppression ». Ce délai a été choisi
  pour un usage à la souris ; **il est probablement trop court**, et c'est écrit dans le protocole.
- **Le comportement du curseur après un saut d'ancre n'a jamais été vérifié**, ni sur la fiche site
  (cas 7) ni sur la méthodologie (cas 10). C'est le défaut classique des ancres en page unique : le
  navigateur défile, le lecteur d'écran reste où il était.

**Hypothèses qui pourraient ne pas tenir :**

- **`role="img"` sur un badge textuel est un choix discutable.** Il expose le badge comme une image
  nommée, ce qui masque son contenu textuel (« SUP ») au profit du libellé complet. C'est le
  comportement voulu ici, mais un lecteur qui cherche « SUP » dans la page ne l'entendra plus.
  L'alternative — un `<span class="sr-only">` en plus du texte visible — aurait été plus bavarde.
- **Les 10 cas ne sont pas exhaustifs.** Ils couvrent ce que l'audit avait identifié comme risqué.
  Une violation dans une zone non couverte (la carte, les graphiques SVG) ne serait pas vue.

**Ce qui casserait si une source amont changeait** : rien. Ces correctifs sont du balisage.

---

## 4. Points d'amélioration

**Dette assumée :**

- **Les captures PNG sont hors dépôt.** Décision motivée (19 Mo, et l'arbre est le vrai contrat),
  mais le protocole référence des fichiers qui ne sont pas à côté de lui. Le lecteur doit les
  régénérer ou se les faire transmettre.
- **Le protocole n'est pas exécutable.** Contrairement aux suites de tests, il demande un humain et
  un appareil. C'est irréductible pour ce qu'il teste.

**À reprendre, par valeur :**

- **`axe-core` dans `scripts/test/e2e.mjs`.** Cette session illustre exactement pourquoi : j'ai
  trouvé quatre défauts en lisant des arbres à la main, sur dix écrans. Un balayage automatisé
  couvrirait toutes les pages et attraperait les classes de défauts auxquelles personne n'a pensé.
  **C'est désormais la dette technique la plus rentable du projet.**
- **Vérifier le focus après saut d'ancre** et, le cas échéant, rendre les cibles focalisables.
- **Réévaluer les 8 secondes d'annulation** une fois le test humain fait.
- **`Panel.eyebrow` rend toujours un `<p>` et non un titre** — dette du sprint 33, reportée quatre
  fois maintenant.

---

## 5. État Git

- **Branche de session** : `claude/project-ui-ux-audit-b7e8a3` — commit `8c75f47`
- **`main` touché ?** : **NON** au moment de ce compte rendu. *(Un merge a été demandé
  explicitement par l'utilisateur juste après ; il est consigné dans le commit de merge.)*
- **Déployé en prod ?** : non.
- **Vérifications passées** :
  - `npm run build` — **succès** · `npm run lint` — **clean**
  - **20 suites au vert, 0 échec**
  - **62/62 e2e**
  - **0 px de débordement horizontal** sur les 10 écrans en 390 × 844
  - **Arbres ARIA régénérés après correction** et comparés ligne à ligne sur les quatre défauts

⚠️ **Incident d'environnement, à connaître** : **le conteneur a été réinitialisé entre deux tours**
de la session — `node_modules` supprimé **et arbre de travail revenu au commit d'avant la session**
(`f83d86f`). Rien n'a été perdu parce que les cinq sprints avaient été poussés au fur et à mesure ;
la reprise a été `git fetch origin <branche>` puis `git reset --hard origin/<branche>`, `npm ci`, et
`npm i --no-save playwright`. **Leçon : pousser à chaque sprint, pas en fin de session.**

---

## 6. Prochaines étapes

1. **Faire le test humain**, sur iPhone/VoiceOver **et** Android/TalkBack. *Verrou* : un appareil et
   quelqu'un. C'est la seule étape qui transforme ce document en résultat.
2. **Voir l'application sur la preview Vercel avec de vraies données.** *Verrou* : rien à coder —
   inchangé depuis le sprint 33, et toujours prioritaire sur tout nouveau développement.
3. **Brancher `axe-core`** sur l'e2e. *Verrou* : aucun.
4. **Corriger ce que le test humain remontera** — en particulier le comportement de
   `aria-activedescendant` sur VoiceOver, et le délai d'annulation.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Une partie des utilisateurs n'a jamais vu cette application : ils l'écoutent. Un logiciel appelé
lecteur d'écran lit la page à voix haute, dans l'ordre, et annonce ce que chaque élément **est** —
« bouton », « titre de niveau 2 », « liste de 3 éléments ».

Le sprint précédent avait ajouté les balises censées rendre cela correct. Mais il les avait
vérifiées **dans le code source**, ce qui ne prouve rien : le navigateur construit, à partir du HTML,
une deuxième structure — l'*arbre d'accessibilité* — et c'est **elle seule** que le lecteur d'écran
lit. Une balise peut être parfaitement écrite dans le HTML et n'apparaître nulle part dans cet arbre.

C'est exactement ce qui s'était produit. Les pastilles qui indiquent le niveau de restriction de
chaque type de zone portaient une étiquette « Eaux superficielles : Alerte renforcée »… que
personne n'entendait. Le lecteur d'écran ne disait que « SUP SOU AEP », c'est-à-dire trois sigles
sans aucune indication de gravité.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| Lecteur d'écran | Logiciel qui restitue la page à voix haute. NVDA et JAWS sur Windows, VoiceOver sur Apple, TalkBack sur Android. |
| Arbre d'accessibilité | La structure que le navigateur construit **à partir du** HTML et expose aux technologies d'assistance. Ce n'est **pas** le DOM. |
| Rôle | Ce qu'un élément *est* pour cet arbre : `button`, `heading`, `img`, `combobox`… Un `<span>` ordinaire a le rôle `generic`. |
| Nom accessible | Le texte prononcé pour un élément. Calculé selon des règles précises, où `aria-label` **ne compte que si l'élément a un rôle**. |
| `aria-hidden` | « Cet élément est décoratif, retire-le de l'arbre. » Utile pour un émoji ou une barre grise de chargement. |
| `sr-only` | Une classe CSS qui rend un texte invisible à l'écran mais **présent** dans l'arbre. L'inverse de `aria-hidden`. |
| `ariaSnapshot()` | Fonction de Playwright qui affiche l'arbre d'accessibilité en texte. C'est notre fenêtre sur ce que le lecteur d'écran verra. |

### 7.3 Comment le code s'y prend

**Étape 1 — regarder l'arbre, pas le code.** Toute la session tient dans cette bascule de méthode :

```js
// capture, pour chacun des 10 écrans
trees[id] = await page.locator("main").ariaSnapshot();
```

Et voici, mot pour mot, ce que cette ligne a révélé sur le tableau de bord :

```yaml
- text: SUP SOU AEP        # ← le niveau de gravité a disparu
```

Alors que le code source, lui, avait l'air impeccable :

```tsx
<span aria-label={`${ZONE_TYPE_LABEL[type].long} : ${info.label}`} className="…">
  {type}
</span>
```

**Étape 2 — comprendre pourquoi.** La règle de calcul du nom accessible est stricte : `aria-label`
sur un élément dont le rôle est `generic` — ce qu'est un `<span>` nu — **est ignoré**. Le correctif
tient en un attribut :

```tsx
<span
  role="img"
  aria-label={`${ZONE_TYPE_LABEL[type].long} : ${info.label}`}
  className="…"
>
```

`role="img"` dit « cet élément est une image, et son texte de remplacement est `aria-label` ». Le
mot « image » surprend pour une pastille de texte, mais c'est bien le rôle qui décrit un objet
graphique **porteur de sens** et résumé par une étiquette. Résultat, dans l'arbre régénéré :

```yaml
- img "Eaux superficielles (cours d'eau) : Alerte renforcée": SUP
```

**Étape 3 — l'inverse, quand un texte visible ne doit pas être lu.** L'émoji de secteur était dans
le titre, donc prononcé (« usine Impact pour le secteur Industrie ») :

```tsx
title={
  <>
    <span aria-hidden>{info.icon}</span> Impact pour{" "}
    {info.domestic ? "un" : "le secteur"} {info.label}
  </>
}
```

`aria-hidden` sur l'émoji seul : il reste à l'écran, il disparaît de l'arbre.

**Étape 4 — et le cas symétrique : un texte pour l'oreille seulement.** Quand une donnée n'a pas pu
être calculée, l'interface affiche un tiret. Un tiret ne se prononce pas :

```tsx
{c.score === undefined ? (
  <>
    <span aria-hidden>—</span>
    <span className="sr-only">non estimé</span>
  </>
) : (
  c.score
)}
```

Deux éléments pour une seule information : le tiret pour l'œil, les mots pour l'oreille. C'est ce qui
fait tenir, **dans les deux canaux**, la règle centrale de ce produit — une donnée absente n'est
jamais un zéro.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Pourquoi dix écrans, et pourquoi ceux-là ?** Parce qu'un test humain coûte cher et se fatigue. Les
dix cas sont choisis pour leur **pouvoir discriminant** : cinq états de données qui se ressemblent à
l'œil (une panne de service et une absence de restriction produisent la même page presque vide) et
cinq interactions dont l'échec rend l'application inutilisable. Tester dix écrans bien choisis vaut
mieux que parcourir toute l'application distraitement.

**Pourquoi versionner les arbres et pas les captures ?** Parce qu'ils ne répondent pas à la même
question. Une capture montre ce qui est **affiché** ; l'arbre montre ce qui est **prononcé**. Cette
session existe précisément parce que les deux avaient divergé sans que rien ne le signale. Et 19 Mo
d'images dans un dépôt Git, c'est un coût permanent pour une information secondaire.

**Pourquoi ne pas avoir écrit un test automatique de ces quatre défauts ?** Deux d'entre eux le
pourraient (comparer un arbre ARIA à une référence). Mais un test d'arbre complet casse à chaque
changement de formulation, et devient alors un test qu'on met à jour sans le lire — le pire genre.
La vraie réponse est `axe-core`, qui teste des **règles** et non des chaînes de caractères ; elle est
inscrite en tête des prochaines étapes.

**Pourquoi ne pas avoir simplement fait le test moi-même ?** Je ne peux pas : faire tourner VoiceOver
ou TalkBack demande un appareil réel et une écoute humaine. Prétendre l'avoir fait aurait été le
genre d'affirmation non vérifiée que ce dépôt s'interdit partout ailleurs. J'ai donc livré ce qui
rend le test faisable en une heure au lieu d'une journée.

### 7.5 Pour expérimenter soi-même

**a) Voir l'arbre d'accessibilité sans rien installer.** Ouvrez l'application dans Chrome, puis
DevTools → onglet **Elements** → panneau **Accessibility**. Cliquez une pastille SUP du tableau de
bord : le champ « Name » affiche « Eaux superficielles (cours d'eau) : Alerte renforcée ». C'est ce
que le lecteur d'écran dira. Firefox a l'équivalent dans son onglet « Accessibilité ».

**b) Reproduire le défaut, et le mesurer.** Dans `components/SitesDashboard.tsx`, retirez la ligne
`role="img"` du `TypeBadge`. Reconstruisez, puis relisez le panneau Accessibility sur la même
pastille : le champ « Name » est **vide**, et l'élément est de rôle « generic ». L'attribut
`aria-label` est toujours là, dans le DOM, parfaitement écrit — et parfaitement inutile. C'est la
démonstration la plus courte de la leçon de cette session.

**c) Écouter la différence.** Sur un Mac, activez VoiceOver (⌘ + touche Touch ID trois fois, ou
Réglages → Accessibilité). Naviguez au tableau de bord avec Ctrl + Option + flèches. Comparez ce que
vous entendez sur les pastilles avec et sans le correctif. Une minute d'écoute rend l'enjeu plus
clair que n'importe quelle documentation — y compris celle-ci.
