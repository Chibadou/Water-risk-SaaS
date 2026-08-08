# HydroVigie — SaaS de suivi du risque hydrique (quantité) par site, France

Suivi opérationnel du risque eau **quantité** (restrictions sécheresse, disponibilité de la ressource, projections 2050) à la maille de l'**adresse du site**, construit sur les données ouvertes françaises : VigiEau, Hub'Eau, BAN/Géoplateforme, Explore2/DRIAS-Eau, Sandre/BDLISA, Météo-France.

- Plan produit & technique complet : [`docs/PLAN.md`](docs/PLAN.md)
- Feuille de route par sprints : [`docs/SPRINTS.md`](docs/SPRINTS.md)
- Notes de passation (concepts, pièges, prochaines étapes) : [`docs/HANDBOOK.md`](docs/HANDBOOK.md) — **à lire avant toute contribution**
- Comptes rendus de session : [`docs/comptes-rendus/`](docs/comptes-rendus/) (un fichier daté par session, [gabarit](docs/TEMPLATE-COMPTE-RENDU.md))

**État actuel : sprints 1 → 37 livrés.** Trois pages — la **fiche site** (recherche d'adresse → cinq chapitres ancrés), le **tableau de bord de portefeuille** (« Mes sites »), et la **carte des ressources** (`/carte`).

## Ce que fait l'outil

**Réglementaire.** Recherche d'adresse (BAN) → zones d'alerte VigiEau (SUP/SOU/AEP), usages restreints par profil et par secteur, arrêté préfectoral en PDF, carte des zones. **Historique des arrêtés sur 10 ans** (CSV officiel) : jours par niveau de gravité, fréquence structurelle en jours/an, calendrier saisonnier.

**Physique.** Indicateurs Hub'Eau par site (stations dans un rayon de 60 km, choix de station mémorisé, repli sur la hauteur d'eau, tendances 14 j), **état standardisé de la nappe (IPS)** et **du débit (VCN10/QMNA5)** calculés sur l'historique propre de la station, **assecs Onde** (réseau sentinelle OFB), **humidité des sols (SWI Météo-France)**, **prélèvements BNPE** par usage et par milieu, **modèle de ressource** (pression sur le cours d'eau et autonomie du territoire, séparées depuis le sprint 28), **rattachement aquifère BDLISA** et **bassin / agence de l'eau** (référentiel Sandre, 35 186 communes).

**Prospectif.** Bloc **« Disponibilité en eau — horizon 2050 »** sur données réelles **Explore2 TRACC** : Δ étiage estival VCN10, Δ débit moyen annuel, Δ durée des basses eaux, par commune, aux niveaux +2 °C / +2,7 °C / +4 °C, médiane et fourchette q05-q95. **Indice d'anticipation** (le risque monte-t-il avant l'arrêté ?) et **jours d'activité contrainte** (aujourd'hui, fin d'étiage, 2050), lus sur les mesures réellement prescrites dans les arrêtés — jamais sur des coefficients inventés.

**Portefeuille.** Le tableau de bord analyse le **parc**, pas une pile de fiches : simultanéité rejouée sur les arrêtés réels, concentration (HHI), m³ et € à risque, répartition par département, et un **executive summary** en tête de page.

**Carte des ressources** (`/carte`). Les objets physiques autour d'une adresse — stations de débit, piézomètres, points ONDE, ouvrages BNPE, captages d'eau potable — sur fond de nappes affleurantes, cours d'eau et plans d'eau, avec **l'état de l'objet cliqué** (mesure, tendance, référence, dernier volume déclaré, niveau réglementaire).

**Reporting.** Rapport ESG (support ESRS E3 / TNFD) en Markdown et en PDF via impression navigateur, export CSV, page [`/methodologie`](app/methodologie) où chacune des 26 sections est ancrée et citable.

**100 % local, sans compte** : l'application ne demande jamais de connexion et ne stocke aucune donnée utilisateur côté serveur — les sites suivis vivent uniquement dans le navigateur (localStorage, clé `hydrovigie.sites.v1`). Seules les APIs de données ouvertes sont appelées côté serveur, sans identifier l'utilisateur. **Décision structurante : ne pas réintroduire de login sans demande explicite** (voir HANDBOOK §1).

## Deux règles à connaître avant de toucher au code

Elles ont chacune coûté un bug de production, et elles priment sur la commodité d'écriture :

1. **Un service injoignable n'est pas une source qui n'a rien à dire.** Une source amont peut répondre une mesure, « je n'ai rien pour cet endroit », ou rien du tout parce qu'elle est en panne. Confondre les deux derniers penche toujours du même côté — « pas de donnée » se lit « tout va bien ». L'idiome du dépôt est un type somme (`Résultat | null | "service-error"`), pas une exception.
2. **Une absence n'est jamais un zéro.** Une composante non estimée est exclue du score, jamais comptée `0` — un `0` en risque hydrique affirme « aucun risque », l'affirmation la plus forte que l'outil puisse faire. Attention en particulier aux `?? 0` à l'intérieur d'un `map` avant un `Math.max`.

## Développement local

```bash
npm install
npm run dev            # http://localhost:3000
```

Aucune variable d'environnement n'est requise (APIs open data publiques, appelées côté serveur). `HUBEAU_BASE_URL` est surchargeable pour pointer un serveur bouchon en test.

⚠️ **L'egress est bloqué dans le bac à sable de développement** : les APIs françaises échouent en local, et les messages « indisponible » en français dans l'UI sont l'état **attendu**, pas un bug. La validation des flux de données se fait sur le déploiement Vercel, ou via l'échappatoire GitHub Actions (voir HANDBOOK §3).

### Vérification avant chaque push

```bash
npm run build && npm run lint                              # ce que Vercel exécute
for t in scripts/test/*.test.ts; do npx tsx "$t"; done      # 22 suites
npx next start -p 3300
BASE=http://localhost:3300 node scripts/test/e2e.mjs        # 62 PASS attendus
```

Recette complète, avec les pièges d'environnement (`next-server` qui sert un ancien manifeste de chunks, `EADDRINUSE` silencieux) : HANDBOOK §6.

## Déploiement Vercel

Le dépôt est connecté à Vercel : chaque push sur une branche crée un **Preview Deployment**, et `main` met à jour l'alias de production **https://water-risk-saa-s.vercel.app**.

⚠️ Les URLs de déploiement à hash (`…-chibadous-projects.vercel.app`) sont protégées par Vercel Authentication et redirigent en SSO pour tout visiteur non connecté : ne pas les utiliser comme lien public ni comme cible de sonde.

## Architecture

```
app/
  page.tsx                 # fiche site : recherche → synthèse rédigée + 5 chapitres ancrés
  carte/                   # carte des ressources (MapLibre)
  sites/                   # tableau de bord de portefeuille
  methodologie/            # 26 sections, chacune ancrée et citable
  api/
    geocode/  zones/       # BAN (data.geopf.fr) · VigiEau (404 non couvert, 409 multi-zones)
    pmtiles/               # proxy same-origin des tuiles vectorielles VigiEau (requêtes Range)
    hydro/  piezo/         # stations Hub'Eau + séries 35 j + référence IPS / VCN10
    onde/  swi/  bnpe/     # assecs OFB · humidité des sols Météo-France · prélèvements
    history/               # jours par niveau et par zone (CSV des arrêtés, fenêtre 10 ans)
    restrictions/          # mesures réellement prescrites, par zone et par usage
    projection/            # Explore2 TRACC par commune
    transition/  bdlisa/   # ZRE + bassin/agence · rattachement aquifère
    carte/  carte/etat/    # couches de la carte · état de l'objet cliqué
    nappes/ cours-eau/ plans-eau/ departements/   # référentiels servis depuis le disque
components/
  ui/Panel.tsx             # cadre unique à 4 variantes : reglementaire · modele · projection · pedagogie
  Shell.tsx  Landing.tsx  SiteToc.tsx  SiteSummary.tsx  SourceProgress.tsx
  AddressAutocomplete.tsx  # combobox ARIA complet (le contrôle sans lequel rien ne se produit)
  ResultPanel · ScorePanel · SiteIndicators · RestrictionHistory · RessourcePanel
  AnticipationPanel · InterruptionPanel · SectorImpactPanel · Projection2050 · TransitionRiskPanel
  BnpePanel · ZonesMap · CarteEau · CarteClient · Sparkline · GraviteBadge
  SitesDashboard · PortfolioExecutiveSummary · PortfolioCorrelation · PortfolioByDepartment
  PortfolioChoropleth · ServiceWorkerRegister
lib/
  vigieau · hubeau · history · restrictions · onde · swi · bnpe · bdlisa · bassins   # sources
  score · ressource · anticipation · interruption · exposition · arbitrage           # modèles
  portefeuille · executive · synthese · secteur · projections · transition           # agrégation
  report · reportHtml · methodologie · sites · stationChoice · gravite · types       # sortie & état
data/
  projections/  refdata/  restrictions/  swi/    # jeux embarqués, produits par scripts/ sur runner
  *-request.json                                 # déclencheurs des workflows GitHub Actions
scripts/
  refdata/ projections/ restrictions/ swi/       # collecte (Python, sur runner GitHub)
  diag/                                          # diagnostic en conditions réelles (modes app/prod)
  test/                                          # 22 suites unitaires + e2e.mjs (Playwright)
```

Les jeux de `data/` sont embarqués dans le déploiement via `outputFileTracingIncludes` (`next.config.ts`) : **toute nouvelle ressource lue depuis le disque doit y être déclarée**, faute de quoi elle ne casse qu'en production.

## Sources de données

| Source | Usage | Fraîcheur |
|---|---|---|
| [VigiEau](https://api.vigieau.gouv.fr) (`/api/zones`) | Zones d'alerte et restrictions en vigueur | Quotidienne (situation j-1) |
| [Géoplateforme / BAN](https://data.geopf.fr/geocodage/search/) | Géocodage des adresses | 2×/semaine |
| [Hub'Eau](https://hubeau.eaufrance.fr/) — hydrométrie, piézométrie | Débits (QmnJ), niveaux de nappe, références longues | Quotidienne |
| [Hub'Eau](https://hubeau.eaufrance.fr/) — ONDE, BNPE | Assecs du réseau sentinelle · volumes prélevés déclarés | Campagne mai-sept. · annuelle |
| Arrêtés de restriction ([data.gouv.fr](https://www.data.gouv.fr/)) | Historique 10 ans, jours par niveau et par zone | Quotidienne |
| [Explore2 / DRIAS-Eau](https://www.drias-eau.fr/) TRACC | Projections 2050 par commune (VCN10, QA, durée d'étiage) | Millésimée |
| [Météo-France](https://meteo.data.gouv.fr/) SWI | Humidité des sols, maille 8 km | Mensuelle |
| Sandre / BDLISA | Bassins, agences de l'eau, ZRE, entités hydrogéologiques | Annuelle |
| PMTILES VigiEau ([data.gouv.fr](https://www.data.gouv.fr/datasets/donnee-secheresse-vigieau)) | Fond de carte des zones | Quotidienne |

⚠️ **Propluvia est décommissionné** : VigiEau est le canal officiel unique des restrictions, il n'existe pas d'alternative live (constat instruit au sprint 27).

Les informations affichées ne se substituent pas aux arrêtés préfectoraux : seul le texte de l'arrêté fait foi.
