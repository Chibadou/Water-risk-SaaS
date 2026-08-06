# Compte rendu — Une méthodologie navigable (Sprint 37)

**Date** : 2026-08-06 · **Branche** : `claude/project-ui-ux-audit-b7e8a3` · **Sprint** : 37

---

## 1. La question initiale

> Tu vas désormais agir en tant qu'expert UI/UX pour cette session.
> Réalise un audit de ce projet pour améliorer son UI/UX (carte blanche, avec un oeil neuf)
> Ensuite pose moi des questions pour l'améliorer ensemble.

**Ce que j'ai compris** : dernier des cinq sprints issus de l'[audit](../AUDIT-UI-UX.md). Il traite le
constat **P6** : la page de méthodologie compte **26 sections sur 758 lignes**, sans aucune ancre ni
sommaire, et **tous les panneaux du produit y renvoyaient par un `/methodologie` nu**. Depuis
« Disponibilité en eau projetée », on atterrissait en haut d'une page dont la section correspondante
est la **24ᵉ**. Sur un produit dont l'argument de vente *est* la traçabilité, c'était le lien le plus
décevant — et le moins cher à réparer.

**Ce que j'ai laissé de côté** : le sommaire de cette page est **statique**, pas collant, et ne suit
pas la section active — contrairement à celui de la fiche site (sprint 34). C'est une page de
référence qu'on consulte par sauts, pas un document qu'on parcourt : le coût d'un `IntersectionObserver`
ne se justifiait pas ici. C'est une décision, elle est en §4.

---

## 2. Ce qui a été réalisé

**En une phrase** : chaque panneau du produit renvoie désormais vers **la section qui l'explique**, et
non plus vers le haut d'une page de 26 chapitres — avec un test qui rend une ancre morte impossible.

**Dans les grandes lignes** :

- **`lib/methodologie.ts` : un registre unique** de 26 entrées `{ id, titre }`, consommé par **les
  deux** côtés. La page génère ses `id` **et ses titres** depuis le registre, et les panneaux lient
  `methodologieHref("…")`.
- **Le typage fait le travail** : `MethodoId` est une union littérale dérivée du registre
  (`as const satisfies`), donc `methodologieHref("projection-205")` **ne compile pas**. Une ancre
  morte cesse d'être un bug silencieux — elle devient une erreur de build.
- **Le titre affiché vient du registre**, pas du point d'appel. Sans cela, renommer une section dans
  le registre aurait laissé la page afficher l'ancienne formulation : le registre serait devenu un
  double, pas une source.
- **Un sommaire en tête de page** : 26 liens sur trois colonnes, annonçant leur nombre.
- **Neuf panneaux recâblés** vers leur ancre. Le lien du pied de page reste sur la page entière —
  c'est le point d'entrée général, pas une référence à une section.
- **`scripts/test/methodologie.test.ts`** : **13 vérifications** qui ferment ce que TypeScript ne voit
  pas — la page rend exactement le registre, dans son ordre, et **aucun composant ne lie plus la page
  nue**.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/methodologie.ts` | neuf | Le registre, `MethodoId`, `methodologieHref`, `methodoTitre`. |
| `app/methodologie/page.tsx` | modifié | `<Section id>` au lieu de `<Section title>` ; `id` + `scroll-mt-6` sur chaque section ; sommaire en tête. |
| `scripts/test/methodologie.test.ts` | neuf | 13 vérifications, dont l'anti-ancre-morte et l'anti-lien-nu. |
| 9 composants | modifiés | `href="/methodologie"` → `href={methodologieHref("…")}`. |

**Mesures :**

| Ce qui est mesuré | Valeur |
| --- | --- |
| Sections portant un `id` | **26 / 26** |
| Liens du sommaire | **26** |
| Composants liant encore la page nue | **1** (le pied de page, volontairement) |
| Lien profond `#projection-2050` | atteint la section, **87 px du haut de la fenêtre** |
| Débordement horizontal à 390 px | **0 px** |

---

## 3. Erreurs potentielles

**Bugs trouvés et corrigés pendant la session :**

- **Un import inséré au milieu d'un import multiligne** dans `ScorePanel.tsx` par mon script de
  réécriture — cassait la compilation, attrapé immédiatement par `tsc`. Sans conséquence, mais il
  rappelle que **réécrire des imports par script est fragile** : l'heuristique « après la dernière
  ligne commençant par `import` » se trompe dès qu'un import est écrit sur plusieurs lignes.

**Non vérifié en conditions réelles :**

- ⚠️ **Comme les quatre sprints précédents, rien n'a été vu sur un déploiement réel.** La page de
  méthodologie ne dépend d'aucune donnée externe, donc c'est le sprint le **moins** exposé à cette
  limite — mais elle reste vraie.
- **Le décalage d'ancre n'est pas au réglage voulu.** `scroll-mt-6` vaut 24 px ; la mesure donne
  **87 px** entre le haut de la fenêtre et la section ciblée. L'écart n'a pas été expliqué (marge de
  la section, arrondi du navigateur). Le résultat est utilisable — la section est bien en haut de vue
  — mais **le réglage ne fait pas ce que son nom laisse croire**, et je ne sais pas pourquoi.
- **Le choix de l'ancre par panneau est un jugement.** `RessourcePanel` pointe vers « Partage de la
  ressource et arbitrage des usages » plutôt que vers une section qui lui serait propre — parce
  qu'aucune n'existe. `Landing` pointe vers « Avertissement », ce qui correspond à son libellé
  « Méthodologie et limites » mais saute par-dessus les 25 autres sections. **Ces associations n'ont
  été validées par personne.**
- **Aucune vérification que chaque section explique bien le panneau qui la cible.** Le test garantit
  que l'ancre **existe**, jamais qu'elle soit **pertinente**.

**Hypothèses qui pourraient ne pas tenir :**

- **Les `id` sont désormais un contrat externe.** Ils apparaissent dans des URL que des lecteurs
  peuvent coller dans un rapport ESG. Les renommer casserait ces liens **sans que rien ne le
  signale** — le test vérifie la cohérence interne, pas la stabilité dans le temps.
- **Le test lit les sources en texte brut** (expressions régulières sur `<Section id="…">` et
  `"/methodologie"`). Une écriture différente mais valide — un `id` construit dynamiquement, un lien
  passé par une variable — passerait à côté.
- **La liste des exceptions au lien nu est en dur** (`Shell.tsx`). Ajouter un point d'entrée général
  légitime ailleurs ferait échouer le test à tort.

**Ce qui casserait si une source amont changeait** : rien. Cette page ne consomme aucune donnée
externe.

---

## 4. Points d'amélioration

**Dette assumée :**

- **Le sommaire n'est ni collant ni actif.** Décision motivée (page de référence consultée par
  sauts), mais un lecteur qui descend perd son repère.
- **Le décalage de 87 px** n'est pas maîtrisé (§3).
- **Le test compare des sources, pas un DOM.** Un test de bout en bout qui cliquerait chaque lien de
  méthodologie et vérifierait l'arrivée serait plus fort — et pourrait vérifier la **pertinence** en
  affichant la section atteinte.

**À reprendre :**

- **Deux sections manquent au registre pour des blocs qui existent** : `RessourcePanel` et `Landing`
  pointent vers des sections voisines faute d'avoir la leur.
- **Le rapport ESG (`lib/report.ts`) cite la méthodologie en texte** ; il pourrait citer les ancres,
  ce qui rendrait le PDF navigable vers le site.

---

## 5. État Git

- **Branche de session** : `claude/project-ui-ux-audit-b7e8a3`
- **`main` touché ?** : **NON**. Aucun merge, aucune demande de mise en prod.
- **Déployé en prod ?** : **non**.
- **Vérifications passées** :
  - `npm run build` — **succès** · `npm run lint` — **clean**
  - **20 suites au vert, 0 échec** (une neuve : `methodologie.test.ts`, **13 vérifications**)
  - **62/62 e2e**
  - **26 / 26 sections ancrées**, 26 liens de sommaire, **0 px** de débordement à 390 px, lien
    profond vérifié

---

## 6. Prochaines étapes

1. **Voir l'application sur la preview Vercel avec de vraies données.** *Verrou* : rien à coder.
   **C'est désormais la seule étape qui compte** : cinq sprints se sont empilés sans qu'aucun n'ait
   été confronté à une réponse VigiEau réelle.
2. **Ajouter `axe-core` à la suite e2e.** *Verrou* : aucun. Le sprint 36 a corrigé ce que l'audit
   manuel avait vu ; c'est le seul moyen de savoir ce qu'il n'a pas vu.
3. **Payer la dette `eyebrow`** (six panneaux sans titre dans le plan du document), reportée trois
   fois.
4. **Mesurer les contrastes sur fond coloré**, explicitement écartés au sprint 33.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

L'application affiche des chiffres qui demandent des explications : d'où ils viennent, comment ils
sont calculés, ce qu'ils ne disent pas. Ces explications existent, et elles sont bonnes : une page
« Méthodologie » de vingt-six sections.

Le problème, c'est qu'on ne pouvait pas y arriver. Chaque bloc du produit affichait un lien
« Méthodologie » qui menait **en haut** de cette page. Pour trouver l'explication de la projection
2050, il fallait faire défiler vingt-trois sections. En pratique, personne ne le fait — donc les
explications étaient écrites, publiées, et jamais lues.

Le sprint donne une adresse à chaque section, et fait pointer chaque bloc vers la sienne.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| Ancre / fragment | La partie d'une URL après `#`. `#projection-2050` demande au navigateur de faire défiler jusqu'à l'élément portant cet `id`. |
| Registre | Ici, une simple liste en TypeScript qui sert de source unique de vérité pour toutes les sections. |
| Union littérale | Un type qui n'accepte qu'une liste finie de chaînes précises. `"score" | "bnpe" | …` plutôt que `string`. |
| `as const` | Dit à TypeScript de figer les valeurs exactes plutôt que de les élargir en `string`. |
| `satisfies` | Vérifie qu'un objet respecte une forme **sans** perdre ses valeurs exactes. |
| Lien mort | Un lien vers une ancre inexistante. Il ne produit aucune erreur : le navigateur reste en haut de la page. |
| `scroll-margin-top` | Un décalage appliqué quand on saute vers une ancre, pour qu'un en-tête fixe ne recouvre pas le titre. |

### 7.3 Comment le code s'y prend

**Étape 1 — une seule liste, deux consommateurs.**

```ts
// lib/methodologie.ts
export const METHODO_SECTIONS = [
  { id: "signaux", titre: "Deux signaux complémentaires" },
  { id: "score", titre: "Score de risque courant" },
  // … 24 autres
] as const satisfies readonly MethodoSection[];
```

`as const satisfies` mérite qu'on s'y arrête, parce que c'est l'astuce qui fait tout tenir. `satisfies`
seul vérifierait la forme mais élargirait `id` en `string`. `as const` seul figerait les valeurs sans
vérifier la forme. Les deux ensemble donnent : forme vérifiée **et** valeurs exactes conservées. D'où :

```ts
export type MethodoId = (typeof METHODO_SECTIONS)[number]["id"];
```

`MethodoId` vaut maintenant `"signaux" | "score" | …`, dérivé automatiquement. Ajoutez une section :
le type s'élargit tout seul. Supprimez-en une : tout code qui la référençait cesse de compiler.

**Étape 2 — rendre le lien impossible à écrire de travers.**

```ts
export function methodologieHref(id: MethodoId): string {
  return `/methodologie#${id}`;
}
```

C'est trois lignes, et c'est la moitié du sprint. `methodologieHref("projection-205")` — une faute de
frappe — **ne compile pas**. Sans cela, la même faute produirait un lien qui fonctionne (le navigateur
ne se plaint jamais d'une ancre absente) mais qui ne va nulle part.

**Étape 3 — la page rend le registre, elle ne le double pas.**

```tsx
// app/methodologie/page.tsx
function Section({ id, children }: { id: MethodoId; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-6">
      <h2 className="text-xl font-semibold text-ink">{methodoTitre(id)}</h2>
      …
    </section>
  );
}
```

Notez que le **titre vient du registre**. On aurait pu garder `<Section id="score" title="Score…">` :
plus lisible au point d'appel. Mais alors renommer une section dans le registre aurait laissé la page
afficher l'ancien libellé, et le registre serait devenu une copie à maintenir plutôt qu'une source.

**Étape 4 — vérifier ce que le typage ne voit pas.** TypeScript garantit que toute ancre écrite via
`methodologieHref` existe. Il ne peut pas savoir si la **page** rend bien toutes les sections, ni si
un composant a gardé un lien nu écrit à la main. D'où :

```ts
// scripts/test/methodologie.test.ts
const offenders = components
  .filter(({ src }) => src.includes('"/methodologie"'))
  .map(({ file }) => file);

const allowed = new Set(["Shell.tsx"]); // le pied de page : point d'entrée général
const unexpected = offenders.filter((f) => !allowed.has(f));
check(`no panel links to the bare page (found: ${unexpected.join(", ") || "none"})`,
  unexpected.length === 0);
```

Le message d'échec **nomme les fichiers fautifs**. Un test qui dit seulement « faux » oblige à
enquêter ; un test qui dit « `Projection2050.tsx` » se corrige en dix secondes.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Pourquoi un registre plutôt que des `id` écrits dans la page ?** Écrire `<section id="score">`
directement aurait marché. Mais rien n'aurait empêché un panneau de lier `#scores` (avec un s), ni
personne de renommer l'`id` sans toucher aux dix liens. Le registre transforme ces deux erreurs en
erreurs de compilation.

**Pourquoi ne pas générer les `id` depuis les titres ?** Une fonction « slugify » (« Score de risque
courant » → `score-de-risque-courant`) aurait évité d'écrire les `id` à la main. Écarté pour deux
raisons. Les `id` deviennent des **URL publiques**, qu'un lecteur peut coller dans un rapport :
reformuler un titre casserait alors silencieusement des liens externes. Et les slugs auto-générés
sont longs et laids là où `#score` est court et lisible.

**Pourquoi laisser le pied de page pointer vers la page nue ?** Parce que c'est un point d'entrée
général, pas une référence à un chapitre. Le test l'autorise **explicitement**, avec la raison écrite
à côté — une exception nommée vaut mieux qu'une règle assouplie.

**Pourquoi un sommaire statique alors que la fiche site en a un collant ?** Parce que les deux pages
ne se lisent pas pareil. La fiche site se parcourt de haut en bas et on veut savoir où l'on en est.
La méthodologie se consulte par sauts : on y arrive **déjà** sur la bonne section, par un lien. Un
sommaire collant y coûterait de la place pour un service qu'on ne rend qu'à ceux qui la lisent en
entier.

### 7.5 Pour expérimenter soi-même

**a) Voir le lien profond fonctionner.** Ouvrez une fiche site, descendez au chapitre 4, cliquez
« Méthodologie ». Vous arrivez directement sur « Projection 2050 » — 24ᵉ section, environ 10 400
pixels plus bas que le haut de la page. C'est ce défilement-là que personne ne faisait à la main.

**b) Casser un test, et voir ce qu'il protégeait.** Dans `components/Projection2050.tsx`, remplacez :

```tsx
<Link href={methodologieHref("projection-2050")} …>
```

par l'ancienne forme :

```tsx
<Link href="/methodologie" …>
```

Puis :

```bash
npx tsx scripts/test/methodologie.test.ts
```

`FAIL no panel links to the bare page (found: Projection2050.tsx)`. Le message vous donne le fichier.
Regardez maintenant la page : **elle fonctionne parfaitement**. Le lien mène quelque part, rien n'est
cassé, aucune erreur nulle part — le lecteur atterrit simplement au mauvais endroit d'une page de 758
lignes. C'est exactement le genre de régression qu'aucun typage et aucune revue visuelle n'attrape,
et qui reparaît dès qu'on ajoute un panneau en copiant un voisin.

**c) Éprouver le typage.** Dans le même fichier, écrivez une ancre presque juste :

```tsx
<Link href={methodologieHref("projection-205")} …>
```

```bash
npx tsc --noEmit
```

L'erreur est immédiate et cite les 26 valeurs acceptées. Comparez avec ce qui se serait passé en
écrivant `href="/methodologie#projection-205"` à la main : rien. Aucune erreur, aucun avertissement,
et un lien qui laisse le lecteur en haut de la page en se demandant où est l'explication.
