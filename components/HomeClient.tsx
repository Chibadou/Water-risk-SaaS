"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import AddressSearch from "./AddressSearch";
import IndicateursNote from "./IndicateursNote";
import AnticipationPanel from "./AnticipationPanel";
import Projection2050 from "./Projection2050";
import ResultPanel from "./ResultPanel";
import SectorImpactPanel from "./SectorImpactPanel";
import TransitionRiskPanel from "./TransitionRiskPanel";
import BnpePanel from "./BnpePanel";
import RessourcePanel from "./RessourcePanel";
import Landing from "./Landing";
import RestrictionHistory from "./RestrictionHistory";
import ScorePanel from "./ScorePanel";
import Shell from "./Shell";
import SiteSummary from "./SiteSummary";
import SiteToc, { type TocItem } from "./SiteToc";
import SourceProgress, { type SourceState } from "./SourceProgress";
import Panel from "./ui/Panel";
import SiteIndicators, { type IndicatorSummary } from "./SiteIndicators";
import InterruptionPanel, {
  type InterruptionSummary,
  type RestrictionsPayload,
} from "./InterruptionPanel";
import { maxGravite } from "@/lib/gravite";
import { levelForOrigin } from "@/lib/vigieau";
import { computeAnticipation } from "@/lib/anticipation";
import { computeInterruption, type InterruptionResult } from "@/lib/interruption";
import { buildSiteSummary, type SyntheseSource } from "@/lib/synthese";
import { DEFAULT_DEPENDANCE, DEFAULT_ORIGINE, DEPENDANCES, ORIGINES, zoneTypeForOrigine } from "@/lib/exposition";
import { departementCode } from "@/lib/departements";
import type { HistoryPayload, YearHistory } from "@/lib/history";
import { DEFAULT_SECTEUR, SECTEURS, profilForSecteur, secteurForProfil } from "@/lib/secteur";
import { buildMarkdownReport, reportFilename } from "@/lib/report";
import { reportPrintHtml } from "@/lib/reportHtml";
import {
  siteKey,
  useSavedSites,
  type Dependance,
  type DonneesInternes,
  type OrigineEau,
  type Secteur,
  type ResponseType,
  type SiteUsage,
} from "@/lib/sites";
import type { GeocodeResult, NiveauGravite, Profil, ZonesResponse, ZoneType } from "@/lib/types";
import type { ProjectionPayload } from "@/lib/projectionsShared";

// MapLibre touches window at import time — client-only.
const ZonesMap = dynamic(() => import("./ZonesMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-105 w-full items-center justify-center rounded-xl border border-line bg-slate-100 text-sm text-ink-subtle">
      Chargement de la carte…
    </div>
  ),
});

const PROFILS: Profil[] = ["particulier", "entreprise", "collectivite", "exploitation"];

// The five chapters of the site sheet, in the order a reader needs them: what
// the law says today, what it costs, what is coming, what 2050 looks like, and
// the territory around it. Before this ordering the sheet answered its own H1
// in FOURTH position, under three blocks of modelling.
const CHAPITRES: TocItem[] = [
  { id: "situation", label: "Situation réglementaire" },
  { id: "impact", label: "Impact sur l'activité" },
  { id: "anticipation", label: "Anticipation" },
  { id: "horizon-2050", label: "Horizon 2050" },
  { id: "ressource", label: "Ressource et transition" },
];

// Deep-linking: /?lat=…&lon=…&label=…&secteur=… pre-fills the lookup (used by
// the dashboard's detail links; also makes results shareable). The sector is
// the single user-facing control now; the VigiEau profil is derived from it.
// Legacy links carry only `profil` — we infer the sector back from it.
function parseInitialParams(searchParams: URLSearchParams): {
  address: GeocodeResult | null;
  secteur: Secteur;
  origine: OrigineEau;
  dependance: Dependance;
} {
  const s = searchParams.get("secteur");
  let secteur: Secteur | undefined = SECTEURS.some((x) => x.id === s) ? (s as Secteur) : undefined;
  if (!secteur) {
    const p = searchParams.get("profil");
    secteur = p && PROFILS.includes(p as Profil) ? secteurForProfil(p as Profil) : DEFAULT_SECTEUR;
  }
  const o = searchParams.get("origine");
  const origine: OrigineEau = ORIGINES.some((x) => x.id === o) ? (o as OrigineEau) : DEFAULT_ORIGINE;
  const d = searchParams.get("dep");
  const dependance: Dependance = DEPENDANCES.some((x) => x.id === d)
    ? (d as Dependance)
    : DEFAULT_DEPENDANCE;
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return { address: null, secteur, origine, dependance };
  }
  const label = searchParams.get("label") ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  const citycode = searchParams.get("ccode") ?? undefined;
  return { address: { label, lon, lat, citycode }, secteur, origine, dependance };
}

/**
 * Sources that answered nothing because they could NOT BE REACHED. Kept apart
 * from sources that answered and had nothing: only the second says something
 * about the site. Feeds the score's per-component wording and the confidence
 * badge, so an outage is named rather than diluted into a coverage percentage.
 */
function sourcesInjoignables(
  indicators: { hydro?: boolean; piezo?: boolean },
  onde: boolean,
): Array<"hydro" | "piezo" | "onde"> {
  const out: Array<"hydro" | "piezo" | "onde"> = [];
  if (indicators.hydro) out.push("hydro");
  if (indicators.piezo) out.push("piezo");
  if (onde) out.push("onde");
  return out;
}

export default function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sites, addSite } = useSavedSites();

  // Parse the URL once, on first render only (router.replace updates the URL later).
  const [initial] = useState(() =>
    parseInitialParams(new URLSearchParams(searchParams.toString())),
  );

  // Sector is the single user-facing control; the VigiEau profil is derived.
  const [secteur, setSecteur] = useState<Secteur>(initial.secteur);
  const profil = profilForSecteur(secteur);
  // Optional refinements of the constrained-days estimate. Neither enters the
  // composite score — same non-double-counting rule as `secteur`.
  const [origine, setOrigine] = useState<OrigineEau>(initial.origine);
  const [dependance, setDependance] = useState<Dependance>(initial.dependance);
  // Figures only the operator holds (volume, storage, cost). Not shared by link:
  // they belong to the company, and a share URL is meant to be pasteable.
  const [interne, setInterne] = useState<DonneesInternes>({});
  // The usage vector (ADR-001). Empty until declared — and an empty vector must
  // read as "not described", never as one usage at 100 %.
  const [usages, setUsages] = useState<SiteUsage[]>([]);
  // Response shape (§4.3). Undefined until declared — `linear` is applied by
  // default inside the engine, and the engine journals that it did.
  const [reponse] = useState<ResponseType | undefined>(undefined);
  const [projection, setProjection] = useState<ProjectionPayload | undefined>(undefined);
  const [address, setAddress] = useState<GeocodeResult | null>(initial.address);
  const [data, setData] = useState<ZonesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Score inputs beyond the zones themselves.
  const [joursAlertePlus, setJoursAlertePlus] = useState<number | undefined>(undefined);
  const [histInfo, setHistInfo] = useState<{
    moyen?: number;
    annees?: number;
    parAnnee?: Record<string, YearHistory>;
    parMois?: Record<string, Record<number, number>>;
    parMoisNiveau?: Record<string, Record<number, Partial<Record<NiveauGravite, number>>>>;
    /** run-length restriction calendar of the governing zone, for the IA episodes */
    periodes?: number[];
    /** mean days per level over the complete years, for the VNP */
    joursParNiveau?: Partial<Record<NiveauGravite, number>>;
  }>({});
  // `histInfo` is {} both before the fetch and after a failed one, so it cannot
  // distinguish pending from settled. The progress bar needs that distinction.
  const [histLoaded, setHistLoaded] = useState(false);
  const [onde, setOnde] = useState<{ score: number; stations: number } | null | undefined>(undefined);
  const [sol, setSol] = useState<
    { score: number; label: string; detail: string; stale?: boolean } | null | undefined
  >(undefined);
  const [indicators, setIndicators] = useState<{
    hydro?: IndicatorSummary | null;
    piezo?: IndicatorSummary | null;
  }>({});
  // Kept beside `indicators`, not inside it: `undefined` there already means
  // EN ATTENTE and `null` means SETTLED-WITHOUT-DATA (sprint 35), so the reason
  // a settled source has no data needs its own slot rather than a third value
  // that would quietly break the pending/absent distinction.
  const [indicatorsInjoignables, setIndicatorsInjoignables] = useState<{
    hydro?: boolean;
    piezo?: boolean;
  }>({});
  const [ondeInjoignable, setOndeInjoignable] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // Reported by InterruptionPanel so the written synthesis can state the same
  // figures its chapter details, without recomputing them.
  const [interruption, setInterruption] = useState<InterruptionSummary | null>(null);
  const onInterruptionResult = useCallback((r: InterruptionSummary | null) => {
    setInterruption(r);
  }, []);
  const initializedRef = useRef(false);

  // Stable, like onIndicatorSummary: it is an effect dependency in Projection2050.
  const onProjection = useCallback((data: ProjectionPayload) => {
    setProjection(data);
  }, []);

  const onIndicatorSummary = useCallback(
    (kind: "hydro" | "piezo", summary: IndicatorSummary | null, reason?: "empty" | "unreachable") => {
      setIndicators((prev) => ({ ...prev, [kind]: summary }));
      setIndicatorsInjoignables((prev) => ({ ...prev, [kind]: reason === "unreachable" }));
    },
    [],
  );

  // Restriction history for the zones covering the site (worst zone drives risk).
  const fetchHistory = useCallback(async (zones: ZonesResponse) => {
    const settle = () => setHistLoaded(true);
    // VigiEau unreachable → the covering zones are unknown, so history is too.
    if (zones.message && zones.zones.length === 0 && !zones.notCovered) {
      setJoursAlertePlus(undefined);
      setHistInfo({});
      settle();
      return;
    }
    // Send both identifiers of each zone: the archives CSV may key zones by
    // code (e.g. 76_34_0011) or by numeric id.
    const codes = zones.zones
      .flatMap((z) => [z.code, z.id !== undefined ? String(z.id) : undefined])
      .filter((c): c is string => !!c);
    if (codes.length === 0) {
      // confirmed absence of covering zone → 0 restriction days
      setJoursAlertePlus(zones.notCovered ? undefined : 0);
      setHistInfo(zones.notCovered ? {} : { moyen: 0, annees: undefined });
      settle();
      return;
    }
    try {
      // `?periodes=1` opts into the run-length calendar (Sprint 26). Measured
      // cost: 271 bytes for 22 runs — the episode structure the IA needs is far
      // cheaper than recomputing it.
      const res = await fetch(
        `/api/history?periodes=1&zones=${encodeURIComponent(codes.join(","))}`,
      );
      const body = (await res.json()) as HistoryPayload;
      if (!body.available) {
        setJoursAlertePlus(undefined);
        setHistInfo({});
        settle();
        return;
      }
      // Only zones the archive actually matched. `?? 0` here used to let a zone
      // absent from the archive contribute a 0 to the max, so a site whose only
      // covering zone was unmatched displayed a confident "0 j en alerte+" —
      // read as "never restricted" instead of "history unreadable for it".
      const matched = codes.map((c) => body.zones[c]?.joursAlertePlus).filter((v) => v !== undefined);
      setJoursAlertePlus(matched.length > 0 ? Math.max(0, ...matched) : undefined);
      // Structural view: keep the covering zone with the highest mean frequency.
      let best: HistoryPayload["zones"][string] | undefined;
      for (const c of codes) {
        const z = body.zones[c];
        if (!z) continue;
        const zScore = z.joursAlertePlusMoyen ?? z.joursAlertePlus;
        const bestScore = best ? best.joursAlertePlusMoyen ?? best.joursAlertePlus : -1;
        if (zScore > bestScore) best = z;
      }
      // Mean days per level over the COMPLETE years only. `parAnnee` also holds
      // the partial current year, and averaging it in would invent calm days —
      // the same denominator rule the days model already follows.
      const annees = best?.anneesCompletes ?? 0;
      let joursParNiveau: Partial<Record<NiveauGravite, number>> | undefined;
      if (best?.parAnnee && annees > 0) {
        const currentYear = new Date().getUTCFullYear();
        const acc: Partial<Record<NiveauGravite, number>> = {};
        for (let y = currentYear - annees; y <= currentYear - 1; y++) {
          const jpn = best.parAnnee[String(y)]?.joursParNiveau;
          if (!jpn) continue;
          for (const [lvl, d] of Object.entries(jpn)) {
            const k = lvl as NiveauGravite;
            acc[k] = (acc[k] ?? 0) + (d ?? 0);
          }
        }
        for (const k of Object.keys(acc) as NiveauGravite[]) {
          acc[k] = (acc[k] ?? 0) / annees;
        }
        if (Object.keys(acc).length > 0) joursParNiveau = acc;
      }
      setHistInfo({
        moyen: best?.joursAlertePlusMoyen,
        annees: best?.anneesCompletes,
        parAnnee: best?.parAnnee,
        parMois: best?.parMois,
        parMoisNiveau: best?.parMoisNiveau,
        periodes: best?.periodes,
        joursParNiveau,
      });
      settle();
    } catch {
      setJoursAlertePlus(undefined);
      setHistInfo({});
      settle();
    }
  }, []);

  // Onde (dry-stream) summary near the site — independent of the zones.
  // Soil moisture: the earliest precursor. Fetched next to Onde, and like it,
  // null means "confirmed unavailable" rather than "not yet loaded".
  const fetchSol = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(`/api/swi?lat=${lat}&lon=${lon}`);
      const body = (await res.json()) as {
        available?: boolean; score?: number; label?: string; detail?: string; stale?: boolean;
      };
      setSol(
        body.available && typeof body.score === "number"
          ? {
              score: body.score,
              label: body.label ?? "",
              detail: body.detail ?? "",
              stale: body.stale === true,
            }
          : null,
      );
    } catch {
      setSol(null);
    }
  }, []);

  const fetchOnde = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(`/api/onde?lat=${lat}&lon=${lon}`);
      const body = (await res.json()) as
        | { available: true; score: number; stations: number }
        | { available: false; serviceIndisponible?: boolean };
      setOnde(body.available ? { score: body.score, stations: body.stations } : null);
      // "No recent campaign nearby" is expected off-season; an outage is not.
      setOndeInjoignable(!body.available && body.serviceIndisponible === true);
    } catch {
      setOnde(null);
      setOndeInjoignable(true);
    }
  }, []);

  const fetchZones = useCallback(async (addr: GeocodeResult, p: Profil) => {
    setLoading(true);
    setError(null);
    setData(null);
    setJoursAlertePlus(undefined);
    setHistInfo({});
    setHistLoaded(false);
    setOnde(undefined);
    setOndeInjoignable(false);
    setSol(undefined);
    setIndicators({});
    setIndicatorsInjoignables({});
    try {
      const params = new URLSearchParams({
        lon: String(addr.lon),
        lat: String(addr.lat),
        profil: p,
      });
      const res = await fetch(`/api/zones?${params}`);
      const body = (await res.json()) as ZonesResponse;
      if (!res.ok && !body.zones) {
        setError(body.message ?? "Erreur lors de la consultation des restrictions");
      } else {
        setData(body);
        if (!res.ok && body.message) setError(body.message);
        void fetchHistory(body);
        void fetchOnde(addr.lat, addr.lon);
        void fetchSol(addr.lat, addr.lon);
      }
    } catch {
      setError("Service injoignable, réessayez dans un instant.");
    } finally {
      setLoading(false);
    }
  }, [fetchHistory, fetchOnde, fetchSol]);

  // Run the lookup once when arriving through a deep link. Deferred to a task
  // so no state is set synchronously inside the effect.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!initial.address) return;
    const addr = initial.address;
    const id = setTimeout(() => void fetchZones(addr, profilForSecteur(initial.secteur)), 0);
    return () => clearTimeout(id);
  }, [fetchZones, initial]);

  // The URL carries the sector (primary) plus the derived profil, so both the
  // new sector-aware view and any legacy profil consumer keep working.
  const buildParams = useCallback(
    (addr: GeocodeResult, sec: Secteur) => {
      const params = new URLSearchParams({
        lat: String(addr.lat),
        lon: String(addr.lon),
        label: addr.label,
        secteur: sec,
        profil: profilForSecteur(sec),
        origine,
        dep: dependance,
      });
      if (addr.citycode) params.set("ccode", addr.citycode);
      return params;
    },
    [origine, dependance],
  );

  const syncUrl = useCallback(
    (addr: GeocodeResult, sec: Secteur) => {
      router.replace(`/?${buildParams(addr, sec).toString()}`, { scroll: false });
    },
    [buildParams, router],
  );

  const onSelect = useCallback(
    (addr: GeocodeResult) => {
      setAddress(addr);
      syncUrl(addr, secteur);
      void fetchZones(addr, profil);
    },
    [fetchZones, profil, secteur, syncUrl],
  );

  // "Origine de l'eau" and "Dépendance à l'eau" silently moved the figures in
  // the chapters below: nothing told the reader the change had been taken into
  // account, nor where. The notice names the chapters it moved and links to
  // them, then clears itself so it never becomes furniture.
  const [recalcul, setRecalcul] = useState<string | null>(null);
  const noteRecalcul = useCallback((quoi: string) => {
    setRecalcul(quoi);
    setTimeout(() => setRecalcul((cur) => (cur === quoi ? null : cur)), 6000);
  }, []);
  const onOrigineChange = useCallback(
    (o: OrigineEau) => {
      setOrigine(o);
      if (data) noteRecalcul("L'origine de l'eau");
    },
    [data, noteRecalcul],
  );
  const onDependanceChange = useCallback(
    (d: Dependance) => {
      setDependance(d);
      if (data) noteRecalcul("La dépendance à l'eau");
    },
    [data, noteRecalcul],
  );

  const onSecteurChange = useCallback(
    (sec: Secteur) => {
      setSecteur(sec);
      if (address) {
        syncUrl(address, sec);
        void fetchZones(address, profilForSecteur(sec));
      }
    },
    [address, fetchZones, syncUrl],
  );

  // Copy a shareable deep link to the current analysis (no account needed —
  // the URL fully encodes the site, so a colleague or auditor can reopen it).
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">("idle");
  const shareLink = useCallback(() => {
    if (!address) return;
    const url = `${window.location.origin}/?${buildParams(address, secteur).toString()}`;
    const done = (ok: boolean) => {
      setShareState(ok ? "copied" : "error");
      setTimeout(() => setShareState("idle"), 2500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
    } else {
      done(false);
    }
  }, [address, buildParams, secteur]);

  // Structured ESG report (ESRS E3 / TNFD) for the current site — Markdown
  // download, or a print-ready HTML tab (browser "Enregistrer au format PDF",
  // no server, no rendering dependency). Assembles the data already on screen
  // and fetches the projection on demand so the report is complete without
  // lifting projection state up.
  const [exporting, setExporting] = useState(false);
  const exportReport = useCallback(async (mode: "md" | "pdf" = "md") => {
    if (!address || !data) return;
    // window.open must run in the synchronous prefix of this handler (before
    // any `await`) or popup blockers treat it as not user-initiated.
    const printWin = mode === "pdf" ? window.open("", "_blank") : null;
    printWin?.document.write(
      '<p style="font-family:sans-serif;padding:2rem;color:#64748b">Génération du rapport…</p>',
    );
    setExporting(true);
    try {
      let projection: ProjectionPayload | undefined;
      try {
        const p = new URLSearchParams({ lat: String(address.lat), lon: String(address.lon) });
        if (address.citycode) p.set("citycode", address.citycode);
        const res = await fetch(`/api/projection?${p}`);
        projection = (await res.json()) as ProjectionPayload;
      } catch {
        projection = undefined;
      }
      // The constrained-days block needs the restriction reference; it is read
      // from embedded data, so this costs no upstream call.
      let interruption: InterruptionResult | undefined;
      try {
        const rp = new URLSearchParams({ profil });
        const dep = address.citycode ? departementCode(address.citycode) : undefined;
        if (dep) rp.set("dep", dep);
        const zt = zoneTypeForOrigine(origine);
        if (zt) rp.set("type", zt);
        const res = await fetch(`/api/restrictions?${rp}`);
        const payload = (await res.json()) as {
          origin?: "restrictions" | "guide";
          exposure?: Partial<Record<NiveauGravite, number>>;
        };
        const anticipation = computeAnticipation({
          worst: levelForOrigin(data.zones, origine).level,
          anneesCompletes: histInfo.annees,
          parMois: histInfo.parMois,
          parAnnee: histInfo.parAnnee,
        });
        const result = computeInterruption({
          worst: levelForOrigin(data.zones, origine).level,
          parAnnee: histInfo.parAnnee,
          parMois: histInfo.parMois,
          parMoisNiveau: histInfo.parMoisNiveau,
          anneesCompletes: histInfo.annees,
          exposure: payload.exposure,
          exposureSource: payload.origin ?? "indisponible",
          dependance,
          anticipationIndex: anticipation.available ? anticipation.index : undefined,
          projection: projection?.data?.["+2.7°C France"]
            ? {
                dtBE: projection.data["+2.7°C France"]["dtBE_yr"],
                vcn10: projection.data["+2.7°C France"]["VCN10_ete"],
              }
            : undefined,
        });
        interruption = result.available ? result : undefined;
      } catch {
        interruption = undefined;
      }

      const zonesByType = (["SUP", "SOU", "AEP"] as ZoneType[])
        .map((type) => {
          const zone = data.zones.find((z) => z.type === type);
          return zone ? { type, niveau: zone.niveauGravite } : null;
        })
        .filter((z): z is { type: ZoneType; niveau: (typeof data.zones)[number]["niveauGravite"] } => z !== null);
      const now = new Date();
      const md = buildMarkdownReport({
        generatedAt: now,
        label: address.label,
        lat: address.lat,
        lon: address.lon,
        citycode: address.citycode,
        profil,
        secteur,
        scoreInputs: {
          worst: data.message && data.zones.length === 0 ? null : maxGravite(data.zones.map((z) => z.niveauGravite)),
          joursAlertePlus,
          joursAlertePlusMoyen: histInfo.moyen,
          anneesCompletes: histInfo.annees,
          onde,
          hydro: indicators.hydro,
          piezo: indicators.piezo,
          indisponibles: sourcesInjoignables(indicatorsInjoignables, ondeInjoignable),
        },
        zonesByType,
        stationDistanceKm: indicators.hydro?.distanceKm ?? indicators.piezo?.distanceKm,
        history: { moyen: histInfo.moyen, annees: histInfo.annees, parMois: histInfo.parMois },
        projection,
        interruption,
      });
      if (mode === "pdf") {
        const html = reportPrintHtml(md, `Rapport HydroVigie — ${address.label}`);
        if (printWin && !printWin.closed) {
          printWin.document.open();
          printWin.document.write(html);
          printWin.document.close();
        } else {
          // Popup blocked → download the printable HTML so the export still works.
          const blob = new Blob([html], { type: "text/html;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = reportFilename(address.label, now).replace(/\.md$/, ".html");
          a.click();
          URL.revokeObjectURL(url);
        }
      } else {
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = reportFilename(address.label, now);
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  }, [
    address,
    data,
    profil,
    secteur,
    joursAlertePlus,
    histInfo,
    onde,
    indicators,
    indicatorsInjoignables,
    ondeInjoignable,
    origine,
    dependance,
  ]);

  const alreadySaved = address
    ? sites.some((s) => s.id === siteKey(address.lon, address.lat))
    : false;

  const saveCurrentSite = useCallback(() => {
    if (!address) return;
    setSaveError(false);
    // origine and dependance are saved alongside the rest: they were being set
    // on this page and then dropped, so the dashboard fell back to "unknown
    // origin, average dependence" for every site — and the constrained-days
    // column silently disagreed with the site page it came from.
    const ok = addSite({
      label: address.label,
      lon: address.lon,
      lat: address.lat,
      citycode: address.citycode,
      profil,
      secteur,
      origine,
      dependance,
      // Persisted only when non-empty: an empty array and an absent field must
      // stay distinguishable, so a legacy site is not upgraded into a described
      // one by the act of opening the form.
      ...(usages.length > 0 ? { usages } : {}),
      ...interne,
    });
    // A storage write can fail (quota, private mode). It used to fail silently:
    // the button stayed on "+ Ajouter à mes sites" and nothing told the user
    // whether the click had registered.
    setSaveError(!ok);
  }, [address, addSite, profil, secteur, origine, dependance, interne, usages]);

  // The restriction reference for this site's profile and zone type. The fetch
  // used to live inside InterruptionPanel, which was fine while that panel was
  // its only consumer — but IndicateursNote needs the SAME payload, and the panel
  // disappears with lib/interruption.ts (G1). Hoisting it here rather than adding
  // a callback out of a component scheduled for deletion: one request, one owner,
  // and the owner outlives the migration.
  //
  // ⚠️ This is the defect the 42a stub check caught: `exposureInterval` was being
  // set from inside `exportReport`, so it stayed undefined until the user
  // exported a report — and the crisis VNP silently had no ρ to apply.
  const [restrictions, setRestrictions] = useState<RestrictionsPayload | null | undefined>(
    undefined,
  );
  const restrictionsDep = address?.citycode ? departementCode(address.citycode) : undefined;
  const restrictionsType = zoneTypeForOrigine(origine);
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const params = new URLSearchParams({ profil });
    if (restrictionsDep) params.set("dep", restrictionsDep);
    if (restrictionsType) params.set("type", restrictionsType);
    fetch(`/api/restrictions?${params}`)
      .then((r) => r.json())
      .then((d: RestrictionsPayload) => {
        if (!cancelled) setRestrictions(d);
      })
      .catch(() => {
        // null is "asked and failed", distinct from the undefined of "not asked
        // yet" — the panel below renders a skeleton for one and a refusal for the
        // other.
        if (!cancelled) setRestrictions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, profil, restrictionsDep, restrictionsType]);

  // The exposure interval, kept apart from the scalar the days model consumes.
  // `exposure` is its lower bound and disappears with lib/interruption.ts.
  const exposureInterval = restrictions?.exposureInterval;

  // The written synthesis. Pure and offline, fed only by state already held
  // here — same rule as computeAnticipation / computeInterruption.
  const statutIndisponible = Boolean(data?.message) && data?.zones.length === 0;
  const worstNiveau =
    data && !statutIndisponible ? maxGravite(data.zones.map((z) => z.niveauGravite)) : undefined;
  const zoneWorst = worstNiveau
    ? data?.zones.find((z) => z.niveauGravite === worstNiveau)
    : undefined;

  const anticipationResult = data
    ? computeAnticipation({
        worst: worstNiveau,
        anneesCompletes: histInfo.annees,
        parMois: histInfo.parMois,
        parAnnee: histInfo.parAnnee,
        nappe:
          indicators.piezo === undefined
            ? undefined
            : indicators.piezo === null
              ? null
              : {
                  score: indicators.piezo.reference?.score,
                  trend: indicators.piezo.trend,
                  higherIsBetter: indicators.piezo.higherIsBetter,
                },
        debit:
          indicators.hydro === undefined
            ? undefined
            : indicators.hydro === null
              ? null
              : {
                  score: indicators.hydro.reference?.score,
                  trend: indicators.hydro.trend,
                  higherIsBetter: indicators.hydro.higherIsBetter,
                },
        onde: onde === undefined ? undefined : onde ? { score: onde.score } : null,
        // A stale soil reading counts as absent, never as a current one.
        sol: sol === undefined ? undefined : sol && !sol.stale ? { score: sol.score } : null,
        stationDistanceKm: indicators.piezo?.distanceKm ?? indicators.hydro?.distanceKm,
      })
    : undefined;

  const synthese = data
    ? buildSiteSummary({
        worst: worstNiveau,
        nonCouvert: data.notCovered,
        statutIndisponible,
        arreteDepuis: zoneWorst?.arrete?.dateDebutValidite,
        joursMoyen: histInfo.moyen,
        anneesCompletes: histInfo.annees,
        interruption: interruption ?? undefined,
        anticipation: anticipationResult?.available
          ? { label: anticipationResult.level.label, index: anticipationResult.index }
          : undefined,
        vcn10Delta2050: projection?.data?.["+2.7°C France"]?.["VCN10_ete"]?.[1] ?? undefined,
        physique: {
          nappe: indicators.piezo?.reference,
          debit: indicators.hydro?.reference,
          sol: sol ?? undefined,
          onde: onde ?? undefined,
        },
        interne,
        // Pending is not missing: without this the gap line asserted "la
        // projection 2050 n'est pas disponible" three seconds into a load that
        // was going to deliver it.
        enAttente: [
          ...(histLoaded ? [] : (["historique"] as SyntheseSource[])),
          ...(interruption === null && !histLoaded ? (["interruption"] as SyntheseSource[]) : []),
          ...(projection === undefined ? (["projection"] as SyntheseSource[]) : []),
          ...(indicators.hydro === undefined || indicators.piezo === undefined
            ? (["mesures"] as SyntheseSource[])
            : []),
        ],
      })
    : undefined;

  const resultsReady = Boolean(address && data && !loading);

  // "ready" means SETTLED, not "succeeded": a source that answered "unavailable"
  // is no longer being waited for, and saying otherwise would leave the bar
  // short of 100 % forever on a site with no nearby station.
  const sources: SourceState[] = [
    { id: "zones", label: "Restrictions VigiEau", ready: data !== null },
    { id: "history", label: "Historique des arrêtés", ready: histLoaded },
    { id: "onde", label: "Assecs Onde", ready: onde !== undefined },
    { id: "sol", label: "Humidité des sols", ready: sol !== undefined },
    { id: "hydro", label: "Débit du cours d'eau", ready: indicators.hydro !== undefined },
    { id: "piezo", label: "Nappe souterraine", ready: indicators.piezo !== undefined },
    { id: "projection", label: "Projection 2050", ready: projection !== undefined },
  ];

  const actions = (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {saveError && (
        <p role="alert" className="w-full text-sm text-amber-700">
          Site non enregistré : le stockage local du navigateur est plein ou indisponible
          (navigation privée). Exportez vos sites en JSON depuis « Mes sites » pour ne rien perdre.
        </p>
      )}
      <button
        type="button"
        onClick={saveCurrentSite}
        disabled={alreadySaved}
        className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
          alreadySaved
            ? "cursor-default bg-emerald-100 text-emerald-800"
            : "bg-sky-600 text-white hover:bg-sky-700"
        }`}
      >
        {alreadySaved ? "✓ Dans mes sites" : "+ Ajouter à mes sites"}
      </button>
      <button
        type="button"
        onClick={shareLink}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-ink-muted shadow-sm transition-colors hover:bg-canvas"
      >
        {shareState === "copied"
          ? "✓ Lien copié"
          : shareState === "error"
            ? "Copie impossible"
            : "🔗 Partager"}
      </button>
      <button
        type="button"
        onClick={() => void exportReport("md")}
        disabled={exporting}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-ink-muted shadow-sm transition-colors hover:bg-canvas disabled:opacity-50"
      >
        {exporting ? "Génération…" : "📄 Rapport ESG"}
      </button>
      <button
        type="button"
        onClick={() => void exportReport("pdf")}
        disabled={exporting}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-ink-muted shadow-sm transition-colors hover:bg-canvas disabled:opacity-50"
      >
        {exporting ? "Génération…" : "🖨️ Version PDF"}
      </button>
    </div>
  );

  return (
    <Shell wide={Boolean(address)}>
      <section className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Quel est le niveau de restriction d&apos;eau à l&apos;adresse de votre site ?
        </h1>
        <p className="mt-2 max-w-3xl text-ink-muted">
          Saisissez une adresse : nous identifions les zones d&apos;alerte sécheresse (eaux
          superficielles, souterraines, eau potable) qui la couvrent et les restrictions en
          vigueur selon votre secteur d&apos;activité, à partir des données officielles VigiEau.
        </p>
      </section>

      <AddressSearch
        secteur={secteur}
        onSecteurChange={onSecteurChange}
        origine={origine}
        onOrigineChange={onOrigineChange}
        dependance={dependance}
        onDependanceChange={onDependanceChange}
        interne={interne}
        onInterneChange={setInterne}
        usages={usages}
        onUsagesChange={setUsages}
        onSelect={onSelect}
        disabled={loading}
      />

      {error && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      )}

      {recalcul && resultsReady && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-sky-200 bg-brand-wash px-4 py-2.5 text-sm text-brand-ink"
        >
          {recalcul} a été modifiée : les chapitres{" "}
          <a href="#impact" className="font-medium underline underline-offset-2">
            Impact sur l&apos;activité
          </a>{" "}
          et{" "}
          <a href="#ressource" className="font-medium underline underline-offset-2">
            Ressource et transition
          </a>{" "}
          ont été recalculés.
        </p>
      )}

      {/* Idle (no search yet): the marketing landing rather than an empty grid. */}
      {!loading && !data && <Landing />}

      {loading && (
        <Panel variant="modele" padding="p-6" className="mt-6 text-sm text-ink-subtle">
          Consultation des restrictions en cours…
        </Panel>
      )}

      {resultsReady && address && data && synthese && (
        <>
          {/* The synthesis first, then the actions: offering to export a report
              before anything has been shown asked the reader to trust a page
              they had not read yet. */}
          <SiteSummary summary={synthese} />
          <SourceProgress sources={sources} />
          {actions}

          <div className="mt-8 grid gap-x-8 gap-y-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
            <SiteToc items={CHAPITRES} />

            {/* `min-w-0`: without it the single implicit column below `lg` is
                sized by the widest chapter, and one of them exceeds the
                container by 18px at 390px — which then stretched the table of
                contents to match and scrolled the whole body sideways. */}
            <div className="flex min-w-0 flex-col gap-10">
              {/* 1 — What the law says today. First, because it is the only
                  chapter stating a fact someone else is accountable for, and
                  because it is what the page's own H1 asks. */}
              <section id="situation" className="scroll-mt-24">
                <h2 className="text-lg font-semibold text-ink">1. Situation réglementaire</h2>
                <div className="mt-4 grid gap-6 lg:grid-cols-2">
                  <div className="flex flex-col gap-4">
                    <ResultPanel address={address} data={data} />
                    <ScorePanel
                      inputs={{
                        worst: statutIndisponible ? null : worstNiveau,
                        joursAlertePlus,
                        joursAlertePlusMoyen: histInfo.moyen,
                        anneesCompletes: histInfo.annees,
                        onde,
                        hydro: indicators.hydro,
                        piezo: indicators.piezo,
                        indisponibles: sourcesInjoignables(indicatorsInjoignables, ondeInjoignable),
                      }}
                      stationDistanceKm={
                        indicators.hydro?.distanceKm ?? indicators.piezo?.distanceKm
                      }
                    />
                  </div>
                  <ZonesMap point={address} />
                </div>
              </section>

              {/* 2 — What it costs. */}
              <section id="impact" className="scroll-mt-24">
                <h2 className="text-lg font-semibold text-ink">2. Impact sur l&apos;activité</h2>
                <InterruptionPanel
                  worst={statutIndisponible ? null : levelForOrigin(data.zones, origine).level}
                  histInfo={histInfo}
                  onde={onde ?? null}
                  sol={sol ?? null}
                  indicators={indicators}
                  dependance={dependance}
                  projection={projection?.data}
                  restrictions={restrictions}
                  onResult={onInterruptionResult}
                />

                {/* G16 — the note's two physical indicators, shown NEXT TO the
                    existing constrained-days figure rather than replacing it, so
                    the old and the new can be compared on the same data before
                    lib/interruption.ts is removed. */}
                <IndicateursNote
                  exposureInterval={exposureInterval}
                  joursParNiveau={histInfo.joursParNiveau}
                  parMoisNiveau={histInfo.parMoisNiveau}
                  anneesCompletes={histInfo.annees}
                  periodes={histInfo.periodes}
                  interne={interne}
                  usages={usages}
                  reponse={reponse}
                />
                <div className="mt-6 flex flex-col gap-4">
                  <SectorImpactPanel secteur={secteur} worst={worstNiveau} />
                  {histInfo.parAnnee && Object.keys(histInfo.parAnnee).length > 0 && (
                    <RestrictionHistory parAnnee={histInfo.parAnnee} parMois={histInfo.parMois} />
                  )}
                </div>
              </section>

              {/* 3 — What is coming, and the physical signals behind it. */}
              <section id="anticipation" className="scroll-mt-24">
                <h2 className="text-lg font-semibold text-ink">3. Anticipation</h2>
                <AnticipationPanel
                  worst={statutIndisponible ? null : worstNiveau}
                  histInfo={histInfo}
                  onde={onde ?? null}
                  sol={sol ?? null}
                  indicators={indicators}
                  lat={address.lat}
                  lon={address.lon}
                />
                <SiteIndicators lat={address.lat} lon={address.lon} onSummary={onIndicatorSummary} />
              </section>

              {/* 4 — The long horizon. */}
              <section id="horizon-2050" className="scroll-mt-24">
                <h2 className="text-lg font-semibold text-ink">4. Horizon 2050</h2>
                <Projection2050
                  onProjection={onProjection}
                  lat={address.lat}
                  lon={address.lon}
                  citycode={address.citycode}
                  joursAlertePlus={joursAlertePlus}
                  joursAlertePlusMoyen={histInfo.moyen}
                />
              </section>

              {/* 5 — The territory the site draws from. */}
              <section id="ressource" className="scroll-mt-24">
                <h2 className="text-lg font-semibold text-ink">5. Ressource et transition</h2>
                <RessourcePanel
                  citycode={address.citycode}
                  origine={origine}
                  volumeSiteM3={interne.volumeM3}
                  ressource={indicators.hydro?.ressource}
                  distanceStationKm={indicators.hydro?.distanceKm}
                />
                <TransitionRiskPanel citycode={address.citycode} secteur={secteur} />
                <BnpePanel citycode={address.citycode} secteur={secteur} origine={origine} />
              </section>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
