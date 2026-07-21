"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import GraviteBadge from "./GraviteBadge";
import PortfolioByDepartment, { type PortfolioItem } from "./PortfolioByDepartment";
import Shell from "./Shell";
import { GRAVITE, graviteInfo, maxGravite } from "@/lib/gravite";
import type { HistoryPayload } from "@/lib/history";
import { computeScore, riskClass, scoreColor } from "@/lib/score";
import { departementCode } from "@/lib/departements";
import { buildPortfolioMarkdownReport, portfolioReportFilename, type PortfolioReportSite } from "@/lib/report";
import { secteurInfo } from "@/lib/secteur";
import { useSavedSites, type SavedSite } from "@/lib/sites";
import type { NiveauGravite, VigieauZone, ZoneType, ZonesResponse } from "@/lib/types";

const ZonesMap = dynamic(() => import("./ZonesMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-105 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-400">
      Chargement de la carte…
    </div>
  ),
});

const PortfolioChoropleth = dynamic(() => import("./PortfolioChoropleth"), {
  ssr: false,
  loading: () => (
    <div className="flex h-105 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-400">
      Chargement de la carte…
    </div>
  ),
});

const NO_RESTRICTION_COLOR = "#059669";

interface SiteStatus {
  state: "loading" | "ok" | "error";
  zones?: VigieauZone[];
  notCovered?: boolean;
  message?: string;
  worst?: NiveauGravite;
  /** days in alerte+ this year for the worst covering zone; undefined = unknown */
  joursAlertePlus?: number;
  /** structural mean days/year in alerte+ over the complete years */
  joursAlertePlusMoyen?: number;
  anneesCompletes?: number;
}

/** Dashboard score: regulatory + history components only (physical signals
 *  would cost 2 extra API calls per site; they refine the score on the site page). */
function dashboardScore(st: SiteStatus | undefined): number | undefined {
  if (!st || st.state !== "ok") return undefined;
  return computeScore({
    worst: st.worst,
    joursAlertePlus: st.joursAlertePlus,
    joursAlertePlusMoyen: st.joursAlertePlusMoyen,
    anneesCompletes: st.anneesCompletes,
    hydro: null,
    piezo: null,
  }).score;
}

function zoneOfType(zones: VigieauZone[] | undefined, type: ZoneType): VigieauZone | undefined {
  return zones?.find((z) => z.type === type);
}

function TypeBadge({ zones, type }: { zones?: VigieauZone[]; type: ZoneType }) {
  const zone = zoneOfType(zones, type);
  const info = graviteInfo(zone?.niveauGravite);
  return (
    <span
      title={`${type} — ${info ? info.label : "aucune restriction"}`}
      className={`inline-flex h-6 w-12 items-center justify-center rounded border text-[11px] font-semibold ${
        info ? info.badgeClass : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {type}
    </span>
  );
}

export default function SitesDashboard() {
  const { sites, removeSite, importSites, exportSites } = useSavedSites();
  const [statuses, setStatuses] = useState<Record<string, SiteStatus>>({});
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const site of sites) {
      if (fetchedRef.current.has(site.id)) continue;
      fetchedRef.current.add(site.id);
      setStatuses((prev) => ({ ...prev, [site.id]: { state: "loading" } }));
      const params = new URLSearchParams({
        lon: String(site.lon),
        lat: String(site.lat),
        profil: site.profil,
      });
      fetch(`/api/zones?${params}`)
        .then(async (res) => {
          const body = (await res.json()) as ZonesResponse;
          if (!res.ok && !body.zones?.length && body.message) {
            setStatuses((prev) => ({
              ...prev,
              [site.id]: { state: "error", message: body.message },
            }));
          } else {
            const codes = body.zones
              .flatMap((z) => [z.code, z.id !== undefined ? String(z.id) : undefined])
              .filter((c): c is string => !!c);
            setStatuses((prev) => ({
              ...prev,
              [site.id]: {
                state: "ok",
                zones: body.zones,
                notCovered: body.notCovered,
                message: body.message,
                worst: maxGravite(body.zones.map((z) => z.niveauGravite)),
                joursAlertePlus: codes.length === 0 && !body.notCovered ? 0 : undefined,
              },
            }));
            if (codes.length > 0) {
              try {
                const hres = await fetch(`/api/history?zones=${encodeURIComponent(codes.join(","))}`);
                const hist = (await hres.json()) as HistoryPayload;
                if (hist.available) {
                  const jours = Math.max(0, ...codes.map((c) => hist.zones[c]?.joursAlertePlus ?? 0));
                  // Structural view from the covering zone with the highest mean.
                  let best: HistoryPayload["zones"][string] | undefined;
                  for (const c of codes) {
                    const z = hist.zones[c];
                    if (!z) continue;
                    const zs = z.joursAlertePlusMoyen ?? z.joursAlertePlus;
                    const bs = best ? best.joursAlertePlusMoyen ?? best.joursAlertePlus : -1;
                    if (zs > bs) best = z;
                  }
                  setStatuses((prev) => ({
                    ...prev,
                    [site.id]: {
                      ...prev[site.id],
                      joursAlertePlus: jours,
                      joursAlertePlusMoyen: best?.joursAlertePlusMoyen,
                      anneesCompletes: best?.anneesCompletes,
                    },
                  }));
                }
              } catch {
                // history stays unknown; the score renormalizes without it
              }
            }
          }
        })
        .catch(() => {
          setStatuses((prev) => ({
            ...prev,
            [site.id]: { state: "error", message: "Service injoignable" },
          }));
        });
    }
  }, [sites]);

  const sorted = [...sites].sort((a, b) => {
    const sa = dashboardScore(statuses[a.id]) ?? -1;
    const sb = dashboardScore(statuses[b.id]) ?? -1;
    return sb - sa || a.label.localeCompare(b.label);
  });

  const points = sites.map((s) => {
    const worst = statuses[s.id]?.worst;
    return {
      lon: s.lon,
      lat: s.lat,
      label: s.label,
      color: worst ? GRAVITE[worst].color : NO_RESTRICTION_COLOR,
    };
  });

  const onExport = useCallback(() => {
    const blob = new Blob([exportSites()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hydrovigie-sites.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [exportSites]);

  // CSV export (semicolon + BOM: opens correctly in French Excel).
  const onExportCsv = useCallback(() => {
    const esc = (v: string | number | undefined) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;
    const levelOf = (st: SiteStatus | undefined, type: ZoneType) =>
      st?.zones?.find((z) => z.type === type)?.niveauGravite ?? "";
    const header = [
      "site", "latitude", "longitude", "profil", "secteur", "niveau_global",
      "niveau_sup", "niveau_sou", "niveau_aep", "jours_alerte_plus_annee", "score", "classe_risque",
    ].join(";");
    const lines = sorted.map((s) => {
      const st = statuses[s.id];
      const score = dashboardScore(st);
      return [
        esc(s.label), s.lat, s.lon, esc(s.profil), esc(s.secteur ?? ""),
        esc(st?.worst ?? ""),
        esc(levelOf(st, "SUP")), esc(levelOf(st, "SOU")), esc(levelOf(st, "AEP")),
        st?.joursAlertePlus ?? "", score ?? "",
        score !== undefined ? esc(riskClass(score).label) : "",
      ].join(";");
    });
    const blob = new Blob(["\ufeff" + [header, ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hydrovigie-sites.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted, statuses]);

  // Portfolio ESG report (Markdown) across all saved sites — aggregate risk,
  // geographic breakdown and a per-site table, for CSRD/TNFD disclosure.
  const onExportReport = useCallback(() => {
    const now = new Date();
    const reportSites: PortfolioReportSite[] = sorted.map((s) => ({
      label: s.label,
      dept: departementCode(s.citycode),
      secteur: s.secteur,
      score: dashboardScore(statuses[s.id]),
      worst: statuses[s.id]?.worst,
    }));
    const md = buildPortfolioMarkdownReport({ generatedAt: now, sites: reportSites });
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = portfolioReportFilename(now);
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted, statuses]);

  const onImportFile = useCallback(
    async (file: File) => {
      try {
        const added = importSites(JSON.parse(await file.text()));
        setImportMessage(
          added > 0 ? `${added} site${added > 1 ? "s" : ""} importé${added > 1 ? "s" : ""}.` : "Aucun nouveau site dans ce fichier.",
        );
      } catch {
        setImportMessage("Fichier invalide : export JSON HydroVigie attendu.");
      }
    },
    [importSites],
  );

  const detailHref = (s: SavedSite) => {
    const params = new URLSearchParams({ lat: String(s.lat), lon: String(s.lon), label: s.label, profil: s.profil });
    if (s.citycode) params.set("ccode", s.citycode);
    if (s.secteur) params.set("secteur", s.secteur);
    return `/?${params}`;
  };

  return (
    <Shell>
      <section className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Mes sites</h1>
          <p className="mt-1 max-w-2xl text-slate-600">
            Suivi multi-sites des restrictions sécheresse en vigueur, trié par score de risque
            (statut réglementaire + fréquence des restrictions de l&apos;année). Vos sites sont
            enregistrés localement dans ce navigateur.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExportReport}
            disabled={sites.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
            title="Télécharger un rapport ESG de l'ensemble du portefeuille (Markdown) pour reporting ESRS E3 / TNFD"
          >
            📄 Rapport ESG
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={sites.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={sites.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            Exporter (JSON)
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Importer
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      {importMessage && (
        <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
          {importMessage}
        </p>
      )}

      {sites.length > 0 && (() => {
        const scores = sorted.map((s) => dashboardScore(statuses[s.id])).filter((s): s is number => s !== undefined);
        if (scores.length === 0) return null;
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const maxS = Math.max(...scores);
        const distribution: Record<string, number> = {};
        for (const s of scores) {
          const rc = riskClass(s);
          distribution[rc.label] = (distribution[rc.label] ?? 0) + 1;
        }
        const avgRc = riskClass(avg);
        return (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sites</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{sites.length}</p>
              <p className="text-xs text-slate-400">{scores.length} évalués</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Score moyen</p>
              <p className="mt-1 text-2xl font-bold" style={{ color: scoreColor(avg) }}>{avg}</p>
              <p className={`rounded-sm text-xs font-semibold ${avgRc.badgeClass} inline-block border px-1 py-0.5`}>{avgRc.label}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Score max</p>
              <p className="mt-1 text-2xl font-bold" style={{ color: scoreColor(maxS) }}>{maxS}</p>
              <p className={`rounded-sm text-xs font-semibold ${riskClass(maxS).badgeClass} inline-block border px-1 py-0.5`}>{riskClass(maxS).label}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Répartition</p>
              <div className="mt-1 flex flex-col gap-0.5">
                {Object.entries(distribution).map(([label, count]) => (
                  <span key={label} className="text-xs text-slate-600">
                    {label} : <span className="font-semibold">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {sites.length > 0 && (() => {
        const items = sorted.map<PortfolioItem>((s) => ({
          dept: departementCode(s.citycode),
          score: dashboardScore(statuses[s.id]),
        }));
        // Per-department aggregate for the choropleth (count + average score).
        const deptData: Record<string, { count: number; avg?: number }> = {};
        const acc: Record<string, number[]> = {};
        for (const it of items) {
          if (!it.dept) continue;
          deptData[it.dept] ??= { count: 0 };
          deptData[it.dept].count += 1;
          if (it.score !== undefined) (acc[it.dept] ??= []).push(it.score);
        }
        for (const [dept, scores] of Object.entries(acc)) {
          if (scores.length > 0) deptData[dept].avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        }
        const hasDept = Object.keys(deptData).length > 0;
        return (
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <PortfolioByDepartment items={items} embedded />
            {hasDept && (
              <div>
                <PortfolioChoropleth data={deptData} />
                <p className="mt-2 text-xs text-slate-400">
                  Carte des départements de vos sites, teintés selon le score de risque moyen.
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {sites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
          <p className="text-slate-600">Aucun site enregistré pour le moment.</p>
          <Link
            href="/"
            className="mt-3 inline-block rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
          >
            Rechercher une adresse et l&apos;ajouter
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Site</th>
                    <th
                      className="px-4 py-3 font-semibold"
                      title="Score de risque : statut réglementaire (VigiEau) + fréquence des restrictions de l'année. Les composantes physiques s'ajoutent sur la fiche site."
                    >
                      Score
                    </th>
                    <th className="px-4 py-3 font-semibold">Niveau</th>
                    <th className="px-4 py-3 font-semibold">Zones</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((site) => {
                    const st = statuses[site.id];
                    return (
                      <tr key={site.id} className="hover:bg-slate-50">
                        <td className="max-w-55 px-4 py-3">
                          <Link href={detailHref(site)} className="font-medium text-slate-900 hover:text-sky-700">
                            {site.label}
                          </Link>
                          {site.secteur && (
                            <span className="ml-1.5 text-xs text-slate-400">
                              {secteurInfo(site.secteur)?.icon}
                            </span>
                          )}
                          {st?.state === "error" && (
                            <p className="mt-0.5 text-xs text-amber-700">{st.message}</p>
                          )}
                          {st?.state === "ok" && st.notCovered && (
                            <p className="mt-0.5 text-xs text-slate-400">Zone non couverte par VigiEau</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const score = dashboardScore(st);
                            if (score === undefined)
                              return <span className="text-xs text-slate-400">—</span>;
                            const rc = riskClass(score);
                            return (
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                                  style={{ backgroundColor: scoreColor(score) }}
                                  title={
                                    st?.joursAlertePlus !== undefined
                                      ? `${st.joursAlertePlus} j en alerte ou plus cette année`
                                      : "historique indisponible — score réglementaire seul"
                                  }
                                >
                                  {score}
                                </span>
                                <span
                                  className={`hidden rounded border px-1.5 py-0.5 text-[10px] font-semibold sm:inline ${rc.badgeClass}`}
                                >
                                  {rc.label}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {!st || st.state === "loading" ? (
                            <span className="text-xs text-slate-400">Chargement…</span>
                          ) : st.state === "error" ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <GraviteBadge niveau={st.worst} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {st?.state === "ok" && !st.notCovered ? (
                            <div className="flex gap-1">
                              <TypeBadge zones={st.zones} type="SUP" />
                              <TypeBadge zones={st.zones} type="SOU" />
                              <TypeBadge zones={st.zones} type="AEP" />
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              removeSite(site.id);
                              fetchedRef.current.delete(site.id);
                            }}
                            className="text-xs font-medium text-slate-400 hover:text-red-600"
                            aria-label={`Supprimer ${site.label}`}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Les niveaux affichés par type de zone : SUP (eaux superficielles), SOU (eaux
              souterraines), AEP (eau potable). Passez la souris sur un badge pour le détail.
            </p>
          </div>
          <div className="lg:col-span-2">
            <ZonesMap points={points} />
          </div>
        </div>
      )}
    </Shell>
  );
}
