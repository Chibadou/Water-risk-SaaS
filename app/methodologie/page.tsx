import type { Metadata } from "next";
import Shell from "@/components/Shell";
import {
  METHODO_SECTIONS,
  methodoTitre,
  type MethodoId,
} from "@/lib/methodologie";

export const metadata: Metadata = {
  title: "Méthodologie — HydroVigie",
  description:
    "Sources de données, sélection des stations de mesure, représentativité et calcul du score de risque.",
};

// The heading text comes from the registry, not from the call site: a section
// cannot exist here without an id, and cannot be renamed in one place only.
function Section({ id, children }: { id: MethodoId; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-6">
      <h2 className="text-xl font-semibold text-ink">{methodoTitre(id)}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

export default function MethodologiePage() {
  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Méthodologie</h1>
      <p className="mt-2 max-w-3xl text-ink-muted">
        Ce que l&apos;outil mesure, d&apos;où viennent les données, et les limites à connaître pour
        interpréter correctement ce qui est affiché.
      </p>

      {/* 26 sections and no map: the page had neither anchors nor a summary, so
          every panel in the product linked to its top. */}
      <nav
        aria-label="Sommaire de la méthodologie"
        className="mt-6 rounded-xl border border-line bg-canvas p-4"
      >
        <p className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">
          Sur cette page — {METHODO_SECTIONS.length} sections
        </p>
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {METHODO_SECTIONS.map((sec) => (
            <li key={sec.id}>
              <a
                href={`#${sec.id}`}
                className="text-sm text-ink-muted underline-offset-2 hover:text-brand-ink hover:underline"
              >
                {sec.titre}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="max-w-3xl">
        <Section id="signaux">
          <p>
            <strong>Le signal réglementaire (VigiEau).</strong> En période de sécheresse, les
            préfets placent des « zones d&apos;alerte » en vigilance, alerte, alerte renforcée ou
            crise, par arrêté. Chaque niveau déclenche des restrictions d&apos;usage de l&apos;eau,
            différentes selon que la zone concerne les eaux superficielles (SUP), les eaux
            souterraines (SOU) ou l&apos;eau potable (AEP). C&apos;est ce que vous <em>devez</em>{" "}
            faire aujourd&apos;hui.
          </p>
          <p>
            <strong>Le signal physique (Hub&apos;Eau).</strong> Les stations publiques de mesure —
            stations hydrométriques sur les cours d&apos;eau, piézomètres dans les nappes — donnent
            l&apos;état réel de la ressource près de votre site. Les niveaux physiques se dégradent
            généralement <em>avant</em> le renforcement des arrêtés : un débit d&apos;étiage ou une
            nappe qui baisse est un signal d&apos;alerte précoce pour anticiper les prochaines
            restrictions.
          </p>
        </Section>

        <Section id="sources">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>VigiEau</strong> (Ministère de la Transition écologique) : zones d&apos;alerte
              et restrictions en vigueur, mise à jour quotidienne (situation de la veille, j-1).
            </li>
            <li>
              <strong>Base Adresse Nationale</strong> (Géoplateforme IGN) : géocodage des adresses,
              mise à jour deux fois par semaine.
            </li>
            <li>
              <strong>Hub&apos;Eau — Hydrométrie</strong> (Eaufrance) : débits moyens journaliers
              (QmnJ) et hauteurs d&apos;eau temps réel des stations du réseau national.
            </li>
            <li>
              <strong>Hub&apos;Eau — Piézométrie</strong> (BRGM/OFB, base ADES) : niveaux des nappes
              (cote NGF ou profondeur), intégration quotidienne.
            </li>
          </ul>
          <p>Toutes ces données sont ouvertes (Licence Ouverte 2.0) et consultées à la demande.</p>
        </Section>

        <Section id="choix-station">
          <p>
            Nous recherchons les stations dans un rayon de <strong>60 km</strong> autour du site
            (jusqu&apos;à 8 candidates, triées par distance) et vérifions pour chacune la présence de
            données récentes. Par défaut, la station <strong>la plus proche disposant de données
            exploitables</strong> est affichée ; la liste complète reste consultable — y compris les
            stations sans donnée récente, pour que le choix soit transparent — et{" "}
            <strong>vous pouvez choisir vous-même la station</strong> si vous connaissez le terrain.
            Votre choix est mémorisé dans votre navigateur, site par site.
          </p>
          <p>
            <strong>Repli « hauteur d&apos;eau »</strong> : quand aucune station proche ne publie de
            débit, nous affichons la hauteur d&apos;eau temps réel, étiquetée « signal secondaire » :
            sa tendance est informative, mais sa valeur absolue n&apos;est pas comparable d&apos;une
            station à l&apos;autre.
          </p>
          <p>
            <strong>Limite assumée</strong> : la sélection est aujourd&apos;hui{" "}
            <em>géographique</em> (distance), pas <em>hydrologique</em>. Une station à 15 km sur le
            bon sous-bassin ou le bon aquifère est plus représentative qu&apos;une station à 2 km sur
            une autre ressource. Le rattachement par sous-bassin et par aquifère (référentiels
            Sandre / BDLISA) est prévu dans une prochaine version ; d&apos;ici là,
            l&apos;indicateur de représentativité reflète uniquement la distance :{" "}
            <strong>bonne</strong> ≤ 10 km, <strong>moyenne</strong> ≤ 20 km,{" "}
            <strong>faible</strong> au-delà.
          </p>
        </Section>

        <Section id="tendance">
          <p>
            La tendance « ressource en hausse / stable / en baisse » compare la moyenne des 7
            derniers jours à celle des 7 jours précédents, rapportée à l&apos;amplitude observée sur
            la fenêtre de 35 jours (zone neutre de ±10 %). Pour les profondeurs de nappe, le sens est
            inversé : une profondeur qui augmente signifie une ressource en baisse.
          </p>
        </Section>

        <Section id="classification">
          <p>
            Le score 0-100 est traduit en <strong>six classes de risque nommées</strong>, alignées
            sur la terminologie des référentiels internationaux (WRI Aqueduct, CDP Water Security) :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Négligeable</strong> (0-14) : pas de tension identifiée.</li>
            <li><strong>Faible</strong> (15-29) : premiers signaux, surveillance recommandée.</li>
            <li><strong>Modéré</strong> (30-49) : tension significative, actions préventives.</li>
            <li><strong>Élevé</strong> (50-69) : restrictions probables, plan de continuité requis.</li>
            <li><strong>Très élevé</strong> (70-84) : restrictions fortes et récurrentes.</li>
            <li><strong>Critique</strong> (85-100) : crise avérée, impact opérationnel direct.</li>
          </ul>
          <p>
            Un <strong>indicateur de confiance</strong> (haute / moyenne / faible) accompagne le
            score. Il agrège trois facteurs : la couverture des composantes (combien des cinq
            indicateurs ont pu être calculés), la proximité de la station de mesure rattachée, et
            la fraîcheur des données. Une confiance faible invite à interpréter le score avec
            prudence et à choisir manuellement une station plus représentative si possible.
          </p>
        </Section>

        <Section id="score">
          <p>
            Le score 0-100 est une moyenne pondérée de cinq composantes, renormalisée sur les
            composantes effectivement disponibles :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Statut réglementaire — 40 %.</strong> Niveau VigiEau le plus sévère parmi les
              zones couvrant le site : vigilance = 25, alerte = 50, alerte renforcée = 75, crise =
              100 (aucune restriction = 0).
            </li>
            <li>
              <strong>Fréquence structurelle des restrictions — 25 %.</strong> Nombre moyen de jours
              par an passés en « alerte » ou plus par la zone la plus touchée, calculé sur les{" "}
              <strong>années complètes des cinq dernières</strong> (arrêtés officiels data.gouv.fr,
              couvrant 2012→, agrégés quotidiennement ; l&apos;année en cours, partielle, est exclue
              de la moyenne mais affichée). Barème : 0 j/an = 0, ≤ 15 = 25, ≤ 45 = 50, ≤ 90 = 75,
              au-delà = 100. Faute d&apos;année complète, on retombe sur le cumul de l&apos;année en
              cours. L&apos;historique par année est affiché sous le score.
            </li>
            <li>
              <strong>Assecs des cours d&apos;eau (Onde) — 10 %.</strong> Réseau de ~3 200 stations
              sentinelles (OFB) où des observateurs notent visuellement l&apos;écoulement estival.
              On agrège les observations de la dernière campagne dans un rayon de 60 km : chaque
              station pèse selon son état (assec = 100, écoulement non visible = 65, faible = 30,
              visible = 0), moyenné. Réseau saisonnier (mai–septembre) : hors saison, la composante
              est simplement absente.
            </li>
            <li>
              <strong>État du débit — 12,5 %</strong> et <strong>état de la nappe — 12,5 %.</strong>{" "}
              Quand l&apos;historique de la station le permet, on calcule une <strong>situation
              standardisée</strong> par rapport à son propre passé, plutôt qu&apos;une simple
              tendance :
              <ul className="mt-1 list-[circle] space-y-1 pl-5">
                <li>
                  <strong>Nappe — indice type IPS.</strong> On situe le niveau du mois courant dans
                  la distribution des mêmes mois calendaires sur l&apos;historique du piézomètre
                  (≥ 10 ans) : un niveau dans les plus bas jamais observés pour un mois de juillet =
                  risque élevé. Classes : très basse / basse / proche des normales / haute / très
                  haute.
                </li>
                <li>
                  <strong>Débit — VCN10 / QMNA5.</strong> On calcule sur l&apos;historique de la
                  station (≥ 6 ans) son <strong>VCN10</strong> quinquennal sec (minimum du débit
                  moyen sur 10 jours, quantile 0,2 des minima annuels) et son <strong>QMNA5</strong>,
                  puis on compare le débit récent : sous le VCN10 de référence = risque élevé,
                  nettement au-dessus = risque faible.
                </li>
              </ul>
              Faute d&apos;historique suffisant, on retombe sur la simple tendance 14 jours de la
              ressource (en baisse = 75, stable = 40, en hausse = 15). Ces références sont calculées
              en interne à partir des séries Hub&apos;Eau (pas d&apos;API ouverte propre pour les
              valeurs Hydroportail publiées) ; elles reflètent la station, pas une valeur
              réglementaire officielle.
            </li>
          </ul>
          <p>
            Le rattachement des stations reste basé sur la distance, qualifié par un indicateur de
            représentativité ; pour les piézomètres, le <strong>code d&apos;aquifère (BDLISA)</strong>{" "}
            de la station est affiché afin que vous puissiez, si vous connaissez le terrain, choisir
            une station captant la même nappe que votre site. Le rattachement automatique par
            sous-bassin / aquifère du site (qui suppose d&apos;interroger le référentiel BDLISA au
            point) reste une amélioration prévue.
          </p>
          <p>
            Sur le tableau de bord « Mes sites », le score n&apos;utilise que les composantes
            réglementaire et fréquence structurelle (les signaux physiques demanderaient des appels
            supplémentaires par site) ; la fiche site affiche le score complet avec le détail par
            composante. Composante prévue ensuite : pression des prélèvements (BNPE).
          </p>
        </Section>

        <Section id="calendrier">
          <p>
            Le <strong>calendrier saisonnier</strong> montre la répartition mensuelle des
            restrictions sur les années complètes de la fenêtre de 10 ans. Chaque mois est coloré
            selon le nombre moyen de jours en alerte ou plus : les mois les plus intenses
            révèlent la période de tension récurrente du site — typiquement juillet-septembre
            dans le sud de la France, mais variable selon les bassins.
          </p>
          <p>
            La <strong>courbe d&apos;évolution du risque</strong> retrace la composante
            « fréquence des restrictions » année par année. Elle permet de détecter une tendance
            d&apos;aggravation (jours de restriction croissants) ou d&apos;amélioration, et de
            situer l&apos;année en cours dans son contexte pluriannuel.
          </p>
        </Section>

        <Section id="secteur">
          <p>
            Le <strong>secteur d&apos;activité</strong> du site est le seul paramètre à choisir à
            côté de l&apos;adresse. Il remplit deux rôles complémentaires, sans double comptage :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Il <strong>détermine le profil d&apos;usager VigiEau</strong> interrogé, donc les
              restrictions officielles applicables. VigiEau ne distingue que quatre profils
              (particulier, entreprise, collectivité, exploitation agricole) ; nos secteurs y sont
              rattachés : agriculture → exploitation, collectivité → collectivité, industrie /
              énergie / services / autre → entreprise, et <strong>particulier → particulier</strong>.
            </li>
            <li>
              Il <strong>affine l&apos;interprétation</strong> des restrictions : le panneau
              « Impact pour le secteur » décrit les conséquences opérationnelles concrètes à chaque
              niveau de gravité. Cette interprétation <strong>n&apos;entre pas dans le score</strong>{" "}
              — elle ne fait qu&apos;expliciter ce que le niveau réglementaire implique pour l&apos;activité.
            </li>
          </ul>
          <p>
            Six secteurs professionnels sont proposés : <strong>agriculture</strong> (irrigation,
            élevage), <strong>industrie</strong> (process, ICPE), <strong>énergie</strong>{" "}
            (refroidissement, centrales), <strong>services / tertiaire</strong>,{" "}
            <strong>collectivité</strong> (gestion AEP, espaces publics) et <strong>autre</strong>.
            Les descriptions s&apos;appuient sur les mesures types des arrêtés cadre départementaux
            et sur la doctrine nationale sécheresse (circulaire 2023). Elles sont indicatives :
            seul l&apos;arrêté préfectoral en vigueur fait foi.
          </p>
          <p>
            Le cas <strong>particulier (usage domestique)</strong> est proposé séparément, à titre
            secondaire : il applique bien les restrictions VigiEau « particulier » et affiche les
            impacts domestiques (arrosage, lavage, piscines), mais HydroVigie — avec son score de
            risque, sa logique de portefeuille et son rapport ESG — est conçu pour les{" "}
            <strong>sites professionnels</strong> ; il apporte donc moins de valeur pour un
            logement individuel.
          </p>
        </Section>

        <Section id="synthese-portefeuille">
          <p>
            Le tableau de bord « Mes sites » affiche pour chaque site un score de risque
            calculé à partir des deux composantes disponibles sans appel supplémentaire :
            le statut réglementaire VigiEau et la fréquence des restrictions. Les composantes
            physiques (débit, nappe, Onde) enrichissent le score sur la fiche détaillée de
            chaque site.
          </p>
          <p>
            Les indicateurs de synthèse (score moyen, score max, répartition par classe de
            risque) donnent une vue agrégée du portefeuille. Le score de chaque site est
            classé selon l&apos;échelle WRI/CDP (Négligeable à Critique). L&apos;export CSV
            inclut désormais le secteur et la classe de risque pour faciliter l&apos;intégration
            dans les rapports CSRD/TNFD.
          </p>
          <p>
            Le bloc <strong>« Répartition géographique »</strong> regroupe les sites par
            département (déduit du code INSEE de la commune) et affiche, pour chacun, le nombre
            de sites et le score moyen, classés du risque le plus élevé au plus faible. Cette
            vue met en évidence les zones de concentration du risque dans le portefeuille. Le
            rattachement département est purement local (référentiel embarqué, aucun appel
            réseau). Une carte choroplèthe départementale reste en backlog : elle nécessite les
            géométries départementales, non embarquées à ce jour.
          </p>
        </Section>

        <Section id="benchmark">
          <p>
            Sous les projections 2050, le bloc <strong>« Positionnement du site »</strong> situe
            la baisse d&apos;étiage estival projetée du site (médiane du VCN10 à la trajectoire de
            référence +2,7 °C) dans la <strong>distribution des {" "}
            {(34418).toLocaleString("fr-FR")} communes françaises</strong> couvertes par Explore2,
            ainsi que dans son département.
          </p>
          <p>
            Le <strong>percentile de sévérité</strong> indique la part des communes dont le déclin
            projeté est <em>moins</em> sévère : « plus sévère que 90 % des communes » signifie que
            seules 10 % des communes voient une baisse d&apos;étiage plus forte. La distribution de
            référence est pré-calculée à partir des données Explore2 embarquées (aucun appel
            réseau), par le script <code>scripts/projections/build_benchmark.py</code>. Elle porte
            sur le même indicateur et le même niveau de réchauffement que le score prospectif, pour
            une lecture cohérente.
          </p>
          <p>
            Limite : le benchmark ne compare que la <em>projection</em> d&apos;étiage, pas le score
            de risque courant. Deux communes au même percentile de projection peuvent avoir des
            situations réglementaires actuelles très différentes.
          </p>
        </Section>

        <Section id="rapport-esg">
          <p>
            Le bouton <strong>« Rapport ESG »</strong> génère un rapport structuré au format
            Markdown pour la fiche du site courant, destiné à alimenter une démarche de reporting
            de durabilité. Il rassemble, en un document daté : l&apos;identification du site, le
            score composite et sa classe de risque (échelle type WRI/CDP) avec la décomposition
            des composantes, le statut réglementaire en vigueur, l&apos;historique structurel des
            restrictions, la projection climatique 2050 et le positionnement national.
          </p>
          <p>
            Une section de correspondance rattache ces éléments aux référentiels :{" "}
            <strong>ESRS E3</strong> (identification des risques et impacts physiques liés à
            l&apos;eau), <strong>TNFD</strong> (phases Locate / Assess de la démarche LEAP) et{" "}
            <strong>CDP Water Security</strong>. Le rapport est un <em>support de contexte</em>{" "}
            sur l&apos;exposition physique au risque sécheresse — il ne constitue pas une
            déclaration de conformité, et l&apos;avertissement rappelle que seul l&apos;arrêté
            préfectoral fait foi. Le document est produit entièrement dans le navigateur (aucune
            donnée envoyée à un serveur).
          </p>
          <p>
            Depuis le tableau de bord « Mes sites », un bouton <strong>« Rapport ESG »</strong>{" "}
            génère la version <strong>portefeuille</strong> : un document unique agrégeant
            l&apos;ensemble des sites suivis — synthèse (nombre de sites, score moyen et maximum,
            répartition par classe de risque), répartition géographique par département, et un
            tableau détaillé par site. Utile pour une vue consolidée en comité ou pour une annexe
            de reporting de durabilité.
          </p>
        </Section>

        <Section id="partage-hors-ligne">
          <p>
            Le bouton <strong>« Partager »</strong> copie un lien qui encode
            entièrement l&apos;analyse (adresse, coordonnées, profil, secteur). N&apos;importe
            qui ouvrant ce lien retrouve la même fiche site — utile pour transmettre un
            instantané de risque à un collègue ou un auditeur. Aucun compte n&apos;est requis
            et aucune donnée n&apos;est stockée sur un serveur : tout tient dans l&apos;URL.
          </p>
          <p>
            L&apos;application fonctionne en <strong>mode hors-ligne</strong> (Progressive Web
            App) : après une première visite, l&apos;interface — y compris le tableau de bord
            « Mes sites », dont les données vivent dans votre navigateur — reste accessible sans
            connexion. En revanche, les données temps réel (VigiEau, Hub&apos;Eau, projections)
            nécessitent une connexion : hors-ligne, elles s&apos;affichent comme « indisponibles ».
            Nous ne présentons jamais des données de risque périmées comme si elles étaient
            actuelles.
          </p>
        </Section>

        <Section id="bnpe">
          <p>
            Le bloc « Prélèvements en eau de la commune » agrège les volumes déclarés à la{" "}
            <strong>BNPE</strong> (Banque Nationale des Prélèvements en Eau, OFB, via Hub&apos;Eau) sur
            la commune du site, par usage (agriculture, eau potable, industrie, énergie, canaux…),
            pour l&apos;année la plus récente disponible.
          </p>
          <p>
            Ce sont des données <strong>annuelles</strong> et orientées <strong>redevances</strong> :
            elles décrivent une <em>pression structurelle</em> sur la ressource, pas un état temps
            réel. Nous les affichons à titre informatif — avec l&apos;intensité par habitant et par
            km² pour situer l&apos;ordre de grandeur — mais elles{" "}
            <strong>n&apos;entrent pas dans le score de risque courant</strong>. Un volume prélevé
            n&apos;a de sens qu&apos;au regard de la ressource disponible à la même échelle (ratio
            prélèvements/ressource, type « baseline water stress » d&apos;Aqueduct). Or nous avons
            vérifié que ce ratio n&apos;est pas constructible proprement à partir des données
            ouvertes : la chronique BNPE ne distingue pas le milieu prélevé (eau de surface vs
            souterraine), la maille commune ne correspond pas au bassin de la ressource, et il
            n&apos;existe pas de dénominateur « ressource renouvelable » par sous-bassin librement
            disponible. Une intensité par surface ou par habitant existe mais mesurerait
            l&apos;exploitation du territoire, pas le stress hydrique — l&apos;intégrer au score
            serait trompeur. La composante attendra une donnée de ressource à l&apos;échelle du
            sous-bassin (BD Topage + bilans quantitatifs).
          </p>
        </Section>

        <Section id="zones-alerte">
          <p>
            Une <strong>zone d&apos;alerte sécheresse (ZAS)</strong> a deux définitions possibles :
            son <strong>périmètre « naturel »</strong> au référentiel Sandre (bassin versant ou
            entité hydrogéologique), et le <strong>périmètre réellement appliqué</strong> par
            l&apos;arrêté préfectoral, souvent ajusté (communes ajoutées ou retirées, découpage
            adapté à la gestion). Ces deux périmètres ne coïncident pas toujours.
          </p>
          <p>
            Pour un usage <strong>opérationnel</strong>, c&apos;est le périmètre appliqué qui fait
            foi. Nous utilisons donc les couches officielles <strong>VigiEau</strong> (le GeoJSON
            « zones et arrêtés en vigueur », qui porte le périmètre appliqué et le niveau en
            vigueur), et non le contour ZAS Sandre. Le référentiel Sandre reste la source canonique
            des codes de zones, mais n&apos;est pas utilisé pour déterminer si votre site est
            concerné : seul l&apos;arrêté, tel que publié par VigiEau, fait foi.
          </p>
        </Section>

        <Section id="transition">
          <p>
            Au-delà du risque <em>physique</em> (sécheresse), le bloc « Risque de transition »
            couvre le risque <em>réglementaire et politique</em> — l&apos;autre moitié d&apos;une
            analyse de risque climatique type TCFD/CSRD.
          </p>
          <p>
            Le <strong>statut ZRE</strong> (Zone de Répartition des Eaux) indique si la commune du
            site relève d&apos;un zonage où les prélèvements dépassent structurellement la
            ressource : les seuils d&apos;autorisation y sont abaissés et tout nouveau prélèvement
            est fortement encadré. L&apos;appartenance est calculée par jointure spatiale entre la
            couche ZRE nationale officielle (<strong>Sandre</strong>, référentiel eaufrance,
            <em> sa:ZRE_FXX</em>) et le point représentatif de chaque commune, pré-calculée
            hors-ligne — soit <strong>13 000+ communes</strong> classées. Couverture :{" "}
            <strong>France métropolitaine continentale</strong> (hors Corse et outre-mer, non
            couverts par cette couche).
          </p>
          <p>
            Le volet <strong>Plan Eau 2023</strong> rappelle la trajectoire nationale (−10 % de
            prélèvements d&apos;ici 2030, réutilisation des eaux usées traitées, tarification
            progressive) et la décline par secteur d&apos;activité. C&apos;est un contexte de
            trajectoire, pas une obligation spécifique au site.
          </p>
        </Section>

        <Section id="carte-departementale">
          <p>
            Sur le tableau de bord, la <strong>carte choroplèthe</strong> teinte chaque département
            selon le score de risque moyen des sites qu&apos;il contient (les départements sans site
            restent neutres). Elle offre une lecture géographique immédiate de la concentration du
            risque, en complément du tableau par département. Fond cartographique volontairement
            neutre (polygones départementaux simplifiés, sans tuiles externes) pour rester léger et
            compatible avec le mode hors-ligne.
          </p>
        </Section>

        <Section id="anticipation">
          <p>
            Entre le <em>statut actuel</em> (VigiEau) et la <em>projection 2050</em> (Explore2), le
            bloc « Anticipation des restrictions » couvre l&apos;horizon intermédiaire — les{" "}
            <strong>prochaines semaines jusqu&apos;à la fin de l&apos;étiage</strong> — dont une
            entreprise a besoin pour anticiper un passage (ou une aggravation) en restriction.
          </p>
          <p>
            <strong>Ce que l&apos;indice estime, et ce qu&apos;il n&apos;estime pas.</strong> Il ne
            prédit pas l&apos;arrêté préfectoral lui-même : celui-ci dépend des seuils de
            l&apos;<em>arrêté-cadre départemental</em> et d&apos;une part de décision du préfet, et
            la météo au-delà d&apos;environ deux semaines n&apos;est pas prévisible avec fiabilité. Il
            estime les <strong>conditions propices</strong> à une restriction — des tendances, pas
            une prévision déterministe, exactement comme le bloc 2050.
          </p>
          <p>
            La méthode combine, de façon transparente, deux volets :
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>Base saisonnière (climatologie) — l&apos;ancre</strong> : le risque mensuel
              historique de la zone (fréquence × intensité des restrictions par mois sur les années
              complètes) au pic des mois à venir. Hors saison de sécheresse, cette ancre maintient
              l&apos;indice bas quel que soit l&apos;état physique, car les arrêtés sécheresse sont
              administrativement saisonniers.
            </li>
            <li>
              <strong>État actuel de la ressource — la pression</strong> : les signaux physiques qui
              se dégradent <em>avant</em> l&apos;escalade réglementaire — indice piézométrique de la{" "}
              <strong>nappe</strong> (le plus fortement pondéré : signal le plus lent et le plus
              prédictif ; les arrêtés « eaux souterraines » sont déclenchés sur seuils piézo),{" "}
              étiage du <strong>débit</strong> (VCN10/QMNA5), <strong>assecs Onde</strong>, et le{" "}
              <strong>niveau réglementaire en vigueur</strong> (une restriction en cours a de fortes
              chances de persister). Chaque signal physique est nuancé par sa tendance 14 jours. Ce
              volet ne relève l&apos;indice que lorsque la saison est « ouverte ».
            </li>
          </ul>
          <p>
            Un <strong>facteur de trajectoire</strong> compare le cumul de jours en alerte+ de
            l&apos;année en cours au même stade avec la moyenne des années passées, et module
            l&apos;indice à la hausse (« en avance sur la normale ») ou à la baisse. Le résultat est
            restitué sur une échelle qualitative en quatre niveaux (<strong>Peu probable</strong>,{" "}
            <strong>Possible</strong>, <strong>Probable</strong>, <strong>Très probable</strong>),
            avec le détail des moteurs, un indicateur de confiance (couverture des composantes,
            proximité de la station, profondeur de l&apos;historique) et un avertissement explicite.
            Chaque composante manquante est renormalisée, jamais comptée comme nulle. La fiabilité
            est meilleure sur les zones « eaux souterraines » (nappe, à réponse lente) que sur les
            réponses rapides des eaux superficielles à un déficit de pluie court.
          </p>
          <p>
            <strong>Prévision officielle des nappes : un lien, pas une intégration.</strong> Le BRGM
            publie avec <strong>MétéEAU des nappes</strong> une prévision probabiliste du niveau des
            nappes <strong>à 6 mois</strong> sur des piézomètres de référence, comparée aux seuils
            de sécheresse. Le panneau d&apos;anticipation y renvoie par un lien direct plutôt que de
            l&apos;afficher. Raison assumée : l&apos;API qui diffuse cette prévision est{" "}
            <strong>authentifiée</strong> (OAuth2) et le produit est{" "}
            <strong>réactualisé chaque mois</strong> ; en ré-héberger une copie donnerait une donnée
            vite périmée et sortirait du cadre de rediffusion. Renvoyer à la source garantit une
            prévision toujours à jour et correctement attribuée. En conséquence, cette prévision{" "}
            <em>n&apos;entre pas</em> dans notre indice : la dimension nappe de l&apos;indice reste
            calculée sur les niveaux <strong>réellement observés</strong> (Hub&apos;Eau/ADES, données
            ouvertes). Le lien est un complément prospectif consultable, pas une composante du score.
          </p>
        </Section>

        <Section id="bdlisa">
          <p>
            Les piézomètres étaient choisis par <strong>distance seule</strong>, ce qui est
            discutable en hydrogéologie&nbsp;: un piézomètre à 15 km dans le bon aquifère est plus
            représentatif qu&apos;un piézomètre à 2 km dans un autre.
          </p>
          <p>
            Le blocage était réel&nbsp;: un point du territoire relève de{" "}
            <strong>plusieurs entités hydrogéologiques emboîtées</strong> (grands ensembles,
            systèmes aquifères, entités — 4 à 5 par point en pratique), et « l&apos;aquifère du
            site » n&apos;a donc pas de réponse unique. La solution n&apos;a pas été de trancher
            arbitrairement mais de <strong>changer la question</strong>&nbsp;: on retient
            l&apos;<em>ensemble</em> des entités qui contiennent le site, et on privilégie les
            piézomètres appartenant à <em>l&apos;une d&apos;elles</em>. Une appartenance
            ensembliste, qui n&apos;a pas besoin de choisir.
          </p>
          <p>
            L&apos;ordre reste&nbsp;: <strong>disponibilité</strong> d&apos;abord (une station
            représentative sans données récentes ne sert à rien), puis appartenance à
            l&apos;aquifère, puis distance. Un piézomètre <strong>sans code d&apos;aquifère publié
            n&apos;est pas pénalisé</strong> — une donnée manquante n&apos;est pas une preuve
            qu&apos;il est ailleurs. Sans information BDLISA, le comportement redevient exactement
            celui d&apos;avant.
          </p>
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
            <strong>Limites.</strong> Les entités sont interrogées dans une petite emprise autour du
            point, pas par une intersection stricte&nbsp;: en limite d&apos;entité, une entité
            voisine peut être incluse. Le rattachement ne vaut que pour les <strong>nappes</strong>
            &nbsp;; les stations de débit restent choisies par distance, faute d&apos;un découpage
            par sous-bassin équivalent.
          </p>
        </Section>

        <Section id="bassin">
          <p>
            Chaque site est rattaché à sa <strong>circonscription administrative de bassin</strong>
            (les 9 bassins DCE) et donc à l&apos;une des six <strong>agences de l&apos;eau</strong>.
            Cela compte parce que chaque agence adopte son propre SDAGE, perçoit ses propres
            redevances de prélèvement et finance ses propres aides à la sobriété&nbsp;: les taux
            comme les programmes diffèrent d&apos;un bassin à l&apos;autre.
          </p>
          <p>
            Le rattachement vient du <strong>référentiel Sandre</strong> (couche{" "}
            <code>sa:BassinDCE</code>, jointure spatiale sur le point représentatif de la commune,
            35 186 communes), <strong>jamais d&apos;une table par département</strong>&nbsp;: les
            bassins suivent l&apos;hydrologie, pas les limites administratives, et une table écrite
            à la main serait fausse à chaque ligne de partage — et fausse sans que cela se voie.
          </p>
          <p>
            Le bassin est résolu <strong>indépendamment du statut ZRE</strong>. Les deux
            référentiels n&apos;ont pas la même portée&nbsp;: la Corse a un bassin (E) mais
            n&apos;apparaît pas dans la couche ZRE. Les traiter ensemble aurait fait perdre le
            bassin partout où la ZRE ne va pas.
          </p>
        </Section>

        <Section id="swi">
          <p>
            Le SWI (Météo-France, maille SAFRAN 8×8 km) est le <strong>précurseur le plus
            précoce</strong> de la chaîne&nbsp;: le sol s&apos;assèche des semaines avant la nappe.
            Il complète l&apos;indice piézométrique (lent et le plus prédictif), le débit d&apos;étiage
            et les assecs Onde dans l&apos;indice d&apos;anticipation.
          </p>
          <p>
            L&apos;indice brut n&apos;est comparable ni d&apos;un lieu à l&apos;autre ni d&apos;une
            saison à l&apos;autre — 0,4 est normal pour un août méditerranéen et alarmant pour un
            avril breton. Il est donc <strong>standardisé</strong>&nbsp;: on situe la valeur du mois
            dans la distribution de <em>la même maille</em> pour <em>le même mois calendaire</em> sur
            <strong> 1990-2019</strong>. Même logique que l&apos;IPS nappe. Un sol plus sec que 90 %
            des mois de référence donne un stress de 90.
          </p>
          <p>
            <strong>Ce qui est embarqué et ce qui ne l&apos;est pas.</strong> La climatologie
            1990-2019 (8 981 mailles × 12 mois) est stable par construction&nbsp;: elle est
            embarquée. Le <strong>mois courant ne l&apos;est pas</strong> — il change chaque mois et
            une copie embarquée se périmerait en silence, exactement le piège identifié pour la
            prévision MétéEAU. Il est récupéré à la volée et mis en cache, comme le CSV des arrêtés.
          </p>
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
            <strong>Limites.</strong> La maille fait 8 km&nbsp;: c&apos;est un signal de contexte,
            pas une mesure du sol de la parcelle. La distribution de référence est résumée par cinq
            points (min, Q25, médiane, Q75, max), donc la résolution dans les extrêmes est grossière
            par construction. La grille couvre la France métropolitaine&nbsp;; au-delà de 25 km de
            toute maille, l&apos;indicateur se déclare indisponible plutôt que d&apos;extrapoler.
            Le poids du SWI dans l&apos;indice d&apos;anticipation est délibérément inférieur à celui
            de la nappe&nbsp;: c&apos;est un signal plus rapide, donc plus bruité — une quinzaine
            pluvieuse le fait bouger sans rien changer aux nappes.{" "}
            <strong>
              Surtout, la publication accuse un retard réel&nbsp;: en juillet 2026, la donnée la plus
              récente publiée était décembre 2025.
            </strong>{" "}
            Une mesure de plus de trois mois est donc affichée avec sa date mais{" "}
            <strong>n&apos;entre pas dans l&apos;indice</strong> — un état du sol vieux de sept mois
            ne dit rien des prochaines semaines, et l&apos;indice se renormalise sur les signaux
            qu&apos;il a réellement.
          </p>
        </Section>

        <Section id="portee-rapport">
          <p>
            Le rapport détaille la correspondance <strong>point de publication par point de
            publication</strong> (ESRS E3 : IRO-1, E3-1 à E3-5 ; TNFD LEAP ; CDP Water W1/W3/W4),
            avec pour chacun ce que l&apos;outil apporte et ce qui doit venir de l&apos;entreprise.
          </p>
          <p>
            La ligne de partage vaut d&apos;être comprise avant de s&apos;appuyer dessus&nbsp;:
            HydroVigie documente l&apos;<strong>exposition du site à la ressource</strong> — zone
            d&apos;alerte, statut réglementaire, fréquence structurelle, trajectoire climatique,
            statut ZRE. Il ne documente <strong>jamais la consommation de l&apos;entreprise</strong>.
            Pour E3-4, qui demande les volumes consommés dont ceux en zone de stress hydrique élevé,
            l&apos;outil fournit la qualification géographique — le dénominateur — et les volumes
            doivent venir des compteurs du site.
          </p>
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
            Ce n&apos;est <strong>pas une déclaration de conformité</strong>, mais la couche
            «&nbsp;exposition territoriale&nbsp;» d&apos;un dossier CSRD/TNFD, à assembler avec les
            données internes et à faire valider par l&apos;auditeur.
          </p>
        </Section>

        <Section id="jours-contraints">
          <p>
            C&apos;est la synthèse des trois autres blocs. Le principe tient en une ligne&nbsp;:{" "}
            <strong>
              jours contraints = Σ<sub>niveau</sub> jours(niveau) × exposition(niveau)
            </strong>
            . Une pondération bornée, jamais un quotient — le résultat ne peut pas dépasser le
            nombre de jours réellement passés sous arrêté.
          </p>
          <p>
            <strong>Les jours sont mesurés, pas estimés.</strong> Le CSV officiel des arrêtés couvre
            2012 à aujourd&apos;hui&nbsp;; chaque journée est attribuée à son pire niveau, sans
            double comptage. L&apos;année type est la moyenne sur les années <em>complètes</em> de la
            fenêtre — l&apos;année en cours, partielle, est exclue.
          </p>
          <p>
            <strong>L&apos;exposition est lue, pas posée.</strong> La ressource «&nbsp;Restrictions&nbsp;»
            de VigiEau publie, pour chaque arrêté × zone × niveau, les usages restreints et la mesure
            écrite par la préfecture. Il n&apos;existe pas de champ de sévérité structuré, mais les
            formulations sont régulières et souvent chiffrées&nbsp;: «&nbsp;Interdiction de 8h à
            20h&nbsp;» vaut 12&nbsp;h sur 24, soit 0,5 — une quantité mesurée. Les pourcentages sont
            lus de la même façon. À défaut de quantité, la lecture retombe sur des bandes
            grossières&nbsp;: interdiction totale 1,0&nbsp;; interdiction assortie d&apos;une
            dérogation 0,85&nbsp;; sensibilisation 0. Une mesure illisible reste <em>indéterminée</em>
            et sort du calcul — jamais comptée comme «&nbsp;pas de restriction&nbsp;».
          </p>
          <p>
            L&apos;exposition d&apos;un site est la <strong>moyenne</strong> de ces coefficients sur
            les seuls usages qui le concernent (les indicateurs <code>concerne_entreprise</code>,{" "}
            <code>concerne_exploitation</code>… publiés avec chaque mesure). Une moyenne et non un
            maximum&nbsp;: un usage interdit sur quinze n&apos;arrête pas un site. C&apos;est
            précisément pourquoi le niveau «&nbsp;crise&nbsp;» ne se traduit pas par une coupure.
          </p>
          <p>
            <strong>Trois horizons.</strong> L&apos;<em>année type</em> est la moyenne mesurée. La{" "}
            <em>fin de saison</em> applique à la climatologie mensuelle un ajustement dérivé de
            l&apos;indice d&apos;anticipation déjà calculé (nappe, débit, assecs, trajectoire de
            l&apos;année) — le module consomme cet indice au lieu de refaire le même travail.
            L&apos;<em>horizon 2050</em> applique deux effets Explore2&nbsp;: la durée des basses
            eaux s&apos;allonge (<code>dtBE_yr</code>, en jours) et l&apos;étiage se creuse
            (<code>VCN10_ete</code>), ce dernier déplaçant des jours vers les niveaux supérieurs sans
            jamais en créer. La fourchette affichée est l&apos;enveloppe q05–q95 du modèle.
          </p>
          <p>
            <strong>Origine de l&apos;eau.</strong> VigiEau publie un niveau distinct par type de
            zone (superficielle, souterraine, eau potable). Le score composite retient le plus sévère
            des trois, ce qui est prudent mais inexact ici&nbsp;: un site raccordé au réseau
            hériterait de la gravité d&apos;une nappe qu&apos;il ne pompe pas. Préciser
            l&apos;origine cible la bonne zone&nbsp;; à défaut, le comportement le plus sévère est
            conservé.
          </p>
          <p>
            <strong>Dépendance à l&apos;eau.</strong> Deux sites d&apos;un même secteur ne sont pas
            également exposés. Ce réglage multiplie l&apos;exposition (0,6 à 1,8), le produit étant
            toujours plafonné à 100&nbsp;%. Comme le secteur, il n&apos;entre <em>jamais</em> dans le
            score composite&nbsp;: c&apos;est un calcul parallèle, pas une composante de plus.
          </p>
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
            <strong>Limites.</strong> Le chiffre décrit la <em>zone d&apos;alerte</em> dont dépend le
            site, pas un compteur du site. L&apos;exposition n&apos;est <strong>pas pondérée par les
            volumes</strong> consommés — VigiEau n&apos;en publie aucun par usage —, si bien
            qu&apos;un usage marginal pèse autant qu&apos;un usage vital dans la moyenne. Une
            interdiction horaire est comptée en fraction de journée, sans tenir compte des heures
            ouvrées. Enfin, si aucune restriction n&apos;est publiée pour la zone, le calcul retombe
            sur le guide national de référence, ce que le panneau signale explicitement.
          </p>
        </Section>

        <Section id="arbitrage">
          <p>
            Une restriction arbitre entre usagers d&apos;une même ressource. Le bloc croise les
            volumes prélevés sur la commune (BNPE) avec le <strong>milieu</strong> dont ils
            proviennent — nappe, cours d&apos;eau, littoral. Les chroniques BNPE ne portent pas cette
            information, mais le référentiel des ouvrages si&nbsp;; la jointure se fait sur{" "}
            <code>code_ouvrage</code>. On peut ainsi dire quelle part des prélèvements{" "}
            <em>souterrains</em> revient à l&apos;agriculture, et non seulement une part globale. Un
            ouvrage qui ne se joint pas est conservé en «&nbsp;origine non renseignée&nbsp;» plutôt
            qu&apos;écarté.
          </p>
          <p>
            L&apos;ordre de restriction affiché décrit la hiérarchie qu&apos;encadrent le{" "}
            <strong>décret n°&nbsp;2021-795 du 23 juin 2021</strong> et les arrêtés-cadre
            départementaux&nbsp;: les usages d&apos;agrément cèdent en premier, les usages
            prioritaires (eau potable, santé, sécurité civile, abreuvement) sont maintenus jusqu&apos;au
            bout. Cette table est <strong>descriptive</strong>&nbsp;: aucun chiffre du produit n&apos;en
            est dérivé.
          </p>
        </Section>

        <Section id="projection-2050">
          <p>
            Le bloc « Disponibilité en eau — horizon 2050 » s&apos;appuie sur les données officielles{" "}
            <strong>Explore2 / DRIAS-Eau</strong> : le jeu « Indicateurs de débits futurs Explore2
            TRACC agrégés par territoire » (data.gouv.fr, Licence Ouverte), qui fournit les
            statistiques de l&apos;ensemble multi-modèles (couples climat GCM/RCM × modèles
            hydrologiques) du changement par rapport à la référence 1976-2005,{" "}
            <strong>agrégées par commune sur le bassin versant de la commune</strong> — le
            rattachement est donc hydrologique, pas géométrique. Trois indicateurs quantité :{" "}
            <strong>étiage estival VCN10</strong> (Δ %), <strong>débit moyen annuel QA</strong>{" "}
            (Δ %) et <strong>durée des basses eaux</strong> (Δ jours — une durée qui s&apos;allonge
            signifie une tension accrue).
          </p>
          <p>
            Les trois niveaux de réchauffement de la <strong>TRACC</strong> (trajectoire de
            réchauffement de référence pour l&apos;adaptation) sont proposés : +2 °C (≈ 2030),{" "}
            <strong>+2,7 °C (trajectoire de référence, ≈ 2050)</strong> et +4 °C (stress test,
            ≈ 2100). Nous affichons systématiquement la <strong>médiane</strong> de l&apos;ensemble
            (q50) et la fourchette d&apos;incertitude <strong>q05–q95</strong> : ce sont des{" "}
            <em>tendances</em>, jamais des prévisions déterministes — la largeur de la fourchette
            fait partie de l&apos;information. La recharge de nappe et le QMNA5 ne sont pas
            disponibles dans ce jeu à la maille communale et seront ajoutés si une source adaptée
            est publiée.
          </p>
          <p>
            Le <strong>score prospectif 2050</strong> combine la sévérité de la baisse d&apos;étiage
            projetée (Δ VCN10 été médian à +2,7 °C : 0 % = 0, −40 % ou pire = 100, pondéré 70 %) et
            la fréquence des restrictions de l&apos;année en cours (30 %), lorsqu&apos;elle est
            disponible.
          </p>
        </Section>

        <Section id="vos-donnees">
          <p>
            Aucun compte, aucune base de données : vos sites et vos choix de stations sont stockés
            uniquement dans votre navigateur (localStorage). L&apos;export JSON vous permet de
            sauvegarder ou transférer votre liste.
          </p>
        </Section>

        <Section id="avertissement">
          <p>
            Cet outil est une aide à la décision construite sur des données publiques. Les
            informations affichées ne se substituent pas aux arrêtés préfectoraux : en cas de
            divergence, seul le texte de l&apos;arrêté fait foi.
          </p>
        </Section>
      </div>
    </Shell>
  );
}
