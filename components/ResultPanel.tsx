"use client";

import { useState } from "react";
import GraviteBadge from "./GraviteBadge";
import { GRAVITE, ZONE_TYPE_LABEL, graviteInfo, maxGravite } from "@/lib/gravite";
import type { GeocodeResult, VigieauZone, ZoneType, ZonesResponse } from "@/lib/types";

const ZONE_ORDER: ZoneType[] = ["SUP", "SOU", "AEP"];

function formatDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function ZoneCard({ zone }: { zone: VigieauZone }) {
  const [showUsages, setShowUsages] = useState(false);
  const typeInfo = zone.type ? ZONE_TYPE_LABEL[zone.type] : undefined;
  const usages = zone.usages ?? [];
  const debut = formatDate(zone.arrete?.dateDebutValidite);
  const fin = formatDate(zone.arrete?.dateFinValidite);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {typeInfo ? typeInfo.long : "Zone d'alerte"}
          </p>
          <h3 className="mt-0.5 font-semibold text-slate-900">
            {zone.nom ?? "Zone sans nom"}
            {zone.code && <span className="ml-2 font-mono text-xs text-slate-400">{zone.code}</span>}
          </h3>
        </div>
        <GraviteBadge niveau={zone.niveauGravite} />
      </div>

      {zone.niveauGravite && graviteInfo(zone.niveauGravite) && (
        <p className="mt-2 text-sm text-slate-600">{GRAVITE[zone.niveauGravite].description}</p>
      )}

      {(debut || fin || zone.arrete?.cheminFichier) && (
        <p className="mt-2 text-sm text-slate-500">
          {debut && (
            <>
              Arrêté en vigueur depuis le <span className="font-medium text-slate-700">{debut}</span>
            </>
          )}
          {fin && <> jusqu&apos;au <span className="font-medium text-slate-700">{fin}</span></>}
          {zone.arrete?.cheminFichier && (
            <>
              {" · "}
              <a
                href={zone.arrete.cheminFichier}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 underline hover:text-sky-900"
              >
                Consulter l&apos;arrêté (PDF)
              </a>
            </>
          )}
        </p>
      )}

      {usages.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowUsages((v) => !v)}
            className="text-sm font-medium text-sky-700 hover:text-sky-900"
          >
            {showUsages ? "Masquer" : "Afficher"} les {usages.length} usage
            {usages.length > 1 ? "s" : ""} concerné{usages.length > 1 ? "s" : ""}
          </button>
          {showUsages && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100">
              {usages.map((u, i) => (
                <li key={`${u.nom}-${i}`} className="px-3 py-2">
                  <p className="text-sm font-medium text-slate-800">
                    {u.nom ?? "Usage"}
                    {u.thematique && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">
                        {u.thematique}
                      </span>
                    )}
                  </p>
                  {u.description && <p className="mt-0.5 text-sm text-slate-600">{u.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// First risk-score element (plan §B, component 1): the regulatory status of the
// most severe zone, mapped to 0-100. Historical, groundwater, flow and 2050
// components are added in the next sprints.
function ScoreBar({ worst }: { worst?: string }) {
  const info = graviteInfo(worst);
  const score = info ? info.rank * 25 : 0;
  const color = info ? info.color : "#059669";
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Score de risque courant (v0)
        </p>
        <p className="text-sm font-bold text-slate-900">{score}/100</p>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-label="Score de risque courant"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(score, 2)}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Basé sur le statut réglementaire VigiEau le plus sévère. Composantes historique,
        nappes, débits et projection 2050 : sprints suivants.
      </p>
    </div>
  );
}

interface Props {
  address: GeocodeResult;
  data: ZonesResponse;
}

export default function ResultPanel({ address, data }: Props) {
  const worst = maxGravite(data.zones.map((z) => z.niveauGravite));
  const sorted = [...data.zones].sort(
    (a, b) =>
      ZONE_ORDER.indexOf(a.type ?? "SUP") - ZONE_ORDER.indexOf(b.type ?? "SUP"),
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Site analysé</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{address.label}</h2>
          {data.message && data.zones.length === 0 ? (
            <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-0.5 text-sm font-medium text-slate-600">
              Statut indisponible
            </span>
          ) : (
            <GraviteBadge niveau={worst} />
          )}
        </div>
        {!(data.message && data.zones.length === 0) && (
          <ScoreBar worst={worst} />
        )}
        {data.notCovered && (
          <p className="mt-2 text-sm text-slate-600">
            Aucune zone d&apos;alerte sécheresse connue à cette adresse (territoire non couvert par
            VigiEau ou aucune restriction en vigueur).
          </p>
        )}
        {!data.notCovered && data.zones.length === 0 && !data.message && (
          <p className="mt-2 text-sm text-slate-600">
            Aucune restriction en vigueur à cette adresse à ce jour.
          </p>
        )}
        {data.message && <p className="mt-2 text-sm text-amber-700">{data.message}</p>}
      </div>

      {sorted.map((zone, i) => (
        <ZoneCard key={`${zone.id ?? zone.code ?? i}`} zone={zone} />
      ))}
    </section>
  );
}
