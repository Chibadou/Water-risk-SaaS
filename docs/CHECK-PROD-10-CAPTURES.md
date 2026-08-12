# Onze captures à faire en prod — et ce que chacune peut démentir

**Créé le** 2026-08-12 · **Prod** : https://water-risk-saa-s.vercel.app (suit `main`, merge `bf017a3`)

> ⚠️ **La nᵗᵉ 11 est d'une autre nature que les dix premières** : elle ne porte pas sur ce merge mais
> sur les bassins versants du Sprint 52, qui attendent une revue sur leur branche. Elle ne pourra
> être prise **qu'après** un merge de cette branche vers `main`.

> **À quoi sert ce fichier.** Treize sessions ont été livrées sans que personne regarde la prod. Tout
> a été vérifié contre des **bouchons Playwright**, c'est-à-dire contre des réponses que j'ai écrites
> moi-même. Une capture n'a d'intérêt que si **une vraie donnée peut y démentir quelque chose** : les
> dix ci-dessous sont classées par ce qu'elles risquent de révéler, pas par ordre de navigation.
>
> ⚠️ **Chaque entrée dit ce que je vérifierai ET ce qui serait un drapeau rouge.** Si une capture ne
> montre rien d'inattendu, c'est aussi un résultat — mais les nᵗᵉˢ 1 à 4 sont celles où je m'attends
> le plus à avoir tort.

**Avant tout** — vérifier que le déploiement est bien celui du merge. La version de modèle
s'affiche **en bas du panneau des trois sorties** (pas en pied de page, ni sur `/methodologie` :
vérifié dans le code, elle n'est rendue que là), sous la forme
« *Modèle HydroVigie 2026.08.1, figé le 11/08/2026* ». Elle apparaît donc en même temps que la
capture nº 3. Si elle affiche autre chose, le reste de la liste ne teste pas le bon code — dites-le
moi avant de continuer.

⚠️ Un second indice, plus rapide : la présence de la grille **« Répartition mensuelle du volume »**
dans « Données internes du site » (capture nº 7). Elle n'existe que depuis ce merge.

---

## Tier 1 — pourraient montrer que l'outil se trompe

### 1. La couverture de nomenclature sur un vrai site industriel
**Où** : page d'accueil → chercher l'adresse d'un **vrai site industriel** (idéalement l'un des
vôtres ; sinon une zone d'activité en Pyrénées-Orientales, Var ou Drôme). Ouvrir « Données internes
du site », déclarer **3 usages avec leurs parts** dont au moins un procédé industriel
(ex. `refroidissement` 70 %, `arrosage des espaces verts` 20 %, `sanitaires` 10 %).
**Capturer** : le chapitre **2. Impact sur l'activité** en entier, encadré « Rapprochement de vos
usages avec la nomenclature » compris.

**Ce que je vérifie** : le **% de volume couvert**. J'ai prédit qu'un site industriel serait très
mal couvert, sans jamais le mesurer. **Drapeau rouge** : une couverture élevée (> 60 %) — ça
voudrait dire que mon appariement accepte des rapprochements qu'il devrait refuser, et le défaut
« piscine collective → piscines **non** collective » montre que c'est possible.
⚠️ **Le cas le plus utile** : un usage rapproché **à tort**. Si vous en voyez un, c'est la capture la
plus précieuse des dix.

### 2. La largeur réelle des fourchettes de ρ
**Où** : même page, même chapitre. **Capturer** : les quatre barres « Part de l'activité empêchée,
par niveau » avec leurs libellés chiffrés, **en gros plan lisible**.

**Ce que je vérifie** : les intervalles. Toute la conception repose sur `[min, max]`, et je n'ai
jamais vu la largeur réelle sur de vrais arrêtés. **Drapeau rouge** : des fourchettes du type
**0–100 %** partout — ça signifierait que presque aucune mesure n'est chiffrable, et alors le VNP, le
JEA **et** le classement de matérialité (nº 4) deviennent tous inutilisables en pratique. Second
drapeau : des fourchettes **nulles partout** (un seul chiffre), ce qui suggérerait au contraire que
la lecture des mesures ne détecte plus les mesures non chiffrées.

### 3. Les trois sorties avec un volume réel déclaré
**Où** : même site. Renseigner **Volume prélevé** (vrai chiffre si possible), **Part rejetée dans la
même masse d'eau**, et **Réserve mobilisable**. **Capturer** : le panneau « Jours sous statut, volume
non prélevable, interruption d'activité » **en entier**, journal d'hypothèses inclus (déplier).

**Ce que je vérifie** : l'**ordre de grandeur** des m³ et des JEA, et la cohérence entre eux.
**Drapeau rouge** : un VNP qui dépasse le volume annuel déclaré, un JEA supérieur au nombre de jours
sous arrêté, ou un « VNP de crise » et un « VNP structurel » présentés de façon qu'on puisse croire
qu'ils s'additionnent. ⚠️ Vérifier aussi que les **bornes de plausibilité de V_ref** ne se
déclenchent pas à tort sur un volume légitime.

### 4. Les classes de matérialité sur un vrai portefeuille
**Où** : `/sites` avec **au moins 4 sites réels** enregistrés, dans des départements différents.
**Capturer** : la « Synthèse du portefeuille » en entier, en particulier la ligne **« Où agir »**.

**Ce que je vérifie** : si la réserve de matérialité apparaît, et si tout le parc s'effondre en une
seule classe. Le code annonce ce cas comme **correct** (« ces sites ne sont pas classables sur cette
preuve ») mais **personne ne l'a jamais vu**. **Drapeau rouge** : la ligne « Où agir » désigne deux
sites **sans** réserve alors que leurs JEA sont visiblement proches — la matérialité ne serait alors
pas branchée sur les vraies bornes.

---

## Tier 2 — pourraient montrer que quelque chose casse

### 5. Le temps de chargement réel, chronométré
**Où** : n'importe quelle fiche site, **onglet Réseau des devtools ouvert**, rechargement forcé.
**Capturer** : l'onglet Réseau trié par durée, avec la **ligne de total** visible.

**Ce que je vérifie** : `/api/hydro` a été mesuré à **16,0 s en prod** au sprint 33, contre 5 s
simulés dans les bouchons. Depuis, les sprints ont ajouté des appels. **Drapeau rouge** : un total
au-delà de ~20 s, ou un appel qui expire. ⚠️ Me dire aussi **ce que vous voyez à l'écran pendant**
ce temps : des squelettes de chargement, ou une page vide ?

### 6. Les numéros d'arrêté, et s'ils résolvent
**Où** : chapitre 2, déplier « Ce qui est réellement restreint en crise ».
**Capturer** : la liste des usages avec les lignes « Arrêté … » sous chacun.

**Ce que je vérifie** : la table d'arrêtés livrée au sprint 44 (+4,5 % de poids de page mesuré).
**Drapeau rouge** : des mentions **« id 1234 »** au lieu d'un numéro d'arrêté — ça voudrait dire que
la table n'est pas dans le shard du département affiché, et toute la traçabilité « référence
citable » tombe. C'est l'arbitrage que vous avez tranché : autant savoir s'il tient.

### 7. Les deux nouveaux champs, sur téléphone
**Où** : **sur un vrai téléphone** (ou devtools à 390 px). Ouvrir « Données internes du site ».
Choisir « Réponse de la production » = **Par paliers**. Descendre jusqu'à « Répartition mensuelle du
volume ».
**Capturer** : deux images — (a) la ligne avec « Nombre de paliers » visible, (b) la grille des
**douze mois**.

**Ce que je vérifie** : `paliers` et `profilMensuel` sont neufs et n'ont été vus que par Playwright.
**Drapeau rouge** : un débordement horizontal (la page défile latéralement), des champs mensuels trop
étroits pour lire leur valeur, ou le libellé du mois illisible. ⚠️ Un dépassement de 390 px a déjà
été livré une fois par un `<select>` trop large.

### 8. Le rapport ESG exporté, avec sa note méthodologique
**Où** : fiche site → « Télécharger le rapport ». Ouvrir le fichier.
**Capturer** : la section **« Limites connues »** de la note méthodologique, en entier.

**Ce que je vérifie** : trois limites y ont été ajoutées cette semaine, dont **le fait que le modèle
ne prévoit pas le déclenchement d'une restriction** (mesuré : perdant dans les 100 départements).
**Drapeau rouge** : ces paragraphes absents, ou le **+0,69 de Brier cité sans le −1,16** à côté. Le
publier seul serait mensonger, et c'est la chose que je surveille le plus dans ce document.

---

## Tier 3 — des choses neuves que personne n'a vues

### 9. La saisonnalité mesurée, sur la page méthodologie
**Où** : `/methodologie` → section « Anticipation des restrictions ».
**Capturer** : l'encadré ambre « Portée de la saisonnalité mesurée » **et** le paragraphe « Mesuré
sur l'archive réelle des arrêtés » juste en dessous.

**Ce que je vérifie** : que les chiffres s'affichent (**0,01 % en janvier → 1,479 % en juillet,
facteur 148**) et que **l'espacement est correct**. Un espace manquant après un `<strong>` a déjà été
trouvé ici (« Mesurésur »). **Drapeau rouge** : deux mots collés, ou le caveat de portée placé
**après** la méthode plutôt qu'avant.

### 10. Un chemin dégradé réel
**Où** : une adresse **hors zone couverte** (une commune sans zone d'alerte VigiEau, ou un point en
mer via un lien profond `/?lat=43.0&lon=5.5&label=Test`), **et** si vous en croisez une, une fiche
où un bloc affiche une panne de source.
**Capturer** : le message affiché, en entier.

**Ce que je vérifie** : la règle centrale du dépôt — **une donnée absente n'est jamais un zéro**.
**Drapeau rouge** : un **0 jour**, un **0 m³** ou un score affiché comme un résultat là où la vraie
réponse est « on ne sait pas », ou un site hors périmètre présenté comme **sans risque** plutôt que
comme **non couvert**.

### 11. Les bassins versants, sur un vrai fond de tuiles *(ajout Sprint 52)*
**Où** : `/carte`, deux captures — la vue France telle qu'elle s'ouvre, puis après une recherche
d'adresse (n'importe laquelle), une fois zoomé.
**Capturer** : la carte entière, et si possible une popup ouverte en cliquant **entre** les rivières
et les points, sur un endroit vide.

⚠️ **Le geste le plus utile de toute la liste, et il coûte deux secondes** : cliquez **deux fois de
suite** à deux endroits différents de la carte, sans refermer la bulle entre les deux. La seconde
bulle doit s'ouvrir sur le nouvel endroit. Jusqu'au Sprint 53, elle disparaissait — un clic sur deux
ne montrait rien — et aucun test ne pouvait le voir parce qu'aucun ne cliquait deux fois. Si le
comportement est revenu, c'est le premier drapeau rouge à me signaler.

**Ce que je vérifie** : c'est la seule chose que le bac à sable ne peut pas juger. Les couches ont
été dessinées **sur fond blanc** — le fond raster est injoignable ici — donc l'ocre des lignes de
partage des eaux et l'ardoise en tirets des grands bassins n'ont **jamais** été vus sur des tuiles
grises. Je vérifie aussi que chaque grand bassin porte son nom **une seule fois** (SEINE-NORMANDIE,
LOIRE-BRETAGNE…) et que la popup empile bien, dans cet ordre : nappe, bassin versant, agence de
l'eau.
**Drapeaux rouges** : un nom de grand bassin écrit **plusieurs fois** ; des contours de bassins
versants si nombreux qu'ils hachurent la France en vue nationale (le seuil de 250 km² serait alors à
relever) ; des contours **invisibles** sur les tuiles ; une popup qui **déborde** du cadre de la
carte sur téléphone ; ou « Contours indisponibles : bassins versants » en bas à droite — ce dernier
signifierait que `outputFileTracingIncludes` n'a pas embarqué le fichier, la seule erreur de cette
session qui ne peut se manifester qu'en production.

---

## Ce qui m'aide le plus, en dehors des images

- **L'URL exacte** de chaque capture (les paramètres du lien profond comptent).
- **Le département** du site, quand ce n'est pas visible à l'écran.
- Pour la nᵗᵉ 1 : **les usages exacts que vous avez tapés**, mot pour mot. L'appariement dépend
  entièrement du libellé, et « refroidissement » ne se comporte pas comme « eau de refroidissement ».
- **Tout ce qui vous a surpris**, même sans rapport avec la liste. Treize sessions de bouchons : la
  chose la plus probable est un défaut auquel je n'ai pas pensé, donc qui n'est pas dans cette liste.

⚠️ **Si une seule capture est possible** : la nᵗᵉ 1. C'est la fonctionnalité la plus récente, celle
dont la suite de tests a déjà révélé trois défauts réels au premier lancement, et la seule dont le
résultat dépend de libellés d'arrêtés que je n'ai jamais lus.
