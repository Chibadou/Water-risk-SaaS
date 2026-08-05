"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import AddressAutocomplete from "./AddressAutocomplete";
import Shell from "./Shell";
import {
  DEFAULT_RADIUS_KM,
  LAYERS,
  type LayerKind,
  type MapLayers,
} from "@/lib/carteEau";
import type { GeocodeResult } from "@/lib/types";

// MapLibre touches window at import time — client-only.
const CarteEau = dynamic(() => import("./CarteEau"), {
  ssr: false,
  loading: () => (
    <div className="flex h-140 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-400">
      Chargement de la carte…
    </div>
  ),
});

const RADII_KM = [10, 30, 60] as const;

const ALL_VISIBLE: Record<LayerKind, boolean> = {
  hydro: true,
  piezo: true,
  onde: true,
  bnpe: true,
};

export default function CarteClient() {
  const [centre, setCentre] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  const [layers, setLayers] = useState<MapLayers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<LayerKind, boolean>>(ALL_VISIBLE);
  const [showNappes, setShowNappes] = useState(true);

  const load = useCallback(async (lat: number, lon: number, rayon: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/carte?lat=${lat}&lon=${lon}&rayon=${rayon}`);
      const data = (await res.json()) as MapLayers & { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Impossible de charger les données de la carte.");
        setLayers(null);
        return;
      }
      setLayers(data);
    } catch {
      // Expected in the development sandbox, where egress to the French
      // open-data hosts is blocked (see HANDBOOK §3).
      setError("Services de données injoignables.");
      setLayers(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Every query is triggered by a user gesture — address picked, radius
  // changed, "search here" pressed — never by an effect watching state. That is
  // both what the Next 16 lint rule requires (no synchronous setState in an
  // effect) and one fetch fewer than a state-watching effect would fire.
  const onAddress = (r: GeocodeResult) => {
    setCentre({ lat: r.lat, lon: r.lon, label: r.label });
    void load(r.lat, r.lon, radiusKm);
  };

  const onRadius = (next: number) => {
    setRadiusKm(next);
    if (centre) void load(centre.lat, centre.lon, next);
  };

  const searchHere = useCallback(
    (lat: number, lon: number) => {
      setCentre({ lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` });
      void load(lat, lon, radiusKm);
    },
    [load, radiusKm],
  );

  // Objects, not markers: several structures can share one published position
  // (BNPE commune centroids), and the reader of "Ouvrages (312)" is counting
  // structures. `totals` carries that; `features.length` would count pins.
  const counts = layers?.totals ?? null;
  const messages = layers ? Object.values(layers.messages).filter(Boolean) : [];

  return (
    <Shell>
      <div className="flex flex-col gap-5">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Carte des ressources en eau
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Les points de mesure et de prélèvement autour d&apos;une adresse : stations de débit,
            piézomètres, observations d&apos;assecs, ouvrages déclarés, et l&apos;emprise des nappes
            affleurantes. Cette carte sert à <strong>situer</strong>{" "}
            — elle n&apos;évalue aucun risque et n&apos;entre dans aucun score.
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <AddressAutocomplete
            onSelect={onAddress}
            disabled={loading}
            placeholder="Adresse ou commune, ex. 12 rue de la République, Perpignan"
            ariaLabel="Adresse autour de laquelle chercher"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="shrink-0">Rayon</span>
            <select
              value={radiusKm}
              onChange={(e) => onRadius(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              aria-label="Rayon de recherche autour de l'adresse"
            >
              {RADII_KM.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
          {LAYERS.map((l) => (
            <label
              key={l.kind}
              className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700"
              title={l.hint}
            >
              <input
                type="checkbox"
                checked={visible[l.kind]}
                onChange={(e) => setVisible({ ...visible, [l.kind]: e.target.checked })}
                className="h-4 w-4 accent-sky-600"
              />
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: l.kind === "onde" ? "#fb8c00" : l.color }}
              />
              {l.label}
              {counts && <span className="text-slate-400">({counts[l.kind]})</span>}
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showNappes}
              onChange={(e) => setShowNappes(e.target.checked)}
              className="h-4 w-4 accent-sky-600"
            />
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: "#38bdf8" }}
            />
            Nappes
          </label>
        </div>

        {!centre && (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Saisissez une adresse pour afficher les points de mesure alentour — ou déplacez la carte
            et utilisez « Rechercher dans cette zone ».
          </p>
        )}
        {loading && <p className="text-sm text-slate-500">Chargement des données…</p>}
        {error && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {error}
          </p>
        )}
        {messages.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        <CarteEau
          layers={layers}
          centre={centre ?? undefined}
          visible={visible}
          showNappes={showNappes}
          onSearchHere={searchHere}
        />

        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs leading-relaxed text-slate-500">
          <p className="mb-1 font-semibold text-slate-600">Ce que la carte ne dit pas</p>
          <ul className="list-disc pl-4">
            <li>
              La présence d&apos;une station <strong>ne signifie pas</strong>{" "}
              qu&apos;elle représente votre site : le rattachement hydrologique est fait sur la
              fiche d&apos;analyse, pas à l&apos;œil.
            </li>
            <li>
              Les nappes affichées sont les masses d&apos;eau souterraines <strong>affleurantes</strong>
              , simplifiées à 400 m. Les masses d&apos;eau profondes, sous couverture, ne sont pas
              représentées : leur emprise recouvrirait celle qui affleure réellement.
            </li>
            <li>
              Un ouvrage de prélèvement dessiné en translucide est positionné{" "}
              <strong>au centre de sa commune</strong>{" "}
              — c&apos;est le référentiel BNPE qui le déclare ainsi, pas une approximation de notre
              part.
            </li>
            <li>
              Un ouvrage déclaré n&apos;est pas un volume prélevé : les volumes, quand ils existent,
              sont sur la fiche du site.
            </li>
          </ul>
        </div>
      </div>
    </Shell>
  );
}
