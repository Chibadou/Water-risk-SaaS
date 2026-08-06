# Compte rendu — Accessibilité et mobile (Sprint 36)

**Date** : 2026-08-06 · **Branche** : `claude/project-ui-ux-audit-b7e8a3` · **Sprint** : 36

---

## 1. La question initiale

> Tu vas désormais agir en tant qu'expert UI/UX pour cette session.
> Réalise un audit de ce projet pour améliorer son UI/UX (carte blanche, avec un oeil neuf)
> Ensuite pose moi des questions pour l'améliorer ensemble.

**Ce que j'ai compris** : quatrième des cinq sprints issus de l'[audit](../AUDIT-UI-UX.md). Il traite
les constats **P4** (l'information essentielle vivait dans des `title`), **P5** (encodage par la
couleur seule, autocomplétion non navigable au clavier, contrastes — la partie contraste ayant été
faite au sprint 33) et **P8** (le tableau de bord tient mal en étroit, la suppression est
irréversible).

**Ce que j'ai laissé de côté** : les `title` restants sur les **éléments de graphique** (cases du
calendrier saisonnier, barres BNPE, barres départementales). WCAG admet `title` en information
*supplémentaire* quand la donnée est disponible autrement, ce qui est le cas ici. Les purger tous
aurait doublé le sprint pour un gain marginal — c'est écrit en §4, pas oublié.

---

## 2. Ce qui a été réalisé

**En une phrase** : le contrôle sans lequel rien ne se passe dans cette application est enfin
utilisable au clavier et annoncé à un lecteur d'écran, les explications essentielles ont quitté les
infobulles pour la page, et le tableau de bord ne déborde plus de l'écran d'un téléphone.

**Dans les grandes lignes** :

- **`AddressAutocomplete` est un combobox ARIA complet.** C'est le contrôle central : aucune page ne
  produit quoi que ce soit tant qu'aucune adresse n'a été choisie. Il n'avait ni rôle, ni
  `aria-expanded`, ni navigation aux flèches — un lecteur d'écran annonçait un champ texte et ne
  mentionnait jamais qu'une liste était apparue, et **la touche Entrée ne faisait rien**.
- **Fondations clavier posées dans `globals.css`** : `:focus-visible` dessiné (rien n'en avait), lien
  d'évitement, et `prefers-reduced-motion` — que le sprint 35 avait rendu nécessaire en introduisant
  des squelettes qui pulsent en continu.
- **`TypeBadge` n'encode plus la gravité par la couleur seule** : un code lisible (V / A / AR / C /
  —) décodé dans la légende, et un `aria-label` complet. C'était trois pastilles identiques pour un
  daltonien, avec la seule réponse textuelle enfermée dans un `title`.
- **Les explications essentielles sont revenues dans la page** (`components/ui/InfoNote.tsx`, un
  `<details>` natif) : les trois sélecteurs du formulaire, la lecture des deux cartes de mesure, le
  « pic pondéré » et les « zones indépendantes », l'échelle 0-100 des signaux, le détail de la
  confiance.
- **Le tableau de bord tient sur un téléphone** : le tableau à six colonnes devient une **liste de
  cartes** sous `md`, les tuiles KPI passent en trois paliers, la barre de boutons enveloppe.
- **La suppression est annulable** : un bandeau d'annulation de 8 s remplace la perte définitive.
  `importSites` et non `addSite`, pour que le site revienne **avec son `createdAt` d'origine**.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `components/AddressAutocomplete.tsx` | réécrit | Combobox ARIA : rôles, `aria-expanded`, `aria-activedescendant`, flèches / Entrée / Échap / Home / End, région live. |
| `app/globals.css` | modifié | `:focus-visible`, `.skip-link`, `@media (prefers-reduced-motion: reduce)`. |
| `components/Shell.tsx` | modifié | Lien d'évitement + `id="contenu"` sur `<main>`. |
| `components/ui/InfoNote.tsx` | neuf | Le remplaçant des infobulles : `<details>` natif, donc opérable au clavier, lisible au doigt, et **atteignable par le Ctrl+F du navigateur**. |
| `components/SitesDashboard.tsx` | modifié | Cartes sous `md`, KPI 2/3/5, `TypeBadge` codé, annulation de suppression, `ScoreCell`/`JoursCell` partagés. |
| `components/AddressSearch.tsx`, `SiteIndicators.tsx`, `PortfolioCorrelation.tsx`, `AnticipationPanel.tsx`, `ScorePanel.tsx` | modifiés | `title` essentiels remplacés par du texte en page. |
| `scripts/test/e2e.mjs` | modifié | **62 vérifications** (+2), et trois sélecteurs mis à jour — voir §3. |

**Mesures :**

| Ce qui est mesuré | Avant | Après |
| --- | --- | --- |
| Débordement horizontal à 390 px — `/sites` | **38-40 px** | **0 px** |
| Idem — `/`, `/methodologie`, `/carte` | 0 px | **0 px** |
| Premier élément atteint par Tab | l'en-tête | **« Aller au contenu »** |
| Sélection d'une adresse au clavier | **impossible** | ArrowDown ×2 puis Entrée → sélectionne |
| Annonce vocale à l'ouverture de la liste | **aucune** | « 2 adresses proposées, utilisez les flèches pour parcourir » |
| Suppression d'un site | définitive | **annulable**, `createdAt` préservé (vérifié) |

---

## 3. Erreurs potentielles

**Bugs et régressions trouvés pendant la session :**

1. **Une page entièrement blanche si `/api/geocode` répondait sans `results`.** `setSuggestions(data.results)`
   n'était pas gardé. ⚠️ **Ce n'est PAS atteignable en production** — les cinq chemins de retour de
   la route renvoient `results` — mais c'est la **troisième fois** de la session qu'un champ non
   gardé produit un écran blanc (après `SiteIndicators.stations` et `TransitionPayload`). Le mode de
   défaite est toujours le même : perte totale de la page, pas dégradation d'un bloc.
2. **L'e2e a détecté trois changements de contrat que j'aurais laissés passer.** (a) La liste de
   suggestions n'est plus faite de `button` mais d'`option` : le test de la carte cliquait un bouton
   qui n'existe plus. (b) Le tableau de bord rend désormais **chaque site deux fois dans le DOM**
   (tableau + cartes), ce qui rend ambiguë toute recherche par texte. (c) Après suppression, le nom
   du site **est toujours à l'écran** — dans le bandeau d'annulation — donc le test « site retiré »
   ne pouvait plus s'écrire sur le texte brut.

**Non vérifié en conditions réelles :**

- ⚠️ **Aucun lecteur d'écran réel n'a été utilisé.** J'ai vérifié la **présence et la mise à jour des
  attributs** (`aria-expanded`, `aria-activedescendant`, contenu de la région live) au pilotage
  Playwright. Ce n'est pas la même chose que d'entendre NVDA, JAWS ou VoiceOver le restituer : les
  divergences d'implémentation sur `aria-activedescendant` sont connues et **je ne peux pas affirmer
  que l'expérience est bonne**, seulement que le balisage est conforme au patron.
- ⚠️ **Aucun audit automatisé d'accessibilité n'a été passé** (pas d'axe-core dans le projet). Les
  corrections portent sur ce que l'audit manuel avait identifié, pas sur un balayage exhaustif :
  **d'autres violations existent probablement**.
- **Le `prefers-reduced-motion` n'a pas été observé activé.** La règle CSS est écrite, elle n'a pas
  été testée avec `Emulation.setEmulatedMedia`.
- **Le contraste du nouveau code de `TypeBadge`** (`opacity-70` sur la couleur du badge) n'a pas été
  mesuré. Sur `bg-yellow-100 text-yellow-900`, 70 % d'opacité peut passer sous le seuil.
- **La liste de cartes du tableau de bord n'a été vue qu'à 390 px**, jamais entre 640 et 768 px, là
  où elle bascule vers le tableau.

**Hypothèses qui pourraient ne pas tenir :**

- **Le double rendu du tableau de bord est un choix, avec un coût.** Chaque site est dans le DOM deux
  fois. `display: none` le retire bien de l'arbre d'accessibilité et du Ctrl+F, donc **aucun lecteur
  n'entend le doublon** — mais le DOM est deux fois plus lourd sur un parc de 40 sites, et toute
  requête par texte doit désormais être scopée. L'alternative (basculer en JS sur une media query)
  provoque une divergence d'hydratation ; c'est pour cela qu'elle a été écartée.
- **Le délai d'annulation est de 8 s**, choisi à la main. Trop court pour quelqu'un qui a détourné le
  regard, trop long pour un bandeau qu'on ne lit pas.
- **Une seule annulation est mémorisée.** Supprimer deux sites de suite ne permet de récupérer que le
  second : le premier est perdu **sans que rien ne le dise**.
- **`InfoNote` est fermé par défaut.** L'information est atteignable, mais un lecteur qui ne
  soupçonne pas la question ne l'ouvrira pas. C'est mieux qu'un `title` invisible au doigt, ce n'est
  pas aussi bien que du texte toujours visible.

**Ce qui casserait si une source amont changeait** : rien de nouveau. Le combobox est plus robuste
qu'avant (une réponse malformée donne une liste vide au lieu d'un écran blanc).

---

## 4. Points d'amélioration

**Dette assumée :**

- **Les `title` restants sur les éléments de graphique** (calendrier saisonnier, barres BNPE et
  départementales, jauges 2050). Admissibles en information supplémentaire, mais toujours invisibles
  au doigt. Le bon correctif serait un panneau de détail au tap, pas une suppression.
- **`eyebrow` rend toujours un `<p>` et non un titre** — dette du sprint 33, **encore ouverte**, et
  c'est la troisième fois qu'elle est reportée. Six panneaux restent absents du plan du document.
- **Double rendu du tableau de bord** (voir §3).

**À reprendre :**

- **Ajouter `axe-core` à la suite e2e.** C'est le seul moyen d'arrêter de corriger l'accessibilité
  au jugé. Une passe automatisée sur les quatre pages coûterait quelques lignes et donnerait un
  chiffre au lieu d'une impression.
- **Mesurer les contrastes des badges sur fond coloré**, explicitement laissés de côté au sprint 33
  et toujours non faits.
- **Empiler les annulations** plutôt qu'une seule.
- **Le champ d'adresse reste vide à l'ouverture d'un lien partagé** — dette signalée au sprint 34,
  inchangée, et d'autant plus visible maintenant que le champ est le contrôle le mieux traité de la
  page.

---

## 5. État Git

- **Branche de session** : `claude/project-ui-ux-audit-b7e8a3`
- **`main` touché ?** : **NON**. Aucun merge, aucune demande de mise en prod.
- **Déployé en prod ?** : **non**. Rien de cette session n'a été vu sur un déploiement réel.
- **Vérifications passées** :
  - `npm run build` — **succès** · `npm run lint` — **clean**
  - **19 suites au vert, 0 échec**
  - **62/62 e2e** (60 → 62, deux vérifications neuves : le double rendu du tableau de bord n'affiche
    qu'une seule de ses deux formes, et la suppression propose une annulation)
  - **Débordement horizontal à 390 px : 0 px sur les quatre pages** (`/sites` était à 38-40 px)
  - **Parcours clavier vérifié de bout en bout** sur le combobox, et **annulation de suppression
    vérifiée jusqu'au `createdAt`**

---

## 6. Prochaines étapes

1. **Voir l'application sur la preview Vercel avec de vraies données.** *Verrou* : rien à coder.
   Quatre sprints s'empilent maintenant sur du non-constaté.
2. **Sprint 37 — ancres de méthodologie.** *Verrou* : aucun. C'est le dernier de la série, et le plus
   simple : `Panel` accepte déjà un `id`.
3. **Ajouter axe-core à l'e2e.** *Verrou* : aucun, mais à faire **après** le sprint 37 pour ne pas
   mélanger un chantier d'outillage à un chantier de contenu.
4. **Payer la dette `eyebrow`.** *Verrou* : aucun — seulement le fait qu'elle a été reportée trois
   fois, ce qui est le signe qu'elle doit être planifiée et non « prise au passage ».

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Toute cette application commence au même endroit : un champ où l'on tape une adresse, et une liste de
propositions qui apparaît dessous. Tant qu'on n'a pas choisi une adresse, il n'y a rien à voir sur
aucune page.

Ce champ ne fonctionnait qu'à la souris. Au clavier, on pouvait taper — mais les flèches ne faisaient
rien, et la touche Entrée non plus. Il fallait deviner qu'on pouvait tabuler dans une liste dont rien
n'annonçait l'existence. Pour quelqu'un qui utilise un lecteur d'écran, l'application était
littéralement inutilisable : le logiciel annonçait « champ de saisie », l'utilisateur tapait, et
plus rien n'était dit — ni qu'une liste s'était ouverte, ni combien elle contenait de résultats.

Deux autres problèmes du même ordre. Sur le tableau de bord, le niveau de restriction de chaque zone
était indiqué **uniquement par une couleur** : trois pastilles « SUP SOU AEP » que quelqu'un qui
distingue mal les couleurs voit identiques. Et beaucoup d'explications indispensables étaient
enfermées dans des infobulles — ce petit texte qui apparaît au survol de la souris. Sur un téléphone,
il n'y a pas de survol : ces explications n'existaient tout simplement pas.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| Lecteur d'écran | Un logiciel qui lit la page à voix haute. Il ne voit pas les pixels : il lit une structure appelée arbre d'accessibilité. |
| ARIA | Un ensemble d'attributs HTML qui décrivent le *rôle* et l'*état* des éléments à cet arbre. |
| Combobox | Le patron standard « champ de saisie + liste de propositions ». ARIA en définit précisément le balisage et le clavier attendus. |
| `aria-activedescendant` | Dit « l'élément actif de ma liste est celui-ci », **sans déplacer le focus** — c'est ce qui permet de continuer à taper tout en parcourant la liste. |
| Région live (`aria-live`) | Une zone dont les changements sont annoncés spontanément. |
| `:focus-visible` | Un sélecteur CSS qui ne s'active qu'en navigation clavier, jamais au clic de souris. |
| Lien d'évitement | Un lien caché, premier de la page, qui saute directement au contenu. |
| WCAG 1.4.1 | La règle « l'information ne doit jamais être portée par la couleur seule ». |
| `prefers-reduced-motion` | Une préférence système « limitez les animations », que le CSS peut lire. |

### 7.3 Comment le code s'y prend

**Étape 1 — déclarer ce que le composant EST.** Un lecteur d'écran ne devine rien de l'apparence ; il
lit des rôles et des états :

```tsx
// components/AddressAutocomplete.tsx
<input
  type="text"
  role="combobox"
  aria-expanded={open && suggestions.length > 0}
  aria-controls={listboxId}
  aria-autocomplete="list"
  aria-activedescendant={active >= 0 ? optionId(active) : undefined}
  …
/>
```

`aria-activedescendant` est le mécanisme central, et il n'est pas intuitif. On pourrait croire qu'il
faut déplacer le focus sur l'option surlignée — mais alors l'utilisateur ne pourrait plus taper, le
focus ayant quitté le champ. `aria-activedescendant` dit « le focus est ici, mais l'élément actif est
celui-là ». Le lecteur annonce l'option, la frappe continue de fonctionner.

**Étape 2 — implémenter le clavier attendu.** Le patron ARIA n'est pas seulement du balisage, c'est
aussi un contrat de comportement :

```tsx
if (e.key === "ArrowDown" && !open && n > 0) {
  e.preventDefault();
  setOpen(true);
  setActive(0);
  return;
}
```

Ce cas précis mérite un mot : quelqu'un qui a fermé la liste avec Échap doit pouvoir la rouvrir. Sans
cette branche, il faudrait retaper le texte — un cul-de-sac qu'on ne rencontre jamais à la souris.

Et Entrée n'est intercepté **que** lorsqu'une option est surlignée :

```tsx
case "Enter":
  if (active >= 0 && suggestions[active]) {
    e.preventDefault();
    select(suggestions[active]);
  }
  break;
```

Sinon Entrée garde son sens ordinaire. Confisquer une touche universelle est le genre de correctif
qui répare une chose et en casse une autre.

**Étape 3 — dire ce qui vient d'arriver.** Un état n'est annoncé que si on l'annonce :

```tsx
<p className="sr-only" role="status" aria-live="polite">
  {open && suggestions.length > 0
    ? `${suggestions.length} adresse${…} proposée${…}, utilisez les flèches pour parcourir`
    : ""}
</p>
```

`sr-only` : invisible à l'écran, présent pour le lecteur. Le texte dit **combien** et **comment
faire** — un utilisateur qui découvre le champ n'a aucune raison de deviner que les flèches marchent.

**Étape 4 — ne jamais laisser la couleur porter seule le sens.**

```tsx
// components/SitesDashboard.tsx
const NIVEAU_CODE: Record<NiveauGravite, string> = {
  vigilance: "V", alerte: "A", alerte_renforcee: "AR", crise: "C",
};
```

La pastille affiche maintenant `SUP AR` au lieu de `SUP`, avec un `aria-label` complet et une légende
sous le tableau qui décode les lettres. La couleur reste — elle est utile — mais elle n'est plus le
seul porteur.

**Étape 5 — sortir les explications des infobulles.** `InfoNote` est un `<details>` natif, et ce
choix est délibéré :

```tsx
<details className="group text-xs">
  <summary className="cursor-pointer …">{label}</summary>
  <div className="mt-1.5 rounded-md border border-line bg-canvas px-3 py-2 …">{children}</div>
</details>
```

Un `<details>` est opérable au clavier et au doigt sans une ligne de JavaScript de notre part, il
survit à un échec d'hydratation, et — détail qui compte ici — **le Ctrl+F du navigateur voit à
l'intérieur**. Sur une fiche qu'un lecteur fouille pour constituer un dossier ESG, c'est décisif.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Pourquoi implémenter le patron ARIA à la main plutôt que prendre une bibliothèque ?** Une
bibliothèque de combobox accessible aurait été plus sûre. Mais ce projet a **cinq dépendances au
total** (Next, React, MapLibre, PMTiles) et cette frugalité est un choix assumé du dépôt. Le patron
combobox est parfaitement documenté ; le coût est une centaine de lignes qu'il faut alors tester —
ce que fait le nouveau parcours clavier de l'e2e.

**Pourquoi `:focus-visible` et non `:focus` ?** `:focus` dessine le contour aussi au clic de souris,
ce que beaucoup trouvent laid — et c'est précisément la raison pour laquelle tant de sites
suppriment le contour, cassant la navigation clavier pour tout le monde. `:focus-visible` ne
l'affiche qu'en navigation clavier : plus de raison de l'enlever.

**Pourquoi des cartes plutôt qu'un tableau qui défile sur mobile ?** Le défilement horizontal existait
déjà et c'était le problème : sans indice visuel, personne ne devine que trois colonnes attendent à
droite — dont le bouton Supprimer. Un tableau à six colonnes n'a pas de version étroite honnête.

**Pourquoi une annulation et non une confirmation ?** Une confirmation punit le cas ordinaire : neuf
suppressions sur dix sont voulues, et neuf fois sur dix la boîte de dialogue est cliquée sans être
lue. L'annulation laisse le cas ordinaire à un clic et rattrape le dixième. C'est aussi la raison de
`importSites` plutôt que `addSite` : `addSite` régénère la date de création, donc « annuler » aurait
silencieusement redaté le site — et une annulation qui ne restitue pas exactement l'état d'avant
n'est pas une annulation.

**Pourquoi accepter que chaque site soit rendu deux fois dans le DOM ?** L'alternative est de choisir
la forme en JavaScript d'après la largeur de l'écran — ce qui produit une divergence d'hydratation
(le serveur ne connaît pas la largeur de l'écran). Le double rendu piloté par CSS est la solution
robuste, et `display: none` retire vraiment la forme cachée de l'arbre d'accessibilité : personne ne
l'entend deux fois. Le coût est un DOM plus lourd, écrit en §3.

### 7.5 Pour expérimenter soi-même

**a) Utiliser l'application sans souris.** C'est l'expérience la plus parlante et elle ne demande
aucun code. Ouvrez la page d'accueil, posez la souris de côté. Tab : le lien « Aller au contenu »
apparaît. Tab encore : le champ d'adresse. Tapez trois lettres, puis ArrowDown, ArrowDown, Entrée.
L'analyse se lance. Refaites l'exercice avec `git stash` sur ce sprint : vous ne pourrez pas
sélectionner d'adresse du tout.

**b) Casser un test, et voir ce qu'il protégeait.** Dans `components/AddressAutocomplete.tsx`,
supprimez le cas `Enter` du `switch` :

```tsx
case "Enter":
  if (active >= 0 && suggestions[active]) { … }
  break;
```

Reconstruisez, relancez le serveur, puis :

```bash
node scripts/test/e2e.mjs
```

Le test de la carte échoue : il sélectionne désormais une adresse **au clavier** (ArrowDown puis
Entrée), et sans cette branche la sélection ne se produit jamais. Regardez la page pendant ce temps :
elle est parfaitement normale, la liste s'affiche, les flèches surlignent — seule la validation
manque. C'est le genre de défaut qu'un test de rendu ne voit pas et qu'un utilisateur clavier heurte
à la première seconde.

**c) Mesurer le débordement plutôt que le croire.** Réduisez la fenêtre à 390 px de large sur
`/sites`, ouvrez la console :

```js
document.documentElement.scrollWidth - document.documentElement.clientWidth
```

Vous lisez `0`. Retirez maintenant `flex-wrap` de la barre de boutons du tableau de bord,
reconstruisez : vous lisez `40`. Une seule classe CSS, quarante pixels de page qui glisse
latéralement — et rien de visible sur une capture d'écran, ce qui est exactement pourquoi il faut le
mesurer.
