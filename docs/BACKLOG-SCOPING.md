# Cadrage des deux chantiers de fond restants

> Deux items du backlog sont **bloqués par la donnée**, pas par l'effort de code.
> Ce document cadre ce qu'il faudrait réellement pour chacun : donnée nécessaire,
> approche, spike de dé-risquage, effort, et critère d'acceptation.
> Ce qui a été **vérifié pendant la session** est marqué ✅ ; ce qui reste à
> confirmer par un spike runner est marqué ❓.

Rappel du contexte technique : le bac à sable de dev n'a **pas d'egress** vers
les hôtes open-data → toute vérification passe par le runner GitHub Actions
(`scripts/diag/prod-diag.sh`, modes `hubeau`/`bnpe`/…). Le produit reste
**100 % local** (pas de base, pas de compte) : toute donnée lourde est
pré-extraite hors-ligne et embarquée en shards (comme les projections 2050).

---

## Chantier A — BNPE dans le score (ratio prélèvements / ressource)

### Objectif
Une composante « pression prélèvements » **défendable** dans le score 0-100 :
un ratio *prélèvements / ressource renouvelable* à l'échelle du **sous-bassin**
(logique « baseline water stress » d'Aqueduct), et non un volume brut ou une
intensité par commune (qui mesurent l'exploitation du territoire, pas le stress).

### Pourquoi c'est bloqué aujourd'hui
- ✅ La chronique BNPE (`/v1/prelevements/chroniques`) **n'a pas de champ
  milieu** (surface vs souterrain) → impossible d'isoler les prélèvements de
  surface pour les comparer au débit.
- La maille **commune ≠ bassin** → un volume communal n'a pas de dénominateur
  ressource cohérent.
- ❓ Aucun **dénominateur « ressource renouvelable par sous-bassin »** identifié
  en open data uniforme (c'est le vrai point dur).

### Donnée nécessaire & sources candidates
1. **Polygones de sous-bassins** — BD Topage / zones hydrographiques (Sandre).
   Bulk ou WFS. ❓ Vérifier l'accès et la maille (zone hydro ≈ 5 000 unités,
   sinon SAGE / secteur hydro).
2. **Prélèvements géolocalisés par milieu** — le **référentiel ouvrages** BNPE
   (`/v1/prelevements/referentiel/ouvrages`) porte a priori la géométrie et le
   milieu/`code_bdlisa` de l'ouvrage (❓ à confirmer : le champ milieu absent de
   la *chronique* est probablement présent sur l'*ouvrage*). On joint alors les
   volumes (chronique, par `code_ouvrage`) aux ouvrages (milieu + position).
3. **Ressource renouvelable par sous-bassin** — le point dur. Pistes :
   - module (débit moyen interannuel) agrégé à l'exutoire du sous-bassin depuis
     l'hydrométrie de référence (Hydroportail / `obs_elab` — ✅ le module est
     calculable, on le fait déjà pour VCN10/QMNA5) ;
   - recharge de nappe (volet souterrain) — ❓ pas de source uniforme évidente ;
   - bilans quantitatifs SDAGE / agences de l'eau — ❓ non normalisés, pas d'API.

### Approche (phasée)
- **Spike de dé-risquage (1 run runner)** — le seul but : lever les ❓.
  Confirmer (a) le champ milieu sur le référentiel ouvrages BNPE, (b) l'accès
  aux polygones BD Topage, (c) une source de ressource renouvelable par
  sous-bassin exploitable. **Sans (c), le chantier reste bloqué** → on s'arrête
  et on documente, plutôt que de forcer un score trompeur.
- **Batch d'extraction (hors-ligne, runner)** — si le spike est vert :
  ouvrages BNPE (milieu, géométrie, volumes) → point-in-polygon dans les
  sous-bassins → somme des prélèvements par sous-bassin **et par milieu** ;
  ressource par sous-bassin ; ratio de stress (surface / souterrain séparés) →
  `data/waterstress/` (shards par département, comme les projections).
- **Runtime** — rattacher le site au sous-bassin (crosswalk commune→sous-bassin,
  ou point-in-polygon sur polygones simplifiés embarqués) → lire le ratio →
  composante de score (poids modeste, ~8-10 %, renormalisé), avec la même
  discipline « inconnu = absent, jamais 0 ».

### Effort / risque
**Large. Risque élevé**, concentré sur le dénominateur ressource (point 3). Le
reste (BNPE géoloc + BD Topage + point-in-polygon + shards) est du connu.
→ **Faire le spike d'abord** ; ne pas s'engager sur le batch tant que la
ressource renouvelable par sous-bassin n'est pas trouvée.

### Critère d'acceptation
La fiche site montre une composante « pression prélèvements » = ratio
prélèvements/ressource du sous-bassin, avec sa source et son millésime,
cohérente entre deux sites de tension connue différente (ex. Beauce vs bassin
peu sollicité). Méthodologie mise à jour (échelle, milieu, incertitude).

---

## Chantier B — Rattachement automatique site → aquifère (BDLISA)

### Objectif
Quand plusieurs piézomètres sont proches, préférer par défaut celui qui mesure
**l'aquifère réellement sous le site**, au lieu du plus proche — et qualifier la
confiance par « même aquifère » plutôt que par la seule distance.

### Pourquoi c'est bloqué aujourd'hui
Il manque **l'aquifère au point du site**. Aujourd'hui on affiche le
`code_bdlisa` de chaque station candidate (✅ livré) pour un choix *manuel*,
mais on ne connaît pas l'aquifère du site pour automatiser.

### Donnée nécessaire & sources candidates
1. **Site → entité(s) BDLISA au point** — BDLISA (BRGM). ❓ Vérifier un service
   point→entité : WFS/WMS `GetFeatureInfo` BDLISA via Géoplateforme ou
   Sandre/BRGM (InfoTerre). Subtilité : BDLISA est **multi-couches** (ordre 1
   régional → 3 local) ; un point renvoie une **pile** d'entités → il faut
   choisir la couche pertinente (la plus locale/aquifère libre en général).
2. **Codes aquifères des stations** — ✅ déjà disponibles : Hub'Eau piézo
   `codes_bdlisa` (vérifié : `107AA`, `221AC01`, …). Le rapprochement est donc
   direct une fois l'aquifère du site connu.

### Approche
- **Spike (1 run runner)** — confirmer un endpoint point→BDLISA, sa réponse, et
  que les codes renvoyés sont **comparables** aux `codes_bdlisa` de Hub'Eau
  (même référentiel, même granularité). C'est le seul vrai risque.
- **Implémentation** (si spike vert) — nouveau `lib/bdlisa.ts` : `aquiferAt(lat,
  lon)` → liste de codes ordonnée par couche. Dans `piezoIndicators`, biaiser la
  sélection par défaut : parmi les stations *disponibles*, préférer celles dont
  `codes_bdlisa` recoupe l'aquifère du site (couche la plus locale d'abord),
  sinon repli distance actuel. Cache 30 j (l'aquifère d'un point ne bouge pas).
- **Confiance** — enrichir l'indicateur : « même aquifère » / « même système,
  autre couche » / « distance seule ».

### Effort / risque
**Moyen. Risque moyen** (uniquement l'endpoint BDLISA + la gestion multi-couches).
Le matching lui-même est simple car les stations portent déjà `codes_bdlisa`.
Bénéfice net : une sélection hydrogéologiquement juste, pas seulement la plus
proche — la limite documentée depuis le Sprint 3.

### Critère d'acceptation
Sur un site où le piézomètre le plus proche capte une autre nappe que le site,
l'app sélectionne par défaut une station du **bon aquifère** (même si un peu plus
loin), et l'indicateur de confiance le reflète. Repli distance propre quand
BDLISA ne renvoie rien.

---

## Ordre recommandé
1. **Chantier B d'abord** — plus petit, risque plus circonscrit, forte valeur
   (fiabilise tout le volet nappe/IPS). Un seul spike le dé-risque.
2. **Chantier A ensuite** — commencer par le spike « ressource par sous-bassin » ;
   n'engager le batch que s'il est concluant. Sinon, rester sur le bloc BNPE
   informatif actuel (intensité par habitant / km²) et re-documenter.

Dans les deux cas : **spike de donnée d'abord, code ensuite** — c'est la donnée
qui décide de la faisabilité, pas l'inverse.
