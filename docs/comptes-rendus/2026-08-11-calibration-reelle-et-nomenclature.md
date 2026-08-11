# Compte rendu — la calibration réelle dit non, et la nomenclature des usages (Sprint 47)

**Date** : 2026-08-11 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 47

---

## 1. La question initiale

> « Passons en revue les points en suspens »

puis, par arbitrage explicite sur trois questions posées :

> **Priorité** : « Le run Actions (recommandé) »
> **Traçabilité** : « Référence citable assumée »
> **Périmètre G15** : « S'en tenir au code INSEE »

**Ce que j'ai compris** : les sprints 38 → 46 étant livrés, il restait cinq verrous dont trois
non techniques. L'utilisateur a tranché de commencer par le seul qui pouvait produire une
information neuve : **lancer la calibration N2 sur l'archive réelle** via l'échappatoire GitHub
Actions. Les deux autres arbitrages closent des questions ouvertes par écrit.

En chemin, la fin du groupe A des « items courts » : le troisième d'entre eux (`usageCode` ↔
nomenclature du Guide Sécheresse) était écrit mais **jamais lancé**.

**Ce que j'ai délibérément laissé de côté** :

- **Le cinquième état « aucune restriction » de la chaîne de Markov.** La calibration l'a désigné
  comme la cause la plus probable du résultat négatif (§3). Y toucher est un **changement de
  modèle**, avec son propre re-run de validation — pas un correctif à glisser dans une session qui
  en corrige déjà trois. Consigné en tête des travaux de modèle dans `SPRINTS.md`.
- **Le ρ par usage dans le calcul.** Le rapprochement d'usages *mesure et affiche* désormais la
  part de volume couverte par la nomenclature ; il ne **module pas** encore le ρ. L'ordre est
  volontaire : la couverture volumique est précisément le chiffre qui dit si un ρ par usage vaut
  mieux que le ρ mélangé qu'il remplacerait, et la produire d'abord évite de livrer un raffinement
  calculé sur un cinquième du volume.
- **Un retour d'information ligne à ligne dans le formulaire de saisie des usages.** C'est une
  décision rédactionnelle (quand avertir, comment ne pas harceler quelqu'un qui tape), du même
  groupe que les quatre champs de saisie encore verrouillés. Le commentaire de
  `UsageVectorEditor.tsx` dit maintenant que c'est écarté et pourquoi, plutôt que de le laisser
  croire non fait par oubli.
- **La comparaison durées simulées / observées de §5.5.** Exige un protocole de simulation
  (réplicats, graine, zones retenues) qui est une décision de modélisation et non une mesure. La
  distribution observée est publiée pour servir de référence le jour où la simulation existe.

---

## 2. Ce qui a été réalisé

**En une phrase** : la calibration a tourné sur l'archive réelle pour la première fois, elle a
**confirmé l'hystérésis** qui justifiait le choix du modèle et **démenti son pouvoir
d'anticipation** — et ce démenti est maintenant écrit là où un lecteur qui n'ouvre jamais le dépôt
le verra.

**Dans les grandes lignes** :

- **L'hystérésis de §5.1 est vraie sur de vraies données** : les niveaux montent **1,77 fois** plus
  vite qu'ils ne descendent (2,13 avant 2021). L'argument physique qui justifiait une chaîne de
  Markov plutôt qu'un modèle de fréquences tient. Première mesure, sur 5 381 941 journées.
- **Le modèle n'anticipe rien, et c'est mesuré, pas soupçonné.** Contre une baseline
  climatologique il gagne 0,69 point de Brier sur 100 départements sans en perdre un seul. Ce
  chiffre est trompeur : la diagonale de la chaîne vaut ≈ 0,99, donc « demain = aujourd'hui » bat
  déjà largement une moyenne. **Sur les 67 335 journées où le niveau a changé, le gain devient
  −1,16 et le modèle perd dans les 100 départements.**
- **Trois défauts du protocole de calibration, trouvés en lisant sa propre réponse**, dont un
  critère d'acceptation §8 qui était une **tautologie** et ne pouvait pas échouer.
- **Le parseur avoue ses pertes.** 1 592 lignes sur 12 584 étaient rejetées sans qu'on puisse dire
  pourquoi ; chaque rejet est désormais attribué à une raison. Mesuré : 1 523 sans zone, 69 hors
  fenêtre, **zéro** date illisible, **zéro** niveau inconnu.
- **La nomenclature des usages est jointe et câblée.** `ImpactPanel` dit quelle part du **volume**
  du site les arrêtés nomment — pas quelle part de ses usages. Le premier lancement de la suite a
  trouvé **trois défauts réels**, dont un rapprochement à 1,00 sur l'usage **opposé**.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `lib/nomenclature.ts` | neuf | Rapproche un usage saisi en texte libre de la nomenclature des arrêtés. Refuse au lieu de deviner : sous le seuil → `undefined` + candidats ; deux quasi-ex æquo → **ambigu**, non appliqué. Porte la barrière de négation et les préfixes liés. |
| `scripts/test/nomenclature.test.ts` | neuf | 55 vérifications contre la nomenclature **réelle** (20 entrées), pas une fixture. C'est ce choix qui a trouvé les trois défauts. |
| `components/ImpactPanel.tsx` | modifié | Publie la **couverture volumique** de la nomenclature, placée **au-dessus** des mesures qu'elle qualifie. |
| `components/HomeClient.tsx` | modifié | Passe le vecteur d'usages au panneau d'impact. |
| `components/UsageVectorEditor.tsx` | modifié | Commentaire corrigé (le §3.3 n'est plus « non câblé ») et **tension nommée** : la plupart des suggestions du champ ne trouveront aucune entrée, et c'est la vérité du domaine, pas un défaut. |
| `lib/history.ts` | modifié | `diag.rejets` : cinq compteurs, un par motif de rejet de ligne. |
| `lib/validation.ts` | modifié | `validationCroisee` accepte un **sous-ensemble à noter** : la prévision voit tout le pli, seule la notation se restreint. C'est ce qui rend mesurable « persistance ou anticipation ». |
| `scripts/calibration/run.ts` | modifié | Critère de reconstruction réécrit (il peut échouer), métrique renommée, contrôle sur les jours de transition, limite d'état manquant consignée. |
| `lib/markov.ts` | modifié | En-tête : ce que la calibration a mesuré, et pourquoi `calibre` reste `false` **après** un ajustement réussi. |
| `lib/noteMethodologique.ts` | modifié | Deux limites nouvelles, en français grand public, jointes à **tous** les exports. |
| `scripts/test/markov.test.ts` | modifié | 6 vérifications sur le sous-ensemble de notation, dont celle qui prouve que le pli n'est pas filtré — **réécrite trois fois** avant de pouvoir échouer (§3, défaut 6). |
| `scripts/test/history-parser.test.ts` | modifié | 5 vérifications sur les compteurs de rejet, dont celle qui attribue la ligne « année 0022 ». |
| `scripts/test/e2e.mjs` | modifié | 114 → **119** vérifications. Le stub des restrictions porte de **vraies** étiquettes de nomenclature. |
| `docs/SPRINTS.md` | modifié | Section « Ce que la calibration a répondu », verrou 1 clos, liste des restes renumérotée. |

---

## 3. Erreurs potentielles

### Bugs trouvés et corrigés pendant la session

**1. Le rapprochement d'usage retenait l'usage OPPOSÉ, à 1,00 de confiance.**
« remplissage de la piscine collective » était rapproché de « Remplissage et vidange de piscines
**non** collective ». Un sac de mots n'a pas de polarité : `non` comptait comme un mot partagé
ordinaire, et l'entrée correcte (« piscines à usage collectif13 ») marquait 0,67 et **perdait**.
Deux causes cumulées — la négation, et le guide qui écrit lui-même `collective` à l'entrée 2 et
`collectif` à l'entrée 3. Corrigé par une barrière de polarité **à sens unique** (une entrée qui nie
un terme que la requête ne nie pas est écartée ; l'inverse reste permis) et un repli de genre d'une
seule entrée. ⚠️ C'est le défaut le plus grave de la session : il attachait des mesures d'arrosage
à un usage qui en est explicitement exclu, avec un ρ parfaitement plausible.

**2. Le tokeniseur inventait un mot.** « micro-aspersion » était coupé en `micro` + `aspersion`,
donnant à l'entrée 13 un mot qu'elle ne contient pas, l'égalisant avec l'entrée 12 (« Irrigation
par aspersion ») et rendant le rapprochement **faussement ambigu**. Les deux portent des mesures
différentes — l'aspersion est restreinte plusieurs niveaux plus tôt. Corrigé par une liste de
préfixes liés, `goutte-à-goutte` continuant de se couper puisque `goutte` n'est pas un préfixe.

**3. Une justification de moi, non mesurée, et fausse.** Le choix de diviser par le **plus petit**
ensemble plutôt que par l'union (Jaccard) était argumenté sur « arrosage du golf », avec l'affirmation
qu'un sous-ensemble parfait y marquerait 0,1. **Mesuré : 0,50 — Jaccard aurait accepté.** L'exemple
ne prouvait rien, et le test affirmait ma phrase au lieu de la mesurer. Le choix reste **justifié**,
mais par une mesure : sur 13 requêtes réelles, **4 sont refusées** par Jaccard, dont `ICPE` à 0,20 et
« nettoyage des trottoirs » à 0,33, deux sous-ensembles parfaits. Le test est maintenant ce balayage.
La phrase fausse est consignée à l'endroit où je l'avais écrite.

**4. Le critère d'acceptation §8 ch. 2 était une tautologie.** Il testait
`couvert === attendu || lacunes > 0` ; or `couvertureReconstruction` ouvre une lacune pour **chaque**
journée non couverte, donc `couvert < attendu` implique toujours `lacunes > 0`. Le critère
**ne pouvait pas échouer**. Il annonçait « true » sur l'archive réelle et ce « true » ne vérifiait
rien. ⚠️ C'est le pire genre de défaut de cette base : un garde-fou qui rassure sans regarder.
Réécrit pour distinguer une journée **sans arrêté** (état connu) d'une journée **inconnue** faute
d'historique, et compter les zones dont l'inconnu n'est pas déclaré par `premiereAnnee`. Il sort
vrai — 2 667 zones ont des journées inconnues, **0** ne le signalent pas — et cette fois c'est une
information.

**5. Un chiffre lu à l'envers.** `partMedianeCouverte` = 0,338 avait été compris comme « un tiers de
l'archive manque ». C'est la part médiane de 2022-2023 passée **sous restriction** — une prévalence,
plausible pour deux années de sécheresse. Une observation n'existe que pour une journée *sous*
arrêté, donc une journée non restreinte n'en produit aucune. Confirmation mesurée : ~2 lacunes par
zone et par an, soit **un hiver sans restriction chacune**. Renommé `partMedianeSousRestriction`.

**6. Une assertion à moi ne protégeait rien — trouvée en rédigeant §7.5, comme au sprint 45.**
J'avais écrit dans `markov.test.ts` un contrôle censé garantir que la prévision voit tout le pli et
que seule la notation se restreint. En écrivant l'expérience B du §7.5, je l'ai lancée : **elle
passait dans les deux configurations.** Deux causes cumulées, toutes deux mesurées :
(a) une prévision **vide** n'est pas une note absente — `brier` lit chaque niveau manquant comme
p = 0, donc le pli note **exactement 1,0**, un nombre, et `brierModele !== undefined` était toujours
vrai ; (b) une journée de transition a **parfois** sa veille dans l'ensemble filtré, quand le niveau
change deux jours de suite, donc une assertion en `some()` trouvait toujours un pli informé.
Il a fallu **trois** versions avant d'obtenir une assertion qui échoue vraiment : la séparation n'est
lisible que dans la magnitude (1,89 contre 1,02). ⚠️ Et l'erreur penchait dans le sens flatteur —
un pli filtré fait paraître le modèle **quatre fois moins mauvais**. C'est le deuxième sprint
consécutif où **§7.5 fonctionne comme un outil de détection** et pas comme de la pédagogie.

**7. Un serveur orphelin a fait passer l'e2e sur une build périmée.** J'avais tué les deux
enveloppes (`npm exec`, `sh -c`) mais pas le `next-server` lui-même, et mon contrôle cherchait
`next start`, qui ne correspond qu'aux enveloppes. La suite a rendu 5 échecs et 22 succès contre un
binaire à moitié mort, et j'ai d'abord cru avoir cassé les sections précédentes. À retenir : le
processus à tuer s'appelle `next-server`, pas `next start`.

### Non vérifié en conditions réelles

- **Le rapprochement d'usages n'a jamais vu un usage saisi par un vrai industriel.** Les 13
  requêtes du balayage sont **de moi**. C'est exactement la faiblesse que la nomenclature réelle
  corrigeait d'un côté (les étiquettes ne sont pas de moi) et qui subsiste de l'autre (les requêtes
  le sont). Le seuil de 0,34 est un **jugement non calibré** : aucun échantillon étiqueté n'existe.
- **La couverture volumique n'a pas été observée sur un site réel.** On ne sait donc pas si la
  couverture médiane est de 10 % ou de 80 %, et c'est précisément le chiffre qui décidera si un ρ
  par usage vaut la peine d'être calculé.
- **Le contrôle sur les jours de transition n'a tourné qu'une fois.** Le résultat (−1,16, 100 plis
  perdus) est net, mais il n'a pas été reproduit sur un second découpage.
- **Les 1 523 lignes « sans zone » n'ont pas été ouvertes une par une.** Je les interprète comme
  des arrêtés que le fichier ne rattache à aucune zone d'alerte — cohérent avec le fait que zéro
  ligne échoue sur la date ou le niveau — mais c'est une **inférence à partir des compteurs**, pas
  une lecture des lignes.

### Hypothèses qui pourraient ne pas tenir

- **La barrière de négation est à sens unique par choix**, et ce choix peut se retourner : une
  requête qui nie atteint encore les entrées affirmatives. C'est voulu (mieux vaut un candidat de
  trop qu'un usage muet), mais c'est une asymétrie assumée, pas une symétrie oubliée.
- **`VARIANTES` ne contient qu'une entrée** (`collective` → `collectif`). Elle est là parce que le
  guide est incohérent avec lui-même, pas parce que j'ai anticipé un besoin. Toute autre variante de
  genre du guide passera donc à travers.
- **Le repli de pluriel est grossier** : `t.length > 4 && t.endsWith("s")`. Il coupera le `s` de mots
  qui n'en ont pas besoin, et c'est sans effet mesurable ici seulement parce que les deux côtés
  subissent la même coupe.
- **La cause attribuée au résultat négatif — l'état manquant — est une hypothèse.** Elle est
  plausible et cohérente avec les sauts ignorés, mais **elle n'est pas démontrée** : elle ne le sera
  que par un re-run avec cinq états.

### Ce qui casserait si une source amont changeait

- **Une réforme de nomenclature** renommant un niveau ferait grimper `rejets.niveauIllisible` —
  c'est le compteur ajouté pour ça, et il vaut 0 aujourd'hui. Sans lui la perte aurait été muette.
- **Un guide reconstruit dans un autre ordre** ne casse plus le test : l'entrée ICPE est retrouvée
  **par contenu** et non par indice, après avoir failli être figée sur `guide[10]`.
- **Une nomenclature d'arrêtés élargie** change la couverture volumique affichée sans prévenir. Ce
  n'est pas un bug (c'est la mesure qui suit sa source), mais deux exports à deux dates peuvent
  différer sans qu'aucun code n'ait bougé — ce que la version de modèle est là pour signaler.

---

## 4. Points d'amélioration

**Dette assumée (choix conscients, motivés)**

- **Le ρ reste mélangé**, la couverture volumique n'est que mesurée. Motif en §1 : produire d'abord
  le chiffre qui dit si le raffinement en vaut la peine.
- **Le seuil de 0,34 n'est pas calibré**, et le dit partout — y compris dans la trace affichée à
  l'utilisateur, pas seulement dans les commentaires du module. Il penche vers le refus, parce
  qu'une mesure fausse mais plausible ne se fait jamais contester alors qu'un refus se voit.
- **`calibre` reste `false` après un ajustement réussi sur l'archive réelle.** Ce n'est plus « pas
  encore ajusté » mais « pas propre à l'usage », et c'est désormais une **mesure** qui le justifie.
- **Le +0,69 est publié**, avec le −1,16 accolé. Le cacher serait plus flatteur ; le publier seul
  serait mensonger.

**À reprendre (raccourcis qu'il faudra payer)**

- **`RestrictionScore` prend un `Set` de clés `zone|day` construit par l'appelant.** Ça marche et
  c'est testé, mais la construction du sous-ensemble « jours de transition » vit dans le script de
  calibration alors qu'elle est réutilisable. Le jour où un deuxième sous-ensemble apparaît
  (« journées d'entrée en restriction », par exemple), il faudra la déplacer dans `lib/validation`.
- **`ImpactPanel` retype toujours la charge de restrictions à la main.** Le commentaire l'avoue
  depuis le sprint 42a, et c'est toujours vrai : le stub e2e et le type peuvent divergemment
  mentir. Cette session l'a d'ailleurs frôlé — un stub avec `detail: {}` aurait laissé le nouveau
  bloc invisible et fait passer les vérifications pour la mauvaise raison.
- **La liste de mots vides est écrite à la main** et contient `eau`, ce qui est le bon choix et un
  choix fragile : elle est ajustée pour cette nomenclature-là.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009` — dernier commit de code
  `e593866`, puis `04b824c` écrit par le workflow Actions (rapport de calibration).
- **`main` touché ?** : **NON.** Aucun merge, aucune demande en ce sens.
- **Pull request** : **aucune** — non demandée.
- **Déployé en prod ?** : **non.** Vercel suit `main`, qui n'a pas bougé. ⚠️ La dette « livré mais
  jamais vu avec de vraies données » n'est **pas** réduite par cette session côté interface : le
  bloc de couverture volumique n'a été vu que par Playwright et par moi.
- **Vérifications passées** :
  - `npm run build` — clean
  - `npm run lint` — clean
  - **31 suites** de tests unitaires, 0 échec
  - **119/119** vérifications e2e (114 avant cette session)
  - ⚠️ `npx tsc --noEmit` signale une erreur `TS1501` dans `scripts/test/report.test.ts`.
    **Vérifiée pré-existante** sur un arbre propre (`git stash` puis re-run) : c'est un artefact de
    l'appel direct à `tsc`, la vérification du projet passe par `npm run build`.
  - **2 runs GitHub Actions** : 31490333194 (calibration 1) et 31491804305 (calibration 2, après
    correction du protocole), tous deux `success`.

---

## 6. Prochaines étapes

Par valeur décroissante, chacune avec son verrou.

1. **Ajouter le cinquième état « aucune restriction » à la chaîne N2, puis re-noter.** C'est la
   seule étape qui peut transformer un « le modèle n'anticipe pas » en autre chose. *Verrou* : aucun
   techniquement — les journées sans arrêté se déduisent par complément du calendrier RLE. C'est un
   changement de modèle : il exige son propre re-run et l'honnêteté de garder le −1,16 publié si le
   résultat ne bouge pas.
2. **Regarder la prod.** *Verrou* : humain. ⚠️ **En attente depuis dix sessions.** Aucune quantité
   de tests e2e ne remplace un regard sur l'écran réel.
3. **Observer la couverture volumique sur des sites réels**, pour décider du ρ par usage. *Verrou* :
   dépend de l'étape 2 et de vrais vecteurs d'usages saisis.
4. **Les quatre champs de saisie** (`profilMensuel`, `tamponM3`, `seuilTechniqueM3`, `paliers`).
   *Verrou* : rédactionnel — nommer un seuil technique en m³/jour pour qui ne sait pas ce que c'est.
5. **Ouvrir un échantillon des 1 523 lignes sans zone.** *Verrou* : aucun, mais faible valeur —
   l'interprétation par compteurs est cohérente.
6. **Trois à cinq sites pilotes.** *Verrou* : **commercial.** Le seul que le code ne lèvera pas, et
   celui qui bloque la validation de §5.5 — la seule qui porterait sur la métrique du client.

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Quand il ne pleut pas assez, le préfet publie un arrêté qui interdit certains usages de l'eau :
arroser, laver sa voiture, remplir sa piscine. Une entreprise qui dépend de l'eau veut savoir ce que
ça lui coûte, et surtout : **est-ce que ça va empirer ?**

Cette session a fait deux choses sans rapport apparent, réunies par une même exigence.

La première : nous avions écrit un modèle statistique censé répondre à « est-ce que ça va empirer ? »,
mais il n'avait jamais été confronté aux vraies données — seulement à des données que nous avions
fabriquées nous-mêmes, dont nous connaissions la réponse. Nous l'avons enfin lancé sur quinze ans
d'archives françaises. **Il ne sait pas répondre.** Il a l'air excellent quand on le note de la
façon habituelle, et il est mauvais dès qu'on le note sur les seules journées qui comptent.
Comprendre *pourquoi* la note habituelle mentait est le cœur de ce compte rendu.

La seconde : quand une entreprise déclare « 80 % de mon eau part au refroidissement, 20 % à
l'arrosage », il faut retrouver, dans le vocabulaire des arrêtés, à quoi chacun de ces usages
correspond. Les arrêtés parlent d'arrosage, de lavage de véhicules, d'abreuvement du bétail. Ils ne
parlent **pas** de refroidissement industriel. Il faut donc dire à l'entreprise : « pour 20 % de ton
eau je sais quelles règles s'appliquent, pour les 80 % restants je n'ai rien » — et surtout ne pas
faire semblant en attachant une interdiction d'arroser les pelouses à un circuit de refroidissement.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Arrêté (sécheresse)** | Décision du préfet qui restreint des usages de l'eau sur une zone, avec des dates de début et de fin. |
| **Zone d'alerte** | Découpage administratif sur lequel un niveau de restriction s'applique. La France en compte plus de 10 000. |
| **Niveau de gravité** | Les quatre échelons français : vigilance, alerte, alerte renforcée, crise. |
| **ρ (rho)** | Part d'un prélèvement qu'une mesure empêche. « Arrosage interdit » sur un usage qui pèse 20 % du volume → ρ = 0,2 pour le site. |
| **Nomenclature** | La liste des usages que les arrêtés nomment. Ici : 20 entrées. |
| **Jeton (token)** | Un mot d'une étiquette, une fois nettoyé (sans accents, sans ponctuation, sans mots vides). |
| **Mot vide (stop word)** | Mot sans pouvoir distinctif qu'on retire avant de comparer (`de`, `des`, et ici `eau`). |
| **Chaîne de Markov** | Modèle qui suppose que l'état de demain ne dépend que de l'état d'aujourd'hui. |
| **Matrice de transition** | Le tableau des probabilités de passer d'un niveau à un autre en un jour. |
| **Diagonale** | Dans cette matrice, les probabilités de **rester** au même niveau. Ici ≈ 0,99. |
| **Score de Brier** | Note d'une prévision probabiliste. **Plus bas = meilleur.** 0 = parfait. |
| **Baseline climatologique** | Prévision de référence bête : « la répartition moyenne observée dans le passé ». Il faut la battre pour prétendre servir à quelque chose. |
| **Persistance** | Prévision de référence encore plus bête : « demain comme aujourd'hui ». Redoutablement efficace sur les phénomènes qui durent. |
| **Leave-one-department-out** | On retire un département, on ajuste sur les 99 autres, on note sur celui-là, et on recommence 100 fois. Vérifie qu'un modèle généralise. |
| **Hystérésis** | Le fait qu'un système monte plus vite qu'il ne descend. Ici : un préfet aggrave vite et lève lentement. |
| **JEA** | Jour-équivalent d'arrêt : l'unité dans laquelle nous exprimons une interruption d'activité. |

### 7.3 Comment le code s'y prend

#### a) Rapprocher un usage : comparer, et surtout refuser

On découpe les deux étiquettes en jetons et on mesure leur recouvrement. Le premier choix qui
compte est le **dénominateur** (`lib/nomenclature.ts`) :

```ts
export function recouvrement(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const communs = a.filter((t) => setB.has(t)).length;
  return communs / Math.min(a.length, b.length);   // ← le PLUS PETIT, pas l'union
}
```

Diviser par le plus petit ensemble revient à demander « ce que l'utilisateur a écrit est-il
**contenu** dans cette entrée ? ». Diviser par l'union (Jaccard) demanderait « les deux étiquettes
se ressemblent-elles ? », ce qui punit une étiquette courte face à une entrée longue. Quelqu'un tape
`ICPE`, l'arrêté écrit « Exploitation des installations classées pour la protection de
l'environnement (ICPE) » : recouvrement 1,00, Jaccard 0,20.

Puis vient la partie que je trouve la plus instructive, parce qu'elle **ne calcule rien** :

```ts
if (second && premier.score - second.score < ECART_AMBIGUITE_USAGE) {
  return {
    score: premier.score, ambigu: true, candidats,
    detail: `« ${saisi} » correspond aussi bien à « ${premier.usage} » qu'à « ${second.usage} » ` +
      `(${Math.round(premier.score * 100)} % contre ${Math.round(second.score * 100)} %). ` +
      "L'outil ne choisit pas : les deux portent des mesures différentes, et retenir la première " +
      "serait tirer au sort.",
  };
}
```

Deux candidats à égalité ne sont pas départagés. Retenir le premier serait un tirage au sort
présenté comme un résultat.

#### b) Le défaut qui rendait le rapprochement dangereux

Un sac de mots ignore la **négation**. Le guide contient deux entrées voisines : « piscines **non**
collective » et « piscines à usage **collectif** ». Quelqu'un tape « remplissage de la piscine
collective ». Ses trois jetons — `remplissage`, `piscine`, `collectif` — sont **tous** présents dans
la première entrée, celle qui dit l'inverse : recouvrement **1,00**. La bonne entrée marquait 0,67
et perdait.

```ts
const nieSaisi = nie(tk);
const notes = nomenclature.map((e) => {
  const te = tokens(e.usage);
  // Une entrée qui nie un terme que la requête ne nie pas n'est pas un
  // rapprochement faible : c'est l'usage OPPOSÉ.
  const score = nie(te) && !nieSaisi ? 0 : recouvrement(tk, te);
  return { usage: e.usage, thematique: e.thematique, score };
});
```

La règle est **à sens unique** : une requête qui nie (« piscine non collective ») atteint encore
les deux entrées, et gagne sur la bonne puisqu'elle partage `non` en plus.

#### c) La part de **volume**, jamais le nombre d'usages

C'est la fonction dont dépend l'honnêteté de l'écran :

```ts
for (const u of usages) {
  if (u.isExempt) continue;             // rien ne peut restreindre un usage exempté
  const part = Number.isFinite(u.part) && (u.part ?? 0) > 0 ? u.part! : 0;
  partTotale += part;
  const r = rapprocherUsage(u.usageCode, nomenclature);
  if (r.ambigu) ambigus++;
  else if (r.usage) { rapproches++; partCouverte += part; }
  else nonRapproches++;
}
```

Deux usages rapprochés sur trois, ça sonne comme 67 %. Si le troisième porte 80 % du volume, la
vraie couverture est **20 %**. La phrase affichée refuse la lecture rassurante :

> « 20 % du volume restreignable est rapproché de la nomenclature. ⚠️ Le reste ne porte AUCUNE
> mesure : ce n'est pas un volume non restreint, c'est un volume dont **on ne sait pas** s'il l'est. »

#### d) Le contrôle qui a démenti le modèle

Voici la mécanique complète du résultat négatif. La prévision est « la ligne de la matrice
correspondant au niveau d'hier » — une prévision à un jour, ce qu'une chaîne de Markov sait faire :

```ts
const informe = (entrainement: JourEvalue[], test: JourEvalue[]): JourEvalue[] => {
  const m = fitTransitions(entrainement.map((j) => ({ zone: j.zone, day: j.day, niveau: j.observe })));
  const index = new Map(test.map((j) => [`${j.zone}|${j.day}`, j]));
  return test.map((j) => {
    const hier = index.get(`${j.zone}|${j.day - 1}`);
    return { ...j, prevu: hier ? (m.p[hier.observe] ?? {}) : {} };
  });
};
```

Notée sur **toutes** les journées, cette prévision gagne 0,69 point de Brier contre la baseline. Le
problème est visible dans la matrice ajustée : `P(crise → crise) = 0,992`. Les restrictions durent.
Une prévision qui recopie hier a donc raison ~99 fois sur 100 **sans rien comprendre**, tandis que
la baseline climatologique étale sa probabilité sur quatre niveaux et se trompe constamment. Le 0,69
mesure la persistance du phénomène, pas l'intelligence du modèle.

Le contrôle note **la même prévision** sur les seules journées où le niveau a changé :

```ts
const parJour = new Map(observations.map((o) => [`${o.zone}|${o.day}`, o.niveau]));
const transitions = new Set<string>();
for (const o of observations) {
  const hier = parJour.get(`${o.zone}|${o.day - 1}`);
  if (hier !== undefined && hier !== o.niveau) transitions.add(`${o.zone}|${o.day}`);
}
const parDepTransitions = validationCroisee(jours, "leave_one_department_out", informe, {
  nom: "jours de transition (le niveau a changé depuis la veille)",
  cles: transitions,
});
```

Le détail qui fait tout, dans `lib/validation.ts` : **la prévision voit tout le pli, seule la
notation se restreint**.

```ts
const prevus = ajuster(entrainement, test);
const baseline = baselineClimatologique(entrainement);
const retenu = restriction
  ? (j: JourEvalue) => restriction.cles.has(`${j.zone}|${j.day}`)
  : () => true;
const notes = prevus.filter(retenu);
const testNotes = test.filter(retenu);
```

Si l'on avait filtré le **pli** au lieu de la **notation**, la prévision n'aurait plus trouvé la
veille de chaque journée de transition (la veille d'un changement n'est presque jamais elle-même un
changement) et n'aurait rien pu prévoir : on aurait mesuré son propre filtre. Résultat : **−1,16, et
100 départements perdus sur 100.**

### 7.4 Pourquoi ces choix plutôt que d'autres

**Sur le contrôle du modèle.** L'idée naturelle était de comparer à une **baseline de persistance**
(« demain = aujourd'hui »). Écartée : une persistance brute affecte toute la probabilité à un seul
niveau, ce qui donne le pire score de Brier possible les jours où elle se trompe — comparaison
injuste. La rendre juste demande de **lisser** avec une constante, et une constante choisie pour
qu'une comparaison sorte bien est exactement ce que ce dépôt refuse. Sélectionner des **journées**
ne demande aucune constante : la persistance y est fausse par construction, donc tout gain restant
est de l'anticipation. Le contrôle ne coûte qu'un `Set`.

**Sur le dénominateur du recouvrement.** Jaccard est le réflexe. Il est ici le mauvais outil, et je
l'ai d'abord justifié par un exemple **faux** (voir §3, défaut 3). La leçon est le protocole, pas la
formule : le test balaye maintenant 13 requêtes et compte combien changent de verdict — 4 — au lieu
d'affirmer ma phrase sur une paire choisie par moi.

**Sur la nomenclature lue depuis la charge et non depuis `guide.json`.** Le fichier est lu côté
serveur avec `fs`, donc inaccessible à un composant client — mais ce n'est pas la vraie raison. La
vraie : les étiquettes présentes dans la charge sont celles des mesures du **département du site**,
tandis que `guide.json` est le repli national. Mesurer la couverture d'un document qui ne gouverne
pas le site aurait été une réponse à côté de la question.

**Sur la barrière de négation plutôt qu'un vrai modèle de langue.** Un modèle d'embeddings aurait
géré la négation, les genres et les composés d'un coup. Écarté : 20 entrées. Un modèle
approximerait davantage tout en devenant impossible à contester ligne à ligne, alors que la
propriété qui compte ici est qu'un lecteur puisse dire « ce rapprochement est faux, et voici
pourquoi ».

**Sur le fait de publier le +0,69.** Le taire aurait été plus flatteur pour le modèle. Le publier
seul aurait été mensonger. Les deux chiffres partent ensemble dans la note méthodologique jointe aux
exports — un lecteur qui n'ouvrira jamais ce dépôt doit pouvoir savoir que l'outil ne prévoit pas.

### 7.5 Pour expérimenter soi-même

**Expérience A — casser la barrière de négation, et découvrir que deux garde-fous se relaient.**
Cette expérience se fait en **deux temps**, et le premier ne donne pas ce que j'attendais — c'est
pour ça qu'elle vaut la peine.

*Temps 1.* Dans `lib/nomenclature.ts`, neutralisez la polarité :

```ts
const score = recouvrement(tk, te);   // au lieu de : nie(te) && !nieSaisi ? 0 : …
```

`npx tsx scripts/test/nomenclature.test.ts` → **3 échecs mesurés**, dont
`negation: the affirmative query reaches the COLLECTIF entry…`. Mais si vous affichez le résultat :

```ts
const r = rapprocherUsage("remplissage de la piscine collective", guide);
console.log("usage:", r.usage, "| ambigu:", r.ambigu);
```

vous obtenez `usage: undefined | ambigu: true`, **pas** l'usage opposé. Pourquoi ? Parce que le repli
de genre (`collective` → `collectif`), ajouté pour une raison **sans rapport** — le guide s'écrit
lui-même de deux façons — met désormais les deux entrées à **1,00 chacune**. L'outil voit une égalité
et refuse. Le pire défaut ne réapparaît pas : il se dégrade en refus.

*Temps 2.* Désactivez **aussi** le repli :

```ts
const VARIANTES: Record<string, string> = {};
```

Le diagnostic affiche alors :

```
usage: Remplissage et vidange de piscines non collective (de plus d’1m³) | ambigu: false
candidats: [ '1.00 …non collective…', '0.67 …à usage collectif13' ]
```

L'usage **opposé**, à 100 %, sans hésitation. **Mesuré : 3 échecs dans les deux temps** — le nombre
d'échecs ne distingue pas les deux situations, seule la lecture du résultat le fait, et c'est la
leçon : un compteur d'échecs vert-ou-rouge ne dit pas *à quel point* on s'est trompé. Ce que
l'expérience apprend vraiment, c'est la répartition des rôles : le repli de genre transforme une
**erreur confiante** en refus, la barrière de négation transforme ce **refus** en rapprochement
correct. Aucun des deux ne suffit seul.

**Expérience B — filtrer le pli au lieu de la notation, et sous-estimer son propre défaut.**
Dans `lib/validation.ts`, appliquez la restriction **avant** la prévision :

```ts
const test = jours.filter((j) => cle(j) === k && (!restriction || restriction.cles.has(`${j.zone}|${j.day}`)));
```

Puis `npx tsx scripts/test/markov.test.ts` → **1 échec mesuré** :
`cv: every scored fold is INFORMED, which shows in the magnitude, not the sign`.

⚠️ **Cette expérience m'a pris trois assertions fausses avant de tenir**, et c'est l'expérience la
plus utile du lot pour cette raison. Ce que j'attendais — « plus aucune journée n'a sa veille dans le
pli, donc rien n'est noté » — est faux deux fois :

1. Une prévision **vide** n'est pas une note absente. `brier` lit chaque niveau manquant comme
   p = 0, donc le niveau observé contribue (0−1)² = 1 : le pli note **exactement 1,0**, un nombre.
   Ma première assertion testait `brierModele !== undefined` et passait dans les deux cas.
2. Une journée de transition a **parfois** sa veille dans l'ensemble filtré — quand le niveau change
   deux jours de suite. Ma troisième assertion testait « le score diffère de 1,0 » avec un `some()`,
   et trouvait toujours un pli informé.

La séparation n'est visible que dans la **magnitude**, et mesurée elle est nette :

| | `brierModele` | gain |
| --- | --- | --- |
| notation restreinte (correct) | ≈ 1,89 – 1,90 | −1,12 … −1,15 |
| pli filtré (faux) | ≈ 1,02 – 1,04 | −0,25 … −0,29 |

Et notez **dans quel sens** l'erreur aurait penché : un pli filtré fait paraître le modèle environ
**quatre fois moins mauvais**, parce que la plupart de ses journées perdent la prévision qui lui
permet de se tromper avec assurance. Se tromper ici aurait atténué le résultat même que ce contrôle
existe pour révéler.

Au passage, un fait contre-intuitif et vérifié : sur les jours de transition, une prévision **vide**
(1,0) note **mieux** qu'une prévision confiante et fausse (1,89). C'est le −1,16 de l'archive réelle
en miniature.

**Expérience C — compter les usages au lieu du volume.**
Dans `lib/nomenclature.ts`, remplacez la pondération par un décompte :

```ts
const partVolumeCouverte = usages.length > 0 ? rapproches / usages.length : undefined;
```

Lancez la suite unitaire (`nomenclature.test.ts`) : **3 échecs mesurés** —
`coverage: … but only 20 % of the volume`, `coverage: an exempt usage is excluded from the
denominator` et `coverage: no declared share → no weighted coverage, rather than 0 %`. Les deux
derniers sont instructifs : un décompte d'usages **réintroduit** les usages exemptés dans le
dénominateur et transforme « aucune part déclarée » en un pourcentage, alors que la version pondérée
rend `undefined`. Un seul raccourci casse trois propriétés distinctes.

Puis, plus parlant, l'e2e : `npm run build`, `npx next start -p 3200 &`, puis
`node scripts/test/e2e.mjs` → **1 échec mesuré**,
`3.3: … as a share of VOLUME (20 %), not a count of usages (50 %)` : l'écran affiche **50 %** là où
la vérité est **20 %**. C'est la différence entre « je couvre la moitié de tes usages » et « je ne
sais rien de 80 % de ton eau ». **Mesuré : 3 échecs unitaires + 1 échec e2e.**

⚠️ Pour arrêter le serveur ensuite, tuez le processus **`next-server`**, pas `next start` : ce
dernier ne correspond qu'aux enveloppes `npm exec`, et le serveur survit à leur mort en gardant le
port — ce qui m'a fait lancer l'e2e contre une build périmée pendant cette session (§3, défaut 6).

**Expérience D — voir la tautologie que nous avions écrite.**
Ouvrez `scripts/calibration/run.ts` et lisez le commentaire de la section 1, puis reconstituez
l'ancien critère sur des chiffres inventés :

```ts
const couvert = 300, attendu = 730, lacunes = 5;
console.log(couvert === attendu || lacunes > 0);   // true
console.log(0 === 730 || 0 > 0);                    // false — le SEUL cas d'échec
```

Cherchez ensuite un jeu de valeurs atteignable où l'expression est fausse : il faut `couvert = 0`
**et** `lacunes = 0`, ce qui est impossible puisque toute journée non couverte ouvre une lacune. Un
garde-fou qui ne peut pas se déclencher est plus dangereux qu'aucun garde-fou : il rassure.
