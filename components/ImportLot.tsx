"use client";

import { useCallback, useRef, useState } from "react";
import {
  MAX_LIGNES,
  adresseDeLigne,
  construireRapport,
  parserCsv,
  rapportEnCsv,
  verdictPour,
  type CandidatBan,
  type LigneResultat,
  type RapportImport,
} from "@/lib/importLot";
import { couverture } from "@/lib/juridiction";
import type { SavedSite } from "@/lib/sites";
import type { GeocodeResult } from "@/lib/types";

// Batch import of 50 to 500 addresses — "blocage n°1 du produit" since Sprint 26.
// A company with 80 sites could not use the tool at all: sites were added one at a
// time, and the correlation analysis only ever ran on hand-typed parcs.
//
// ⚠️⚠️ The rule that shapes the whole screen: **a silently wrong geocode is worse
// than a missing one.** So nothing is imported without a verdict, ambiguous rows are
// shown separately from failures, and the report is downloadable as CSV so a user
// fixes their file rather than guessing at it.
//
// ⚠️ Geocoding goes through /api/geocode ROW BY ROW, not through the BAN batch CSV
// endpoint. Two reasons: the batch endpoint is a multipart POST that cannot be
// exercised from the sandbox at all, and the per-row route already exists and is
// proven. The cost is one request per row — bounded at 500, sequential in small
// waves so the upstream is not hammered. If a real parc makes that too slow, the
// batch endpoint is the optimisation, and it can be dropped in behind this same
// report.

const VAGUE = 5;

const LIBELLE_VERDICT: Record<LigneResultat["verdict"], string> = {
  resolu: "Résolu",
  ambigu: "À arbitrer",
  hors_perimetre: "Hors France",
  non_resolu: "Adresse introuvable",
  adresse_absente: "Aucune adresse",
};

const TON_VERDICT: Record<LigneResultat["verdict"], string> = {
  resolu: "border-emerald-200 bg-emerald-50 text-emerald-800",
  ambigu: "border-amber-200 bg-amber-50 text-amber-800",
  hors_perimetre: "border-sky-200 bg-sky-50 text-sky-800",
  non_resolu: "border-line-strong bg-canvas text-ink-muted",
  adresse_absente: "border-line-strong bg-canvas text-ink-muted",
};

export default function ImportLot({
  onImport,
}: {
  /** returns how many sites were actually written; -1 when storage failed */
  onImport: (sites: Omit<SavedSite, "id" | "createdAt">[]) => number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rapport, setRapport] = useState<RapportImport | null>(null);
  const [progression, setProgression] = useState<{ fait: number; total: number } | null>(null);
  const [importes, setImportes] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const traiter = useCallback(async (texte: string) => {
    setErreur(null);
    setImportes(null);
    setRapport(null);
    const parse = parserCsv(texte);
    if (parse.lignes.length === 0) {
      setErreur(parse.message ?? "Aucune ligne exploitable dans ce fichier.");
      return;
    }
    setProgression({ fait: 0, total: parse.lignes.length });

    const resultats: LigneResultat[] = [];
    for (let i = 0; i < parse.lignes.length; i += VAGUE) {
      const vague = parse.lignes.slice(i, i + VAGUE);
      const reponses = await Promise.all(
        vague.map(async (l) => {
          const q = adresseDeLigne(l);
          if (!q) return { l, candidats: [] as CandidatBan[] };
          try {
            const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
            const body = (await res.json()) as { results?: GeocodeResult[] };
            return {
              l,
              candidats: (body.results ?? []).map((r) => ({
                label: r.label,
                // ⚠️ `?? 0` and not `?? 1`: a BAN answer with no score is treated as
                // the WEAKEST possible, so it lands in "à arbitrer" rather than
                // being accepted. Defaulting to 1 would auto-accept exactly the
                // answers we know least about.
                score: r.score ?? 0,
                lat: r.lat,
                lon: r.lon,
                citycode: r.citycode,
              })),
            };
          } catch {
            return { l, candidats: [] as CandidatBan[] };
          }
        }),
      );
      for (const { l, candidats } of reponses) {
        resultats.push(
          verdictPour(l, candidats, (lat, lon, citycode) => couverture(lat, lon, citycode).couvert),
        );
      }
      setProgression({ fait: Math.min(i + VAGUE, parse.lignes.length), total: parse.lignes.length });
    }

    setProgression(null);
    setRapport(construireRapport({ parse, resultats }));
  }, []);

  const onFichier = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => void traiter(String(reader.result ?? ""));
      reader.onerror = () => setErreur("Lecture du fichier impossible.");
      reader.readAsText(f, "utf-8");
    },
    [traiter],
  );

  const creer = useCallback(() => {
    if (!rapport) return;
    const sites = rapport.lignes
      .filter((l) => (l.verdict === "resolu" || l.verdict === "hors_perimetre") && l.lat !== undefined)
      .map((l) => ({
        label: l.label,
        lat: l.lat!,
        lon: l.lon!,
        citycode: l.citycode,
        // ⚠️ `entreprise` for every imported site. Reasonable for a professional
        // parc, arbitrary all the same — and it is the profile that decides which
        // VigiEau audience flags apply, so it is not cosmetic. There is no column
        // for it because guessing a sector from a label would be worse.
        profil: "entreprise" as const,
        // The declared figures the file carried. ⚠️ These were parsed and then
        // DROPPED in the first version of this component: the columns were
        // recognised, reported as recognised, and thrown away at creation. An
        // import that silently discards half of what the user provided is a worse
        // failure than one that refuses the column outright.
        ...(l.volumeM3 !== undefined ? { volumeM3: l.volumeM3 } : {}),
        ...(l.coutJourEuros !== undefined ? { coutJourEuros: l.coutJourEuros } : {}),
      }));
    setImportes(onImport(sites));
  }, [rapport, onImport]);

  const telecharger = useCallback(() => {
    if (!rapport) return;
    const blob = new Blob([rapportEnCsv(rapport)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hydrovigie-rapport-import.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [rapport]);

  return (
    <section
      aria-label="Import de sites par lot"
      className="rounded-xl border border-line bg-surface p-4"
    >
      <h2 className="text-sm font-semibold text-ink">Importer un parc de sites (CSV)</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Jusqu&apos;à {MAX_LIGNES} lignes. Colonnes lues :{" "}
        <code className="text-xs">label</code>, <code className="text-xs">adresse</code>,{" "}
        <code className="text-xs">code_postal</code>, <code className="text-xs">ville</code>. Les
        exports Excel français (point-virgule, accents, BOM) sont pris en charge.
      </p>
      <p className="mt-2 text-xs text-ink-subtle">
        ⚠️ Chaque ligne reçoit un <strong>verdict</strong>, et rien n&apos;est créé sans lui. Une
        adresse ambiguë n&apos;est <strong>ni importée ni écartée</strong> : elle vous est rendue pour
        arbitrage. Un rattachement plausible mais faux donne une zone d&apos;alerte plausible et une
        réponse fausse que rien ne distingue d&apos;une bonne.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={onFichier}
          aria-label="Fichier CSV de sites à importer"
          className="text-sm text-ink-muted"
        />
        {progression && (
          <span className="text-sm text-ink-muted" role="status">
            Géocodage {progression.fait} / {progression.total}…
          </span>
        )}
      </div>

      {erreur && <p className="mt-2 text-sm text-amber-700">{erreur}</p>}

      {rapport && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {(Object.keys(LIBELLE_VERDICT) as LigneResultat["verdict"][])
              .filter((v) => rapport.compte[v] > 0)
              .map((v) => (
                <span
                  key={v}
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TON_VERDICT[v]}`}
                >
                  {LIBELLE_VERDICT[v]} : {rapport.compte[v]}
                </span>
              ))}
          </div>

          {rapport.message && <p className="mt-2 text-sm text-amber-700">{rapport.message}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={creer}
              disabled={rapport.importables === 0}
              className="rounded-lg border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-canvas disabled:opacity-50"
            >
              Créer {rapport.importables} site{rapport.importables > 1 ? "s" : ""}
            </button>
            <button
              type="button"
              onClick={telecharger}
              className="rounded-lg border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-canvas"
            >
              Télécharger le rapport (CSV)
            </button>
          </div>
          {rapport.aArbitrer > 0 && (
            <p className="mt-2 text-sm text-amber-800">
              ⚠️ {rapport.aArbitrer} ligne{rapport.aArbitrer > 1 ? "s" : ""} à arbitrer ne ser
              {rapport.aArbitrer > 1 ? "ont" : "a"} <strong>pas</strong> créée
              {rapport.aArbitrer > 1 ? "s" : ""}. Corrigez l&apos;adresse dans votre fichier et
              relancez, ou ajoutez ces sites un par un.
            </p>
          )}
          {importes !== null && (
            <p className="mt-2 text-sm text-ink-muted">
              {importes < 0
                ? "⚠️ L'enregistrement a échoué (stockage plein ou navigation privée) : aucun site n'a été créé."
                : `${importes} site${importes > 1 ? "s" : ""} enregistré${importes > 1 ? "s" : ""}.`}
            </p>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-muted">
              Détail ligne par ligne ({rapport.lignes.length})
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-96 text-sm">
                <caption className="sr-only">Verdict de géocodage pour chaque ligne du fichier</caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-subtle">
                    <th scope="col" className="py-1 pr-2 font-medium">Ligne</th>
                    <th scope="col" className="py-1 pr-2 font-medium">Site</th>
                    <th scope="col" className="py-1 pr-2 font-medium">Verdict</th>
                    <th scope="col" className="py-1 font-medium">Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.lignes.map((l) => (
                    <tr key={l.ligne} className="border-t border-line align-top">
                      <td className="py-1.5 pr-2 tabular-nums text-ink-subtle">{l.ligne}</td>
                      <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink">
                        {l.label}
                      </th>
                      <td className="py-1.5 pr-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TON_VERDICT[l.verdict]}`}
                        >
                          {LIBELLE_VERDICT[l.verdict]}
                        </span>
                      </td>
                      <td className="py-1.5 text-xs text-ink-subtle">{l.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <details className="mt-3 border-t border-line pt-2">
            <summary className="cursor-pointer text-sm font-medium text-ink-muted">
              Ce que cet import suppose ({rapport.hypotheses.length})
            </summary>
            <ul className="mt-2 space-y-1.5 text-xs text-ink-subtle">
              {rapport.hypotheses.map((h, i) => (
                <li key={i}>• {h}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
