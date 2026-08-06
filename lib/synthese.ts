// Written synthesis of ONE site — the "so what" that sits above the chapters.
//
// The site sheet carries twelve analytical blocks. That is the right amount of
// evidence and the wrong amount of reading: the page opens on "Quel est le
// niveau de restriction d'eau à l'adresse de votre site ?" and, before this
// builder existed, answered it in fourth position, under three blocks of
// modelling. This states the answer first, in sentences.
//
// It is the site-level twin of `buildExecutiveSummary` (lib/executive.ts) and
// obeys the same two rules, which are what keep a synthesis from becoming
// marketing prose:
//
//   1. Every sentence is generated FROM A COMPUTED FACT. There is no template
//      with holes: when a fact is missing, its sentence does not appear. A
//      summary padded with "données indisponibles" trains the reader to skip it.
//   2. The last line always states what is NOT known. On a single site the gaps
//      are even more dangerous than on a portfolio, because there is no other
//      site to relativise them: a missing history reads as a calm site.
//
// Pure and offline, like `computeAnticipation` and `computeInterruption`: it
// re-reads state HomeClient already holds and issues no request of its own.

import { GRAVITE } from "./gravite";
import type { ExecutiveTone } from "./executive";
import type { NiveauGravite } from "./types";

export type SyntheseTone = ExecutiveTone;

export interface SyntheseLine {
  id: "situation" | "impact" | "anticipation" | "trajectoire" | "physique" | "inconnu";
  titre: string;
  texte: string;
  ton: SyntheseTone;
  /** Anchor of the chapter this line summarises, so the reader can jump to it. */
  ancre?: string;
}

export interface SyntheseSite {
  accroche?: string;
  lignes: SyntheseLine[];
}

export interface SyntheseInput {
  /** Worst level in force across the covering zones. `null` = status unreadable. */
  worst?: NiveauGravite | null;
  /** VigiEau answered 404: no alert zone known at this address. */
  nonCouvert?: boolean;
  /** VigiEau could not be reached — NOT the same as "no restriction". */
  statutIndisponible?: boolean;
  /** Start date of the decree in force, ISO. The only real freshness we hold. */
  arreteDepuis?: string;
  score?: number;
  classeRisque?: string;
  /** Structural mean of days at alerte+ per year, over complete years only. */
  joursMoyen?: number;
  anneesCompletes?: number;
  /** Exposure-weighted constrained days, per horizon (from computeInterruption). */
  interruption?: {
    anneeType?: number;
    finSaison?: number;
    horizon2050?: number;
    /** of which: days of outright suspension of non-priority withdrawals */
    arret?: number;
  };
  /** Anticipation index, already blended by computeAnticipation. */
  anticipation?: { label: string; index: number };
  /** Median projected change of the summer low flow at +2.7 °C, in %. */
  vcn10Delta2050?: number;
  /** Physical precursors, each already normalised 0-100 by its own module. */
  physique?: {
    nappe?: { label: string; score?: number };
    debit?: { label: string; score?: number };
    sol?: { label: string };
    onde?: { score: number; stations: number };
  };
  /** Figures only the operator holds. */
  interne?: { volumeM3?: number; coutJourEuros?: number; caAnnuelEuros?: number };
  /**
   * Sources whose request has NOT settled yet.
   *
   * Without this the "ce que cette synthèse ne sait pas" line asserted, three
   * seconds into a fifteen-second load, that "la projection 2050 n'est pas
   * disponible pour ce bassin" — and then contradicted itself when the answer
   * arrived. A pending source is not a missing one, exactly as a service that
   * is still answering is not a station with nothing to say (Sprint 32).
   */
  enAttente?: SyntheseSource[];
}

/** Sources the gap line can report on, and therefore can be waiting for. */
export type SyntheseSource = "historique" | "interruption" | "projection" | "mesures";

const nf = new Intl.NumberFormat("fr-FR");
const num = (v: number) => nf.format(Math.round(v));
/**
 * Plural agreement is decided on the value AS DISPLAYED, not on the raw one:
 * 1.2 days is printed "1" by `num`, and agreeing on 1.2 produced "1 jours".
 * French pluralises from 2, so `>= 2` after rounding is the rule.
 */
const plural = (n: number, s = "s") => (Math.round(n) >= 2 ? s : "");

function euros(v: number): string {
  if (v >= 1_000_000) return `${nf.format(Math.round((v / 1_000_000) * 10) / 10)} M€`;
  if (v >= 10_000) return `${nf.format(Math.round(v / 1000))} k€`;
  return `${num(v)} €`;
}

function m3(v: number): string {
  if (v >= 1_000_000) return `${nf.format(Math.round((v / 1_000_000) * 10) / 10)} Mm³`;
  return `${num(v)} m³`;
}

function dateFr(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Tone of a regulatory level, on the same scale the badges use. */
function toneForLevel(n: NiveauGravite): SyntheseTone {
  return GRAVITE[n].rank >= GRAVITE.alerte_renforcee.rank
    ? "alerte"
    : GRAVITE[n].rank >= GRAVITE.alerte.rank
      ? "attention"
      : "neutre";
}

export function buildSiteSummary(input: SyntheseInput): SyntheseSite {
  const lignes: SyntheseLine[] = [];

  // --- 1. Where the site stands, legally, today ----------------------------
  // Deliberately first, and deliberately separate from the score: this is the
  // only line in the synthesis that states a fact someone else is responsible
  // for. Everything below it is this tool's own reading.
  if (input.statutIndisponible) {
    lignes.push({
      id: "situation",
      titre: "Situation réglementaire",
      texte:
        "Le service VigiEau n'a pas répondu : le statut réglementaire de ce site est inconnu. " +
        "Inconnu ne veut pas dire « aucune restriction » — l'arrêté peut être en vigueur.",
      ton: "attention",
      ancre: "situation",
    });
  } else if (input.nonCouvert) {
    lignes.push({
      id: "situation",
      titre: "Situation réglementaire",
      texte:
        "Aucune zone d'alerte sécheresse ne couvre cette adresse : soit le territoire n'est pas " +
        "couvert par VigiEau, soit aucune restriction n'y est en vigueur aujourd'hui.",
      ton: "neutre",
      ancre: "situation",
    });
  } else if (input.worst) {
    const info = GRAVITE[input.worst];
    const depuis = input.arreteDepuis ? dateFr(input.arreteDepuis) : undefined;
    lignes.push({
      id: "situation",
      titre: "Situation réglementaire",
      texte:
        `Ce site est en « ${info.label} »${depuis ? ` depuis le ${depuis}` : ""}. ${info.description}`,
      ton: toneForLevel(input.worst),
      ancre: "situation",
    });
  } else if (input.worst === undefined) {
    // Nothing said: the chapter itself will report the loading state.
  } else {
    lignes.push({
      id: "situation",
      titre: "Situation réglementaire",
      texte: "Aucune restriction n'est en vigueur à cette adresse aujourd'hui.",
      ton: "neutre",
      ancre: "situation",
    });
  }

  // --- 2. What it costs the site, in days then in m³ and € -----------------
  {
    const i = input.interruption;
    if (i?.anneeType !== undefined) {
      let texte =
        `Sur une année type, les restrictions freinent l'activité ${num(i.anneeType)} jour${plural(
          i.anneeType,
        )} par an`;
      if (i.arret !== undefined && i.arret > 0) {
        texte += `, dont ${num(i.arret)} jour${plural(i.arret)} d'arrêt des prélèvements non prioritaires`;
      }
      texte += ".";
      if (i.finSaison !== undefined) {
        texte += ` D'ici la fin de l'étiage : ${num(i.finSaison)} jour${plural(i.finSaison)}.`;
      }
      // m³ and € only exist if the operator declared them — never inferred.
      const vol = input.interne?.volumeM3;
      if (vol !== undefined && vol > 0) {
        texte += ` Soit environ ${m3((vol / 365) * i.anneeType)} non prélevables par an.`;
      }
      const cout = input.interne?.coutJourEuros;
      const ca = input.interne?.caAnnuelEuros;
      if (cout !== undefined && cout > 0) {
        texte += ` Exposition estimée : ${euros(cout * i.anneeType)} par an.`;
      } else if (ca !== undefined && ca > 0) {
        // 0.5 % of annual turnover per interrupted day — the generic order of
        // magnitude the interruption module already uses, flagged as such.
        texte += ` Exposition estimée : ${euros(ca * 0.005 * i.anneeType)} par an (ordre de grandeur générique, à défaut d'un coût journalier renseigné).`;
      }
      lignes.push({
        id: "impact",
        titre: "Impact sur l'activité",
        texte,
        ton: i.anneeType >= 30 ? "alerte" : i.anneeType > 0 ? "attention" : "neutre",
        ancre: "impact",
      });
    } else if (input.joursMoyen !== undefined && input.anneesCompletes) {
      // Fallback: raw days under decree, without the exposure weighting. Said
      // as what it is — "sous arrêté", not "contraint" — so the two figures are
      // never confused when the exposure table was unavailable.
      lignes.push({
        id: "impact",
        titre: "Impact sur l'activité",
        texte:
          `Ce site passe en moyenne ${num(input.joursMoyen)} jour${plural(input.joursMoyen)} par an ` +
          `sous arrêté de niveau alerte ou plus, sur ${num(input.anneesCompletes)} année${plural(
            input.anneesCompletes,
          )} complète${plural(input.anneesCompletes)}. La part d'activité réellement empêchée n'a pas pu être calculée.`,
        ton: input.joursMoyen >= 30 ? "attention" : "neutre",
        ancre: "impact",
      });
    }
  }

  // --- 3. The coming weeks -------------------------------------------------
  if (input.anticipation) {
    const a = input.anticipation;
    lignes.push({
      id: "anticipation",
      titre: "Prochaines semaines",
      texte:
        `Un passage ou une aggravation des restrictions d'ici la fin de l'étiage est jugé ` +
        `« ${a.label.toLowerCase()} » (indice ${num(a.index)}/100). Ce sont des conditions propices, ` +
        `pas une prévision de l'arrêté.`,
      ton: a.index >= 70 ? "alerte" : a.index >= 45 ? "attention" : "neutre",
      ancre: "anticipation",
    });
  }

  // --- 4. 2050 -------------------------------------------------------------
  if (input.vcn10Delta2050 !== undefined) {
    const d = input.vcn10Delta2050;
    const sens = d < 0 ? "baisse" : "hausse";
    lignes.push({
      id: "trajectoire",
      titre: "Horizon 2050",
      texte:
        `À la trajectoire de référence +2,7 °C, l'étiage estival du bassin de ce site est projeté ` +
        `en ${sens} de ${nf.format(Math.abs(Math.round(d * 10) / 10))} %` +
        (input.interruption?.horizon2050 !== undefined && input.interruption.anneeType !== undefined
          ? `, ce qui porterait les jours contraints de ${num(input.interruption.anneeType)} à ${num(
              input.interruption.horizon2050,
            )} par an.`
          : ".") +
        " C'est une tendance, pas une prévision.",
      ton: d <= -15 ? "alerte" : d < 0 ? "attention" : "neutre",
      ancre: "horizon-2050",
    });
  }

  // --- 5. The physical state, right now ------------------------------------
  // Precursors: they degrade before the decrees tighten. Listed only when
  // measured — an absent station is not a healthy one.
  {
    const p = input.physique;
    const parts: string[] = [];
    // The labels already name their own subject ("Nappe proche des normales
    // (IPS)"), so prefixing them repeated the word — and lower-casing them
    // turned the IPS acronym into "ips". They are quoted as published.
    if (p?.nappe?.label) parts.push(p.nappe.label);
    if (p?.debit?.label) parts.push(p.debit.label);
    if (p?.sol?.label) parts.push(p.sol.label);
    if (p?.onde && p.onde.stations > 0) {
      parts.push(
        `Assecs ${num(p.onde.score)}/100 sur ${num(p.onde.stations)} station${plural(
          p.onde.stations,
        )} du réseau Onde`,
      );
    }
    if (parts.length > 0) {
      lignes.push({
        id: "physique",
        titre: "État de la ressource",
        texte: `Mesures publiques les plus proches — ${parts.join(" · ")}.`,
        ton: "neutre",
        ancre: "anticipation",
      });
    }
  }

  // --- 6. What is not known — always last, never omitted -------------------
  {
    const manques: string[] = [];
    // A source still in flight is skipped entirely: it is neither a gap nor a
    // fact yet, and the progress bar is what reports it.
    const attend = (src: SyntheseSource) => input.enAttente?.includes(src) ?? false;
    if (input.statutIndisponible) manques.push("le statut réglementaire n'a pas pu être lu");
    if (!attend("historique") && (input.anneesCompletes === undefined || input.anneesCompletes === 0)) {
      manques.push("aucune année complète d'historique d'arrêtés n'est disponible pour cette zone");
    }
    if (!attend("interruption") && input.interruption?.anneeType === undefined) {
      manques.push("les jours d'activité contrainte n'ont pas pu être estimés");
    }
    if (!attend("projection") && input.vcn10Delta2050 === undefined) {
      manques.push("la projection 2050 n'est pas disponible pour ce bassin");
    }
    // The declared volume is the one gap the reader can close themselves, and
    // it never depends on a request — so it is never suppressed.
    if (input.interne?.volumeM3 === undefined) {
      manques.push("le volume prélevé du site n'est pas renseigné, donc rien n'est converti en m³");
    }
    if (!attend("mesures") && !input.physique?.nappe && !input.physique?.debit) {
      manques.push("aucune station de mesure rattachée n'a publié d'état exploitable");
    }
    if (manques.length > 0) {
      lignes.push({
        id: "inconnu",
        titre: "Ce que cette synthèse ne sait pas",
        texte: `${manques.join(" ; ")}. Ces manques sont comptés comme non estimés, jamais comme l'absence de risque.`,
        ton: "neutre",
      });
    }
  }

  // --- Headline ------------------------------------------------------------
  // The one sentence to remember, taken from the strongest fact available.
  // Never a generic reassurance when nothing could be computed: an empty
  // analysis that opens on "tout va bien" is the failure mode to avoid.
  let accroche: string | undefined;
  if (input.worst && GRAVITE[input.worst].rank >= GRAVITE.alerte.rank) {
    const info = GRAVITE[input.worst];
    accroche =
      input.interruption?.anneeType !== undefined
        ? `Ce site est en « ${info.label} » aujourd'hui, et perd ${num(
            input.interruption.anneeType,
          )} jour${plural(input.interruption.anneeType)} d'activité par an en moyenne.`
        : `Ce site est en « ${info.label} » aujourd'hui.`;
  } else if (input.interruption?.anneeType !== undefined && input.interruption.anneeType >= 10) {
    accroche = `Ce site n'est pas restreint aujourd'hui, mais l'est ${num(
      input.interruption.anneeType,
    )} jours par an en moyenne.`;
  } else if (input.anticipation && input.anticipation.index >= 55) {
    accroche = `Ce site n'est pas restreint aujourd'hui, mais les conditions d'un passage en restriction sont réunies (${input.anticipation.label.toLowerCase()}).`;
  }

  return { accroche, lignes };
}
