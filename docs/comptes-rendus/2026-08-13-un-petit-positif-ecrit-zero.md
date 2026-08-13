# Compte rendu — Un petit positif écrit zéro (Sprint 55)

**Date** : 2026-08-13 · **Branche** : `claude/bassins-versants-carte-6crhsl` · **Sprint** : 55

---

## 1. La question initiale

> « Screens pour la question 8 » — deux captures de la fiche site, en réponse à la question laissée
> ouverte au sprint 54.

**Ce que j'ai compris** : la note initiale disait « Pas d'impact sur activité avec "Rapprochement de
vos usages" ». J'en avais déduit que l'encadré ne s'affichait pas. **Les captures me démentent : il
s'affiche.** Ce que la note désignait, c'est autre chose — une fois l'encadré lu, l'analyse se révèle
creuse, et rien dans la page ne le répercute.

**Ce que j'ai délibérément laissé de côté** : décider si « refroidissement » *aurait dû* être
rapproché. Le rapprochement se fait sur les libellés de l'arrêté de la zone de Metz, que je n'ai pas
lus. Trancher sans eux serait deviner ; ce sprint rend la question **instruisable** plutôt qu'il n'y
répond.

---

## 2. Ce qui a été réalisé

**En une phrase** : la fiche annonçait « perd 0 jour-équivalent d'arrêt par an » à un site qui en
perdait un peu, et sur 20 % seulement de son volume — les deux sont corrigés.

**La mesure que je n'avais jamais prise.** Sur un vecteur d'usages industriel réel (refroidissement
70 %, arrosage des espaces verts 20 %, sanitaires 10 %), à Metz :

> **20 % du volume restreignable est rapproché de la nomenclature. 1 usage rapproché · 2 sans
> correspondance.**

Le refroidissement, qui porte 70 % du volume, ne correspond à **aucune mesure d'arrêté**. J'avais
prédit qu'un site industriel serait mal couvert et posé un drapeau rouge au-dessus de 60 % : la
prédiction tient, et l'encadré de réserve fait exactement son travail. **Un test unitaire reproduit
ce 20 % à l'identique** depuis le guide embarqué — la capture et le calcul local disent le même
chiffre.

**Dans les grandes lignes** :

- **Un arrondi fabriquait des zéros.** `Math.round()` dans trois formateurs indépendants écrivait
  « 0 » pour tout positif sous 0,5. Le détail affiché juste en dessous disait pourtant « 19 jours
  sous restriction… sur 50 m³/an » et « réduction de 10 % du volume autorisé ». Dix pour cent de
  50 m³ ne font pas zéro.
- **Ce dépôt répète partout qu'une absence ne s'écrit jamais zéro. Ceci en est l'autre bout**, et il
  est plus insidieux : une **présence** écrite zéro. Le lecteur y lit « rien à signaler », c'est-à-dire
  l'inverse de ce que le calcul a trouvé.
- **La synthèse ignorait sa propre couverture.** La réserve était à l'écran au chapitre 2 ; la phrase
  d'en-tête, celle qu'on lit en premier, présentait un chiffre calculé sur 20 % du volume comme s'il
  décrivait le site entier.
- **« 2 sans correspondance » ne disait pas lesquels.** C'est pourtant la seule chose sur laquelle un
  lecteur peut agir.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/format.ts` | neuf | `nombre()` : « 0 » pour un zéro mesuré, **« < 1 »** pour un positif qui s'effacerait. Pas de décimale — ces sorties portent des fourchettes de dizaines de pour cent |
| `lib/synthese.ts` | modifié | Utilise le formateur partagé ; reçoit `partVolumeCouverte` et **borne** sa phrase quand la couverture est partielle |
| `lib/executive.ts`, `components/IndicateursNote.tsx` | modifiés | Mêmes formateurs, plus de `Math.round` local |
| `lib/nomenclature.ts` | modifié | `CouvertureVecteur` porte `nonRapprochesLabels` et `ambigusLabels` |
| `components/ImpactPanel.tsx` | modifié | L'encadré **cite** les usages orphelins |
| `components/HomeClient.tsx` | modifié | Le **même** `couvertureVecteur` que le chapitre 2, remonté jusqu'à `buildSiteSummary` |
| `scripts/test/synthese.test.ts` | modifié | 10 cas : petit positif, zéro mesuré, couverture partielle/totale/inconnue |
| `scripts/test/nomenclature.test.ts` | modifié | 5 cas, dont le **20 % figé** |

---

## 3. Erreurs potentielles

### Bugs trouvés et corrigés pendant la session

- **Le zéro fabriqué**, décrit ci-dessus. ⚠️ Il ne date pas de ce sprint : les trois formateurs
  arrondissaient depuis toujours. Ce qui est neuf, c'est un site aux valeurs assez petites pour le
  révéler.
- **La synthèse en contradiction avec son propre chapitre 2.** Deux endroits qui décrivent le même
  site connaissaient deux vérités différentes.
- **Ma première lecture du retour utilisateur était fausse** : j'avais conclu à l'absence de
  l'encadré, alors qu'il s'affichait. J'avais listé trois causes possibles ; aucune n'était la
  bonne. C'est la capture qui a tranché, pas le raisonnement.

### Non vérifié en conditions réelles

- **Rien de ce sprint n'a été vu en ligne.** Les trois correctifs sont vérifiés par des tests et par
  la capture qui les a motivés — pas sur le déploiement. Le geste nº 8 devra être rejoué.
- **Le « < 1 » n'a jamais été lu à l'écran** : il est testé sur la chaîne produite, pas sur la page.
- **Le volume de 50 m³/an** est vraisemblablement une valeur d'essai (ordre de grandeur d'un foyer,
  pas d'un site industriel). Le correctif d'arrondi vaut quel que soit le volume, mais **la fiche
  n'a toujours pas été vue avec un volume industriel réaliste**, et c'est là que les ordres de
  grandeur du VNP et des euros pourraient surprendre.
- **Le refroidissement non rapproché n'est pas expliqué.** Je ne sais pas si l'arrêté de Metz ne
  nomme jamais cet usage, ou si le rapprochement échoue à tort. Le sac de mots a déjà produit un
  faux positif connu (« piscine collective » → « piscines **non** collective »), donc un faux
  négatif est plausible.

### Hypothèses qui pourraient ne pas tenir

- **« < 1 » est un choix, pas une mesure.** Afficher « 0,3 » serait plus précis et plus trompeur ;
  afficher « < 1 » perd de l'information. J'ai tranché pour la seconde, cohérente avec des sorties
  qui portent déjà des fourchettes larges.
- **Le seuil de réserve à 99,9 %** de couverture : en dessous, la phrase se borne. Un site couvert à
  99,5 % recevra donc une réserve pour un demi-pour-cent.
- **Le libellé retenu pour nommer un orphelin est celui que l'utilisateur a tapé.** S'il tape une
  phrase entière, la synthèse la citera telle quelle.

### Ce qui casserait si une source amont changeait

- **Si la nomenclature d'une zone devenait vide**, `couvertureUsages` rend `undefined` et la phrase
  ne se borne pas — l'absence de réserve se lirait alors comme une couverture totale. C'est le
  point faible du branchement, et il est visible : `nomenclature.length > 0` est la garde.

---

## 4. Points d'amélioration

**Dette assumée**

- **`couvertureVecteur` est calculé deux fois** : dans `ImpactPanel` pour l'encadré, dans
  `HomeClient` pour la synthèse. Même fonction, mêmes entrées, donc pas de risque de divergence —
  mais deux appels là où un `useMemo` remonté suffirait.
- **La réserve de couverture est une phrase de plus** dans un paragraphe qui en compte déjà cinq.

**À reprendre**

- **Instruire le refroidissement** : lire les libellés d'arrêté de la zone et voir si le
  rapprochement échoue à tort. C'est la question la plus intéressante ouverte par ce retour.
- **`estBorne()` est exporté et inutilisé.** Écrit pour les appelants qui accordent un pluriel
  autour du chiffre ; aucun n'en a eu besoin. À retirer s'il ne sert pas au prochain sprint.

---

## 5. État Git

- **Branche de session** : `claude/bassins-versants-carte-6crhsl` — commit `ebec844`, poussé.
- **`main` touché ?** : **NON**.
- **Déployé en prod ?** : non. Les correctifs sont sur la branche.
- **Vérifications passées** : build ✅, lint ✅, typecheck ✅ (0 erreur), **32 suites unitaires**,
  **e2e 161/161**. Aucun run Actions.

---

## 6. Prochaines étapes

1. **Rejouer le geste nº 8** avec un volume réaliste. *Verrou* : le déploiement. C'est là que les
   ordres de grandeur du VNP et des euros seront jugés pour la première fois.
2. **Rejouer les gestes nº 3, 4 et 9** du sprint 54, toujours en attente.
3. **Lire les libellés d'arrêté de la zone** pour trancher le cas du refroidissement. *Verrou* :
   un run Actions, ou la capture du bloc « Ce qui est réellement restreint en crise ».
4. **Gestes nº 6 et nº 10**, non réalisés.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

L'outil calcule combien de jours d'activité une entreprise perd à cause des restrictions d'eau. Pour
un site donné, il a calculé une perte faible mais réelle — quelque chose comme un tiers de journée
par an. En l'affichant, il a arrondi à l'entier le plus proche : **zéro**. Le lecteur voit « ce site
perd 0 jour par an » et comprend « aucun problème », alors que le calcul disait « un peu ». Tout ce
projet répète qu'une donnée manquante ne doit jamais s'afficher comme un zéro ; c'est le même défaut
par l'autre bout, et il est plus sournois, parce qu'ici il y avait bien un résultat.

Deuxième problème, sur la même page : l'outil avait reconnu **un seul** des trois usages déclarés par
l'entreprise. Le principal — le refroidissement, 70 % de son eau — ne correspond à aucune mesure
écrite dans l'arrêté préfectoral. La page le disait, dans un encadré, au milieu. Mais la phrase de
résumé en haut, celle qu'on lit en premier, donnait son chiffre sans préciser qu'il ne portait que
sur un cinquième du volume.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| Arrêté préfectoral | La décision qui impose les restrictions dans un département, usage par usage. |
| Nomenclature | La liste officielle des usages que les arrêtés savent nommer (une vingtaine). |
| Rapprochement | Faire correspondre l'usage écrit par l'utilisateur (« refroidissement ») à un usage de cette liste. |
| Vecteur d'usages | La répartition du volume d'un site entre ses usages, en pourcentages. |
| VNP | Volume non prélevable : les mètres cubes que les restrictions empêchent de prendre. |
| JEA | Jour-équivalent d'arrêt : deux jours à 50 % d'empêchement font un jour-équivalent. |
| Formateur | La fonction qui transforme un nombre en texte affichable. |
| Fourchette | Un intervalle `[min, max]`, quand une mesure d'arrêté n'est pas chiffrée. |

### 7.3 Comment le code s'y prend

**Étape 1 — reproduire le défaut avant de le corriger.** Un test qui décrit la capture :

```ts
// scripts/test/synthese.test.ts
const petit = buildSiteSummary({
  ...rich,
  impact: { joursSousArrete: 19, jea: 0.3, vnpM3: 0.4 },
});
check("petit positif : le JEA ne s'écrit pas « 0 »", !/\b0 jour/.test(text(petit, "impact")));
```

Lancé avant tout correctif, il échoue — ce qui prouve que le défaut est bien là où je crois.

**Étape 2 — un formateur qui refuse d'effacer.** Trois fichiers arrondissaient chacun de leur côté ;
il n'y en a plus qu'un :

```ts
// lib/format.ts
export function nombre(v: number): string {
  if (v === 0) return "0";              // un zéro MESURÉ reste zéro
  const arrondi = Math.round(v);
  if (arrondi === 0) return v > 0 ? "< 1" : "> -1";
  return nf.format(arrondi);
}
```

Les deux moitiés comptent autant. Remplacer *tous* les zéros par « < 1 » serait le même mensonge à
l'envers : un site réellement épargné a droit à son zéro.

**Étape 3 — faire remonter la couverture jusqu'à la phrase de résumé.** Le calcul existait déjà dans
le chapitre 2. Il est recalculé là où vit le résumé, et passé au constructeur de phrases :

```tsx
// components/HomeClient.tsx
const couvertureUsages = useMemo(() => {
  if (!usages.length || !restrictions?.available) return undefined;
  /* … la nomenclature de la zone, tirée des arrêtés lus … */
  return nomenclature.length > 0 ? couvertureVecteur(usages, nomenclature) : undefined;
}, [usages, restrictions]);
```

```ts
// lib/synthese.ts
if (couv !== undefined && couv < 0.999) {
  texte += ` ⚠️ Ces chiffres ne portent que sur ${Math.round(couv * 100)} % du volume du site : ` +
    `le reste est déclaré sous des usages qu'aucune mesure d'arrêté ne nomme. ` +
    `Ce n'est pas un volume épargné, c'est un volume dont on ne sait pas s'il l'est.`;
}
```

**Étape 4 — nommer les usages orphelins**, pour que le lecteur puisse agir : reformuler un libellé,
ou constater que son usage principal est absent des arrêtés.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **« < 1 » plutôt que « 0,3 ».** Un dixième de jour-équivalent semble plus informatif. Il est
  surtout plus faux : ce chiffre sort d'une chaîne de calculs bornée par des fourchettes de
  40–75 %, donc afficher un dixième prêterait au résultat une précision qu'il n'a pas. « < 1 » dit
  exactement ce qu'on sait.
- **Borner la phrase plutôt que la supprimer.** J'aurais pu ne rien afficher tant que la couverture
  est partielle. Mais 20 % de couverture, ce n'est pas rien : c'est une information réelle sur un
  cinquième du site. La règle du dépôt est « fait absent, phrase absente » — ici le fait est
  **partiel**, donc la phrase est **bornée**.
- **Nommer les usages sans juger le rapprochement.** J'aurais pu baisser le seuil d'acceptation pour
  que « refroidissement » trouve quelque chose. C'est exactement ce que ce module refuse de faire :
  accrocher une interdiction d'arrosage de pelouse à un circuit de refroidissement produirait un
  chiffre plausible que personne ne contesterait.
- **Un formateur partagé plutôt que trois corrections.** Les trois fichiers avaient le même bug
  parce qu'ils avaient chacun leur `Math.round`. Corriger sur place les aurait laissés libres de
  diverger à nouveau.

### 7.5 Pour expérimenter soi-même

**1. Voir le zéro fabriqué.** Dans `lib/format.ts`, revenez à l'ancien comportement :

```ts
export function nombre(v: number): string {
  return nf.format(Math.round(v));
}
```

puis `npx tsx scripts/test/synthese.test.ts` : trois tests tombent, dont
`petit positif : le JEA ne s'écrit pas « 0 »`. Ce qu'ils protègent : un site qui perd un peu,
affiché comme un site qui ne perd rien.

**2. Voir la synthèse contredire son propre chapitre.** Dans `lib/synthese.ts`, supprimez le bloc
`if (couv !== undefined && couv < 0.999)`. Puis `npx tsx scripts/test/synthese.test.ts` :
`couverture partielle : la phrase borne son chiffre` échoue. La page afficherait alors, en même
temps, « 20 % du volume est rapproché » au milieu et un chiffre sans réserve en haut.

**3. Retrouver la mesure de la capture.** Sans rien modifier :

```bash
npx tsx scripts/test/nomenclature.test.ts | grep "20 %"
```

Le test calcule, depuis le guide embarqué, la même couverture de 20 % que celle lue sur la capture
d'un vrai site à Metz. Changez `part: 70` en `part: 20` pour le refroidissement et
`arrosage des espaces verts` en `part: 70` : la couverture passe à 70 %, et le test échoue — parce
que ce n'est plus le même site.
