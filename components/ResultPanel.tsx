"use client";

import { useState } from "react";
import GraviteBadge from "./GraviteBadge";
import Panel from "./ui/Panel";
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
    <Panel
      variant="reglementaire"
      eyebrow={typeInfo ? typeInfo.long : "Zone d'alerte"}
      // Le code de zone était concaténé au nom dans le titre, sans séparateur :
      // l'arbre ARIA donnait « Eure Moyen haut24_028_0003 », lu d'une traite.
      // Il sort du titre et devient une ligne à part, nommée.
      title={zone.nom ?? "Zone sans nom"}
      aside={<GraviteBadge niveau={zone.niveauGravite} />}
    >
      {zone.code && (
        <p className="mt-0.5 text-xs text-ink-subtle">
          Code de zone <span className="font-mono">{zone.code}</span>
        </p>
      )}

      {zone.niveauGravite && graviteInfo(zone.niveauGravite) && (
        <p className="mt-2 text-sm text-ink-muted">{GRAVITE[zone.niveauGravite].description}</p>
      )}

      {(debut || fin || zone.arrete?.cheminFichier) && (
        <p className="mt-2 text-sm text-ink-subtle">
          {debut && (
            <>
              Arrêté en vigueur depuis le <span className="font-medium text-ink-muted">{debut}</span>
            </>
          )}
          {fin && <> jusqu&apos;au <span className="font-medium text-ink-muted">{fin}</span></>}
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
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-line">
              {usages.map((u, i) => (
                <li key={`${u.nom}-${i}`} className="px-3 py-2">
                  <p className="text-sm font-medium text-ink">
                    {u.nom ?? "Usage"}
                    {u.thematique && (
                      <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-normal text-ink-subtle">
                        {u.thematique}
                      </span>
                    )}
                  </p>
                  {u.description && <p className="mt-0.5 text-sm text-ink-muted">{u.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
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
      <Panel
        variant="reglementaire"
        eyebrow="Site analysé"
        title={address.label}
        titleAs="h3"
        aside={
          data.message && data.zones.length === 0 ? (
            <span className="inline-flex items-center rounded-full border border-line-strong bg-canvas px-3 py-0.5 text-sm font-medium text-ink-muted">
              Statut indisponible
            </span>
          ) : (
            <GraviteBadge niveau={worst} />
          )
        }
        source="Situation officielle VigiEau, rafraîchie quotidiennement (j-1). Seul le texte de l'arrêté fait foi."
      >
        {data.notCovered && (
          <p className="mt-2 text-sm text-ink-muted">
            Aucune zone d&apos;alerte sécheresse connue à cette adresse (territoire non couvert par
            VigiEau ou aucune restriction en vigueur).
          </p>
        )}
        {!data.notCovered && data.zones.length === 0 && !data.message && (
          <p className="mt-2 text-sm text-ink-muted">
            Aucune restriction en vigueur à cette adresse à ce jour.
          </p>
        )}
        {data.message && <p className="mt-2 text-sm text-amber-700">{data.message}</p>}
      </Panel>

      {sorted.map((zone, i) => (
        <ZoneCard key={`${zone.id ?? zone.code ?? i}`} zone={zone} />
      ))}
    </section>
  );
}
