import type { Metadata } from "next";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Méthodologie — HydroVigie",
  description:
    "Sources de données, sélection des stations de mesure, représentativité et calcul du score de risque.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

export default function MethodologiePage() {
  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Méthodologie</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Ce que l&apos;outil mesure, d&apos;où viennent les données, et les limites à connaître pour
        interpréter correctement ce qui est affiché.
      </p>

      <div className="max-w-3xl">
        <Section title="Deux signaux complémentaires">
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

        <Section title="Sources de données">
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

        <Section title="Comment la station de mesure est choisie">
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

        <Section title="Tendance affichée">
          <p>
            La tendance « ressource en hausse / stable / en baisse » compare la moyenne des 7
            derniers jours à celle des 7 jours précédents, rapportée à l&apos;amplitude observée sur
            la fenêtre de 35 jours (zone neutre de ±10 %). Pour les profondeurs de nappe, le sens est
            inversé : une profondeur qui augmente signifie une ressource en baisse.
          </p>
        </Section>

        <Section title="Classification du risque">
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

        <Section title="Score de risque courant">
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

        <Section title="Calendrier saisonnier et évolution du risque">
          <p>
            Le <strong>calendrier saisonnier</strong> montre la répartition mensuelle des
            restrictions sur les années complètes de la fenêtre de 5 ans. Chaque mois est coloré
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

        <Section title="Interprétation sectorielle des restrictions">
          <p>
            Un même niveau de restriction n&apos;a pas les mêmes conséquences opérationnelles
            selon le secteur d&apos;activité. La fonction « secteur » permet d&apos;associer un
            secteur à chaque site enregistré et affiche les impacts concrets attendus à chaque
            niveau de gravité.
          </p>
          <p>
            Six secteurs sont proposés : <strong>agriculture</strong> (irrigation, élevage),{" "}
            <strong>industrie</strong> (process, ICPE), <strong>énergie</strong>{" "}
            (refroidissement, centrales), <strong>services / tertiaire</strong>,{" "}
            <strong>collectivité</strong> (gestion AEP, espaces publics) et <strong>autre</strong>.
            Les descriptions s&apos;appuient sur les mesures types des arrêtés cadre départementaux
            et sur la doctrine nationale sécheresse (circulaire 2023). Elles sont indicatives :
            seul l&apos;arrêté préfectoral en vigueur fait foi.
          </p>
        </Section>

        <Section title="Synthèse portefeuille (tableau de bord)">
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
        </Section>

        <Section title="Positionnement du site (benchmark national)">
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

        <Section title="Partage et mode hors-ligne">
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

        <Section title="Prélèvements (BNPE)">
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

        <Section title="Zones d'alerte : périmètre appliqué">
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

        <Section title="Projection 2050">
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

        <Section title="Vos données">
          <p>
            Aucun compte, aucune base de données : vos sites et vos choix de stations sont stockés
            uniquement dans votre navigateur (localStorage). L&apos;export JSON vous permet de
            sauvegarder ou transférer votre liste.
          </p>
        </Section>

        <Section title="Avertissement">
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
