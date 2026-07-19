"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import GraviteBadge from "./GraviteBadge";
import Shell from "./Shell";
import { GRAVITE, graviteInfo, maxGravite } from "@/lib/gravite";
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

const NO_RESTRICTION_COLOR = "#059669";

interface SiteStatus {
  state: "loading" | "ok" | "error";
  zones?: VigieauZone[];
  notCovered?: boolean;
  message?: string;
  worst?: NiveauGravite;
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
            setStatuses((prev) => ({
              ...prev,
              [site.id]: {
                state: "ok",
                zones: body.zones,
                notCovered: body.notCovered,
                message: body.message,
                worst: maxGravite(body.zones.map((z) => z.niveauGravite)),
              },
            }));
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
    const ra = statuses[a.id]?.worst ? GRAVITE[statuses[a.id].worst!].rank : 0;
    const rb = statuses[b.id]?.worst ? GRAVITE[statuses[b.id].worst!].rank : 0;
    return rb - ra || a.label.localeCompare(b.label);
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

  const detailHref = (s: SavedSite) =>
    `/?${new URLSearchParams({ lat: String(s.lat), lon: String(s.lon), label: s.label, profil: s.profil })}`;

  return (
    <Shell>
      <section className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Mes sites</h1>
          <p className="mt-1 max-w-2xl text-slate-600">
            Suivi multi-sites des restrictions sécheresse en vigueur, trié par niveau de gravité.
            Vos sites sont enregistrés localement dans ce navigateur.
          </p>
        </div>
        <div className="flex gap-2">
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
                          {st?.state === "error" && (
                            <p className="mt-0.5 text-xs text-amber-700">{st.message}</p>
                          )}
                          {st?.state === "ok" && st.notCovered && (
                            <p className="mt-0.5 text-xs text-slate-400">Zone non couverte par VigiEau</p>
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
