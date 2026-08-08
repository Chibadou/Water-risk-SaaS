# Idéation — rendre HydroVigie pertinent pour un portefeuille de sites

> Question de départ : **comment rendre cet outil le plus pertinent possible pour une entreprise
> disposant d'un portefeuille de sites, qui veut analyser l'exposition de ces sites à un risque
> d'interruption de consommation / prélèvement d'eau ?**
>
> Document de réflexion élargie, écrit le 2026-08-04 (session Sprint 26). Chaque piste porte un
> verdict — **retenue**, **backlog**, ou **écartée avec motif** — selon la convention du repo :
> une piste close est close par écrit, pas oubliée.

---

## 0. Le diagnostic, en une page

HydroVigie sait analyser **un site** en profondeur : score composite, arrêtés en vigueur, historique
sur 10 ans, indice d'anticipation, jours d'activité contrainte, projection 2050, correspondance
ESRS E3. C'est un travail sérieux, et c'est déjà plus fin que ce que font les outils mondiaux.

Le tableau de bord `/sites`, lui, ne fait qu'**empiler** ces analyses : score moyen, score max,
somme des jours contraints, répartition par département. C'est un **agrégat**, pas une analyse de
portefeuille.

La différence n'est pas cosmétique. Une entreprise multi-sites ne se demande pas « quel est mon site
le plus risqué » — elle le sait déjà, c'est celui dont le directeur d'usine appelle le plus souvent.
Elle se demande :

1. **Combien de mes sites s'arrêtent en même temps ?** Un parc de 20 sites répartis sur 18 zones
   d'alerte et un parc de 20 sites concentrés sur 3 zones donnent aujourd'hui **exactement le même
   total** de jours contraints dans l'outil. C'est faux. Dans le second cas, un seul arrêté
   préfectoral immobilise les trois quarts du parc le même jour — et c'est ce jour-là, pas la moyenne
   annuelle, qui casse la chaîne logistique et le compte de résultat.
2. **Combien ça me coûte ?** « 46 jours contraints » ne rentre dans aucun registre de risque
   d'entreprise. Des m³ non prélevables et des euros, si.
3. **Par où je commence ?** Un parc, ça se priorise. L'outil trie par score, ce qui n'est pas la même
   chose que trier par ce qu'on a intérêt à traiter en premier.

Ces trois questions structurent tout ce qui suit.

---

## 1. Ce que font les autres, et où ils s'arrêtent

Avant d'inventer, regarder ce qui existe. Le paysage se lit en trois familles.

| Modèle | Ce qu'il apporte | Où il s'arrête pour un parc de sites français |
|---|---|---|
| **WRI Aqueduct 4.0** | Screening mondial gratuit, ratio prélèvements/ressource, maille HydroBASINS niveau 6 | Maille bassin grossière ; **le WRI reconnaît lui-même la faible pertinence au niveau local**. Aucun lien avec la réglementation applicable |
| **WWF Water Risk Filter** | 32 indicateurs de bassin + risque opérationnel, HydroBASINS niv. 7 (12 en national), explicitement conçu **pour le portefeuille et l'investisseur** | Outil de *screening et de priorisation*, revendiqué comme tel. Pas de jour d'arrêté réel, pas de mesure de simultanéité entre sites |
| **Ecolab / Trucost / Microsoft — Water Risk Monetizer** | Le précédent de la monétisation : *risk-adjusted cost of water*, **revenue at risk** par installation, profil de risque d'entreprise | La prime de risque est **modélisée** depuis le stress hydrique global et la croissance projetée, pas mesurée sur la contrainte réellement prescrite |
| **SBTN Freshwater (V2 attendue S2 2026) · CDP Water Security · ESRS E3** | Cadres de **cible** et de **publication**, alignement croissant entre eux | Ce ne sont pas des concurrents : ils **exigent** une donnée site × bassin que l'outil produit déjà. C'est le débouché |
| **Waterplan** | SaaS portefeuille + quantification financière + imagerie satellite, levée de 18,5 M$ | Généraliste mondial : ne lit pas les arrêtés préfectoraux français, ne connaît ni la ZAS, ni le décret 2021-795, ni le Plan Eau |
| **HydroClimat** (France) | Simulation hydrologique de vulnérabilité de sites industriels | Prospective / bureau d'études, facturé à l'étude, peu temps réel |
| **Littérature *drought synchronicity* / *spatially compound droughts*** | Nomme et mesure la **dépendance spatiale** des sécheresses ; montre que les impacts systémiques concurrents dépassent la somme des impacts locaux | Recherche en maille grille sur des régions ou des bassins. **Jamais appliquée à un parc de sites d'entreprise** |
| **Swiss Re — interruption d'activité** | Ordre de grandeur documenté : **un jour d'interruption ≈ 0,5 % du chiffre d'affaires annuel** ; propagation dans les chaînes d'approvisionnement | Générique tous périls ; sert de repli chiffré, pas de mesure |

**Le constat le plus important de ce tableau** est la ligne « drought synchronicity ». La littérature
récente (Nguyen et al. 2026, *Water Resources Research* ; travaux sur les sécheresses spatialement
composées) dit explicitement que les évaluations de risque **supposent l'indépendance des événements
entre localisations**, et que cette hypothèse fausse les estimations. C'est exactement le défaut du
tableau de bord actuel — et exactement ce que les données déjà parsées par `lib/history.ts`
permettent de corriger, sans nouvelle source.

### La niche défendable

Ce n'est **ni la maille** (Aqueduct et le WWF font du screening assumé, et le WWF le fait bien),
**ni la monétisation** (Ecolab l'a publiée dès 2015).

C'est **la simultanéité mesurée sur des arrêtés réellement publiés, à la maille de la zone d'alerte
française** — puis traduite en volumes et en euros avec les chiffres de l'entreprise. Personne ne
le fait, parce que ça suppose d'avoir d'abord fait le travail ingrat : parser dix ans d'arrêtés
préfectoraux, lire la sévérité dans la prose des mesures, rattacher les zones aux communes. Ce
travail est fait.

---

## 2. Les huit axes

### A. Faire entrer le portefeuille — **le blocage n°1**

Aujourd'hui, les sites s'ajoutent **un par un**, par recherche d'adresse. Une entreprise de 80 sites
ne peut pas utiliser l'outil. L'import JSON existant ne réimporte que des sites **déjà géocodés par
l'outil lui-même** : c'est une sauvegarde, pas une porte d'entrée.

- **A1 — Import CSV / Excel + géocodage en masse.** La BAN expose un endpoint batch
  (`data.geopf.fr/geocodage/search/csv/`, POST d'un CSV), 50 req/s par IP. Colonnes attendues :
  nom, adresse, et en option secteur, origine de l'eau, dépendance, volume, €/jour. Rapport de
  géocodage avec le score de confiance BAN par ligne, et reprise manuelle des adresses ambiguës —
  un géocodage silencieusement faux est pire qu'un géocodage manquant. → **backlog, priorité n°1
  du Sprint 27.**
- **A2 — Champs métier par site.** Volume annuel prélevé (m³), autonomie de stockage (jours),
  existence d'une ressource de secours (2e forage, camion-citerne, retenue, recyclage), €/jour
  d'activité contrainte ou CA du site, effectif. **Tout est déclaré par l'entreprise, rien n'est
  inventé.** → **retenu Sprint 26** pour les quatre champs qui alimentent les m³/€.
- **A3 — Segments et tags.** BU, région, ligne de produit, criticité chaîne. Filtrage et agrégation
  du tableau de bord par segment. Un groupe multi-métiers n'a pas un portefeuille, il en a cinq.
  → backlog.
- **A4 — Sites tiers.** Fournisseurs critiques, sous-traitants, plateformes logistiques : même
  fiche, tag « amont ». L'interruption d'un fournisseur eau-intensif (traitement de surface,
  teinture, agroalimentaire, blanchisserie industrielle) arrête l'usine aval aussi sûrement qu'une
  restriction sur site. Swiss Re documente précisément cette propagation. **C'est probablement la
  plus grosse valeur latente de l'outil**, parce que c'est le risque que personne ne cartographie.
  → backlog, à instruire tôt.
- **A5 — Suppression du besoin de saisie : import depuis un référentiel existant.** SIRET → adresse
  via la base Sirene (open data). Une entreprise donne sa liste de SIRET, l'outil géocode. → backlog,
  dépend de A1.

### B. Des jours vers la décision — **retenu**

- **B1 — m³ à risque.** Le HANDBOOK documente : « pondérer l'exposition par les volumes : **bloqué**,
  VigiEau ne publie aucun volume par usage ». C'est **vrai de la source publique et faux du
  problème** : l'entreprise connaît ses propres volumes. Il suffit de les lui demander. La limite
  n°1 du modèle n'était pas une impasse de donnée, c'était une erreur sur le détenteur de la donnée.
  → **retenu.**
- **B2 — € à risque.** `€/jour × jours contraints`, avec repli sur l'ordre de grandeur Swiss Re
  (0,5 % du CA annuel par jour d'interruption) **explicitement étiqueté comme un repli générique**.
  Un chiffre d'ordre de grandeur, assumé comme tel, vaut mieux qu'une case vide dans un comité de
  direction — à condition de dire que c'en est un. → **retenu.**
- **B3 — Jours de gêne vs jours d'arrêt net.** Un stock tampon de 3 jours absorbe une restriction de
  2 jours. Aucun modèle en jours agrégés ne peut le voir : il faut la **durée des épisodes**, donc
  les périodes. → **retenu** (rendu possible par le chantier RLE, cf. §3).
- **B4 — Masque d'usages déclaré.** L'exposition actuelle est la **moyenne** sur les usages dont le
  drapeau `concerne_entreprise` est vrai. Une entreprise pourrait cocher les usages qui la concernent
  réellement parmi les 20 de la matrice nationale (l'arrosage d'espaces verts et le lavage de
  véhicules ne pèsent pas pareil pour une fonderie). Honnête : les mesures restent lues dans les
  arrêtés, seule la **pertinence** est déclarée. → backlog, forte valeur, coût moyen.
- **B5 — Coût de la substitution.** Camion-citerne, achat d'eau industrielle, recyclage : coût au m³
  de la continuité, à comparer au coût de l'arrêt. → backlog, dépend de B1/B2.

### C. Corrélation entre sites — **retenu, le cœur du sprint**

- **C1 — Simultanéité mesurée.** Rejouer les 10 ans d'arrêtés sur les zones du parc et compter, jour
  par jour, combien de sites étaient simultanément contraints. Sortie : pic historique daté,
  distribution « k sites simultanés × nombre de jours », pic par année. **Techniquement quasi
  gratuit** : `lib/history.ts` construit déjà une map jour → niveau par zone, et la jette après
  agrégation. → **retenu.**
- **C2 — Indice de concentration.** HHI sur les zones d'alerte, les bassins DCE et les départements,
  restitué sous sa forme lisible : le **nombre effectif de zones indépendantes** (`1/HHI`).
  « Vos 40 sites se comportent comme 4,2 zones indépendantes » se comprend sans connaître le
  Herfindahl. → **retenu.**
- **C3 — Stress test historique rejoué.** « En 2022, votre parc aurait cumulé X jours contraints,
  avec un pic de N sites simultanés du 12 au 28 août. » Rejoué, pas simulé : c'est ce qui le rend
  opposable. → **retenu.**
- **C4 — Grappes co-exposées.** Les groupes de sites partageant une zone, un bassin ou un aquifère :
  un seul arrêté les arrête tous. La sortie la plus directement actionnable pour un plan de
  continuité. → **retenu.**
- **C5 — Sites diversifiants vs aggravants.** Part des jours contraints d'un site qui tombe **en même
  temps** que ceux du reste du parc. Un site jamais contraint avec les autres est un actif de
  résilience ; un site toujours contraint avec les autres concentre le risque. Change les décisions
  d'implantation. → **retenu.**
- **C6 — Corrélation prospective.** La même analyse à l'horizon 2050 : la concentration s'aggrave-t-elle
  ? Suppose de projeter les zones et pas seulement les sites. → backlog, réel chantier.
- **C7 — Copules / valeurs extrêmes.** La littérature modélise la dépendance spatiale par copules
  non stationnaires. → **écarté pour l'instant, avec motif** : on dispose de **10 ans d'observation
  directe** sur les zones exactes du parc. Rejouer l'observé est plus juste, plus explicable et plus
  opposable qu'ajuster une copule sur un échantillon court. La copule deviendrait utile pour
  extrapoler au-delà de l'observé — donc pour C6, pas pour C1.

### D. Prioriser l'action — backlog

- **D1 — Pareto.** X % des sites portent Y % des jours (ou des m³) contraints. Où investir.
- **D2 — Ranking coût-bénéfice croisé avec les aides.** `lib/bassins.ts` résout déjà l'agence de
  l'eau de chaque site, et chaque agence publie son programme d'aides à la sobriété. « Site X :
  45 j/an contraints, bassin Adour-Garonne, aide agence sur les projets de réutilisation » est une
  phrase qui déclenche un dossier.
- **D3 — Déclinaison du Plan Eau −10 % par site.** Objectif national 2030, réparti au prorata des
  volumes déclarés → écart à combler, site par site. `lib/transition.ts` porte déjà le Plan Eau.
- **D4 — Plan de continuité pré-rempli.** Checklist par niveau de gravité, alimentée par les mesures
  **réellement prescrites** dans la zone du site + la hiérarchie du décret 2021-795 déjà implémentée
  dans `lib/arbitrage.ts`. Le passage du diagnostic à la procédure.

### E. Veille sans login — backlog, mais **c'est la sortie d'un blocage vieux du Sprint 8**

Les alertes email sont parkées depuis le Sprint 8 parce qu'elles exigent un serveur d'identité et un
stockage d'abonnements, en contradiction avec la décision structurante *local-only*. Trois
contournements ne demandent **aucun compte ni aucun stockage serveur** :

- **E1 — Flux d'abonnement par URL.** Route `/api/feed?zones=…` en RSS/Atom ou ICS. L'entreprise
  colle l'URL dans Outlook, Teams, Slack ou son outil de veille. Le serveur ne stocke rien : tout
  l'état est dans l'URL, exactement comme le lien de partage du Sprint 14. **C'est la meilleure
  idée de cette section** : elle donne la notification sans rien renier de l'architecture.
- **E2 — Digest de changement.** Diff local entre le dernier statut connu (localStorage) et le statut
  courant : « depuis votre dernière visite, 3 sites ont changé de niveau ». Coût quasi nul.
- **E3 — Webhook sortant côté client.** L'utilisateur colle une URL de webhook Teams/Slack dans ses
  réglages locaux ; la page poste le changement au chargement. Toujours zéro serveur.
- **E4 — Notifications PWA locales.** Le service worker existe déjà. Support de la *Periodic
  Background Sync* inégal selon les navigateurs → à considérer comme un bonus, jamais comme le
  canal principal.

### F. Restituer et prouver — backlog

- **F1 — Registre de risque exportable**, structuré pour l'intégration dans un ERM d'entreprise.
- **F2 — Fiche 1 page « directeur d'usine »**, distincte du rapport ESG. Deux audiences, deux
  documents : le directeur RSE veut la correspondance ESRS, le directeur d'usine veut savoir quoi
  faire mardi.
- **F3 — Gel de snapshot daté.** Figer l'état du portefeuille à une date, avec empreinte, pour la
  piste d'audit CSRD. Un rapport non reproductible est un rapport contestable.
- **F4 — Section corrélation dans le rapport ESG.** → **retenu Sprint 26** (l'executive summary
  alimente les deux).

### G. Élargir la cause d'interruption

L'arrêté préfectoral n'est qu'**une** des causes d'interruption. Un portefeuille industriel en subit
d'autres, et l'outil n'en couvre aucune :

- **G1 — Fiabilité du service d'eau potable (SISPEA).** Les sites en origine `aep` — probablement
  majoritaires dans un parc tertiaire ou d'industrie légère — dépendent de **leur service d'eau**,
  pas directement de la nappe. SISPEA publie en open data les indicateurs de performance par
  service : rendement de réseau, indice linéaire de pertes, taux d'interruptions non programmées.
  **Angle mort réel, source ouverte, jamais exploitée par l'outil.** → backlog, **candidat n°2 après
  l'import de masse.**
- **G2 — Autorisations et volumes prélevables.** En ZRE, le risque n'est pas seulement l'arrêté
  saisonnier : c'est le plafonnement ou le non-renouvellement de l'autorisation de prélèvement, et
  la répartition par organisme unique de gestion collective. Le statut ZRE est déjà résolu
  (`/api/transition`) — il reste à en tirer la conséquence opérationnelle. → backlog.
- **G3 — Pointe touristique estivale.** Sur les communes littorales et de montagne, la population
  desservie double en août — précisément quand l'étiage mord. Un site industriel y devient
  politiquement visible dans l'arbitrage des usages. Données de population saisonnière disponibles
  (INSEE). → backlog.
- **G4 — Concurrence d'usage locale.** BNPE est déjà intégré (panneau d'arbitrage). L'élargissement
  utile : la **part du prélèvement du site dans le total de sa commune**. Un site qui pèse 40 % des
  prélèvements communaux est le premier regardé en crise. → backlog, faible coût, `lib/bnpe.ts`
  porte déjà les volumes.
- **G5 — Qualité de l'eau. → écarté, avec motif :** le périmètre produit est **la quantité**, posé
  dès `PLAN.md`. Une interruption pour cause de qualité (pollution, turbidité, températures) est un
  autre produit, avec d'autres sources. L'ouvrir à moitié ferait perdre la clarté du positionnement.

### H. Crédibilité — condition d'adoption en entreprise

- **H1 — Confiance agrégée au parc.** L'indicateur de confiance existe par site ; « 12 de vos 80
  sites sont en confiance faible, voici pourquoi » manque. → **partiellement retenu** (l'executive
  summary dit ce qu'il ne sait pas).
- **H2 — Traçabilité de chaque chiffre** vers son arrêté, son fichier source et sa date de tirage.
- **H3 — Backtest publié.** « Sur 2022, le modèle annonçait X, les arrêtés ont donné Y. » Rien ne
  crédibilise un modèle comme la publication de ses écarts.

---

## 3. Ce que le Sprint 26 retient, et pourquoi ces trois-là

**Corrélation (C1-C5) + m³/€ (B1-B3) + executive summary.**

Trois raisons de les prendre ensemble plutôt que séparément :

1. **Ils se déverrouillent mutuellement.** La corrélation exige d'exposer les **périodes** de
   restriction (compressées en RLE depuis la map jour → niveau déjà construite par `lib/history.ts`).
   Or ces mêmes périodes sont la seule façon de calculer les **jours d'arrêt nets d'autonomie**
   (B3) : un tampon de stockage s'apprécie contre la durée d'un épisode, jamais contre un total
   annuel. Un seul chantier de donnée, deux fonctionnalités.
2. **Ils changent la nature du produit sans nouvelle source externe.** Aucun appel réseau
   supplémentaire, aucune donnée à embarquer : de la donnée déjà parsée, aujourd'hui jetée après
   agrégation. Le meilleur rapport valeur/risque du backlog.
3. **L'executive summary est la condition pour que le reste serve.** Un tableau de bord qui empile
   sept blocs analytiques ne se lit pas en comité. Une synthèse en tête de page — la situation, le
   coût, la concentration, la trajectoire, où agir, **et ce qu'on ne sait pas** — transforme un
   outil d'analyste en support de décision.

Ce que le sprint **ne** fait **pas**, écrit ici pour ne pas glisser : l'import de masse (A1), le flux
RSS/ICS (E1), SISPEA (G1). Ce sont les trois candidats du Sprint 27, dans cet ordre — et l'ordre
compte : **sans import de masse, la corrélation ne se calcule que sur les portefeuilles qu'on a eu
la patience de saisir à la main.**

---

## Sources

- WWF Water Risk Filter — [méthodologie (PDF)](https://cdn.kettufy.io/prod-fra-1.kettufy.io/documents/riskfilter.org/WaterRiskFilter_Methodology.pdf) · [outil](https://riskfilter.org/water/home)
- WRI — [Aqueduct](https://www.wri.org/aqueduct) · [Conflicting reporting systems may hinder companies' water risk strategies](https://www.wri.org/insights/conflicting-reporting-systems-may-hinder-companies-water-risk-strategies)
- Ecolab / Trucost / Microsoft — [Water Risk Monetizer (CEO Water Mandate)](https://ceowatermandate.org/resources/water-risk-monetizer-2017/)
- SBTN — [Freshwater targets](https://sciencebasedtargetsnetwork.org/companies/take-action/set-targets/freshwater-targets/) · [Freshwater V2, consultation publique](https://sciencebasedtargetsnetwork.org/companies/take-action/set-targets/freshwater-targets/freshwater-v2-public-consultation/)
- CDP — [Corporate water stewardship and science-based targets for freshwater](https://www.cdp.net/en/insights/corporate-water-stewardship-and-science-based-targets-for-freshwater)
- [Waterplan — plateforme](https://www.waterplan.com/platform/overview)
- Nguyen et al., 2026 — [Characterizing Patterns of Drought Synchronicity in the Contiguous United States, *Water Resources Research*](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2025WR041240)
- [Amplified risk of spatially compounding droughts during co-occurrences of modes of natural ocean variability, *npj Climate and Atmospheric Science*](https://www.nature.com/articles/s41612-021-00161-2)
- [Spatially synchronized structures of global hydroclimatic extremes, *Nature Water*](https://www.nature.com/articles/s44221-025-00520-w)
- [A framework for analyzing spatial hydrological drought dependence based on extreme value theory and nonstationary copulas, *Journal of Hydrology*](https://www.sciencedirect.com/science/article/abs/pii/S002216942601173X)
- Swiss Re Institute — [Quantifying business interruption: risk propagation in complex supply chains](https://www.swissre.com/institute/research/topics-and-risk-dialogues/economy-and-insurance-outlook/complex-supply-chains.html)
