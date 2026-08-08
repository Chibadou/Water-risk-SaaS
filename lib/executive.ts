// Executive summary of a portfolio — the "so what" that sits above the facts.
//
// The dashboard shows seven analytical blocks. That is the right amount of
// evidence and the wrong amount of reading for a steering committee. This
// builder answers, in order: where we stand, what it costs, how concentrated it
// is, where it is heading, where to act — and what the tool does not know.
//
// Two rules govern it, and they are what keep it from becoming marketing prose:
//
//   1. Every sentence is generated FROM A COMPUTED FACT. There is no template
//      with holes: when a fact is missing, its sentence does not appear. A
//      summary padded with "données indisponibles" trains the reader to skip it.
//   2. The last line always states what is NOT known. A synthesis that hides
//      its gaps is a synthesis that misleads — and at portfolio scale, the gaps
//      (a site without a citycode, a site without declared volumes) are exactly
//      what a reader would otherwise assume to be zeros.
//
// Pure and offline. The same builder feeds the screen and the ESG report, so
// the PDF and the dashboard cannot drift apart.

import type { PortfolioResult } from "./portefeuille";

export interface ExecutiveSiteInput {
  id: string;
  label: string;
  joursContraints?: number;
}

export interface ExecutiveInput {
  now?: Date;
  /** total sites in the portfolio, evaluated or not */
  sites: number;
  /** sites whose regulatory status could be read */
  sitesEvalues: number;
  /** sites currently at alerte or worse */
  sitesEnRestriction: number;
  /** sites currently at alerte renforcée or crise */
  sitesEnAlerteForte: number;
  scoreMoyen?: number;
  scoreMax?: number;
  /** typical-year constrained days, summed over the sites that could be estimated */
  joursContraintsTotal?: number;
  joursContraintsSites: number;
  /** 2050 total, over the sites estimated on BOTH horizons (like-for-like) */
  jours2050Total?: number;
  joursContraints2050Base?: number;
  portefeuille: PortfolioResult;
  parSite: ExecutiveSiteInput[];
}

export type ExecutiveTone = "neutre" | "attention" | "alerte";

export interface ExecutiveLine {
  id:
    | "situation"
    | "cout"
    | "concentration"
    | "trajectoire"
    | "agir"
    | "inconnu";
  titre: string;
  texte: string;
  ton: ExecutiveTone;
}

export interface ExecutiveSummary {
  /** one sentence: the single thing to remember, if there is one */
  accroche?: string;
  lignes: ExecutiveLine[];
}

const nf = new Intl.NumberFormat("fr-FR");
const num = (v: number) => nf.format(Math.round(v));
const plural = (n: number, s = "s") => (n > 1 ? s : "");

/** Compact euro figure: an executive reads "2,4 M€", not "2 400 000 €". */
function euros(v: number): string {
  if (v >= 1_000_000) return `${nf.format(Math.round((v / 1_000_000) * 10) / 10)} M€`;
  if (v >= 10_000) return `${nf.format(Math.round(v / 1000))} k€`;
  return `${num(v)} €`;
}

function m3(v: number): string {
  if (v >= 1_000_000) return `${nf.format(Math.round((v / 1_000_000) * 10) / 10)} Mm³`;
  return `${num(v)} m³`;
}

function dateFr(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  const mois = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  return `${Number(d)} ${mois[Number(m) - 1]} ${y}`;
}

export function buildExecutiveSummary(input: ExecutiveInput): ExecutiveSummary {
  const lignes: ExecutiveLine[] = [];
  const p = input.portefeuille;

  // --- 1. Where we stand ---------------------------------------------------
  if (input.sitesEvalues > 0) {
    const n = input.sitesEnRestriction;
    const fort = input.sitesEnAlerteForte;
    let texte: string;
    let ton: ExecutiveTone = "neutre";
    if (n === 0) {
      texte = `Aucun de vos ${num(input.sitesEvalues)} site${plural(input.sitesEvalues)} évalué${plural(
        input.sitesEvalues,
      )} n'est actuellement sous restriction obligatoire.`;
    } else {
      texte =
        `${num(n)} de vos ${num(input.sitesEvalues)} site${plural(input.sitesEvalues)} évalué${plural(
          input.sitesEvalues,
        )} ${n > 1 ? "sont" : "est"} aujourd'hui sous restriction obligatoire` +
        (fort > 0
          ? `, dont ${num(fort)} en alerte renforcée ou en crise.`
          : ".");
      ton = fort > 0 ? "alerte" : "attention";
    }
    if (input.scoreMax !== undefined && input.scoreMoyen !== undefined) {
      texte += ` Score de risque moyen ${num(input.scoreMoyen)}/100, maximum ${num(input.scoreMax)}/100.`;
    }
    lignes.push({ id: "situation", titre: "Situation", texte, ton });
  }

  // --- 2. What it costs ----------------------------------------------------
  if (input.joursContraintsTotal !== undefined && input.joursContraintsSites > 0) {
    let texte =
      `Sur une année type, vos sites cumulent ${num(input.joursContraintsTotal)} jours d'activité ` +
      `contrainte (${num(input.joursContraintsSites)} site${plural(input.joursContraintsSites)} estimé${plural(
        input.joursContraintsSites,
      )}).`;
    const v = p.valeur;
    if (v.m3Total !== undefined) {
      texte +=
        ` Soit ${m3(v.m3Total)} non prélevables par an sur les ${num(v.m3Sites)} site${plural(v.m3Sites)} ` +
        `dont vous avez renseigné les volumes.`;
    }
    if (v.eurosTotal !== undefined) {
      texte +=
        ` Exposition financière estimée : ${euros(v.eurosTotal)} par an` +
        (v.eurosParRepli
          ? " (dont une partie estimée à partir du chiffre d'affaires, à défaut d'un coût journalier renseigné)."
          : ".");
    }
    lignes.push({
      id: "cout",
      titre: "Coût récurrent",
      texte,
      ton: input.joursContraintsTotal > 0 ? "attention" : "neutre",
    });
  }

  // --- 3. Concentration — the portfolio-specific insight --------------------
  {
    const zone = p.concentration.find((c) => c.cle === "zone");
    const pic = p.simultaneite.pic;
    const parts: string[] = [];
    let ton: ExecutiveTone = "neutre";

    if (zone && zone.sites > 1) {
      parts.push(
        `Vos ${num(zone.sites)} sites se répartissent sur ${num(zone.groupes)} zone${plural(
          zone.groupes,
        )} d'alerte, mais se comportent comme ${nf.format(zone.effectifs)} zone${
          zone.effectifs >= 2 ? "s" : ""
        } indépendante${zone.effectifs >= 2 ? "s" : ""} face au risque.`,
      );
      // Under half the sites' worth of independent zones = the parc moves together.
      if (zone.effectifs < zone.sites / 2) ton = "attention";
    }

    if (pic && pic.sites >= 2) {
      parts.push(
        `Le pire épisode rejoué sur l'historique : ${num(pic.sites)} site${plural(pic.sites)} ` +
          `simultanément contraint${plural(pic.sites)} pendant ${num(pic.jours)} jour${plural(pic.jours)}, ` +
          `à partir du ${dateFr(pic.debut)}.`,
      );
      if (p.simultaneite.sitesRejoues > 0 && pic.sites >= p.simultaneite.sitesRejoues / 2) {
        ton = "alerte";
      }
    }

    const grappe = p.grappes.find((g) => g.type === "zone");
    if (grappe) {
      parts.push(
        `${num(grappe.siteIds.length)} de vos sites partagent la même zone d'alerte ` +
          `(${grappe.cle}) : un seul arrêté préfectoral les contraint ensemble.`,
      );
    }

    if (parts.length > 0) {
      lignes.push({ id: "concentration", titre: "Concentration", texte: parts.join(" "), ton });
    }
  }

  // --- 4. Trajectory -------------------------------------------------------
  if (input.jours2050Total !== undefined && input.joursContraints2050Base !== undefined) {
    const base = input.joursContraints2050Base;
    const cible = input.jours2050Total;
    const delta = cible - base;
    const pct = base > 0 ? Math.round((delta / base) * 100) : undefined;
    const sens = delta >= 0 ? "augmenteraient" : "diminueraient";
    lignes.push({
      id: "trajectoire",
      titre: "Trajectoire 2050",
      texte:
        `À l'horizon 2050 (trajectoire de référence +2,7 °C), ces jours contraints ${sens} ` +
        `de ${num(base)} à ${num(cible)} jours cumulés` +
        (pct !== undefined ? ` (${delta >= 0 ? "+" : ""}${pct} %)` : "") +
        `, à périmètre de sites constant.`,
      ton: delta > 0 ? "attention" : "neutre",
    });
  }

  // --- 5. Where to act — Pareto -------------------------------------------
  {
    const withDays = input.parSite
      .filter((s): s is ExecutiveSiteInput & { joursContraints: number } => s.joursContraints !== undefined)
      .sort((a, b) => b.joursContraints - a.joursContraints);
    const total = withDays.reduce((a, s) => a + s.joursContraints, 0);
    if (withDays.length >= 3 && total > 0) {
      // Smallest set of sites carrying at least half the constrained days.
      let cumul = 0;
      const tete: typeof withDays = [];
      for (const s of withDays) {
        tete.push(s);
        cumul += s.joursContraints;
        if (cumul >= total / 2) break;
      }
      const part = Math.round((cumul / total) * 100);
      lignes.push({
        id: "agir",
        titre: "Où agir",
        texte:
          `${num(tete.length)} site${plural(tete.length)} sur ${num(withDays.length)} ` +
          `concentre${tete.length > 1 ? "nt" : ""} ${part} % des jours contraints : ` +
          `${tete.map((s) => s.label).join(", ")}. C'est là que l'effort a le meilleur rendement.`,
        ton: "neutre",
      });
    }
  }

  // --- 6. What is not known — always last, never omitted --------------------
  {
    const manques: string[] = [];
    const nonEvalues = input.sites - input.sitesEvalues;
    if (nonEvalues > 0) {
      manques.push(
        `${num(nonEvalues)} site${plural(nonEvalues)} sans statut réglementaire lisible (zone non couverte par VigiEau, ou service indisponible)`,
      );
    }
    const sansCalendrier = p.sitesNonEvalues.length;
    if (sansCalendrier > 0) {
      manques.push(
        `${num(sansCalendrier)} site${plural(sansCalendrier)} sans historique d'arrêtés, donc absent${plural(
          sansCalendrier,
        )} du calcul de simultanéité`,
      );
    }
    // Counted on DECLARED volumes, not on converted ones. A site that declared
    // its volume but has no restriction history is missing days, not volume —
    // and this line must not send its owner to re-fill a field already filled.
    const sansVolume = input.sites - p.valeur.m3Declares;
    if (sansVolume > 0) {
      manques.push(
        `${num(sansVolume)} site${plural(sansVolume)} sans volume renseigné, donc sans conversion en m³`,
      );
    }
    if (manques.length > 0) {
      lignes.push({
        id: "inconnu",
        titre: "Ce que ce résumé ne sait pas",
        texte: `${manques.join(" ; ")}. Ces sites sont comptés comme non estimés, jamais comme des sites sans risque.`,
        ton: "neutre",
      });
    }
  }

  // --- Headline ------------------------------------------------------------
  // The one sentence to remember, picked from the strongest fact available —
  // never a generic reassurance when nothing was computed.
  let accroche: string | undefined;
  const pic = p.simultaneite.pic;
  if (pic && pic.sites >= 2 && p.simultaneite.sitesRejoues > 1) {
    accroche =
      `Votre risque n'est pas réparti : jusqu'à ${num(pic.sites)} de vos ` +
      `${num(p.simultaneite.sitesRejoues)} sites ont déjà été contraints le même jour.`;
  } else if (input.sitesEnAlerteForte > 0) {
    accroche = `${num(input.sitesEnAlerteForte)} site${plural(input.sitesEnAlerteForte)} ${
      input.sitesEnAlerteForte > 1 ? "sont" : "est"
    } en alerte renforcée ou en crise aujourd'hui.`;
  } else if (input.joursContraintsTotal !== undefined && input.joursContraintsTotal > 0) {
    accroche = `Votre portefeuille cumule ${num(
      input.joursContraintsTotal,
    )} jours d'activité contrainte sur une année type.`;
  }

  return { accroche, lignes };
}

/** The summary as Markdown, for the portfolio ESG report. */
export function executiveSummaryMarkdown(summary: ExecutiveSummary): string {
  const parts: string[] = [];
  if (summary.accroche) parts.push(`**${summary.accroche}**`);
  for (const l of summary.lignes) parts.push(`- **${l.titre}** — ${l.texte}`);
  return parts.join("\n\n");
}
