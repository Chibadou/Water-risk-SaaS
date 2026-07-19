# HydroVigie — SaaS de suivi du risque hydrique (quantité) par site, France

Suivi opérationnel du risque eau **quantité** (restrictions sécheresse, disponibilité de la ressource, projections 2050) à la maille de l'**adresse du site**, construit sur les données ouvertes françaises : VigiEau, Hub'Eau, BAN/Géoplateforme, Explore2/DRIAS-Eau.

- Plan produit & technique complet : [`docs/PLAN.md`](docs/PLAN.md)
- Feuille de route par sprints : [`docs/SPRINTS.md`](docs/SPRINTS.md)

**État actuel (Sprint 4)** : recherche d'adresse (BAN) → zones d'alerte sécheresse VigiEau (SUP/SOU/AEP), usages restreints par profil, arrêté PDF, carte des zones ; **tableau de bord multi-sites** (« Mes sites », localStorage, export JSON/CSV) trié par score ; **indicateurs physiques Hub'Eau** par site (stations à 60 km, choix de station mémorisé, repli hauteur d'eau, tendances 14 j) ; **historique des restrictions** de l'année (CSV officiel des arrêtés agrégé quotidiennement) ; **score de risque composite v1** (réglementaire 45 % + fréquence 25 % + tendances débit/nappe 15 %+15 %, renormalisé) détaillé sur la fiche site ; page **/methodologie**. Aucune donnée utilisateur n'est stockée côté serveur.

## Développement local

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000). Aucune variable d'environnement n'est requise pour le Sprint 1 (APIs open data publiques, appelées côté serveur).

## Déploiement Vercel (première mise en place)

1. Aller sur [vercel.com/new](https://vercel.com/new) et se connecter avec le compte GitHub.
2. Importer le dépôt `chibadou/water-risk-saas`.
3. Framework détecté automatiquement : **Next.js** — ne rien changer, aucune variable d'environnement à saisir.
4. Cliquer **Deploy**.

Ensuite, chaque push sur une branche crée automatiquement un **Preview Deployment** avec sa propre URL (visible dans l'onglet *Deployments* du projet Vercel), et la branche de production (par défaut `main`) met à jour l'URL principale. Pour prévisualiser la branche de développement courante (`claude/project-integration-sprint-g3wyzl`), ouvrir simplement l'URL de preview générée après l'import ou après chaque push.

## Architecture (Sprint 1)

```
app/
  page.tsx               # recherche → résultat + carte (deep-linkable via ?lat&lon&label&profil)
  sites/page.tsx         # « Mes sites » : tableau de bord multi-sites local
  methodologie/page.tsx  # sources, sélection des stations, limites, formule du score
  api/geocode/route.ts   # proxy géocodage BAN (data.geopf.fr — l'ancien api-adresse est décommissionné)
  api/zones/route.ts     # proxy VigiEau /api/zones (gestion 404 non couvert, 409 multi-zones)
  api/pmtiles/route.ts   # proxy same-origin des tuiles vectorielles PMTILES VigiEau (requêtes Range)
  api/hydro/route.ts     # station hydrométrique la plus proche + débits QmJ 35 j (Hub'Eau)
  api/piezo/route.ts     # piézomètre le plus proche + niveaux de nappe 35 j (Hub'Eau)
  api/history/route.ts   # jours par niveau de gravité par zone (CSV arrêtés data.gouv, cache 24 h)
components/
  Shell.tsx              # en-tête (navigation) + pied de page communs
  HomeClient.tsx         # état de la page de recherche (adresse, profil, résultats)
  AddressSearch.tsx      # autocomplétion d'adresse + sélecteur de profil
  ResultPanel.tsx        # cartes par zone (SUP/SOU/AEP), usages, arrêtés
  SitesDashboard.tsx     # tableau multi-sites trié par gravité + export/import JSON
  SiteIndicators.tsx     # cartes débit / nappe (station la plus proche, tendance, représentativité)
  Sparkline.tsx          # mini-graphique SVG 35 jours
  ZonesMap.tsx           # MapLibre GL + PMTiles, zones colorées, marqueurs mono/multi-sites
lib/
  types.ts               # types BAN / VigiEau
  gravite.ts             # échelle de gravité (labels, couleurs, descriptions)
  sites.ts               # stockage local des sites (localStorage) + hook useSavedSites
  hubeau.ts              # stations Hub'Eau (rayon 60 km, sondage parallèle, repli hauteur) + séries
  stationChoice.ts       # mémorisation locale du choix de station par site
  history.ts             # parsing défensif du CSV des arrêtés + agrégation jours/niveau/zone
  score.ts               # score composite v1 (pondérations, renormalisation, couleurs)
```

Les sites suivis sont stockés **uniquement dans le navigateur** (localStorage, clé `hydrovigie.sites.v1`) : pas de compte, pas de base de données. L'export JSON permet de sauvegarder ou transférer la liste.

## Sources de données

| Source | Usage | Fraîcheur |
|---|---|---|
| [VigiEau](https://api.vigieau.gouv.fr) (`/api/zones`) | Zones d'alerte & restrictions en vigueur | Quotidienne (situation j-1) |
| [Géoplateforme / BAN](https://data.geopf.fr/geocodage/search/) | Géocodage des adresses | 2×/semaine |
| [Hub'Eau](https://hubeau.eaufrance.fr/) (hydrométrie, piézométrie) | Débits (QmJ) et niveaux de nappe des stations proches | Quotidienne |
| PMTILES VigiEau ([data.gouv.fr](https://www.data.gouv.fr/datasets/donnee-secheresse-vigieau)) | Fond de carte des zones | Quotidienne |

Les informations affichées ne se substituent pas aux arrêtés préfectoraux : seul le texte de l'arrêté fait foi.
