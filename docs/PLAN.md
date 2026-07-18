# Plan technique & produit — SaaS de suivi du risque hydrique (volet QUANTITÉ) à maille fine, France

> Cadrage : risques **quantité uniquement** (consommation, prélèvements, disponibilité) · analyse par **sites & adresses précis** · cas d'usage **pilotage opérationnel** · exigence : **projection(s) 2050 de la disponibilité en eau par site** · implémentation prévue via Claude Code.

## TL;DR

- **Faisable et différenciant** : un outil France centré sur la quantité (stress hydrique, sécheresse, restrictions) à la maille du site est constructible sur trois piliers de données ouvertes matures : l'API **VigiEau** (restrictions/arrêtés en temps quasi réel, maille zone d'alerte), les APIs **Hub'Eau** (hydrométrie, piézométrie, prélèvements BNPE, écoulement Onde) et les référentiels géo (**API Adresse/BAN** pour géocoder, **Sandre** pour les zones d'alerte).
- **Le cœur de la valeur = la maille zone d'alerte sécheresse (ZAS)** croisée avec une adresse géocodée : point-in-polygon sur les zones d'alerte + rattachement aux stations hydro/piézo représentatives. Bien plus fin que la maille bassin d'Aqueduct (HydroSHEDS niv. 6), dont WRI reconnaît la faible pertinence locale.
- **La projection 2050 s'appuie sur Explore2 / DRIAS-Eau** : données statiques multi-modèles (débits, étiages, recharge) par point de simulation, ingestion batch unique → module intégrable dès la **V1**.
- **MVP livrable rapidement** : saisie de sites par adresse → statut de restriction en direct + alertes email, sur un stack Next.js/Vercel + PostGIS (Supabase/Neon). V1 = scoring multi-indicateurs + historique + projections 2050 ; V2 = API clients et plateforme.

---

## A. Sources de données ouvertes françaises (spécifications API)

### A.1 — VigiEau / RegleAU (restrictions sécheresse) — SOURCE PRINCIPALE

**API temps réel** : `GET https://api.vigieau.gouv.fr/api/zones`

- Paramètres : `lon`, `lat` (WGS-84), `commune` (code INSEE), `profil` (`particulier`|`entreprise`|`collectivite`|`exploitation`), `zoneType` (`SUP`|`SOU`|`AEP`).
- Réponse : `id`, `code` (ex. `76_34_0011`), `nom`, `type`, `niveauGravite`, `departement`, objet `arrete` (`dateDebutValidite`, `dateFinValidite`, `cheminFichier` PDF, `cheminFichierArreteCadre`), tableau `usages` (nom, thématique, description, flags `concerneEntreprise`/`concerneCollectivite`…).
- Quatre niveaux de gravité : `vigilance`, `alerte`, `alerte_renforcee`, `crise`. Trois types de zone : `SUP` (eaux superficielles), `SOU` (souterraines), `AEP` (eau potable).
- Erreurs à gérer : **404** (département non couvert / pas de zone), **409** (commune sur plusieurs zones → préciser lon/lat), 500.
- Docs : `https://github.com/MTES-MCT/vigieau-api` · Swagger : `https://api.vigieau.beta.gouv.fr/swagger/`. Mise à jour quotidienne (situation j-1).

**Bulk / réplication locale** — dataset « Donnée Sécheresse - VigiEau » (`https://www.data.gouv.fr/datasets/donnee-secheresse-vigieau`, Licence Ouverte 2.0, MAJ quotidienne en début de matinée) :

- Zones + niveau d'alerte en vigueur (GeoJSON) : `https://www.data.gouv.fr/api/1/datasets/r/bfba7898-aed3-40ec-aa74-abb73b92a363` (source directe : `https://regleau.s3.gra.perf.cloud.ovh.net/geojson/zones_arretes_en_vigueur.geojson`).
- Tuiles vectorielles PMTILES : `https://www.data.gouv.fr/api/1/datasets/r/a101ef59-0999-4b9a-a682-6f9b79d53c7e`.
- Arrêtés année en cours (CSV, ~830 Ko, quotidien) : `https://www.data.gouv.fr/api/1/datasets/r/0732e970-c12c-4e6a-adca-5ac9dbc3fdfa`.
- Restrictions (CSV, ~10-15 Mo) : `https://www.data.gouv.fr/api/1/datasets/r/f425cfa6-ccd1-438e-bb03-9d90ab527851`.
- Dataset complémentaire WFS/WMS (DREAL Bretagne) : `https://www.data.gouv.fr/datasets/vigieau-arretes-secheresse-en-vigueur`.

**Recommandation** : pull quotidien du GeoJSON pour le point-in-polygon local + fallback sur l'API live pour la fraîcheur. Utiliser le pattern de redirection stable `data.gouv.fr/api/1/datasets/r/{id}` plutôt qu'un lien direct fragile.

### A.2 — Hub'Eau (séries physiques)

Base : `https://hubeau.eaufrance.fr/api/`. APIs REST gratuites, sans clé, JSON/GeoJSON/CSV, ~20 req/s garanties, pagination profondeur max 20 000 enregistrements/opération, URL max 2 083 caractères.

**Hydrométrie** (`/v2/hydrometrie/`, docs `hubeau.eaufrance.fr/page/api-hydrometrie`) :

- `referentiel/stations`, `referentiel/sites` — filtres `code_commune_station`, `code_departement`, `bbox`, `distance`+`latitude`/`longitude`.
- `observations_tr` — hauteur (H, mm) et débit (Q, l/s) temps réel, mesures toutes les 5-60 min ; profondeur temps réel ~1 mois ; source PHyC/Vigicrues (Hub'Eau interroge la source toutes les 2 min).
- `obs_elab` — débits moyens journaliers (QmJ) et mensuels (QmM), historique depuis 1900 pour >4 200 stations ; MAJ quotidienne. Réseau : ~5 000-6 000 stations selon la page de doc.

**Piézométrie** (`/v1/niveaux_nappes/`, docs `hubeau.eaufrance.fr/page/api-piezometrie`) :

- `stations`, `chroniques` (historique), `chroniques_tr` (~1 700 piézomètres horaires temps réel).
- Champs clés : `code_bss`/`bss_id`, `niveau_nappe_eau` (NGF), `profondeur_nappe`, `date_mesure`, `timestamp_mesure`, coordonnées, `code_bdlisa` (aquifère). Source ADES (OFB/BRGM), intégration quotidienne.

**Prélèvements en eau / BNPE** (`/v1/prelevements/`, docs `hubeau.eaufrance.fr/page/api-prelevements-eau`) :

- `referentiel/ouvrages`, `referentiel/points_prelevement`, `chroniques` (volumes annuels par ouvrage).
- Granularité : volumes **annuels** rattachés à l'ouvrage ; usage au niveau chronique (nomenclature simplifiée) ; code commune INSEE, `code_bdlisa`, lat/lon. MAJ annuelle. Filtres : `code_ouvrage`, `code_commune_insee`, `annee`, `bbox`, `code_qualification_volume`.

**Écoulement des cours d'eau (Onde)** (`/v1/ecoulement/`, docs `hubeau.eaufrance.fr/page/api-ecoulement`) :

- `stations`, `campagnes`, `observations`. Codes écoulement : 1 (visible), 1a/1f, 2 (pas d'écoulement visible), 3 (assec). >3 200 stations sentinelles en têtes de bassin, observation visuelle estivale (OFB).

**Température des cours d'eau** : disponible, utile en second rang.

### A.3 — Hydroportail (statistiques de référence de débit)

`https://hydro.eaufrance.fr/` — valeurs remarquables par site/station : **module** (débit moyen interannuel), **QMNA5** (débit mensuel minimal annuel de fréquence quinquennale sèche), **VCN10** (débit minimal sur 10 jours consécutifs), débits classés. Sert à normaliser les débits temps réel Hub'Eau contre une référence d'étiage. Package R `{hydroportail}` disponible (QMNA5 = `stat="QMNA"` quantile p=0.2 ; module = moyenne des `QJ_ANNUAL`).

### A.4 — Météo-France / BRGM / contexte

- **SWI (indice d'humidité des sols)** : données mensuelles CatNat sur data.gouv.fr (`donnees-mensuelles-dindice-dhumidite-des-sols-pour-le-dispositif-catnat`), maille SAFRAN 8×8 km, CSV (num maille, X/Y Lambert-93, date, SWI). Modèle SIM/SAFRAN.
- **Bulletin de Situation Hydrologique (BSH)** : mensuel national/bassin (eaufrance.fr) — synthèse pluie/SWI/nappes/débits, contexte narratif.
- **IPS/SPLI (indicateur piézométrique standardisé, BRGM)** : normalise le niveau de nappe en classes (extrêmement bas → extrêmement haut) sur ≥15 ans d'historique ; base du BSH nappes (rapport BRGM RP-67249-FR). **MétéEAU Nappes** (`meteeaunappes.brgm.fr`) : prévisions 6 mois comparées aux seuils sécheresse préfectoraux.

### A.5 — Référentiels géographiques

- **Géocodage (BAN)** : `https://data.geopf.fr/geocodage/search/?q=…` (unitaire) et `/geocodage/batch/` (CSV en POST). 50 req/s/IP, MAJ 2×/semaine. ⚠️ L'ancien `api-adresse.data.gouv.fr` est décommissionné depuis janvier 2026 — ne pas l'utiliser.
- **Découpage administratif** : `https://geo.api.gouv.fr/communes?lat=…&lon=…&format=geojson&geometry=contour` (point → commune INSEE + contour) ; EPCI via SIREN. 50 req/s/IP. Alternative bulk : IGN Admin Express (WFS).
- **Sandre — zones d'alerte (ZAS)** : API référentiel `https://api.sandre.eaufrance.fr/referentiels/v1/` (ex. `zas.json`) ; définition `sandre.eaufrance.fr/definition/ZAS/1`. ⚠️ Le contour ZAS « naturel » (bassin versant) ≠ périmètre d'application réel des restrictions VigiEau (ajusté par arrêté) — pour l'opérationnel, privilégier le GeoJSON VigiEau ; le ZAS Sandre sert de référentiel canonique. MAJ annuelle (printemps).
- **Masses d'eau / BD Topage / zones hydrographiques** : référentiels Sandre (couplage via `code_bdlisa` pour l'aquifère, code masse d'eau pour le superficiel).

---

## B. Méthodologie de scoring de risque eau au site

**Principe** : Aqueduct (WRI, 4.0, 2023) calcule un ratio prélèvements/ressource renouvelable à la maille bassin (HydroSHEDS niv. 6, modèle PCR-GLOBWB, seuil >80 % = « extremely high ») ; le WWF Water Risk Filter combine 42 indicateurs sur HydroBASINS niv. 7. Les deux sont des outils de **screening** explicitement peu applicables au niveau local. **Adaptation France, à la maille ZAS / masse d'eau / sous-bassin :**

Indicateur composite « risque quantité au site » (0-100), pondéré :

1. **Statut réglementaire courant (poids fort)** — niveau VigiEau de la ZAS du site : vigilance = 25, alerte = 50, alerte renforcée = 75, crise = 100.
2. **Fréquence historique des restrictions** — nb de jours/an en alerte+ sur la ZAS (archives arrêtés data.gouv sur 3-5 ans) → proxy de tension structurelle.
3. **État des nappes** — IPS/SPLI du/des piézomètre(s) représentatif(s) (`chroniques_tr` Hub'Eau) vs normales.
4. **État des débits** — débit temps réel (`observations_tr`) rapporté au VCN10 / QMNA5 / DOE-DCR (Hydroportail, SDAGE) ; ratio < 1 = sous seuil de crise. Rappel : le DOE est considéré « satisfait » quand le VCN10 reste > 80 % de sa valeur.
5. **Écoulement Onde** — assecs observés sur stations sentinelles proches.
6. **Pression prélèvements** — volumes BNPE de la commune/sous-bassin rapportés à la ressource (proxy de baseline water stress local).
7. **Tendance climatique** — delta d'étiage projeté 2050 (module Projection, section E).

**Rattachement géographique d'une adresse** :

1. Géocoder (BAN) → lon/lat + code INSEE.
2. Point-in-polygon sur les couches ZAS (GeoJSON VigiEau, PostGIS `ST_Contains`) → zones SUP/SOU/AEP + niveaux.
3. Station hydrométrique / piézomètre « représentatif » : Hub'Eau `distance`+`latitude`/`longitude` (rayon km) ou KNN PostGIS (`<->` + index GiST) — **en privilégiant le même sous-bassin / aquifère (`code_bdlisa`, masse d'eau) plutôt que la distance pure**.

---

## C. Paysage concurrentiel

| Acteur | Positionnement | Limite vs cible |
|---|---|---|
| VigiEau (État) | Restrictions grand public par adresse | Pas de multi-sites, pas de scoring, pas d'alertes push, pas d'historique |
| MétéEAU Nappes (BRGM) | Prévision niveaux de nappes | Nappes seulement, pas orienté site entreprise |
| HydroClimat | Simulation hydrologique de vulnérabilité de sites industriels (abonnement jusqu'à ~1 000 €/mois) | Prospective/étude, moins temps réel opérationnel |
| Vortex-io / Follow Solutions | Capteurs + supervision hydro temps réel | Orienté capteurs terrain / crues, déploiement matériel |
| Veolia Hubgrade / Suez | Télérelève & pilotage de consommation interne | Donnée compteur interne, pas risque ressource territoriale |
| Aqueduct (WRI) / WWF WRF | Risque eau mondial, reporting ESG/CSRD/TNFD | Maille bassin grossière, faible résolution France |
| Water Wiser | Conseil + SaaS risque eau chaînes de valeur | Orienté conseil / matières stratégiques |

**Différenciation** : maille ZAS fine + alertes opérationnelles temps réel multi-sites + historique des restrictions par zone + indicateurs physiques Hub'Eau agrégés en un score unique + **projection 2050 par site**.

**Marché porteur** : Plan Eau (mars 2023, 53 mesures, objectif −10 % d'eau prélevée d'ici 2030, +475 M€/an aux agences de l'eau, accompagnement d'au moins 50 sites industriels prioritaires) ; aides des agences de l'eau et des régions à la sobriété hydrique ; tension croissante (été 2025 : 63 départements en restriction au-delà de la vigilance mi-juillet, dont 19 en crise selon le BSH ; ~46 départements passés en crise sur la saison, plus du double de 2024).

---

## D. Architecture technique recommandée

**Stack** (cohérent avec le prototype Vercel existant) :

- **Frontend/back** : Next.js (App Router) sur Vercel ; API routes / Server Actions.
- **Base géospatiale** : PostgreSQL + PostGIS via Supabase (auth + RLS + cron intégrés) ou Neon. PostGIS indispensable : point-in-polygon (`ST_Contains`), plus proche station (KNN `<->` + index GiST).
- **Cartographie** : MapLibre GL JS + tuiles PMTILES VigiEau (léger, sans serveur de tuiles) ; fond IGN/OSM.
- **Jobs de synchro** : Vercel Cron (ou Supabase scheduled functions / GitHub Actions) — pull quotidien GeoJSON VigiEau + arrêtés CSV ; pull horaire/quotidien Hub'Eau **pour les seules stations rattachées aux sites clients**.
- **Alertes** : événement sur changement de `niveauGravite` d'une ZAS contenant un site → email (Resend/Postmark), webhook, notification.

**Modèle de données (tables clés)** :

- `sites` (id, org_id, nom, adresse, geom Point 4326, code_insee, zas_sup_id, zas_sou_id, zas_aep_id, station_hydro_id, piezo_bss, masse_eau_id, aquifere_bdlisa, point_simulation_id)
- `zones_alerte` (id, code, nom, type SUP/SOU/AEP, departement, geom MultiPolygon, niveau_gravite_courant, arrete_id)
- `arretes` (id, date_debut, date_fin, pdf_url, arrete_cadre_url)
- `restrictions` (zone_id, usage, thematique, niveau, profil_flags)
- `series_hydro` / `series_piezo` (station_id, date, valeur, grandeur) — uniquement stations rattachées
- `prelevements` (code_ouvrage, commune, annee, usage, volume)
- `projections` (point_simulation_id, scenario, horizon, indicateur, mediane, q10, q90)
- `scores_risque` (site_id, date, score_global, sous_scores JSON)
- `alertes` (site_id, type, ancien_niveau, nouveau_niveau, date, statut_envoi)

**Stratégie d'ingestion** :

- **Réplication locale** : couches ZAS (GeoJSON quotidien) — indispensable pour le point-in-polygon sans latence et pour l'historique.
- **À la volée + cache** : API VigiEau et Hub'Eau `observations_tr` pour les stations des sites clients (cache 1-6 h). Volumétrie indexée sur le nombre de sites clients, pas sur le réseau national.
- **Batch annuel** : BNPE prélèvements.
- **Batch one-shot** : projections Explore2/DRIAS-Eau (section E).
- **Fréquences** : ZAS/arrêtés quotidien · hydrométrie horaire-quotidien · piézométrie quotidien · Onde hebdomadaire (période estivale) · BNPE annuel · projections one-shot.

---

## E. Module « Projection 2050 » de la disponibilité en eau par site

### Sources (toutes ouvertes, statiques — ingestion batch unique)

- **Explore2** (projet national INRAE / Météo-France / BRGM, livré 2024) : projections hydrologiques journalières jusqu'en 2100 sur ~4 000 points de simulation en France hexagonale, ensemble multi-modèles (couples GCM/RCM EURO-CORDEX × modèles hydrologiques : GRSD, ORCHIDEE, CTRIP, SMASH, EROS, J2000, MORDOR…), scénarios **RCP 2.6 / 4.5 / 8.5**. Données brutes et indicateurs : collection Explore2 sur data.gouv.fr (`https://www.data.gouv.fr/datasets/?q=explore2`), formats NetCDF/CSV.
- **DRIAS-Eau** (`https://www.drias-eau.fr/`) : portail de diffusion des indicateurs standardisés Explore2 — débit moyen annuel/saisonnier, **QMNA5, VCN10**, QJXA10, **recharge des nappes** — aux horizons H1 (proche), **H2 (milieu de siècle ≈ 2041-2070)**, H3 (fin de siècle), et selon la **TRACC** (+2 °C ≈ 2030, **+2,7 °C ≈ 2050**, +4 °C ≈ 2100). Fiches de synthèse par secteur hydrographique : portail **MEANDRE**.
- **Complément souterrain** : projections de recharge BRGM (volet souterrain Explore2 / Aqui-FR selon couverture de l'aquifère).
- Ordres de grandeur nationaux (Explore2/DRIAS-Eau) : étiages en baisse d'environ −15 % (+2,7 °C) à −30 % (+4 °C), débits estivaux −5 % (2050) à −20 % (2100), jusqu'à −40 % sur le Sud-Ouest.

### Méthode par site

1. Rattacher chaque site géocodé au **point de simulation Explore2 du même sous-bassin** (cohérence hydrographique, pas distance brute — même logique que pour les stations) + à la maille SAFRAN 8×8 km pour la recharge.
2. Calculer les **deltas 2050 vs période de référence 1976-2005** : Δ% module (débit moyen), Δ% **QMNA5** et **VCN10** (indicateurs clés de disponibilité en étiage), Δ% recharge de nappe, évolution du nombre de jours sous seuil d'étiage.
3. Restituer systématiquement la **médiane multi-modèles + intervalle d'incertitude (Q10–Q90 de l'ensemble)**, et décliner en plusieurs projections : **TRACC +2,7 °C** comme trajectoire de référence gouvernementale, **RCP 8.5** en stress test (RCP 4.5 en intermédiaire si souhaité).
4. Croiser delta d'étiage projeté × fréquence historique des restrictions de la ZAS → **« score prospectif 2050 »** par site (ex. : zone en alerte 60 j/an + QMNA5 projeté −25 % = risque futur critique).

### Ingestion & restitution

- Batch one-shot NetCDF/CSV → table `projections` ; ne stocker que les **indicateurs agrégés par point** (pas les séries journalières) pour maîtriser la volumétrie. Prévoir un script d'extraction Python/xarray en amont du chargement. Aucun refresh régulier (uniquement à une nouvelle vague Explore2/DRIAS).
- **UI** : bloc « Disponibilité 2050 » sur la fiche site — jauge delta étiage (médiane + fourchette Q10–Q90), comparaison des scénarios, mention explicite du caractère projectif (**tendances, pas prévisions**) — attendu des relectures méthodologiques type CSRD/TNFD.

---

## F. Plan de développement phasé

### MVP (fondations + valeur immédiate)

- Auth + multi-tenant (org/sites) via Supabase.
- Saisie de sites par adresse → géocodage BAN (`data.geopf.fr/geocodage`) → lon/lat + INSEE.
- Import des couches ZAS (PostGIS) + cron quotidien VigiEau (GeoJSON zones/arrêtés en vigueur).
- Rattachement automatique site → ZAS (point-in-polygon) + station hydro/piézo représentative.
- Fiche site : niveau de restriction courant + usages concernés (filtrés par profil entreprise/collectivité) + lien arrêté PDF.
- Carte MapLibre (PMTILES) + liste multi-sites.
- Alertes email sur changement de niveau.
- *Points de complexité* : géométries ZAS (validité, communes multi-zones → gérer le 409), KNN station représentative, robustesse des crons.

### V1 (scoring, historique & projections 2050)

- Score de risque composite multi-indicateurs (section B) + sous-scores.
- Historique des restrictions par ZAS (archives arrêtés) → fréquence/sévérité.
- Séries temporelles piézo/hydro par site + comparaison aux références (IPS, VCN10/QMNA5/DOE).
- **Module Projection 2050** (section E) : ingestion Explore2/DRIAS-Eau, rattachement site ↔ point de simulation, bloc UI « Disponibilité 2050 », score prospectif.
- Tableau de bord multi-sites (tri par risque courant et par risque 2050), export.
- *Points de complexité* : calcul IPS, normalisation débits vs seuils SDAGE (récupération DOE/DCR par point nodal), qualité/complétude des chroniques, parsing NetCDF Explore2 et rattachement hydrographique des points de simulation.

### V2 (plateforme)

- API publique pour intégration clients (SI, ERP, reporting CSRD/TNFD).
- Webhooks, notifications multi-canal, rôles avancés.
- Volet BNPE avancé (pression prélèvements par sous-bassin).
- Extension éventuelle des horizons de projection (H3 / +4 °C) et scénarios additionnels.

---

## Recommandations

1. **Démarrer par le couple BAN + VigiEau** — chemin le plus court vers un produit utile : géocodage → point-in-polygon ZAS → statut de restriction + alerte. Démontrable en quelques semaines ; c'est le squelette à donner en premier à Claude Code.
2. **Répliquer localement les ZAS (GeoJSON quotidien) dans PostGIS** plutôt que de dépendre uniquement de l'API live : performance du point-in-polygon, historique, résilience. Garder l'API VigiEau en source de fraîcheur/fallback.
3. **N'ingérer les séries Hub'Eau que pour les stations rattachées à des sites clients** (à la volée + cache) — maîtrise de la volumétrie et respect du fair-use ~20 req/s.
4. **Rattacher les stations et points de simulation par sous-bassin/aquifère, pas par distance brute** — un piézomètre du bon aquifère (`code_bdlisa`) à 15 km est plus pertinent qu'un piézomètre d'une autre nappe à 2 km ; même logique pour les points Explore2.
5. **Intégrer la projection 2050 dès la V1** : données statiques, ingestion batch unique, forte valeur différenciante face à VigiEau et aux outils globaux.
6. **Documenter la limite Sandre ZAS vs périmètre VigiEau appliqué** et l'**incertitude des projections** dans le produit — transparence méthodologique attendue d'un public expert.
7. **Anticiper la migration BAN** vers `data.geopf.fr` (l'ancien endpoint est mort depuis janvier 2026).

**Seuils qui changent la trajectoire** : au-delà de quelques milliers de sites clients, passer du pull à la volée à une réplication ciblée des stations avec files (queue) ; si des clients exigent du reporting réglementaire (CSRD/TNFD), prioriser l'API et les exports de la V2.

---

## Limites & points de vigilance

- **BNPE : volumes annuels, orientés redevances** — inadaptés au temps réel ; à utiliser comme pression structurelle uniquement. L'initiative État « Partageons l'eau » note l'absence de base nationale de volumes prélevés à visée de connaissance.
- **Couverture VigiEau incomplète** sur certains territoires ultramarins (404) et communes multi-zones (409) à gérer explicitement dans le code.
- **Onde = observation visuelle estivale**, pas une mesure continue ; valeur d'alerte précoce, pas de série fine.
- **Représentativité des stations** : une adresse peut être loin de toute station du bon sous-bassin/aquifère → afficher un **indicateur de confiance/représentativité** à l'utilisateur.
- **Explore2/DRIAS-Eau = projections** (incertitudes modèles/scénarios) : présenter comme tendances, jamais comme prévisions déterministes ; fichiers volumineux (prévoir extraction xarray en amont).
- **Endpoint OVH `.perf.`** de RegleAU documenté comme « compatibilité ascendante » ; surveiller une éventuelle migration.
- Certaines volumétries Hub'Eau et l'identification exacte des CSV de restrictions sont à revérifier via l'onglet « Fichiers » de data.gouv avant tout hardcoding.
