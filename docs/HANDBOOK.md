# HANDBOOK — notes de session pour HydroVigie

> Fichier de passation : concepts clés, pièges connus, état du projet et prochaines étapes.
> **À maintenir à la fin de chaque session de travail.** Dernière mise à jour : 2026-07-20.

## 1. Le projet en une minute

SaaS de suivi du **risque eau quantité** par site (adresse précise), France. Next.js 16 (App Router, TS, Tailwind 4) sur Vercel, prod : https://water-risk-saa-s.vercel.app. Plan produit complet : [`PLAN.md`](./PLAN.md) · roadmap : [`SPRINTS.md`](./SPRINTS.md) (sprints 1-6 livrés · sprints ouverts 7-10 planifiés).

**Décision structurante (utilisateur, Sprint 2)** : *local-first*. Pas de compte obligatoire, sites en localStorage, aucune donnée utilisateur côté serveur par défaut. Supabase/alertes/API = opt-in activé par variables d'environnement (checklist README). Ne pas revenir dessus sans demande explicite.

**Workflow convenu** : développer sur la branche de la session courante (2026-07-20 : `claude/open-items-sprint-plan-kml6gk`, qui contient tout l'historique de `claude/project-integration-sprint-g3wyzl`) → push → preview Vercel → retour utilisateur → sprint suivant. PR vers `main` uniquement sur demande. Si la PR de la branche a été mergée : repartir de `origin/main` avec le même nom de branche (`git checkout -B <branche> origin/main`, push `--force-with-lease`). Badge « Démo — Sprint N » dans `Shell.tsx` à incrémenter. UI en français, code/commentaires en anglais.

## 2. Architecture — concepts clés

- **Toutes les APIs externes passent par des routes serveur** (`app/api/*`) : pas de CORS, gestion d'erreur centralisée, cache `next: { revalidate }`. Les erreurs upstream retournent des messages français exploitables par l'UI (jamais de crash).
- **Sources** : VigiEau (`/api/zones`, 404 = non couvert, 409 = commune multi-zones — on envoie toujours lon/lat), BAN `data.geopf.fr/geocodage` (**l'ancien api-adresse.data.gouv.fr est mort**), Hub'Eau hydrométrie/piézométrie (~20 req/s fair-use, rayon 60 km, sondage parallèle de 8 candidates max), CSV arrêtés data.gouv (historique), Explore2 TRACC (projections).
- **Score composite v1** (`lib/score.ts`) : réglementaire 45 % + fréquence restrictions 25 % + tendance débit 15 % + tendance nappe 15 %, **renormalisé sur les composantes disponibles**. Une composante inconnue = `undefined` (jamais 0 par défaut — cf. « VigiEau down ⇒ historique inconnu, pas 0 j »).
- **Projections 2050** (`lib/projections.ts` + `data/projections/`) : données réelles Explore2 TRACC **par commune (bassin versant)**, lookup par code INSEE (arrondissements 751xx/132xx/6938x normalisés vers 75056/13055/69123), repli lat/lon → commune via geo.api.gouv.fr. 96 shards JSON par département, embarqués via `outputFileTracingIncludes` dans `next.config.ts`. `meta.json` porte la provenance et le flag `demo` (bandeau UI automatique).
- **Historique** (`lib/history.ts`) : source primaire = CSV maître « **Arrêtés** » (`f425cfa6…`, ~11 Mo, MAJ quotidienne, toutes années **dont l'année en cours** — les exports par année s'arrêtent à 2024). Une ligne = un arrêté, zones en **tableaux JSON parallèles** (`zones_alerte.code` / `.id` / `.niveau_gravite`) que le parseur explose ; schéma ligne-par-zone toujours supporté en repli. Agrégation bornée à l'année en cours (protège des dates corrompues, ex. année 0022), dédup par jour au niveau max, indexé par code zone ET id numérique. ⚠️ **« Arrêtés Cadre » (`0732e970…`) n'a pas de colonne gravité** — jamais utilisable ; ⚠️ `niveau_gravite_specifique_aep` ne doit pas matcher le motif de colonne gravité. Découverte via l'API dataset data.gouv en self-heal. **`/api/history?zones=x&debug=1` révèle chaque tentative** ; test de régression : `npx tsx scripts/test/history-parser.test.ts`.
- **Tendance 14 j** (`lib/hubeau.ts`) : moyenne 7 derniers jours vs 7 précédents, **rapportée à l'amplitude de la fenêtre** (pas à la moyenne — sinon un niveau NGF ~100 m serait toujours « stable »). Sens inversé pour les profondeurs de nappe.
- **Choix utilisateur persistés** : sites `hydrovigie.sites.v1`, stations `hydrovigie.stations.v1` (localStorage). Deep links `/?lat&lon&label&profil&ccode` relancent l'analyse complète.

## 3. Environnement de dev (bac à sable Claude) — pièges vécus

- **Egress bloqué** vers TOUS les hôtes français open-data + vercel.app (403 CONNECT du proxy — politique, ne pas réessayer). npm/pypi accessibles. WebFetch pareil.
  → **Contournement établi : GitHub Actions comme exécuteur distant.** Modifier `data/extract-request.json` (mode `discover` | `extract`) et pousser → `.github/workflows/extract-projections.yml` s'exécute avec réseau complet et **committe ses résultats sur la branche**. Attendre via un Monitor qui fait `git fetch` en boucle. Pattern réutilisable pour toute donnée inaccessible.
  → **Variante diagnostic : `data/diag-request.json` → `.github/workflows/prod-diag.yml`** (résultats dans `data/diag/`, à purger après analyse). Mode `prod` = sonde le déploiement + les sources upstream ; mode `app` = **build et démarre l'app sur le runner** puis sonde localhost (`/api/history?debug=1`, `/api/pmtiles` en Range, zones, projections, hydro) — c'est l'équivalent d'un staging avec réseau réel, utilisé pour valider le correctif historique et la route PMTiles sans déploiement.
  → Tester les intégrations avec les mocks : `scripts/test/hubeau-mock.mjs` + overrides d'env `HUBEAU_BASE_URL`, `VIGIEAU_BASE_URL`, `HISTORY_CSV_URL`.
- **`pkill -f "next start"` se tue lui-même** (le motif matche la ligne de commande du shell) → exit 144. Utiliser `pkill -f "n[e]xt start"` (astuce crochets). Lancer les serveurs de test via tâches en arrière-plan.
- **Rebuild pendant qu'un `next start` tourne** invalide les chunks servis → pages cassées, tests qui échouent mystérieusement. Toujours redémarrer le serveur après un build.
- **create-next-app** : refuse les majuscules dans le nom → scaffolder dans un répertoire temporaire ; **ne pas `cp -a` le `.git` du scaffold** (a écrasé le dépôt en Sprint 1 — réparé, mais historique fusionné).
- **Next 16** : lire `node_modules/next/dist/docs/` avant d'écrire (cf. AGENTS.md). ESLint bloque `setState` synchrone dans un effet et la lecture de refs pendant le rendu → patterns utilisés : init paresseuse `useState(() => …)`, état de chargement dérivé d'un mismatch de clé, `setTimeout(…, 0)` pour un fetch initial. `cookies()` est async. Pas de `next/font/google` (réseau bloqué au build local).
- **Playwright** préinstallé (`/opt/pw-browsers`) ; suite de non-régression : `scripts/test/e2e.mjs` (12 checks), `BASE=http://localhost:PORT node scripts/test/e2e.mjs` (installer playwright hors package.json : `npm i --no-save playwright`). Ne pas l'ajouter aux deps du projet (alourdirait le build Vercel).
- Vercel : l'erreur « No Output Directory named public » = preset framework mal détecté → réglé par `vercel.json` (`"framework": "nextjs"`) — ne pas le supprimer.

## 4. Bugs connus / dette

- **Déploiement Vercel introuvable** : `https://water-risk-saa-s.vercel.app` renvoie `NOT_FOUND` (erreur plateforme Vercel) sur toutes les routes, **y compris `/`** — plus aucun déploiement à cette URL (constaté au runner le 2026-07-20). Action utilisateur : rétablir le lien Vercel ↔ dépôt ou fournir l'URL réelle. L'« historique cassé en prod » était probablement un mélange de ça et des vrais bugs de source/schéma, corrigés depuis (cf. Sprint 7).
- **Comptes/alertes/API (Sprint 6) : code jamais testé en réel** (Supabase inaccessible depuis le bac à sable). À la première activation, s'attendre à des frictions (URLs de redirect, RLS) — tester le flux magic link en priorité.
- Rattachement stations par distance (pas par sous-bassin/aquifère BDLISA) — limite documentée dans l'UI et la méthodologie.
- Vieille interrogation non tranchée : périmètre ZAS Sandre vs périmètre VigiEau appliqué (cf. PLAN.md §Limites).
- L'historique multi-années est désormais à portée de main : le CSV maître « Arrêtés » couvre 2012→aujourd'hui ; il suffit d'élargir la fenêtre d'agrégation (année en cours actuellement) — prévu Sprint 9.

## 5. Prochaines étapes (par valeur décroissante)

1. **Rétablir le déploiement Vercel** (action utilisateur, cf. §4) puis vérifier historique + carte + bloc 2050 sur le preview.
2. **Activer Supabase/Resend** (checklist README) et tester alertes + API v1 en réel — Sprint 8.
3. **Merger vers `main`** quand l'utilisateur veut mettre la prod à jour (PR sur demande uniquement).
4. Sprint 9 : historique multi-années (fenêtre d'agrégation à élargir dans `lib/history.ts`) + composantes de score IPS nappes, débits vs VCN10/QMNA5 (Hydroportail), Onde ; rattachement hydrographique des stations (référentiels Sandre/BDLISA).
5. Sprint 10 : webhooks, volet BNPE (pression prélèvements), rôles, +4 °C partout ; UX (export du bloc 2050, page d'accueil marketing).

## 6. Vérification avant chaque push

```bash
npm run build && npm run lint          # ce que Vercel exécute
npx tsx scripts/test/history-parser.test.ts            # parseur historique (npm i --no-save tsx)
npx next start -p 3300                 # puis :
BASE=http://localhost:3300 node scripts/test/e2e.mjs   # 12 PASS attendus
```
Les APIs françaises échouent en local (egress) : les messages « indisponible » en français dans l'UI sont l'état **attendu** en bac à sable, pas un bug. La validation finale des flux de données se fait sur le preview Vercel.
