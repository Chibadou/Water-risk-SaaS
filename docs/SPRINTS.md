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

## Sprint 2 — Fondations SaaS (Supabase + PostGIS)

Objectif : comptes, sites persistés, réplication locale des zones.

- [ ] Projet Supabase : auth (magic link), organisations, RLS multi-tenant.
- [ ] Tables `sites`, `zones_alerte`, `arretes`, `restrictions` (modèle du plan §D).
- [ ] Cron quotidien (Vercel Cron) : pull du GeoJSON VigiEau « zones + arrêtés en vigueur » → PostGIS, historisation des niveaux.
- [ ] Point-in-polygon local (`ST_Contains`) au lieu de l'appel API à la volée.
- [ ] CRUD sites (création par adresse) + liste multi-sites avec niveau courant.

## Sprint 3 — Enrichissement site & alertes

- [ ] Rattachement station hydrométrique / piézomètre représentatif (Hub'Eau, priorité au même sous-bassin / aquifère `code_bdlisa`, sinon KNN) + indicateur de confiance.
- [ ] Fiche site : séries temporelles débit / niveau de nappe (cache 1-6 h, stations des sites clients uniquement).
- [ ] Alertes email (Resend) sur changement de `niveauGravite` d'une zone contenant un site.

## Sprint 4 — Score de risque & historique

- [ ] Historique des restrictions par zone (archives des arrêtés data.gouv, 3-5 ans) → jours/an en alerte+.
- [ ] Score composite 0-100 (plan §B) : statut VigiEau, fréquence historique, IPS nappes, débits vs VCN10/QMNA5, Onde, pression BNPE.
- [ ] Tableau de bord multi-sites trié par risque, export CSV.

## Sprint 5 — Projection 2050

- [ ] Script d'extraction Explore2 / DRIAS-Eau (Python/xarray) → table `projections` (indicateurs agrégés par point : Δ module, Δ QMNA5, Δ VCN10, Δ recharge ; médiane + Q10-Q90).
- [ ] Rattachement site ↔ point de simulation du même sous-bassin.
- [ ] Bloc « Disponibilité 2050 » sur la fiche site : TRACC +2,7 °C en référence, RCP 8.5 en stress test, incertitudes affichées.
- [ ] Score prospectif 2050 (Δ étiage × fréquence historique des restrictions).

## Sprint 6 — Plateforme (V2)

- [ ] API publique (clés par organisation) pour SI / ERP / reporting CSRD-TNFD.
- [ ] Webhooks et notifications multi-canal, rôles avancés.
- [ ] Volet BNPE avancé (pression prélèvements par sous-bassin).
- [ ] Horizons additionnels (H3 / +4 °C).
