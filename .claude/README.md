# `.claude/` — agents et skills importés

> Contenu **importé depuis un dépôt tiers**, pas écrit pour ce projet. Ce fichier dit d'où il vient,
> pourquoi ces six fichiers-là et pas les 351 autres, et ce qu'il ne faut pas leur demander.

## Provenance

Tout ce qui se trouve dans `agents/` et `skills/` vient de **[affaan-m/ECC](https://github.com/affaan-m/ECC)**
(« agent harness performance optimization »), licence **MIT**, copiée dans [`LICENSE-ECC`](./LICENSE-ECC).
Import du **2026-08-07**, fichiers repris **verbatim** — aucune retouche, pour que la comparaison avec
l'amont reste possible. Les réserves ci-dessous sont donc écrites ici, pas dans les fichiers.

**ECC ne contient aucun contenu métier eau.** Ni hydrologie, ni réglementation, ni données publiques
françaises, ni cartographie. C'est un dépôt d'outillage pour agents de code : 67 agents, 284 skills,
94 commandes, 122 fichiers de règles par langage. Le tri ci-dessous ne retient donc **que** ce qui
recoupe une difficulté déjà rencontrée dans ce projet.

## Ce qui a été retenu, et pourquoi

| Fichier | Ce qu'il fait | Pourquoi lui |
| --- | --- | --- |
| `agents/silent-failure-hunter.md` | Traque `catch {}`, `.catch(() => [])`, replis par défaut qui masquent un échec, erreurs perdues | **La classe de bug la plus coûteuse de ce projet.** `/api/swi` a répondu **200 en disant « aucune mesure récente »** alors que le parseur écartait **toutes** les lignes (CRLF + gzip dans la charge utile) ; le bac à sable ne pouvait pas le voir. Même famille que « service injoignable ≠ station muette » (Sprint 32) |
| `agents/type-design-analyzer.md` | Évalue si les types rendent les états illégaux impossibles à représenter | Réponse directe au défaut du Sprint 35 : `undefined` signifiait **deux choses** (« la réponse a dit non » / « la réponse n'est pas arrivée »), d'où une synthèse qui s'affirmait puis se dédisait. Le champ `enAttente` est la correction ; cet agent cherche les cas restants |
| `agents/a11y-architect.md` | WCAG 2.2 AA ; son format de sortie impose de décrire **l'arbre d'accessibilité** produit | Prolonge [`CHECK-LECTEUR-ECRAN.md`](../docs/CHECK-LECTEUR-ECRAN.md). Apporte deux critères que le protocole maison ne couvre pas : **Target Size 24×24 px** (SC 2.5.8) et **Focus Appearance** (SC 2.4.11) |
| `skills/accessibility/SKILL.md` | Référentiel WCAG 2.2 : critères, anti-patrons, checklist | Le pense-bête normatif qui manquait — le projet avait la méthode de vérification, pas la liste des critères |
| `skills/frontend-a11y/SKILL.md` | Patrons React/Next : labels, `aria-live`, navigation clavier, gestion du focus, `prefers-reduced-motion` | Le combobox du Sprint 36 a été écrit sans référence ; il reste `SiteToc`, les bascules de couches et les popups de carte |
| `skills/click-path-audit/SKILL.md` | Trace chaque bouton à travers sa séquence d'états pour trouver les handlers qui **s'annulent entre eux** | Aucun test unitaire de ce dépôt n'attrape ça, et c'est exactement le mode d'échec du bug vieux de six sprints du Sprint 29 : `map.on("load")` n'installe aucune couche quand le fond de carte est injoignable — **trouvé en regardant la page, pas par une sonde** |

## Réserves à connaître avant de s'en servir

- **`click-path-audit` renvoie à des skills `/superpowers:*` qui n'existent pas ici**, et son exemple
  repose sur un store Zustand. Ce projet n'a **pas** de store global : l'état vit en `localStorage`
  et dans des `useState` de composants. La méthode (cartographier les écritures d'état, puis tracer
  chaque handler) tient ; les noms de skills et l'exemple sont à ignorer.
- **`accessibility` et `a11y-architect` couvrent iOS et Android.** Sans objet ici : cible web
  uniquement, vérifiée en 390 × 844.
- **Aucun de ces fichiers ne remplace le test humain au lecteur d'écran**, ni la règle maison qu'ils
  ne connaissent pas : *un attribut ARIA présent dans le DOM n'est pas un attribut exposé*
  (`aria-label` sur un `<span>` nu est **ignoré**). L'arbre ARIA reste le seul intermédiaire fiable.
  Voir `HANDBOOK.md` §1.

## Ce qui a été délibérément écarté

Écarté par **redondance affaiblissante** — le projet fait déjà plus strict :

- **`skills/verification-loop`** — s'arrête à build + types + lint + tests + 80 % de couverture. Le
  projet exige en plus les e2e **et** une vérification sur données réelles via l'échappatoire GitHub
  Actions. Adopter ce skill, ce serait baisser la barre.
- **`rules/common/testing.md`** — impose « 80 % de couverture » et un TDD strict comme critère
  d'acceptation. Ce dépôt a un problème que la couverture ne mesure pas : le code **passait** ses
  tests et était **faux en prod**. Le garde-fou utile est la sonde réelle, pas le pourcentage.

Écarté par **risque de contradiction** :

- **`skills/nextjs-turbopack`** — donne des conseils Next.js de seconde main alors qu'`AGENTS.md`
  impose de lire `node_modules/next/dist/docs/` : « This is NOT the Next.js you know ».
- **`rules/typescript`, `rules/react`, `rules/web`** (17 fichiers) — corrects mais génériques, et
  porteurs de conventions absentes d'ici (Zustand, TanStack Query, split container/présentationnel).

Écarté par **absence d'objet** : Laravel, Kotlin, Swift, Django, Quarkus, HIPAA, DeFi, VLAN homelab,
trading — l'immense majorité des 284 skills.

Écarté par **prudence** : `hooks/`, `scripts/` (247 fichiers), `install.sh`, `mcp-configs/`. Du code
tiers exécutable et des instructions chargées automatiquement dans le contexte d'un agent : rien de
suspect n'a été trouvé, mais rien n'a été audité non plus, et l'apport était nul.

## Réimporter ou mettre à jour

```bash
git clone --depth 1 https://github.com/affaan-m/ECC.git /tmp/ecc
# puis recopier les six fichiers ci-dessus, et relire ce README
```

⚠️ Chaque fichier d'`agents/` porte un préambule « Prompt Defense Baseline » de l'amont. C'est du
boilerplate d'ECC, pas une règle de ce projet — il n'a pas préséance sur `AGENTS.md`.
