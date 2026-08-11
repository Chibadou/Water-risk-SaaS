// §5.5 — prediction against reality, on pilot data.
// npx tsx scripts/test/pilote.test.ts
//
// ⚠️ What this suite can prove: that the comparison names the RIGHT DIRECTION of error, that
// it refuses to compute when a term is missing, and that it does not manufacture statistics
// out of five points. It cannot prove anything about the model — no pilot data exists yet,
// and that absence is itself asserted below so a future reader is not misled into thinking
// §5.5 has been done.

import { readFileSync } from "fs";
import {
  GABARIT_PILOTE,
  comparerPilote,
  gabaritCsv,
  synthetiserValidation,
} from "../../lib/pilote";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

// ---- 1. The template asks for little, and says why for each column ----
{
  check("gabarit: every column explains why it is asked for",
    GABARIT_PILOTE.every((c) => c.pourquoi.length > 30));
  // ⚠️ Every column is a reason not to reply. A pilot sending four columns beats one sending
  // nothing because the form asked for twenty.
  check("gabarit: at most 7 columns, so the form gets filled",
    GABARIT_PILOTE.length <= 7);
  check("gabarit: the site's own lost days are OBLIGATORY — the only thing we claim to estimate",
    GABARIT_PILOTE.find((c) => c.cle === "joursArretReels")?.obligatoire === true);
  check("gabarit: the water-attribution share is OPTIONAL but its absence is named",
    GABARIT_PILOTE.find((c) => c.cle === "causeEau")?.obligatoire === false
      && /ne suppose PAS 100 %/.test(GABARIT_PILOTE.find((c) => c.cle === "causeEau")!.pourquoi));

  const csv = gabaritCsv();
  check("gabarit: the CSV expands the monthly volumes into twelve columns",
    csv.includes("volume_01") && csv.includes("volume_12"));
  check("gabarit: … carries one line per site AND per year",
    /une ligne par site ET par année/i.test(csv));
  check("gabarit: … states that an empty field is never a zero",
    /jamais compté comme zéro/.test(csv));
  check("gabarit: … and ships an example row so the format is unambiguous",
    csv.split("\n").filter((l) => l && !l.startsWith("#")).length === 2);
  // ⚠️ THE check this template needed and lacked for one commit. Its own example address
  // contains a comma — French addresses do, by convention — so the row had 19 fields against
  // 18 headers and the file broke in a spreadsheet the moment a pilot opened it. A template
  // that does not survive its own example teaches the wrong format.
  {
    const dataLines = csv.split("\n").filter((l) => l && !l.startsWith("#"));
    // Minimal RFC4180 split: commas inside double quotes are not separators.
    const decouper = (l: string) => {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === '"') q = !q;
        else if (c === "," && !q) { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur);
      return out;
    };
    const entetesN = decouper(dataLines[0]).length;
    const exempleN = decouper(dataLines[1]).length;
    check("gabarit: the example row has exactly as many fields as the header",
      entetesN === exempleN);
    check("gabarit: … and the comma-bearing address is quoted, not mangled",
      /"12 rue de la Fonderie, 28000 Chartres"/.test(csv));
  }
}

// ---- 2. Direction of error, which matters more than its size ----
{
  const sous = comparerPilote({
    site: "A", annee: 2022, jeaPreditMin: 5, jeaPreditMax: 8, joursReels: 30, partEau: 1,
  });
  check("sens: losing more than the upper bound is an UNDERSTATEMENT", sous.sens === "sousestime");
  check("sens: … the factor is against the upper bound, not the middle",
    sous.facteur === 3.75);
  // ⚠️ The asymmetry named explicitly: a client relying on an understatement is caught out.
  check("sens: … and it is called the graver direction",
    /le sens d'erreur le plus grave/.test(sous.detail));

  const sur = comparerPilote({
    site: "B", annee: 2022, jeaPreditMin: 40, jeaPreditMax: 50, joursReels: 4, partEau: 1,
  });
  check("sens: losing less than the lower bound is an overstatement", sur.sens === "surestime");
  check("sens: … measured against the LOWER bound", sur.facteur === 0.1);
  check("sens: … and named as a loss of confidence rather than a danger",
    /perdre la confiance/.test(sur.detail));

  // ⚠️ THE property that protects publishing a range at all. An observation inside the
  // interval is the tool being right; scoring it as (réel − milieu) would punish honesty.
  const dedans = comparerPilote({
    site: "C", annee: 2023, jeaPreditMin: 10, jeaPreditMax: 25, joursReels: 18, partEau: 1,
  });
  check("sens: an observation inside the interval is a SUCCESS, not a near miss",
    dedans.sens === "dans_la_fourchette" && dedans.facteur === undefined);
  check("sens: … and the trail says the interval IS the estimate",
    /la fourchette est l'estimation/.test(dedans.detail));
}

// ---- 3. Missing terms refuse, they do not default ----
{
  const sansPredit = comparerPilote({ site: "D", annee: 2022, joursReels: 12 });
  check("refus: no prediction means incomparable, not an error of zero",
    sansPredit.sens === "incomparable" && /pas un écart de zéro/.test(sansPredit.detail));
  const sansReel = comparerPilote({ site: "E", annee: 2022, jeaPreditMin: 7 });
  check("refus: no declared loss means incomparable too", sansReel.sens === "incomparable");

  // ⚠️ Without an attribution share the observation is used AS IS and flagged — multiplying
  // by an assumed 100 % would credit the tool with days it may have nothing to do with.
  const sansImputation = comparerPilote({
    site: "F", annee: 2022, jeaPreditMin: 5, jeaPreditMax: 6, joursReels: 20,
  });
  check("refus: an unattributed loss is not silently taken as 100 % water",
    sansImputation.joursImputables === 20
      && /part imputable à l'eau n'est pas déclarée/.test(sansImputation.detail));
  check("refus: … and the resulting gap is called a BOUND, not a value",
    /l'écart est une borne/.test(sansImputation.detail));
  // The share is applied when it IS given.
  const impute = comparerPilote({
    site: "G", annee: 2022, jeaPreditMin: 5, jeaPreditMax: 6, joursReels: 20, partEau: 0.5,
  });
  check("refus: a declared share is applied", impute.joursImputables === 10);
}

// ---- 4. Five points do not become statistics ----
{
  const verdicts = [
    comparerPilote({ site: "A", annee: 2022, jeaPreditMin: 5, jeaPreditMax: 8, joursReels: 30, partEau: 1 }),
    comparerPilote({ site: "B", annee: 2022, jeaPreditMin: 10, jeaPreditMax: 25, joursReels: 18, partEau: 1 }),
    comparerPilote({ site: "C", annee: 2022, jeaPreditMin: 40, jeaPreditMax: 50, joursReels: 4, partEau: 1 }),
    comparerPilote({ site: "D", annee: 2022, joursReels: 9 }),
  ];
  const s = synthetiserValidation(verdicts);
  check("synthese: the counts add up to what was passed in",
    s.comparables === 3 && s.incomparables === 1
      && s.sousEstimes + s.surEstimes + s.dansLaFourchette === 3);
  check("synthese: the worst understatement factor is surfaced",
    s.pireFacteurSousEstimation === 3.75);
  check("synthese: the verdict leads with the understatement, not with the average",
    /SOUS-ESTIMÉ/.test(s.verdict));
  // ⚠️ THE constraint. With n=5 a mean error exists arithmetically and means nothing; printing
  // one would lend an air of rigour to an anecdote.
  const texte = JSON.stringify(s);
  check("synthese: no mean, no standard deviation, no p-value anywhere",
    !/moyenne|ecartType|écart-type|pValue|significat/i.test(texte)
      || /aucune signification statistique/.test(texte));
  check("synthese: the n=5 limitation is stated as a limit, not implied",
    s.limites.some((l) => /ne sont pas un échantillon/.test(l)));
  check("synthese: … and that declared days are a company memory, not a log",
    s.limites.some((l) => /mémoire d'entreprise/.test(l)));
  check("synthese: … and that the VNP is NOT validated by this at all",
    s.limites.some((l) => /rien ici ne valide le VNP/i.test(l)));
  check("synthese: an unattributed site adds its own explicit limit",
    synthetiserValidation([
      comparerPilote({ site: "H", annee: 2022, jeaPreditMin: 1, jeaPreditMax: 2, joursReels: 9 }),
    ]).limites.some((l) => /est une BORNE/.test(l)));

  // Nothing comparable must read as "not done", never as a neutral pass.
  const vide = synthetiserValidation([]);
  check("synthese: zero comparable site-years says §5.5 is NOT DONE",
    /NON FAITE/.test(vide.verdict) && /absence de résultat/.test(vide.verdict));

  // No understatement is the MINIMUM, not a success — the wording must not congratulate.
  const propre = synthetiserValidation([
    comparerPilote({ site: "I", annee: 2022, jeaPreditMin: 10, jeaPreditMax: 25, joursReels: 18, partEau: 1 }),
  ]);
  check("synthese: a clean result is called the minimum, not a success",
    /le minimum, pas une réussite/.test(propre.verdict));
}

// ---- 5. And the honest state of §5.5 today ----
{
  // ⚠️ A mirror check on the repo itself. The moment real pilot data lands, someone will ask
  // "has §5.5 been done?" — and the answer must not depend on remembering. No data file
  // exists, so the harness is machinery awaiting input, and the calibration report says so.
  let rapport = "";
  try {
    rapport = readFileSync("data/calibration/report.json", "utf-8");
  } catch {
    rapport = "";
  }
  check("etat: the calibration report still lists §5.5 as not instructed",
    rapport === "" || /§5\.5[^"]*aucun site pilote/.test(rapport));
}

console.log(failures === 0 ? "pilote: all checks pass" : `pilote: ${failures} FAILED`);
if (failures > 0) process.exit(1);
