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

## Sprint 4 — Score composite & historique

- [ ] Historique des restrictions par zone (archives des arrêtés data.gouv, 3-5 ans) → jours/an en alerte+.
- [ ] Score composite 0-100 (plan §B) : statut VigiEau, fréquence historique, IPS nappes, débits vs VCN10/QMNA5, Onde, pression BNPE.
- [ ] Tri du tableau de bord par score, export CSV.
- [ ] Selon besoin d'historique : introduction d'une base (Supabase/PostGIS) **sans compte utilisateur** (données publiques zones/arrêtés uniquement, les sites restent locaux).

## Sprint 5 — Projection 2050

- [ ] Script d'extraction Explore2 / DRIAS-Eau (Python/xarray) → indicateurs agrégés par point de simulation (Δ module, Δ QMNA5, Δ VCN10, Δ recharge ; médiane + Q10-Q90), servis en statique ou via la base selon volumétrie.
- [ ] Rattachement site ↔ point de simulation du même sous-bassin.
- [ ] Bloc « Disponibilité 2050 » sur la fiche site : TRACC +2,7 °C en référence, RCP 8.5 en stress test, incertitudes affichées.
- [ ] Score prospectif 2050 (Δ étiage × fréquence historique des restrictions).

## Sprint 6 — Plateforme (V2)

Reporté ici (décision Sprint 2) : comptes utilisateurs et fonctionnalités qui exigent un stockage serveur des sites.

- [ ] Authentification + organisations (Supabase, magic link) et synchronisation des sites entre appareils.
- [ ] Alertes email sur changement de niveau de gravité (nécessite les sites côté serveur).
- [ ] API publique (clés par organisation) pour SI / ERP / reporting CSRD-TNFD, webhooks.
- [ ] Volet BNPE avancé (pression prélèvements par sous-bassin), horizons additionnels (H3 / +4 °C).
