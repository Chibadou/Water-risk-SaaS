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
- [x] **Données réelles branchées** : pipeline GitHub Actions (le bac à sable de dev n'a pas accès aux hôtes open-data) — `discover_explore2.py` a catalogué les jeux data.gouv, puis `extract_explore2.py` a extrait « Indicateurs de débits futurs Explore2 TRACC agrégés par territoire » : Δ VCN10 été (%), Δ QA (%), Δ durée des basses eaux (jours) **par commune (bassin versant)**, aux niveaux TRACC +2 °C / +2,7 °C / +4 °C, médiane q50 + fourchette q05-q95 → `data/projections/` (96 shards, ~11 Mo). Rattachement par code INSEE (plus fin et plus juste hydrologiquement que le plus-proche-point) ; codes arrondissements Paris/Lyon/Marseille normalisés ; repli lat/lon → commune via geo.api.gouv.fr. Le bandeau « données de démonstration » a disparu (piloté par `meta.demo`).

## Sprint 6 — Plateforme (V2) ✅ (code livré, activation à la charge du déploiement)

Principe conservé : **le mode local reste le défaut** — l'application fonctionne intégralement sans compte ni variable d'environnement. Le compte (magic link) est un opt-in qui active les alertes email et l'API. Tout est conditionné à la présence des variables Supabase/Resend (voir `.env.example` et le README).

- [x] Authentification magic link (Supabase) + organisation créée automatiquement à l'inscription (`supabase/migrations/0001_init.sql`, RLS multi-tenant).
- [x] Page `/compte` : copie des sites locaux vers le serveur (= abonnements aux alertes), import inverse vers le navigateur, email de réception des alertes, gestion des clés d'API.
- [x] Alertes email : cron Vercel quotidien (`/api/cron/check-alerts`, protégé par `CRON_SECRET`) — compare le niveau VigiEau de chaque site serveur à l'état précédent, envoie un email (Resend) à chaque changement et journalise dans `alert_events`.
- [x] API publique v1 : `GET /api/v1/sites` avec `Authorization: Bearer <clé>` (clés hashées SHA-256, générées sur `/compte`) → sites de l'organisation + statut de restriction courant.
- [ ] **Activation** : créer le projet Supabase, exécuter la migration SQL, renseigner les variables sur Vercel (checklist README) → déplacé au Sprint 8.
- [ ] Sprint 6.5 (reporté) : webhooks, volet BNPE (pression prélèvements), horizons additionnels (H3 / +4 °C), rôles avancés → déplacé au Sprint 10.

---

# Sprints ouverts

Les items restants (bugs connus du [`HANDBOOK.md`](./HANDBOOK.md) §4 + prochaines étapes §5 + reliquats du Sprint 6) re-planifiés en quatre sprints, par valeur décroissante.

## Sprint 7 — Fiabilisation de la prod (historique + carte + retouches) ✅ (code) / ⏳ (déploiement)

Objectif : tout ce qui est déjà livré fonctionne réellement en conditions réelles. Vérification via le runner GitHub Actions (`prod-diag.yml`, mode `app` : build + probes de l'app sur le runner avec egress complet), le bac à sable n'ayant pas d'accès aux hôtes concernés.

- [x] **Historique (bug n°1) : cause trouvée et corrigée.** L'id de ressource codé en dur pointait sur `arretes-cadre.csv` (arrêtés cadre, **sans colonne de gravité** → jamais parsable) et le fichier de repli encode les zones en **tableaux JSON parallèles par ligne** (`zones_alerte.code` / `zones_alerte.niveau_gravite`), illisibles par le parseur ligne-par-zone. Correctif : source primaire = CSV maître « Arrêtés » (`f425cfa6…`, ~11 Mo, MAJ quotidienne, toutes années dont l'année en cours — les exports par année s'arrêtent à 2024), explosion des cellules-tableaux (double clé code + id numérique conservée), motif de colonne corrigé (`niveau_gravite_specifique_aep` n'est plus confondu avec la gravité), découverte dataset dépriorisant le fichier « Cadre », agrégation bornée à l'année en cours (protège aussi des dates corrompues type année 0022). **Vérifié en réel sur le runner** : 683 arrêtés 2026 parsés, zone lyonnaise `84_69_0004` → 15 j vigilance + 13 j alerte. Test de régression : `scripts/test/history-parser.test.ts` (fixtures des deux schémas réels).
- [x] **Carte : `/api/pmtiles` vérifié en conditions réelles** (runner) — 206 Partial Content, `content-range` correct sur l'archive de 82 Mo, magic bytes PMTiles, tranches distinctes pour des ranges distincts. Aucun correctif nécessaire.
- [x] Nom de commune dans le bloc « Disponibilité 2050 » aussi en lookup `citycode` direct (résolution du nom via geo.api.gouv.fr, tolérante aux pannes) — vérifié : « Lyon » sur les deux chemins.
- [x] Non-régression : `npm run build` + `npm run lint` OK, 12/12 PASS sur `scripts/test/e2e.mjs`, 10/10 sur `history-parser.test.ts`.
- [x] **Déploiement rétabli et mis en prod** : branche mergée dans `main` (PR #2). L'alias de production `https://water-risk-saa-s.vercel.app` sert de nouveau l'app et **tous les correctifs sont vérifiés en réel** (probe runner, 2026-07-20) : `/api/history` → 683 arrêtés 2026 parsés (`available:true`), `/api/zones` → 200, `/api/projection` → commune « Lyon » nommée, `/api/pmtiles` → 206 Partial Content. Critère d'acceptation rempli sur la prod réelle.

**Critère d'acceptation** ✅ : sur `water-risk-saa-s.vercel.app`, l'historique (jours par niveau), la carte colorée et le nom de commune dans le bloc 2050 sont opérationnels.

## Sprint 8 — ~~Activation comptes / alertes / API~~ → **ABANDONNÉ** (décision produit : local-only)

Décision utilisateur (2026-07-20) : **pas de login sur le site**. Le produit reste **100 % local** — aucun compte, aucune donnée utilisateur côté serveur. Le code opt-in du Sprint 6 (magic link Supabase, cron d'alertes Resend, API v1 à clés) a donc été **entièrement retiré** : pages `/connexion` `/compte` `/auth/callback`, routes `/api/v1/*` et `/api/cron/*`, `lib/supabase/*`, migration SQL, dépendances `@supabase/*`, cron `vercel.json`, lien « Compte » du menu. La mise en prod (`main`) était le seul autre objectif du sprint — déjà faite (PR #2).

*Si des alertes email redeviennent souhaitables un jour, les faire **sans login*** : simple abonnement email (adresse + site, lien de désabonnement à jeton), sans mot de passe ni session. Le code Sprint 6 reste récupérable dans l'historique git si besoin.

## Sprint 9 — Score enrichi & historique multi-années ✅ (partiel — voir reste reporté)

Objectif : les composantes de score reportées depuis le Sprint 4 et un historique structurel.

- [x] **Historique multi-années (fenêtre 5 ans)** dans `lib/history.ts` : le CSV maître « Arrêtés » (2012→) est agrégé par année sur une fenêtre glissante de 5 ans. Chaque zone porte un détail par année (`parAnnee`) + une **fréquence structurelle** (`joursAlertePlusMoyen` = moyenne jours/an en alerte+ sur les années complètes, année en cours partielle exclue). Dates corrompues (année 0022 du vrai fichier) écartées au lieu d'être bornées (sinon jours fantômes). Vérifié en réel : 5 699 arrêtés 2022-2026, zone `84_69_0004` → 105 j/an de moyenne sur 4 ans.
- [x] **Composante de score « Assecs Onde »** (`lib/onde.ts` + `/api/onde`) : réseau sentinelle OFB via Hub'Eau `/v1/ecoulement`, observations classées (assec/non-visible/faible/visible) → risque 0-100, pondérée 10 %. Saisonnière (absente hors mai-septembre, le score se renormalise). Vérifié en réel : 98 stations autour de Toulouse, score 49.
- [x] **Score recomposé** : réglementaire 40, fréquence structurelle 25, Onde 10, tendance débit 12,5, tendance nappe 12,5 — la composante historique bascule automatiquement sur la moyenne structurelle quand des années complètes existent. Détail par année affiché sous le score (`RestrictionHistory`). Méthodologie mise à jour. Tests : parseur multi-années + classifieur Onde.
- [x] **IPS nappes** (`computeIps` dans `lib/hubeau.ts`) : indice standardisé calculé **empiriquement** — le niveau du mois courant est situé dans la distribution des mêmes mois calendaires sur l'historique du piézomètre (≥ 10 ans, chroniques Hub'Eau). Classe très basse→très haute + risque 0-100. Remplace la simple tendance quand l'historique suffit. Vérifié en réel : Orléans nappe 63/100 (proche des normales, 12 ans), Strasbourg 85/100 (basse, 24 ans).
- [x] **Débits vs VCN10/QMNA5** (`computeLowFlow`) : références d'étiage calculées **empiriquement** sur l'historique de la station (≥ 6 ans de QmnJ) — VCN10 quinquennal sec (quantile 0,2 des minima annuels du débit moyen 10 j) + QMNA5 ; débit récent comparé au VCN10 → risque 0-100. Pas de dépendance à Hydroportail. Vérifié en réel : Loire à Orléans 67/100 (27,1 m³/s sous VCN10 29,6, 19 ans).
- [x] **Aquifère (`code_bdlisa`) exposé** : le code d'aquifère du piézomètre sélectionné est affiché (référentiel Hub'Eau) pour qu'un expert du terrain choisisse une station de la même nappe. *Rattachement automatique site → aquifère (lookup BDLISA au point) : reste reporté.*
- [x] **ZAS Sandre vs VigiEau : tranché** — on utilise le périmètre **appliqué** (couches VigiEau), pas le contour Sandre « naturel » ; documenté sur `/methodologie`.
- [x] **Deux bugs de prod découverts et corrigés en passant** (les composantes physiques ne se déclenchaient jamais) : (1) le débit journalier utilisait le token `grandeur_hydro_elab=QmJ` **rejeté en HTTP 400** par Hub'Eau — le bon est **`QmnJ`** ; la carte débit tombait donc toujours sur la hauteur d'eau. (2) le référentiel piézo n'a **pas de champs `longitude`/`latitude`** (coordonnées en `x`/`y` WGS84 / `geometry`) — tous les piézomètres étaient écartés (« aucun piézomètre actif »). Corrigés et vérifiés en réel.
- [ ] **Reste reporté** — rattachement automatique station ↔ sous-bassin/aquifère du site (nécessite le référentiel BDLISA interrogé au point) ; composante BNPE (Sprint 10).

**Critère d'acceptation** ✅ : le score montre fréquence structurelle, Onde, IPS nappe et étiage VCN10/QMNA5 avec leurs sources, vérifiés sur données réelles. Seule la pression BNPE reste « à venir » dans l'UI.

## Sprint 10 — Enrichissements & UX (local) ✅ (partiel)

Objectif : finitions produit sans quitter le mode local.

- [x] **Volet BNPE** (`lib/bnpe.ts` + `/api/bnpe` + `BnpePanel`) : volumes annuels déclarés prélevés sur la commune du site, par usage (agriculture / eau potable / industrie / énergie / canaux…), année la plus récente, via Hub'Eau `/v1/prelevements`. Vérifié en réel : Chartres 819 072 m³ (2023, eau potable + agriculture), Toulouse 62 Mm³ (canaux + AEP + agriculture). Agrégation testée (`scripts/test/bnpe.test.ts`).
- [x] **Horizons +4 °C** : déjà exposés — le sélecteur du bloc 2050 itère tous les `warming_levels` (+2 / +2,7 / +4 °C).
- [x] **Export du bloc 2050** : bouton « Copier les données (CSV) » — tous les niveaux × indicateurs (Q05/médiane/Q95) copiés au presse-papier (CSV `;`, BOM Excel).
- [ ] **BNPE dans le score composite** : *volontairement non fait.* Un volume prélevé n'a de sens qu'au regard de la ressource à la même échelle (ratio prélèvements/ressource « baseline water stress ») ; la maille commune ≠ bassin et la BNPE ne fournit pas ce dénominateur. Présenté en contexte de pression structurelle, hors score (raisonné sur `/methodologie`). Intégration au score = référence à l'échelle sous-bassin, à faire ultérieurement.
- [ ] **Page d'accueil marketing** : reporté — vrai chantier design/landing, à cadrer à part ; l'accueil actuel est l'outil de recherche fonctionnel.

*Retirés du périmètre (nécessiteraient un compte, écarté) : webhooks, rôles avancés, API à clés.*

## Sprint 11 — Traitement du backlog ✅ (partiel — 1 limite de données assumée)

- [x] **Page d'accueil marketing** (`components/Landing.tsx`) : l'accueil au repos affiche une landing (propositions de valeur, sources/confiance, « comment ça marche ») ; la grille de résultats n'apparaît que pendant/après une recherche. Rendu vérifié (headless).
- [x] **Aquifère dans le sélecteur de station** : chaque piézomètre candidat affiche son code BDLISA (vérifié réel : Chartres → `107AA`/`107AA02`), pour qu'un expert choisisse la station de la bonne nappe. *Rattachement automatique site → aquifère : nécessite la géométrie BDLISA au point (référentiel Sandre/BRGM) — vrai chantier, non bâclé.*
- [x] **BNPE dans le score : investigué, non faisable proprement, assumé.** Vérifié en réel : la chronique BNPE **ne distingue pas le milieu** (surface/souterrain), la maille commune ≠ bassin, et il n'existe pas de dénominateur « ressource renouvelable » par sous-bassin librement disponible. Un ratio prélèvements/ressource fiable est donc impossible ; une intensité par surface/habitant existe (ajoutée au bloc BNPE : Chartres 48 400 m³/km² · 21 m³/hab, Toulouse 526 000 m³/km² · 121 m³/hab) mais mesure l'exploitation du territoire, pas le stress — hors score, documenté.

## Sprint 12 — Communication du risque & interprétabilité ✅

Objectif : rendre le score existant immédiatement interprétable et actionnable — sans nouvelle source de données.

- [x] **Classification du risque en 6 classes nommées** (Négligeable / Faible / Modéré / Élevé / Très élevé / Critique) alignées sur la terminologie WRI Aqueduct / CDP Water Security, affichées en badge coloré sur le score panel. Seuils : 0-14 / 15-29 / 30-49 / 50-69 / 70-84 / 85-100.
- [x] **Indicateur de confiance** (haute / moyenne / faible) sur le score. Agrège trois facteurs : couverture des composantes disponibles, distance de la station la plus proche, fraîcheur des données. Affiché en badge à côté de la classe de risque, avec tooltip détaillant les raisons.
- [x] **Courbe d'évolution du risque** : sparkline SVG année par année de la composante « fréquence des restrictions » (score historiqueScore par an), avec détection de tendance (aggravation/amélioration/stable). Utilise les données multi-années déjà disponibles.
- [x] **Calendrier saisonnier du risque** : heatmap des 12 mois montrant le nombre moyen de jours en alerte+ par mois sur les années complètes. Légende d'intensité 4 niveaux. Ajout de `parMois` dans `ZoneHistory` pour l'agrégation mensuelle.
- [x] **Seuils d'alerte sur les projections 2050** : le bloc « Disponibilité en eau » croise le Δ VCN10 projeté avec la fréquence structurelle des restrictions pour qualifier la tension future en 4 niveaux (évolution limitée / tension modérée / significative / critique), avec message contextuel croisant projection et historique.
- [x] **Méthodologie mise à jour** : deux nouvelles sections (classification du risque, calendrier saisonnier) documentant les seuils, la confiance et le raisonnement.

**Critère d'acceptation** : build + lint clean, 16/16 tests historiques passent, badge sprint 12 dans le header.

## Sprint 13 — Contexte sectoriel & synthèse portefeuille ✅

Thème : **rendre le risque opérationnel et contextualisé** — interprétation par secteur d'activité, vue agrégée du portefeuille, classe de risque sur le dashboard.

- [x] **Interprétation sectorielle des restrictions** (`lib/secteur.ts`, `SectorImpactPanel.tsx`) : 6 secteurs (agriculture, industrie, énergie, services/tertiaire, collectivité, autre). Pour chaque secteur × niveau de gravité, description de l'impact opérationnel concret (ex. « alerte renforcée × agriculture = irrigation très limitée, seules les cultures pérennes exemptées »). Panneau affiché sur la fiche site quand un secteur est sélectionné, avec le niveau en cours mis en évidence.
- [x] **Sélecteur de secteur** sur la page de recherche : dropdown « Secteur (optionnel) » à côté du bouton « Ajouter à mes sites ». Le secteur est persisté dans `SavedSite.secteur` (localStorage). Types dans `lib/sites.ts`.
- [x] **Badge classe de risque sur le dashboard** : chaque site affiche son label WRI/CDP (Négligeable…Critique) en badge coloré à côté du score numérique dans le tableau des sites.
- [x] **Synthèse portefeuille** : 4 indicateurs agrégés au-dessus du tableau — nombre de sites, score moyen (avec classe), score max (avec classe), répartition des sites par classe de risque.
- [x] **Icône secteur dans le dashboard** : l'emoji du secteur s'affiche à côté du nom du site dans le tableau.
- [x] **Export CSV enrichi** : colonnes `secteur` et `classe_risque` ajoutées à l'export CSV pour intégration dans les rapports ESG.
- [x] **Méthodologie mise à jour** : deux nouvelles sections (interprétation sectorielle, synthèse portefeuille).

**Critère d'acceptation** : build + lint clean, 16/16 tests historiques passent, badge sprint 13 dans le header.

## Sprint 14 — Partage & mode hors-ligne ✅

Thème : **collaboration et résilience terrain, sans compromettre le local-only**. Deux des trois items initialement prévus (partage, PWA) sont livrés ; les notifications email sont volontairement reportées (cf. note ci-dessous).

- [x] **Lien de partage (deep link)** : bouton « 🔗 Partager » sur la fiche site qui copie dans le presse-papiers une URL encodant l'analyse complète (lat/lon/label/profil/secteur). Aucun compte, aucune donnée serveur — l'URL suffit à rouvrir la fiche. Le secteur est désormais inclus dans l'URL (`parseInitialParams`/`buildParams`) et restauré à l'ouverture d'un lien partagé.
- [x] **Mode hors-ligne (PWA)** : `public/manifest.webmanifest` + service worker `public/sw.js` (network-first pour les navigations, stale-while-revalidate pour les assets statiques, **jamais de cache sur `/api/*`**). L'interface — dont le dashboard « Mes sites » alimenté par localStorage — reste accessible sans connexion ; les données temps réel restent « indisponibles » hors-ligne (jamais de donnée périmée présentée comme actuelle). Enregistrement du SW en production seule via `ServiceWorkerRegister.tsx`. Manifest, `theme_color` et `appleWebApp` câblés dans `app/layout.tsx`.
- [x] **Méthodologie mise à jour** : nouvelle section « Partage et mode hors-ligne ».
- [ ] **Notifications email sans compte** — **reporté**. Contrairement au partage et à la PWA, ce besoin exige une infrastructure serveur (stockage des abonnements, service d'envoi, cron) qui contredit la décision structurante « local-only, pas de serveur ». À trancher explicitement avec l'utilisateur avant tout développement (option newsletter sans login à cadrer).

**Critère d'acceptation** : build + lint clean, 16/16 tests historiques passent, badge sprint 14 dans le header.

## Sprint 15 — Benchmark national des projections ✅

Thème : **contextualiser la projection 2050** — où se situe le site par rapport aux autres communes françaises. Item #8 du backlog expert (benchmarking comparatif), réalisé sur une donnée réelle déjà embarquée (Explore2), sans egress ni dépendance externe.

- [x] **Distribution de référence pré-calculée** (`scripts/projections/build_benchmark.py` → `data/projections/benchmark.json`) : lit les shards Explore2 locaux, extrait la médiane VCN10 (étiage estival) à +2,7 °C par commune, et calcule 101 breakpoints de percentile pour la France entière (34 418 communes) et chaque département (96). 58 Ko, stdlib Python, aucun réseau.
- [x] **Percentile de sévérité** (`severityPercentile` dans `lib/projectionsShared.ts`) : fonction pure qui place la baisse d'étiage d'un site dans une distribution ascendante et retourne la part des communes moins impactées. Testée (`scripts/test/benchmark.test.ts`, 14 checks).
- [x] **Loader + API** : `benchmarkForCommune` (`lib/projections.ts`) résout le percentile national + départemental et le remonte dans `ProjectionPayload.benchmark` via `/api/projection`.
- [x] **Affichage** (`BenchmarkInsight` dans `Projection2050.tsx`) : bloc « Positionnement du site » avec deux barres de percentile (national, département) et la valeur brute de la baisse projetée, sous le bloc de seuils.
- [x] **Méthodologie mise à jour** : nouvelle section « Positionnement du site (benchmark national) » avec la définition du percentile et ses limites.

**Critère d'acceptation** : build + lint clean, tests historique + benchmark passent, badge sprint 15 dans le header.

## Sprint 16 — Portefeuille par département ✅

Thème : **vue portefeuille pour reporting** — regrouper géographiquement les sites de l'utilisateur. Item #9 du backlog expert (heatmap portefeuille multi-sites), réalisé côté client sans dépendance externe.

- [x] **Référentiel départements** (`lib/departements.ts`) : mapping code → nom (96 métropole + Corse 2A/2B + DOM 971-976) et `departementCode` déduisant le département d'un code INSEE (gère Corse et outre-mer). Statique, embarqué, aucun appel réseau. Testé (`scripts/test/departements.test.ts`, 15 checks).
- [x] **Répartition géographique** (`PortfolioByDepartment.tsx`) : sur le dashboard, regroupe les sites par département avec nombre de sites + score moyen, classés du risque moyen le plus élevé au plus faible. Barre colorée par score (effet heatmap) et badge de classe de risque. Ne s'affiche que si les sites couvrent ≥2 départements.
- [x] **Méthodologie mise à jour** : section « Synthèse portefeuille » complétée avec la répartition géographique et la limite (pas de choroplèthe polygonale — géométries non embarquées).

**Limite assumée** : ce n'est pas une vraie carte choroplèthe départementale (qui exigerait d'embarquer les géométries départementales, egress bloqué en dev) mais une agrégation classée. La choroplèthe reste en backlog (Sprint 17).

**Critère d'acceptation** : build + lint clean, tous les tests passent (historique + benchmark + départements), badge sprint 16 dans le header.

## Sprint 17 — Rapport ESG (ESRS E3 / TNFD) ✅

Thème : **valeur entreprise directe** — produire un livrable de reporting durabilité par site. Item #3 du backlog expert (export CSRD/TNFD), réalisé côté client à partir des données déjà calculées, sans dépendance externe.

- [x] **Builder de rapport** (`lib/report.ts`) : fonction pure `buildMarkdownReport(input)` produisant un Markdown structuré — identification du site, score composite + classe de risque + confiance + décomposition des composantes, statut réglementaire par type de zone, historique structurel + pic saisonnier, projection 2050 (indicateurs Q05/médiane/Q95) + positionnement national, correspondance ESRS E3 / TNFD (LEAP) / CDP, sources et avertissement. `reportFilename` slugifie le libellé (accents retirés). Testé (`scripts/test/report.test.ts`, 24 checks).
- [x] **Bouton d'export** (`HomeClient.tsx`) : « 📄 Rapport ESG » sur la fiche site, à côté de Partager. Récupère la projection à la volée, assemble le rapport et télécharge un `.md`. 100 % navigateur, aucune donnée envoyée à un serveur.
- [x] **Méthodologie mise à jour** : nouvelle section « Rapport ESG (ESRS E3 / TNFD) » précisant le contenu, la correspondance aux référentiels et le statut de support de contexte (pas une déclaration de conformité).

**Positionnement assumé** : le rapport est un support de contexte sur l'exposition physique au risque sécheresse, pas une déclaration de conformité — l'avertissement « seul l'arrêté préfectoral fait foi » y est explicite.

**Critère d'acceptation** : build + lint clean, tous les tests passent (historique + benchmark + départements + rapport), badge sprint 17 dans le header.

### Post-Sprint 17 — Fusion profil / secteur (raffinement UX)

Constat utilisateur : deux menus déroulants se recouvraient — l&apos;ancien « profil » (Particulier / Entreprise / Collectivité / Exploitation) et le « secteur » (6 options). Pas de double comptage dans le score (le secteur n&apos;entre pas dans `computeScore`), mais redondance conceptuelle (Collectivité ↔ Collectivité, Exploitation ↔ Agriculture…).

- [x] **Fusion en un seul contrôle** : le secteur (6 options) remplace le sélecteur de profil dans `AddressSearch.tsx`. Le profil VigiEau est **dérivé** du secteur (`profilForSecteur`) — le secteur pilote la requête VigiEau *et* l&apos;interprétation d&apos;impact. Mapping : agriculture→exploitation, collectivité→collectivité, industrie/énergie/services/autre→entreprise.
- [x] **Rétro-compatibilité** : `SavedSite` garde `profil` (dérivé) + `secteur` ; les liens/sites hérités sans secteur sont ré-inférés via `secteurForProfil`.
- [x] **« Particulier » conservé mais secondaire** (retour sur demande) : présenté dans un `<optgroup>` « Usage domestique (secondaire) » séparé des secteurs professionnels, avec un encart dans le panneau d&apos;impact expliquant que l&apos;outil vise les sites professionnels. Il applique bien le profil VigiEau `particulier` et a sa propre table d&apos;impacts domestiques.
- [x] **Tests** (`scripts/test/secteur.test.ts`, mapping total + cohérence profil + flag domestique) et méthodologie mise à jour (« Secteur d&apos;activité : un seul choix, deux effets »).

## Sprint 18 — Rapport ESG portefeuille ✅

Thème : **reporting consolidé** — étendre le rapport ESG du site (Sprint 17) à l'ensemble du portefeuille (Sprint 16). Vue dont a besoin une équipe durabilité pour une annexe de disclosure ou un comité.

- [x] **Builder portefeuille** (`buildPortfolioMarkdownReport` dans `lib/report.ts`) : Markdown structuré agrégeant tous les sites suivis — synthèse (nombre de sites, score moyen et maximum avec classe, répartition par classe de risque), répartition géographique par département (réutilise `departementName`), tableau détaillé par site (département, secteur, statut réglementaire, score, classe) trié par score décroissant, correspondance ESRS E3 / TNFD / CDP et avertissement. Dégrade proprement (portefeuille vide, sites non évalués).
- [x] **Bouton d'export** sur le dashboard (`SitesDashboard.tsx`, `onExportReport`) : « 📄 Rapport ESG » à côté de l'export CSV, télécharge un `.md` (`portfolioReportFilename`). 100 % navigateur, aucune donnée serveur.
- [x] **Tests** : section portefeuille ajoutée à `scripts/test/report.test.ts` (comptage, synthèse, répartition géographique, tri, dégradation à vide).
- [x] **Méthodologie mise à jour** : la section « Rapport ESG » décrit désormais la version portefeuille.

**Critère d'acceptation** : build + lint clean, tous les tests passent, badge sprint 18 dans le header.

## Sprint 19 — Transition & choroplèthe (chantiers data via Actions) ✅

Thème : combler la dernière grande lacune de l'audit expert — le **risque de transition** (absent) — et offrir une vraie **carte départementale**. Les deux nécessitent des données externes, récupérées via l'escape hatch **GitHub Actions** (egress bloqué en dev).

**Escape hatch données** : nouveau workflow `.github/workflows/fetch-refdata.yml` + script `scripts/refdata/fetch_refdata.py` (runner à réseau complet, `requests`/`geopandas`/`shapely`, commit des sorties dans `data/refdata/`, manifest de provenance).

- [x] **B — Carte choroplèthe départementale** ✅ : polygones départementaux simplifiés (france-geojson, 96 départements, coords ~100 m) servis par `/api/departements`, rendus par `PortfolioChoropleth.tsx` (MapLibre, fond neutre) sur le dashboard — chaque département teinté par le score moyen de ses sites. Complète le tableau par département (Sprint 16).
- [x] **A — Panneau de risque de transition** ✅ : `TransitionRiskPanel.tsx` + `lib/transition.ts` sur la fiche site — **Plan Eau 2023** (trajectoire −10 % d'ici 2030, REUT, tarification), décliné **par secteur**, et explication de la **ZRE**. Comble la lacune « zéro risque de transition » de l'audit.
- [x] **A — Statut ZRE par commune** ✅ : **13 033 communes** classées en ZRE, source **Sandre WFS national `sa:ZRE_FXX`** (référentiel eaufrance) — trouvée via un **mode `probe`** ajouté au script (classe chaque source candidate : les URLs data.gouv étaient des portails HTML / hôtes INSPIRE morts, et « ZRE » d'Île-de-France = zones de reconquête *économique*, hors sujet). Jointure spatiale ZRE × communes pré-calculée, servie par `/api/transition`. Couverture France métropolitaine continentale.
- [x] **Méthodologie + tests** : sections « Risque de transition » et « Carte départementale » ; `scripts/test/transition.test.ts`.

**Bilan** : B et A livrés à 100 %. Le blocage ZRE initial (sources data.gouv fragmentées/mortes) a été levé par un mode `probe` systématique qui a identifié le WFS Sandre national comme source fiable. La lacune n°1 de l'audit expert (« zéro risque de transition ») est comblée avec une donnée ZRE nationale authentique.

**Critère d'acceptation** : build + lint clean, tous les tests passent, badge sprint 19 ; choroplèthe fonctionnelle ; panneau transition fonctionnel (ZRE en dégradé gracieux).

## Sprint 20 — Indice d'anticipation des restrictions (horizon saisonnier) ✅

Thème : combler l'**horizon temporel manquant**. L'outil couvrait *maintenant* (VigiEau live) et *2050* (Explore2) ; il manquait le milieu — les **prochaines semaines jusqu'à la fin de l'étiage** — précisément l'horizon dont une entreprise a besoin pour *anticiper* un passage (ou une aggravation) en restriction. Réalisé **100 % in-repo, sans nouvelle source ni egress**, à partir de données déjà récupérées sur la fiche site.

- [x] **Module pur `lib/anticipation.ts`** : `computeAnticipation(input)` combine, de façon transparente et renormalisée, (1) une **base saisonnière** (climatologie — pic du risque mensuel historique sur les mois à venir, via `computeSeasonalProfile` réutilisé) qui **ancre** l'indice et le maintient bas hors saison, et (2) une **pression « état actuel »** — signaux précurseurs déjà normalisés 0-100 (IPS nappe pondérée le plus fort, débit VCN10/QMNA5, assecs Onde, niveau VigiEau courant, chacun nuancé par sa tendance 14 j) qui ne relève l'indice que si la saison est « ouverte ». Plus un **facteur de trajectoire** (année en cours vs normale au même stade) et un **plancher** en cas de restriction déjà en vigueur. Sortie sur 4 niveaux (Peu probable → Très probable) avec **moteurs détaillés**, confiance et avertissement (« conditions propices, pas une prévision de l'arrêté »).
- [x] **`components/AnticipationPanel.tsx`** : panneau calculé à partir des props déjà en state dans `HomeClient` (historique saisonnier + Onde + indicateurs hydro/piézo), placé **entre l'historique et le bloc 2050** (ordre temporel logique). Dégradation gracieuse tant que les signaux Hub'Eau ne sont pas arrivés.
- [x] **`computeSeasonalProfile`** rendu déterministe pour les tests (paramètre `currentYear` optionnel, rétro-compatible).
- [x] **Tests** (`scripts/test/anticipation.test.ts`, 22 checks) : gate hors saison, pic saisonnier + nappe basse + année en avance, dégradation à l'historique seul, plancher en alerte/crise, renormalisation des poids, horizon qui passe l'année.
- [x] **Méthodologie mise à jour** : section « Anticipation des restrictions (horizon saisonnier) » (composantes, poids, horizon, limites — conditions vs décision administrative, non-prévisibilité météo au-delà de 2 semaines, meilleure fiabilité sur les zones souterraines).

**Positionnement assumé** : c'est un indicateur d'**anticipation transparent et explicable**, pas une prédiction déterministe de l'arrêté préfectoral (qui dépend des seuils de l'arrêté-cadre départemental et de la décision du préfet) ni une prévision météo. Cadré comme le bloc 2050 : *tendances, pas prévisions*.

**Critère d'acceptation** ✅ : build + lint clean, tous les tests passent (dont les 22 d'anticipation), 12/12 e2e, badge sprint 20 dans le header.

### Post-Sprint 20 — Prévision officielle des nappes : lien MétéEAU (BRGM) ✅

Suite du follow-up « prévision de nappe » ouvert par le Sprint 20. **Instruit puis tranché**, sans nouveau sprint fonctionnel (le badge « Démo — Sprint 20 » reste).

- [x] **Investigation (5 passes via l'escape hatch Actions)** : l'API **MétéEAU des nappes** existe et conviendrait parfaitement (prévision IPS 6 mois par `code_bss`, comparée aux seuils saisonniers) mais elle est **verrouillée par OAuth2** (Keycloak BRGM, `security` global, 401 `WWW-Authenticate: Bearer`), et **aucun dataset de prévision n'est publié sur data.gouv**. Aucun accès ouvert n'existe.
- [x] **Décision (utilisateur) : renvoyer par un lien, ne pas ré-héberger.** Ré-héberger serait non viable (couverture nationale, péremption mensuelle) et juridiquement incertain ; renvoyer à la source garde la donnée fraîche, attribuée et correctement licenciée, en cohérence avec le local-only.
- [x] **`lib/meteeau.ts`** : helper pur `meteeauForecastUrl(lat, lon)` + textes statiques `METEEAU_NOTE` / `METEEAU_WHY_LINK` (même pattern que `lib/transition.ts`). URL publique = **`https://app.meteeaunappes.brgm.fr/`** (SPA Angular = le vrai visualiseur ; le domaine `meteeaunappes.brgm.fr` n'est qu'un site Drupal institutionnel). Pas de schéma de centrage lat/lon confirmé → `METEEAU_SUPPORTS_CENTERING = false`, on n'invente pas de paramètres ignorés par le visualiseur (flag à basculer si une route de centrage est confirmée).
- [x] **`AnticipationPanel`** : lien sortant affiché **dans les deux états** (indice disponible ou non — la prévision officielle est utile indépendamment de notre indice), accompagné d'un encart expliquant **pourquoi c'est un lien et pas une intégration** (API officielle authentifiée, réactualisée mensuellement, maintenue à la source).
- [x] **Méthodologie + attribution footer** : paragraphe dédié dans la section « Anticipation des restrictions » et source « MétéEAU des nappes (BRGM) » ajoutée au footer.
- [x] **Tests** : le builder d'URL est couvert dans `scripts/test/anticipation.test.ts` (URL absolue BRGM, dégradation propre sur coordonnées manquantes/hors bornes, pas de paramètres inventés).
- [x] **Scaffolding de probe purgé** (`scripts/nappe/`, workflow `fetch-nappe-forecast.yml`, `data/refdata/nappe-*.json`) — le constat est conservé dans le HANDBOOK pour éviter tout re-probe.

**Limite assumée** : la prévision **n'entre pas dans le score**. La dimension nappe de l'indice d'anticipation reste calculée sur l'IPS **observé** (Hub'Eau/ADES, données ouvertes) ; le lien MétéEAU est un complément prospectif consultable.

### Post-Sprint 20 — Export PDF du rapport ESG ✅

Premier point du backlog (§5 du HANDBOOK). Le rapport (site + portefeuille) existait déjà en Markdown depuis les Sprints 17-18 ; il manquait un export directement imprimable/partageable en PDF.

- [x] **Choix : impression navigateur, pas de librairie de rendu** — cohérent avec le refus déjà pris de deps lourdes pour le build (Playwright non ajouté à `package.json`) et avec le principe local-only (zéro aller-retour serveur, zéro service de rendu tiers).
- [x] **`lib/reportHtml.ts`** : `markdownToHtml(markdown)` convertit le sous-ensemble Markdown **contrôlé** produit par `buildMarkdownReport`/`buildPortfolioMarkdownReport` (titres, tableaux, listes, gras/italique) en HTML sémantique — source de contenu unique, aucune duplication de la logique d'assemblage du rapport. Tout le texte est échappé avant insertion (les libellés de site sont du texte utilisateur, via la BAN). `reportPrintHtml(markdown, title)` enveloppe le résultat dans un document HTML autonome avec CSS `@media print` et un bouton « 🖨️ Imprimer / Enregistrer en PDF ».
- [x] **Boutons** « 🖨️ Version PDF » (fiche site, `HomeClient.tsx`) et « 🖨️ PDF » (portefeuille, `SitesDashboard.tsx`), à côté du bouton Markdown existant — ouvrent le rapport dans un nouvel onglet imprimable plutôt que de télécharger un fichier.
- [x] **Fiabilité popup** : `window.open()` appelé dans le préfixe synchrone du handler (avant tout `await`) pour ne pas être bloqué ; repli en téléchargement du `.html` si la fenêtre est malgré tout bloquée — l'export fonctionne dans tous les cas.
- [x] **Tests** (`scripts/test/report.test.ts`, +17 checks) : rendu des titres/tableaux/listes/gras pour les deux rapports, échappement HTML sur un libellé de site malveillant (`<img onerror>`, guillemets, esperluette), document complet (doctype, titre échappé, bouton d'impression, CSS `@media print`).
- [x] **Vérifié en navigateur réel** (Playwright) : les deux boutons ouvrent bien un onglet avec le rapport correctement rendu (tableaux, gras, avertissement) ; capture d'écran de contrôle.

**Critère d'acceptation** ✅ : build + lint clean, `report.test.ts` passe (dont les nouveaux checks PDF), 12/12 e2e.

## Sprint 21 — Jours d'activité contrainte ✅

Thème : **faire parler les composantes entre elles**. L'outil affichait les arrêtés, une projection climatique et des volumes prélevés côte à côte, sans jamais répondre à la question qui déclenche une décision d'exploitation : *combien de jours par an mon activité est-elle réellement freinée, et combien en 2050 ?*

**Revue utilisateur en cours de route (déterminante)** : une première version calculait le chiffre à partir d'une table d'exposition « secteur × niveau » **calibrée à la main**. Écartée — c'était le point faible du modèle. Deux critiques : (1) « une entreprise en crise ne peut-elle vraiment plus prélever ? » — non, ce sont les prélèvements *non prioritaires* qui cessent, et tout dépend de l'origine de l'eau ; (2) la section usages se limitait à « agriculture vs résidentiel » alors que l'arbitrage se joue entre consommateurs.

- [x] **Étape 0 — probe des sources via Actions** (`scripts/restrictions/probe_restrictions.py`, workflow `probe-restrictions.yml`). Résultats dans `data/restrictions/probe.json`. Trois découvertes : la ressource **« Restrictions »** (23 Mo, 77 056 lignes) donne les usages restreints par arrêté × zone × niveau avec les 4 drapeaux d'audience ; le **« Restriction Guide Sécheresse »** (14 Ko) est la matrice nationale officielle, assez petite pour être embarquée ; les **Arrêtés 2012→2024** existent en CSV annuels (73 Ko–2 Mo). Bonus : la jointure BNPE `chroniques → referentiel/ouvrages` sur `code_ouvrage` a un **taux de 1,0** et récupère `libelle_type_milieu` — ce qui **lève le cul-de-sac documenté** (« la chronique BNPE n'a pas de champ milieu » : vrai de la chronique, faux de l'ouvrage).
- [x] **`lib/restrictions.ts`** : la sévérité est **lue** dans la prose des arrêtés, pas posée. Pas de champ structuré, mais les formulations sont régulières et souvent chiffrées — « Interdiction de 8h à 20h » = 12 h/24 = 0,5, mesuré. Pourcentages parsés. À défaut : interdiction 1,0, interdiction avec dérogation 0,85, sensibilisation 0. Illisible ⇒ `undefined`, jamais 0. Exposition = **moyenne** sur les usages concernant le profil (pas un max : un usage interdit sur quinze n'arrête pas un site). 29 tests calibrés sur des libellés **verbatim** du fichier réel.
- [x] **`lib/interruption.ts`** : `jours contraints = Σ jours(niveau) × exposition(niveau)`, pondération bornée jamais un quotient. Trois horizons — *année type* (moyenne des années complètes uniquement), *fin de saison* (climatologie mensuelle × ajustement dérivé de `AnticipationResult.index`, **consommé** et non redupliqué), *2050* (`dtBE_yr` allonge, `VCN10_ete` intensifie en décalant les jours vers le haut **sans en créer**, enveloppe q05–q95). 27 tests.
- [x] **Origine de l'eau** (`levelForOrigin` dans `lib/vigieau.ts`) : corrige un biais réel — `worstLevel` prend le max sur SUP/SOU/AEP, donc un site sur réseau héritait d'une nappe qu'il ne pompe pas. `worstLevel` **inchangé** (score composite et dashboard préservés).
- [x] **Données embarquées** (`scripts/restrictions/build_restrictions.py`) : guide national (19 Ko) + usages restreints par département (99 shards, 7,6 Mo, plus gros 273 Ko), servis par `/api/restrictions`. **Le classifieur n'est volontairement pas réimplémenté en Python** — un seul classifieur, testé, en TS.
- [x] **`InterruptionPanel`** placé en tête des blocs pleine largeur : triptyque, exposition par niveau, et le détail auditable des usages restreints en crise. Deux contrôles optionnels (origine, dépendance) sur une seconde rangée, défauts neutres pour les sites déjà enregistrés.
- [x] **`BnpePanel` → panneau d'arbitrage** : usage × milieu (jointure ouvrages), ordre de restriction (`lib/arbitrage.ts`, décret 2021-795) avec le secteur du site mis en évidence.
- [x] **Portefeuille + rapport ESG** : colonne « jours contraints » et tuile cumulée (horizon année type seul), section 6 du rapport (ESRS décalé en 7), exposition mise en cache par (département, type de zone, profil).
- [x] **Méthodologie** : deux sections neuves, dont les limites assumées (pas de pondération par les volumes, interdiction horaire comptée en fraction de journée).

**Résultat mesuré** (Eure-et-Loir, zone SUP, profil entreprise) : exposition 0 en vigilance, 0,55 en alerte, 0,67 en alerte renforcée, **0,70 en crise**. Une entreprise en crise perd l'essentiel de ses usages eau, pas la totalité — ce que le chiffre gradué traduit fidèlement.

**Critère d'acceptation** ✅ : build + lint clean, 12 suites de tests au vert (dont 2 neuves), 12/12 e2e, badge Sprint 21.

## Sprint 22 — Robustesse du modèle de jours ✅

Suite directe du Sprint 21 : renforcer les fondations du chiffre plutôt qu'ajouter des fonctionnalités. Trois questions du backlog instruites d'un coup via un probe Actions (`scripts/restrictions/probe_backlog.py` → `data/restrictions/backlog-probe.json`), puis traitées selon leur réponse.

- [x] **Fenêtre d'historique 5 → 10 ans.** Le probe a mesuré le CSV maître à **12 452 arrêtés couvrant 2010→2026**, avec des effectifs annuels correspondant quasi exactement aux archives annuelles (2013 : 217 vs 217 ; 2019 : 894 vs 894). L'écart entre 168 arrêtés en 2014 et 2 041 en 2023 est de la **variabilité de sécheresse réelle**, pas un trou — précisément l'argument pour moyenner sur davantage d'années. **Coût mesuré, pas supposé** (`scripts/test/history-window.bench.ts`, fichier synthétique au profil réel) : 964 ms à 5 ans, 1601 ms à 10, 2046 ms à 13 — très loin du budget de 60 s. 10 retenu : plus du double d'échantillon tout en restant à l'écart de 2010-2011 où le fichier s'amincit vraiment (24 arrêtés en 2010). Constante surchargeable par `HISTORY_WINDOW_YEARS`. Sécurité prouvée par test : 5 ans de données dans une fenêtre de 10 laissent `anneesCompletes` à 4, sans inventer 6 années calmes.
- [x] **`parMoisNiveau`** — découpage mensuel **par niveau de gravité**, ajouté **à côté** de `parMois` (dont la forme agrégée est consommée par `computeSeasonalProfile`, `RestrictionHistory`, `anticipation` et `report`). L'horizon *fin de saison* empruntait le mix annuel, ce qui aplatissait le pic : les jours de crise se concentrent en fin d'été. Test dédié : les deux chemins s'accordent sur les jours sous arrêté mais divergent sur le chiffre contraint — c'est tout l'enjeu.
- [x] **ZRE hors métropole : instruit, aucun gain.** `sa:ZRE` existe bien à côté de `sa:ZRE_FXX` et se lit, mais renvoie **le même contenu** (13 033 communes, 64 départements, Corse et outre-mer vides). `/api/transition` conserve donc `available: false` pour 2A/2B/97x/98x — la lecture prudente. Consigné pour ne pas re-prober.
- [x] **Explore2 QMNA5 / recharge : n'existent pas dans cette collection.** L'énumération complète des ressources TRACC ne donne que `VCN10_été`, `QA_yr`, `dtBE_yr` (déjà extraits) et `QJXA_yr`/`dtCrues_yr` (indicateurs de **crue**, hors sujet). La recharge relève du volet souterrain DRIAS-Eau / Aqui-FR, un autre jeu. Limite assumée : les zones SOU restent projetées avec un indicateur de débit de surface.

**Critère d'acceptation** ✅ : build + lint clean, 12 suites au vert, 12/12 e2e.

## Sprint 23 — Humidité des sols (SWI) & granularité ESRS ✅

Thème : le **dernier précurseur manquant** de l'indice d'anticipation, et la profondeur du rapport ESG.

- [x] **SWI Météo-France intégré** (`lib/swi.ts`, `/api/swi`, `scripts/swi/build_swi.py`). Le sol s'assèche des semaines avant la nappe : c'est le signal le plus précoce de la chaîne. Standardisé comme l'IPS — rang de la valeur du mois dans la distribution de la **même maille** pour le **même mois calendaire** sur 1990-2019.
- [x] **Séparation embarqué / live, sur le précédent MétéEAU** : la climatologie (8 981 mailles × 12 mois, 3,9 Mo en 40 buckets + 340 Ko de grille) est **stable par construction** et embarquée ; le **mois courant ne l'est pas** — il se périmerait en silence — et se récupère à la volée avec cache, comme le CSV des arrêtés.
- [x] **CRS résolu par validation, pas par confiance** : la documentation du jeu annonce « Lambert 2 étendu, hectomètres », mais les valeurs observées ne collent qu'au **Lambert-93 en mètres**. Le script essaie les candidats et retient celui dont les mailles converties tombent en France — mesuré : Lambert-93 m → **100 %**, les trois autres → **0 %** — et refuse de deviner si aucun ne passe.
- [x] **Branché dans `computeAnticipation`** avec un poids (12) **inférieur à la nappe** (30) : signal plus rapide donc plus bruité. Renormalisation vérifiée par test — un signal absent se répartit sur les autres au lieu d'être lu comme « sol parfaitement humide ».
- [x] **Granularité ESRS E3** : la correspondance passe de trois puces à un tableau **point de publication par point de publication** (IRO-1, E3-1→E3-5, TNFD LEAP, CDP W1/W3/W4), avec une colonne « à compléter par l'entreprise ». La ligne de partage est explicite : l'outil documente l'**exposition du site à la ressource**, jamais la **consommation** de l'entreprise — pour E3-4 il fournit le dénominateur géographique, pas les volumes.
- [x] **Tests** : `scripts/test/swi.test.ts` (rattachement de maille, monotonie du percentile, distribution dégénérée, sol sec = score haut, dégradations) + section SWI dans `anticipation.test.ts`.

**Vérifié en réel malgré l'egress bloqué** : un point outre-mer est rejeté « hors couverture SAFRAN » **avant tout appel réseau**, ce qui prouve que la grille embarquée et le rattachement fonctionnent ; un point métropolitain passe le garde-fou et échoue proprement sur le 403 du proxy.

**Critère d'acceptation** ✅ : build + lint clean, 13 suites au vert, 12/12 e2e, badge Sprint 23.

## Sprint 24 — Bassin, agence de l'eau et clôture du backlog ✅

- [x] **Bassin & agence de l'eau** (`lib/bassins.ts`, `scripts/refdata/fetch_bassins.py`, mode `bassins`) : **35 186 communes** rattachées aux 9 bassins DCE depuis `sa:BassinDCE` (Sandre). Le panneau de transition nomme désormais l'agence dont dépend le site, avec un lien vers son programme d'aides — chaque agence a son SDAGE, ses redevances et ses aides. ⚠️ Le bassin est résolu **indépendamment du garde-fou ZRE** : Ajaccio résout le bassin Corse alors que son statut ZRE reste indisponible.
- [x] **Horizons portefeuille étendus** : *fin de saison* (climatologie seule, sans appel amont — l'indice d'anticipation exigerait 3 appels par site) et *2050* (via `/api/projection?citycode=`, lecture de fichier local). Les deux dans la colonne du tableau, le total 2050 dans la tuile, et les deux dans le rapport ESG portefeuille. Un site non estimable affiche un tiret, jamais 0.
- [x] **Backlog clos avec motif** : Propluvia `zones_communes.csv` **sans objet** (ne porte pas le niveau de gravité, donc l'appel VigiEau reste nécessaire — zéro économie) ; **tarification progressive locale** sans référentiel national (fixée par commune/syndicat) ; **BDLISA** cadré avec son blocage nommé (référentiel multi-couches, « l'aquifère d'un point » demande une règle métier).

**Critère d'acceptation** ✅ : build + lint clean, 13 suites au vert, 12/12 e2e, badge Sprint 24.

## Sprint 25 — Rattachement à l'aquifère (BDLISA) ✅

Dernier item ouvert du backlog. **Débloqué en changeant la question, pas en trouvant une donnée.**

- [x] **Constat mesuré** (`data/refdata/bdlisa-probe.json`) : `sa:EntiteHydroGeol` répond **au point**, renvoie **4-5 entités emboîtées** avec `CodeEH`/`LibelleEH`/`NiveauEH`/`EtatEH`, codes distincts par territoire (Beauce, Montpellier, Lille, Bordeaux).
- [x] **Le blocage documenté — « quelle entité choisir ? » — disparaît en cessant de choisir.** Ce dont la sélection de station a besoin n'est pas « l' »aquifère du site, mais de savoir si le piézomètre appartient à **l'un** des aquifères sous le site. Une **appartenance ensembliste** contourne entièrement l'imbrication.
- [x] **Tri** : disponibilité → appartenance aquifère → distance. Un piézomètre à 15 km dans le bon aquifère passe devant un piézomètre à 2 km dans un autre. ⚠️ Un piézomètre **sans code publié n'est pas pénalisé** (absence ≠ preuve d'un autre aquifère) et, sans BDLISA, le tri redevient exactement celui d'avant.
- [x] **Interrogé en direct** (`/api/bdlisa`, cache 30 j) : jeu national volumineux, un seul point utile — rien à embarquer.
- [x] **Tests** (`scripts/test/bdlisa.test.ts`) sur la forme réelle de la réponse : déduplication, tri par niveau, appartenance insensible à la casse, non-mutation de l'entrée, et dégradation vers le tri distance sans BDLISA.

**Correctif de fiabilité au passage** : le calcul des jours contraints du portefeuille lançait des requêtes dupliquées — l'effet dépend de `statuses` et se relance à chaque mise à jour, alors que le garde `joursContraints !== undefined` ne protège pas pendant le fetch **en vol**. Chaque site est désormais réservé avant le début de son travail asynchrone, et libéré s'il est supprimé.

**Critère d'acceptation** ✅ : build + lint clean, 14 suites au vert, 12/12 e2e, badge Sprint 25.

## Reste ouvert (backlog, chacun = vrai chantier de données)

- Pondérer l'exposition des jours contraints par les **volumes consommés** — bloqué : VigiEau ne publie aucun volume par usage. C'est la limite principale du modèle, documentée dans la méthodologie.
- BNPE intégré au score via un ratio prélèvements/ressource à l'échelle du sous-bassin — bloqué tant qu'il n'y a pas de donnée de ressource renouvelable par sous-bassin (BD Topage + bilans quantitatifs).

## Sprint 26 — Le portefeuille comme objet d'analyse ✅

Idéation large (`docs/IDEATION-PORTEFEUILLE.md`, 8 axes + benchmark des modèles existants) puis
implémentation des deux axes retenus. Le tableau de bord **empilait** des analyses de site ; il
analyse désormais le **parc**.

- [x] **Périodes RLE** (`lib/history.ts`) : `ZoneHistory.periodes` = triplets plats
  `[jour, longueur, rang]`, compressés depuis la map jour→rang que le parseur construisait déjà et
  **jetait**. Émises uniquement sur `?periodes=1` — sans le paramètre la réponse est strictement
  celle d'avant. Balayage sur la plage de jours plutôt que tri des clés : **coût mesuré au banc à
  +330 ms sur ~2 200 zones / 10 ans** (2 300 → 2 630 ms), loin du budget de 60 s.
- [x] **Corrélation entre sites** (`lib/portefeuille.ts`) : simultanéité **rejouée** sur les années
  complètes (pic daté et sa durée, distribution « k sites simultanés », année la plus lourde, pic
  pondéré par exposition × dépendance), concentration en HHI restituée par son inverse lisible
  (« vos 40 sites se comportent comme 4,2 zones indépendantes »), grappes co-exposées, et part des
  jours contraints partagés avec le reste du parc. **Un seul appel `/api/history`** pour l'union des
  zones du parc, quel que soit le nombre de sites.
- [x] **m³ et € à risque** : la limite n°1 du modèle (« pondération par les volumes bloquée ») était
  une **erreur sur le détenteur de la donnée** — VigiEau ne publie pas les volumes, l'entreprise les
  connaît. Quatre champs déclarés par site (volume m³/an, autonomie, €/jour, CA), saisis dans un bloc
  repliable. Repli sur l'ordre de grandeur Swiss Re (0,5 % du CA par jour d'interruption) **étiqueté
  comme tel**. Aucun n'entre dans `computeScore`.
- [x] **Jours d'arrêt nets d'autonomie** : `Σ max(0, durée_épisode − autonomie)`. Possible seulement
  grâce aux périodes — un tampon de 3 j absorbe une restriction de 2 j, et aucun total annuel ne peut
  le voir. Deux niveaux adjacents forment **un seul** épisode (une alerte qui durcit en crise ne
  laisse pas la bâche se remplir).
- [x] **Executive summary** (`lib/executive.ts` + `PortfolioExecutiveSummary.tsx`) en tête de
  `/sites`, après l'entrée des sites et **avant** les tuiles : situation, coût, concentration,
  trajectoire, où agir, **et ce que le résumé ne sait pas**. Chaque phrase naît d'un fait calculé —
  fait absent, phrase absente : pas de gabarit à trous. Même builder pour l'écran et le rapport ESG.
- [x] **Correctif** : `saveCurrentSite` **perdait `origine` et `dependance`**. Le tableau de bord
  retombait donc sur « origine inconnue, dépendance moyenne » pour tous les sites, et sa colonne
  « jours contraints » contredisait silencieusement la fiche site dont elle venait.
- [x] Rapport ESG portefeuille : section « Synthèse » avant les faits + section « Corrélation entre
  sites » (renumérotation du détail par site). Colonnes CSV neuves : jours contraints, 2050, zone,
  m³, €, source du chiffre €, jours d'arrêt net, part simultanée — **vides et jamais 0** quand la
  donnée n'est pas déclarée.

**Critère d'acceptation** ✅ : build + lint clean, **16 suites au vert** (2 neuves : `portefeuille`,
`executive`), **22/22 e2e** (10 checks neufs), badge Sprint 26.

**Validé en réel** (diag Actions mode `app`, run 24, puis `scripts/diag/replay-portefeuille.ts`) —
et le protocole a encore payé : il a **attrapé un bug de dénominateur invisible sur fixtures**.
VigiEau redécoupe son référentiel de zones, donc un code en vigueur aujourd'hui n'apparaît pas dans
les arrêtés antérieurs à sa création : le fichier couvre 2017→ mais `84_69_0004` (Lyon) ne commence
qu'en 2022. Dater la fenêtre du premier arrêté divisait les grandeurs « par an » par 4 au lieu de 9
— **59 j/an de jours multi-sites au lieu de 26,2**. Le dénominateur est désormais la **couverture du
fichier** (`PortfolioInput.couvertureDepuis`), une année couverte sans arrêté étant un calme mesuré
et non un trou. Non-régression ajoutée.

Après correctif, sur un parc réel de trois sites très éloignés (Perpignan, Chartres, Lyon) :
invariant périodes↔agrégats **exact**, contrat de l'opt-in respecté, fenêtre 2017-2025, et un **pic
de 3 sites sur 3 contraints simultanément pendant 84 jours consécutifs à partir du 2023-08-04**.
Trois sites à 600 km les uns des autres, dans trois bassins différents, arrêtés ensemble près de
trois mois : exactement ce qu'aucune somme de jours ne peut montrer. Chartres partage 97 % de ses
jours contraints avec le reste du parc, Perpignan 26 %.

## Sprint 27 — Ressource en eau par site ✅

Deux questions posées : d'autres sources pour les restrictions, et un modèle de ressource disponible
par site.

**Sur les restrictions, la réponse est courte et négative** : Propluvia est **décommissionné**,
VigiEau est le canal officiel unique, il n'existe pas d'alternative live. Arbitrage : chercher les
sources qui expliquent **pourquoi** la restriction tombe, plutôt qu'une seconde source du même fait.

**Sur la ressource, un blocage vieux du Sprint 10 est levé** — et il n'a jamais été un problème de
donnée manquante, mais de question mal posée.

- [x] **Trois passes de sonde avant la moindre ligne de modèle**, dont deux ont changé sa conception.
  Convention du dépôt : on ne code pas contre une donnée dont on n'a pas vérifié l'existence.
- [x] **`computeModule`** (`lib/hubeau.ts`) : la moyenne de la **même série QmnJ 18 ans** qui sert
  déjà au VCN10. Aucun téléchargement supplémentaire — la donnée était là, on la jetait. Années
  incomplètes exclues (< 330 j) : un été isolé tirerait le module vers l'étiage.
- [x] **`lib/ressource.ts`** : `module ÷ surface_bv` = débit spécifique → transposé à la commune →
  ressource m³/an → **taux d'exploitation sur l'échelle WRI Aqueduct** → part du site (volume déclaré
  au Sprint 26). Transposition par débit spécifique = **méthode de référence OFB/DREAL pour un bassin
  non jaugé**, pas une invention. Chaîne affichée **étape par étape** : c'est un modèle, en cacher la
  dérivation lui vaudrait une confiance qu'il n'a pas méritée.
- [x] **Le modèle refuse de répondre** là où il n'a rien à dire : forage (un débit de rivière ne
  mesure pas une nappe), surface de bassin absente, rapport de surfaces aberrant. Un refus motivé,
  jamais un chiffre absurde ni un zéro.
- [x] **Fenêtre d'historique 10 → 14 ans**, coût mesuré au banc (1 900 → 2 600 ms). `premiereAnnee`
  ajouté pour **exposer** le biais que l'élargissement amplifie sur les zones récemment redécoupées,
  plutôt que de le trancher en silence.
- [x] **Hors score composite** (décision utilisateur) : le modèle repose sur une transposition
  spatiale approximative, le valider à l'œil avant qu'il ne déplace des scores enregistrés est
  réversible ; l'inverse ne l'est pas.

**Ce que les sondes ont mesuré, et qui limite le modèle** :

| Constat | Conséquence |
|---|---|
| `surface_bv` est sur `referentiel/sites`, **pas** sur `/stations` | une jointure par `code_site` s'impose |
| **895 sites sur 2 000** portent une surface (45 %) | le modèle est **muet sur plus de la moitié du réseau** — su avant d'y investir |
| Surfaces de 0,001 à 65 300 km² (médiane 173) | borne obligatoire sur le rapport de surfaces |
| Nomenclature Sandre de `influence_generale_site` **illisible** (400 ×2) | code affiché brut, **jamais calculé avec** |
| **Aucun état quantitatif national des masses d'eau** en open data | volet souterrain abandonné, refus explicite + renvoi vers l'IPS |

**Critère d'acceptation** ✅ : build + lint clean, **17 suites au vert** (1 neuve), **22/22 e2e**.

⚠️ Le volet « officiel » du plan initial — état quantitatif par masse d'eau pour couvrir les sites
sur forage — **n'a pas pu être livré** : la donnée n'existe pas sous forme nationale exploitable
(699 couches Sandre énumérées, 18 attributs inspectés, aucun état). Consigné au HANDBOOK pour ne pas
être re-sondé.

## Sprint 28 — Deux dénominateurs, deux questions ✅

Suite directe d'une question de revue : « ces 2 points ne nécessitent pas une correction du modèle ? »
**Oui — et le correctif du Sprint 27 traitait le symptôme.**

Le Sprint 27 divisait les prélèvements par la **production locale**, tout en appelant le résultat
« taux d'exploitation » et en le graduant sur l'**échelle WRI** — qui rapporte au contraire les
prélèvements à la ressource **disponible, apports amont compris**. Le nom et l'échelle désignaient
une grandeur, le calcul en faisait une autre. Retirer la classe au-delà de 100 % masquait l'endroit
où ça se voyait, sans corriger ce qui se passait partout ailleurs.

- [x] **`pressionCoursEau`** = prélèvements ÷ **débit disponible au point** (`module × secondes/an`,
  le module intégrant tout l'amont). « Le cours d'eau a-t-il assez d'eau ? » — **seule** à porter la
  classe WRI.
- [x] **`autonomieTerritoire`** = prélèvements ÷ production du territoire. « Ce territoire vit-il de
  sa propre eau ? » — **jamais de classe WRI**, un test l'interdit. `dependanceAmont` devient une
  **lecture du ratio** au lieu d'un cas spécial câblé à un seuil.
- [x] **Démonstration, chiffres réels du rejeu** : sur Chartres, les **mêmes entrées** donnent
  **0,8 % « Faible »** en pression et **37 %** en autonomie. Deux ordres de grandeur.
- [x] **Gain de couverture non cherché** : la pression ne demande **que le module**, pas `surface_bv`
  — absent sur **55 % du réseau** et qui faisait jusqu'ici échouer le panneau entier. Les refus ne
  condamnent plus que leur branche (Orléans perd sa production locale, garde sa pression).
- [x] **Réserve neuve** : la station rattachée n'est pas forcément la source du site — Toulouse est
  rattachée à l'Hers alors qu'elle prélève dans la Garonne.
- [x] **Invariant ajouté au rejeu réel** : une commune étant une fraction du bassin qui l'alimente,
  la pression doit rester **inférieure** à l'autonomie — sinon les deux divisions ont été échangées.

**Critère d'acceptation** ✅ : build + lint clean, **17 suites au vert**, 22/22 e2e.

## Sprint 29 — Carte des ressources en eau ✅

Demande utilisateur : *« ajouter une page avec une carte de la France affichant les nappes et
stations (et autres données) [pour] voir ces sites importants en terme d'eau à proximité d'une
adresse voulue. »* L'outil ne savait répondre qu'à une question ponctuelle (« quel risque à cette
adresse ? ») ; il montre désormais **où sont les objets physiques de la ressource**.

Couches retenues à l'arbitrage : stations Hub'Eau (débit, piézomètres, ONDE), **contours de nappes**,
**ouvrages BNPE**. Écartée : les zones de restriction VigiEau (`/api/pmtiles` existe déjà, ajout
ultérieur trivial).

**Trois passes de sondage avant la moindre ligne de code produit**, et deux d'entre elles ont changé
la conception :

| Ce que le sondage a mesuré | Conséquence |
|---|---|
| Les ouvrages BNPE **portent** `longitude`/`latitude` + `geometry` | **item 8 bis du backlog levé** — la couche est constructible |
| …mais `libelle_precision_coord` = « Coordonnées du centroïde de la commune » sur une part des ouvrages | points **conservés et signalés** (translucides + mention dans la popup), jamais présentés comme relevés |
| `libelle_usage_principal` **n'existe pas** sur ce référentiel | l'aurait mis en 400 : champ retiré avant le premier appel |
| Le référentiel piézo renvoie **exactement 500 lignes** à 60 km (page pleine) | une couche pleine **dit** que la vue est incomplète, au lieu d'en avoir l'air |
| `geometry` vide sur **500/500** piézomètres, `x`/`y` remplis sur 500/500 | confirme le piège du Sprint 9, le parseur lit les deux |
| Masses d'eau souterraines : **639 entités, 237 Mo** en national, **19,5 Mo pour un seul viewport** | **les deux options du plan tombent** : le WFS filtre *quelles* entités il renvoie, jamais leur résolution |

- [x] **`lib/carteEau.ts`** — parseurs purs par référentiel + orchestrateur où **chaque couche échoue
  seule** (une panne Hub'Eau n'efface pas la carte). Réutilise `bboxAround`/`haversineKm`/`hubeauJson`
  de `lib/hubeau.ts`, désormais exportés ; `bboxAround` prend un rayon optionnel, aucun appelant
  existant n'est touché. Aucun chiffre n'entre dans `computeScore` — c'est un **repère**, pas un modèle.
- [x] **`/api/carte?lat=&lon=&rayon=`** — rayon **borné côté serveur** (5-100 km) : le client peut être
  déplacé sur une emprise continentale.
- [x] **Couche nappes embarquée** : `scripts/refdata/fetch_nappes.py` télécharge les 237 Mo une fois
  sur le runner, garde les **621 masses d'eau affleurantes** (`SurfaceAffKm > 0`), simplifie en
  Lambert-93 et **descend une échelle de tolérances jusqu'à tenir un budget d'octets** — 200 m
  donnait 3,78 Mo, **400 m donne 2,35 Mo**, retenu. Servie par `/api/nappes`.
- [x] **Page `/carte`** : recherche d'adresse (autocomplete extrait de `AddressSearch`), sélecteur de
  rayon, bascules par couche, **« Rechercher dans cette zone »**, popup avec lien **« Analyser ce
  point »** vers la fiche existante, et un encart **« ce que la carte ne dit pas »**.
- [x] **Bug attrapé en regardant la page, pas les chiffres** : `map.on("load")` de MapLibre attend que
  **toutes** les sources se stabilisent, fond raster compris — fond injoignable, l'évènement ne part
  jamais et **aucune couche n'est installée**, pas même le fichier de nappes servi localement.
  `map.isStyleLoaded()` a le même défaut. Corrigé sur cette carte **et sur `ZonesMap`**, qui portait
  le même piège en silence depuis le Sprint 3.

- [x] **Bug trouvé sur données réelles, invisible sur fixtures** : la couche des ouvrages revenait
  **tronquée à tous les rayons** — 10 km sur Lyon suffisent à saturer une page de 500 lignes, le
  réseau de prélèvement étant bien plus dense que les réseaux de mesure. Page portée à 5 000 pour
  cette couche, et **deux messages distingués** là où il n'y en avait qu'un : « le serveur s'est
  arrêté, on ignore ce qui manque » ≠ « on a gardé les 300 plus proches ».

**Validé en réel** (diag mode `carte`, run 32, `/api/carte` construit et exécuté sur le runner) :

| | Chartres 30 km | Lyon 10 km | Perpignan 60 km |
|---|---|---|---|
| débit / piézo / ONDE | 10 / 24 / 13 | 10 / 7 / 2 | 83 / 91 / 46 |
| distance max rendue | 29,8 km | 9,8 km | 59,9 km |
| ouvrages en position approchée | 60 | 2 | **178 / 300** |

**Critère d'acceptation** ✅ : build + lint clean, **18 suites au vert** (1 neuve), **35/35 e2e**
(13 neufs). Rendu **vérifié visuellement** — une première depuis trois sprints (cf. HANDBOOK §5).

La charge utile réelle de Perpignan a ensuite été **rejouée à l'écran** (520 points) : la carte reste
lisible, les ouvrages au centroïde se distinguent par leur transparence. ⚠️ **Défaut vu à cette
occasion, non corrigé** : les ouvrages d'une même commune se superposent exactement, un point peut en
cacher dix, et rien ne le laisse deviner. ⚠️ Le passage de la page BNPE à 5 000 lignes est **postérieur
à cette capture** et n'a pas été re-mesuré.

## Sprint 30 — Lisibilité de la carte : dégrouper, décrire, ajouter les rivières ✅

Trois demandes de l'utilisateur après avoir regardé la carte du Sprint 29 :
*« 1. Corrige la superposition des ouvrages d'une même commune. 2. Il faut que l'on puisse voir le
nom et les caractéristiques des nappes, stations etc quand on clique dessus via la carte.
3. Ajouter les cours d'eau également. »*

**Le sondage a de nouveau changé la conception** — et a refermé deux risques laissés ouverts au
sprint précédent :

| Ce que le sondage a mesuré | Conséquence |
|---|---|
| `libelle_site` (hydro) et les libellés des **observations** ONDE **existent** | les deux risques de 400 du §3 du Sprint 29 sont **refermés** |
| `urn_bss` (piézo) contient une **URL http** vers ADES, malgré son nom | lien « fiche officielle » possible pour les piézomètres |
| L'hydrométrie ne publie **que `uri_cours_eau`**, aucune URI de station | **pas de lien** pour les stations de débit — aucune URL fabriquée |
| `Karstique` et `MultiCouches` : **0 sur 200** masses d'eau, dont des calcaires notoires | champs **non affichés** — « Karstique : non » sur les Causses serait un fait inventé |
| `LongueurTotKm` : médiane 38, maximum **180 748** | unité incohérente ⇒ **non affichée** |
| 699 couches Sandre énumérées | `sa:MasseDEauRiviere_VRAP2022_FXX` retenue : **le pendant surface exact** de la couche de nappes déjà embarquée |

- [x] **Groupement des positions administratives** (`finalize()`) : les objets publiés à la **même
  position au mètre près** deviennent un marqueur **numéroté** dont la popup les liste tous. ⚠️ Le
  groupement précède le plafond — plafonner d'abord dépenserait les 300 places en doublons d'une
  poignée de communes. ⚠️ `totals` sépare le **compteur d'objets** du **plafond de marqueurs** :
  sans lui, « 300 ouvrages » serait devenu « 120 marqueurs » en silence. **Pas d'éclatement en
  pétale** : écarter ces points dessinerait des positions que la BNPE ne publie pas.
- [x] **Popups nom + caractéristiques** pour les quatre couches, **et les nappes deviennent
  cliquables** — elles ne répondaient à aucun clic. Les masses d'eau partageant un bord sont
  **toutes listées**, jamais élue au hasard. Une caractéristique sans valeur est **retirée**, pas
  rendue en « — ».
- [x] **Cours d'eau** : 9 746 masses d'eau rivière. ⚠️ **La simplification ne sert presque à rien
  ici** — 7,64 Mo à 150 m contre 5,64 Mo à 1 200 m, soit ‑26 % pour 8× de tolérance, parce que les
  coordonnées sont déjà arrondies à ~100 m. Le coût est le **nombre d'entités**. D'où une
  conception différente de celle des nappes : **fichier entier sur disque (5,84 Mo), filtrage par
  bbox à la requête** — ~50 Ko envoyés au navigateur, mesuré sur Chartres et Perpignan.
- [x] **Erreur de conception attrapée et corrigée dans le sprint** : le premier build appliquait aux
  rivières le budget d'octets des nappes (2 Mo, pensé pour un téléchargement intégral) et retenait
  **Strahler ≥ 5 — 569 rivières, 6 % du réseau**, laissant la plupart des adresses sans rivière.

**Validé en réel** (`/api/carte` reconstruit et rejoué sur le runner **après** l'élargissement des
`fields=` — aucune couche en 400) :

| | Chartres 30 km | Lyon 10 km | Perpignan 60 km |
|---|---|---|---|
| ouvrages trouvés | 460 | 559 | **706** |
| marqueurs après groupement | 300 (plafond) | **273, aucun plafond** | 300 (plafond) |
| plus gros groupe | 8 | 18 | **48** |

**Un seul marqueur cachait 48 ouvrages autour de Perpignan.** Lyon, tronqué à tous les rayons avant
le correctif de pagination, est désormais **complet et sans message d'incomplétude**.

**Critère d'acceptation** ✅ : build + lint clean, **18 suites au vert**, **47/47 e2e** (12 neufs).
Rendu **vérifié à l'écran** avec charge utile réaliste : marqueur « 12 » cliqué, popup listant ses
douze ouvrages, rivières tracées, nappes nommées au clic (deux masses d'eau superposées listées).

⚠️ **Ce qui reste non vérifié** : les popups n'ont jamais été vues **à l'écran avec ces valeurs
réelles** — contenu vérifié par la route, rendu vérifié sur données simulées, les deux ne se
recouvrent toujours pas.

## Sprint 31 — La carte répond « d'où vient mon eau ? » ✅

Quatre points signalés par l'utilisateur **depuis un téléphone**, capture à l'appui :

> *« 1. Légende et contenu cliquable se superposent sur mobile. 2. Ajoute une description de
> prélèvement, nappe, etc. 3. Serait-il pertinent de mieux scinder ces éléments entre les "éléments
> d'observation" type station de débit, piézomètres, les sources types nappes & cours d'eau etc.
> 4. D'autres sources d'eau pourraient être pertinentes à ajouter […] le but de la carte est pour
> l'utilisateur de comprendre quelles sont les sources d'eau autour de ses sites. »*

- [x] **La légende flottante est supprimée** — elle dupliquait la barre de bascules (mêmes pastilles,
  mêmes libellés, plus les compteurs) tout en couvrant un tiers de l'écran mobile. ⚠️ Le défaut se
  reproduisait ensuite **entre popups** : MapLibre en ouvre volontiers plusieurs. Une **instance
  partagée** rend « un objet décrit à la fois » structurel, et le marqueur d'adresse perd la sienne.
  Un test e2e **interdit tout encart flottant** autre que le bouton de recherche.
- [x] **Chaque couche est décrite dans la page**, sous la carte. ⚠️ Les `title` existaient déjà mais
  **une infobulle n'existe pas sur écran tactile** — c'est-à-dire précisément là où la question se
  pose.
- [x] **Trois groupes** : « Où est l'eau » · « Qui la mesure » · « Qui la prélève ». Portés par un
  **registre unique** qui décrit points, lignes et surfaces, et qui remplace les booléens ad hoc des
  milieux — deux couches de plus par l'ancien chemin en auraient fait quatre.
- [x] **Captages d'eau potable, sans source nouvelle** : la BNPE publie l'usage sur ses **chroniques**,
  joignables par `code_ouvrage`. Couverture mesurée **82 % à Chartres, 100 % à Lyon et Perpignan**.
  ⚠️ Un ouvrage non atteint a un usage **inconnu, pas « autre »** — un test l'exige, et sans
  chroniques **aucun** captage n'est déclaré.
- [x] **Plans d'eau** : 34 513 entités, 205 Mo, `TopoOH` **vide 4 fois sur 10**. ⚠️ Le référentiel ne
  publie **aucune surface** : elle est calculée et sert de premier filtre — **≥ 5 ha, 7 563 entités,
  5,57 Mo**, seuil **écrit dans l'interface**.

**Le sondage a de nouveau corrigé le code avant livraison** : les chroniques comptent une ligne par an
et par ouvrage — 16 566 pour 1 820 ouvrages autour de Chartres — donc réutiliser la taille de page du
référentiel aurait silencieusement perdu l'usage de la plupart des ouvrages.

**Validé en réel** (`/api/carte` reconstruit et rejoué sur le runner après l'ajout de l'appel de
chroniques) :

| | Chartres 30 km | Lyon 10 km | Perpignan 60 km |
|---|---|---|---|
| captages d'eau potable | **115** | 2 | **215** |
| usage connu / inconnu | 380 / **35** | 273 / 0 | 515 / 0 |

**Critère d'acceptation** ✅ : build + lint clean, **18 suites au vert** (54 vérifications dans
`carte.test.ts`), **56/56 e2e** (9 neufs), badge porté au Sprint 31. **Rendu mobile revérifié en 390×844**, popup ouverte, sur
la vue même de la capture : plus aucun recouvrement, une seule popup, carte dans le premier écran.

⚠️ **Non vérifié** : les popups n'ont jamais été vues **à l'écran avec ces valeurs réelles**, et le
nouvel appel de chroniques (16-18 k lignes) n'a **pas été chronométré**.

## Sprint 32 — L'état des sources sur la carte ✅

> *« peux-tu donner plus de détails sur l'état des sources (similaires à ceux donnés dans l'onglet
> principal) »*

Les popups disaient **ce qu'est** un objet — nom, code, commune, profondeur, usage — mais jamais **où
il en est**. Or « 2,3 m³/s » n'apprend rien sans savoir si c'est haut ou bas pour la saison : c'est
exactement ce que la référence standardisée de la fiche site apporte.

- [x] **Stations** : dernière mesure, date, tendance 14 j **avec son libellé**, référence IPS (nappe)
  ou VCN10 (débit) avec sa base et ses années de recul, et une sparkline. `stationEtat` **réutilise**
  les sondes déjà écrites plutôt que de les dupliquer — ⚠️ mais **pas** `hydroIndicators`, qui
  télécharge d'abord un référentiel de bbox pour *choisir* une station, travail perdu ici.
- [x] **Ouvrages et captages** : dernier volume déclaré **avec son année**, et la mention que c'est
  une **pression** sur la ressource, pas son état.
- [x] **Masses d'eau** : niveau d'arrêté **réglementaire** de la zone, explicitement présenté comme
  tel — l'état physique national n'existe pas (clos au Sprint 27).
- [x] **Un appel par clic**, jamais en amont : sonder chaque station visible coûterait des centaines
  d'appels pour une popup.
- [x] **Géométrie de sparkline extraite** (`lib/sparkline.ts`), partagée par le composant React et
  les popups en chaîne HTML — pas deux algorithmes qui divergeraient.

**Deux règles d'honnêteté rendues structurelles :**

| Piège | Règle |
|---|---|
| Une panne Hub'Eau s'affichait « cette station ne publie pas de mesure » | **service injoignable ≠ station muette** : deux retours, deux phrases |
| La référence télécharge 18-25 ans et peut bloquer 15 s | **abandonnée après 6 s** ; la popup montre la mesure et **dit** que la référence manque |

⚠️ **Le défaut du Sprint 31 est revenu par une autre porte** : l'état triple la hauteur de la popup,
qui débordait la carte de 90 px et repassait sous le bouton flottant. Bornée à **240 px avec
défilement** (débordement ramené à 22 px, mesuré) et le bouton **s'efface** tant qu'une popup est
ouverte.

**Validé en réel** (diag `carte`, run 38 — `/api/carte/etat` chronométré station par station) :

| Objet | Chartres | Lyon | Perpignan |
|---|---|---|---|
| station de débit | 3,0 s — réf. 10 ans | 1,5 s — **sans référence** | 2,0 s — réf. 19 ans |
| piézomètre | 3,4 s — IPS 26 ans | 2,6 s — IPS 21 ans | 0,3 s — **station muette** |
| ouvrage | 0,16 s | 0,15 s | 0,15 s |

**Le budget de 6 s est corroboré** : 3,4 s au pire, 1,8× de marge. Et les deux cas d'absence ont été
**observés en vrai** — station muette à Perpignan, référence non calculable à Lyon (moins de six ans
d'historique) — chacun avec sa phrase, jamais un vide.

**Critère d'acceptation** ✅ : build + lint clean, **18 suites au vert** (64 vérifications dans
`carte.test.ts`), **60/60 e2e** (4 neufs, dont « la case d'état se résout au lieu de tourner
indéfiniment »). Rendu **vérifié en 390×844** avec un état réaliste : badge 82/100, « Débit proche de
l'étiage quinquennal », sparkline descendante.

---

## Sprint 33 — Design system et honnêteté visuelle

Premier des cinq sprints issus de l'[audit UI/UX](./AUDIT-UI-UX.md) (constats P3, P5, P7, P10).

**Le problème.** 31 blocs répétaient à l'identique la même classe de carte : un **arrêté préfectoral**
— un fait opposable — avait exactement l'apparence d'un chiffre **modélisé par l'outil**, et exactement
celle d'une **projection 2050** incertaine par construction. Le code tenait cette distinction depuis
toujours (`available`, badges de confiance, fourchettes lo/hi) ; l'interface n'en disait rien.

- [x] **`components/ui/Panel.tsx`** : le cadre unique, en quatre variantes qui rendent la distinction
      visible — `reglementaire` (liseré d'accent), `modele` (carte pleine), `projection` (trait
      **discontinu** : le contour d'une chose incertaine ne doit pas paraître solide), `pedagogie`
      (teinté, sans ombre). Étiquette **opt-in**, jamais automatique : sur chaque sous-carte imbriquée
      elle deviendrait du bruit.
- [x] **Tokens sémantiques** (`app/globals.css`, `@theme`) : la couleur est nommée par son rôle, pas
      par son rang de palette. Corriger un contraste redevient un geste unique.
- [x] **P3 — le défaut visible à l'œil nu** : `RessourcePanel` n'avait pas de `mt-8` et titrait en
      `h3 text-sm` là où ses pairs sont en `h2 text-lg` — il *paraissait* un sous-bloc de la projection
      2050 alors qu'il répond à une autre question.
- [x] **P10 — copie périmée** : accueil et méthodologie annonçaient une fenêtre de **5 ans** alors
      qu'elle est à **10 ans** depuis le sprint 22 (vérifié `windowYears: 10` en prod).
- [x] **Badge « Démo — Sprint 32 » retiré** au profit de la fraîcheur de la source. ⚠️ `ZonesResponse`
      **ne porte aucun horodatage** : « à jour au <date> » aurait été un fait inventé. D'où deux
      énoncés vrais — la **cadence** de VigiEau dans l'en-tête, la **date réelle de l'arrêté** sur la
      fiche site.

| Motif | Avant | Après |
| --- | --- | --- |
| `text-slate-400` (≈ 2,9:1 sur blanc, seuil AA = 4,5:1) | 69 | **0** |
| `text-[10px]` + `text-[11px]` | 17 | **0** |
| classe de carte répétée | 31 | **0** (31 `<Panel>`) |

⚠️ **L'e2e a attrapé une régression qu'aucune revue visuelle n'aurait vue** : la migration de
`PortfolioExecutiveSummary` supprimait son `aria-label`, et une `<section>` sans nom **cesse d'être un
landmark**. La page restait pixel pour pixel identique. Corrigé **à la source** (prop `ariaLabel` sur
`Panel`) pour que les migrations suivantes ne puissent pas refaire la perte.

**Critère d'acceptation** ✅ : build + lint clean, **18 suites au vert**, **60/60 e2e**.
⚠️ **Limite majeure** : l'egress étant bloqué en bac à sable, **9 des 12 blocs migrés** (toute la fiche
site peuplée) **n'ont jamais été vus rendus avec leurs données** — y compris la correction P3, qui est
raisonnée sur le code et non constatée à l'écran. À vérifier sur la preview avant toute mise en prod.
Compte rendu : [`2026-08-06-sprint-33-design-system.md`](./comptes-rendus/2026-08-06-sprint-33-design-system.md).

---

## Sprint 34 — La fiche site répond enfin à sa propre question

Deuxième des cinq sprints issus de l'[audit UI/UX](./AUDIT-UI-UX.md) (constats **P1** et **P9**).

**Le problème.** Le H1 de la page demande « Quel est le niveau de restriction d'eau à l'adresse de
votre site ? » et la page y répondait **en quatrième position**, sous le score composite, l'historique
et l'impact sectoriel — c'est-à-dire que le seul **fait opposable** de la page arrivait après trois
blocs de modélisation. Et les quatre boutons d'export étaient proposés **avant** tout résultat.

- [x] **`lib/synthese.ts`** — une synthèse **rédigée**, jumelle de `lib/executive.ts` et soumise aux
      **mêmes deux règles** : un fait absent ⇒ **phrase absente** (jamais « donnée indisponible »),
      et la dernière ligne énumère toujours les manques, « comptés comme non estimés, **jamais comme
      l'absence de risque** ». Sur un site unique la règle compte plus encore que sur un parc : il n'y
      a pas d'autre site pour relativiser un trou.
- [x] **Cinq chapitres ancrés**, le réglementaire en tête : `situation` · `impact` · `anticipation` ·
      `horizon-2050` · `ressource`.
- [x] **`SiteToc`** — rail collant au-dessus de `lg`, **pastilles collantes** en dessous, chapitre
      actif suivi à l'`IntersectionObserver` (le **plus haut des visibles**, jamais le dernier
      événement reçu).
- [x] **Page unique assumée contre des onglets** : le lecteur type imprime la fiche et la cherche au
      Ctrl+F ; des onglets auraient caché quatre cinquièmes des preuves aux deux.
- [x] **Chaque ligne de la synthèse lie son chapitre** — c'est ce qui sert les trois publics
      (dirigeant, exploitant, ESG) depuis un seul bloc, sans en privilégier un.
- [x] **P9** : changer « Origine de l'eau » ou « Dépendance » **nomme les chapitres recalculés**.

⚠️ **Quatre défauts trouvés en REGARDANT la page, aucun par les tests** : « dont **1 jours** »
(arrondi à l'affichage, accord sur la valeur brute) ; « nappe : nappe proche des normales (**ips**) »
(préfixe redondant + acronyme détruit par une mise en minuscules) ; **145 px de défilement horizontal
en 390×840** (un enfant de grille a `min-width: auto` et refuse de rétrécir — `min-w-0` sur le
sommaire **et** sur la colonne des chapitres, ramené à **0 px mesuré**) ; et un écran blanc sur une
charge utile Hub'Eau malformée, non atteignable en prod mais gardé pour deux caractères.

**Critère d'acceptation** ✅ : build + lint clean, **19 suites au vert** (une neuve, **52
vérifications**), **60/60 e2e**, débordement horizontal **0 px** en 390×844 sur la fiche.
⚠️ **Limite majeure** : toute la fiche n'a été vue qu'avec des **données bouchonnées** (egress bloqué),
et **deux de mes bouchons se sont trompés de forme** — la forme réelle des charges utiles n'est donc
pas évidente à la lecture. Rien de ce sprint n'a été vu avec une vraie réponse VigiEau.
⚠️ `/sites` conserve **38 px** de débordement en 390 px : c'est le constat P8, sprint 36.
Compte rendu : [`2026-08-06-sprint-34-fiche-site.md`](./comptes-rendus/2026-08-06-sprint-34-fiche-site.md).

---

## Sprint 35 — Un chargement qui ne ment pas

Troisième des cinq sprints issus de l'[audit UI/UX](./AUDIT-UI-UX.md) (constat **P2**).

**Le problème.** Sept requêtes indépendantes, chaque bloc inséré à son arrivée, et rien qui dise au
lecteur combien il en reste. Mesures de production (HANDBOOK, run 39) : `/api/hydro` **16,0 s**,
`/api/piezo` **11,0 s**.

- [x] **Squelettes dimensionnés** (`components/ui/Skeleton.tsx`) — `lines` est une **revendication de
      hauteur**, pas une décoration. Barres `aria-hidden`, toujours doublées d'un texte lisible.
- [x] **Bandeau de progression** — compte les sources **réglées** (répondu **ou** échoué, jamais
      « réussi » : sinon un site sans station voisine reste bloqué à 5/7 pour toujours), **nomme**
      celles qui manquent, et disparaît une fois tout arrivé.
- [x] **Le saut de largeur du sprint 34 est supprimé** : `Shell wide` suit désormais le **choix
      d'adresse** et non l'arrivée des données — un saut de mise en page doit répondre à un geste.

⚠️ **Le sprint a trouvé deux endroits où l'interface AFFIRMAIT une absence qui n'était qu'une
attente** — un défaut de véracité, pas de confort, et c'est la même règle que le sprint 32 avait
rendue structurelle sur la carte (« service injoignable ≠ station muette ») :

| Où | Ce qui était dit à 3 s | Ce qui était vrai à 12 s |
|---|---|---|
| Synthèse, ligne des manques | « la projection 2050 n'est pas disponible pour ce bassin » | la projection était là |
| `TransitionRiskPanel` | « Statut ZRE indisponible » | « Commune classée en ZRE » |

**Règle générale à retenir** : une source **en attente** n'est ni un fait ni un manque. `undefined`
signifiait deux choses (« la réponse a dit non » / « la réponse n'est pas arrivée ») ; `enAttente`
sépare enfin les deux. Exception délibérée : le **volume prélevé** n'est jamais masqué, parce qu'il
ne dépend d'aucune requête — le masquer le ferait apparaître à la toute fin, quand plus personne ne
regarde.

**Critère d'acceptation** ✅ : build + lint clean, **19 suites au vert** (`synthese.test.ts` 52 → **57
vérifications**), **60/60 e2e**. **Déplacement du chapitre 4 mesuré à 59 px** sur une page de
9 512 px pendant un chargement complet ; **ligne des manques identique** à mi-chargement et après.
⚠️ **Limites** : les délais sont **simulés** (5/4/3/2 s), jamais les **16,0 s réelles** ; les hauteurs
de squelette sont estimées à l'œil et non calibrées au pixel — c'est probablement l'essentiel des
59 px résiduels. Compte rendu :
[`2026-08-06-sprint-35-chargement.md`](./comptes-rendus/2026-08-06-sprint-35-chargement.md).

---

## Sprint 36 — Accessibilité et mobile

Quatrième des cinq sprints issus de l'[audit UI/UX](./AUDIT-UI-UX.md) (constats **P4**, **P5**, **P8**).

**Le problème.** Le contrôle **sans lequel aucune page ne produit quoi que ce soit** — le champ
d'adresse — n'avait ni rôle `combobox`, ni `aria-expanded`, ni navigation aux flèches, et **la touche
Entrée n'y faisait rien**. L'application était littéralement inutilisable au lecteur d'écran et au
clavier seul.

- [x] **Combobox ARIA complet** : rôles `combobox`/`listbox`/`option`, `aria-activedescendant` (qui
      annonce l'option **sans déplacer le focus**, seul moyen de continuer à taper), flèches / Entrée
      / Échap / Home / End, région live « N adresses proposées ». ⚠️ **ArrowDown rouvre une liste
      fermée** : sans ça, un Échap oblige à retout retaper — un cul-de-sac qui n'existe pas à la souris.
- [x] **Fondations clavier** (`globals.css`) : `:focus-visible` (et non `:focus`, dont la laideur au
      clic est *la* raison pour laquelle tant de sites suppriment le contour), lien d'évitement,
      `prefers-reduced-motion` — rendu nécessaire par les squelettes du sprint 35.
- [x] **P5 — plus d'encodage par la couleur seule** : `TypeBadge` affiche un code (V/A/AR/C/—) décodé
      en légende, avec `aria-label` complet.
- [x] **P4 — les explications reviennent en page** (`ui/InfoNote.tsx`, `<details>` natif : opérable
      au clavier et au doigt sans JS, et **atteignable par le Ctrl+F du navigateur**).
- [x] **P8** : tableau six colonnes → **liste de cartes sous `md`**, KPI en 2/3/5, barre de boutons
      qui enveloppe, et **suppression annulable** (8 s). ⚠️ `importSites` et non `addSite` : `addSite`
      régénère `createdAt`, donc « annuler » aurait silencieusement redaté le site — une annulation
      qui ne restitue pas exactement l'état d'avant n'en est pas une.

| Mesure à 390 px | Avant | Après |
|---|---|---|
| Débordement horizontal `/sites` | **38-40 px** | **0 px** |
| `/`, `/methodologie`, `/carte` | 0 px | **0 px** |
| Sélection d'adresse au clavier | **impossible** | ArrowDown ×2 + Entrée |

⚠️ **L'e2e a détecté trois changements de contrat** : les suggestions ne sont plus des `button` mais
des `option` ; le tableau de bord rend chaque site **deux fois** dans le DOM (tableau + cartes, une
seule affichée — `display:none` la retire de l'arbre d'accessibilité et du Ctrl+F) ; et après
suppression le nom du site **est toujours à l'écran**, dans le bandeau d'annulation.

**Critère d'acceptation** ✅ : build + lint clean, **19 suites au vert**, **62/62 e2e** (+2),
débordement **0 px** sur les quatre pages, parcours clavier et annulation vérifiés de bout en bout.
⚠️ **Limite** : **aucun lecteur d'écran réel n'a été utilisé** et **aucun audit automatisé** (pas
d'axe-core) — les attributs sont conformes au patron, ce qui n'est pas la même chose qu'une bonne
restitution. D'autres violations existent probablement. Compte rendu :
[`2026-08-06-sprint-36-accessibilite.md`](./comptes-rendus/2026-08-06-sprint-36-accessibilite.md).

---

## Sprint 37 — Une méthodologie navigable

Dernier des cinq sprints issus de l'[audit UI/UX](./AUDIT-UI-UX.md) (constat **P6**).

**Le problème.** 26 sections sur 758 lignes, **aucune ancre, aucun sommaire**, et tous les panneaux
renvoyant vers un `/methodologie` nu. Depuis « Disponibilité en eau projetée », le lecteur atterrissait
en haut d'une page dont la section correspondante est la **24ᵉ** — soit ~10 400 px plus bas. Les
explications étaient écrites, publiées, et jamais lues.

- [x] **`lib/methodologie.ts`** : registre unique de 26 `{ id, titre }`, consommé par **les deux**
      côtés — la page génère ses `id` **et ses titres** depuis lui, les panneaux lient
      `methodologieHref("…")`.
- [x] **Le typage fait le travail** : `MethodoId` est une union littérale dérivée par
      `as const satisfies`, donc une faute de frappe dans une ancre **ne compile pas**. Écrite à la
      main, la même faute produirait un lien qui fonctionne et ne va nulle part — le navigateur ne se
      plaint jamais d'une ancre absente.
- [x] **Le titre vient du registre, pas du point d'appel** : sinon renommer une section y aurait
      laissé la page afficher l'ancien libellé, et le registre serait devenu un double à maintenir.
- [x] **Sommaire de 26 liens** en tête de page, et **9 panneaux recâblés** vers leur ancre. Le pied de
      page garde le lien nu — point d'entrée général, **exception nommée** dans le test.
- [x] **`scripts/test/methodologie.test.ts`** (13 vérifications) ferme ce que TypeScript ne voit pas :
      la page rend exactement le registre dans son ordre, aucun composant ne lie plus la page nue, et
      le message d'échec **nomme le fichier fautif**.

**Critère d'acceptation** ✅ : build + lint clean, **20 suites au vert** (une neuve), **62/62 e2e**,
**26/26 sections ancrées**, 26 liens de sommaire, **0 px** de débordement à 390 px, lien profond
vérifié.
⚠️ **Limites** : le décalage d'ancre mesure **87 px** là où `scroll-mt-6` en promet 24 — **l'écart
n'est pas expliqué** ; le test garantit qu'une ancre **existe**, jamais qu'elle soit **pertinente** ;
et deux panneaux (`RessourcePanel`, `Landing`) pointent vers une section voisine faute d'avoir la
leur. Compte rendu :
[`2026-08-06-sprint-37-methodologie.md`](./comptes-rendus/2026-08-06-sprint-37-methodologie.md).

---

## Hors sprint — Protocole de vérification au lecteur d'écran

Le sprint 36 a posé le balisage d'accessibilité **sans qu'aucun lecteur d'écran réel n'ait été
utilisé** — limite écrite noir sur blanc dans son compte rendu. Ce protocole
([`CHECK-LECTEUR-ECRAN.md`](./CHECK-LECTEUR-ECRAN.md)) ferme l'écart : **10 écrans téléphone**
(390 × 844) couvrant les états qui **se ressemblent à l'œil et ne doivent surtout pas se ressembler à
l'oreille**, chacun avec l'arbre ARIA réellement produit
([`captures/arbres-aria.md`](./captures/arbres-aria.md)) et ce qu'il faut **entendre**.

Cinq cas de données (crise · VigiEau injoignable · territoire non couvert · chargement aux **délais
réels de prod** 16,0 s / 11,0 s · aucune station rattachée) et cinq cas d'interaction (combobox ·
sommaire + notice de recalcul · cartes du tableau de bord · suppression/annulation · ancre profonde
de méthodologie).

⚠️ **Construire les dix écrans a suffi à trouver quatre défauts que le sprint 36 avait manqués**,
tous invisibles sur une capture :

| Défaut | Pourquoi il avait échappé |
|---|---|
| `aria-label` sur un `<span>` **sans rôle** n'est pas exposé — les badges ne disaient que « SUP SOU AEP », **sans le niveau** | Le correctif du sprint 36 (P5, encodage par la couleur seule) était **muet**. Il fallait `role="img"`. |
| Le code de zone était collé au nom **dans le titre** : « Eure Moyen haut24_028_0003 » | Séparé par une marge à l'écran, concaténé dans le nom accessible. |
| Les composantes non estimées du score se lisaient « tiret », ou rien | La règle « une absence n'est jamais un zéro » n'était tenue **qu'à l'œil**. |
| L'émoji de secteur était prononcé : « usine Impact pour le secteur Industrie » | Décoratif à l'écran, contenu dans l'arbre. |

**Leçon générale** : un attribut d'accessibilité **présent dans le DOM n'est pas un attribut
exposé**. L'arbre ARIA (`locator.ariaSnapshot()`) est le seul intermédiaire fiable entre le code et
le lecteur d'écran, et doit être regardé à chaque sprint qui touche au balisage.

**Vérifications** ✅ : build + lint clean, **20 suites au vert**, **62/62 e2e**, 0 px de débordement
sur les 10 écrans. ⚠️ **Le test humain reste à faire** — c'est tout l'objet du document. Les captures
PNG (19 Mo) sont **délibérément hors dépôt** ; seuls les arbres ARIA, qui sont le contrat vérifiable,
sont versionnés.

---

# Chantiers de la note technique v1.0 (sprints 38→46)

> **Origine.** La [note technique de conception](./NOTE-TECHNIQUE-HYDROVIGIE.md) reçue le 2026-08-08
> re-spécifie le produit autour de **trois indicateurs** (JS, VNP, IA), **trois niveaux de preuve**
> (N1/N2/N3) et **six ADR**. L'état du code face à elle est établi point par point dans
> [`ANALYSE-ECART-NOTE-TECHNIQUE.md`](./ANALYSE-ECART-NOTE-TECHNIQUE.md) — **à lire avant d'ouvrir
> l'un de ces sprints** : plusieurs commencent par *finir* un correctif qui existe déjà, pas par
> écrire du neuf.
>
> **Les critères d'acceptation sont ceux de la note (§8), recopiés, pas reformulés.** Là où la note
> n'en donne pas, le critère est marqué *(ajouté ici)*.
>
> **Quinze arbitrages ont été tranchés par l'utilisateur le 2026-08-08** (G1→G15, table complète dans
> l'[analyse d'écart §G.1](./ANALYSE-ECART-NOTE-TECHNIQUE.md)). Ils sont appliqués dans les sprints
> ci-dessous et rappelés à l'endroit où ils mordent. **Aucune zone d'ombre de la note ne reste
> ouverte** : les quatre questions du §11 sont tranchées (G11, G13, G15, et les horizons CSRD).

## Ordre et dépendances

```
38 probe préalable ──┬─→ 39 typologie ρ ──→ 41 VNP ──┐
                     │         │                     ├─→ 44 auditabilité + juridiction
                     └─→ 40 vecteur d'usages ─┴─→ 42 IA ┘            │
                                    │                                 ▼
                                    └────────→ 43 JS par ressource ──→ 45 N1 + N2 ──→ 46 N3 + lot
```

Le probe passe en premier parce que **quatre décisions en dépendent** et qu'un seul run Actions y
répond. La typologie ρ passe avant tout le reste parce que sans intervalle, aucune sortie ne peut
porter la fourchette exigée par **G2**.

---

## Sprint 38 — Probe préalable ✅

**Quatre questions, quatre passes, et chaque passe a corrigé la précédente.** Précédent :
`scripts/restrictions/probe_backlog.py` au Sprint 22. Script : `scripts/restrictions/probe_note_technique.py`,
sortie : `data/restrictions/note-technique-probe.json`, runs 31355992762 → 31356782500.

| Question | Statut | Verdict mesuré |
|---|---|---|
| **A** — `rotation` existe-t-il, et hors agriculture ? | mesuré | **DANS LE PÉRIMÈTRE.** 794 occurrences, dont **77 concernent l'entreprise** |
| **B** — SISPEA exploitable ? (**G13**) | mesuré | **EXPLOITABLE SOUS CONDITION** — archives **7-Zip** sur `data.ofb.fr` |
| **C** — endpoint Hydroportail ? (**G14**) | mesuré | **AUCUN JSON** — 3 routes en HTML, Hub'Eau sert déjà la série élaborée |
| **D** — V_ref atteignable ? (**G9**) | mesuré | **NON** — 403 sur les 3 routes, **avec les deux UA** |

### A — `rotation` : dans le périmètre, mais pas par la porte attendue

Les **496 « tours d'eau »** sont **exclusivement** `usage.u.concerne_exploitation` — agricoles, donc hors
périmètre (§0.2). Le signal utile est une forme que le premier jet ne cherchait pas : **« autorisé N
jours par semaine »**, 298 occurrences dont **77 entreprise**, 77 collectivité, 60 particulier. Elle se
convertit **sans hypothèse** en ρ = 1 − n/7.

⚠️ Les usages concernés sont l'arrosage d'espaces verts, les terrains de sport et les prélèvements en
canaux — **pas de l'eau de procédé**. Le type est donc réel et à implémenter, mais son poids dans un
site industriel sera faible : c'est exactement ce que le vecteur d'usages pondéré de l'ADR-001 sert à
exprimer, et une raison de plus de ne pas moyenner à plat.

### B — SISPEA : les fichiers existent, le format était le vrai obstacle

Cinq jeux trouvés, dont les extractions annuelles AEP / AC / ANC (2021→2024). ⚠️ **La métadonnée
data.gouv annonce le format « xls » ; les octets de tête disent `377abcaf271c`, soit du 7-Zip**, servi
depuis `data.ofb.fr` avec `content-type: application/x-7z-compressed`. Le seul jeu intitulé « Rendement
du réseau de distribution par territoire compétent » est **départemental** (l'Orne, 2025), pas national.

**Ce qui reste à faire le jour où SISPEA est planifié** : décider si `py7zr` vaut une dépendance, puis
ouvrir l'archive pour voir si une clé commune y figure. **Ne pas re-sonder l'existence** : elle est
établie, seul le contenu de l'archive ne l'est pas.

### C — Hydroportail : la moitié de G14 est irréalisable, et c'est mesuré

`hydro.eaufrance.fr` répond **200 en HTML** sur trois routes — c'est une application web, pas une API —
et data.gouv n'a rien de national (le seul résultat, « Calcul des QMNA5 en DREAL N-PdC », est régional).
En revanche **Hub'Eau `obs_elab` répond 206 avec des données** : la série élaborée dont `computeLowFlow`
tire déjà ses références.

⚠️ **Conséquence sur G14** : « garder le calcul maison **et mesurer l'écart** » n'est pas exécutable sans
scraper une application web. La moitié réalisable de la décision est donc : garder le calcul maison, et
**l'écrire explicitement sur `/methodologie`** avec la raison — aucun indice standardisé n'est publié en
lecture machine. La mesure a tranché ce que l'arbitrage laissait ouvert.

### D — V_ref : transcription manuelle, et pas d'arbitrage à demander

**403 sur les trois routes Légifrance, avec l'UA du probe comme avec un UA navigateur.** Le Sprint 41
transcrira la définition à la main avec citation de l'article, comme le dépôt l'a fait pour le décret
2021-795. ⚠️ L'arbitrage que le probe s'apprêtait à soulever — se faire passer pour un navigateur pour
contourner un blocage — **est sans objet** : ça ne fonctionne pas non plus.

### ⚠️ Le vrai résultat du sprint : trois défauts dans du code en production

Regarder les 77 mesures — au lieu de faire confiance au décompte — a trouvé trois erreurs de
`restrictionSeverity` (`lib/restrictions.ts`), **mesurées en exécutant le code livré sur des libellés
verbatim** :

| Mesure réelle (`concerne_entreprise`) | ρ rendu | ρ réel | Effet |
|---|---|---|---|
| « Autorisé 3 jours par semaine : lundi, mercredi, vendredi entre 20h et 9h » | **0**, « Aucune restriction prescrite » | ≈ 0,77 | Une mesure qui bloque 77 % lue comme **aucune restriction** |
| « Arrosage autorisé 2 jours par semaines : lundi et jeudi entre 20h et 23h » | **0,125** | ≈ 0,96 | Sous-estimation d'un facteur **7,7** |
| « …arrosage autorisé 3 jours par semaine […] entre 20h et 9h » | 0,542, tracé « Interdiction 13 h sur 24 » | ≈ 0,77 | La **trace auditable affirme le contraire de l'arrêté** |

Deux causes : une **inversion de polarité** — le lecteur suppose que toute plage citée est la plage
*interdite*, alors que « autorisé entre 20h et 9h » désigne la plage *permise* — et **l'absence de
composition** : jours × heures est multiplicatif (3/7 × 13/24 = 16 % du volume autorisé), le code ne lit
qu'une dimension et la première rencontrée gagne.

⚠️ **Les trois erreurs vont dans le sens qui sous-estime le risque**, et la première est du genre du bug
du SWI : une réponse d'apparence positive qui signifie « rien à signaler ». **Corrigées au Sprint 39**,
qui réécrit précisément cette fonction.

**Critère d'acceptation** ✅ : quatre verdicts écrits, aucun « indéterminé » restant, et les pistes closes
le sont **avec leur motif** pour ne jamais être re-sondées.

⚠️ **Leçon de méthode, à retenir plus que les verdicts.** La passe 1 a rendu **quatre verdicts et zéro
erreur** — ça avait l'air propre. Trois étaient faux, chacun disant « il n'y a rien » là où la vérité
était « je n'ai pas su regarder » : colonnes d'audience non détectées (préfixe `usage.u.` que
`build_restrictions.py:148` connaissait déjà), requête data.gouv trop longue dont le compte brut n'était
pas enregistré, et cinq `ConnectTimeout` lus comme une absence d'endpoint. **Le verdict A s'est inversé
en passe 2.** Correctif structurel : chaque question porte un **`status` `mesuré` / `indéterminé`**, et
un verdict d'absence est interdit tant que le status est `indéterminé`.

## Sprint 39 — Typologie ρ à intervalles ✅ (noyau) / ⏳ (fourchette en titre)

**Livré** : `lib/restrictions.ts` réécrit, `app/api/restrictions/route.ts` et
`components/InterruptionPanel.tsx` migrés, `scripts/test/restrictions.test.ts` porté de **29 à 46
assertions**.

- [x] **`Rho { type, min, max }`, intervalle toujours présent.** Une quantité connue est l'intervalle
      dégénéré `min === max`. ⚠️ Délibérément **pas** `{ value?, min?, max? }` : un point optionnel
      invite à le lire en ignorant la borne, ce qui est exactement comment l'ancien
      `coefficient?: number` laissait une mesure illisible disparaître d'une moyenne.
- [x] **Les 7 types de §3.1**, plus `none`. ⚠️ `none` n'est pas dans la note : elle énumère les façons
      de restreindre, et le corpus contient aussi des déclarations explicites d'absence de contrainte
      (« Pas de limitation », « Autorisé »). Les ranger dans `recommendation` aurait affirmé une
      obligation de sensibilisation que le texte ne porte pas.
- [x] **`unquantified` → [0, `RHO_MAX_UNQUANTIFIED` = 1]**, et l'intervalle **se propage** dans
      `exposureForProfil`. ⚠️ La borne haute est 1 **par refus d'inventer** : toute valeur inférieure
      serait un coefficient calibré à la main, ce que la revue du Sprint 21 avait retiré et que §3.2
      interdit. Une fourchette large est la lecture honnête.
- [x] **`recommendation` et `reporting_only` comptés à part**, plus fondus dans la moyenne à 0.
- [x] **`rotation` implémenté** sur « autorisé N jours par semaine » (ρ = 1 − n/7), **tranché par le
      Sprint 38**. ⚠️ Les « tours d'eau » (496 occurrences) ne sont **pas** lus : exclusivement
      `concerne_exploitation`, donc agricoles et hors périmètre (§0.2) — et le commentaire du code dit
      pourquoi, pour que personne ne le « corrige » plus tard.
- [x] **Les trois défauts du Sprint 38 corrigés**, chacun avec son libellé verbatim en non-régression :
      polarité (`polarityAt` : le mot-clé le plus proche gouverne, `autorisé` ou `interdit`),
      composition multiplicative des dimensions, et `NO_LIMIT` désormais **atteint seulement si aucune
      dimension quantifiée n'a été trouvée**.
      ⚠️ Le correctif du 3ᵉ n'est **pas** de supprimer la règle : « Autorisé » seul veut bien dire
      « aucune restriction », et un test le protège. C'est l'**ordre** qui change.
- [x] **`RHO_MIN_CONDITIONAL_BAN` = 0,85 exposé et nommé.** ⚠️ **C'est le seul coefficient calibré à la
      main qui subsiste dans ce fichier**, hérité du Sprint 21. La borne haute est solide (sans la
      dérogation, l'usage est perdu en entier) ; 0,85 en borne basse est un jugement. Il est désormais
      **exprimé en intervalle**, donc l'incertitude est visible au lieu d'être cachée dans un point.
- [ ] **G2 « fourchette partout » : à moitié livré, et il faut le dire.** L'intervalle existe et
      s'affiche **par usage** dans le détail auditable (« 84 % », « 0–100 % »), avec les compteurs
      séparés. **Le chiffre de jours en titre reste un point** : il vient de `computeInterruption`, qui
      prend un scalaire. Le convertir imposerait de réécrire un module que **G1 supprime au Sprint 42**.
      La route sert donc `exposureInterval` (la vérité) **et** `exposure` (la borne basse, documentée
      comme telle dans le code), et le titre passera en fourchette au Sprint 42.
- [ ] **Protocole d'annotation (G12)** — non commencé.

**Critère d'acceptation** : build + lint clean, **22 suites** dont `restrictions.test.ts` à **46
assertions**, **62/62 e2e**. ⚠️ Le taux d'accord de la note reste **vide et dit vide** (G12).

⚠️ **Piège trouvé en migrant** : `InterruptionPanel.tsx` **retypait la forme de `severity` en ligne**
au lieu de l'importer. TypeScript n'a donc rien signalé quand ρ est devenu un intervalle — la
migration n'a été vue que parce qu'elle était attendue. Le retypage est conservé (le composant est
client, le type serveur), mais **avec un commentaire qui dit qu'il doit être tenu à jour à la main**.

## Sprint 40 — Le site comme vecteur d'usages (ADR-001) ✅ (modèle) / ⏳ (saisie)

**Livré** : `lib/sites.ts` étendu, `lib/siteProfile.ts` neuf (pur, hors ligne),
`scripts/test/site-profile.test.ts` neuf (**34 assertions**), trois champs ajoutés au formulaire.

- [x] **`SiteUsage[]`** dans `SavedSite` : `usageCode`, `volumeM3`, `sourceType`, `loadProfile`,
      `isExempt`, `isProcessCritical` (§2.2). Tableau imbriqué en `localStorage`, **aucune base**.
- [x] **`tauxRestitution`** (§4.2c) + `volumeConsomme()`. ⚠️ **Un taux non déclaré rend `undefined`, pas
      0** : supposer 0 affirmerait que le site consomme tout ce qu'il prélève. Écart mesuré par test :
      un facteur **19** entre un circuit ouvert (95 % restitué) et un procédé évaporatif (5 %).
- [x] **`ResponseType`** (`linear` | `threshold` | `stepwise`), **`tamponM3`**, **`seuilTechniqueM3`**.
- [x] **`LoadProfile`** (**G11**) : `uniforme` | `journee_ouvree` | `deux_huit` | `continu`, défaut
      `uniforme` **conservé et nommé comme hypothèse**.
- [x] **`weightedLevel()` — l'anti-pattern n°1 traité à la racine.** Le rang est un **réel**, pas un
      niveau nommé : 95 % AEP en vigilance + 5 % SUP en crise donne **1,15**, plus proche de vigilance
      que d'alerte. Aucun niveau nommé ne peut exprimer ça, et c'est la réponse honnête ; le niveau
      nommé est fourni à côté, comme un arrondi d'affichage. ⚠️ **Les volumes exemptés ne pèsent pas** :
      une restriction ne peut pas les entamer, les laisser peser diluerait le niveau.
- [x] **`profileCompleteness()` — un site incomplet le dit.** ⚠️ Le raccourci tentant — traiter un site
      hérité comme un usage unique à 100 % du volume déclaré — **fabriquerait exactement la donnée que
      l'ADR-001 sert à recueillir**, et rien en aval ne distinguerait l'invention de la déclaration.
      Chaque manque est nommé **avec ce qu'il coûte**.
- [x] **Dégradation honnête des sites hérités** : sans vecteur, `weightedLevel` retombe sur l'origine
      unique et rend `base: "origine_unique"` + `degrade: true` ; sans rien, `rank: 0` **avec**
      `degrade: true`, pour que 0 ne se lise pas « aucune restriction ».
- [x] **Saisie du vecteur livrée** (`components/UsageVectorEditor.tsx`), **en parts et non en m³** —
      arbitrage du 2026-08-08. Un exploitant répond « 80 % procédé, 15 % refroidissement, 5 %
      sanitaire » de mémoire ; il ne répond pas « combien de m³ a pris votre circuit de
      refroidissement l'an dernier ». C'est la différence entre un formulaire rempli et un formulaire
      vide — et les parts suffisent à `weightedLevel`, la pondération étant **sans échelle**.
- [x] **Les m³ du VNP sont déduits, et la déduction est étiquetée** (`resolveUsageVolume` →
      `origine: "deduit_part"`), jusqu'à l'export. ⚠️ « Volume déclaré par usage » et « volume déduit
      d'une part déclarée » ne sont **pas la même preuve**, et l'ADR-006 exige que le lecteur puisse
      les distinguer. Un volume explicite l'emporte toujours sur un volume déduit.
- [x] **La somme des parts est reportée, jamais imposée.** Un vecteur à 85 % n'est pas invalide —
      l'exploitant n'a peut-être pas tout ventilé — et refuser la saisie perdrait les 85 % **connus**.
      L'écart est nommé : « il manque 5 %. La pondération portera sur ce qui est décrit. »
- [x] **7 contrôles e2e ajoutés** (62 → **69**), promus depuis le script jetable qui a servi à
      regarder la page. ⚠️ Le viewport y est **forcé à 390 px**, sinon le contrôle de débordement
      portait une étiquette qu'il ne vérifiait pas.
- [ ] **G10 — retrait de `Dependance` : DÉPLACÉ au Sprint 42, avec motif.** `DEPENDANCE_FACTOR` est
      dupliqué dans `lib/interruption.ts:92` et `lib/portefeuille.ts:48`, et **G1 supprime
      `interruption.ts` au Sprint 42**. Le retirer ici imposait d'écrire une couche de compatibilité
      que le Sprint 42 aurait supprimée quinze jours plus tard. `Dependance` est donc marqué
      `@deprecated` dans le code, avec la date de son retrait. ⚠️ **Écart au plan écrit, assumé et
      daté** — pas un renoncement.

**Critère d'acceptation** *(note §8)* : « formulaire couvrant tous les champs de §2.2, avec valeurs par
défaut sectorielles clairement marquées comme hypothèses ». ✅ **Atteint sur les champs**, avec une
réserve explicite : il n'y a **aucun défaut sectoriel** dans le vecteur. La note en demande, mais son
anti-pattern n°5 interdit de brancher le moteur sur le secteur — et la revue du Sprint 21 avait déjà
fait retirer une table « secteur × niveau ». Le seul défaut posé est `loadProfile: "uniforme"`, qui est
**l'hypothèse que l'outil faisait déjà en silence**, désormais nommée et modifiable.

**Vérifications** : build + lint clean, **23 suites** (`site-profile.test.ts` neuf, **49
assertions**), **69/69 e2e** (7 neufs). ⚠️ Aucune donnée réelle : l'egress est bloqué, mais le
sous-formulaire est **entièrement client**, donc ces 7 contrôles exercent le vrai composant et non un
bouchon.

⚠️ **Deux défauts trouvés en regardant la page**, invisibles aux tests unitaires : un espace manquant
(« 80 000 m³/an(déduit de la part) ») et, plus instructif, le champ d'usage **exposé en `combobox` et
non en `textbox`** — il porte un `list="usage-suggestions"`, et un `<input list>` prend le rôle
`combobox`. Sémantiquement juste, mais c'est l'**arbre ARIA** qui l'a dit, pas le DOM : la leçon de la
session lecteur d'écran, repayée.

## Sprint 41 — VNP nominal, crise et structurel séparés ✅ (moteur) / ⏳ (affichage)

**Livré** : `lib/vnp.ts` neuf, `scripts/test/vnp.test.ts` neuf (**40 assertions**). ⚠️ **Le moteur
n'est branché sur aucune interface** : rien n'affiche encore de m³. Voir la réserve en fin de section.

- [x] `VNP = Σ_jours Σ_usages ρ × (V_ref − V_exempt)`, en m³/an, **avec la fourchette héritée de ρ**
      (**G2**) — vérifié : 30 j quantifiés + 10 j non quantifiés donnent **15 000 à 25 000 m³**.
- [x] **V_ref typé par régime** (**G9**) : `icpe` / `declare` / `indisponible`. Un site sans volume
      déclaré reçoit un **refus motivé**, jamais une moyenne maison — la note prévient qu'« une moyenne
      calculée maison créera un désaccord avec la DREAL et détruira la confiance du client ».
      ⚠️⚠️ **La définition réglementaire n'est PAS implémentée, et c'est délibéré.** Le Sprint 38 a
      mesuré que Légifrance répond **403 sur les trois routes, avec les deux UA** : le texte de
      l'arrêté du 30 juin 2023 n'a pas pu être lu, et **une formule réglementaire ne se reconstitue
      pas de mémoire**. Le régime `icpe` signifie donc « volume déclaré d'après l'arrêté du site » —
      le chemin de surcharge que la note prévoit elle-même — et la trace d'audit **le dit**. Reste à
      faire : transcrire la définition à la main avec citation d'article, comme pour le décret
      2021-795.
- [x] **Volume exemptable déduit** (§4.2b), avant application de ρ — mesuré : exempter 10 % du volume
      de référence retire exactement 10 % du VNP.
- [x] **Prélèvement vs consommation** (§4.2c) : un taux de restitution de 95 % ramène le VNP à 5 %,
      un taux de 5 % le laisse à 95 % — **facteur 19**, l'ordre de grandeur que la note annonce.
      ⚠️ Un taux non déclaré **ne vaut pas 0** : le chiffre reste un prélèvement, et l'hypothèse est
      journalisée.
- [x] **`VNP_crise` et `VNP_structurel` ne peuvent pas être agrégés** (anti-pattern n°3). ⚠️ Ce n'est
      pas une convention mais une **contrainte de forme du type** : `VnpResult` n'expose aucun champ
      qui les combine, et **un test lit le source du module** pour qu'un futur `total` fasse rougir la
      suite au lieu de dépendre de l'œil d'un relecteur. Même patron que le test miroir de
      `DEPENDANCE_FACTOR`. Le seul accès aux deux, `vnpComponents()`, les rend **séparés et étiquetés**.
- [x] **κ = 1 nommé** (ADR-005) : le journal d'hypothèses dit « le VNP servi est le VNP **NOMINAL**,
      hypothèse volontairement conservatrice ». κ est paramétrable, et le défaut est déclaré.
- [x] **Journal d'hypothèses au moment du calcul** (amorce de l'ADR-006) : taux de restitution
      manquant, volume exempté non déclaré, jours écartés faute de mesure lisible — chacun avec sa
      conséquence. ⚠️ « Les jours à niveau illisible **ne comptent pas 0 m³, ils ne comptent pas du
      tout** », et un test l'exige.
- [ ] **Affichage : non livré.** Aucun panneau ne montre de VNP. Le brancher demande d'acheminer
      jusqu'au calcul l'intervalle d'exposition, les jours par niveau et le profil du site — plomberie
      dans `HomeClient` qui croise celle du Sprint 42. ⚠️ **Un moteur sans affichage n'est pas un
      indicateur livré** : la fourchette de G2 n'atteint toujours pas l'écran par ce chemin.
- [ ] **VNP par usage** plutôt que par moyenne d'exposition : demande de joindre `usageCode` à la
      nomenclature du Guide Sécheresse, déjà embarquée (`data/restrictions/guide.json`). **C'est le
      plus grand gain restant du chantier**, et il n'est pas fait.

**Critère d'acceptation** *(ajouté ici)* : deux nombres distincts, chacun avec sa fourchette et son
étiquette ; **aucun chemin de code ne les additionne**, et un test l'exige. ✅ **sur le moteur**,
⏳ tant qu'il n'y a pas d'affichage.

**Vérifications** : build + lint clean, **24 suites** (une neuve, 40 assertions), 69/69 e2e inchangés
(aucune interface touchée).

## Sprint 42 — IA : généraliser la convexité déjà écrite ⏳ (moteur livré, migration à venir)

**Livré** : `lib/ia.ts` neuf, `scripts/test/ia.test.ts` neuf (**42 assertions**).
**Pas encore fait** : la migration des consommateurs, le retrait de `interruption.ts` (G1), de
`Dependance` (G10) et de `REVENUE_SHARE_PER_DAY` (G6). Voir la réserve en fin de section.

- [x] **La logique d'épisode est remontée dans le noyau** et sert désormais un site seul, là où
      `portefeuille.ts:375-398` ne la servait qu'au parc.
- [x] **Les trois fonctions de réponse** (§4.3), vérifiées à volume égal — 50 % du volume bloqué sur
      10 jours : `linear` perd **5 JEA**, `stepwise` perd 5 (chute au palier), `threshold` perd
      **10** (l'installation tourne ou ne tourne pas). Un test exige que `threshold` soit strictement
      pire que `linear` à volume égal.
- [x] **`min_technical_threshold` est un plancher sous toutes les réponses**, pas une quatrième
      réponse : sous le seuil, le site s'arrête quelle que soit sa forme de réponse.
- [x] **Sortie en JEA**, `Σ (1 − production_t)`, et non en jours d'arrêt net.
- [x] **La fourchette de ρ atteint les JEA** (**G2**) : une mesure non quantifiée donne **0 à 10 JEA**
      sur un épisode de 10 jours.
- [x] **Volume exempté et taux de restitution atteignent l'IA** : 90 % restitué laisse 90 % de la
      production, un tiers exempté en garde un tiers.
- [x] **La distribution des durées d'épisode et le maximum consécutif sont exposés** — §5.5 en fait
      un critère de validation à part entière, et le comparer suppose de le publier.
- [x] **Journal d'hypothèses** : réponse non déclarée, réserve absente, réserve convertie depuis des
      jours d'autonomie, épisodes écartés faute de mesure lisible.

### ⚠️ Une erreur de modélisation, trouvée par le test central

La première version traitait la réserve comme un **stock dépensé une fois pour la vie du site**. Le
test de convexité l'a attrapée immédiatement : quarante épisodes d'un jour coûtaient alors **exactement
autant** que deux de vingt (37 JEA dans les deux cas), ce qui **détruit la convexité** que le module
existe pour exprimer.

La correction est physique : **une cuve se remplit dès que la restriction cesse**, donc le défaut est
un remplissage complet entre épisodes — et c'est précisément ce que `portefeuille.ts` supposait déjà
avec son `max(0, durée − autonomieJours)` par épisode. `rechargeM3ParJour` sert désormais à modéliser
un remplissage **plus lent**, ce qui pénalise les épisodes rapprochés.

Résultat mesuré, avec une cuve de 3 jours sur les **mêmes 40 jours de restriction** :

| Structure | JEA |
|---|---|
| Quarante épisodes d'un jour | **0** |
| Deux épisodes de vingt jours | **34** |

C'est l'exemple de la note, reproduit — et la démonstration qu'un total annuel ne peut pas distinguer
les deux.

- [ ] **G1 — retrait de `interruption.ts` : NON FAIT.** Six consommateurs à migrer
      (`InterruptionPanel`, `SitesDashboard` colonne/tuile/CSV, `portefeuille`, `executive`,
      `report` §6) et 3 suites de tests. ⚠️ **Piège à traiter avec le retrait, pas après** :
      `scripts/test/portefeuille.test.ts:377-383` garde `DEPENDANCE_FACTOR` en phase **en lisant le
      texte source** de `interruption.ts` — il cassera au `readFileSync`, pas au typage, dans une
      suite dont le nom ne mentionne ni l'un ni l'autre.
- [ ] **G10 — retrait de `Dependance`** : à faire avec le point ci-dessus (les deux copies de
      `DEPENDANCE_FACTOR`).
- [ ] **G6 — retrait de `REVENUE_SHARE_PER_DAY`** : touche la colonne CSV
      (`SitesDashboard.tsx:531`), la phrase de `executive.ts:143` et 3 vérifications.
- [ ] **Affichage** : ni le VNP du Sprint 41 ni les JEA n'atteignent l'écran. ⚠️ **Deux moteurs sans
      interface ne font pas deux indicateurs livrés**, et la fourchette de G2 n'arrive toujours pas au
      titre par ce chemin.

**Critère d'acceptation** *(note §8, chantier 3)* : la distribution simulée des durées d'épisode
reproduit l'observée. ⚠️ **Hors de portée pour l'instant** — il n'y a pas de modèle simulé avant le
Sprint 45 (N2). Ce que ce sprint livre est la distribution **observée** et le moteur qui la consomme.
C'est un critère de renoncement pour N2, pas pour ici.

**Vérifications** : build + lint clean, **25 suites** (une neuve, 42 assertions), e2e inchangés.

## Sprint 42a — VNP et JEA à l'écran, pondérés par la saison ✅

**Objectif.** Le Sprint 41 a livré un moteur VNP et le Sprint 42 un moteur IA ; ni l'un ni l'autre
n'atteignait l'écran. Un moteur sans interface n'est pas un indicateur livré : ce sprint branche les
deux, **à côté** de `joursContraints` et non à sa place (arbitrage G16 — brancher d'abord, retirer
ensuite, pour que l'ancien chiffre serve de témoin au nouveau avant d'être supprimé).

- [x] **Pondération mensuelle du VNP (G19)** — `lib/vnp.ts` accepte `daysByMonthAndLevel` (année →
      mois → niveau → jours) et `profilMensuel`, et répartit le besoin journalier selon le profil au
      lieu de l'étaler à plat. `meanDaysByMonth` moyenne l'historique sur les **années complètes
      seules**, comme le modèle de jours. ⚠️ **Le défaut que ça corrige est d'un facteur trois** :
      dix jours de crise en août pour un site à pic estival valent ~29 400 m³, la même arithmétique à
      plat en annonce 10 000. Le sens de l'erreur est journalisé (`SOUS-ESTIMÉ`) quand le profil
      manque, plutôt que laissé implicite.
- [x] **`components/IndicateursNote.tsx`** — les deux composantes du VNP dans deux cartouches
      **jamais additionnées** (anti-pattern n°3), les JEA avec le nombre d'épisodes réels et le plus
      long, les manques du profil, et le journal d'hypothèses en `<details>`. Landmark nommé
      (`variant="modele"`, `as="section"`, `ariaLabel`), parce que ces chiffres sont **calculés** et
      non le contenu d'un arrêté.
- [x] **Fourchette jusqu'au m³ (G2)** — `fourchette()` n'affiche un point que si la borne haute et la
      borne basse coïncident à moins de 1 près. Une crise à ρ ∈ [0,7 ; 1] s'affiche « 22 000 à
      31 000 m³ », jamais 22 000.
- [x] **Le fetch `/api/restrictions` remonte dans `HomeClient`** — il vivait dans
      `InterruptionPanel`, seul consommateur à l'époque ; le VNP a besoin du **même** intervalle ρ, et
      ce panneau disparaît avec G1. Le hisser plutôt que d'ajouter un `onExposure` sur un composant
      condamné : une requête, un propriétaire, et le propriétaire survit à la migration. Les props
      `profil`, `departement`, `zoneType` d'`InterruptionPanel` disparaissent au passage — elles ne
      servaient qu'à cette requête.
- [x] **`?periodes=1` sur l'appel d'historique** — le calendrier RLE de la zone gouvernante alimente
      `episodesFromPeriodes`. Coût mesuré au Sprint 26 : 271 octets pour 22 plages.
- [x] **10 vérifications e2e neuves** (69 → **79**), toutes les sources en amont bouchonnées.

⚠️ **Le défaut que ces vérifications ont trouvé, et qu'aucun test unitaire ne pouvait voir.** Au
premier passage, seul le **VNP structurel** s'affichait : `setExposureInterval` avait été posé dans
le callback d'**export de rapport**, si bien que l'intervalle restait `undefined` jusqu'à ce que
l'utilisateur exporte un PDF — et le VNP de crise n'avait aucun ρ à appliquer, silencieusement. Les
52 assertions de `vnp.test.ts` passaient toutes : le bug portait sur **qui va chercher quoi**, pas
sur la formule. C'est l'argument entier en faveur d'une vérification qui traverse l'écran.

**Critère d'acceptation** : les deux indicateurs physiques de la note sont lisibles sur la fiche site
sans export, avec leur fourchette et leur journal d'hypothèses. ✅

**Ce qui reste ouvert** :
- [ ] Deux décomptes de jours coexistent à l'écran (`joursContraints` et les JEA). C'est le prix
      assumé de G16, à solder au Sprint 42b — pas une omission.
- [ ] `profilMensuel`, `tamponM3`, `seuilTechniqueM3`, `paliers` et `reponse` n'ont **pas de champ de
      saisie** : le moteur les lit, le formulaire ne les propose pas encore. Le panneau dit lesquels
      manquent, ce qui rend le trou visible mais ne le comble pas.
- [ ] Aucun de ces chiffres n'a été vu sur un vrai site avec de vraies données — l'egress est bloqué
      et la dette du HANDBOOK §5 reste entière.

**Vérifications** : build + lint clean, **25 suites** (`vnp.test.ts` 43 → **52** assertions), **79
vérifications e2e** dont 10 neuves.

## Sprint 42b — retrait de `joursContraints`, et ce que le retrait a révélé ✅

**Objectif.** Solder G1, G6 et G10 : retirer `lib/interruption.ts`, `Dependance` et
`REVENUE_SHARE_PER_DAY`, et faire des trois sorties de la note les seules sorties du produit.

⚠️ **Le retrait naïf aurait détruit des fonctionnalités justes.** `computeInterruption` faisait deux
choses : un mauvais calcul (`jours × exposition × DEPENDANCE_FACTOR`, un coefficient inventé
multipliant une quantité mesurée) **et** une bonne machinerie d'horizons — année type, fin de saison,
2050 par allongement Explore2 — que `lib/ia.ts` ne remplaçait pas. Supprimer le module entier aurait
fait disparaître l'horizon 2050 et la fin de saison. Le sprint sépare donc les deux :

- [x] **`lib/js.ts` (neuf)** — reprend la machinerie d'horizons **en jours purs**, sans pondération
      d'exposition ni coefficient. Publie par horizon un **vecteur `parNiveau`**, le total, et le
      **niveau de preuve** (`annee_type` = N1 fait publié, `fin_saison` = N2, `horizon_2050` = N3). Un
      test miroir lit le source du module et **échoue si le mot `exposure` y réapparaît** : c'est une
      contrainte de forme qu'aucun test de valeur ne peut attraper.
- [x] **`computeIaHorizon` + `scaleEpisodes` dans `lib/ia.ts`** — projette les JEA sur un horizon en
      **allongeant les épisodes observés**, jamais en mettant un total de jours à l'échelle. ⚠️ **Ce
      choix vaut 70 % du résultat**, mesuré : sur 54 jours de crise avec une réserve de 10 jours,
      allonger deux épisodes de 20 j en 27 j coûte **17 JEA**, répartir les mêmes 54 jours en épisodes
      plus courts en coûte **10**. Multiplier le total aurait produit le chiffre optimiste sans le dire.
      L'argument physique : `dtBE_yr` allonge la *période* de basses eaux, il ne disperse pas de
      nouveaux épisodes en hiver.
- [x] **`lib/indicateurs.ts` (neuf)** — point de calcul **unique** des trois sorties. Avant, la fiche
      site, la synthèse rédigée et le rapport exporté dérivaient chacun sa version des mêmes chiffres
      (`synthese.ts` avait son propre `volume / 365 × jours`) : rien ne garantissait que le PDF et
      l'écran concordent. Prérequis de l'ADR-006, pas du rangement.
- [x] **`components/ImpactPanel.tsx`** remplace `InterruptionPanel` : il devient le **chapitre de
      preuve** — ρ lue par niveau et par usage, en fourchette — placé **avant** les sorties qu'il
      justifie. L'ancien panneau mettait un chiffre de tête au-dessus des mesures dont il venait.
- [x] **G10 — `Dependance` supprimé**, et remplacé dans l'interface par la **réponse de production**
      de §4.3 (`linear` / `threshold` / `stepwise`), libellée par la machine plutôt que par la
      catégorie (« Tout ou rien (seuil technique) »). Défaut : **non renseignée**, et le moteur
      journalise qu'il applique `linear`. ⚠️ Le paramètre d'URL `dep` n'est **pas migré** : ses quatre
      valeurs désignaient un coefficient, pas un comportement, et il n'existe pas de traduction honnête.
- [x] **G6 — `REVENUE_SHARE_PER_DAY` supprimé** dans ses deux copies. Les euros viennent désormais
      **uniquement** d'un coût journalier déclaré, multiplié par les JEA. Quand des sites manquent au
      total, la phrase du portefeuille **dit combien** — un total partiel lu comme complet est le seul
      risque du retrait.
- [x] **Le piège annoncé, traité avec le retrait.** `portefeuille.test.ts:377-383` gardait
      `DEPENDANCE_FACTOR` en phase en **lisant le texte source** de `interruption.ts`. Remplacé par le
      garde durable plutôt que le garde de dérive : six modules sont relus, et la suite échoue si l'un
      d'eux réintroduit `DEPENDANCE_FACTOR`, `REVENUE_SHARE_PER_DAY`, une arithmétique sur
      `caAnnuelEuros` ou un littéral `* 0.005`. Les commentaires ont le droit de les **nommer** — c'est
      ainsi que le retrait reste explicable.

⚠️⚠️ **Le défaut réel que le retrait a exposé.** `portefeuille.ts` décodait ses épisodes lui-même et
**fusionnait les plages contiguës** de niveaux différents : une alerte qui durcit en crise ne laisse
pas la cuve se remplir. `episodesFromPeriodes` ne fusionne pas. Pendant la durée d'une édition, la
réserve se remplissait donc **entre les deux moitiés d'une restriction continue**, absorbant trois
jours deux fois : **14 JEA au lieu de 17** sur le cas de test. Corrigé dans `lib/ia.ts` — un écart nul
entre deux épisodes ne remplit rien, quel que soit le taux de recharge.

**Deux autres défauts trouvés par les garde-fous** :
- `react-hooks/exhaustive-deps` a signalé que le callback d'export ne déclarait ni `interne`, ni
  `usages`, ni `restrictions`. **Exactement la classe de bug livrée au Sprint 42a** : un rapport
  exporté après saisie du volume aurait contredit l'écran. Un avertissement ignoré deux fois est un bug.
- La vérification de débordement à 390 px a attrapé le nouveau sélecteur : un `<select>` est dimensionné
  par son **option la plus longue**, et « Par paliers (lignes de production) » le portait à 278 px,
  poussant la ligne 90 px au-delà du viewport. Corrigé par `min-w-0` / `w-full`.

**Ce qui reste ouvert et qui est une régression assumée** :
- [ ] **Le JEA exige plus de déclarations que l'ancien `joursArretNet`** : un volume de référence et une
      ρ lisible, là où l'ancien se contentait d'`autonomieJours` + calendrier. **Moins de sites
      obtiennent un chiffre** ; ceux qui en obtiennent un ont un chiffre qui veut dire quelque chose —
      l'ancien comptait tout jour restreint au-delà de la réserve comme un arrêt **total**, ce qui
      surestimait en supposant le pire.
- [ ] Les colonnes CSV changent de nom (`jours_contraints_*` → `jours_sous_arrete_*`, `jea_*`,
      `vnp_crise_m3_*`). **Rupture assumée** : un tableur bâti sur les anciens noms ne lira pas
      silencieusement les nouveaux, ce qui est le comportement voulu.
- [ ] `profilMensuel`, `tamponM3`, `seuilTechniqueM3` et `paliers` n'ont **toujours pas** de champ de
      saisie. `reponse` en a un depuis ce sprint.

**Vérifications** : build + lint clean (0 avertissement), **26 suites** (`js.test.ts` et
`indicateurs.test.ts` neuves), **88 vérifications e2e** dont 9 neuves.

## Sprint 43 — JS par ressource, et fin de la migration `maxGravite` ✅

- [x] **JS en vecteur par ressource** (`lib/rattachement.ts`, neuf) : SUP / SOU / AEP côte à côte,
      **toujours les trois**, pour qu'une absence de couverture se voie. ⚠️ « Aucune zone à ce point »
      et « une zone sans restriction » sont **deux faits différents** et un seul dit quelque chose sur
      le site.
- [x] **Niveau effectif pondéré par les parts volumiques** (ADR-003), en **rang réel** et non en
      niveau nommé : 99 % de réseau en vigilance + 1 % de rivière en crise donne **1,03**, pas
      « vigilance ». Arrondir ici est précisément ce qui perd le 1 %.
- [x] **G5 — le maximum disparaît des quatre points d'appel** (`HomeClient`, `SitesDashboard`,
      `ResultPanel`, `app/api/carte/etat`). Une section de test **relit le source de ces quatre
      fichiers** et échoue si `maxGravite(` y réapparaît : c'est une contrainte de forme qu'aucun test
      de valeur ne peut voir, puisque avec une seule ressource le maximum et la pondération donnent le
      même chiffre.
- [x] ⚠️ **Le maximum ne disparaît pas du produit — il devient un barreau nommé.** Sans déclaration,
      la lecture prudente *est* la bonne : la résolution est une échelle à trois barreaux
      (`vecteur` → `origine_unique` → `maximum`) et **`base` et `degrade` reviennent avec le
      chiffre**. C'est ce que l'ancien `maxGravite(zones)` rendait impossible : il renvoyait un niveau
      nu, et aucun appelant ne pouvait savoir s'il tenait une lecture ou un repli. **C'est ainsi que
      l'anti-pattern n°1 a survécu à sa propre correction au Sprint 21** — `levelForOrigin` existait,
      et rien ne disait où il n'était pas appliqué.
- [x] **La mention « ⚠︎ repli » sur chaque ligne du tableau de portefeuille**, et l'explication dans
      le popup de la carte : un point sur une carte n'a pas de vecteur d'usages, donc la couleur *est*
      le maximum — ce qui devait être écrit, pas supposé.
- [x] **État `rattachement_ambigu`** avec la **liste des zones candidates**, leurs codes et leurs
      niveaux. Deux cas : plusieurs zones du même type couvrant le point (le référentiel VigiEau se
      recoupe), ou une source déclarée **sans zone correspondante**. Jamais tranché en silence.
- [x] **Avertissement §4.1 dans l'interface** : livré au Sprint 42b, `js.avertissement` est à l'écran
      et dit que JS est **le moins durable des trois** indicateurs.
- [x] ⚠️⚠️ **Le changement de méthode est daté, annoncé, et pas silencieux.** `lib/modele.ts` (avancé
      du Sprint 44, parce que 43 en dépend) porte une **version de modèle** `2026.08.1` et un
      **journal des changements** avec, pour chacun, les sorties touchées et **le sens du décalage**.
      `components/ChangementMethode.tsx` l'affiche en tête du portefeuille : « les chiffres ont changé
      de méthode, pas de risque », avec le sens (« vos scores vont généralement **baisser** ») et le
      démenti explicite (« ce n'est pas une évolution de votre exposition »). Le rapport exporté porte
      la même section. **Premier cas dans ce dépôt où une correction de justesse déplace un chiffre
      que quelqu'un a déjà lu.**

⚠️ **Le défaut trouvé en écrivant les tests, et pourquoi il est instructif.** La première version de
`lib/rattachement.ts` traduisait les types de source vers les types de zone avec une table
`{ superficiel: "SUP", souterrain: "SOU", reseau: "AEP" }`. Or `SourceType` **est déjà**
`"SUP" | "SOU" | "AEP"` : la table ne correspondait à rien, toutes les parts revenaient à 0,5 et le
rang pondéré sortait à **0**. Deux vocabulaires d'apparence identique et une table fausse : un test à
**un seul usage** n'aurait rien vu, puisque 100 % d'une source donne le bon niveau par accident.

**Critère d'acceptation** *(note §8, chantier 1)* : « ≥ 98 % des adresses rattachées sans ambiguïté ;
les ambiguïtés restantes explicitement signalées, jamais résolues silencieusement ».
⚠️ **La seconde moitié est tenue** : `rattachement_ambigu` liste les candidats et ne tranche pas.
**La première ne l'est pas et ne peut pas l'être ici** — mesurer un taux sur un jeu d'adresses
demande l'egress, donc l'échappatoire Actions (HANDBOOK §3). C'est un critère **non mesuré**, pas un
critère atteint.

**Vérifications** : build + lint clean, **27 suites** (`rattachement.test.ts` neuve, 30 assertions),
**97 vérifications e2e** dont 9 neuves.

---

## Sprint 44 — Auditabilité structurelle, juridiction, niveaux de preuve ✅

- [x] **Version de modèle gelée et datée** — `lib/modele.ts`, avancé au Sprint 43 parce que 43 en
      dépendait. `2026.08.1`, avec un **journal des changements** portant, pour chaque entrée, les
      sorties touchées et **le sens du décalage** sur les chiffres déjà publiés.
- [x] **Journal d'hypothèses par calcul** — livré aux Sprints 41/42 (`hypotheses` sur les trois
      moteurs), agrégé au 42b par `lib/indicateurs.ts`, reproduit à l'écran et dans les deux exports.
- [x] **Traçabilité mesure → arrêté** — le CSV portait `arrete.id` et `arrete.numero` **depuis le
      début** (mesuré dans `note-technique-probe.json`) et le build les jetait. `build_restrictions.py`
      les conserve désormais sous forme de **table par département** (`_arretes`, id → numéro + zone)
      plus une liste d'ids par mesure ; l'API les rend, et `ImpactPanel` affiche le numéro sous chaque
      mesure. ⚠️ **Le câblage est complet, la donnée attend le workflow Actions** : le build exige
      l'egress. Une ligne `INFO` de la suite de tests dit lequel des deux états est en cours, plutôt
      que de laisser croire que la traçabilité fonctionne déjà sur les shards du dépôt.
- [x] **Note méthodologique exportable, générée, jointe aux DEUX exports** — `lib/noteMethodologique.ts`
      l'assemble **depuis les structures que les moteurs exposent** (version, journal, confiances,
      juridiction, typologie ρ). ⚠️ Une note rédigée à la main est juste le jour où on l'écrit et
      fausse dès le commit suivant : c'est l'anti-pattern n°7 sous sa forme la plus pure. Une seule
      note, la même pour la fiche site et le portefeuille — une variante « courte » serait une seconde
      note à tenir à jour, et celle que personne ne lit est celle qui dérive.
- [x] **Trois niveaux de confiance par sortie (ADR-004)** — `lib/confiance.ts`. Classement **haute**,
      JS **haute** (avec sa réserve de durabilité), VNP et IA **moyennes**, score **moyenne**, euros
      **basse**. Badge à côté de chaque titre à l'écran, avec le motif et l'usage légitime en
      infobulle. ⚠️ Distinct de `scoreConfidence`, qui mesure la **couverture** des composantes : un
      chiffre en euros parfaitement couvert reste de confiance basse.
- [x] **Étiquetage N1/N2/N3 sur toute sortie** — colonne « Preuve » dans le tableau JS depuis 42b,
      légende dépliable ajoutée ici. ⚠️ La légende dit explicitement que **preuve et confiance ne se
      déduisent pas l'une de l'autre** : le classement est de confiance haute sur des entrées N2.
      **G8 tenu** : les jours sous arrêté passés restent affichés comme fait public opposable ; le VNP
      et l'IA reconstitués sont des sorties de modèle.
- [x] **G3 — couche juridiction, FR seule** — `lib/juridiction.ts`. ⚠️ **Le tri jamais fait est fait**,
      et il était mesurable : les 18 fichiers référençant `NiveauGravite` ne coûtaient rien (un import
      de type), la vraie population était les **huit tableaux littéraux** des quatre niveaux. Ils sont
      remplacés par `NIVEAUX` ; une section de test relit les huit fichiers et échoue si un littéral
      réapparaît. L'avertissement de l'ADR-002 est **recopié verbatim** en tête du module : G3 accepte
      le coût, elle ne le supprime pas. Le champ `cadence` existe avec une seule valeur, parce que
      c'est lui qui décide si `episodesFromPeriodes` veut dire quelque chose.
- [x] **G15 — les sites hors France sont « non couverts », explicitement.** Un champ `horsPerimetre`
      **distinct** de `notCovered`, parce que « la France vous couvre et rien ne s'applique » et « nous
      ne couvrons pas votre pays » sont deux faits que VigiEau rend tous deux par une liste vide : un
      site à Barcelone lisait « aucune restriction en vigueur ».
      ⚠️⚠️ **Le trou résiduel est nommé et testé.** Une boîte englobante autour de la France contient
      nécessairement la Catalogne, le Piémont et le Kent — **Barcelone passe le garde-fou**, et un test
      l'affirme pour que la limite soit une propriété connue du code et non une surprise. La preuve
      positive dont on dispose est le **code INSEE** : le géocodeur BAN ne rend que des adresses
      françaises, donc un site ajouté par la recherche est français par construction. Le chemin qui
      laissait passer un point étranger est le **lien profond lat/lon**, qui n'en porte pas.
- [x] **G4 — le score composite documenté comme divergence assumée**, dans la table de confiance et
      donc dans la note méthodologique : le retirer aurait rendu **inclassable** tout site dont le
      client n'a rien saisi, alors que l'ADR-004 désigne le classement comme le livrable le plus fiable.
- [x] **Horizons CSRD (§11.2)** — table de correspondance publiée : *maintenant / fin de saison / année
      type / 2050* face à court / moyen / long terme, avec la définition ESRS et le niveau de preuve.

**Critère d'acceptation** *(note §8, chantier 1)* : « tout nombre affiché est traçable jusqu'au PDF
source en un clic ». ⚠️ **Partiellement tenu, et la partie manquante est nommée** : la chaîne
mesure → numéro d'arrêté est câblée de bout en bout, mais les shards embarqués datent d'avant la
reconstruction. Le « un clic » vers le PDF lui-même n'existe pas : le dataset donne un numéro, pas une
URL de document. Il faudra soit une résolution numéro → URL, soit l'accepter comme une référence
citable plutôt qu'un lien.

**Vérifications** : build + lint clean, **28 suites** (`auditabilite.test.ts` neuve, 57 assertions),
**102 vérifications e2e** dont 5 neuves.

---

## Sprint 45 — N1 puis N2 ⚠️ (estimateur et banc livrés, modèle NON CALIBRÉ)

⚠️⚠️ **À lire avant le reste de cette section.** Ce sprint livre un **estimateur et un banc de
validation**, pas un modèle calibré. Aucun ajustement sur l'archive réelle n'a été fait : il exige
l'egress, bloqué en bac à sable. Ce qui est vérifié l'est sur **données synthétiques dont les
paramètres vrais sont connus** — ce qui démontre que l'estimateur retrouve son propre processus
générateur, et rien du tout sur sa performance en France. `ModeleN2.calibre` vaut `false` et le dira
tant que ce sera vrai.

### N1 — reconstruction 2012 → aujourd'hui ✅

- [x] **Fenêtre élargie 14 → 15 ans**, ce qui atteint 2012. ⚠️ **SPRINTS disait « la fenêtre actuelle
      est de 10 ans » : c'était périmé**, elle était à 14 depuis le Sprint 27. Coût **mesuré au banc**
      et non supposé : **2 504 ms à 14 ans contre 2 648 ms à 15**, soit +5,8 %, deux ordres de grandeur
      sous le budget de 60 s. S'arrête volontairement avant 2010-2011, où le fichier s'amincit
      réellement (24 arrêtés en 2010 contre 602 en 2012).
- [x] ⚠️ **Un résultat qui contredit le raisonnement ayant justifié le premier élargissement.** Le
      Sprint 27 avait élargi en faisant valoir qu'une fenêtre de 10 ans porte sur 2017-2025, donc sur
      2022 **et** 2023 — deux sécheresses exceptionnelles — et surestime donc la moyenne structurelle ;
      mesurée, elle tombait de 74 à 69 j/an. Passer de 14 à 15 la fait **remonter de 69 à 71 j/an**,
      parce que 2012 était lui-même plus restrictif que la moyenne des 14 années. **Élargir n'abaisse
      donc pas systématiquement le chiffre** : ça l'abaisse quand les années ajoutées sont plus calmes,
      et rien ne garantit que ce soit le cas. L'énoncé honnête est « une fenêtre plus longue est plus
      représentative », pas « plus basse ».
- [x] **Discontinuités étiquetées, jamais interpolées** (anti-pattern n°8) : `premiereAnnee` existait
      déjà et devient plus utile, pas moins — élargir la fenêtre **augmente** la probabilité qu'une zone
      n'ait pas d'historique au début, puisque VigiEau redessine son référentiel.
      `couvertureReconstruction` (neuf) énumère les lacunes jour par jour sur les années cibles et rend
      leurs bornes exactes : le critère de §8 est « sans lacune **non signalée** », pas « sans lacune ».

### N2 — l'estimateur markovien ⚠️ non calibré

- [x] **`lib/markov.ts` (neuf)** — transitions jour à jour sur les niveaux, par zone. **Pas un modèle
      de fréquence annuelle** : il reproduirait le total de jours et raterait la structure d'épisode,
      dont dépend l'IA (§4.3). Justification physique retenue et écrite : les niveaux **montent vite et
      redescendent lentement**, et cette hystérésis est une propriété du **système de décision** — un
      préfet ne lève une restriction qu'une fois la situation durablement rétablie —, pas du bruit.
      Mesuré sur série synthétique : rapport montée/descente de **2,17**.
- [x] **Une lacune d'archive n'est pas une transition.** Seuls les jours **consécutifs** d'une **même
      zone** produisent une transition ; le compte des sauts écartés est rendu. Sans cette règle, un
      trou entre un jour de crise et un jour de vigilance fabriquerait une transition crise → vigilance
      et **gonflerait les probabilités de descente** — donc raccourcirait les épisodes simulés.
- [x] **Contraintes de §5.4, toutes appliquées** : matrices distinctes de part et d'autre du **décret
      2021-795**, effets aléatoires par département, **monotonie** imposée par pooling des violateurs
      adjacents sur les probabilités cumulées, **asymétrie mesurée et non imposée**, mutualisation
      hiérarchique et drapeau `données_insuffisantes` **plutôt qu'extrapolation**. ⚠️ Une ligne sans
      aucune observation reste **vide** : ni absorbante (l'épisode serait éternel) ni uniforme (25 % de
      chance de sauter en crise, inventés).
- [x] **`lib/validation.ts` (neuf)** — le banc de §5.5, **sur la métrique finale** : score de Brier
      **multi-catégories**, diagrammes de fiabilité, validation croisée *leave-one-year-out* **et**
      *leave-one-department-out*, contre une **baseline climatologique**. ⚠️ La variante à deux classes
      (« alerte ou pire ») **note bien un modèle qui confond alerte et crise**, deux niveaux qui
      diffèrent d'un facteur plusieurs sur les JEA : c'est l'anti-pattern n°6 sous forme arithmétique.
      Et l'écart des **distributions de durées d'épisode** en distance de variation totale : sur 54
      jours identiques, deux épisodes de 20 j contre quarante de 1 j donnent une distance de **1**, le
      maximum — un modèle de fréquence ne peut pas distinguer les deux.
- [x] **Le banc a une garde contre lui-même** : un « modèle » qui prédit exactement la baseline doit
      obtenir un gain de **zéro**, et le test l'affirme. Un banc qui attribue de la compétence à un
      modèle identique à sa référence est cassé. Un modèle informé (qui connaît le niveau de la veille)
      obtient un gain de **0,58 point de Brier** en *leave-one-department-out*, tous plis positifs.
- [x] **Les plis perdus sont listés, pas moyennés.** Un gain moyen positif qui masque deux départements
      où le modèle fait pire que la moyenne longue est un chiffre qui cache le résultat.
- [x] **La baseline est calculée sur le pli d'ENTRAÎNEMENT seul** — la calculer sur l'ensemble ferait
      fuir l'information du pli de test dans la référence, et rendrait la comparaison faussement
      favorable au modèle.

⚠️ **Un défaut de performance trouvé par la suite elle-même.** `countTransitions` regroupait par zone
avec `byZone.set(z, [...existant, o])` : une recopie complète du tableau **par observation**, donc un
O(n²). Sur la série synthétique de 40 000 jours, la suite prenait **38 secondes**, presque entièrement
dans ce spread. Corrigé en poussant dans une référence tenue : **1,6 s**. La leçon est la forme, pas
les secondes — un spread dans une boucle par élément est quadratique à chaque fois, et **ça se lit
comme un regroupement**.

**Critère d'acceptation** *(note §8, chantiers 2 et 3)* :
- « les séries reconstituées reproduisent les épisodes documentés de 2022 et 2023 sans lacune non
  signalée » → ⚠️ **l'outil de mesure est livré et testé** (`couvertureReconstruction`), la mesure
  elle-même **n'a pas été faite** : elle demande l'archive.
- « le modèle bat une baseline climatologique en score de Brier sur la validation
  *leave-one-department-out* » → ⚠️ **le banc est livré et testé**, le verdict **n'existe pas**.
- « reproduit la distribution observée des durées d'épisode » → ⚠️ idem : la métrique est écrite, la
  comparaison n'a pas lieu.

**Les trois verrous, dont deux ne sont pas du code — état réel** :
1. **Egress bloqué** : toute calibration passe par l'échappatoire Actions (HANDBOOK §3). **Non lancée.**
2. **Numérisation des annexes d'arrêtés-cadres** (seuils DOE/DCR, correspondance zone → seuil) :
   travail d'extraction de volume, **non commencé**. C'est ce qui rendrait l'approche hybride de §5.2
   possible ; sans lui, la moitié « règles » du modèle n'existe pas.
3. **Trois à cinq sites pilotes** fournissant leurs données réelles 2022-2023 : **démarche commerciale,
   hors de portée d'un agent**. La note souligne que cinq sites documentés valent plus que n'importe
   quelle élégance statistique — c'est donc le verrou le plus rentable, et le seul que le code ne
   lèvera pas.

✅ **Bonne nouvelle confirmée** : quatre des six covariables de §5.3 sont **déjà dans le dépôt** (SWI,
IPS piézométrique, débit standardisé, références d'étiage). Seuls **SPI et SPEI** manquent, et le type
`Covariables` les déclare en marquant lesquels sont absents.

**Vérifications** : build + lint clean, **29 suites** (`markov.test.ts` neuve, 52 assertions),
**102 vérifications e2e** inchangées — ce sprint ne touche pas l'interface, et c'est cohérent : rien
d'un modèle non calibré ne doit atteindre l'écran.

---

## Sprint 46 — N3 : décomposition de variance, et portefeuille par lot ✅

- [x] **Deux axes de scénario (§6.2)** — `lib/scenarios.ts`. Le second **n'existait pas** : tout ce
      que portait le dépôt était hydro-climatique. Un scénario de **politique publique** modifie
      **V_ref lui-même**, indépendamment du climat — et c'est démontré par un test : à jours de
      restriction **identiques**, les trois scénarios donnent trois VNP différents. Un site peut voir
      son volume non prélevable bouger **sans un jour sec de plus**.
- [x] **Trois scénarios, chacun disant ce qu'il suppose.** ⚠️ Deux des trois portent
      `source: "aucun"` : le −25 % « ZRE généralisée » est une **borne construite pour encadrer**,
      qu'aucun instrument publié n'annonce, et le statu quo est une **référence de comparaison**
      explicitement pas le cas le plus probable. Un coefficient nu est un chiffre que quelqu'un citera.
- [x] **Décomposition de variance publiée (§6.4)** — variance inter-groupes d'un plan à deux facteurs.
      ⚠️ **Pas** la variance de toutes les cellules confondues, qui mélangerait les axes et ne
      répondrait à rien. Le terme **traductionnel** est calculé à narratif *et* politique fixés : c'est
      l'écart que le **même arrêté** produit selon la lecture de ses mesures non chiffrées — la largeur
      de ce qu'on n'a pas su lire, pas un axe de scénario.
- [x] ⚠️⚠️ **L'hypothèse de §6.4 est testée, pas affirmée.** Chacun des trois termes reçoit son propre
      cas de test où il est construit pour dominer, et la décomposition doit le nommer. Quand c'est le
      terme hydro-climatique qui domine, le module écrit que l'hypothèse de la note **n'est pas
      vérifiée** et que ce serait alors les projections qu'il faut améliorer. Une décomposition qui
      confirmerait toujours la note ne serait pas une mesure. **Conséquence de pilotage produit** quand
      elle se vérifie : mieux typer les arrêtés rapporte davantage qu'améliorer les projections.
- [x] **Convention de prudence étiquetée (§6.3)** — médiane pour le reporting, quantile 90 % pour
      dimensionner. ⚠️ **Jamais un chiffre nu** : la restitution refuse d'exister sans son intervalle
      **et** son étiquette de scénario. Chaque convention porte en outre l'usage à ne **pas** en
      faire — publier la médiane à quelqu'un qui va couler du béton est l'erreur coûteuse.
- [x] **narraTRACC par secteur hydrographique** : ⚠️ **NON FAIT, et non sondé.** Le sprint disait de
      relire la collection déjà énumérée au Sprint 22 avant de sonder à neuf ; ni la relecture ni le
      sondage n'ont eu lieu. Les scénarios livrés consomment les narratifs Explore2 **par commune**,
      déjà embarqués. C'est un manque, pas une équivalence.
- [x] **Import par lot de 50 à 500 adresses** — `lib/importLot.ts` + `components/ImportLot.tsx`.
      **Le « blocage n°1 du produit » du HANDBOOK §5 est levé** : une entreprise de 80 sites peut
      désormais charger un CSV.
      ⚠️⚠️ **La règle qui façonne tout le module** : *un géocodage silencieusement faux est pire qu'un
      géocodage manquant.* Une ligne à 40 km reçoit une zone d'alerte plausible, un niveau plausible et
      une réponse entièrement fausse que rien ne distingue d'une bonne. Donc **trois seaux et non
      deux** : importable, **à arbitrer**, échec. Une adresse ambiguë n'est **ni importée ni écartée**.
- [x] **Les cas qui rendent un géocodage faux SANS erreur**, chacun testé : la virgule dans
      « 12, rue de la Paix » (qui décale toutes les colonnes suivantes), le **point-virgule** des
      exports Excel français (imposé par la virgule décimale), le **BOM** d'Excel (qui corrompt le
      premier en-tête, donc `label`, sans autre symptôme que des sites nommés « Ligne N »), et **deux
      candidats à 0,92 contre 0,91** — indiscernables, où retenir le premier revient à tirer au sort.
- [x] **Les deux seuils sont étiquetés comme des jugements non calibrés** (0,6 d'acceptation, 0,05
      d'écart d'ambiguïté). Aucun échantillon annoté n'existe ; ils sont volontairement prudents, et le
      journal de l'import le dit à l'utilisateur.
- [x] **Rapport par ligne téléchargeable en CSV**, avec BOM pour qu'Excel FR l'ouvre correctement :
      l'utilisateur corrige son fichier au lieu de redevinier.

⚠️ **Le défaut trouvé en branchant l'interface, et il aurait été silencieux.** `importSites` du hook
filtre par `isValidSite`, qui **exige un `id`** — or une ligne de CSV n'en a pas. L'import aurait écrit
**zéro site en annonçant un succès**, parce que « rien de nouveau à ajouter » et « tout a été rejeté »
rendent tous deux 0. Corrigé par une fonction dédiée `addSites`, qui génère l'`id` **de la même façon
qu'`addSite`** pour que les deux chemins ne produisent pas des clés différentes pour les mêmes
coordonnées, et qui déduplique aussi **à l'intérieur du lot** (un CSV liste couramment deux fois la
même adresse). Une vérification e2e lit `localStorage` après le clic : c'est elle qui aurait attrapé ça.

⚠️ **Un second défaut, dans la vérification elle-même.** Le stub de géocodeur filtrait sur le **libellé**
de la ligne, alors que le géocodeur ne reçoit jamais que l'**adresse assemblée** : le cas ambigu tombait
donc dans « aucun résultat » et trois vérifications passaient pour la mauvaise raison. Un bouchon dont
la clé n'est pas celle du code testé teste le bouchon.

- [x] **Classement avec seuil de matérialité, export avec note méthodologique** : la note
      méthodologique est jointe aux deux exports depuis le Sprint 44. ⚠️ **Le seuil de matérialité
      n'est pas implémenté** — il demande de décider ce qui est matériel pour un client donné, ce qui
      est un arbitrage produit non tranché.

**Critère d'acceptation** *(note §8, chantier 4)* : « décomposition de variance produite et documentée.
Aucune sortie N3 n'est publiée sans son intervalle et son étiquette de scénario. »
✅ **Tenu pour la seconde moitié** : `restituerN3` ne rend rien sans intervalle ni étiquette, et un test
l'affirme. ⚠️ **La première moitié est tenue en tant qu'OUTIL** : la décomposition est produite,
documentée et testée sur trois cas construits — elle n'a **pas** été calculée sur un site réel, faute
d'egress.

**Vérifications** : build + lint clean, **30 suites** (`n3.test.ts` neuve, 63 assertions),
**114 vérifications e2e** dont 12 neuves.

---

## Hors file — le module κ (note §7)

**Explicitement hors v1**, à instruire en parallèle. Question : *les restrictions réduisent-elles
réellement les prélèvements ?* Panel sur la BNPE (volumes déclarés par point depuis 2012), intensité
de traitement = jours pondérés sous statut, effets fixes point et année.

⚠️ **Honnêteté sur l'identification, reprise de la note** : la BNPE est annuelle, avec ~2 ans de
latence et une qualité inégale. C'est un **exercice d'encadrement, pas une inférence causale propre**,
à publier avec intervalles et limites explicites.

Le dépôt a déjà tout le client BNPE (`lib/bnpe.ts`, jointure `chroniques → ouvrages` sur
`code_ouvrage` au taux mesuré de **1,0**, avec `libelle_type_milieu`) : l'acquisition n'est pas le
verrou, l'identification l'est. **Valeur** : l'écart entre VNP nominal et VNP effectif est une
information que personne ne vend, et un argument de version ultérieure au moment où la couche visible
sera copiée.

## Ce que la note met hors périmètre — traité par G7

L'**énergie** (§0.2 : régime distinct, « le moteur général y donnerait des résultats faux ») et
l'**agriculture** (§0.2 : régime propre, acheteur différent) restent **sélectionnables**
(`lib/secteur.ts`), avec un **encart nommant le régime qui les gouverne** — débit réservé L.214-18,
limites de rejet thermique et dérogations de sécurité d'approvisionnement pour l'énergie ; tours d'eau
et OUGC pour l'agriculture — et disant que les sorties ne les couvrent pas. Ne casse aucun site
enregistré, et ne ment pas. À câbler avec l'étiquetage du Sprint 44.

---

# État de la roadmap au 2026-08-11

**Les sprints 38 → 46 de la note technique sont exécutés.** Ce qui reste n'est pas une suite de sprints :
ce sont **cinq verrous**, dont trois ne sont pas du code.

| Verrou | Nature | Ce qu'il débloque |
|---|---|---|
| ~~1. Lancer la calibration via l'échappatoire Actions~~ | ✅ **FAIT le 2026-08-11** (runs 31490333194 puis re-run corrigé) | Voir la section « Ce que la calibration a répondu » ci-dessous. **L'hystérésis de §5.1 est confirmée sur l'archive réelle.** Le run a aussi révélé trois défauts de son propre protocole et une limite de modèle — c'est le résultat le plus utile qu'il pouvait produire. |
| **2. Regarder la prod** | humain | ⚠️ **En attente depuis neuf sessions.** |
| **3. Numériser les annexes d'arrêtés-cadres** | volume | La moitié « règles » de l'approche hybride de §5.2. |
| **4. Trois à cinq sites pilotes** | **commercial** | La validation de §5.5. **Le seul verrou que le code ne lèvera pas.** |
| ~~5. Trancher le « un clic vers le PDF »~~ | ✅ **tranché le 2026-08-11** | **Référence citable assumée.** Chaque mesure porte le numéro de l'arrêté dont elle sort ; le critère §8 « en un clic » est déclaré **non tenu** dans la note méthodologique. Motif : le dataset publie un numéro et non une URL, et il n'existe pas de résolution numéro → document publique et stable. Mieux vaut une référence exacte qu'un lien qui casse. |

## Ce que la calibration a répondu (2026-08-11)

Deux runs Actions : **31490333194**, puis **31491804305** après correction du protocole. Assiette :
10 221 zones, **5 381 941 journées observées**, 126 168 épisodes, archive 2011-11-17 → 2026-08-11.
Rapport complet : `data/calibration/report.json`.

| Question de §8 | Réponse mesurée |
|---|---|
| **Hystérésis de §5.1** — les niveaux montent-ils plus vite qu'ils ne descendent ? | ✅ **CONFIRMÉE.** Ratio **1,77** post-2021, **2,13** pré-2021. La justification physique du choix d'une chaîne de Markov tient sur de vraies données. Première mesure. |
| **Reconstruction 2022-2023 sans lacune non signalée** | ✅ **TENU** — et pour la première fois le critère *pouvait* échouer (voir ci-dessous). 2 667 zones ont des journées inconnues ; **0** ne le signale pas via `premiereAnnee`. |
| **Brier contre la baseline climatologique** | ⚠️ **Gain de +0,69** en *leave-one-department-out*, 100 plis, 0 perdu — **et ce chiffre ne veut rien dire seul.** |
| **Le modèle anticipe-t-il ?** (contrôle ajouté après le run 1) | ❌ **NON.** Sur les **67 335 journées où le niveau a changé**, le gain devient **−1,16** et le modèle **perd dans les 100 départements**. Le +0,69 était de la **persistance**, pas de l'anticipation. |
| **Distribution des durées d'épisodes simulée vs observée** | ❌ **NON FAIT** — exige un protocole de simulation (réplicats, graine, zones), qui est une décision de modélisation et non une mesure. L'observée est publiée pour servir de référence. |

**Le résultat qui compte est le négatif.** La diagonale de la chaîne vaut ≈ 0,99 : sur un processus
aussi persistant, « demain = aujourd'hui » bat déjà largement une moyenne climatologique. Le +0,69
mesurait donc surtout que **les restrictions durent**. Sur la question qu'un industriel pose
réellement — « mon niveau va-t-il empirer ? » — le modèle fait **moins bien** qu'une moyenne
historique. ⚠️ **Le +0,69 ne doit jamais être publié sans le −1,16 à côté.** C'est écrit dans
`lib/markov.ts`, et dans la note méthodologique jointe aux exports, pour qu'un lecteur qui n'ouvre
jamais le dépôt le sache.

**Cause la plus probable** : la chaîne **n'avait pas d'état « aucune restriction »**. `NIVEAUX` ne
contient que quatre niveaux d'arrêté, et une observation n'existait que pour une journée *sous*
arrêté. La chaîne ne pouvait donc pas représenter l'entrée ni la sortie de restriction, et la
distribution marginale qu'elle publie est **conditionnelle à « une restriction est en vigueur »**.

### ⚠️ Le cinquième état a été ajouté, et ce n'est PAS la cause (run 31495086087)

`ETAT_LIBRE` existe désormais dans `lib/markov` — **pas** dans `lib/juridiction`, dont le rôle est
d'être le seul foyer de la liste légale : « aucune restriction » n'est pas un cinquième niveau qu'un
préfet peut déclarer, et un test miroir vérifie que la chaîne ne s'y est pas glissée.

Ajusté sur du réel : **2 844 zones**, les **100 départements**, **6,0 M d'observations dont 73,5 % de
journées libres**, déduites par complément du calendrier RLE. L'état est bien peuplé —
`P(libre → libre)` = **0,9967** sur 4,4 M de transitions, `donneesInsuffisantes` vide.

| Ensemble noté | Gain de Brier | Plis perdus |
|---|---|---|
| toutes les journées | **+0,44** | 0 / 100 |
| jours de transition | **−0,98** | **100 / 100** |
| **déclenchements** (libre → sous arrêté), 14 723 journées | **−0,60** | **100 / 100** |

**Rendre le déclenchement représentable ne l'a pas rendu prévisible.** L'hypothèse est **réfutée**, et
c'est le résultat le plus utile du run : il élimine une explication au lieu d'en ajouter une. La cause
suivante, par élimination, est que la chaîne est **inconditionnelle** — sans covariable hydrologique,
rien en elle ne peut savoir qu'il ne pleut pas (reste n° 7).

✅ **Et une confirmation qui vaut d'être notée** : l'hystérésis restreinte à `NIVEAUX` ressort à
**1,78** sur cet échantillon de 2 844 zones à cinq états, contre **1,77** sur les 10 221 zones à
quatre états. Deux mesures indépendantes, à travers un espace d'états et un échantillon différents :
l'argument de §5.1 est solide, et le refactoring n'a pas déplacé le chiffre publié.

⚠️ **Le chiffre à ne jamais citer à sa place** : sur les **cinq** états l'asymétrie vaut **0,63** —
les restrictions **finissent** plus vite qu'elles n'**arrivent**. Énoncé vrai, question différente.
C'est pourquoi `asymetrie` prend désormais son ensemble d'états **explicitement** : un seul nombre
pour les deux aurait invalidé le 1,77 sans que rien ne le signale.

### Trois défauts du protocole, trouvés en lisant la réponse du run 1

Le run a produit un rapport, et c'est en le lisant qu'on a vu que le protocole était faux en trois
endroits. Ils sont notés ici parce que c'est la partie instructive.

1. **Le critère de reconstruction ne pouvait pas échouer.** Il testait
   `couvert === attendu || lacunes > 0`, or toute journée non couverte ouvre une lacune : **tautologie**.
   Il annonçait « true » sur l'archive réelle et ce « true » ne vérifiait rien. Remplacé par un critère
   qui distingue une journée **sans arrêté** (état connu, légitimement absente d'un fichier qui liste
   des arrêtés) d'une journée **inconnue** faute d'historique, et qui compte les zones dont l'inconnu
   n'est pas déclaré. Celui-là peut sortir faux ; il sort vrai, et cette fois ça veut dire quelque chose.
2. **`partMedianeCouverte` = 0,338 mesurait autre chose que son nom.** Ce n'était pas « un tiers de
   l'archive manque » : c'est la part médiane de 2022-2023 passée **sous restriction** — une
   *prévalence*, plausible pour deux années de sécheresse. Confirmation mesurée : ~2 lacunes par zone
   et par an, soit un hiver sans restriction chacune. Renommé `partMedianeSousRestriction`.
3. **Le gain de Brier ne prouvait pas ce qu'on lui faisait dire** — voir ci-dessus. Le contrôle sur
   les jours de transition a été ajouté pour cela, sans introduire de constante de lissage :
   sélectionner des journées n'en demande aucune, un « persistance lissée » en aurait demandé une.

### Ce que le parseur avoue maintenant

Le run 1 mesurait **1 592 lignes non parsées sur 12 584 (12,6 %)** sans pouvoir dire pourquoi.
`diag.rejets` attribue désormais chaque rejet à une raison. Mesuré : **1 523 lignes sans zone**
(des arrêtés que le fichier ne rattache à aucune zone d'alerte — une propriété de la source, pas un
défaut de lecture) et **69 hors fenêtre**. **Zéro** date illisible, **zéro** niveau inconnu — ce
dernier compteur est celui qui signalerait une réforme de nomenclature (anti-pattern n°9), qui
apparaîtrait sinon comme une perte de lignes inexpliquée.

## Ce qui reste non fait dans le code, par valeur décroissante

1. **Quatre champs de saisie** : `profilMensuel`, `tamponM3`, `seuilTechniqueM3`, `paliers`. Le moteur les
   lit, le formulaire ne les propose pas, le panneau dit lesquels manquent. *Verrou* : rédactionnel —
   nommer un seuil technique en m³/jour pour quelqu'un qui ne sait pas ce que c'est.
2. ~~**`episodesFromPeriodes` sur les fixtures réelles**~~ ✅ **FAIT le 2026-08-11.** Mesuré : 50 journées
   restreintes sur 4 années couvertes → **12,5 JEA/an**, retombant à **2,5** avec un tampon de 10 000 m³.
3. ~~**Borne de plausibilité sur V_ref**~~ ✅ **FAIT le 2026-08-11** (`VREF_MIN_PLAUSIBLE` = 10 m³,
   `VREF_MAX_PLAUSIBLE` = 500 000 000 m³, vérifiés **avant** les branches de régime).
4. ~~**`usageCode` ↔ nomenclature du Guide Sécheresse**~~ ✅ **FAIT le 2026-08-11** (`lib/nomenclature.ts`,
   câblé dans `ImpactPanel`). ⚠️ Le verrou annoncé (« la table demande un échantillon lu à la main »)
   était **surestimé** : la nomenclature compte **20 entrées**, lisibles en cinq minutes. En revanche la
   suite de tests a trouvé **trois défauts réels** au premier lancement, dont un rapprochement à 1,00
   sur l'usage **opposé** (« piscine collective » → « piscines **non** collective »). Ce qui restait dur
   n'était pas le volume de la table, c'était la négation et les composés.
   **Reste à faire** : appliquer un ρ **par usage** dans le calcul. Aujourd'hui le rapprochement
   *mesure et affiche* la couverture volumique ; il ne module pas encore le ρ. *Verrou* : aucun,
   sinon que la couverture médiane observée dira si ça vaut le coup site par site.
5. **La décomposition de variance n'est branchée nulle part dans l'interface.** Calculable et invisible.
   *Verrou* : décider où — c'est un chiffre de pilotage, pas d'exploitation.
6. ~~**Un cinquième état « aucune restriction » dans la chaîne N2.**~~ ✅ **FAIT le 2026-08-11**
   (run 31495086087) — et **l'hypothèse est RÉFUTÉE**. L'état existe, il est bien peuplé
   (`P(libre → libre)` = 0,9967 sur 4,4 M de transitions, rien de signalé insuffisant), et sur les
   **14 723 déclenchements** le gain de Brier vaut **−0,60, perdant dans les 100 départements**.
   Rendre le déclenchement représentable ne l'a pas rendu prévisible. Ce n'est donc **pas** le
   verrou, et c'est le résultat le plus utile de ce run : il élimine une explication.
7. **Les covariables de §5.3 comme régresseurs.** ⬆️⬆️ **Devient le premier travail de modèle**, par
   élimination : la chaîne est **inconditionnelle**, donc rien en elle ne peut savoir qu'il ne pleut
   pas. C'est la **première** piste qui pourrait plausiblement marcher ; les deux précédentes ont été
   mesurées et écartées.

   ⚠️⚠️ **CORRECTION du 2026-08-11 : j'avais écrit « *Verrou* : aucun sur les données ». C'est FAUX**,
   et l'erreur venait d'une confusion entre « le code qui calcule la covariable est au dépôt » et
   « l'historique de la covariable est au dépôt ». Vérifié fichier par fichier :

   | Covariable | État réel | Verrou |
   |---|---|---|
   | **Mois de l'année** | ✅ disponible **sans rien fetcher** — l'archive porte les dates | **aucun** |
   | **SWI** (humidité des sols) | ⚠️ `data/swi/` n'embarque que la **climatologie** (quantiles 1990-2019 par maille) ; les valeurs mensuelles historiques sont dans 7 CSV décennaux sur data.gouv | egress → runner Actions, **faisable** ; granularité **départementale** seulement (voir ci-dessous) |
   | **IPS** (piézométrie) | ❌ `computeIps` rend une valeur **ponctuelle** (« où se situe le dernier mois »), pas une série standardisée ; les fetches sont en `daysAgoIso(...)` relatifs à aujourd'hui, station par station | il faudrait des milliers de séries longues **et** une standardisation glissante qui n'existe pas |
   | **Débit standardisé / étiage** | ❌ même problème (`computeLowFlow`) | idem |
   | **SPI, SPEI** | ❌ absents du dépôt | — |

   ⚠️ **Et un verrou spatial que je n'avais pas vu du tout** : l'archive des arrêtés ne porte que
   `zones_alerte.code` et `departement`, et **aucune géométrie de zone n'est au dépôt**.

   ### ✅ Correction du 2026-08-11 (runs 31536… puis 31541631223) — le plafond départemental était FAUX

   J'avais écrit que le rattachement serait « au mieux au **département** ». **Sondé, c'est faux** :
   la géométrie des zones d'alerte est **joignable** aux codes de l'archive.

   | Source | Identifiants | Précision¹ | Verdict |
   |---|---|---|---|
   | VigiEau — *Carte des zones et arrêtés en vigueur, GeoJSON* | 1 296 | **0,583** | ✅ **JOIGNABLE** |
   | VigiEau — GEOJSON 2013 / 2016 (membre du 1ᵉʳ janvier) | 3 / 10 | 1,000 | ✅ joignable, échantillon minuscule |
   | SANDRE `sa:ZAS`, `sa:ZAS_FXX` (+ GLP, MTQ, MYT, REU) | 500 | **0,000** | ❌ n'utilise **pas** les codes de l'archive |
   | VigiEau — *HISTORIQUE - Géométrie des zones d'alerte* | — | — | ⚠️ **ZIP sans GeoJSON** (shapefile) — non testé |

   ¹ *précision* = part des identifiants **du calque** qui sont des codes de l'archive. C'est le taux
   qui répond à la question. Le *rappel* (part de l'archive couverte) vaut 0,17 pour le calque courant
   et c'est **normal** : il ne contient que les zones **en vigueur aujourd'hui** (1 296 sur 10 221),
   alors que l'archive couvre quinze ans de zones créées, fusionnées et retirées.

   **Conséquences :**
   - Le rattachement **par zone** est possible pour les zones actuellement en vigueur → un ρ et des
     covariables par zone deviennent envisageables pour le produit **en usage courant**.
   - Pour l'**historique** (ce dont la calibration a besoin), il faut les fichiers annuels : les
     membres 2013 et 2016 confirment que le schéma d'identifiants est le même, mais chaque année est
     un ZIP de **365 fichiers quotidiens**.
   - **SANDRE est écarté** pour cet usage : la couche existe et se télécharge (le WFS fonctionne avec
     `typeNames` + `outputFormat=geojson`, consigné), mais ses identifiants ne sont pas ceux de VigiEau.
   - ⚠️ **La ressource la plus prometteuse n'est toujours pas testée** : *HISTORIQUE - Géométrie des
     zones d'alerte* est un ZIP **sans GeoJSON**, donc un shapefile. C'est la seule source qui
     donnerait l'historique complet en un fichier.

   ⚠️ **Défaut restant de ma sonde, à corriger avant de conclure quoi que ce soit sur les années** :
   elle teste le **premier membre par ordre alphabétique** de chaque ZIP annuel, soit le **1ᵉʳ janvier**
   — date à laquelle presque aucun arrêté n'est en vigueur. C'est pourquoi 2014 et 2015 sortent à
   **0 identifiant** : ce n'est pas une non-jointure, c'est un échantillon vide. Un membre de **juillet**
   serait informatif ; janvier ne l'est pas.

   **Conséquence sur l'ordre des travaux** : commencer par le **mois**, qui ne demande aucune donnée
   nouvelle et teste l'hypothèse d'inconditionnalité pour un coût nul. ⚠️ À condition de comparer à
   une baseline **elle-même conditionnée au mois** : un modèle qui connaît les saisons face à une
   baseline qui les ignore gagnerait sans rien prouver.

   ### ⚠️ Fait le 2026-08-11 (run 31498428653) — le mois ne suffit pas, et on sait pourquoi

   Une matrice par mois, **12 contextes tous bien fournis** (157 k à 465 k transitions chacun, **zéro
   mutualisé**). Le mois est un signal **fort** et la chaîne le retrouve proprement :

   | Mois | 01 | 02 | 03 | 04 | 05 | 06 | **07** | 08 | 09 | 10 | 11 | 12 |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|
   | P(quitte l'état libre), %/jour | 0,010 | 0,024 | 0,083 | 0,182 | 0,258 | 0,776 | **1,479** | 1,386 | 0,714 | 0,157 | 0,099 | 0,026 |

   Rapport janvier → juillet : **×148**. Et pourtant, sur les mêmes 14 723 déclenchements :

   | Barre | Gain de Brier | Plis perdus |
   |---|---|---|
   | climatologie **annuelle** | **−0,58** | 100 / 100 |
   | climatologie **mensuelle** (la barre honnête) | **−0,76** | 100 / 100 |

   À barre égale (annuelle), le modèle inconditionnel à cinq états valait −0,595 : conditionner au
   mois rapporte **+0,016**. Rien.

   ⚠️⚠️ **LA RAISON, et c'est elle qui contraint la suite.** Une covariable n'aide à désigner un
   **jour** que si elle varie **à l'intérieur de son propre contexte**. Le mois ne varie pas : chaque
   jour de juillet reçoit le même 1,479 %. Il améliore donc le **taux** et ne peut pas améliorer la
   **date** — et une climatologie mensuelle connaît déjà ce taux, ce qui est exactement pourquoi la
   barre honnête efface le gain. **La covariable suivante doit porter une information que le
   calendrier n'a pas** : quelque chose qui bouge d'un jour à l'autre et qui diffère entre deux
   juillets. Le SWI est le candidat ; le calendrier est mesuré et éliminé.

   ⚠️ **Ce que la barre honnête a coûté en apparence** : −0,58 annoncé contre la barre annuelle,
   −0,76 contre la barre mensuelle, soit **0,18 de Brier de flatterie**. Ici la conclusion ne
   s'inverse pas (les deux sont négatifs). Sur un modèle qui marcherait un jour, elle s'inverserait.

8. ~~**Réduire le coût d'un run avant d'ajouter une covariable.**~~ ✅ **FAIT le 2026-08-11**
   (run 31519221578). `validationCroiseeMulti` : une seule boucle de plis, un seul ajustement par
   pli, toutes les demandes (sous-ensemble × barre) notées à partir de là. **Mesuré sur le vrai
   run : 26,0 min → 14,0 min, ×1,86**, chiffres **identiques au bit près** (vérifiés un par un dans
   le rapport). ⚠️ Sur synthétique l'accélération était de ×4,11 : l'écart est le travail qui **ne
   peut pas** être partagé — téléchargement, parsing, expansion des 6 M d'observations, et la passe
   *leave-one-year-out* qui est un autre découpage. C'est la borne de ce qu'on peut encore gagner
   ainsi ; la suite demanderait de toucher au coût de l'ajustement lui-même.

9. **Conditionner sur le SWI départemental.** ⬆️ **Nouveau premier travail de modèle**, par
   élimination de trois hypothèses. *Verrou* : deux étapes de données, toutes deux faisables —
   (a) récupérer les valeurs mensuelles historiques de SWI (7 CSV décennaux sur data.gouv, egress →
   runner Actions ; `data/swi/` n'embarque que la climatologie) ; (b) rattacher chaque département à
   ses mailles SAFRAN (`data/refdata/departements.geojson` + `data/swi/cells.json` sont au dépôt).
   ⚠️ Le SWI est **mensuel**, donc il varie entre deux juillets mais **pas d'un jour à l'autre dans
   un mois** : il peut améliorer « cet été sera-t-il dur ? » et probablement pas « quel jour ». À
   dire avant de mesurer, pour que le résultat ne soit pas une surprise déguisée en découverte.
10. **SPI et SPEI manquent** (deux des six covariables de §5.3). ⚠️ Et « les quatre autres sont dans le
    dépôt » était **faux** — voir le tableau de vérité au reste n° 7 : seul le SWI est récupérable, et
    seulement à l'échelle départementale.
11. **narraTRACC par secteur hydrographique** : ni relu ni sondé. *Verrou* : egress.
12. **Une interface d'arbitrage des lignes ambiguës** de l'import. *Verrou* : aucun.
13. **Le seuil de matérialité du classement.** *Verrou* : arbitrage produit non tranché.
14. **Transcrire la définition ICPE de V_ref** à la main. *Verrou* : Légifrance 403, reconfirmé le
    2026-08-11 par un run Actions.

## Divergences assumées avec la note, à ne pas « corriger » par erreur

- **Le score composite survit en 4ᵉ indicateur** (G4). Le retirer rendrait **inclassable** tout site dont
  le client n'a rien saisi, alors que l'ADR-004 désigne le classement comme le livrable le plus fiable.
  Documenté dans `lib/confiance.ts` et donc dans la note méthodologique.
- **Le maximum entre ressources survit comme barreau nommé** (`base: "maximum"`). Sans déclaration, la
  lecture prudente **est** la bonne ; ce qui a changé, c'est qu'on ne peut plus la confondre avec une
  lecture pondérée.
- **Une seule juridiction** (G3), avec l'avertissement de l'ADR-002 recopié verbatim : sans une seconde
  juridiction réelle, l'abstraction est fictive. G3 **accepte** ce coût.
- **Le trou de G15 est documenté, testé, et TRANCHÉ le 2026-08-11 : pas de polygone France.** Une boîte
  englobante autour de la France contient la Catalogne, donc Barcelone passe le garde-fou, et un test
  l'**affirme** pour que la limite soit une propriété connue. Motif de la décision : le chemin par
  recherche d'adresse — celui que tout le monde emprunte — est **déjà protégé par construction**, puisque
  le géocodeur BAN ne délivre que des adresses françaises. Seul le lien profond lat/lon reste exposé, et
  il faut le construire à la main pour y tomber. Les ~100 kB de littoral ne sont pas justifiés par ce que
  ça fermerait. ⚠️ Le jour où un polygone arrive, le test sur Barcelone échouera — c'est voulu.
