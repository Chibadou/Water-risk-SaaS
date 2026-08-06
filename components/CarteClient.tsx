"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import AddressAutocomplete from "./AddressAutocomplete";
import Shell from "./Shell";
import {
  DEFAULT_RADIUS_KM,
  LAYERS,
  LAYER_GROUPS,
  type LayerId,
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

const ALL_VISIBLE = Object.fromEntries(LAYERS.map((l) => [l.id, true])) as Record<
  LayerId,
  boolean
>;

/** A swatch that matches how the layer is actually drawn on the map. */
function swatch(l: (typeof LAYERS)[number]) {
  if (l.forme === "ligne") {
    return <span className="inline-block h-0.5 w-3 shrink-0" style={{ backgroundColor: l.color }} />;
  }
  if (l.forme === "surface") {
    return (
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: l.color }} />
    );
  }
  // ONDE points are filled by what was observed and ringed by their layer
  // colour, so their swatch shows the ring rather than a plain dot.
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={
        l.id === "onde"
          ? { border: `2px solid ${l.color}`, backgroundColor: "#fb8c00" }
          : { backgroundColor: l.color }
      }
    />
  );
}

export default function CarteClient() {
  const [centre, setCentre] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  const [layers, setLayers] = useState<MapLayers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<LayerId, boolean>>(ALL_VISIBLE);

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
            D&apos;où vient l&apos;eau autour d&apos;une adresse, qui la mesure et qui la prélève.
            Cette carte sert à <strong>situer</strong>{" "}
            — elle n&apos;évalue aucun risque et
            n&apos;entre dans aucun score. Chaque couche est expliquée sous la carte.
          </p>
        </header>

        <div className="flex flex-row items-center gap-2 sm:gap-3">
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

        {/* Grouped by the question each layer answers. A station is not a
            source and a borehole is not one either: one measures, the other
            takes. Flat, the bar said none of that. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 sm:flex sm:flex-row sm:gap-6">
          {LAYER_GROUPS.map((g) => (
            <div key={g.id} className="flex flex-col gap-1">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {g.titre}
              </p>
              {LAYERS.filter((l) => l.groupe === g.id).map((l) => (
                <label
                  key={l.id}
                  className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={visible[l.id]}
                    onChange={(e) => setVisible({ ...visible, [l.id]: e.target.checked })}
                    className="h-4 w-4 accent-sky-600"
                  />
                  {swatch(l)}
                  {l.label}
                  {counts && l.forme === "point" && (
                    <span className="text-slate-400">({counts[l.id as LayerKind]})</span>
                  )}
                </label>
              ))}
            </div>
          ))}
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
          onSearchHere={searchHere}
        />

        {/* What the old map overlay could not be: readable without hiding the
            map. Descriptions live here rather than in `title` tooltips, which
            do not exist on a touch screen — precisely where "c'est quoi un
            piézomètre ?" gets asked. */}
        <section className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Comprendre la carte</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Trois questions, dans l&apos;ordre où on se les pose : où est l&apos;eau, qui la mesure,
            qui la prélève.
          </p>

          <div className="mt-3 flex flex-col gap-4 sm:flex-row">
            {LAYER_GROUPS.map((g) => (
              <div key={g.id} className="flex-1">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {g.titre}
                </p>
                <p className="mb-2 text-xs text-slate-400">{g.sousTitre}</p>
                <ul className="flex flex-col gap-2">
                  {LAYERS.filter((l) => l.groupe === g.id).map((l) => (
                    <li key={l.id} className="text-xs leading-relaxed text-slate-600">
                      <span className="flex items-center gap-1.5 font-medium text-slate-700">
                        {swatch(l)}
                        {l.label}
                      </span>
                      {l.description}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
            <p className="mb-1 font-semibold text-slate-600">Lire les symboles</p>
            <ul className="list-disc pl-4">
              <li>
                Un point <strong>cerclé d&apos;orange</strong>{" "}
                est une observation
                d&apos;écoulement : son remplissage va du vert (écoulement visible) au violet
                (assec).
              </li>
              <li>
                Un point <strong>translucide</strong>{" "}
                est positionné au centre de sa commune, pas
                sur l&apos;ouvrage — c&apos;est le référentiel BNPE qui le déclare ainsi.
              </li>
              <li>
                Un point <strong>numéroté</strong>{" "}
                rassemble plusieurs objets publiés à cette même
                position ; le chiffre est leur nombre et sa popup les liste. Ils ne sont pas écartés
                artificiellement, parce que le référentiel ne dit pas où ils sont vraiment.
              </li>
            </ul>
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
            <p className="mb-1 font-semibold text-slate-600">Ce que la carte ne dit pas</p>
            <ul className="list-disc pl-4">
              <li>
                La présence d&apos;une station <strong>ne signifie pas</strong>{" "}
                qu&apos;elle représente votre site : le rattachement hydrologique est fait sur la
                fiche d&apos;analyse, pas à l&apos;œil.
              </li>
              <li>
                Un ouvrage déclaré n&apos;est pas un volume prélevé, et son{" "}
                <strong>usage n&apos;est pas toujours publié</strong> : « usage non renseigné »
                signifie inconnu, jamais « autre usage ». Un ouvrage sans usage connu peut donc être
                un captage d&apos;eau potable qui ne figure pas dans cette couche.
              </li>
              <li>
                Les nappes affichées sont les masses d&apos;eau souterraines{" "}
                <strong>affleurantes</strong>, simplifiées à 400 m. Les masses d&apos;eau profondes,
                sous couverture, ne sont pas représentées : leur emprise recouvrirait celle qui
                affleure réellement.
              </li>
              <li>
                Les plans d&apos;eau de <strong>moins de 5 hectares</strong>{" "}
                ne sont pas affichés —
                la médiane nationale étant de 1,9 ha, cela écarte l&apos;essentiel des mares et
                étangs de ferme. Leur surface est calculée à partir du contour : le référentiel
                n&apos;en publie aucune.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </Shell>
  );
}
