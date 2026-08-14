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
// Pure and offline, like `computeAnticipation` and `computeJs`: it
// re-reads state HomeClient already holds and issues no request of its own.

import { GRAVITE } from "./gravite";
import type { ExecutiveTone } from "./executive";
import type { NiveauGravite } from "./types";
import { m3, nombre } from "./format";

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
  /**
   * The note's two physical indicators, per horizon (lib/js + lib/ia + lib/vnp).
   *
   * ⚠️ Replaces the single `joursContraints` scalar per horizon. `jea` is in
   * jours-équivalents d'arrêt, `joursSousArrete` is the JS fact it derives from,
   * and `vnpM3` is the volume. The three are never added together.
   */
  impact?: {
    /** JS: days under an arrêté in a typical year — a published fact */
    joursSousArrete?: number;
    /** IA: jours-équivalents d'arrêt per year, and its upper bound */
    jea?: number;
    jeaMax?: number;
    /** JS for the rest of the current low-water season */
    joursFinSaison?: number;
    /** JS at the 2050 horizon */
    jours2050?: number;
    /** VNP de crise, m³/an, and its upper bound */
    vnpM3?: number;
    vnpM3Max?: number;
    /**
     * ⚠️ Part du volume du site effectivement rapprochée de la nomenclature des
     * arrêtés, 0-1 — c'est-à-dire la part sur laquelle les chiffres ci-dessus
     * portent réellement.
     *
     * Vu en ligne le 2026-08-13 : un site industriel dont 80 % du volume (le
     * refroidissement) ne correspondait à AUCUNE mesure lisait, en tête de page,
     * « perd 0 jour-équivalent d'arrêt par an ». La réserve existait, à l'écran,
     * dans le chapitre 2 — et la synthèse, qu'on lit en premier, l'ignorait.
     * Une phrase de synthèse qui ne connaît pas sa propre couverture est une
     * phrase qui affirme plus que le calcul.
     */
    partVolumeCouverte?: number;
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
export type SyntheseSource = "historique" | "impact" | "projection" | "mesures";

const nf = new Intl.NumberFormat("fr-FR");
// ⚠️ `nombre` plutôt que `Math.round` : un JEA de 0,3 s'écrivait « 0 », donc
// « ce site perd 0 jour-équivalent d'arrêt par an » — vu en ligne le 2026-08-13
// sur un site qui en perdait un peu. Voir lib/format.ts.
const num = nombre;
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

  // --- 2. What it costs the site: JS as the fact, IA and VNP as the figures --
  {
    const i = input.impact;
    if (i?.jea !== undefined || i?.joursSousArrete !== undefined) {
      let texte = "";
      if (i.joursSousArrete !== undefined) {
        texte +=
          `Sur une année type, ce site est sous arrêté ${num(i.joursSousArrete)} jour${plural(
            i.joursSousArrete,
          )} par an — un décompte d'arrêtés publiés, donc un fait.`;
      }
      if (i.jea !== undefined) {
        // ⚠️ The interval is stated whenever it is real. A point figure here
        // would throw away the [0, ρ_max] propagation the whole engine exists for.
        const fourchette =
          i.jeaMax !== undefined && Math.abs(i.jeaMax - i.jea) >= 1
            ? `${num(i.jea)} à ${num(i.jeaMax)}`
            : num(i.jea);
        texte +=
          `${texte ? " " : ""}Converti en interruption d'activité : ${fourchette} ` +
          `jour${plural(i.jeaMax ?? i.jea)}-équivalent${plural(i.jeaMax ?? i.jea)} d'arrêt par an.`;
      }
      if (i.joursFinSaison !== undefined) {
        texte += ` D'ici la fin de l'étiage : ${num(i.joursFinSaison)} jour${plural(i.joursFinSaison)} sous arrêté.`;
      }
      if (i.vnpM3 !== undefined) {
        const f =
          i.vnpM3Max !== undefined && Math.abs(i.vnpM3Max - i.vnpM3) >= 1
            ? `${m3(i.vnpM3)} à ${m3(i.vnpM3Max)}`
            : m3(i.vnpM3);
        texte += ` Volume non prélevable : ${f} par an.`;
      }
      // Euros exist ONLY from a declared cost per day (G6). The 0.5 %-of-revenue
      // fallback that used to sit here was removed: it is anti-pattern n°10 —
      // an all-perils order of magnitude says nothing about drought, and a label
      // saying so does not repair the number.
      const cout = input.interne?.coutJourEuros;
      if (cout !== undefined && cout > 0 && i.jea !== undefined) {
        texte += ` Exposition estimée : ${euros(cout * i.jea)} par an, sur le coût journalier que vous avez renseigné.`;
      }
      // ⚠️ La couverture BORNE la phrase, elle ne l'annule pas. Quand une part
      // du volume ne porte aucune mesure, les chiffres ci-dessus décrivent le
      // reste — et le dire est la différence entre une estimation et une
      // affirmation.
      const couv = i.partVolumeCouverte;
      if (couv !== undefined && couv < 0.999) {
        texte +=
          ` ⚠️ Ces chiffres ne portent que sur ${Math.round(couv * 100)} % du volume du site : ` +
          `le reste est déclaré sous des usages qu'aucune mesure d'arrêté ne nomme. ` +
          `Ce n'est pas un volume épargné, c'est un volume dont on ne sait pas s'il l'est.`;
      }

      const reference = i.jea ?? i.joursSousArrete ?? 0;
      lignes.push({
        id: "impact",
        titre: "Impact sur l'activité",
        texte,
        ton: reference >= 30 ? "alerte" : reference > 0 ? "attention" : "neutre",
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
        (input.impact?.jours2050 !== undefined && input.impact.joursSousArrete !== undefined
          ? `, ce qui porterait les jours sous arrêté de ${num(input.impact.joursSousArrete)} à ${num(
              input.impact.jours2050,
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
    if (!attend("impact") && input.impact?.jea === undefined) {
      manques.push("l'interruption d'activité (JEA) n'a pas pu être estimée");
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
      input.impact?.jea !== undefined
        ? `Ce site est en « ${info.label} » aujourd'hui, et perd ${num(
            input.impact.jea,
          )} jour${plural(input.impact.jea)}-équivalent${plural(input.impact.jea)} d'arrêt par an en moyenne.`
        : `Ce site est en « ${info.label} » aujourd'hui.`;
  } else if (input.impact?.jea !== undefined && input.impact.jea >= 10) {
    accroche = `Ce site n'est pas restreint aujourd'hui, mais l'est ${num(
      input.impact.jea,
    )} jours par an en moyenne.`;
  } else if (input.anticipation && input.anticipation.index >= 55) {
    accroche = `Ce site n'est pas restreint aujourd'hui, mais les conditions d'un passage en restriction sont réunies (${input.anticipation.label.toLowerCase()}).`;
  }

  return { accroche, lignes };
}
