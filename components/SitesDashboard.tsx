"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GraviteBadge from "./GraviteBadge";
import PortfolioByDepartment, { type PortfolioItem } from "./PortfolioByDepartment";
import PortfolioCorrelation from "./PortfolioCorrelation";
import PortfolioExecutiveSummary from "./PortfolioExecutiveSummary";
import Shell from "./Shell";
import { GRAVITE, graviteInfo, maxGravite } from "@/lib/gravite";
import type { HistoryPayload, YearHistory } from "@/lib/history";
import type { ProjectionPayload } from "@/lib/projectionsShared";
import { computeInterruption } from "@/lib/interruption";
import { buildExecutiveSummary, executiveSummaryMarkdown } from "@/lib/executive";
import {
  computePortfolio,
  correlationMarkdown,
  mergePeriodes,
  type PortfolioSiteInput,
} from "@/lib/portefeuille";
import { zoneTypeForOrigine } from "@/lib/exposition";
import { computeScore, riskClass, scoreColor } from "@/lib/score";
import { departementCode } from "@/lib/departements";
import { buildPortfolioMarkdownReport, portfolioReportFilename, type PortfolioReportSite } from "@/lib/report";
import { reportPrintHtml } from "@/lib/reportHtml";
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
  /** per-level day counts, needed to weight days by exposure */
  parAnnee?: Record<string, YearHistory>;
  parMois?: Record<string, Record<number, number>>;
  parMoisNiveau?: Record<string, Record<number, Partial<Record<NiveauGravite, number>>>>;
  /** exposure-weighted constrained days, per horizon */
  joursContraints?: number;
  joursFinSaison?: number;
  jours2050?: number;
  /** exposure by level, kept so the portfolio replay can weight the peak */
  exposure?: Partial<Record<NiveauGravite, number>>;
  /** codes of the zones covering the site, in VigiEau's own identifiers */
  codes?: string[];
  /** identifier of the zone the site actually depends on, for concentration */
  zoneCle?: string;
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
            // Concentration key: the zone the site actually draws from when its
            // origin is known, the worst-level zone otherwise. Sites sharing it
            // share a decree, which is the whole point of the grouping.
            const zt = zoneTypeForOrigine(site.origine);
            const cle =
              (zt ? body.zones.find((z) => z.type === zt) : undefined)?.code ??
              body.zones.find((z) => z.niveauGravite === maxGravite(body.zones.map((x) => x.niveauGravite)))?.code ??
              body.zones[0]?.code;
            setStatuses((prev) => ({
              ...prev,
              [site.id]: {
                state: "ok",
                zones: body.zones,
                notCovered: body.notCovered,
                message: body.message,
                worst: maxGravite(body.zones.map((z) => z.niveauGravite)),
                joursAlertePlus: codes.length === 0 && !body.notCovered ? 0 : undefined,
                codes,
                zoneCle: cle,
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
                      parAnnee: best?.parAnnee,
                      parMois: best?.parMois,
                      parMoisNiveau: best?.parMoisNiveau,
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

  // Constrained days for the portfolio. Exposure is keyed by (department, zone
  // type, profil), so sites sharing a key cost a single call, and both that
  // endpoint and /api/projection read embedded data — no upstream request is
  // involved. The end-of-season horizon needs no fetch at all.
  const exposureCacheRef = useRef<Map<string, Partial<Record<NiveauGravite, number>>>>(new Map());
  const exposureFetchedRef = useRef<Set<string>>(new Set());
  // This effect depends on `statuses`, so it re-runs on every status update.
  // The joursContraints guard alone would not hold while a projection fetch is
  // in flight — the value is still undefined then — so each site is claimed
  // before its async work starts.
  const daysStartedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const site of sites) {
      const st = statuses[site.id];
      if (!st || st.state !== "ok" || !st.parAnnee || st.joursContraints !== undefined) continue;
      if (daysStartedRef.current.has(site.id)) continue;
      const dep = site.citycode ? departementCode(site.citycode) : undefined;
      const zt = zoneTypeForOrigine(site.origine);
      const key = `${dep ?? ""}|${zt ?? ""}|${site.profil}`;

      const apply = async (exposure: Partial<Record<NiveauGravite, number>>) => {
        daysStartedRef.current.add(site.id);
        // The 2050 horizon needs the projection, which /api/projection serves
        // from embedded shards — a local read, not an upstream call, so it is
        // affordable per site unlike the physical signals.
        let projection: { dtBE?: [number | null, number | null, number | null];
                          vcn10?: [number | null, number | null, number | null] } | undefined;
        if (site.citycode) {
          try {
            const res = await fetch(`/api/projection?citycode=${encodeURIComponent(site.citycode)}`);
            const body = (await res.json()) as ProjectionPayload;
            const lvl = body.data?.["+2.7°C France"];
            if (lvl) projection = { dtBE: lvl["dtBE_yr"], vcn10: lvl["VCN10_ete"] };
          } catch {
            projection = undefined;
          }
        }
        const result = computeInterruption({
          parAnnee: st.parAnnee,
          parMois: st.parMois,
          parMoisNiveau: st.parMoisNiveau,
          anneesCompletes: st.anneesCompletes,
          exposure,
          exposureSource: "restrictions",
          dependance: site.dependance,
          // No anticipation index here: it would need hydro, piezo and Onde per
          // site, which the dashboard deliberately does not fetch. The horizon
          // falls back to plain climatology and says so in its own detail line.
          projection,
        });
        const get = (id: string) => {
          const h = result.horizons.find((x) => x.id === id);
          return h?.available ? h.joursContraints : undefined;
        };
        if (!result.available) return;
        setStatuses((prev) => ({
          ...prev,
          [site.id]: {
            ...prev[site.id],
            exposure,
            joursContraints: get("annee_type"),
            joursFinSaison: get("fin_saison"),
            jours2050: get("horizon_2050"),
          },
        }));
      };

      const cached = exposureCacheRef.current.get(key);
      if (cached) {
        void apply(cached);
        continue;
      }
      // Not yet fetched but already claimed by another site sharing the key:
      // that site's response will populate the cache, and this one will pick it
      // up on the next render rather than issuing a duplicate request.
      if (exposureFetchedRef.current.has(key)) continue;
      exposureFetchedRef.current.add(key);
      const params = new URLSearchParams({ profil: site.profil });
      if (dep) params.set("dep", dep);
      if (zt) params.set("type", zt);
      fetch(`/api/restrictions?${params}`)
        .then((r) => r.json())
        .then((d: { exposure?: Partial<Record<NiveauGravite, number>> }) => {
          if (!d.exposure) return;
          exposureCacheRef.current.set(key, d.exposure);
          void apply(d.exposure);
        })
        .catch(() => {
          // Exposure stays unknown; the column shows a dash rather than 0.
        });
    }
  }, [sites, statuses]);

  // Restriction calendars for the whole parc, in ONE request. The days above
  // are a per-site figure; simultaneity is not — it only exists across sites, so
  // it needs the calendar rather than the totals. /api/history already accepts
  // up to 100 zone codes and serves them from the same parsed CSV, so the union
  // of the parc's zones costs a single call whatever the number of sites.
  const [periodesParZone, setPeriodesParZone] = useState<Record<string, number[]>>({});
  // First year the arrêtés file covers. Needed as the replay's denominator:
  // VigiEau redraws its zone referential, so a code in force today has no
  // history before it existed, and dating the window from the first decree
  // would divide per-year figures by far too few years.
  const [couvertureDepuis, setCouvertureDepuis] = useState<number | undefined>(undefined);
  const periodesFetchedRef = useRef<string>("");

  useEffect(() => {
    const codes = Array.from(
      new Set(sites.flatMap((s) => statuses[s.id]?.codes ?? [])),
    ).slice(0, 100);
    if (codes.length === 0) return;
    const key = codes.join(",");
    if (periodesFetchedRef.current === key) return;
    periodesFetchedRef.current = key;
    let cancelled = false;
    fetch(`/api/history?zones=${encodeURIComponent(key)}&periodes=1`)
      .then((r) => r.json())
      .then((hist: HistoryPayload) => {
        if (cancelled || !hist.available) return;
        const out: Record<string, number[]> = {};
        for (const c of codes) {
          const p = hist.zones[c]?.periodes;
          if (p && p.length > 0) out[c] = p;
        }
        const from = hist.diag?.coverage?.from;
        if (from) setCouvertureDepuis(Number(from.slice(0, 4)));
        setPeriodesParZone(out);
      })
      .catch(() => {
        // Calendars stay unknown: the correlation block says so rather than
        // showing an empty chart that would read as "no simultaneity".
      });
    return () => {
      cancelled = true;
    };
  }, [sites, statuses]);

  const portefeuille = useMemo(() => {
    const inputs: PortfolioSiteInput[] = sites.map((s) => {
      const st = statuses[s.id];
      // A site covered by several zones is constrained by the worst of them on
      // any given day — the same rule the site page applies to its own status.
      const periodes = mergePeriodes((st?.codes ?? []).map((c) => periodesParZone[c]));
      return {
        id: s.id,
        label: s.label,
        periodes: periodes.length > 0 ? periodes : undefined,
        exposure: st?.exposure,
        dependance: s.dependance,
        joursContraints: st?.joursContraints,
        volumeM3: s.volumeM3,
        coutJourEuros: s.coutJourEuros,
        caAnnuelEuros: s.caAnnuelEuros,
        autonomieJours: s.autonomieJours,
        zoneCle: st?.zoneCle,
        departement: departementCode(s.citycode),
      };
    });
    return computePortfolio({ sites: inputs, couvertureDepuis });
  }, [sites, statuses, periodesParZone, couvertureDepuis]);

  const sorted = [...sites].sort((a, b) => {
    const sa = dashboardScore(statuses[a.id]) ?? -1;
    const sb = dashboardScore(statuses[b.id]) ?? -1;
    return sb - sa || a.label.localeCompare(b.label);
  });

  const summary = useMemo(() => {
    const evalues = sorted.filter((s) => dashboardScore(statuses[s.id]) !== undefined);
    const jours = sorted
      .map((s) => statuses[s.id]?.joursContraints)
      .filter((v): v is number => v !== undefined);
    // Like-for-like: the 2050 total only sums sites estimated on BOTH horizons,
    // so the comparison is a trajectory and not a change of population.
    const pairs = sorted
      .map((s) => statuses[s.id])
      .filter((x): x is NonNullable<typeof x> =>
        x?.joursContraints !== undefined && x?.jours2050 !== undefined);
    const scores = evalues
      .map((s) => dashboardScore(statuses[s.id]))
      .filter((v): v is number => v !== undefined);
    const rank = (n: NiveauGravite | undefined) => (n ? GRAVITE[n].rank : 0);
    return buildExecutiveSummary({
      sites: sites.length,
      sitesEvalues: evalues.length,
      sitesEnRestriction: sorted.filter((s) => rank(statuses[s.id]?.worst) >= GRAVITE.alerte.rank).length,
      sitesEnAlerteForte: sorted.filter(
        (s) => rank(statuses[s.id]?.worst) >= GRAVITE.alerte_renforcee.rank,
      ).length,
      scoreMoyen: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : undefined,
      scoreMax: scores.length > 0 ? Math.max(...scores) : undefined,
      joursContraintsTotal: jours.length > 0 ? jours.reduce((a, b) => a + b, 0) : undefined,
      joursContraintsSites: jours.length,
      joursContraints2050Base:
        pairs.length > 0 ? pairs.reduce((a, b) => a + (b.joursContraints ?? 0), 0) : undefined,
      jours2050Total: pairs.length > 0 ? pairs.reduce((a, b) => a + (b.jours2050 ?? 0), 0) : undefined,
      portefeuille,
      parSite: sorted.map((s) => ({
        id: s.id,
        label: s.label,
        joursContraints: statuses[s.id]?.joursContraints,
      })),
    });
  }, [sorted, statuses, sites.length, portefeuille]);

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
      "jours_contraints_annee_type", "jours_contraints_2050", "zone_cle",
      "m3_a_risque", "euros_a_risque", "source_euros", "jours_arret_net", "part_simultanee",
    ].join(";");
    const lines = sorted.map((s) => {
      const st = statuses[s.id];
      const score = dashboardScore(st);
      const v = portefeuille.valeur.parSite.find((x) => x.id === s.id);
      const corr = portefeuille.correlations.find((x) => x.id === s.id);
      return [
        esc(s.label), s.lat, s.lon, esc(s.profil), esc(s.secteur ?? ""),
        esc(st?.worst ?? ""),
        esc(levelOf(st, "SUP")), esc(levelOf(st, "SOU")), esc(levelOf(st, "AEP")),
        st?.joursAlertePlus ?? "", score ?? "",
        score !== undefined ? esc(riskClass(score).label) : "",
        st?.joursContraints !== undefined ? Math.round(st.joursContraints) : "",
        st?.jours2050 !== undefined ? Math.round(st.jours2050) : "",
        esc(st?.zoneCle ?? ""),
        // Empty, never 0: a blank cell is "not declared", a zero would assert
        // the site withdraws nothing.
        v?.m3ARisque ?? "", v?.eurosARisque ?? "", esc(v?.eurosSource ?? ""),
        v?.joursArretNet ?? "",
        corr?.partSimultanee !== undefined ? Math.round(corr.partSimultanee * 100) : "",
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
  }, [sorted, statuses, portefeuille]);

  // Portfolio ESG report across all saved sites — aggregate risk, geographic
  // breakdown and a per-site table, for CSRD/TNFD disclosure. Markdown
  // download, or a print-ready HTML tab (browser "Enregistrer au format PDF").
  const onExportReport = useCallback(
    (mode: "md" | "pdf" = "md") => {
      const now = new Date();
      const reportSites: PortfolioReportSite[] = sorted.map((s) => ({
        label: s.label,
        dept: departementCode(s.citycode),
        secteur: s.secteur,
        score: dashboardScore(statuses[s.id]),
        worst: statuses[s.id]?.worst,
        joursContraints: statuses[s.id]?.joursContraints,
        jours2050: statuses[s.id]?.jours2050,
      }));
      const md = buildPortfolioMarkdownReport({
        generatedAt: now,
        sites: reportSites,
        executiveSummary: executiveSummaryMarkdown(summary),
        correlation: correlationMarkdown(portefeuille),
      });
      if (mode === "pdf") {
        const html = reportPrintHtml(md, "Rapport HydroVigie — portefeuille");
        const win = window.open("", "_blank");
        if (win) {
          win.document.open();
          win.document.write(html);
          win.document.close();
          return;
        }
        // Popup blocked → download the printable HTML so the export still works.
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = portfolioReportFilename(now).replace(/\.md$/, ".html");
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = portfolioReportFilename(now);
      a.click();
      URL.revokeObjectURL(url);
    },
    [sorted, statuses, summary, portefeuille],
  );

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
            onClick={() => onExportReport("md")}
            disabled={sites.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
            title="Télécharger un rapport ESG de l'ensemble du portefeuille (Markdown) pour reporting ESRS E3 / TNFD"
          >
            📄 Rapport ESG
          </button>
          <button
            type="button"
            onClick={() => onExportReport("pdf")}
            disabled={sites.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
            title="Ouvrir le rapport portefeuille dans un nouvel onglet imprimable (bouton « Enregistrer en PDF » du navigateur)"
          >
            🖨️ PDF
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

      {sites.length > 0 && <PortfolioExecutiveSummary summary={summary} />}

      {sites.length > 0 && (() => {
        const scores = sorted.map((s) => dashboardScore(statuses[s.id])).filter((s): s is number => s !== undefined);
        if (scores.length === 0) return null;
        // Only sites that could actually be estimated are summed; the rest are
        // reported as not-estimated rather than counted as zero.
        const jours = sorted
          .map((s2) => statuses[s2.id]?.joursContraints)
          .filter((v): v is number => v !== undefined);
        // Only sites estimated on BOTH horizons enter the 2050 comparison, so
        // the two totals stay like-for-like rather than mixing populations.
        const pairs = sorted
          .map((s2) => statuses[s2.id])
          .filter((x): x is NonNullable<typeof x> =>
            x?.joursContraints !== undefined && x?.jours2050 !== undefined);
        const joursStats = {
          total: jours.reduce((a, b) => a + b, 0),
          count: jours.length,
          total2050: pairs.length > 0 ? pairs.reduce((a, b) => a + (b.jours2050 ?? 0), 0) : undefined,
        };
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const maxS = Math.max(...scores);
        const distribution: Record<string, number> = {};
        for (const s of scores) {
          const rc = riskClass(s);
          distribution[rc.label] = (distribution[rc.label] ?? 0) + 1;
        }
        const avgRc = riskClass(avg);
        return (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
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
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Jours contraints
              </p>
              {joursStats.count === 0 ? (
                <p className="mt-1 text-2xl font-bold text-slate-300">—</p>
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                    {Math.round(joursStats.total)}
                  </p>
                  <p className="text-xs text-slate-400">
                    j/an cumulés · {joursStats.count} site{joursStats.count > 1 ? "s" : ""} estimé
                    {joursStats.count > 1 ? "s" : ""}
                  </p>
                  {joursStats.total2050 !== undefined && (
                    <p className="text-xs text-slate-500">
                      → <strong className="tabular-nums">{Math.round(joursStats.total2050)}</strong> j
                      en 2050
                    </p>
                  )}
                </>
              )}
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

      {sites.length > 1 && (
        <div className="mb-6">
          <PortfolioCorrelation portefeuille={portefeuille} />
        </div>
      )}

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
                    <th
                      className="px-4 py-3 font-semibold"
                      title="Jours par an où les restrictions freinent effectivement l'activité, sur une année type. Les jours viennent des arrêtés publiés, leur poids des mesures prescrites."
                    >
                      Jours contraints
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
                          {st?.joursContraints === undefined ? (
                            <span className="text-xs text-slate-300" title="Exposition ou historique indisponible — non estimé plutôt que zéro.">
                              —
                            </span>
                          ) : (
                            <span className="block">
                              <span className="tabular-nums text-sm font-medium text-slate-800">
                                {Math.round(st.joursContraints)}{" "}
                                <span className="text-xs font-normal text-slate-400">j/an</span>
                              </span>
                              <span className="mt-0.5 block text-xs text-slate-400">
                                {st.joursFinSaison !== undefined && (
                                  <span title="Reste de la saison d'étiage, climatologie seule (les signaux physiques ne sont pas chargés sur le tableau de bord).">
                                    saison {Math.round(st.joursFinSaison)} j
                                  </span>
                                )}
                                {st.joursFinSaison !== undefined && st.jours2050 !== undefined && " · "}
                                {st.jours2050 !== undefined && (
                                  <span title="Horizon 2050, trajectoire TRACC +2,7 °C.">
                                    2050 {Math.round(st.jours2050)} j
                                  </span>
                                )}
                              </span>
                            </span>
                          )}
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
                              // Otherwise re-adding the same site would never
                              // recompute its days: the claim would still stand.
                              daysStartedRef.current.delete(site.id);
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
