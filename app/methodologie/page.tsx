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
              (QmJ) et hauteurs d&apos;eau temps réel des stations du réseau national.
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
              <strong>Tendance du débit — 12,5 %</strong> et{" "}
              <strong>tendance de la nappe — 12,5 %.</strong> Tendance 14 jours de la ressource à la
              station sélectionnée : en baisse = 75, stable = 40, en hausse = 15.
            </li>
          </ul>
          <p>
            Sur le tableau de bord « Mes sites », le score n&apos;utilise que les composantes
            réglementaire et fréquence structurelle (les signaux physiques demanderaient des appels
            supplémentaires par site) ; la fiche site affiche le score complet avec le détail par
            composante. Composantes prévues ensuite : indice piézométrique standardisé (IPS), débits
            rapportés aux références d&apos;étiage (VCN10 / QMNA5), pression des prélèvements (BNPE).
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
