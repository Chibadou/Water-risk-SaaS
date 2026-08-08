<!--
  Pièce de référence versée au dépôt le 2026-08-08. Contenu VERBATIM du fichier fourni par
  l'utilisateur : ne pas reformuler, ne pas corriger, ne pas compléter. Toute divergence entre
  ce document et le code se consigne dans ANALYSE-ECART-NOTE-TECHNIQUE.md, jamais ici.
-->

> **Provenance.** Fichier reçu de l'utilisateur le **2026-08-08**, version **1.0**, statut
> « cadrage validé ». Recopié **verbatim** — c'est une pièce de référence, pas un document vivant
> (contrairement au [HANDBOOK](./HANDBOOK.md)).
>
> **Autorité.** En cas de contradiction avec [`PLAN.md`](./PLAN.md) sur les **indicateurs de sortie**
> ou sur la méthode, **cette note prime**. `PLAN.md` décrit le produit tel qu'il a été construit
> jusqu'au Sprint 37 ; cette note décrit celui qu'il doit devenir.
>
> **Où en est le code par rapport à cette note** :
> [`ANALYSE-ECART-NOTE-TECHNIQUE.md`](./ANALYSE-ECART-NOTE-TECHNIQUE.md) — verdict par ADR, par
> indicateur et par anti-pattern, avec les chemins de fichiers. La roadmap qui en découle est en fin
> de [`SPRINTS.md`](./SPRINTS.md).

---

# HydroVigie — Note technique de conception

**Destinataire :** Claude Code
**Objet :** spécification fonctionnelle et méthodologique du moteur de risque hydrique quantitatif
**Statut :** cadrage validé, à implémenter par chantiers séquencés
**Version :** 1.0

---

## 0. Objet et périmètre

### 0.1 Ce que fait le produit

Permettre à une **direction RSE groupe** d'évaluer, pour un portefeuille de sites, l'exposition aux restrictions quantitatives d'usage de l'eau : aujourd'hui, en probabilité, et à horizon 2050.

Trois indicateurs de sortie, et trois seulement :

| Code | Indicateur | Unité |
|---|---|---|
| **JS** | Jours passés sous statut de restriction | jours/an, par niveau et par ressource |
| **VNP** | Volume non prélevable | m³/an |
| **IA** | Interruption d'activité (complète ou partielle) | jours-équivalents d'arrêt (JEA), puis € |

Trois niveaux de preuve, étiquetés comme tels dans toute sortie :

| Niveau | Nature | Statut |
|---|---|---|
| **N1** | Constaté 2012 → aujourd'hui | livrable **interne** (jeu de calibration et de backtest), non commercialisé |
| **N2** | Calibré, climat actuel, probabiliste | cœur du produit |
| **N3** | Scénarisé 2050 (narratifs TRACC) | cœur du produit |

### 0.2 Ce qui est hors périmètre

- La qualité de l'eau. Périmètre strictement quantitatif.
- Le secteur de l'énergie (thermique, hydroélectricité). Régime réglementaire distinct — débit réservé L.214-18, limites de rejet thermique dans l'arrêté d'autorisation, dérogations liées à la sécurité d'approvisionnement. Le moteur général y donnerait des résultats faux. Module ultérieur ou exclusion assumée.
- L'agriculture. Régime propre (tours d'eau, organismes uniques de gestion collective), acheteur différent.
- La monétisation automatique. Le produit calcule des JEA ; la conversion en euros utilise une marge sur coûts variables **fournie par le client**, jamais estimée par l'outil.

### 0.3 Périmètre géographique

**France en v1. Architecture multi-juridictions dès la conception** (voir ADR-002).

---

## 1. Décisions d'architecture (ADR)

### ADR-001 — Le modèle de données est centré sur l'usage, pas sur le site ni sur le secteur

Les arrêtés ne restreignent pas des entreprises, ils restreignent des usages de l'eau. La table pivot est :

```
(zone_alerte × niveau_gravité × usage) → mesure_typée
```

Un site est décrit comme un **vecteur d'usages pondérés en volume**. Cette structure sert indifféremment l'industriel, le tertiaire et le raccordé AEP, avec un seul moteur.

*Conséquence :* ne jamais introduire de branche `if secteur == "industrie"` dans le moteur de calcul. La différenciation sectorielle vit exclusivement dans le profil d'usages du site.

### ADR-002 — Séparation stricte entre noyau universel et couche juridictionnelle

| Universel (noyau) | Spécifique à la juridiction (plugin) |
|---|---|
| Typologie ρ des mesures | Géométrie du zonage |
| Formules VNP, JS, IA | Nomenclature et nombre de niveaux |
| Fonction de réponse du site | Texte des mesures et sa normalisation |
| Statistiques de durée d'épisode | Indicateurs hydrologiques et sources de données |
| Modèle N2 (forme) | Ensemble de projections utilisé pour N3 |
| Classement de portefeuille | Cadence de déclaration des niveaux |

**Implémenter deux juridictions dès la v1 : `FR` complète, et `ES` en squelette minimal.** Sans une seconde juridiction réelle, l'abstraction sera fictive et le refactoring ultérieur coûteux.

L'Espagne est le second candidat naturel : les *planes especiales de sequía* définissent, pour l'escasez, quatre scénarios de gravité progressive — normalidad, prealerta, alerta, emergencia — déterminés par des indicateurs quantitatifs propres à chaque unité territoriale. Attention à une différence structurante : la France produit des **arrêtés événementiels** avec dates de début et de fin, l'Espagne une **déclaration mensuelle d'état par unité**. Le noyau doit donc manipuler des *séries temporelles d'état par zone* à cadence variable, et non des enregistrements d'arrêtés.

### ADR-003 — Le rattachement adresse → zones est le chantier n°1

C'est la première source d'erreur de tout l'édifice. Une erreur ici invalide toute sortie en aval, quel que soit le raffinement du modèle.

Règles :
- Un site est rattaché à **plusieurs** zones simultanément : superficielle (SUP), souterraine (SOU), réseau d'eau potable (AEP). Ces découpages ne coïncident pas.
- Une commune peut chevaucher plusieurs zones. Le rattachement au code INSEE seul est insuffisant — il faut la géométrie.
- **Ne jamais prendre le maximum des niveaux.** Un site prélevant 95 % en AEP et 5 % en rivière n'est pas « en crise » parce que la rivière l'est. Restituer le vecteur par ressource, plus un niveau effectif pondéré par la part volumique.
- Toute imprécision de géocodage doit être remontée dans l'interface, jamais silencieuse. Prévoir un état `rattachement_ambigu` avec liste des zones candidates.

### ADR-004 — Le classement est un livrable de plus haute confiance que les valeurs absolues

Les erreurs sur ρ, sur le volume de référence et sur le taux de conformité sont en grande partie **communes à tous les sites** et s'annulent dans un ordonnancement relatif.

Toute sortie porte donc un niveau de confiance explicite :

| Sortie | Confiance |
|---|---|
| Classement des sites du portefeuille | haute |
| Magnitude (m³, jours) | moyenne |
| Conversion en euros | basse |

*Conséquence produit :* le classement de portefeuille est livrable bien avant que les m³ absolus ne soient défendables. Ne pas conditionner la mise sur le marché à la précision des valeurs absolues.

### ADR-005 — v1 avec κ = 1, hypothèse prudentielle documentée

κ est le taux de conformité effectif : l'écart entre la réduction nominale imposée et la réduction réellement constatée. Il n'est pas estimé en v1. Le VNP livré est le **VNP nominal**, présenté explicitement comme hypothèse conservatrice.

Justification : ces chiffres passeront devant un organisme tiers indépendant en assurance limitée. Un vérificateur accepte une hypothèse conservatrice déclarée ; il rejettera un coefficient empirique mal identifié.

Le module κ part en chantier de recherche parallèle (voir §7).

### ADR-006 — Auditabilité comme fonctionnalité de premier rang

Non négociable, à câbler dès le socle et non ajouté après coup :

- Traçabilité de chaque nombre jusqu'au PDF d'arrêté source, avec son identifiant et sa date de validité.
- Versionnement gelé et daté du modèle. Un rapport produit le 15 mars doit être reproductible à l'identique deux ans plus tard.
- Journal des hypothèses par calcul (valeur de ρ retenue, profil de charge appliqué, volume de référence utilisé et son origine).
- Note méthodologique exportable, générée automatiquement, jointe à tout export.

---

## 2. Modèle de données

### 2.1 Entités du noyau

```
Jurisdiction
  code                 # FR, ES
  severity_levels[]    # ordonnés, nommés, avec rang entier
  state_cadence        # event_driven | monthly

Zone
  jurisdiction_code
  external_id          # code SANDRE pour FR
  name
  resource_type        # SUP | SOU | AEP
  geometry             # multipolygone
  valid_from / valid_to    # le zonage évolue, versionner

ZoneState                # série temporelle d'état
  zone_id
  date_start / date_end
  severity_rank
  source_document_id

SourceDocument
  jurisdiction_code
  type                 # arrete_restriction | arrete_cadre | plan_sequia
  url_pdf
  hash
  fetched_at

Measure                  # LE cœur normalisé — voir §3
  source_document_id
  zone_id
  severity_rank
  usage_code
  rho_type
  rho_value_min / rho_value_max
  raw_text                 # conservé intégralement pour audit
  normalization_method     # llm | manual | rule
  normalization_confidence

UsageReference           # nomenclature cible
  code
  label
  jurisdiction_code
  maps_to_universal_code
```

### 2.2 Entités site et portefeuille

```
Portfolio
  client_id
  name

Site
  portfolio_id
  address_raw
  lat / lon
  geocoding_confidence
  zone_links[]             # SUP, SOU, AEP + statut ambigu éventuel
  icpe_regime              # A | E | D | non_icpe
  icpe_rubriques[]
  iota_rubriques[]
  annual_withdrawal_m3
  restitution_rate         # part rejetée dans la même masse d'eau — critique
  response_type            # linear | threshold | stepwise
  buffer_capacity_m3
  buffer_recharge_rate
  min_technical_threshold  # sous ce volume, arrêt total

SiteUsage
  site_id
  usage_code
  annual_volume_m3
  source_type              # SUP | SOU | AEP
  load_profile             # profil horaire, pour les mesures à plage horaire
  is_exempt                # sécurité, incendie, environnement, santé publique
  is_process_critical
```

---

## 3. Typologie ρ — la normalisation des mesures

**C'est l'actif du produit.** Le modèle statistique est reproductible ; cette base ne l'est pas.

### 3.1 Types

| `rho_type` | ρ | Note |
|---|---|---|
| `percentage` | valeur déclarée | 5 / 10 / 25 % pour l'arrêté ICPE du 30 juin 2023 |
| `total_ban` | 1 | sur le volume de l'usage concerné |
| `time_window` | part du volume journalier dans la fenêtre interdite | nécessite `load_profile` — hypothèse à journaliser |
| `rotation` | 1 − 1/n | tours d'eau, jours alternés |
| `unquantified` | **intervalle [0, ρ_max]** | « limiter au strict nécessaire » |
| `recommendation` | 0 | compté dans un compteur séparé « jours sous mesure non contraignante » |
| `reporting_only` | 0 | déclaration hebdomadaire obligatoire — pas de réduction, mais charge de conformité |

### 3.2 Règle absolue

`unquantified` représente une part importante des mesures. **Ne jamais lui imputer une valeur ponctuelle silencieusement.** L'intervalle se propage jusqu'à la sortie, qui devient une fourchette. C'est le résultat honnête, et c'est ce qui rendra le produit défendable en revue.

### 3.3 Méthode de normalisation

1. Cible : la nomenclature du Guide Sécheresse, publiée dans le jeu de données VigiEau sous forme de restrictions préconisées. Ne pas inventer de taxonomie.
2. Extraction LLM sur le texte des arrêtés, en sortie structurée contrainte au schéma `Measure`.
3. Validation humaine sur un **échantillon stratifié** par département, niveau et thématique d'usage.
4. Mesurer et publier le **taux d'accord** entre extraction automatique et validation humaine. C'est un chiffre que l'auditeur demandera.
5. Conserver `raw_text` intégralement. Toute normalisation doit être réversible et inspectable.

---

## 4. Moteur de calcul

### 4.1 Jours sous statut (JS)

Par site, par an, par type de ressource et par niveau. Plus un niveau effectif pondéré par les parts volumiques.

**Avertissement à porter dans l'interface :** JS est l'indicateur le moins durable des trois. La nomenclature des niveaux a déjà changé en 2021 et changera d'ici 2050. C'est un indicateur intermédiaire, pas un titre. VNP et IA sont en unités physiques, donc invariants au cadre réglementaire.

### 4.2 Volume non prélevable (VNP)

```
VNP_site = Σ_jours Σ_usages  ρ(usage, niveau, zone) × (V_ref(usage) − V_exempt(usage))
```

Trois exigences :

**a) Le volume de référence est réglementaire, pas libre.** L'arrêté ICPE du 30 juin 2023, modifié le 3 juillet 2024, en donne la définition. Implémenter cette définition, avec possibilité de surcharge par le V_ref déclaré du site. Une moyenne calculée maison créera un désaccord avec la DREAL et détruira la confiance du client.

**b) Déduire le volume exemptable** : sécurité et intégrité des installations, défense incendie, exigences de protection de l'environnement, santé publique et animale, salubrité, alimentation en eau potable de la population.

**c) Prélèvement ou consommation.** Lorsque prélèvement et rejet ont lieu dans la même masse d'eau, la réduction porte sur la **consommation**. Entre un refroidissement en circuit ouvert et un procédé à forte évaporation, le VNP change d'un ordre de grandeur. D'où le champ `restitution_rate`, obligatoire.

**En N3, séparer toujours deux composantes :**

```
VNP_total = VNP_crise + VNP_structurel
```

`VNP_structurel` couvre la réduction des volumes autorisés : PTGE, études de volumes prélevables, trajectoire du Plan Eau. À 2050, cette composante pèsera probablement davantage que les restrictions de crise. Les additionner masquerait le signal dominant. **Ne jamais les agréger dans une sortie unique.**

### 4.3 Interruption d'activité (IA)

La fonction de production n'est pas devinée par le modèle : elle est renseignée par le client.

```
A_t = V_ref − VNP_t + prélèvement_tampon(t)

production_t = f(A_t, response_type, min_technical_threshold)

JEA = Σ_t (1 − production_t / production_nominale)
```

`response_type` commande tout le résultat :

- `linear` — tour aéroréfrigérante, lavage. La production suit le volume.
- `threshold` — fabrication de semi-conducteurs. L'installation tourne ou ne tourne pas ; elle ne fonctionne pas à 60 % d'eau ultra-pure.
- `stepwise` — usine multi-lignes. Arrêt de lignes par paliers.

**Conséquence majeure sur le modèle d'aléa :** dès qu'il existe un tampon, la perte est **convexe en durée d'épisode**. Un modèle qui prédit correctement 40 jours par an mais se trompe sur la structure des épisodes — quarante épisodes d'un jour au lieu de deux de vingt — donnera une perte proche de zéro là où elle est maximale.

La statistique pertinente n'est donc pas le décompte annuel mais **la distribution des durées d'épisode et le maximum de jours consécutifs**. Cela impose la forme du modèle N2.

---

## 5. Modèle N2 — fonction de décision calibrée

### 5.1 Forme

Modèle à **transitions markoviennes** sur les niveaux de gravité, par zone d'alerte, à covariables hydrologiques. Pas un modèle de fréquence annuelle : il ne reproduirait pas la structure d'épisode exigée par §4.3.

Justification physique : les niveaux montent vite et redescendent lentement. L'hystérésis est une propriété du système de décision, pas du bruit.

### 5.2 Approche hybride

- **Règles** là où les seuils sont publics : numériser les annexes des arrêtés-cadres départementaux (seuils de débit type DOE/DCR, seuils piézométriques, correspondance zone → seuil). Travail d'extraction, pas de science — mais personne ne l'a fait proprement.
- **Statistique** là où les seuils sont flous ou discrétionnaires.

### 5.3 Covariables

SPI et SPEI à 1, 3, 6 et 12 mois ; indice d'humidité des sols (SIM2) ; indice de débit standardisé (Hydroportail) ; indice piézométrique standardisé (ADES / BRGM). Ce sont les variables que les comités sécheresse examinent réellement.

### 5.4 Contraintes d'estimation

- Effets aléatoires par département — l'hétérogénéité préfectorale est documentée et doit être modélisée, pas lissée.
- Variable de régime pré/post-2021 : la hausse du nombre d'arrêtés mélange signal climatique et durcissement de doctrine (décret 2021-795, instruction du 16 mai 2023, arrêté ICPE 2023). Extrapoler la série brute attribuerait au climat ce qui vient de la réglementation.
- **Monotonie** des probabilités de transition en fonction de l'indice hydrologique.
- **Asymétrie** montée/descente autorisée.
- Sans ces deux contraintes, les zones à faible historique produiront des ajustements aberrants.
- Mutualisation hiérarchique pour les zones n'ayant jamais connu de crise. Drapeau `données_insuffisantes` plutôt qu'extrapolation.

### 5.5 Validation

**Valider sur la métrique finale, pas sur l'intermédiaire.** Backtester le niveau d'alerte ne prouve rien sur le VNP ni sur les JEA.

- Backtest hors échantillon sur 2022 et 2023 après calibration sur 2012-2021.
- Validation croisée *leave-one-year-out* **et** *leave-one-department-out*. La seconde teste la transférabilité géographique, qui est le vrai risque produit.
- Score de Brier et diagrammes de fiabilité par niveau, contre un baseline climatologique. Publier la calibration, pas seulement la discrimination.
- Comparer explicitement la **distribution simulée des durées d'épisode** à l'observée, par zone.
- Trois à cinq sites pilotes fournissant leurs données réelles 2022-2023, pour reconstituer prédiction contre réalité. Commercialement, cinq sites documentés valent plus que n'importe quelle élégance statistique.

---

## 6. Modèle N3 — projection 2050

### 6.1 Source

Explore2 / DRIAS-Eau, unique référence nationale acceptable. Neuf modèles d'hydrologie de surface, forçages ADAMONT et CDF-t, plus AquiFR, MONA et un modèle de recharge pour les eaux souterraines.

Utiliser les **narraTRACC** : fiches par niveau de réchauffement de la TRACC sur 187 secteurs hydrographiques, horizons 2050 et 2100. S'aligner sur la TRACC plutôt que sur les RCP bruts met le produit en cohérence avec la doctrine française d'adaptation — argument commercial autant que méthodologique auprès d'une direction RSE.

### 6.2 Deux axes de scénario, pas un

```
narratif hydro-climatique  ×  scénario de politique publique
```

Le second axe est indispensable : une trajectoire de réduction des volumes autorisés modifie V_ref lui-même, indépendamment du climat.

### 6.3 Restitution

- **Jamais de moyenne d'ensemble.** Quantiles et narratifs.
- Convention de prudence explicite et étiquetée : médiane pour le reporting, quantile haut pour dimensionner un investissement de stockage. Jamais un chiffre nu.
- Les fourchettes larges ne sont pas un défaut : les ESRS admettent une restitution qualitative ou en fourchette lorsque la quantification est fortement incertaine. Ce qui serait rédhibitoire, c'est un chiffre unique non traçable.

### 6.4 Décomposition de variance — livrable à part entière

Décomposer et publier la contribution des trois sources d'incertitude :

1. hydro-climatique (dispersion de l'ensemble Explore2)
2. décisionnelle (fonction de réponse préfectorale)
3. traductionnelle (typage ρ, κ, fonction de réponse du site)

Hypothèse à tester : à 2050 et à l'échelle du site, les termes 2 et 3 dominent le terme 1. Si elle se vérifie, cela signifie qu'investir dans de meilleures projections climatiques est du gaspillage face à un meilleur typage des arrêtés. C'est une information de pilotage produit autant que de méthode.

---

## 7. Chantier de recherche parallèle — coefficient κ

Hors v1. À instruire en parallèle.

**Question :** les restrictions réduisent-elles réellement les prélèvements ?

**Données mobilisables :** la BNPE publie les volumes prélevés déclarés par point depuis 2012 ; l'arrêté ICPE impose une déclaration hebdomadaire des volumes en alerte renforcée et crise.

**Approche :** panel sur la BNPE, intensité de traitement = jours pondérés sous statut, effets fixes point et année.

**Honnêteté sur l'identification :** la BNPE est annuelle, avec environ deux ans de latence et une qualité inégale. C'est un exercice d'encadrement, pas une inférence causale propre. Publier avec intervalles et limites explicites.

**Valeur :** l'écart entre VNP nominal et VNP effectif est une information que personne ne vend, et un argument de version ultérieure au moment où la couche visible sera copiée.

---

## 8. Séquencement et critères d'acceptation

### Chantier 1 — Socle

| Livrable | Critère d'acceptation |
|---|---|
| Géocodage et rattachement multi-zones | ≥ 98 % des adresses d'un jeu de test rattachées sans ambiguïté ; les ambiguïtés restantes explicitement signalées, jamais résolues silencieusement |
| Normalisation typée des mesures | taux d'accord avec validation humaine mesuré et publié sur échantillon stratifié |
| Profil hydrique du site | formulaire couvrant tous les champs de §2.2, avec valeurs par défaut sectorielles clairement marquées comme hypothèses |
| Couche d'auditabilité | tout nombre affiché est traçable jusqu'au PDF source en un clic |

### Chantier 2 — N1 interne

Reconstruction historique 2012 → aujourd'hui des séries d'état par zone, et du VNP nominal par usage.

*Critère :* les séries reconstituées reproduisent les épisodes documentés de 2022 et 2023 sans lacune non signalée. Toute discontinuité d'archive est étiquetée, jamais interpolée.

### Chantier 3 — N2

*Critère :* le modèle bat un baseline climatologique en score de Brier sur la validation *leave-one-department-out*, **et** reproduit la distribution observée des durées d'épisode.

Si le second critère échoue, ne pas livrer IA — livrer JS et VNP seuls.

### Chantier 4 — N3

*Critère :* décomposition de variance produite et documentée. Aucune sortie N3 n'est publiée sans son intervalle et son étiquette de scénario.

### Chantier 5 — Portefeuille

Import par lot d'un fichier de 50 à 500 adresses, classement avec seuil de matérialité, export avec note méthodologique.

L'interface mono-adresse actuelle est une démonstration, pas le produit.

---

## 9. Anti-patterns — à ne pas faire

1. **Prendre le maximum des niveaux** entre zones SUP, SOU et AEP pour qualifier un site.
2. **Imputer une valeur ponctuelle** à une mesure non quantifiée.
3. **Agréger VNP de crise et VNP structurel** dans un chiffre unique.
4. **Publier une moyenne d'ensemble** sur les projections.
5. **Brancher le moteur sur le secteur d'activité** au lieu du profil d'usages.
6. **Valider sur le niveau d'alerte** et en déduire que le VNP est validé.
7. **Ajouter l'auditabilité après coup.** Elle doit être structurelle.
8. **Interpoler les lacunes d'archive** au lieu de les signaler.
9. **Coder en dur la nomenclature à quatre niveaux française** dans le noyau.
10. **Estimer une perte financière** sans marge fournie par le client.

---

## 10. Sources de données

| Source | Usage | Accès |
|---|---|---|
| API VigiEau | niveaux, arrêtés, usages restreints par adresse et profil | api.vigieau.gouv.fr — paramètres `profil` et `zoneType` |
| VigiEau open data (data.gouv.fr) | historique, restrictions préconisées du Guide Sécheresse | jeux « Donnée Sécheresse » et « Arrêtés sécheresse en vigueur » |
| SANDRE | géométries et référentiel des zones d'alerte | API dédiée |
| API Adresse | géocodage | recommandée par la doc VigiEau |
| Hydroportail | débits observés, indices standardisés | — |
| ADES / BRGM | piézométrie | — |
| SIM2 / Météo-France | humidité des sols, SPI, SPEI | — |
| DRIAS-Eau (Explore2) | projections hydrologiques, narraTRACC | drias-eau.fr |
| BNPE | volumes prélevés déclarés | chantier κ uniquement |
| SISPEA | fragilité du service AEP (rendement, pertes, interconnexions) | à instruire — voir §11 |

---

## 11. Questions ouvertes

1. **Second aléa AEP.** Pour un site raccordé, la probabilité de rupture réelle dépend autant de la fragilité structurelle du service que du niveau d'alerte de la zone. Intégrer SISPEA en v1 ou en v2 ? Aucun concurrent ne croise zone d'alerte et fragilité du service à l'adresse.
2. **Horizons temporels.** Aligner sur les horizons court / moyen / long définis par le client pour la CSRD, ou imposer 2030 / 2050 ? Recommandation : les deux, avec correspondance explicite.
3. **Articulation hors France avant l'extension.** Positionner Aqueduct ou WWF Water Risk Filter en couverture complémentaire du reste du portefeuille, en attendant la seconde juridiction.
4. **Profils de charge par défaut** pour les mesures à plage horaire : construire une bibliothèque sectorielle, ou exiger la saisie client ?
