# Template — compte rendu de fin de sprint / de session de code

> **À quoi sert ce fichier.** Chaque fin de sprint ou d'écriture de code produit un compte rendu
> qui suit **exactement** la structure ci-dessous, dans `docs/comptes-rendus/AAAA-MM-JJ-slug.md`.
> L'objectif est double : rendre compte de façon harmonisée d'une session à l'autre, et **faire
> monter en compétence** le lecteur sur le code produit.
>
> **Règles d'usage**
> 1. **Les sept sections sont obligatoires et dans cet ordre.** Une section sans contenu se remplit
>    par « Rien à signaler », jamais par une omission — l'absence doit être un constat, pas un oubli.
> 2. **Un compte rendu ne se réécrit pas.** Chaque session crée un nouveau fichier daté. L'historique
>    des comptes rendus est une trace, pas un document vivant (contrairement au HANDBOOK).
> 3. **Pas de complaisance.** La section « Erreurs potentielles » est celle qui a le plus de valeur :
>    si elle est vide alors que du code non testé en réel a été livré, le compte rendu est faux.
> 4. **Les chiffres sont mesurés, jamais estimés.** « +330 ms mesurés au banc » et non « coût faible ».
> 5. Ce compte rendu **ne remplace pas** `HANDBOOK.md` (les concepts durables et les pièges) ni
>    `SPRINTS.md` (la roadmap). Il raconte **une session**. Les trois se complètent :
>    le HANDBOOK dit *comment le projet marche*, SPRINTS *où on en est*, le compte rendu *ce qui
>    s'est passé cette fois et pourquoi*.

---

## Structure à recopier

```markdown
# Compte rendu — <titre court> (Sprint NN)

**Date** : AAAA-MM-JJ · **Branche** : `<nom>` · **Sprint** : NN

---

## 1. La question initiale

> Citation **verbatim** de la demande.

**Ce que j'ai compris** : reformulation en une ou deux phrases, en explicitant les choix
d'interprétation là où la demande était ambiguë.

**Ce que j'ai délibérément laissé de côté**, et pourquoi. (Si la demande a été réduite ou élargie
en cours de route, le dire ici — c'est une décision, elle doit être visible.)

---

## 2. Ce qui a été réalisé

**En une phrase** : le changement principal, formulé par sa valeur et non par sa technique.

**Dans les grandes lignes** : 3 à 6 puces, chacune reliant un changement à la raison qui l'a motivé.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `chemin/fichier.ts` | neuf / modifié | … |

---

## 3. Erreurs potentielles

> **La section la plus importante.** Ce qui peut être faux, ce qui n'a pas été vérifié, ce qui a
> déjà été trouvé faux et corrigé en cours de route.

- **Bugs trouvés et corrigés pendant la session** — les nommer : ils disent où le code est fragile.
- **Non vérifié en conditions réelles** — quoi exactement, et pourquoi ça n'a pas pu l'être.
- **Hypothèses qui pourraient ne pas tenir** — les paramètres calibrés à la main, les replis, les
  approximations assumées.
- **Ce qui casserait si une source amont changeait.**

---

## 4. Points d'amélioration

Ce qui est livré mais perfectible, ce qui est rugueux, ce qui mériterait d'être repris. Distinguer
« dette assumée » (choix conscient, motivé) et « à reprendre » (raccourci qu'il faudra payer).

---

## 5. État Git

- **Branche de session** : `<nom>` — dernier commit `<hash>`
- **`main` touché ?** : **OUI** (merge `<hash>`, à la demande explicite de l'utilisateur) / **NON**
  (la branche attend une revue)
- **Déployé en prod ?** : oui / non / vérifié par quel moyen
- **Vérifications passées** : build, lint, N suites de tests, N/N e2e — avec les chiffres réels.

---

## 6. Prochaines étapes

Par valeur décroissante, avec pour chacune **ce qui la bloque ou la conditionne**. Une étape sans
son verrou n'est pas une étape, c'est un souhait.

---

## 7. Explication à un novice

> Pour un lecteur qui sait programmer mais ne connaît **ni ce projet, ni le domaine**. Objectif :
> qu'il puisse relire le code et le modifier lui-même. Ni condescendance, ni jargon non expliqué.

### 7.1 Le problème, en langage courant
Sans vocabulaire technique ni vocabulaire métier. Si ça ne tient pas en un paragraphe compréhensible
par quelqu'un d'extérieur, c'est que le problème n'est pas encore clair.

### 7.2 Le vocabulaire à connaître
Table des termes employés (métier **et** technique), définis en une ligne chacun.

| Terme | Définition |
| --- | --- |

### 7.3 Comment le code s'y prend
Le cheminement, étape par étape, avec de **vrais extraits** du code écrit (courts, commentés,
avec leur chemin de fichier). Montrer la donnée qui circule : d'où elle vient, ce qu'on en fait,
où elle finit à l'écran.

### 7.4 Pourquoi ces choix plutôt que d'autres
Les alternatives envisagées et écartées, avec le motif. C'est la section qui apprend le plus :
un choix technique ne se comprend que par ce qu'il refuse.

### 7.5 Pour expérimenter soi-même
2 ou 3 modifications concrètes que le lecteur peut faire pour voir le comportement changer, avec la
commande à lancer et ce qu'il devrait observer. Idéalement, au moins une qui **casse un test** —
comprendre ce qu'un test protège est le moyen le plus rapide de comprendre le code.
```

---

## Rappel des conventions du projet à respecter dans le compte rendu

- **UI et documentation en français, code et commentaires en anglais.** Le compte rendu est de la
  documentation : il s'écrit en français, même quand il cite du code anglais.
- **Une donnée absente n'est jamais un zéro.** Cette règle vaut aussi pour le compte rendu : ne pas
  écrire « 0 bug » quand la vérité est « non vérifié ».
- **Les pistes closes sont closes par écrit**, avec leur motif — jamais oubliées en silence.
