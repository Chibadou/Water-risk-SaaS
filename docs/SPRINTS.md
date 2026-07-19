# Feuille de route par sprints

Chaque sprint se termine par un push → déploiement Vercel → revue du rendu → ajustement du plan si besoin. Le plan produit/technique complet est dans [`PLAN.md`](./PLAN.md).

## Sprint 1 — Démo déployable (sans base de données) ✅

Objectif : une URL Vercel consultable au plus tôt.

- [x] Scaffold Next.js (App Router, TypeScript, Tailwind) déployable sur Vercel sans variable d'environnement.
- [x] Recherche d'adresse avec autocomplétion — géocodage BAN (`data.geopf.fr/geocodage`, l'ancien `api-adresse` étant décommissionné).
- [x] Routes API serveur : `/api/geocode` (BAN), `/api/zones` (proxy VigiEau, gestion explicite des 404 « non couvert » et 409 « commune multi-zones »).
- [x] Vue résultat : zones SUP / SOU / AEP, badge de niveau de gravité, dates + PDF de l'arrêté, usages restreints filtrés par profil (entreprise par défaut).
- [x] Carte MapLibre GL : tuiles vectorielles PMTILES officielles VigiEau (proxy same-origin `/api/pmtiles`), zones colorées par gravité, marqueur du site recherché, légende.
- [x] Mentions sources / fraîcheur (j-1) / avertissement méthodologique.

**Non inclus volontairement** : auth, persistance, multi-sites — arrivent au Sprint 2.

## Sprint 2 — Tableau de bord multi-sites local (sans compte, sans base) ✅

Décision produit (revue post-Sprint 1) : **pas d'authentification ni de stockage serveur pour l'instant** — les sites sont enregistrés localement dans le navigateur (localStorage). Conséquences assumées : données propres à chaque navigateur, pas d'alertes email ni d'historique cumulé tant qu'une base n'existe pas (l'historique restera reconstituable via les archives d'arrêtés data.gouv). L'export/import JSON sert de sauvegarde.

- [x] Enregistrement local des sites (localStorage, synchronisé entre onglets) depuis la page de recherche.
- [x] Page « Mes sites » : tableau trié par gravité (badge global + badges SUP/SOU/AEP par site), suppression, états de chargement/erreur par site.
- [x] Carte multi-sites avec marqueurs colorés par niveau de gravité (ajustement automatique du cadrage).
- [x] Export / import JSON de la liste de sites.
- [x] Liens profonds partageables : `/?lat=…&lon=…&label=…&profil=…` relance l'analyse d'un site.

## Sprint 3 — Enrichissement physique du site (Hub'Eau, toujours sans base) ✅

- [x] Rattachement station hydrométrique / piézomètre le plus proche avec données récentes (Hub'Eau, rayon 30 km) + **indicateur de représentativité** (bonne ≤ 10 km, moyenne ≤ 20 km, faible au-delà). *Limite documentée : sélection par distance ; le rattachement par sous-bassin / aquifère (`code_bdlisa`) nécessite les référentiels et viendra avec le sprint base de données.*
- [x] Fiche site : dernier débit moyen journalier (QmJ, m³/s) et dernier niveau de nappe (NGF ou profondeur), sparkline 35 jours, tendance 14 jours de la ressource (hausse/stable/baisse) — appels à la volée, cache serveur 6 h (référentiels 24 h).
- [x] Premier élément de score : « Score de risque courant (v0) » 0-100 basé sur le statut réglementaire VigiEau (vigilance 25 / alerte 50 / alerte renforcée 75 / crise 100), affiché avec jauge sur la fiche site.

## Sprint 3.5 — « Ressource à proximité » v2 (revue utilisateur du Sprint 3) ✅

Constats : le rayon de 30 km + le choix d'une seule station rendaient la section souvent vide ou opaque ; l'intérêt des mesures Hub'Eau n'était pas expliqué.

- [x] Rayon de recherche porté à 60 km, candidats sondés en parallèle (latence inchangée), l'indicateur de représentativité continuant de qualifier la distance.
- [x] **Liste des stations les plus proches** (≈ 8) avec distance, date de dernière mesure et disponibilité — les stations sans donnée récente restent visibles (grisées) pour expliquer le choix ; sélection par défaut = la plus proche disponible ; **choix mémorisé par site** (localStorage).
- [x] **Repli hauteur d'eau (H)** clairement étiqueté « signal secondaire » quand aucune station proche ne publie de débit (QmJ).
- [x] Explication pédagogique : bloc « Pourquoi ces mesures ? » sur la section (VigiEau = signal réglementaire, Hub'Eau = signal physique qui se dégrade avant l'escalade des arrêtés) + page **/methodologie** (sources, sélection des stations, limites de représentativité, formule du score v0).

## Sprint 4 — Score composite & historique ✅

- [x] Historique des restrictions par zone (**année en cours**, CSV officiel « arrêtés » data.gouv agrégé quotidiennement en jours par niveau, doublons d'arrêtés dédupliqués par jour). Parsing défensif (délimiteur sniffé, colonnes détectées par nom normalisé) + bloc `diag` dans `/api/history` pour détecter toute dérive de schéma. *Multi-années (3-5 ans, archives Propluvia) : à ajouter une fois le format validé en production.*
- [x] Score composite v1 (0-100, pondérations renormalisées sur les composantes disponibles) : statut réglementaire 45 %, fréquence des restrictions 25 %, tendance débit 15 %, tendance nappe 15 % — détail par composante sur la fiche site. *Composantes suivantes (IPS, VCN10/QMNA5, Onde, BNPE) : sprints ultérieurs.*
- [x] Tableau de bord trié par score (réglementaire + historique, pastille colorée) + **export CSV** (séparateur `;`, BOM Excel).
- [x] Base de données : **repoussée** — l'agrégat du CSV quotidien (cache 24 h, mémoïsé) suffit pour l'historique année en cours ; une base ne deviendra nécessaire que pour le multi-années fin ou les alertes.

## Sprint 5 — Projection 2050 ✅ (pipeline complet, données réelles à brancher)

- [x] Pipeline de bout en bout : script `scripts/projections/extract_explore2.py` (mode `--demo` reproductible + squelette xarray documenté, points `# VERIFY` à valider sur les fichiers Explore2 réels) → `data/projections.json` (indicateurs agrégés par point : Δ module, Δ QMNA5, Δ VCN10, Δ recharge ; médiane + Q10-Q90) → `/api/projection`.
- [x] Rattachement site ↔ point de simulation le plus proche (distance, plafond 120 km ; rattachement par sous-bassin prévu avec les référentiels).
- [x] Bloc « Disponibilité en eau — horizon 2050 » sur la fiche site : bascule TRACC +2,7 °C (référence) / RCP 8.5 (stress test), jauges médiane + bande Q10-Q90 par indicateur, avertissement « tendances, pas des prévisions ».
- [x] Score prospectif 2050 v1 : sévérité du Δ QMNA5 médian (70 %) × fréquence des restrictions de l'année (30 % quand disponible).
- [ ] **Brancher les données réelles** : télécharger les indicateurs Explore2 (data.gouv / DRIAS-Eau), valider les points `# VERIFY` du script, lancer l'extraction et committer le `projections.json` produit. D'ici là, le bloc affiche des **données synthétiques de démonstration** (bandeau d'avertissement explicite dans l'UI).

## Sprint 6 — Plateforme (V2)

Reporté ici (décision Sprint 2) : comptes utilisateurs et fonctionnalités qui exigent un stockage serveur des sites.

- [ ] Authentification + organisations (Supabase, magic link) et synchronisation des sites entre appareils.
- [ ] Alertes email sur changement de niveau de gravité (nécessite les sites côté serveur).
- [ ] API publique (clés par organisation) pour SI / ERP / reporting CSRD-TNFD, webhooks.
- [ ] Volet BNPE avancé (pression prélèvements par sous-bassin), horizons additionnels (H3 / +4 °C).
