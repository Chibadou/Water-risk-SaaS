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
