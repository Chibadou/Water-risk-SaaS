// Structured per-site risk report for ESG disclosure (CSRD / ESRS E3 Water,
// TNFD, CDP Water Security). Pure builder → Markdown string, assembled from
// data already computed in the app (no new data source, works offline).
//
// The report is framed as *context* for the physical water-risk exposure of a
// site — it supports the risk/impact narrative of ESRS E3 and TNFD LEAP, it is
// not itself a compliance statement. The disclaimer at the foot makes the
// "only the prefectural order is authoritative" limit explicit.

import { departementName } from "./departements";
import { GRAVITE, graviteInfo, ZONE_TYPE_LABEL } from "./gravite";
import {
  computeScore,
  computeSeasonalProfile,
  riskClass,
  scoreConfidence,
  type ScoreInputs,
} from "./score";
import { secteurInfo } from "./secteur";
import type { Secteur } from "./sites";
import type { NiveauGravite, ZoneType } from "./types";
import {
  levelLabel,
  referenceLevel,
  type ProjectionPayload,
} from "./projectionsShared";

export interface ReportInput {
  generatedAt: Date;
  label: string;
  lat: number;
  lon: number;
  citycode?: string;
  profil: string;
  secteur?: Secteur;
  scoreInputs: ScoreInputs;
  /** worst regulatory level per zone type, for the detail table */
  zonesByType?: Array<{ type: ZoneType; niveau?: NiveauGravite }>;
  stationDistanceKm?: number;
  history?: {
    moyen?: number;
    annees?: number;
    parMois?: Record<string, Record<number, number>>;
  };
  /** the /api/projection payload (data + benchmark + commune) if available */
  projection?: ProjectionPayload;
}

function fr(n: number, digits = 0): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: digits });
}

function signed(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined) return "—";
  const s = `${v > 0 ? "+" : ""}${fr(v, 1)}`;
  return unit === "%" ? `${s} %` : `${s} j`;
}

export function buildMarkdownReport(input: ReportInput): string {
  const { scoreInputs } = input;
  const composite = computeScore(scoreInputs);
  const rc = riskClass(composite.score);
  const conf = scoreConfidence(
    composite.coverage,
    input.stationDistanceKm,
  );
  const date = input.generatedAt.toISOString().slice(0, 10);
  const sect = secteurInfo(input.secteur);

  const L: string[] = [];
  L.push(`# Rapport de risque hydrique — ${input.label}`);
  L.push("");
  L.push(
    `*Généré le ${date} par HydroVigie — support de reporting ESRS E3 (Eau) / TNFD. ` +
      `Risque quantité (sécheresse), France.*`,
  );
  L.push("");

  // --- 1. Identification ----------------------------------------------------
  L.push("## 1. Identification du site");
  L.push("");
  L.push(`| Champ | Valeur |`);
  L.push(`| --- | --- |`);
  L.push(`| Libellé | ${input.label} |`);
  L.push(`| Coordonnées | ${fr(input.lat, 5)}, ${fr(input.lon, 5)} |`);
  if (input.projection?.commune?.nom || input.citycode) {
    const nom = input.projection?.commune?.nom;
    const code = input.projection?.commune?.code ?? input.citycode;
    L.push(`| Commune | ${nom ? `${nom} (${code})` : code} |`);
  }
  L.push(`| Profil d'usage | ${input.profil} |`);
  if (sect) L.push(`| Secteur d'activité | ${sect.label} |`);
  L.push(`| Date d'évaluation | ${date} |`);
  L.push("");

  // --- 2. Score et classe de risque ----------------------------------------
  L.push("## 2. Évaluation du risque courant");
  L.push("");
  L.push(
    `**Score composite : ${composite.score}/100 — classe « ${rc.label} » ` +
      `(${rc.labelEn}, échelle type WRI/CDP).**`,
  );
  L.push("");
  L.push(
    `Niveau de confiance : **${conf.label.replace("Confiance ", "")}** — ${conf.detail} ` +
      `Couverture des composantes : ${fr(composite.coverage * 100)} %.`,
  );
  L.push("");
  L.push(`### Décomposition du score`);
  L.push("");
  L.push(`| Composante | Poids | Score | Détail |`);
  L.push(`| --- | ---: | ---: | --- |`);
  for (const c of composite.components) {
    const sc = c.score === undefined ? "n/d" : String(c.score);
    L.push(`| ${c.label} | ${c.weight} % | ${sc} | ${c.detail ?? ""} |`);
  }
  L.push("");
  L.push(
    `*Le score est une moyenne pondérée renormalisée sur les composantes disponibles ` +
      `(couverture ${fr(composite.coverage * 100)} %).*`,
  );
  L.push("");

  // --- 3. Statut réglementaire ---------------------------------------------
  if (input.zonesByType && input.zonesByType.length > 0) {
    L.push("## 3. Statut réglementaire en vigueur (VigiEau)");
    L.push("");
    L.push(`| Type de zone | Niveau |`);
    L.push(`| --- | --- |`);
    for (const z of input.zonesByType) {
      const info = graviteInfo(z.niveau);
      L.push(`| ${ZONE_TYPE_LABEL[z.type].long} | ${info ? info.label : "Aucune restriction"} |`);
    }
    L.push("");
  }

  // --- 4. Historique --------------------------------------------------------
  if (input.history && (input.history.moyen !== undefined || input.history.parMois)) {
    L.push("## 4. Historique des restrictions");
    L.push("");
    if (input.history.moyen !== undefined) {
      L.push(
        `Fréquence structurelle : **${fr(input.history.moyen)} jours/an** en alerte ou plus, ` +
          `en moyenne sur ${input.history.annees ?? "?"} années complètes.`,
      );
      L.push("");
    }
    if (input.history.parMois && Object.keys(input.history.parMois).length > 0) {
      const profile = computeSeasonalProfile({}, input.history.parMois);
      const peak = [...profile].sort((a, b) => b.avgDaysRestricted - a.avgDaysRestricted)[0];
      if (peak && peak.avgDaysRestricted > 0) {
        L.push(
          `Pic saisonnier : **${peak.label}** (${fr(peak.avgDaysRestricted, 1)} jours/an en moyenne). ` +
            `Les restrictions se concentrent historiquement sur la période estivale.`,
        );
        L.push("");
      }
    }
  }

  // --- 5. Projection 2050 + benchmark --------------------------------------
  const proj = input.projection;
  if (proj?.available && proj.data && proj.meta) {
    const level = referenceLevel(proj.meta.warming_levels);
    const ld = level ? proj.data[level] : undefined;
    if (level && ld) {
      L.push("## 5. Projection climatique — horizon 2050");
      L.push("");
      L.push(
        `Trajectoire de référence **${levelLabel(level).label}** (${levelLabel(level).sub}), ` +
          `changement vs référence ${proj.meta.reference} (Explore2 / DRIAS-Eau, ` +
          `agrégé sur le bassin versant de la commune).`,
      );
      L.push("");
      L.push(`| Indicateur | Q05 | Médiane | Q95 |`);
      L.push(`| --- | ---: | ---: | ---: |`);
      for (const [ind, meta] of Object.entries(proj.meta.indicators)) {
        const stat = ld[ind];
        if (!stat) continue;
        L.push(
          `| ${meta.label} | ${signed(stat[0], meta.unit)} | ` +
            `${signed(stat[1], meta.unit)} | ${signed(stat[2], meta.unit)} |`,
        );
      }
      L.push("");
      const b = proj.benchmark;
      if (b) {
        L.push(
          `**Positionnement national :** la baisse d'étiage projetée de ce site est plus sévère ` +
            `que **${b.national.severityPercentile} %** des ${fr(b.national.n)} communes françaises` +
            (b.department
              ? ` (et ${b.department.severityPercentile} % du département ${b.department.code}).`
              : `.`),
        );
        L.push("");
      }
    }
  }

  // --- 6. ESRS E3 mapping ---------------------------------------------------
  L.push("## 6. Correspondance ESRS E3 / TNFD");
  L.push("");
  L.push(
    `- **ESRS E3 (IRO, risques physiques)** : ce rapport documente l'exposition physique du site ` +
      `au stress hydrique quantité (restrictions actuelles, fréquence structurelle, projection 2050) ` +
      `— entrée pour l'évaluation des risques et impacts liés à l'eau.`,
  );
  L.push(
    `- **TNFD (LEAP — Locate / Assess)** : localisation du site, état de la ressource et ` +
      `trajectoire climatique, positionnement relatif au niveau national.`,
  );
  L.push(
    `- **CDP Water Security** : classe de risque alignée sur une échelle type WRI Aqueduct / CDP.`,
  );
  L.push("");

  // --- Sources & disclaimer -------------------------------------------------
  L.push("## Sources & limites");
  L.push("");
  L.push(
    `Sources : VigiEau (restrictions, Ministère de la Transition écologique), Hub'Eau ` +
      `(Onde, hydrométrie, piézométrie), arrêtés data.gouv (historique), Explore2 / DRIAS-Eau ` +
      `(projections). Données sous Licence Ouverte 2.0.`,
  );
  L.push("");
  L.push(
    `**Avertissement :** ces informations ne se substituent pas aux arrêtés préfectoraux — ` +
      `seul le texte de l'arrêté fait foi. Les projections sont des tendances multi-modèles, ` +
      `pas des prévisions. Le score est un indicateur d'aide à la décision, pas une mesure ` +
      `réglementaire. Méthodologie complète : voir la page Méthodologie de HydroVigie.`,
  );
  L.push("");

  return L.join("\n");
}

// ---------------------------------------------------------------------------
// Portfolio report — one disclosure document across all saved sites
// ---------------------------------------------------------------------------

export interface PortfolioReportSite {
  label: string;
  /** department code, for the geographic breakdown */
  dept?: string;
  secteur?: Secteur;
  /** dashboard score (regulatory + history), or undefined when not evaluated */
  score?: number;
  /** worst regulatory level in force across the site's zones */
  worst?: NiveauGravite;
}

export interface PortfolioReportInput {
  generatedAt: Date;
  sites: PortfolioReportSite[];
}

export function buildPortfolioMarkdownReport(input: PortfolioReportInput): string {
  const date = input.generatedAt.toISOString().slice(0, 10);
  const sites = input.sites;
  const scored = sites.filter((s) => s.score !== undefined) as Array<PortfolioReportSite & { score: number }>;

  const L: string[] = [];
  L.push(`# Rapport de risque hydrique — portefeuille`);
  L.push("");
  L.push(
    `*Généré le ${date} par HydroVigie — support de reporting ESRS E3 (Eau) / TNFD. ` +
      `Risque quantité (sécheresse), France. ${sites.length} site${sites.length > 1 ? "s" : ""}.*`,
  );
  L.push("");

  // --- 1. Synthèse ----------------------------------------------------------
  L.push("## 1. Synthèse du portefeuille");
  L.push("");
  if (scored.length === 0) {
    L.push("Aucun site évalué pour le moment.");
    L.push("");
  } else {
    const avg = Math.round(scored.reduce((a, b) => a + b.score, 0) / scored.length);
    const max = Math.max(...scored.map((s) => s.score));
    const avgRc = riskClass(avg);
    const maxRc = riskClass(max);
    L.push(`| Indicateur | Valeur |`);
    L.push(`| --- | --- |`);
    L.push(`| Sites suivis | ${sites.length} (${scored.length} évalués) |`);
    L.push(`| Score moyen | ${avg}/100 — ${avgRc.label} |`);
    L.push(`| Score maximum | ${max}/100 — ${maxRc.label} |`);
    L.push("");
    // Distribution by risk class (worst first).
    const order = ["Critique", "Très élevé", "Élevé", "Modéré", "Faible", "Négligeable"];
    const dist: Record<string, number> = {};
    for (const s of scored) dist[riskClass(s.score).label] = (dist[riskClass(s.score).label] ?? 0) + 1;
    L.push(`### Répartition par classe de risque`);
    L.push("");
    L.push(`| Classe | Sites |`);
    L.push(`| --- | ---: |`);
    for (const label of order) {
      if (dist[label]) L.push(`| ${label} | ${dist[label]} |`);
    }
    L.push("");
  }

  // --- 2. Répartition géographique -----------------------------------------
  const byDept = new Map<string, { count: number; scores: number[] }>();
  for (const s of sites) {
    const key = s.dept ?? "??";
    const g = byDept.get(key) ?? { count: 0, scores: [] };
    g.count += 1;
    if (s.score !== undefined) g.scores.push(s.score);
    byDept.set(key, g);
  }
  if (byDept.size > 1) {
    L.push("## 2. Répartition géographique");
    L.push("");
    L.push(`| Département | Sites | Score moyen |`);
    L.push(`| --- | ---: | ---: |`);
    const rows = [...byDept.entries()]
      .map(([dept, g]) => ({
        dept,
        count: g.count,
        avg: g.scores.length > 0 ? Math.round(g.scores.reduce((a, b) => a + b, 0) / g.scores.length) : undefined,
      }))
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
    for (const r of rows) {
      const name = r.dept === "??" ? "Inconnu" : `${departementName(r.dept) ?? r.dept} (${r.dept})`;
      const avg = r.avg !== undefined ? `${r.avg} — ${riskClass(r.avg).label}` : "—";
      L.push(`| ${name} | ${r.count} | ${avg} |`);
    }
    L.push("");
  }

  // --- 3. Détail par site ---------------------------------------------------
  L.push("## 3. Détail par site");
  L.push("");
  L.push(`| Site | Département | Secteur | Statut réglementaire | Score | Classe |`);
  L.push(`| --- | --- | --- | --- | ---: | --- |`);
  const sorted = [...sites].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.label.localeCompare(b.label));
  for (const s of sorted) {
    const dept = s.dept ? (departementName(s.dept) ?? s.dept) : "—";
    const sect = secteurInfo(s.secteur)?.label ?? "—";
    const reg = graviteInfo(s.worst)?.label ?? "Aucune restriction";
    const score = s.score !== undefined ? String(s.score) : "n/d";
    const cls = s.score !== undefined ? riskClass(s.score).label : "—";
    L.push(`| ${s.label} | ${dept} | ${sect} | ${reg} | ${score} | ${cls} |`);
  }
  L.push("");

  // --- Sources & disclaimer -------------------------------------------------
  L.push("## Correspondance & limites");
  L.push("");
  L.push(
    `Ce rapport agrège l'exposition physique au stress hydrique quantité des sites suivis — ` +
      `support pour l'analyse des risques liés à l'eau (ESRS E3, TNFD LEAP), classe de risque ` +
      `alignée sur une échelle type WRI Aqueduct / CDP. Le score de portefeuille n'utilise que ` +
      `les composantes réglementaire et fréquence des restrictions (la fiche de chaque site porte ` +
      `le score complet avec les signaux physiques).`,
  );
  L.push("");
  L.push(
    `**Avertissement :** ces informations ne se substituent pas aux arrêtés préfectoraux — ` +
      `seul le texte de l'arrêté fait foi. Le score est un indicateur d'aide à la décision, pas ` +
      `une mesure réglementaire. Sources : VigiEau, arrêtés data.gouv (Licence Ouverte 2.0). ` +
      `Méthodologie complète : voir la page Méthodologie de HydroVigie.`,
  );
  L.push("");

  return L.join("\n");
}

/** Suggested filename (slugified label + date). */
export function reportFilename(label: string, date: Date): string {
  const slug = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `hydrovigie-rapport-${slug || "site"}-${date.toISOString().slice(0, 10)}.md`;
}

/** Suggested filename for the portfolio report. */
export function portfolioReportFilename(date: Date): string {
  return `hydrovigie-portefeuille-${date.toISOString().slice(0, 10)}.md`;
}

// Re-export for callers that only need the GRAVITE labels (keeps imports tidy).
export { GRAVITE };
