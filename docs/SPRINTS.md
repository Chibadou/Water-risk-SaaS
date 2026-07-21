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

## Reste ouvert (backlog, chacun = vrai chantier de données)

- BNPE intégré au score via un ratio prélèvements/ressource à l'échelle du sous-bassin — bloqué tant qu'il n'y a pas de donnée de ressource renouvelable par sous-bassin (BD Topage + bilans quantitatifs).
- Rattachement automatique station ↔ aquifère du site — nécessite la géométrie BDLISA interrogée au point (le code d'aquifère est déjà affiché pour un choix manuel).
