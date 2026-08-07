# Protocole de vérification au lecteur d'écran — 10 écrans téléphone

> **À quoi sert ce fichier.** Les sprints 33→37 ont refait l'interface, et le sprint 36 a posé le
> balisage d'accessibilité — **sans qu'aucun lecteur d'écran réel n'ait été utilisé**. Ce document
> ferme cet écart : dix écrans concrets, capturés en **390 × 844**, chacun accompagné de l'arbre ARIA
> réellement produit ([`arbres-aria.md`](./captures/arbres-aria.md)) et de ce qu'il faut **entendre**.
>
> **Ce n'est pas une checklist d'exploration, c'est une comparaison.** L'arbre ARIA est le contrat ;
> le lecteur d'écran est le juge. Un écart entre les deux est un bug du produit, pas du protocole.
>
> ⚠️ **Les chiffres affichés sur les captures sont fabriqués** (egress bloqué en bac à sable, routes
> bouchonnées en Playwright). Ce qui est testable ici, ce sont les **états** et les **énoncés**, pas
> les valeurs. Les cas 1 à 5 sont choisis pour couvrir les états de données qui se ressemblent à
> l'œil et **ne doivent surtout pas se ressembler à l'oreille**.

## Comment mener le test

| | |
|---|---|
| **Cible** | iPhone + VoiceOver (Safari) **et** Android + TalkBack (Chrome). Un poste NVDA/Firefox en 390 px de large est un repli acceptable pour tout sauf les gestes tactiles. |
| **Gestes** | Balayage vers la droite = élément suivant · rotor/menu « en-têtes » pour le plan · rotor « repères » pour les régions. |
| **Reproduire un cas** | Chaque écran donne son URL et son état. Sans egress, rejouer avec les bouchons : `scripts/test/e2e.mjs` montre le patron `page.route("**/api/**", …)`. |
| **Captures** | ⚠️ **Volontairement hors du dépôt** (19 Mo de PNG pleine page en 2×). Elles ont été transmises à part ; ce qui est versionné ici est [`captures/arbres-aria.md`](./captures/arbres-aria.md), c'est-à-dire **le contrat vérifiable** — une capture ne prouve rien sur ce qui est prononcé. |
| **Noter** | Pour chaque ligne « ✅ attendu » : entendu **tel quel** / entendu **autrement** (noter la formulation) / **pas entendu**. |

---

## 1 — Crise : le pire cas réglementaire

**Capture** : `01-crise.png` · fiche site, zone SUP en **crise**, SOU en alerte renforcée,
AEP en alerte, 2 usages restreints détaillés.

**Pourquoi ce cas** : c'est celui où l'écart entre « ce que dit la loi » et « ce que calcule
l'outil » compte le plus, et celui où le plan du document est le plus chargé (1 `h1`, 5 `h2`,
~15 `h3`).

- ✅ La **synthèse est lue avant tout le reste**, et son accroche nomme le niveau :
  « Ce site est en « Crise » aujourd'hui, et perd N jours d'activité par an en moyenne. »
- ✅ Au rotor « en-têtes », le plan donne : *Quel est le niveau…* (1) → *1. Situation réglementaire*
  (2) → *Usine de Chartres* (3) → *Eure Moyen haut* (3) → … → *2. Impact sur l'activité* (2). **Les
  cinq chapitres doivent être atteignables en cinq sauts de niveau 2.**
- ✅ Le titre de zone dit **« Eure Moyen haut »**, et le code est une ligne séparée : « Code de zone
  24_028_0003 ». *(Corrigé après capture : l'arbre disait `Eure Moyen haut24_028_0003`, lu d'une
  traite.)*
- ✅ Le titre sectoriel dit **« Impact pour le secteur Industrie »** — **sans** prononcer l'émoji.
  *(Corrigé après capture : « 🏭 » était dans le nom accessible.)*
- ❌ **Échec si** : le niveau « Crise » n'est entendu que via le badge coloré, sans être dans une
  phrase ; ou si les 15 `h3` noient les 5 `h2` (plan illisible au rotor).

## 2 — VigiEau injoignable

**Capture** : `02-vigieau-injoignable.png` · `/api/zones` répond avec `message` et
`zones: []`.

**Pourquoi ce cas** : **le plus important des dix.** À l'œil, une panne et une absence de restriction
se ressemblent. À l'oreille, les confondre fait dire à l'outil le contraire de la vérité.

- ✅ Entendu : « Le service VigiEau n'a pas répondu : le statut réglementaire de ce site est
  **inconnu**. Inconnu ne veut pas dire « aucune restriction » — l'arrêté peut être en vigueur. »
- ✅ Le badge de statut est annoncé « Statut indisponible », **jamais** « Aucune restriction ».
- ✅ Aucune accroche rassurante n'est lue (la synthèse n'en produit pas dans cet état).
- ❌ **Échec si** : la phrase « Aucune restriction n'est en vigueur » est entendue quelque part sur
  cet écran.

## 3 — Territoire non couvert

**Capture** : `03-non-couvert.png` · `notCovered: true`.

**Pourquoi ce cas** : il **doit se distinguer du n° 2**. Même silence apparent, cause opposée.

- ✅ Entendu : « Aucune zone d'alerte sécheresse ne couvre cette adresse : soit le territoire
  **n'est pas couvert par VigiEau**, soit aucune restriction n'y est en vigueur aujourd'hui. »
- ✅ La formule « n'a pas répondu » du cas 2 est **absente**.
- ❌ **Échec si** un auditeur, écoutant les cas 2 et 3 à la suite, ne peut pas dire lequel est une
  panne.

## 4 — Chargement en cours, aux délais réels de production

**Capture** : `04-chargement.png` · `/api/hydro` retardé à **16,0 s**, `/api/piezo` à
**11,0 s**, projection à 9 s — les mesures du HANDBOOK (run 39).

**Pourquoi ce cas** : pendant un quart de minute, la page est incomplète. La question est de savoir
si l'utilisateur **l'entend**, ou s'il croit lire une analyse finie.

- ✅ La région live annonce la progression : « 4 / 7 sources chargées », puis « 5 / 7 »… sans qu'il
  faille aller la chercher.
- ✅ La barre est exposée comme `progressbar` nommée « Chargement des sources de données ».
- ✅ « En attente : Débit du cours d'eau · Nappe souterraine · Projection 2050 » est atteignable.
- ✅ Les squelettes gris ne sont **pas** décrits (ils sont `aria-hidden`) ; le texte à côté l'est :
  « Recherche des stations les plus proches… (jusqu'à une quinzaine de secondes) ».
- ✅ **La synthèse n'affirme aucun manque** : ni « la projection 2050 n'est pas disponible », ni
  « aucune station n'a publié d'état ». *(Vérifié sur l'arbre : aucune occurrence.)*
- ❌ **Échec si** : les annonces live sont si bavardes qu'elles coupent la lecture en cours (régler
  `aria-live` sur `off` serait alors la correction), ou si un manque **transitoire** est affirmé.

## 5 — Aucune station rattachée, rien d'estimable

**Capture** : `05-sans-station.png` · hydro, piézo, Onde, SWI et projection tous
indisponibles.

**Pourquoi ce cas** : c'est la règle fondatrice du produit — **une donnée absente n'est jamais un
zéro** — et jusqu'ici elle n'était tenue **qu'à l'œil** (un tiret « — »).

- ✅ Chaque composante du score est lue « … (12,5 %) **non estimé** », et non « tiret » ni un blanc.
  *(Corrigé après capture : le `—` était muet.)*
- ✅ La ligne finale de la synthèse énumère les manques et conclut « comptés comme non estimés,
  **jamais comme l'absence de risque** ».
- ✅ « Aucune station à moins de 60 km » est entendu dans le chapitre 3.
- ❌ **Échec si** un auditeur, à l'écoute seule, conclut que le site va bien.

## 6 — Combobox d'adresse, liste ouverte, 2ᵉ option surlignée

**Capture** : `06-combobox.png` · saisie « 12 rue de la Rep », deux flèches bas.

**Pourquoi ce cas** : **rien ne se produit sur aucune page tant qu'une adresse n'a pas été choisie.**
C'est le contrôle qui décide si l'application est utilisable ou non.

- ✅ À la prise de focus : « Adresse du site, zone d'édition combinée ».
- ✅ À l'ouverture : « **2 adresses proposées, utilisez les flèches pour parcourir** » (région live).
- ✅ À chaque flèche bas : l'option est annoncée **sans que le focus quitte le champ** — on doit
  pouvoir continuer à taper juste après.
- ✅ L'état `expanded` est annoncé, et Échap le referme.
- ✅ Entrée valide l'option surlignée ; Entrée **sans** option surlignée ne fait rien d'anormal.
- ❌ **Échec si** : le nombre de propositions n'est jamais dit ; ou si VoiceOver déplace le curseur
  hors du champ à la première flèche (défaut connu de `aria-activedescendant` sur certaines
  combinaisons — **à noter précisément, c'est le risque n° 1 de cet écran**).

## 7 — Sommaire mobile et notice de recalcul

**Capture** : `07-sommaire-recalcul.png` · « Dépendance à l'eau » passée à *critique*, page
défilée jusqu'aux chapitres.

**Pourquoi ce cas** : deux mécanismes muets jusqu'au sprint 34 — la navigation dans une page de
~9 500 px, et un réglage qui déplaçait des chiffres sans le dire.

- ✅ Changer le sélecteur déclenche une annonce : « La dépendance à l'eau a été modifiée : les
  chapitres Impact sur l'activité et Ressource et transition ont été recalculés. »
- ✅ Le sommaire est un repère de navigation nommé « **Sommaire de la fiche** », atteignable au rotor
  « repères ».
- ✅ Le chapitre actif porte `aria-current`.
- ✅ Activer une pastille amène **au chapitre**, et la lecture reprend au bon endroit (et non en haut
  de page).
- ❌ **Échec si** : après un saut d'ancre, le curseur du lecteur reste où il était — c'est le défaut
  classique des ancres sur page unique, et il n'a **jamais été vérifié**.

## 8 — Tableau de bord en cartes (mobile)

**Capture** : `08-dashboard-cartes.png` · 3 sites, tableau remplacé par des cartes sous `md`.

**Pourquoi ce cas** : c'est ici que vivait l'encodage **par la couleur seule**, et c'est ici que le
double rendu DOM (tableau + cartes) pourrait faire tout entendre en double.

- ✅ Chaque badge de zone est annoncé en toutes lettres : « **Eaux superficielles (cours d'eau) :
  Alerte renforcée** », « Eaux souterraines (nappes) : Alerte », « Eau potable : Vigilance ».
  *(Corrigé après capture : `aria-label` sur un `<span>` sans rôle **n'est pas exposé** — l'arbre ne
  disait que « SUP SOU AEP ». Il faut `role="img"`.)*
- ✅ **Chaque site n'est entendu qu'une fois** : la forme non affichée est en `display:none`, donc
  hors de l'arbre.
- ✅ Le bouton de suppression est nommé « Supprimer Agence Lyon », jamais « Supprimer » seul.
- ❌ **Échec si** un site est lu deux fois → le `display:none` ne s'applique pas au point de rupture
  testé.

## 9 — Suppression et annulation

**Capture** : `09-suppression-annulation.png` · « Agence Lyon » supprimé, bandeau affiché.

**Pourquoi ce cas** : dans une application **sans compte et sans serveur**, une suppression non
annulée est une perte définitive. Si l'annulation n'est pas annoncée, elle n'existe pas.

- ✅ Après activation : « « Agence Lyon » a été supprimé de vos sites » est annoncé **spontanément**
  (`role="status"`), sans avoir à explorer la page.
- ✅ Le bouton « Annuler la suppression » est atteignable **en un balayage** depuis l'annonce.
- ✅ Après annulation, le site est de retour dans la liste (et sa date de création est intacte —
  vérifiable dans l'export JSON).
- ❌ **Échec si** l'annonce arrive après que le focus a été déplacé ailleurs, ou si les 8 secondes
  expirent avant qu'un utilisateur au lecteur d'écran ait pu atteindre le bouton. **C'est le point
  le plus douteux du lot : 8 s ont été choisies pour un usage à la souris.**

## 10 — Méthodologie, arrivée sur une ancre profonde

**Capture** : `10-methodologie-ancre.png` · `/methodologie#jours-contraints`, 22ᵉ des 26
sections.

**Pourquoi ce cas** : c'est le lien que chaque panneau propose. S'il n'emmène nulle part pour un
lecteur d'écran, les 26 sections restent inaccessibles.

- ✅ À l'ouverture, la lecture peut démarrer **à la section ciblée**, pas en haut de page.
- ✅ Le sommaire est un repère nommé « **Sommaire de la méthodologie** », annonçant « Sur cette page —
  26 sections ».
- ✅ Le plan `h1` → 26 × `h2` est propre au rotor « en-têtes ».
- ❌ **Échec si** le curseur du lecteur reste en haut malgré le fragment d'URL (défaut fréquent : le
  navigateur défile, le lecteur ne suit pas). Correction usuelle : rendre la cible focalisable
  (`tabIndex={-1}`) et lui donner le focus.

---

## Ce que ce protocole a déjà trouvé

Construire les dix écrans a suffi à révéler **quatre défauts que le sprint 36 avait manqués**, tous
invisibles sur une capture et tous corrigés avant publication :

| # | Défaut | Pourquoi il avait échappé |
|---|---|---|
| 1 | `aria-label` sur un `<span>` **sans rôle** n'est pas exposé : les badges de zone ne disaient que « SUP SOU AEP » | Le correctif du sprint 36 était **muet**. Vérifier l'attribut dans le DOM ne prouve rien — il faut lire l'arbre. |
| 2 | Le code de zone était collé au nom **dans le titre** : « Eure Moyen haut24_028_0003 » | Visuellement séparé par une marge, concaténé dans le nom accessible. |
| 3 | Les composantes non estimées du score se lisaient « tiret », ou rien | La règle « une absence n'est jamais un zéro » n'était tenue **qu'à l'œil**. |
| 4 | L'émoji de secteur était prononcé : « usine Impact pour le secteur Industrie » | Décoratif à l'écran, contenu dans l'arbre. |

**La leçon générale** : un attribut d'accessibilité présent dans le DOM n'est pas un attribut
**exposé**. L'arbre ARIA (`locator.ariaSnapshot()` en Playwright, ou l'inspecteur d'accessibilité du
navigateur) est le seul intermédiaire fiable entre le code et le lecteur d'écran — et il devrait être
regardé à chaque sprint qui touche au balisage.

## Ce que ce protocole ne couvre pas

- **Les gestes tactiles propres à VoiceOver/TalkBack** (rotor, exploration au doigt) : par
  construction, seul un test humain les couvre. C'est tout l'objet de ce document.
- **La carte MapLibre** (`/carte`) : une carte interactive au lecteur d'écran est un chantier à part
  entière, non traité par les sprints 33→37.
- **Le formulaire « Données internes du site »** (4 champs numériques) : peu risqué (des `<label>`
  natifs), donc écarté au profit de cas plus discriminants.
- **Un audit automatisé** : `axe-core` n'est pas encore branché sur `scripts/test/e2e.mjs`. Ce
  protocole trouve ce qu'un humain entend ; axe-core trouverait ce que personne n'a pensé à écouter.
  **Les deux sont nécessaires.**
