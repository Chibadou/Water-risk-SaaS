# Compte rendu — auditabilité structurelle, juridiction, niveaux de preuve (Sprint 44)

**Date** : 2026-08-11 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 44

---

## 1. La question initiale

> « lance tous les sprints (incluant les comptes rendus). on tranchera à la fin si il reste des points
> en suspend »

**Ce que j'ai compris pour ce sprint** : rendre les chiffres auditables *structurellement*, c'est-à-dire
par construction et non par documentation ajoutée — l'anti-pattern n°7 est littéralement « l'ajouter
après coup ». Neuf items : version de modèle, journal d'hypothèses, traçabilité mesure → arrêté, note
méthodologique générée, trois niveaux de confiance par sortie (ADR-004), étiquetage N1/N2/N3, couche
juridiction (G3), sites hors France (G15), score composite documenté comme divergence (G4), horizons CSRD.

**Ce qui était déjà fait avant ce sprint** : la version de modèle (avancée au 43, parce que le 43 en
dépendait) et le journal d'hypothèses par calcul (Sprints 41/42, agrégé au 42b).

**Ce que j'ai laissé de côté** : rien de l'énoncé. Mais le critère d'acceptation — « tout nombre affiché
est traçable jusqu'au PDF source en un clic » — n'est tenu qu'en partie, et pour deux raisons distinctes
détaillées en §3.

---

## 2. Ce qui a été réalisé

**En une phrase** : la note méthodologique n'est plus écrite, elle est **générée depuis les structures que
les moteurs exposent** — donc elle ne peut pas se désynchroniser du calcul.

**Dans les grandes lignes** :

- **`lib/noteMethodologique.ts`** assemble la note depuis `lib/modele`, `lib/confiance`,
  `lib/juridiction` et `lib/restrictions`. Une note rédigée à la main est juste le jour où on l'écrit et
  fausse dès le commit suivant. **Une seule note**, la même pour la fiche site et le portefeuille : une
  variante « courte » serait une seconde note à tenir à jour, et celle que personne ne lit est celle qui
  dérive.
- **`lib/confiance.ts` — la confiance par SORTIE** (ADR-004) : classement **haute**, JS **haute**,
  VNP et IA **moyennes**, score **moyenne**, euros **basse**. Un badge à côté de chaque titre, avec le
  motif et l'usage légitime en infobulle. ⚠️ Distinct de `scoreConfidence`, qui mesure la **couverture**
  des composantes : un chiffre en euros parfaitement couvert reste de confiance basse.
- **`lib/juridiction.ts` (G3) — le tri jamais fait est fait, et il était mesurable.** Les 18 fichiers
  référençant `NiveauGravite` ne coûtaient rien (un import de type) ; la vraie population était les
  **huit tableaux littéraux** des quatre niveaux. Ils lisent désormais `NIVEAUX`, et un test relit les
  huit fichiers et échoue si un littéral réapparaît. L'avertissement de l'ADR-002 est **recopié verbatim**
  en tête du module.
- **G15 — `horsPerimetre` est un champ distinct de `notCovered`**, parce que « la France vous couvre et
  rien ne s'applique » et « nous ne couvrons pas votre pays » sont deux faits que VigiEau rend tous deux
  par une liste vide : un site à Barcelone lisait **« aucune restriction en vigueur »**.
- **Traçabilité mesure → arrêté** : le CSV portait `arrete.id` et `arrete.numero` **depuis le début** et
  le build les jetait. Ils sont désormais conservés sous forme de table par département, rendus par
  l'API, affichés sous chaque mesure.
- **Étiquetage N1/N2/N3** avec une légende qui dit explicitement que **preuve et confiance ne se
  déduisent pas l'une de l'autre**.
- **Horizons CSRD** : table de correspondance publiée, avec la définition ESRS et le niveau de preuve.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/juridiction.ts` | **neuf** | Les niveaux ordonnés, les rangs, la cadence, les réformes, la couverture géographique. |
| `lib/confiance.ts` | **neuf** | Confiance par sortie (ADR-004), niveaux de preuve, horizons CSRD. |
| `lib/noteMethodologique.ts` | **neuf** | La note générée, dix sections, jointe aux deux exports. |
| Huit fichiers | modifiés | Leur tableau littéral des quatre niveaux remplacé par `NIVEAUX`. |
| `scripts/restrictions/build_restrictions.py` | modifié | Conserve `arrete.id` / `arrete.numero` en table par département. |
| `lib/restrictions.ts`, `lib/restrictionsData.ts`, `app/api/restrictions/route.ts` | modifiés | La trace d'arrêté traverse jusqu'à l'interface. |
| `app/api/zones/route.ts`, `lib/types.ts`, `components/ResultPanel.tsx` | modifiés | G15 : `horsPerimetre` avant l'appel amont. |
| `components/IndicateursNote.tsx` | modifié | Badges de confiance, légende des preuves, version du modèle. |
| `scripts/test/auditabilite.test.ts` | **neuf** | 57 assertions, majoritairement des contraintes de forme. |

---

## 3. Erreurs potentielles

### Le trou de G15, et pourquoi il est assumé plutôt que corrigé

Une boîte englobante autour de la France métropolitaine contient **nécessairement** la Catalogne, le
Piémont, le plateau suisse, la Wallonie et le Kent. Barcelone (41,39 ; 2,17) est **à l'intérieur** de la
boîte et passe le garde-fou.

Donc :

- un point lointain (Madrid, Berlin, Casablanca) est bien rejeté ;
- un point étranger **proche de la frontière** passe, et VigiEau lui répond une liste de zones vide.

La preuve positive dont je dispose est le **code INSEE** : le géocodeur BAN ne rend que des adresses
françaises, donc un site ajouté par la recherche est français par construction. Le chemin qui laisse
passer un point étranger est le **lien profond lat/lon**, qui n'en porte pas.

**Un test affirme que Barcelone passe.** C'est délibéré : la limite devient une propriété connue du code
plutôt qu'une surprise, et le jour où quelqu'un livre un vrai polygone, ce test échoue et se met à jour.
Fermer le trou demande soit ce polygone (≈ 100 kB de littoral), soit une réponse amont qui distingue
« hors France » de « aucun arrêté ». Ni l'un ni l'autre n'est accessible du bac à sable.

### La traçabilité est câblée mais ne porte pas encore de donnée

La chaîne mesure → numéro d'arrêté est complète dans le code : le build lit les colonnes, la table est
sérialisée, l'API la rend, le panneau l'affiche. **Mais les shards embarqués dans le dépôt datent d'avant
la reconstruction**, et le build exige l'egress — il ne tourne que dans le workflow Actions.

Une ligne `INFO` de la suite de tests dit lequel des deux états est en cours :

```
INFO le shard 28 ne porte PAS encore la table d'arrêtés : le câblage est fait,
     la donnée attend le workflow Actions (egress bloqué en bac à sable)
```

C'est volontairement une ligne d'information et non une assertion : ni le câblage-sans-donnée ni le
câblage-avec-donnée n'est un échec, et faire échouer la suite sur l'un des deux aurait forcé à mentir
dans un sens ou dans l'autre.

**Et la taille du fichier n'est pas mesurée.** Les shards font 7,6 Mo au total aujourd'hui ; l'ajout des
ids par mesure les grossit d'un montant que je n'ai pas pu constater. Si un shard dépasse un poids de page
raisonnable, le correctif est de garder la table et de retirer la liste par mesure — pas de retirer la
table.

### Le « un clic vers le PDF » n'existe pas, et ne peut pas exister tel quel

Le critère de §8 dit « traçable jusqu'au PDF source **en un clic** ». Le jeu de données donne un **numéro
d'arrêté**, pas une URL de document. Il faudra soit une résolution numéro → URL (qui n'existe pas de
façon publique et stable), soit accepter que la trace soit une **référence citable** plutôt qu'un lien.
Je n'ai pas tranché : c'est un des points en suspens.

### Hypothèses qui pourraient ne pas tenir

- **Les trois niveaux de confiance sont une assignation, pas une mesure.** « Le classement est de
  confiance haute parce qu'il survit aux erreurs qui déplacent tous les sites du même côté » est un
  raisonnement juste et non quantifié. Personne n'a mesuré la stabilité du classement sous perturbation.
- **La cadence `event_driven`** est déclarée avec une seule valeur. Elle est correcte pour la France, et
  l'affirmation qu'une juridiction `monthly` rendrait l'IA non calculable est un raisonnement, pas une
  observation.
- **Les réformes listées sont celles que je connais.** Trois entrées ; il en manque probablement.
- **La table CSRD** fait correspondre nos horizons aux définitions ESRS telles que je les comprends. Ce
  n'est pas une lecture juridique validée.

### Ce qui casserait si une source amont changeait

- Si le CSV VigiEau renommait `arrete.id`, la table redeviendrait vide **sans erreur** — le build lit
  avec `.get()` et un `None` est simplement ignoré. Le seul symptôme serait un `arretes_distincts: 0`
  dans `meta.json`, que rien ne surveille.
- `ZONE_TYPES` étant maintenant partagé, un quatrième type de zone amont serait ignoré partout de façon
  cohérente — ce qui est mieux qu'avant (huit ignorances indépendantes) mais toujours silencieux.

---

## 4. Points d'amélioration

**Dette assumée** :

- **`RestrictionsPayload` retypé à la main** dans `ImpactPanel` : le champ `arretes` a dû être ajouté à
  la main dans les deux endroits. Le commentaire du fichier le dit depuis le Sprint 39.
- **La note méthodologique est longue** (dix sections). C'est voulu — elle s'adresse à un auditeur — mais
  elle est jointe intégralement aux deux exports, y compris à un rapport de site d'une page.

**À reprendre** :

- **Aucune surveillance de `arretes_distincts`** dans les vérifications du build. Le script a des
  `sys.exit(1)` sur d'autres compteurs ; celui-là devrait en avoir un.
- **La légende des preuves est en `<details>` refermé**, donc la colonne « Preuve » est visible avant sa
  légende. Un lecteur voit « N1 » sans savoir ce que c'est.
- **`lib/js.ts` réexporte `LEVELS = NIVEAUX`** pour ne pas casser ses appelants. C'est une indirection de
  plus qui n'a pas de raison de durer.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — commit
  « Sprint 44: structural auditability, the jurisdiction layer, evidence levels ».
- **`main` touché ?** : **NON**.
- **Pull request ?** : **NON**.
- **Déployé en prod ?** : **NON**, et non regardé.
- **Vérifications** : build clean · lint clean · **28 suites** vertes · **102/102** e2e dont 5 neuves.

---

## 6. Prochaines étapes

1. **Lancer le workflow Actions** pour que la table d'arrêtés existe réellement, et **mesurer le poids
   des shards**. *Verrou* : aucun, sauf le déclenchement.
2. **Trancher le « un clic vers le PDF »** : résolution numéro → URL, ou référence citable assumée.
   *Verrou* : décision produit, pas technique.
3. **Ajouter un `sys.exit(1)` sur `arretes_distincts == 0`** dans les vérifications du build.
   *Verrou* : aucun.
4. **Fermer le trou de G15** avec un polygone France. *Verrou* : ≈ 100 kB à embarquer et une source à
   choisir ; à mettre en regard du fait que le chemin par recherche d'adresse est déjà protégé.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Un rapport sur le risque eau se lit des mois après avoir été produit, souvent à côté d'un rapport plus
ancien. Deux questions se posent alors, et l'outil ne pouvait répondre à aucune.

**Première question : « d'où sort ce chiffre ? »** L'outil disait « 40 % de l'activité empêchée en
crise ». Ce pourcentage vient de la lecture de mesures écrites dans des arrêtés préfectoraux réels — mais
lesquels ? Le jeu de données contenait le numéro de chaque arrêté et le programme de construction le
jetait. La piste s'arrêtait à « les arrêtés le disent », ce qui n'est pas une piste.

**Deuxième question : « ce chiffre a-t-il changé, ou est-ce ma situation ? »** Si un score passe de 62 à
54, il y a deux explications radicalement différentes : la situation s'est améliorée, ou nous avons changé
la façon de la calculer. Sans version de modèle et sans journal, le lecteur n'a aucun moyen de choisir —
et l'interprétation naturelle est la première, la rassurante.

Il y a aussi une question qu'on ne pose pas mais qui compte : **tous les chiffres ne se valent pas.** Un
décompte de jours d'arrêté et une exposition financière en euros s'affichent avec la même autorité, alors
que le premier est compté dans des documents publics et le second repose sur une conversion fragile.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Auditabilité** | La capacité d'un tiers à refaire le chemin qui mène à un chiffre. |
| **Anti-pattern n°7** | Le nom que la note donne à l'erreur corrigée ici : ajouter l'auditabilité après coup. |
| **ADR** | *Architecture Decision Record* : une décision structurante écrite, avec son motif. |
| **ADR-004** | La décision qui assigne un niveau de confiance **par sortie**. |
| **Niveau de preuve N1/N2/N3** | Constaté / calibré / scénarisé. Dit **comment** un chiffre a été obtenu. |
| **Confiance haute/moyenne/basse** | Dit **ce qu'un chiffre peut porter** comme décision. |
| **Version de modèle** | Un identifiant qui change **uniquement** quand la méthode de calcul change. |
| **Juridiction** | Le cadre réglementaire retenu : ici la France, avec ses quatre niveaux. |
| **Shard** | Un fichier de données découpé par département, embarqué dans le dépôt. |
| **CSRD / ESRS** | La directive européenne de reporting de durabilité et ses normes. |
| **Test de forme** | Un test qui vérifie la structure du code plutôt que la valeur qu'il produit. |

### 7.3 Comment le code s'y prend

**Étape 1 — la note méthodologique se génère.** C'est la décision centrale du sprint :

```ts
// lib/noteMethodologique.ts
// ⚠️ Generated rather than written, and that is the whole point. Anti-pattern n°7
// is literally "adding auditability afterwards", and a hand-written methodology
// note is the purest form of it: it is accurate on the day it is written and
// silently wrong from the next commit.
```

Concrètement, la section sur les niveaux de gravité ne récite pas quatre noms — elle les lit :

```ts
const j = juridiction();
L.push(
  `Périmètre : **${j.label}** uniquement. Les niveaux retenus sont ` +
    `${j.niveaux.map((n) => `\`${n}\``).join(", ")}, du moins au plus sévère. Le premier niveau ` +
    `porteur d'une **obligation** est \`${j.premierNiveauContraignant}\``,
);
```

Si un cinquième niveau apparaissait, la note le dirait sans qu'on la touche. Et le test le vérifie de la
seule façon possible — en comparant la note aux structures :

```ts
// scripts/test/auditabilite.test.ts
check("note: reproduces the confidence table for every output",
  CONFIANCES.every((c) => note.includes(c.label)));
check("note: reproduces the jurisdiction's reforms",
  juridiction().reformes.every((r) => note.includes(new Date(r.date).toLocaleDateString("fr-FR"))));
```

**Étape 2 — deux notions qui se ressemblent, séparées exprès.** Le piège qu'il fallait éviter :

```ts
// lib/confiance.ts
//   - `NiveauPreuve` (N1/N2/N3) says HOW A FIGURE WAS OBTAINED…
//   - `Confiance` (haute/moyenne/basse) says HOW MUCH THE FIGURE CAN CARRY…
//
// They are not redundant. The portfolio RANKING is high confidence even though it
// rests on N2 inputs, because a ranking survives errors that move every site the
// same way. A euro figure is low confidence even when built from N1 days, because
// the conversion to money is the weak link.
```

C'est le raisonnement le plus important du fichier, et il est contre-intuitif : **l'outil est le plus
fiable là où il est le moins précis.** Un classement ne donne aucun chiffre à citer, et c'est la sortie
sur laquelle on peut le plus s'appuyer, parce qu'une erreur systématique de 20 % sur ρ change tous les
volumes et ne change pas l'ordre.

L'ordre du tableau porte le message, et un test l'impose :

```ts
check("ADR-004: the ranking is the most trustworthy output",
  CONFIANCES[0].sortie === "classement" && CONFIANCES[0].niveau === "haute");
check("ADR-004: euros are the least", CONFIANCES.at(-1)?.niveau === "basse");
```

**Étape 3 — le tri que le sprint précédent avait déclaré « jamais fait ».** `SPRINTS.md` disait qu'avant
de chiffrer G3, il fallait distinguer deux populations. Voici la mesure :

```ts
// lib/juridiction.ts
// ⚠️ The measurement that justified the work. `NiveauGravite` is referenced by 18
// files and `GRAVITE` by 17, but a type import costs nothing to move. The real
// population was the LITERAL ARRAYS of the four levels — measured at Sprint 44:
// eight of them…
```

Huit endroits où ajouter un cinquième niveau, ou en renommer un, aurait **silencieusement sauté un
module**. Le test relit les huit fichiers :

```ts
for (const f of files) {
  const src = readFileSync(f, "utf-8");
  check(`${f} no longer keeps its own copy of the level list`, !/\[\s*"vigilance"\s*,/.test(src));
}
const jur = readFileSync("lib/juridiction.ts", "utf-8");
check("the single remaining literal is in the jurisdiction layer", /\[\s*"vigilance"\s*,/.test(jur));
```

La seconde assertion est celle qui rend la première utile : elle exige qu'il reste **exactement un**
littéral, au bon endroit. Sans elle, supprimer les huit et n'en remettre aucun passerait.

**Étape 4 — deux absences qui ne sont pas la même.** G15 en une structure :

```ts
// lib/types.ts
  /** VigiEau covers this point and no arrêté applies — an answer about the site */
  notCovered: boolean;
  /**
   * G15 — the point is outside the jurisdiction HydroVigie covers (France).
   *
   * ⚠️ Deliberately a SEPARATE field from `notCovered`. "France covers you and
   * nothing applies" and "we do not cover your country" are different facts, and
   * VigiEau answers both with an empty zone list — so a site in Barcelona used to
   * read "aucune restriction en vigueur".
   */
  horsPerimetre?: boolean;
```

Et le garde-fou passe **avant** l'appel amont, ce qu'un test vérifie par la position dans le fichier :

```ts
check("G15: the zones endpoint checks coverage before calling upstream",
  route.indexOf("couverture(") < route.indexOf("fetchZonesForPoint("));
```

**Étape 5 — la trace d'arrêté, récupérée d'une donnée déjà là.** Le CSV portait les colonnes depuis le
début. Le build les conserve en table par département, plus une liste d'ids par mesure :

```python
# scripts/restrictions/build_restrictions.py
entry = tree[dep][ztype][level].setdefault(key, {
    …
    "arretes": set(),
})
if aid:
    entry["arretes"].add(aid)
```

Le `sorted()` à la sérialisation n'est pas cosmétique : sans lui, une reconstruction sur des données
inchangées produirait un fichier différent à chaque fois, et **un diff qui bouge partout cache celui qui
compte**.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Générer la note plutôt que l'écrire.** L'alternative était une page de documentation, ou un fichier
Markdown au dépôt. Les deux ont le même défaut : rien ne force leur mise à jour, et une note fausse est
pire qu'aucune note parce qu'elle est citée. En la générant, un changement de méthode change la note dans
le **même commit** ou pas du tout. Le coût est qu'elle est plus rigide — on ne peut pas y ajouter une
nuance sans ajouter un champ quelque part — et c'est un coût acceptable.

**Une seule note pour les deux exports.** J'ai envisagé une variante courte pour le rapport de site.
Refusé : deux notes sont deux notes à tenir en phase, et celle que personne ne lit est celle qui dérive.
Un test l'interdit d'ailleurs explicitement.

**Séparer confiance et preuve, alors qu'on aurait pu les fusionner.** On aurait pu dire « N1 = confiance
haute ». C'est faux dans les deux sens : le classement est de confiance haute sur des entrées N2, et un
chiffre en euros construit sur des jours N1 reste de confiance basse. Fusionner aurait produit un système
cohérent et faux.

**Affirmer par un test que Barcelone passe le garde-fou.** L'alternative était de ne rien dire, ou
d'écrire un commentaire. Un test est meilleur pour deux raisons : la limite devient une **propriété
connue** du code, et le jour où quelqu'un livre un polygone, le test échoue et force la mise à jour de la
documentation. Un commentaire, lui, aurait survécu au correctif en devenant faux.

**Une ligne `INFO` plutôt qu'une assertion sur la table d'arrêtés.** Les shards du dépôt datent d'avant
la reconstruction. Assertir « la table existe » ferait échouer la suite aujourd'hui ; assertir « elle
n'existe pas » la ferait échouer après le premier run Actions. Les deux mentiraient dans un sens. La ligne
d'information dit lequel des deux états est en cours, et la seule assertion posée est que **le lecteur
traite le champ comme optionnel**.

### 7.5 Pour expérimenter soi-même

**Expérience A — casser la synchronisation de la note, et voir le test la rattraper.**

Ajoutez une réforme à `lib/juridiction.ts` :

```ts
{ date: "2027-01-01", quoi: "Réforme hypothétique." },
```

Lancez `npx tsx scripts/test/auditabilite.test.ts`. **Rien ne tombe** — et c'est le résultat attendu : la
note est générée, donc elle contient déjà la nouvelle entrée. C'est la démonstration positive.

Maintenant faites l'inverse : dans `lib/noteMethodologique.ts`, remplacez la boucle sur les réformes par
un texte figé, par exemple `L.push("- 2021 : passage à quatre niveaux.")`. Relancez :

```
FAIL note: reproduces the jurisdiction's reforms
```

Le test compare la note aux **structures**, pas à un texte attendu. C'est ce qui le rend capable de
détecter une désynchronisation sans avoir à connaître le contenu.

**Expérience B — remettre un tableau littéral des niveaux, n'importe où.**

Dans `lib/vnp.ts`, remplacez `const LEVELS = NIVEAUX;` par le littéral d'origine :

```ts
const LEVELS: NiveauGravite[] = ["vigilance", "alerte", "alerte_renforcee", "crise"];
```

Lancez `npx tsx scripts/test/auditabilite.test.ts` :

```
FAIL lib/vnp.ts no longer keeps its own copy of the level list
```

Tout fonctionne encore parfaitement — les quatre niveaux sont les mêmes. C'est précisément le problème :
**un tableau littéral ne casse rien le jour où on l'écrit**, il casse le jour où quelqu'un ajoute un
cinquième niveau et oublie ce fichier. Le test protège un futur, pas un présent.

**Expérience C — voir la confiance interdire une lecture confortable.**

Dans `lib/confiance.ts`, passez la confiance des euros de `"basse"` à `"moyenne"`. Lancez la suite :

```
FAIL ADR-004: euros are the least
```

Puis regardez le motif que vous venez de contredire :

> « La conversion en euros est le maillon faible, quelle que soit la qualité des jours en amont. »

L'assertion ne teste pas une valeur arbitraire : elle teste que **l'ordre du tableau reste celui que
l'ADR-004 énonce**. Un tableau où les euros grimperaient serait un tableau qui promet plus que le produit
ne peut tenir, et c'est exactement la dérive qu'un badge de confiance est censé empêcher.
