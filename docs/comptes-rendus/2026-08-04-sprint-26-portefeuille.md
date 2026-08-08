# Compte rendu — Le portefeuille comme objet d'analyse (Sprint 26)

**Date** : 2026-08-04 · **Branche** : `claude/outil-portefeuille-sites-pertinence-1y4e3a` · **Sprint** : 26

---

## 1. La question initiale

> « Trouve des idées en élargissant la réflexion : comment rendre cet outil le plus pertinent pour
> des entreprises ayant un portefeuille de sites et souhaitant analyser l'exposition de ces sites à
> un risque d'interruption de consommation / prélèvement d'eau. »

Puis, en arbitrage : idéation **+ un sprint**, axes prioritaires **corrélation entre sites** et
**m³ / € à risque**, avec en plus la recherche de **modèles et études existants** sur le sujet, et un
**executive summary en début de page** (après l'entrée des sites), avant que les faits ne soient
déroulés.

**Ce que j'ai compris** : la demande n'était pas « ajoute des fonctionnalités » mais « change le
niveau d'analyse ». L'outil savait analyser *un site* en profondeur ; le tableau de bord ne faisait
qu'**empiler** ces analyses. Un portefeuille n'est pas une somme de sites, et c'est exactement cet
écart qu'il fallait combler.

**Ce que j'ai délibérément laissé de côté** :

- **L'import de masse** (CSV + géocodage batch) — instruit dans l'idéation, **non codé**. C'est
  pourtant le blocage n°1 : sans lui, la corrélation ne se calcule que sur les parcs saisis à la
  main. Écarté du sprint parce que les deux axes demandés étaient explicites, mais c'est la
  prochaine étape n°1 et je le signale comme tel plutôt que de l'avoir silencieusement enterré.
- **Le flux RSS/ICS** et **SISPEA** — instruits, chiffrés, non codés.
- **Le bassin comme clé de concentration** — abandonné en cours de route : `bassinForCommune`
  n'existe pas côté client, le rattachement commune→bassin est résolu serveur, et le récupérer
  aurait coûté un appel par site que ce tableau de bord évite délibérément. La zone d'alerte et le
  département restent, et la zone est de toute façon la bonne maille (c'est elle qui porte l'arrêté).

---

## 2. Ce qui a été réalisé

**En une phrase** : le tableau de bord répond désormais à « combien de mes sites s'arrêtent le même
jour, et combien ça me coûte » — deux questions qu'aucune somme de jours ne peut atteindre.

**Dans les grandes lignes** :

- **Une idéation large versée au repo** (`docs/IDEATION-PORTEFEUILLE.md`) : 8 axes, chaque piste avec
  un verdict (retenue / backlog / écartée avec motif), et un benchmark sourcé. Sa conclusion oriente
  tout le reste : la niche défendable n'est ni la maille (Aqueduct et le WWF font du screening
  assumé) ni la monétisation (Ecolab l'a publiée en 2015), c'est **la simultanéité mesurée sur des
  arrêtés réellement publiés**.
- **Le calendrier des arrêtés, récupéré et non recalculé.** `lib/history.ts` construisait déjà une
  table jour→niveau par zone et **la jetait** après agrégation. Elle est désormais conservée sous
  forme compressée. Aucune source nouvelle, aucun appel réseau de plus.
- **La corrélation, mesurée et non supposée.** Dix ans d'arrêtés sont publiés : la co-occurrence se
  *rejoue*, elle ne se modélise pas.
- **La limite n°1 du modèle levée en changeant de question.** Le HANDBOOK portait « pondérer par les
  volumes : bloqué, VigiEau n'en publie aucun ». Vrai de la source publique, et hors sujet :
  **l'entreprise connaît ses propres volumes**. Il suffisait de les lui demander.
- **Un executive summary en tête de page**, dont la dernière ligne énumère toujours ce qu'il ne sait
  pas — à l'échelle d'un parc, un manque tu se lit comme un zéro.
- **Un correctif trouvé au passage** : `saveCurrentSite` perdait `origine` et `dependance`.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `docs/IDEATION-PORTEFEUILLE.md` | neuf | 8 axes + benchmark sourcé des modèles existants |
| `lib/history.ts` | modifié | `ZoneHistory.periodes` : calendrier compressé en run-length, servi sur `?periodes=1` seulement |
| `lib/portefeuille.ts` | neuf | `computePortfolio` : simultanéité, concentration, grappes, m³/€, jours nets d'autonomie |
| `lib/executive.ts` | neuf | `buildExecutiveSummary` : la synthèse, une phrase par fait calculé |
| `lib/sites.ts` | modifié | `DonneesInternes` : volume, autonomie, coût/jour, CA — tous optionnels |
| `components/PortfolioCorrelation.tsx` | neuf | distribution, pire épisode, concentration, grappes |
| `components/PortfolioExecutiveSummary.tsx` | neuf | la synthèse en tête de `/sites` |
| `components/AddressSearch.tsx` | modifié | bloc repliable « Données internes du site » |
| `components/SitesDashboard.tsx` | modifié | un seul appel `/api/history&periodes=1`, colonnes CSV neuves |
| `lib/report.ts` | modifié | sections « Synthèse » et « Corrélation » dans le rapport ESG |
| `scripts/diag/replay-portefeuille.ts` | neuf | rejeu sur données réelles via l'escape hatch Actions |
| `scripts/test/portefeuille.test.ts` · `executive.test.ts` | neufs | 2 suites de tests |

---

## 3. Erreurs potentielles

### Bugs trouvés et corrigés pendant la session

- **Dénominateur du rejeu faux — trouvé uniquement sur données réelles.** VigiEau **redécoupe son
  référentiel de zones** : un code en vigueur aujourd'hui n'apparaît pas dans les arrêtés antérieurs
  à sa création. Le fichier couvre 2017→2026, mais la zone de Lyon ne commence qu'en 2022. Je datais
  la fenêtre du premier arrêté rencontré : les grandeurs « par an » étaient divisées par 4 années au
  lieu de 9 — **59 j/an de jours multi-sites au lieu de 26,2**. C'est un facteur 2,25 sur un chiffre
  destiné à un comité de direction. **Aucune fixture ne pouvait l'attraper** : il fallait un vrai
  référentiel de zones avec sa propre histoire.
- **`saveCurrentSite` perdait `origine` et `dependance`** (antérieur à ce sprint). Le tableau de bord
  retombait sur « origine inconnue, dépendance moyenne » pour tous les sites, et sa colonne « jours
  contraints » contredisait donc silencieusement la fiche site dont elle venait.
- **Calendriers alias fusionnés inutilement** : une zone est servie sous son code *et* sous son id
  numérique, les deux pointant sur le même tableau. Résultat correct, chemin inutilement coûteux.

### Non vérifié en conditions réelles

- **Le rendu visuel du bloc de corrélation avec de vraies données.** Les sondes prod valident l'API,
  pas l'affichage : en bac à sable les appels échouent, je n'ai vu que l'état dégradé. Un problème de
  mise en page sur une distribution à 20 barres, ou sur une grappe de 30 sites, ne se verrait pas.
- **Le comportement à grande échelle.** Testé jusqu'à 20 sites synthétiques et 3 sites réels. Le
  rejeu alloue une piste de ~3 650 octets par site : à 200 sites c'est 730 Ko et 730 000 itérations,
  ce qui devrait passer, mais **ce « devrait » n'est pas une mesure**.
- **La limite de 100 codes de zone.** `/api/history` en accepte 100 ; au-delà, le parc est tronqué
  **en silence** — les sites au-delà tombent en « non évalués ». Un parc de 60 sites sur 2 zones
  chacun atteint la limite. C'est une vraie limite d'échelle, non traitée.

### Hypothèses qui pourraient ne pas tenir

- **`m³ à risque = volume × jours / 365`** suppose un prélèvement **moyen journalier**. Or les
  restrictions tombent en étiage, saison où beaucoup d'activités prélèvent *plus* que la moyenne.
  Le chiffre est donc probablement **sous-estimé**. C'est écrit dans la méthodologie, mais c'est une
  approximation assumée, pas une mesure.
- **Le repli Swiss Re à 0,5 % du CA par jour** est un ordre de grandeur *tous périls confondus*,
  pas un chiffre eau. Il est étiqueté comme repli partout où il sert, et remplaçable — mais quelqu'un
  qui ignore l'étiquette le lira comme une estimation.
- **`DEPENDANCE_FACTOR` est dupliqué** entre `interruption.ts` et `portefeuille.ts`. Volontaire (une
  calibration ne doit pas bouger l'autre en silence), et un test compare les deux — mais un test qui
  lit du source par expression régulière est fragile s'il est reformaté.

### Ce qui casserait si une source amont changeait

- Si le CSV des arrêtés changeait de schéma, `periodes` deviendrait vide sans erreur : le parseur
  est défensif, et l'absence de calendrier se lit « simultanéité indisponible ». Dégradation propre,
  mais **silencieuse** — c'est `diag.source` qu'il faudrait surveiller.
- Si VigiEau redécoupait massivement ses zones, l'historique des zones neuves repartirait de zéro et
  les jours par an chuteraient sans que rien ne signale la cause. Le champ `couvertureDepuis` limite
  les dégâts sur le dénominateur, pas sur le numérateur.

---

## 4. Points d'amélioration

**Dette assumée** (choix conscients, motivés) :

- Pas de pondération saisonnière des volumes (§3) : il faudrait un profil de consommation mensuel
  par site, que l'entreprise n'a pas forcément sous la main.
- Le bassin absent des clés de concentration : coûterait un appel par site.
- La duplication de `DEPENDANCE_FACTOR` : préférée à un couplage entre deux modules.

**À reprendre** (raccourcis qu'il faudra payer) :

- **La troncature silencieuse à 100 zones** devrait être signalée à l'utilisateur, pas subie.
- **`SitesDashboard.tsx` fait 800 lignes** et porte maintenant quatre effets asynchrones aux
  interdépendances subtiles (statuts → exposition → jours → périodes). C'est le fichier le plus
  susceptible de recevoir un bug de concurrence. Il mériterait d'être découpé, idéalement en
  extrayant la logique de chargement dans un hook dédié.
- **Le test de synchronisation des facteurs de dépendance lit du source par regex** — à remplacer par
  un export partagé de constantes si un troisième module en a besoin un jour.
- **Les champs internes ne sont saisissables qu'à la création d'un site.** Aucune édition d'un site
  existant : les sites déjà enregistrés devront être supprimés et recréés.

---

## 5. État Git

- **Branche de session** : `claude/outil-portefeuille-sites-pertinence-1y4e3a`
- **`main` touché ?** : **OUI** — merge `15afb17`, puis `bdb77b0` pour la vérification prod. **À la
  demande explicite de l'utilisateur** (« push to main »), pas de ma propre initiative.
- **Déployé en prod ?** : oui, et **vérifié sur le déploiement réel** (diag Actions mode `prod`,
  run 25) sur de vraies zones : `?periodes=1` sert le calendrier (12 et 10 périodes), sans le drapeau
  les périodes sont absentes, les agrégats sont identiques entre les deux appels. `data/diag/` purgé.
- **Vérifications passées** : `npm run build` ✅ · `npm run lint` ✅ · **16/16 suites de tests**
  (2 neuves) · **22/22 e2e** (10 checks neufs) · rejeu sur données réelles ✅ après correctif.

---

## 6. Prochaines étapes

| # | Étape | Ce qui la conditionne |
| --- | --- | --- |
| 1 | **Import CSV + géocodage batch BAN** | Rien — la BAN expose déjà un endpoint batch. **Le vrai verrou est en aval** : sans ça, la corrélation reste hors de portée d'une entreprise de 80 sites. Prévoir un rapport de géocodage par ligne : un géocodage silencieusement faux est pire qu'un géocodage manquant. |
| 2 | **Voir le bloc de corrélation avec de vraies données** | Un vrai portefeuille sur la prod. C'est la vérification que ce sprint n'a pas pu faire. |
| 3 | **Lever la troncature à 100 zones** | Décider entre pagination et signalement explicite à l'utilisateur. Le signalement suffit à court terme. |
| 4 | **Fiabilité du service d'eau potable (SISPEA)** | Rien de bloquant : source ouverte, jamais exploitée. Concerne les sites en origine `aep`, probablement majoritaires dans un parc tertiaire. |
| 5 | **Flux RSS/ICS sans login** | Rien — tout l'état tient dans l'URL. Lève le blocage « alertes vs local-only » parké depuis le Sprint 8. |
| 6 | **Édition des sites existants** | Rien. Nécessaire pour que les champs internes servent aux sites déjà enregistrés. |

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Quand il ne pleut pas assez, le préfet d'un département publie un **arrêté sécheresse** : un document
qui dit « du 1er juillet au 15 septembre, dans telle zone, il est interdit d'arroser, de laver les
véhicules, et les industriels doivent réduire leurs prélèvements de 25 % ». Une entreprise qui a une
usine dans cette zone voit donc son activité freinée pendant ces jours-là.

L'outil savait déjà dire, pour **une** usine : « en année typique, vous êtes freinés 46 jours par an ».

Mais une entreprise qui a 20 usines ne veut pas 20 réponses séparées. Elle veut savoir si ses usines
sont freinées **en même temps**. Parce que 20 usines freinées chacune 46 jours mais jamais aux mêmes
dates, c'est gérable : on déplace la production. Et 20 usines freinées les **mêmes** 46 jours, c'est
l'entreprise entière à l'arrêt six semaines par an.

L'ancien tableau de bord donnait exactement le même chiffre dans les deux cas. C'est ce qu'on a
corrigé.

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Zone d'alerte** | Le découpage géographique sur lequel porte un arrêté sécheresse. Plus fin qu'un département, plus grossier qu'une commune. C'est l'unité qui compte : deux sites dans la même zone subissent **le même arrêté**. |
| **Niveau de gravité** | Quatre crans : vigilance (on incite aux économies), alerte, alerte renforcée, crise (arrêt des prélèvements non prioritaires). |
| **Étiage** | La période de l'année où les cours d'eau sont au plus bas, typiquement de mai à octobre. C'est là que tombent les restrictions. |
| **Jours contraints** | Les jours où l'activité est effectivement freinée. Ce n'est pas la même chose que les jours sous arrêté : on pondère par ce que les mesures bloquent réellement. |
| **Run-length encoding (RLE)** | Une compression : au lieu de lister chaque jour, on liste des *plages*. « du jour 1000, pendant 30 jours, au niveau alerte ». |
| **Fonction pure** | Une fonction qui ne fait que calculer : mêmes entrées → mêmes sorties, aucun appel réseau, aucune écriture de fichier. C'est ce qui la rend testable sans rien simuler. |
| **HHI** (Herfindahl-Hirschman) | Un indice de concentration emprunté à l'économie. Son inverse `1/HHI` se lit directement : « vos 40 sites se comportent comme 4,2 zones indépendantes ». |

### 7.3 Comment le code s'y prend

**Étape 1 — récupérer une donnée qu'on jetait déjà.**

Le fichier des arrêtés (un CSV de 11 Mo) est lu par `lib/history.ts`. Pour compter les jours,
il construisait déjà, pour chaque zone, une table « quel niveau à quelle date » :

```ts
// lib/history.ts — ce code existait déjà
for (let t = start; t <= end; t += DAY_MS) {
  const d = Math.floor(t / DAY_MS);          // le jour, en nombre entier depuis 1970
  const prev = days.get(d);
  if (prev === undefined || rank > prev) days.set(d, rank);  // on garde le pire niveau du jour
}
```

Puis il comptait les jours par année… **et jetait la table**. Or c'est précisément elle qui permet de
répondre à « les mêmes jours ? ». On la conserve donc, compressée :

```ts
// lib/history.ts — runLengths() : la table jour→niveau devient des plages
for (let d = fromDay; d <= toDay; d++) {
  const r = days.get(d);
  if (r === rank) continue;                  // même niveau que la veille : la plage continue
  if (start >= 0) out.push(start, d - start, rank);   // la plage se termine, on l'enregistre
  ...
}
```

La sortie est un simple tableau de nombres, par groupes de trois :
`[18800, 30, 2, 18900, 10, 4]` se lit « à partir du jour 18800, pendant 30 jours, niveau 2 (alerte) ;
puis à partir du jour 18900, pendant 10 jours, niveau 4 (crise) ».

**Pourquoi compresser ?** Dix ans font 3 650 jours. Mais un arrêté est un *intervalle continu* : une
zone active a quelques dizaines de plages par décennie, pas 3 650 valeurs. Pour 100 zones, la
différence entre envoyer les plages et envoyer les jours est de l'ordre de 300 Ko.

**Étape 2 — rejouer le calendrier de tout le parc.**

Dans `lib/portefeuille.ts`, on reconstruit une « piste » par site — un tableau où la case *i*
contient le niveau de gravité du jour *i* :

```ts
// lib/portefeuille.ts
const lanes = replayable.map((s) => {
  const lane = new Int8Array(span);          // un octet par jour : les niveaux vont de 0 à 4
  for (let i = 0; i < s.periodes!.length; i += 3) {
    // on redéploie chaque plage en jours
    for (let d = from; d <= to; d++) lane[d - startDay] = rank;
  }
  return lane;
});
```

Puis on parcourt les jours **une seule fois**, en regardant tous les sites à chaque jour :

```ts
for (let i = 0; i < span; i++) {
  let count = 0;
  for (let s = 0; s < lanes.length; s++) {
    if (lanes[s][i] < CONSTRAINED_RANK) continue;   // ce site n'est pas contraint ce jour-là
    count++;                                        // il l'est : on le compte
  }
  distribution[count]++;   // « il y a eu un jour de plus avec exactement `count` sites contraints »
}
```

C'est tout. `distribution[3] = 84` se lit « 84 jours avec exactement 3 sites contraints ». Le pic,
l'année la pire et les jours partagés tombent du même parcours.

`Int8Array` plutôt qu'un tableau ordinaire : les niveaux tiennent sur un octet, et un tableau typé
occupe 1 octet par case là où un tableau JavaScript classique en occuperait 8.

**Étape 3 — transformer les jours en euros.**

Là, pas d'algorithme : la donnée manquait, et elle n'est pas publique.

```ts
// lib/portefeuille.ts
if (jours !== undefined && volumeDeclare) {
  v.m3ARisque = Math.round((s.volumeM3! * jours) / 365);
}
```

Le point qui compte est ailleurs — dans ce qu'on fait quand la donnée **manque** :

```ts
if (jours !== undefined && volumeDeclare) { ... }   // sinon : on ne met RIEN
```

On n'écrit pas `0`. Un site sans volume déclaré est *non estimé*, pas un site qui ne prélève rien.
Cette distinction traverse tout le projet, et c'est probablement la règle la plus importante à
retenir : **`undefined` et `0` ne sont pas la même chose**. Le premier veut dire « je ne sais pas »,
le second « je sais, et c'est zéro ». Les confondre transforme une ignorance en bonne nouvelle.

### 7.4 Pourquoi ces choix plutôt que d'autres

**Rejouer plutôt que modéliser.** La littérature scientifique modélise la dépendance spatiale des
sécheresses avec des outils statistiques sophistiqués (les *copules*). On aurait pu. On ne l'a pas
fait : **on dispose de dix ans d'observation directe sur les zones exactes du parc**. Rejouer ce qui
s'est passé est plus juste, plus explicable, et surtout opposable — on peut montrer l'arrêté. Une
copule deviendrait utile pour extrapoler *au-delà* de l'observé ; ce n'est pas la question posée.

**Balayer la plage de jours plutôt que trier les clés.** Pour compresser, il fallait parcourir les
jours dans l'ordre. Premier réflexe : trier les clés de la table. Mesuré au banc, ça coûtait
**+1 400 ms** sur 2 200 zones. Balayer la plage de dates en interrogeant la table jour après jour :
**+330 ms**. Contre-intuitif — on fait plus de lectures — mais chaque comparaison d'un tri appelle
une fonction, là où une lecture de table est une opération élémentaire. **La leçon générale :
mesurer, ne pas raisonner sur l'algorithme en théorie.**

**Rendre les périodes optionnelles** (`?periodes=1`). Elles ne servent qu'au tableau de bord. Les
imposer aurait alourdi chaque appel de la fiche site pour rien. Le coût de ce choix est une règle à
respecter : sans le paramètre, la réponse doit être *strictement* celle d'avant — d'où un test dédié.

**Une fonction pure, plutôt qu'un calcul dans le composant React.** `computePortfolio` ne fait aucun
appel réseau : elle reçoit des données et rend un résultat. On peut donc la tester avec des
calendriers fabriqués à la main, sans navigateur, sans serveur, sans internet — ce qui compte
doublement ici, où l'environnement de développement n'a **pas** accès aux sources françaises.

### 7.5 Pour expérimenter soi-même

**Expérience 1 — voir la démonstration centrale du sprint.**
Ouvrez `scripts/test/portefeuille.test.ts`, section 1. Deux portefeuilles y sont construits : l'un
avec deux sites contraints **les mêmes** 30 jours, l'autre **à des dates disjointes**. Lancez :

```bash
npx tsx scripts/test/portefeuille.test.ts
```

Vous verrez passer `same total constrained days in both parcs` **et**
`concentrated parc peaks at 2 sites at once` / `spread parc never exceeds 1 site at once`. Même
total, risque différent : c'est toute la raison d'être du sprint, en deux assertions.

**Expérience 2 — casser un test pour comprendre ce qu'il protège** (la plus instructive).
Dans `lib/portefeuille.ts`, trouvez la fonction `episodes` et supprimez la fusion des plages
adjacentes :

```ts
if (last && last[0] + last[1] === start) last[1] += len;   // ← supprimez cette ligne
else out.push([start, len]);                               // ← et le `else`
```

Relancez le test. Vous verrez échouer
`adjacent levels form a single episode against the buffer`. Ce test protège une subtilité
métier : quand une alerte se durcit en crise sans interruption, ce sont **deux plages** dans les
données mais **un seul épisode** dans la réalité — la citerne de l'usine n'a pas eu le temps de se
remplir entre les deux. Sans la fusion, on offrirait à l'usine une autonomie qu'elle n'a pas eue.

**Expérience 3 — voir l'effet du dénominateur, le bug de la session.**
Toujours dans les tests, section 3b. Modifiez `couvertureDepuis: 2017` en `couvertureDepuis: 2023` et
relancez : le nombre d'années rejouées tombe, et `joursMultiSitesParAn` **grimpe** — le même nombre
de jours divisé par moins d'années. C'est exactement l'erreur trouvée sur données réelles : 59 j/an
au lieu de 26,2. Vous tenez là, en une ligne, pourquoi un dénominateur est aussi important qu'un
numérateur.
