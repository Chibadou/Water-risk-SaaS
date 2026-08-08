# Analyse d'écart — le code face à la note technique v1.0

> **À quoi sert ce document.** La [note technique de conception](./NOTE-TECHNIQUE-HYDROVIGIE.md)
> re-spécifie le produit plus rigoureusement que ce qui est construit. Avant de décider quoi refaire,
> il faut savoir **précisément** où l'on se trouve. Ce document donne, pour chaque exigence de la note,
> un **verdict** et un **chemin de fichier réel** — jamais une appréciation.
>
> **Date** : 2026-08-08 · **État du code analysé** : sprints 1→37 mergés dans `main`, commit `425db22`.
>
> **Ce que ce document n'est pas** : un plan. La roadmap qui en découle est en fin de
> [`SPRINTS.md`](./SPRINTS.md).
>
> ⚠️ **Limite de méthode, à lire avant les verdicts.** Tout ce qui suit vient d'une **lecture de
> code**, pas d'une exécution. Un verdict « évité » signifie « je n'ai pas trouvé le chemin d'appel
> fautif », ce qui n'est pas la même chose que « il n'existe pas ». Les numéros de ligne sont exacts
> au commit ci-dessus et se périmeront au premier refactoring : c'est le **nom des symboles** qui est
> la référence durable, pas la ligne.

---

## A. Les trois indicateurs de sortie

La note ne veut que trois sorties (§0.1). Le dépôt en produit une dizaine, dont un **score composite
0-100** qui n'est pas dans la note du tout.

| Indicateur note | Verdict | Ce qui existe déjà, et où |
| --- | --- | --- |
| **JS** — jours sous statut, par niveau **et par ressource** | **partiel** | Les jours par niveau existent et sont mesurés sur 10 ans (`ZoneHistory.joursParNiveau` — `lib/history.ts:56` et `:62` —, `parMois` et `parMoisNiveau` — `lib/history.ts:92-100`), avec le calendrier jour par jour en RLE (`periodes`, `lib/history.ts:101-118`). **Manque** : la restitution en **vecteur par ressource** (SUP/SOU/AEP côte à côte) et le **niveau effectif pondéré par les parts volumiques** exigé par l'ADR-003. |
| **VNP** — volume non prélevable, m³/an | **absent** | Aucun m³ non prélevable n'est calculé nulle part. Ce qui existe : le volume annuel déclaré par site (`DonneesInternes.volumeM3`, `lib/sites.ts:36-45`), les volumes BNPE communaux par usage et par milieu (`lib/bnpe.ts`), la trajectoire Plan Eau −10 % d'ici 2030 en texte (`lib/transition.ts:38-42`). Le plus proche voisin est `m3ARisque` (`lib/portefeuille.ts:355`), qui n'est **pas** un VNP : c'est `volume × jours / 365`, un prélèvement moyen au prorata des jours contraints, sans ρ, sans volume exemptable et sans taux de restitution. |
| **IA** — interruption d'activité, en JEA | **partiel, et plus avancé que prévu** | Voir ci-dessous : le mécanisme central de §4.3 existe, mais au mauvais endroit et sans fonction de réponse. |

### A.1 Le cas de l'IA mérite un paragraphe

Ma première lecture concluait « absent ». C'est faux, et l'erreur valait d'être corrigée avant
publication.

`lib/interruption.ts` — l'indicateur mis en avant sur la fiche site depuis le Sprint 21 — calcule
bien `jours × exposition` (`weigh()`, `lib/interruption.ts:119-140`) : pas de fonction de production,
pas de tampon, donc **pas de convexité en durée d'épisode**. Sur ce module, le constat de la note
§4.3 s'applique intégralement : un modèle qui voit juste sur le total annuel et faux sur la structure
des épisodes donne une perte proche de zéro là où elle est maximale.

**Mais `lib/portefeuille.ts:375-398` fait exactement ce que §4.3 demande** :

```ts
// Days of actual stoppage, once each episode has spent the storage buffer.
// Only the run-length calendar can answer this: a three-day tank absorbs a
// two-day restriction, and no annual total can see that.
if (s.autonomieJours !== undefined && s.autonomieJours >= 0 && s.periodes?.length) {
  const eps = episodes(s.periodes);
  …
  for (const [start, len] of eps) {
    …
    net += Math.max(0, len - s.autonomieJours);
  }
```

Épisode par épisode, sur le calendrier réel, avec un tampon qui absorbe les courtes coupures : c'est
la convexité, implémentée et testée (`scripts/test/portefeuille.test.ts`). Trois écarts subsistent :

1. **Elle ne vit que dans le portefeuille**, pas sur la fiche site — le chiffre mis en avant pour un
   site isolé reste le total annuel non convexe.
2. **Une seule forme de réponse** est implémentée, l'équivalent d'un `linear` avec seuil de tampon.
   `threshold` (l'installation tourne ou ne tourne pas) et `stepwise` (arrêt de lignes par paliers)
   n'existent pas, ni `min_technical_threshold`.
3. **La sortie n'est pas en JEA** mais en jours d'arrêt net (`joursArretNet`), ce qui suppose
   implicitement une production binaire.

**Conséquence pour la roadmap** : le Chantier IA n'est pas un développement à partir de zéro, c'est
une **généralisation** de `joursArretNet` — remonter la logique d'épisode dans le noyau, lui ajouter
`response_type`, et la servir aussi au site seul.

### A.2 Ce que le dépôt produit et que la note ne demande pas

À dire, parce que « trois indicateurs et trois seulement » est une contrainte de retrait autant que
d'ajout : **score composite 0-100** (`lib/score.ts`), **classes de risque WRI/CDP**, **indice
d'anticipation saisonnier** (`lib/anticipation.ts`), **pression sur le cours d'eau et autonomie du
territoire** (`lib/ressource.ts`), **corrélation et simultanéité de portefeuille**
(`lib/portefeuille.ts`). Rien de tout cela n'est dans la note. Deux lectures possibles — la note
resserre volontairement le produit, ou elle décrit un noyau au-dessus duquel ces indicateurs
restent légitimes — **et elle ne tranche pas**. C'est la question ouverte n°1 de ce document (voir §G).

---

## B. Les six ADR, un verdict chacun

### ADR-001 — modèle centré sur l'usage, pas sur le site ni le secteur

**Verdict : partiellement tenu, par accident heureux.**

Le dépôt *lit* bien des usages : `RestrictionRow` porte `usage`, `thematique` et les quatre drapeaux
d'audience publiés par VigiEau (`lib/restrictions.ts:155-161`), et l'exposition est calculée **par
usage** avant d'être moyennée (`exposureForProfil`, `lib/restrictions.ts:186-212`). La table pivot de
la note — `(zone × niveau × usage) → mesure` — est donc déjà la forme des données embarquées
(`data/restrictions/zones/*.json`, `lib/restrictionsData.ts`).

Ce qui manque est l'autre moitié : **le site n'est pas un vecteur d'usages pondérés en volume**. Il
porte un `Secteur`, une `OrigineEau` unique et une `Dependance` (`lib/sites.ts:9-27`), et la sélection
des usages applicables se fait par un drapeau d'audience unique dérivé du secteur (`ProfilFlagKey`).
Un site avec 95 % de son volume en AEP et 5 % en rivière ne peut pas être décrit.

⚠️ **Nuance à ne pas escamoter** : ce n'est pas le `if secteur == "industrie"` que l'ADR interdit. Les
drapeaux d'audience sont **publiés par la source** ; s'en servir n'est pas inventer une table
sectorielle. Le Sprint 21 avait d'ailleurs **écarté** une table « secteur × niveau » calibrée à la
main, précisément pour cette raison (HANDBOOK §1, entrée Sprint 21). L'écart est structurel, pas
doctrinal.

### ADR-002 — noyau universel / plugin juridictionnel

**Verdict : non tenu.** Voir anti-pattern n°9. Aucune notion de juridiction n'existe.

### ADR-003 — le rattachement adresse → zones est le chantier n°1

**Verdict : acquis pour l'essentiel, deux manques précis.**

| Règle ADR-003 | Verdict |
| --- | --- |
| Un site est rattaché à **plusieurs** zones (SUP, SOU, AEP) | **acquis** — VigiEau répond les trois au point, `ZonesResponse.zones` (`lib/types.ts:51-57`) |
| La géométrie plutôt que le code INSEE seul | **acquis** — la requête part en `lon`/`lat` (`lib/vigieau.ts:18-21`), et le cas « commune multi-zones » (HTTP 409) est traité explicitement (`lib/vigieau.ts:32-42`) |
| **Ne jamais prendre le maximum des niveaux** | **violé** — voir anti-pattern n°1 |
| Restituer le vecteur par ressource + un niveau effectif pondéré par la part volumique | **manquant** — le vecteur est affiché, la pondération volumique n'existe pas |
| Imprécision de géocodage jamais silencieuse, état `rattachement_ambigu` | **partiel** — `GeocodeResult.score` existe (`lib/types.ts:17`) et le 409 est remonté, mais il n'y a pas d'état d'ambiguïté avec liste des zones candidates |

### ADR-004 — le classement vaut mieux que les valeurs absolues

**Verdict : le classement existe, l'étiquetage de confiance par sortie n'existe pas.**

Le classement de portefeuille est livré (`computePortfolio`, `lib/portefeuille.ts:328`) et il y a un
indicateur de confiance — mais il porte sur le **score composite**, pas sur chaque sortie, et il
mesure autre chose : couverture des composantes, distance de station, fraîcheur
(`scoreConfidence`, `lib/score.ts:239-266`). La grille de la note (classement = haute, magnitude =
moyenne, euros = basse) n'est nulle part.

⚠️ Le dépôt fait tout de même mieux que la note ne l'exige sur un point : une composante dont la
source est **injoignable** est nommée dans le texte de confiance au lieu d'être comptée zéro
(`indisponibles`, `lib/score.ts:244-266`) — la règle « service injoignable ≠ station muette » du
Sprint 32.

### ADR-005 — κ = 1, hypothèse prudentielle documentée

**Verdict : tenu en fait, pas en forme.** Aucun taux de conformité n'est appliqué nulle part, donc
κ = 1 est la pratique. Mais le mot n'apparaît pas, l'hypothèse n'est **jamais nommée comme
prudentielle**, et rien dans l'interface ne dit au lecteur que le chiffre suppose une conformité
parfaite. C'est un écart de restitution, et il est bon marché à combler.

### ADR-006 — auditabilité comme fonctionnalité de premier rang

**Verdict : partiel, avec une bonne base et trois trous.**

Acquis : chaque sortie porte un `detail` expliquant d'où vient le nombre (`RestrictionSeverity.detail`,
`Horizon.detail`), le registre de méthodologie typé garantit qu'aucun panneau ne pointe vers une
ancre morte (`lib/methodologie.ts`, 26 sections, avec un test qui casse le build à la première
divergence), et les rapports ESG portent une section « Sources & limites » (`lib/report.ts:320-331`).

Manquants, tous les trois cités nommément par l'ADR :

1. **Traçabilité jusqu'au PDF d'arrêté source avec son identifiant.** `VigieauArrete.cheminFichier`
   existe (`lib/types.ts:22-28`) et est affiché pour l'arrêté **courant**, mais les mesures
   embarquées (`data/restrictions/`) ne portent pas l'identifiant du document dont elles sortent :
   remonter d'un chiffre d'exposition à son arrêté est impossible.
2. **Versionnement gelé et daté du modèle.** Il n'existe aucune constante de version. Un rapport
   produit aujourd'hui n'est pas reproductible à l'identique dans deux ans — le badge « Démo —
   Sprint N » de `Shell.tsx` n'est pas un versionnement de modèle.
3. **Journal d'hypothèses par calcul et note méthodologique jointe aux exports.** Les hypothèses
   sont dans le code et sur `/methodologie` ; elles ne sont pas **capturées au moment du calcul** ni
   attachées à l'export.

---

## C. Audit des dix anti-patterns

La section la plus utile du document : la note interdit dix choses, en voici lesquelles le code fait.

| # | Anti-pattern | Verdict | Preuve |
| --- | --- | --- | --- |
| 1 | Prendre le **maximum des niveaux** entre SUP/SOU/AEP | **commis** | `maxGravite` appliqué à toutes les zones : `components/HomeClient.tsx:513` et `:603`, `components/SitesDashboard.tsx:213` et `:222`, `app/api/carte/etat/route.ts:85` |
| 2 | **Imputer une valeur ponctuelle** à une mesure non quantifiée | **évité par prudence, pas résolu** | `RestrictionSeverity.coefficient` est `undefined` quand le texte est illisible, et l'usage **sort de la moyenne** (`lib/restrictions.ts:199-203`), avec un compteur `unread` remonté à l'interface |
| 3 | **Agréger** VNP de crise et VNP structurel | **sans objet** | aucun VNP calculé |
| 4 | Publier une **moyenne d'ensemble** sur les projections | **évité** | Explore2 est consommé en q05/médiane/q95 sur toute la chaîne (`lib/projections.ts`, `components/Projection2050.tsx`) |
| 5 | **Brancher le moteur sur le secteur** au lieu du profil d'usages | **partiellement commis** | tables sectorielles dans la couche de calcul : `lib/secteur.ts` (6 secteurs × 4 niveaux), `lib/arbitrage.ts`, `lib/ressource.ts`. ⚠️ Voir la nuance ADR-001 : la sélection des usages, elle, vient des drapeaux VigiEau |
| 6 | **Valider sur le niveau d'alerte** et en déduire que le VNP est validé | **commis par omission** | aucun backtest sur métrique finale n'existe. Les validations réelles documentées (HANDBOOK §1) portent sur des **valeurs d'entrée** — nombre d'arrêtés parsés, jours par niveau, stations trouvées — jamais sur une sortie de bout en bout |
| 7 | Ajouter l'**auditabilité après coup** | **partiellement commis** | cf. ADR-006 : la traçabilité mesure → arrêté source manque, et elle est la plus chère à ajouter tard |
| 8 | **Interpoler les lacunes d'archive** | **évité, et documenté avec soin** | `premiereAnnee` **expose** l'ambiguïté « zone calme ou zone inexistante » au lieu de la résoudre (`lib/history.ts:74-91`), et les dates corrompues sont écartées, pas bornées |
| 9 | **Coder en dur la nomenclature à quatre niveaux** | **commis** | `NiveauGravite` (`lib/types.ts:8`) et `GRAVITE` (`lib/gravite.ts:14-43`) — **18 fichiers** référencent le type, **17** la table (mesuré par `grep -rl`) |
| 10 | **Estimer une perte financière** sans marge fournie par le client | **partiellement commis** | `REVENUE_SHARE_PER_DAY = 0.005` (`lib/portefeuille.ts:64`) convertit un chiffre d'affaires en perte journalière — un ordre de grandeur Swiss Re, **pas** une marge du client. Utilisé en repli quand `coutJourEuros` est absent (`lib/portefeuille.ts:365`) |

### C.1 Les deux verdicts qui demandent une lecture attentive

**n°1 — le correctif existe déjà, il n'est pas généralisé.** `levelForOrigin`
(`lib/vigieau.ts:100-112`) a été écrit au Sprint 21 **pour corriger précisément ce biais**, avec un
commentaire qui énonce la règle de la note presque mot pour mot (« a site on the mains would inherit
the gravity of an aquifer it never pumps »). Il a été délibérément gardé **à côté** de `worstLevel`
pour ne pas déplacer le score composite ni le dashboard. Résultat : `worstLevel` n'est plus appelé que
depuis son propre fichier, mais `maxGravite` — la même opération, dans `lib/gravite.ts` — irrigue
toujours la fiche site, le dashboard et la carte. **Le chantier n'est pas d'inventer la solution,
c'est de finir la migration** ; et la note ajoute ce que le Sprint 21 n'avait pas : la pondération
par les parts volumiques plutôt que le choix d'une ressource unique.

**n°10 — le repli est labellisé, ce qui ne le rend pas conforme.** Le coefficient est documenté,
sourcé, et l'interface dit `eurosSource: "repli_ca"`. C'est bien mieux qu'un chiffre nu, et le
commentaire du code défend le choix (« un ordre de grandeur générique, étiqueté comme tel, est plus
utile en comité qu'une cellule vide »). La note, elle, est catégorique : la conversion en euros
utilise une marge **fournie par le client**, jamais estimée par l'outil. **Arbitrage à porter à
l'utilisateur**, pas à trancher ici — c'est une divergence de doctrine, pas un bug.

---

## D. Modèle de données (§2) face à l'existant

| Entité de la note | État |
| --- | --- |
| `Jurisdiction` | **absente** |
| `Zone` (avec `valid_from`/`valid_to`, géométrie versionnée) | **partielle** — les zones existent via VigiEau et Sandre, les géométries sont servies (PMTiles, `/api/pmtiles`), mais **non versionnées** : le zonage évolue et rien ne le date |
| `ZoneState` (série temporelle d'état) | **présente sous une autre forme** — le calendrier RLE `periodes` (`lib/history.ts:101-118`) *est* une série d'état par zone, encodée par runs |
| `SourceDocument` (url_pdf, hash, fetched_at) | **absente** — les PDF d'arrêtés sont liés à l'affichage, jamais indexés |
| `Measure` (le cœur normalisé, avec `rho_type`, `rho_value_min/max`, `raw_text`) | **partielle, et c'est le principal chantier** — `RestrictionRow` porte `raw_text` (le champ `description`, conservé intégralement) et `restrictionSeverity()` en dérive un `kind` sur 7 valeurs (`lib/restrictions.ts:22-29`) proche de la typologie ρ. **Manquent** : `rho_value_min/max` (un seul `coefficient` optionnel), `normalization_method`, `normalization_confidence` |
| `UsageReference` (nomenclature cible) | **présente** — le guide national du Guide Sécheresse est embarqué (`data/restrictions/guide.json`, `lib/restrictionsData.ts:47-51`), exactement la cible que §3.3 prescrit de ne pas réinventer |
| `Portfolio`, `Site`, `SiteUsage` | **`Site` présent et appauvri, `SiteUsage` absent** — voir tableau ci-dessous |

### D.1 `SavedSite` face à `Site` + `SiteUsage`

| Champ de la note | Dans `lib/sites.ts` |
| --- | --- |
| `address_raw`, `lat`, `lon` | ✅ `label`, `lat`, `lon` |
| `geocoding_confidence` | ⚠️ `GeocodeResult.score` existe mais n'est pas persisté sur le site |
| `zone_links[]` + statut ambigu | ❌ résolu à la volée, jamais stocké, pas d'état ambigu |
| `icpe_regime`, `icpe_rubriques[]`, `iota_rubriques[]` | ❌ absents |
| `annual_withdrawal_m3` | ✅ `volumeM3` (`lib/sites.ts:38`) |
| **`restitution_rate`** | ❌ absent — et la note le dit **obligatoire** (§4.2c : entre un refroidissement en circuit ouvert et un procédé évaporatif, le VNP change d'un ordre de grandeur) |
| `response_type` | ❌ absent — remplacé par `Dependance` (4 crans qualitatifs, `lib/sites.ts:27`), qui n'est pas une fonction de production |
| `buffer_capacity_m3` / `buffer_recharge_rate` | ⚠️ `autonomieJours` (`lib/sites.ts:40`) est un tampon exprimé en jours, pas en m³, sans recharge |
| `min_technical_threshold` | ❌ absent |
| `SiteUsage[]` (volume, milieu, profil de charge, exempté, critique) | ❌ **absent** — c'est le manque structurant : sans lui, ni ADR-001, ni le VNP, ni le niveau effectif pondéré ne sont possibles |

### D.2 La tension à nommer : la note suppose une persistance que le dépôt s'interdit

La note parle de `Portfolio` avec un `client_id`, de `SourceDocument` indexés, de `ZoneState`
historisés. Le dépôt a une **décision structurante contraire** : *local-only*, aucun compte, aucune
donnée utilisateur côté serveur, les sites en `localStorage` (HANDBOOK §1, décision du Sprint 2
renforcée le 2026-07-20).

Les deux sont réconciliables, et la ligne de partage est nette :

- **Données de référence** (`Zone`, `Measure`, `UsageReference`, `SourceDocument`, `ZoneState`) :
  elles ne sont pas propres à un client. Le dépôt sait déjà les **embarquer** — c'est le patron de
  `data/restrictions/`, `data/projections/`, `data/refdata/`, construits hors ligne par des scripts
  Actions et lus par des loaders (`lib/restrictionsData.ts`, `lib/projections.ts`). Aucun serveur
  requis.
- **Données client** (`Portfolio`, `Site`, `SiteUsage`) : restent en `localStorage`. `SiteUsage[]`
  est un tableau imbriqué dans `SavedSite`, ce que le format supporte sans difficulté.

**Aucun besoin de base de données n'est démontré par cette note.** Ce constat est important : il évite
de rouvrir un débat déjà tranché deux fois.

---

## E. Sources de données (§10) — le dépôt est en avance

Neuf des onze sources listées par la note sont **déjà intégrées, et huit sont vérifiées sur le
déploiement réel** (HANDBOOK §1, diags `prod` runs 19, 24, 25, 39, 40) :

| Source note | État |
| --- | --- |
| API VigiEau | ✅ `lib/vigieau.ts`, `/api/zones` — avec 404 « non couvert » et 409 « multi-zones » traités |
| VigiEau open data (arrêtés, Guide Sécheresse) | ✅ `lib/history.ts` (CSV maître, 9 162 arrêtés parsés en prod, couverture 2017→2026), `data/restrictions/guide.json` |
| SANDRE (zones, ZRE, bassins DCE) | ✅ `scripts/refdata/`, `lib/bassins.ts` (35 186 communes), `lib/transition.ts` (13 033 communes en ZRE) |
| API Adresse | ✅ BAN `data.geopf.fr/geocodage`, `/api/geocode` — ⚠️ l'ancien `api-adresse` que cite la note est décommissionné |
| Hydroportail | ⚠️ **non branché** — les indices standardisés sont **recalculés empiriquement** sur les chroniques Hub'Eau : `computeLowFlow` (`lib/hubeau.ts:466`, VCN10 quinquennal sec + QMNA5) |
| ADES / BRGM | ✅ via Hub'Eau piézométrie ; IPS calculé par `computeIps` (`lib/hubeau.ts:388`) |
| SIM2 / Météo-France | ✅ SWI, `lib/swi.ts` + climatologie embarquée 8 981 mailles × 12 mois |
| DRIAS-Eau (Explore2, narraTRACC) | ✅ `data/projections/` (96 shards), niveaux TRACC +2/+2,7/+4 °C, q05-q95 par commune |
| BNPE | ✅ `lib/bnpe.ts` — déjà au-delà du « chantier κ uniquement » de la note (panneau d'arbitrage usage × milieu) |
| SISPEA | ❌ **jamais instruit** — retenu à l'arbitrage du Sprint 27, toujours ouvert (HANDBOOK §5, item 3) |
| MétéEAU des nappes (BRGM) | 🔒 **bloqué, motif écrit** — API OAuth2, aucune donnée sur data.gouv ; renvoi par lien (`lib/meteeau.ts`) |

**Deux conséquences pour la roadmap.** (1) Le Chantier 1 ne demande presque aucune source nouvelle —
c'est un chantier de **modélisation**, pas d'acquisition. (2) Les covariables du modèle N2 (§5.3 :
SPI/SPEI, humidité des sols, débit et piézométrie standardisés) sont **toutes déjà disponibles**, sauf
SPI/SPEI. C'est une bonne nouvelle inattendue sur le chantier le plus lourd.

---

## F. Les quatre questions ouvertes (§11), avec ce que le dépôt sait déjà

1. **Second aléa AEP (SISPEA) en v1 ou v2 ?** Le dépôt a déjà identifié ce besoin de façon
   indépendante et l'a formulé dans les mêmes termes (« les sites en origine `aep` dépendent de *leur
   service d'eau*, pas de la nappe », HANDBOOK §5 item 3). Jamais instruit, donc **l'existence et la
   forme des données SISPEA restent à sonder** avant tout codage — la règle du dépôt (« sonder avant
   de coder ») a déjà évité deux culs-de-sac.
2. **Horizons temporels.** Le dépôt sert déjà trois horizons : *maintenant* (VigiEau live),
   *fin de saison* (climatologie + indice d'anticipation) et *2050* (Explore2). La recommandation de
   la note (les deux, avec correspondance explicite) est donc **presque gratuite** : il manque la
   table de correspondance CSRD court/moyen/long, pas les horizons.
3. **Aqueduct / WWF Water Risk Filter en couverture complémentaire.** Jamais évalué. ⚠️ À instruire
   avec le benchmark concurrentiel déjà écrit ([`IDEATION-PORTEFEUILLE.md`](./IDEATION-PORTEFEUILLE.md)).
4. **Profils de charge par défaut.** Le dépôt **subit déjà** cette question sans l'avoir posée : une
   interdiction horaire est comptée en fraction de journée (`lib/restrictions.ts:113-129`, « Interdiction
   de 8h à 20h » → 12/24 = 0,5), ce qui **suppose une charge uniforme sur 24 h** — hypothèse fausse
   pour la plupart des sites industriels, et déjà consignée comme limite assumée du Sprint 21. Le
   `load_profile` de la note est donc une correction d'un biais existant, pas une fonctionnalité neuve.

---

## G. Arbitrages — tranchés, et encore ouverts

### G.1 Tranchés par l'utilisateur le 2026-08-08

Ces trois décisions engagent les prochains sprints. Elles sont **décidées, pas implémentées** :
aucune ligne de code produit n'a bougé cette session.

| # | Décision | Ce qu'elle coûte |
| --- | --- | --- |
| **G1** | **Remplacer** `joursContraints` (Sprint 21) par **JS + IA**. `lib/interruption.ts` cède la place aux deux indicateurs de la note. | Migration de tous les consommateurs : `components/InterruptionPanel.tsx`, `components/SitesDashboard.tsx` (colonne + tuile + CSV), `lib/portefeuille.ts`, `lib/executive.ts`, `lib/report.ts` (section 6 du rapport ESG), et 3 suites de tests. **Rupture de continuité des exports** pour un client qui aurait archivé des rapports. |
| **G2** | **Fourchette partout.** L'intervalle `[0, ρ_max]` des mesures non quantifiées se propage jusqu'à la fiche site, le portefeuille, le CSV et le rapport ESG. Le titre affiche « 12 à 19 jours », jamais un point. | Les tuiles et colonnes du tableau de bord doivent accueillir deux nombres ; la forme des exports change. C'est le prix de ce que §3.2 appelle le résultat honnête. |
| **G3** | **FR seule, abstraction préparée.** La couche juridiction est introduite avec FR uniquement ; ES n'est pas écrit. | ⚠️ Écart assumé avec l'ADR-002, dont l'avertissement se recopie tel quel : *« Sans une seconde juridiction réelle, l'abstraction sera fictive et le refactoring ultérieur coûteux. »* Le coût est déplacé, pas supprimé — à relire au moment où une seconde juridiction sera demandée. |

### G.2 Encore ouverts — à arbitrer avant les chantiers concernés

1. **Les trois indicateurs remplacent-ils le score composite, ou coexistent-ils avec lui ?** (§A.2)
   La note dit « trois indicateurs de sortie, et trois seulement ». Le dépôt a un score composite
   0-100, des classes WRI/CDP et un indice d'anticipation, tous exposés et documentés. Retirer le
   score est une décision produit lourde ; le garder contredit la lettre de la note. **Bloque la
   restitution du Chantier 1**, pas son moteur.
2. **`REVENUE_SHARE_PER_DAY` : repli labellisé ou suppression ?** (anti-pattern n°10, §C.1)
3. **Hydroportail : brancher la source officielle ou garder les indices recalculés ?** (§E) Les
   indices maison sont vérifiés en réel et sans dépendance ; §5.3 nomme Hydroportail. L'argument
   d'un vérificateur tiers pèse ici plus que l'argument technique.

---

## Récapitulatif — par où commencer

Classé par **ce qui débloque le reste**, pas par difficulté :

| Rang | Chantier | Pourquoi en premier |
| --- | --- | --- |
| 1 | **Typologie ρ à intervalles** (`lib/restrictions.ts`) | Sans `rho_value_min/max`, ni le VNP ni l'IA ne peuvent porter de fourchette (G2). Le fichier existe, il est testé (29 tests calibrés sur du verbatim), et le travail est une extension de type — pas une réécriture |
| 2 | **`SiteUsage[]` + `restitution_rate`** (`lib/sites.ts`) | Sans le vecteur d'usages, l'ADR-001 reste violé, le VNP est incalculable et le niveau effectif pondéré est impossible |
| 3 | **VNP nominal, crise et structurel séparés** | Premier indicateur physique de la note, invariant au cadre réglementaire — donc le plus durable des trois |
| 4 | **IA : généraliser `joursArretNet`** (§A.1) | Le mécanisme existe déjà et il est testé ; c'est une remontée dans le noyau plus `response_type` |
| 5 | **Niveau effectif pondéré, fin de la migration `maxGravite`** | Anti-pattern n°1 ; la solution existe (`levelForOrigin`), il faut la finir et la pondérer |
| 6 | **Auditabilité : version de modèle gelée + journal d'hypothèses** | ADR-006 prévient que c'est le seul chantier dont le coût **augmente** avec le retard |
| 7 | **Couche juridiction FR** (G3) | Prépare l'ADR-002 sans écrire ES |
| 8 | **N2, N3, import par lot** | Voir [`SPRINTS.md`](./SPRINTS.md) — chacun a un verrou qui n'est pas du code |
