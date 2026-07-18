"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import AddressSearch from "./AddressSearch";
import ResultPanel from "./ResultPanel";
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

export default function HomeClient() {
  const [profil, setProfil] = useState<Profil>("entreprise");
  const [address, setAddress] = useState<GeocodeResult | null>(null);
  const [data, setData] = useState<ZonesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchZones = useCallback(async (addr: GeocodeResult, p: Profil) => {
    setLoading(true);
    setError(null);
    setData(null);
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
      }
    } catch {
      setError("Service injoignable, réessayez dans un instant.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onSelect = useCallback(
    (addr: GeocodeResult) => {
      setAddress(addr);
      void fetchZones(addr, profil);
    },
    [fetchZones, profil],
  );

  const onProfilChange = useCallback(
    (p: Profil) => {
      setProfil(p);
      if (address) void fetchZones(address, p);
    },
    [address, fetchZones],
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💧</span>
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-900">HydroVigie</p>
              <p className="text-xs text-slate-500">
                Risque eau (quantité) par site — France
              </p>
            </div>
          </div>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800">
            Démo — Sprint 1
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <section className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Quel est le niveau de restriction d&apos;eau à l&apos;adresse de votre site ?
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Saisissez une adresse : nous identifions les zones d&apos;alerte sécheresse
            (eaux superficielles, souterraines, eau potable) qui la couvrent et les
            restrictions en vigueur selon votre profil, à partir des données officielles
            VigiEau.
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

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            {loading && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                Consultation des restrictions en cours…
              </div>
            )}
            {!loading && address && data && <ResultPanel address={address} data={data} />}
            {!loading && !data && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-sm text-slate-500">
                <p className="font-medium text-slate-600">Comment ça marche ?</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Recherchez l&apos;adresse d&apos;un site (siège, usine, agence…).</li>
                  <li>
                    L&apos;adresse est géocodée (Base Adresse Nationale) puis croisée avec les
                    zones d&apos;alerte sécheresse VigiEau.
                  </li>
                  <li>
                    Vous obtenez le niveau de gravité par type de ressource et la liste des
                    usages restreints pour votre profil.
                  </li>
                </ol>
              </div>
            )}
          </div>
          <ZonesMap point={address ?? undefined} />
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5 text-xs leading-relaxed text-slate-500">
          <p>
            Sources : restrictions sécheresse{" "}
            <a href="https://vigieau.gouv.fr" className="underline" target="_blank" rel="noopener noreferrer">
              VigiEau
            </a>{" "}
            (Ministère de la Transition écologique, situation mise à jour quotidiennement, j-1) ·
            géocodage{" "}
            <a href="https://adresse.data.gouv.fr" className="underline" target="_blank" rel="noopener noreferrer">
              Base Adresse Nationale
            </a>{" "}
            (Géoplateforme IGN). Données publiées sous Licence Ouverte 2.0.
          </p>
          <p className="mt-1">
            Cet outil est une démonstration : les informations affichées ne se substituent pas
            aux arrêtés préfectoraux en vigueur. Seul le texte de l&apos;arrêté fait foi.
          </p>
        </div>
      </footer>
    </div>
  );
}
