# Compte rendu — Sprint 39 : la typologie ρ devient un intervalle

**Date** : 2026-08-08 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 39

> Quatrième compte rendu du 2026-08-08, deuxième qui produit du code. Le Sprint 38
> ([`…sprint-38-probe-prealable.md`](./2026-08-08-sprint-38-probe-prealable.md)) avait mesuré les
> quatre inconnues et trouvé trois défauts en production ; celui-ci les corrige.

---

## 1. La question initiale

> « go »

**Ce que j'ai compris** : enchaîner sur le Sprint 39 de la file — la typologie ρ à intervalles (G2) —
en y intégrant les trois correctifs que le Sprint 38 avait ajoutés à son périmètre.

**Ce que j'ai délibérément laissé de côté** :

- **Le protocole d'annotation (G12).** Il est dans le sprint et n'a pas été commencé. Il ne bloque
  rien d'autre, et il vaut mieux le faire d'un bloc que par moitiés.
- **Passer le chiffre de jours en fourchette.** C'est la moitié manquante de G2, et elle est
  volontairement reportée au Sprint 42 : elle imposerait de réécrire `computeInterruption`, que G1
  supprime précisément là. Voir §3.
- **Toucher au score composite et au portefeuille.** Ils consomment la borne basse via la route ;
  leur migration appartient aux sprints 42 et 43.

---

## 2. Ce qui a été réalisé

**En une phrase** : une mesure d'arrêté est désormais lue comme une **fourchette** plutôt que comme un
nombre, et les trois erreurs qui faisaient sous-estimer le risque en production sont corrigées.

**Dans les grandes lignes** :

- **`Rho { type, min, max }`, les deux bornes toujours définies.** Une quantité connue est
  l'intervalle dégénéré. Ce n'est pas un détail de forme : c'est ce qui empêche un appelant de lire un
  point et d'ignorer la borne.
- **Les mesures non quantifiées élargissent la moyenne** au lieu d'en sortir. L'ancien comportement
  affichait « 1,0 » là où la vérité était « entre 0,5 et 1,0 ».
- **Les trois défauts corrigés**, chacun épinglé par son libellé verbatim.
- **`rotation` implémenté**, sur la forme que le Sprint 38 a mesurée — et les tours d'eau
  délibérément **non lus**, avec le motif écrit dans le code.
- **`recommendation` et `reporting_only` sortis de la moyenne** et comptés à part.
- **La suite passe de 29 à 46 assertions.**

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/restrictions.ts` | réécrit | `Rho` à intervalle, 7 types + `none`, `polarityAt`, composition multiplicative, compteurs séparés |
| `app/api/restrictions/route.ts` | modifié | Sert `exposureInterval` (la vérité) **et** `exposure` (sa borne basse, documentée comme transitoire) |
| `components/InterruptionPanel.tsx` | modifié | Affiche « 84 % » ou « 0–100 % » par usage, et les trois compteurs |
| `scripts/test/restrictions.test.ts` | étendu | 29 → **46** assertions, dont une section 6 dédiée aux trois défauts |
| `docs/SPRINTS.md`, `docs/HANDBOOK.md` | modifiés | Sprint 39 consigné ; les trois bugs passent de « en production » à « corrigés, non vus en réel » |

---

## 3. Erreurs potentielles

### Ce qui est livré à moitié, et que j'aurais pu présenter comme entier

**G2 « fourchette partout » ne l'est pas.** L'intervalle est réel dans le noyau, dans la route et dans
le détail par usage. **Le chiffre de jours affiché en grand reste un point.** Il vient de
`computeInterruption`, qui prend un scalaire ; le convertir imposait de réécrire un module que G1
supprime au Sprint 42. J'ai choisi de servir `exposure` = **borne basse** plutôt que la médiane :
elle sous-estime, ce qui est la direction sûre pour un chiffre en sursis — mais **elle sous-estime**,
et c'est exactement le reproche que la note fait à l'option « borne basse en titre » que
l'utilisateur avait écartée. C'est un état transitoire assumé, pas une réinterprétation de G2.

### Les hypothèses qui peuvent ne pas tenir

- **`RHO_MAX_UNQUANTIFIED = 1`** rend des fourchettes très larges. C'est défendable (toute autre
  valeur serait inventée) et ça peut être **inutilisable en pratique** : si la moitié des mesures d'un
  niveau sont non quantifiées, la sortie sera « 30–75 % » et personne n'en fera rien. La note dit que
  c'est le résultat honnête ; l'expérience dira si c'est un résultat **utile**. À réexaminer quand la
  fourchette remontera jusqu'au titre.
- **`RHO_MIN_CONDITIONAL_BAN = 0,85` reste un coefficient calibré à la main.** Nommé, exporté,
  exprimé en intervalle — mais toujours inventé.
- **`polarityAt` prend le mot-clé le plus proche.** Ça marche sur les libellés observés, y compris le
  cas piégeux qui ouvre par « Interdiction » et quantifie sur « autorisé ». Une phrase qui inverserait
  l'ordre (« autorisé … sauf interdiction de 8h à 20h ») serait lue à l'envers. **Aucun libellé de ce
  type n'a été observé, ce qui ne prouve pas qu'il n'en existe pas.**
- **La composition multiplicative suppose l'indépendance des dimensions.** « 3 jours par semaine » ×
  « 20h–9h » suppose que la consommation est **uniforme** dans le temps — l'hypothèse même que G11
  demande de nommer. Elle est nommée ici, pas résolue : `load_profile` arrive au Sprint 40.
- **Un type composé est reporté sous `rotation`.** Choix arbitraire quand plusieurs dimensions
  coexistent ; le champ `dimensions` porte le détail exact, mais un consommateur qui filtrerait sur
  `type` verrait une étiquette partielle.

### Non vérifié en conditions réelles

**Tout.** Egress bloqué : aucune de ces fourchettes n'a été calculée sur une réponse VigiEau réelle,
et **l'affichage « 0–100 % » n'a jamais été vu à l'écran**. Les trois défauts corrigés produisaient
des chiffres faux **en production** ; le correctif n'a pas davantage été constaté que ne l'était le
défaut. C'est la même dette que le HANDBOOK §5 porte depuis quatre sessions, sur un sujet où elle
mord plus qu'ailleurs.

### Ce qui casserait si la source amont changeait

Si VigiEau renommait `usage.u.description`, `restrictionsFor` rendrait des lignes sans description et
**toutes** les mesures deviendraient `unquantified` — soit une exposition « 0–100 % » partout. C'est
bruyant et visible, donc préférable à un zéro silencieux, mais aucun test ne l'exerce aujourd'hui.

---

## 4. Points d'amélioration

**Dette assumée** :

- **Le retypage en ligne de `severity` dans `InterruptionPanel`** est conservé (composant client,
  type serveur), avec un commentaire disant qu'il se tient à jour à la main. C'est la faiblesse qui a
  fait que **TypeScript n'a rien signalé** quand ρ a changé de forme.
- **`exposure` en borne basse** est un doublon transitoire dans la charge utile. Il disparaît au
  Sprint 42, et le code le dit — mais un doublon documenté reste un doublon.

**À reprendre** :

- **Un test de bout en bout sur la route** : aucune vérification n'exerce `/api/restrictions` avec les
  données embarquées réelles. Le shard d'un département existe dans le dépôt, donc c'est faisable
  **sans egress** et ça vaudrait mieux qu'un test de fonction pure.
- **Compter les non-quantifiées sur le corpus réel** avant que la fourchette ne remonte au titre : si
  la proportion est forte, la décision G2 mérite d'être rediscutée avec le chiffre en main.

---

## 5. État Git

- **Branche** : `claude/integrate-file-apply-plan-k5t009` — commit « Sprint 39: rho becomes an
  interval… »
- **`main` touché ?** : **NON**.
- **Déployé en prod ?** : **non**.
- **Vérifications** : `npm run build` ✅, `npm run lint` ✅, **22 suites** (`restrictions.test.ts`
  **46 assertions**), **62/62 e2e**. `npx tsc --noEmit` a servi à trouver les consommateurs à migrer.

⚠️ **Piège d'environnement repayé** : `pkill -f next-server` **tue le shell qui l'exécute** — sa propre
ligne de commande contient le motif. Trois commandes sont mortes sans aucune sortie avant que je
reconnaisse le symptôme, pourtant documenté au HANDBOOK §3. Recette qui marche :
`pgrep -f "next-serve[r]" | xargs -r kill -9`. ⚠️ Le répertoire scratchpad s'est aussi **vidé entre
deux commandes**, faisant échouer une redirection et donc le démarrage du serveur : logs déplacés dans
`.next/`, qui est gitignoré et persiste.

---

## 6. Prochaines étapes

1. **Sprint 40 — le site comme vecteur d'usages.** *Verrou : une décision d'ergonomie* (comment faire
   saisir un vecteur pondéré à qui remplit aujourd'hui trois menus déroulants).
2. **Protocole d'annotation G12.** *Verrou : aucun*, mais c'est un bloc à faire d'un coup.
3. **Compter les mesures non quantifiées sur le corpus** (§4). *Verrou : aucun, le fichier est
   téléchargeable par le runner.*
4. **Regarder la production.** ⚠️ Réclamé depuis quatre sessions, et désormais deux fois plus motivé :
   des chiffres étaient faux, et leur correctif n'a pas été vu non plus.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Un arrêté préfectoral écrit des phrases, pas des nombres. « Interdiction de 8h à 20h », « réduction de
50 % », « limiter au strict nécessaire ». Pour calculer quoi que ce soit, il faut transformer ces
phrases en une part d'usage bloquée, entre 0 et 1.

Deux pièges. Le premier : certaines phrases **ne contiennent aucune quantité**. « Limiter au strict
nécessaire » ne se convertit pas en nombre — et si on lui en invente un, tout le calcul aval hérite
d'une invention déguisée en mesure. Le second : certaines phrases contiennent **plusieurs** quantités
qui se combinent, et n'en lire qu'une donne un résultat faux d'un facteur sept.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **ρ (rho)** | Part d'un usage bloquée par une mesure. Interdiction totale = 1, « réduction de 50 % » = 0,5. |
| **Intervalle** | Un couple [min, max] au lieu d'un nombre. « Entre 0 et 100 % » dit ce qu'on sait *et* ce qu'on ignore. |
| **Intervalle dégénéré** | Un intervalle dont les deux bornes sont égales : c'est ainsi qu'on représente une quantité connue sans changer de type. |
| **Polarité** | Savoir si une plage horaire citée est la plage **interdite** ou la plage **autorisée**. Les arrêtés écrivent les deux. |
| **Composition** | Combiner plusieurs restrictions : 3 jours sur 7 **et** 13 h sur 24 laissent 3/7 × 13/24 ≈ 16 % du volume. |
| **Non-régression** | Un test qui fige un comportement corrigé, pour que le bug ne revienne pas. |

### 7.3 Comment le code s'y prend

**Un intervalle, jamais un point optionnel.** Le type est :

```ts
export interface Rho {
  type: RhoType;
  min: number;   // toujours défini
  max: number;   // toujours défini
}
```

L'ancienne version était `coefficient?: number` — un nombre qui pouvait manquer. La différence est
subtile et décisive : avec un champ optionnel, un appelant écrit `severity.coefficient ?? 0` et une
mesure illisible devient un zéro. Avec deux bornes obligatoires, il n'y a rien à remplacer par zéro ;
le pire qu'on puisse faire est de lire `min`, ce qui sous-estime au lieu d'effacer.

**La polarité, en cherchant le mot le plus proche.** Le cœur du correctif tient ici :

```ts
function polarityAt(text: string, index: number): "allowed" | "forbidden" {
  const before = text.slice(0, index);
  const lastAllowed = Math.max(before.lastIndexOf("autoris"), before.lastIndexOf("permis"));
  const lastForbidden = Math.max(before.lastIndexOf("interdi"), before.lastIndexOf("ferme"));
  if (lastAllowed < 0 && lastForbidden < 0) return "forbidden";
  return lastAllowed > lastForbidden ? "allowed" : "forbidden";
}
```

Sur la vraie mesure « **Interdiction** sauf arrosage localisé […] (arrosage **autorisé** 3 jours par
semaine […] entre 20h et 9h) », la phrase **ouvre** par « Interdiction » mais le mot le plus proche
de « 20h et 9h » est « autorisé ». Les 13 heures sont donc la plage **permise**. L'ancien code les
comptait comme interdites et écrivait dans sa trace auditable « Interdiction 13 h sur 24 » — une
phrase qui affirme le contraire de l'arrêté qu'elle prétend citer.

**La composition, en multipliant ce que chaque dimension laisse passer :**

```ts
const allowed = dimensions.reduce((acc, d) => acc * d.allowed, 1);
const blocked = Math.min(1, Math.max(0, 1 - allowed));
```

Chaque dimension restreint ce que la précédente avait laissé. Trois jours sur sept laissent 3/7 ;
dans chacun de ces jours, treize heures sur vingt-quatre laissent 13/24 ; le produit vaut 0,16, donc
ρ ≈ 0,84.

**Et l'ordre, qui est le vrai correctif du troisième défaut.** Les dimensions quantifiées sont
cherchées **avant** les règles de formulation. La règle « le texte commence par *autorisé* donc il n'y
a pas de restriction » n'est plus atteinte que si aucune quantité n'a été trouvée. La règle n'a pas
été supprimée — « Autorisé » tout seul veut vraiment dire « aucune restriction », et un test le
protège.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Pourquoi 1 comme borne haute d'une mesure non quantifiée ?** Parce que toute autre valeur serait
  inventée. « Limiter au strict nécessaire » ne vaut sûrement pas 100 % — mais choisir 60 % ou 40 %
  serait un coefficient sorti de nulle part, et ce dépôt en a déjà retiré un pour cette raison au
  Sprint 21. Une fourchette large est gênante ; un chiffre faux est pire.
- **Pourquoi ne pas supprimer la règle qui avalait la mesure ?** Parce qu'elle a raison dans son cas :
  « Autorisé » seul veut dire « aucune restriction ». Le bug n'était pas la règle, c'était sa
  **priorité**. Supprimer la règle aurait cassé un test légitime — l'expérience (b) ci-dessous le
  montre.
- **Pourquoi garder les deux formes dans la réponse de l'API ?** Parce que le calculateur de jours
  n'accepte encore qu'un nombre, et qu'il sera supprimé dans deux sprints. Livrer les deux, en
  documentant lequel est la vérité, est plus honnête que de convertir un module condamné.
- **Pourquoi ne pas lire les « tours d'eau » ?** Le probe a mesuré que leurs 496 occurrences sont
  **toutes** agricoles, et l'agriculture est hors périmètre. Les lire aurait ajouté du code pour un
  cas qui n'arrive jamais — et le commentaire explique pourquoi, sinon quelqu'un « corrigera » cette
  absence dans six mois.

### 7.5 Pour expérimenter soi-même

**a) Voir la fourchette apparaître.**

```bash
npx tsx scripts/test/restrictions.test.ts
```

Cherchez « unquantified row widens the interval ». Deux usages, l'un certainement bloqué à 100 %,
l'autre illisible : le résultat est **0,5 à 1,0**. L'ancien code affichait 1,0, c'est-à-dire « on
sait », alors que la vérité est « quelque part entre les deux ».

**b) Casser un test exprès, et comprendre pourquoi la règle existe.** Dans `lib/restrictions.ts`,
retirez `|^autorise\b` de la constante `NO_LIMIT`, puis relancez la suite. **Un test tombe** :
« verbatim: bare 'Autorisé' → 0 ». Vous venez de vérifier que le bug corrigé n'était pas la règle
elle-même mais son rang : elle protège un vrai cas, et le correctif consistait à la faire passer
**après** la recherche de quantités.

**c) Reproduire le facteur 7,7.** Ajoutez temporairement, dans `restrictionSeverity`, un `return` qui
ne garde que la première dimension :

```ts
const allowed = dimensions[0].allowed;   // au lieu du produit
```

Relancez : le test « defect 2: days × hours compose » échoue, et le message vous donne l'écart. C'est
littéralement le bug qui tournait en production, et la mesure qu'il sous-estimait passait de 96 % à
12,5 %.
