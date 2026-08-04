"use client";

import type { PortfolioResult } from "@/lib/portefeuille";

// The block that answers "how many of my sites stop on the same day". Three
// readings, in decreasing order of how directly they drive a decision: the
// replayed distribution, the worst episode, and the clusters that a single
// decree constrains together.

const nf = new Intl.NumberFormat("fr-FR");
const num = (v: number) => nf.format(Math.round(v));
const plural = (n: number, s = "s") => (n > 1 ? s : "");

function dateFr(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  const mois = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
  ];
  return `${Number(d)} ${mois[Number(m) - 1]} ${y}`;
}

/**
 * Days per year spent with k sites constrained at once, k ≥ 1.
 *
 * Index 0 is dropped on purpose: "days when nothing happened" would dwarf every
 * other bar and hide the shape the reader came for.
 */
function Distribution({ p }: { p: PortfolioResult }) {
  const { distribution, annees } = p.simultaneite;
  const years = annees.length || 1;
  const bars = distribution
    .map((jours, k) => ({ k, parAn: jours / years }))
    .filter((b) => b.k >= 1 && b.parAn > 0);
  if (bars.length === 0) return null;
  const max = Math.max(...bars.map((b) => b.parAn));

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Sites contraints simultanément
      </h4>
      <p className="mt-0.5 text-xs text-slate-400">
        Jours par an, moyenne rejouée sur {num(years)} année{plural(years)} complète{plural(years)}.
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {bars.map((b) => (
          <li key={b.k} className="flex items-center gap-2 text-xs">
            <span className="w-14 shrink-0 text-right tabular-nums text-slate-600">
              {b.k} site{plural(b.k)}
            </span>
            <span className="h-4 flex-1 overflow-hidden rounded-sm bg-slate-100">
              <span
                className="block h-full rounded-sm"
                style={{
                  width: `${Math.max(2, (b.parAn / max) * 100)}%`,
                  // One hue, deepening with k: the bars are one quantity read at
                  // several levels, not distinct categories.
                  backgroundColor: `hsl(200 85% ${Math.max(28, 68 - (b.k / bars.length) * 34)}%)`,
                }}
              />
            </span>
            <span className="w-16 shrink-0 tabular-nums text-slate-500">
              {b.parAn >= 10 ? num(b.parAn) : Math.round(b.parAn * 10) / 10} j/an
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PortfolioCorrelation({ portefeuille }: { portefeuille: PortfolioResult }) {
  const p = portefeuille;
  const s = p.simultaneite;
  if (!s.available) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Corrélation entre vos sites</h3>
        <p className="mt-2 text-sm text-slate-500">{s.message}</p>
      </section>
    );
  }

  const zone = p.concentration.find((c) => c.cle === "zone");
  const grappes = p.grappes.filter((g) => g.type === "zone").slice(0, 4);
  const aggravants = [...p.correlations]
    .filter((c) => c.jours > 0 && c.partSimultanee !== undefined)
    .sort((a, b) => (b.partSimultanee ?? 0) - (a.partSimultanee ?? 0));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Corrélation entre vos sites</h3>
      <p className="mt-1 text-xs text-slate-500">
        Ce que la somme des jours ne dit pas : combien de sites sont freinés{" "}
        <strong className="font-semibold">le même jour</strong>. Rejoué sur les arrêtés réellement
        publiés des zones dont dépendent vos sites, sur {num(s.annees.length)} année
        {plural(s.annees.length)} complète{plural(s.annees.length)} ({s.annees[0]}–
        {s.annees.at(-1)}).
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <Distribution p={p} />

        <div className="flex flex-col gap-4">
          {s.pic && s.pic.sites >= 1 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pire épisode rejoué
              </p>
              <p className="mt-1 text-sm text-slate-800">
                <strong className="tabular-nums">{num(s.pic.sites)}</strong> site
                {plural(s.pic.sites)} sur {num(s.sitesRejoues)} contraint{plural(s.pic.sites)} en
                même temps, <strong className="tabular-nums">{num(s.pic.jours)}</strong> jour
                {plural(s.pic.jours)} d&apos;affilée à partir du {dateFr(s.pic.debut)}.
              </p>
              {s.picPondere !== undefined && s.picPondere > 0 && (
                <p
                  className="mt-1 text-xs text-slate-500"
                  title="Les sites du pic pondérés par la part d'activité que les mesures prescrites bloquent réellement, et par la dépendance déclarée du site à l'eau."
                >
                  Soit l&apos;équivalent de{" "}
                  <strong className="tabular-nums">{nf.format(s.picPondere)}</strong> site
                  {s.picPondere > 1 ? "s" : ""} à l&apos;arrêt.
                </p>
              )}
              {s.anneePire && (
                <p className="mt-1 text-xs text-slate-500">
                  Année la plus lourde : <strong>{s.anneePire.annee}</strong>,{" "}
                  {num(s.anneePire.siteJours)} site-jours cumulés.
                </p>
              )}
            </div>
          )}

          {zone && zone.sites > 1 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Concentration
              </p>
              <p className="mt-1 text-sm text-slate-800">
                {num(zone.sites)} sites sur {num(zone.groupes)} zone{plural(zone.groupes)}{" "}
                d&apos;alerte, soit{" "}
                <strong className="tabular-nums">{nf.format(zone.effectifs)}</strong> zone
                {zone.effectifs >= 2 ? "s" : ""} indépendante{zone.effectifs >= 2 ? "s" : ""}{" "}
                <span
                  className="text-slate-400"
                  title="Inverse de l'indice de Herfindahl-Hirschman calculé sur la répartition de vos sites entre zones d'alerte. Plus le chiffre est bas, plus un même arrêté touche une grande part du parc."
                >
                  (équivalent)
                </span>
                .
              </p>
              {p.concentration
                .filter((c) => c.cle !== "zone" && c.sites > 1)
                .map((c) => (
                  <p key={c.cle} className="mt-0.5 text-xs text-slate-500">
                    Par {c.label} : {num(c.groupes)} groupe{plural(c.groupes)},{" "}
                    {nf.format(c.effectifs)} équivalent{c.effectifs >= 2 ? "s" : ""} indépendant
                    {c.effectifs >= 2 ? "s" : ""}.
                  </p>
                ))}
            </div>
          )}
        </div>
      </div>

      {grappes.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sites qu&apos;un seul arrêté contraint ensemble
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {grappes.map((g) => (
              <li key={`${g.type}-${g.cle}`} className="text-sm text-slate-700">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                  {g.cle}
                </span>{" "}
                {g.labels.join(", ")}
                {g.joursContraints !== undefined && (
                  <span className="text-slate-400">
                    {" "}
                    — {num(g.joursContraints)} j/an cumulés
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {aggravants.length >= 2 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Part des jours contraints partagés avec le reste du parc
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Un site jamais contraint en même temps que les autres diversifie le portefeuille ; un
            site toujours contraint avec eux concentre le risque.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {aggravants.map((c) => (
              <li key={c.id} className="text-xs text-slate-600">
                {c.label} :{" "}
                <strong className="tabular-nums">
                  {Math.round((c.partSimultanee ?? 0) * 100)} %
                </strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
