"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import AddressSearch from "./AddressSearch";
import Projection2050 from "./Projection2050";
import ResultPanel from "./ResultPanel";
import ScorePanel from "./ScorePanel";
import Shell from "./Shell";
import SiteIndicators, { type IndicatorSummary } from "./SiteIndicators";
import { maxGravite } from "@/lib/gravite";
import type { HistoryPayload } from "@/lib/history";
import { siteKey, useSavedSites } from "@/lib/sites";
import type { GeocodeResult, Profil, ZonesResponse } from "@/lib/types";

// MapLibre touches window at import time — client-only.
const ZonesMap = dynamic(() => import("./ZonesMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-105 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-400">
      Chargement de la carte…
    </div>
  ),
});

const PROFILS: Profil[] = ["particulier", "entreprise", "collectivite", "exploitation"];

// Deep-linking: /?lat=…&lon=…&label=…&profil=… pre-fills the lookup
// (used by the dashboard's detail links; also makes results shareable).
function parseInitialParams(searchParams: URLSearchParams): {
  address: GeocodeResult | null;
  profil: Profil;
} {
  const p = searchParams.get("profil");
  const profil: Profil = PROFILS.includes(p as Profil) ? (p as Profil) : "entreprise";
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return { address: null, profil };
  }
  const label = searchParams.get("label") ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  return { address: { label, lon, lat }, profil };
}

export default function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sites, addSite } = useSavedSites();

  // Parse the URL once, on first render only (router.replace updates the URL later).
  const [initial] = useState(() =>
    parseInitialParams(new URLSearchParams(searchParams.toString())),
  );

  const [profil, setProfil] = useState<Profil>(initial.profil);
  const [address, setAddress] = useState<GeocodeResult | null>(initial.address);
  const [data, setData] = useState<ZonesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Score inputs beyond the zones themselves.
  const [joursAlertePlus, setJoursAlertePlus] = useState<number | undefined>(undefined);
  const [indicators, setIndicators] = useState<{
    hydro?: IndicatorSummary | null;
    piezo?: IndicatorSummary | null;
  }>({});
  const initializedRef = useRef(false);

  const onIndicatorSummary = useCallback(
    (kind: "hydro" | "piezo", summary: IndicatorSummary | null) => {
      setIndicators((prev) => ({ ...prev, [kind]: summary }));
    },
    [],
  );

  // Restriction history for the zones covering the site (worst zone drives risk).
  const fetchHistory = useCallback(async (zones: ZonesResponse) => {
    // VigiEau unreachable → the covering zones are unknown, so history is too.
    if (zones.message && zones.zones.length === 0 && !zones.notCovered) {
      setJoursAlertePlus(undefined);
      return;
    }
    // Send both identifiers of each zone: the archives CSV may key zones by
    // code (e.g. 76_34_0011) or by numeric id.
    const codes = zones.zones
      .flatMap((z) => [z.code, z.id !== undefined ? String(z.id) : undefined])
      .filter((c): c is string => !!c);
    if (codes.length === 0) {
      // confirmed absence of covering zone → 0 restriction days this year
      setJoursAlertePlus(zones.notCovered ? undefined : 0);
      return;
    }
    try {
      const res = await fetch(`/api/history?zones=${encodeURIComponent(codes.join(","))}`);
      const body = (await res.json()) as HistoryPayload;
      if (!body.available) {
        setJoursAlertePlus(undefined);
        return;
      }
      const worst = Math.max(0, ...codes.map((c) => body.zones[c]?.joursAlertePlus ?? 0));
      setJoursAlertePlus(worst);
    } catch {
      setJoursAlertePlus(undefined);
    }
  }, []);

  const fetchZones = useCallback(async (addr: GeocodeResult, p: Profil) => {
    setLoading(true);
    setError(null);
    setData(null);
    setJoursAlertePlus(undefined);
    setIndicators({});
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
      }
    } catch {
      setError("Service injoignable, réessayez dans un instant.");
    } finally {
      setLoading(false);
    }
  }, [fetchHistory]);

  // Run the lookup once when arriving through a deep link. Deferred to a task
  // so no state is set synchronously inside the effect.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!initial.address) return;
    const addr = initial.address;
    const id = setTimeout(() => void fetchZones(addr, initial.profil), 0);
    return () => clearTimeout(id);
  }, [fetchZones, initial]);

  const syncUrl = useCallback(
    (addr: GeocodeResult, p: Profil) => {
      const params = new URLSearchParams({
        lat: String(addr.lat),
        lon: String(addr.lon),
        label: addr.label,
        profil: p,
      });
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  const onSelect = useCallback(
    (addr: GeocodeResult) => {
      setAddress(addr);
      syncUrl(addr, profil);
      void fetchZones(addr, profil);
    },
    [fetchZones, profil, syncUrl],
  );

  const onProfilChange = useCallback(
    (p: Profil) => {
      setProfil(p);
      if (address) {
        syncUrl(address, p);
        void fetchZones(address, p);
      }
    },
    [address, fetchZones, syncUrl],
  );

  const alreadySaved = address
    ? sites.some((s) => s.id === siteKey(address.lon, address.lat))
    : false;

  const saveCurrentSite = useCallback(() => {
    if (!address) return;
    addSite({
      label: address.label,
      lon: address.lon,
      lat: address.lat,
      citycode: address.citycode,
      profil,
    });
  }, [address, addSite, profil]);

  return (
    <Shell>
      <section className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Quel est le niveau de restriction d&apos;eau à l&apos;adresse de votre site ?
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Saisissez une adresse : nous identifions les zones d&apos;alerte sécheresse (eaux
          superficielles, souterraines, eau potable) qui la couvrent et les restrictions en
          vigueur selon votre profil, à partir des données officielles VigiEau.
        </p>
      </section>

      <AddressSearch
        profil={profil}
        onProfilChange={onProfilChange}
        onSelect={onSelect}
        disabled={loading}
      />

      {error && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      )}

      {address && data && !loading && (
        <div className="mt-4">
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
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          {loading && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              Consultation des restrictions en cours…
            </div>
          )}
          {!loading && address && data && (
            <div className="flex flex-col gap-4">
              <ScorePanel
                inputs={{
                  worst:
                    data.message && data.zones.length === 0
                      ? null
                      : maxGravite(data.zones.map((z) => z.niveauGravite)),
                  joursAlertePlus,
                  hydro: indicators.hydro,
                  piezo: indicators.piezo,
                }}
              />
              <ResultPanel address={address} data={data} />
            </div>
          )}
          {!loading && !data && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-sm text-slate-500">
              <p className="font-medium text-slate-600">Comment ça marche ?</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Recherchez l&apos;adresse d&apos;un site (siège, usine, agence…).</li>
                <li>
                  L&apos;adresse est géocodée (Base Adresse Nationale) puis croisée avec les zones
                  d&apos;alerte sécheresse VigiEau.
                </li>
                <li>
                  Vous obtenez le niveau de gravité par type de ressource et la liste des usages
                  restreints pour votre profil.
                </li>
                <li>
                  Ajoutez l&apos;adresse à « Mes sites » pour suivre tous vos sites d&apos;un coup
                  d&apos;œil (enregistrement local à votre navigateur).
                </li>
              </ol>
            </div>
          )}
        </div>
        <ZonesMap point={address ?? undefined} />
      </div>

      {address && data && !loading && (
        <>
          <SiteIndicators lat={address.lat} lon={address.lon} onSummary={onIndicatorSummary} />
          <Projection2050 lat={address.lat} lon={address.lon} joursAlertePlus={joursAlertePlus} />
        </>
      )}
    </Shell>
  );
}
