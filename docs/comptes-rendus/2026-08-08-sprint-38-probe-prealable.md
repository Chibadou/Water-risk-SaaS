# Compte rendu — Sprint 38 : le probe préalable, et les trois défauts qu'il a trouvés en chemin

**Date** : 2026-08-08 · **Branche** : `claude/integrate-file-apply-plan-k5t009` · **Sprint** : 38

> Troisième compte rendu du 2026-08-08, et le premier qui produit du code exécuté. Les deux
> précédents ont versé la note technique
> ([`…note-technique-conception.md`](./2026-08-08-note-technique-conception.md)) puis tranché les
> arbitrages et écrit la file
> ([`…arbitrages-et-plan-de-sprints.md`](./2026-08-08-arbitrages-et-plan-de-sprints.md)).

---

## 1. La question initiale

> « go »

**Ce que j'ai compris** : lancer la file de sprints qui venait d'être approuvée, en commençant par son
premier élément — le Sprint 38, un probe préalable répondant en un run Actions aux quatre inconnues
factuelles dont dépendent quatre décisions (le type ρ `rotation`, SISPEA/G13, Hydroportail/G14,
l'accessibilité de V_ref/G9).

**Ce que j'ai délibérément laissé de côté** :

- **Corriger les trois défauts trouvés.** Ils touchent `restrictionSeverity`, la fonction que le
  Sprint 39 réécrit intégralement. Les corriger ici aurait produit un correctif à jeter la semaine
  suivante, et aurait mélangé une session de mesure avec une session de code produit.
- **Ouvrir l'archive SISPEA.** Son existence est établie ; son contenu ne l'est pas. SISPEA ne
  conditionne aucun des sprints 39→43, et `py7zr` est une dépendance à arbitrer le jour où le chantier
  est planifié, pas maintenant.
- **Démarrer le Sprint 39.** Les trois défauts changent son périmètre ; ils sont écrits dans son
  contenu, mais le sprint lui-même reste à ouvrir.

---

## 2. Ce qui a été réalisé

**En une phrase** : les quatre inconnues sont mesurées et closes par écrit — et le fait de regarder les
mesures réelles, plutôt que les décomptes, a trouvé trois erreurs dans du code en production qui
sous-estiment toutes le risque.

**Dans les grandes lignes** :

- **Un probe, quatre questions, quatre passes** — et chaque passe a corrigé la précédente. La passe 1
  a rendu quatre verdicts et zéro erreur, ce qui avait l'air propre : **trois étaient faux**.
- **Un verdict s'est inversé** entre les passes 1 et 2. S'arrêter à la première aurait fait écarter du
  Sprint 39 un type ρ qui est en réalité nécessaire.
- **Trois défauts de `restrictionSeverity` trouvés**, mesurés en exécutant le code livré sur des
  libellés verbatim. Aucun n'était couvert par les 29 assertions existantes.
- **Un correctif structurel au probe lui-même** : chaque question porte un `status`
  `mesuré` / `indéterminé`, et un verdict d'absence est interdit tant que le status est `indéterminé`.
- **Deux arbitrages ont été tranchés par la mesure**, pas par une décision : la moitié « mesurer
  l'écart » de G14 est irréalisable, et la question « faut-il se faire passer pour un navigateur ? »
  est sans objet.

**Concrètement** :

| Fichier | Nature | Ce que ça fait |
| --- | --- | --- |
| `scripts/restrictions/probe_note_technique.py` | neuf | Les quatre questions en un run ; `status` par question ; lecteur CSV/xlsx/`.xls` qui refuse plutôt que de décoder du charabia ; sortie non nulle si aucune question n'a abouti |
| `.github/workflows/probe-restrictions.yml` | modifié | Mode `note`, **branche de session ajoutée** (le piège du §3), `openpyxl` |
| `data/restrictions-probe-request.json` | modifié | Quatre passes, chacune motivée dans son champ `note` |
| `data/restrictions/note-technique-probe.json` | neuf (runner) | La sortie brute, conservée |
| `docs/SPRINTS.md` | modifié | Sprint 38 marqué livré avec ses verdicts ; Sprint 39 hérite des trois correctifs |
| `docs/HANDBOOK.md` | modifié | Entrée de session ; **les trois défauts en §4 comme bugs de production** |

**Les quatre verdicts** :

| Question | Statut | Verdict |
|---|---|---|
| **A** `rotation` | mesuré | **Dans le périmètre** — 77 mesures entreprise via « N jours par semaine » ; les 496 « tours d'eau » sont exclusivement agricoles |
| **B** SISPEA (G13) | mesuré | **Exploitable sous condition** — archives 7-Zip sur `data.ofb.fr` ; le « rendement par territoire » trouvé est départemental |
| **C** Hydroportail (G14) | mesuré | **Aucun JSON** — 200 en HTML, Hub'Eau sert déjà la série élaborée |
| **D** V_ref (G9) | mesuré | **403 sur les deux UA** — transcription manuelle avec citation |

---

## 3. Erreurs potentielles

### Les trois défauts trouvés — en production, non corrigés

Mesurés en exécutant `restrictionSeverity` sur des libellés **verbatim**, tous `concerne_entreprise`,
aux niveaux alerte → crise :

| Mesure réelle | ρ rendu | ρ réel | Effet |
|---|---|---|---|
| « Autorisé 3 jours par semaine : lundi, mercredi, vendredi entre 20h et 9h » | **0** — « Aucune restriction prescrite » | ≈ 0,77 | Bloque 77 %, lu comme **aucune mesure** |
| « Arrosage autorisé 2 jours par semaines : lundi et jeudi entre 20h et 23h » | **0,125** | ≈ 0,96 | Facteur **7,7** |
| « …arrosage autorisé 3 jours par semaine […] entre 20h et 9h » | 0,542, tracé « Interdiction 13 h sur 24 » | ≈ 0,77 | **Trace auditable fausse** |

Deux causes : une **inversion de polarité** (toute plage citée est supposée interdite, alors que
« autorisé entre 20h et 9h » désigne la plage permise) et **l'absence de composition** (jours × heures
est multiplicatif ; la première dimension rencontrée gagne).

⚠️ **Les trois sous-estiment le risque.** Le premier est du genre du bug du SWI : une réponse
d'apparence positive qui signifie « rien à signaler ».

⚠️ **Ce qu'ils disent des tests** : `restrictions.test.ts` est calibré sur du verbatim — c'est la bonne
méthode, et elle n'a rien vu, parce qu'**aucun de ces trois libellés n'y figurait**. Un corpus verbatim
ne protège que des cas qu'on y a mis. Les trois entrent en non-régression au Sprint 39.

### Les erreurs de mon propre probe, passe par passe

- **Passe 1 — trois verdicts qui n'en étaient pas.** « Jamais sur un usage entreprise » venait de
  colonnes d'audience non détectées : elles s'appellent `usage.u.concerne_entreprise`, et je cherchais
  un préfixe `concerne`. **`build_restrictions.py:148` lisait déjà le bon préfixe** — la réponse était
  dans le dépôt. « SISPEA introuvable » venait d'une requête de quatre mots dont le compte brut
  n'était pas enregistré. « Aucun endpoint Hydroportail » venait de cinq `ConnectTimeout`.
- **Passe 1 — trois motifs faux.** `roulement` captait **« déroulement »** (48 fois), « 7 jours sur 7 »
  est une interdiction totale comptée comme une rotation, `altern` attrapait « alternative ». Et le
  motif qui portait tout le signal utile, « N jours par semaine », **n'était pas cherché**.
- **Passe 2 — le décompte corrigé, les exemples pas.** Le préfixe avait été réparé sur le comptage et
  laissé sur la ligne qui collecte les échantillons : 77 mesures comptées, **zéro affichable**.
- **Passe 3 — un format supposé.** Le lecteur Excel ajouté ne couvrait ni le cas réel : les fichiers
  sont des archives **7-Zip** annoncées « xls » par data.gouv.

**Ce que ça dit** : chacune de mes quatre passes a échoué de la même façon que le code que j'auditais —
en présentant une non-mesure comme un résultat. Le correctif (`status` mesuré/indéterminé) est à
reprendre pour tout probe futur, et c'est écrit dans le HANDBOOK.

### Ce qui peut être faux dans ce qui est livré

- **Les ρ « réels » de mon tableau sont mes calculs, pas une vérité opposable.** ≈ 0,77 vient de
  1 − (3/7 × 13/24). Il suppose que la consommation est **uniforme dans le temps** — l'hypothèse même
  que G11 dit de nommer plutôt que de tenir pour acquise. Ce qui est certain est le **sens** de
  l'erreur et son **ordre de grandeur**, pas la troisième décimale.
- **Les 77 mesures entreprise n'ont pas été comptées usage par usage.** Les exemples montrent de
  l'arrosage d'espaces verts, des terrains de sport et des canaux ; je n'ai pas vérifié que les 77
  s'y réduisent. Il peut rester de l'eau de procédé dans le lot.
- **La couverture des motifs de rotation n'est pas prouvée.** Sept motifs, calibrés sur ce que j'ai su
  imaginer plus les extraits ramenés. Une huitième formulation existe peut-être.
- **`py7zr` n'a pas été essayé** : SISPEA reste « exploitable **sous condition** ».
- **Rien de tout cela n'a été vu à l'écran.** Aucune interface n'a changé, mais les trois défauts
  produisent aujourd'hui des chiffres faux **en production**, et personne n'est allé les regarder sur
  le déploiement.

---

## 4. Points d'amélioration

**Dette assumée** :

- **Quatre runs pour quatre questions.** Chaque passe se justifiait, mais un probe qui portait le
  `status` dès le départ en aurait économisé deux. La leçon est écrite ; c'est son seul intérêt.
- **Le probe reste un script jetable** : aucun test, un seul point d'entrée, des motifs en dur. C'est
  la convention du dépôt pour les probes et elle tient tant qu'ils ne servent qu'une fois.

**À reprendre** :

- **Compter les 77 par usage** avant d'implémenter `rotation` : si l'essentiel est de l'arrosage
  d'agrément, le type est réel mais son poids dans un vecteur d'usages industriel est marginal — et ça
  change la priorité, pas la décision.
- **Vérifier les trois défauts sur la production**, une fois corrigés. Ils affectent des chiffres
  affichés aujourd'hui ; le correctif du Sprint 39 doit être constaté, pas supposé.

---

## 5. État Git

- **Branche de session** : `claude/integrate-file-apply-plan-k5t009`
- **`main` touché ?** : **NON**.
- **Déployé en prod ?** : **non**. ⚠️ Les trois défauts, eux, **sont en production depuis le Sprint 21**.
- **Vérifications passées** :
  - `npm run build` ✅, `npm run lint` ✅, **22 suites au vert**, **62/62 e2e**.
  - **Aucun code produit modifié** : le diff ne touche que `scripts/`, `.github/`, `data/` et `docs/`.
    `lib/`, `components/` et `app/` sont intacts — les trois défauts sont **documentés, pas corrigés**.
  - Motifs de rotation **rejoués à sec sur les extraits réels** de la passe 1 : les trois faux positifs
    sont rejetés, 7/7 contrôles ciblés.
  - Lecteur de format **testé hors ligne** sur trois formes (CSV, xlsx fabriqué, OLE2) avant d'être
    poussé ; le `.xls` legacy lève au lieu de décoder du charabia.
  - Runs Actions : 31355992762, 31356567620, 31356782500 et la passe 4, **tous verts**.

---

## 6. Prochaines étapes

1. **Sprint 39 — typologie ρ à intervalles.** *Verrou : aucun.* Son périmètre a grossi de trois
   correctifs, et il est maintenant le sprint le plus rentable de la file : il corrige des chiffres
   faux **en production** en même temps qu'il livre les intervalles de G2.
2. **Compter les 77 par usage** (§4). *Verrou : rien, la donnée est dans le fichier déjà téléchargé.*
3. **Regarder la production.** *Verrou : un œil humain.* ⚠️ Réclamé depuis trois sessions, et désormais
   avec une raison précise : trois chiffres affichés sont faux.
4. **SISPEA, le jour où il est planifié** : arbitrer `py7zr`, puis ouvrir l'archive. *Verrou : une
   décision de dépendance.* **Ne pas re-sonder l'existence.**

---

## 7. Explication à un novice

### 7.1 Le problème, en langage courant

Avant d'écrire du code qui dépend d'une donnée extérieure, il faut savoir ce que cette donnée contient
vraiment. On peut le supposer — c'est rapide et c'est souvent faux — ou aller regarder. Ce dépôt a
choisi d'aller regarder, avec de petits programmes jetables appelés *probes*.

Ici, quatre questions bloquaient quatre décisions. Le probe y a répondu. Mais l'histoire intéressante
est ailleurs : **le probe s'est trompé trois fois, exactement comme le code qu'il auditait**, et pour
la même raison. Il confondait « j'ai regardé et il n'y a rien » avec « je n'ai pas su regarder ». Les
deux produisent le chiffre zéro, et zéro se lit « rien à signaler ».

### 7.2 Le vocabulaire à connaître

| Terme | Définition |
| --- | --- |
| **Probe** | Programme jetable qui répond à une question factuelle sur une source de données avant qu'on écrive le vrai code. |
| **ρ (rho)** | Part d'un usage de l'eau bloquée par une mesure : interdiction totale = 1, « réduction de 50 % » = 0,5. |
| **Plage horaire** | Une mesure du type « interdiction de 8h à 20h » : 12 heures sur 24, donc ρ = 0,5. |
| **Rotation** | Une mesure du type « autorisé 3 jours par semaine » : 3 jours sur 7 autorisés, donc ρ = 1 − 3/7. |
| **Escape hatch Actions** | Le bac à sable de développement n'a pas accès aux serveurs français de données ouvertes ; on fait donc tourner le probe sur un serveur GitHub, qui a le réseau et renvoie ses résultats. |
| **Magic bytes** | Les premiers octets d'un fichier, qui trahissent son vrai format quelle que soit son extension annoncée. |
| **Faux négatif** | Répondre « il n'y a rien » quand il y a quelque chose. En sécurité comme ici, c'est l'erreur la plus coûteuse. |

### 7.3 Comment le code s'y prend

**Le mécanisme du faux négatif, en une ligne.** Le probe voulait savoir si les mesures de rotation
concernent les entreprises. Le fichier a une colonne pour ça. Le probe la cherchait ainsi :

```python
audience_cols = [c for c in cols if c.lower().startswith("concerne")]
```

Les colonnes s'appellent `usage.u.concerne_entreprise`. Elles ne **commencent** pas par `concerne`,
elles le **contiennent**. La liste est donc restée vide, le compteur est resté à zéro, et le probe a
conclu : « rotation trouvée, jamais sur un usage concernant l'entreprise ». Une phrase parfaitement
affirmative, construite sur rien.

Le correctif tient en un mot :

```python
audience_cols = [c for c in cols if "concerne_" in c.lower()]
```

Mais le vrai correctif n'est pas là. Il est ici :

```python
a["status"] = "mesuré" if a["audience_detected"] else "indéterminé"
if not a["audience_detected"]:
    a["verdict"] = ("INDETERMINE — colonnes d'audience non détectées, donc le "
                    "décompte entreprise ne veut rien dire. Ne pas conclure.")
```

Le programme sait désormais **qu'il ne sait pas**, et il refuse de conclure. C'est la seule protection
qui survit au prochain changement de nom de colonne.

**Le défaut trouvé dans le produit, sur le même principe.** Une fois les vraies mesures visibles, il
a suffi de les donner au code existant :

```
Mesure : « Autorisé 3 jours par semaine : lundi, mercredi, vendredi entre 20h et 9h »
Code   : ρ = 0  →  « Aucune restriction prescrite »
Réalité: 3 jours sur 7, et seulement de 20h à 9h → ~16 % du volume autorisé, donc ρ ≈ 0,77
```

Le classifieur voit que le texte commence par « autorisé » et applique une règle prévue pour
« Autorisé » tout court. Une mesure qui supprime les trois quarts d'un usage est rangée dans « aucune
restriction ». Même forme que le faux négatif du probe, dans le produit cette fois.

### 7.4 Pourquoi ces choix plutôt que d'autres

- **Pourquoi quatre passes au lieu d'un probe parfait ?** Parce qu'un probe parfait suppose de
  connaître la donnée, ce qui est la question qu'il pose. L'alternative n'était pas « moins de
  passes », c'était « conclure faux ». Le Sprint 27 avait déjà fait trois passes avant la moindre
  ligne de code, et deux avaient changé la conception.
- **Pourquoi ne pas corriger les trois défauts tout de suite ?** Parce que le Sprint 39 réécrit
  exactement cette fonction. Un correctif posé maintenant serait jeté, et il mélangerait une session
  de mesure avec une session de code. Ils sont donc **écrits en bugs connus** — visibles, datés, avec
  leur ampleur mesurée.
- **Pourquoi relever les octets de tête au lieu d'essayer un quatrième format ?** Parce que trois
  suppositions de suite avaient déjà échoué. Les octets ont dit `377abcaf271c` : du 7-Zip, là où
  data.gouv annonçait « xls ». On ne devine pas un format, on le lit.
- **Pourquoi un `status` plutôt qu'un commentaire d'avertissement ?** Un commentaire ne s'exécute pas.
  Le `status` est lu par la logique qui rédige le verdict, et **interdit** la phrase d'absence.

### 7.5 Pour expérimenter soi-même

**a) Reproduire le défaut de production, en trois lignes.** Créez un fichier avec :

```ts
import { restrictionSeverity } from "/chemin/absolu/vers/lib/restrictions";
console.log(restrictionSeverity("Autorisé 3 jours par semaine : lundi, mercredi, vendredi entre 20h et 9h"));
```

puis `npx tsx votre-fichier.ts`. Vous lirez `coefficient: 0` et « Aucune restriction prescrite » sur une
mesure qui bloque environ 77 % de l'usage. C'est le bug n°1 du §4 du HANDBOOK, en production
aujourd'hui.

**b) Voir quelle règle l'avale.** Dans `lib/restrictions.ts`, trouvez :

```ts
const NO_LIMIT = /pas de (limitation|restriction)|aucune restriction|^autorise|sans restriction/;
```

Retirez `|^autorise` et relancez (a). Le résultat change — mais lancez ensuite la suite complète :

```bash
npx tsx scripts/test/restrictions.test.ts
```

**Un test va casser** : « verbatim: 'Autorisé' → 0 ». Vous venez de découvrir pourquoi la règle existe,
et pourquoi le correctif du Sprint 39 n'est pas « supprimer la règle » mais « distinguer *Autorisé*
tout court d'*Autorisé, sous conditions quantifiées* ». C'est le meilleur exemple de ce dépôt qu'un
test protège quelque chose de réel même quand le code qu'il protège est faux par ailleurs.

**c) Faire mentir un probe volontairement.** Dans `scripts/restrictions/probe_note_technique.py`,
remettez `startswith("concerne")` à la place de `"concerne_" in`. Vous ne pouvez pas l'exécuter depuis
le bac à sable (le réseau est bloqué), mais lisez la suite du code : le `status` passe à
`indéterminé` et le verdict devient « Ne pas conclure ». **Le programme cassé refuse désormais de
mentir**, alors que le même bug avait produit une affirmation fausse à la passe 1. C'est toute la
différence entre un bug et un bug silencieux.
