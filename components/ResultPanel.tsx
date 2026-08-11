"use client";

import { useState } from "react";
import GraviteBadge from "./GraviteBadge";
import Panel from "./ui/Panel";
import { GRAVITE, ZONE_TYPE_LABEL, graviteInfo } from "@/lib/gravite";
import { resolveRattachement } from "@/lib/rattachement";
import type { SavedSite } from "@/lib/sites";
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
  /** the usage vector and declared origin, for the ADR-003 weighting */
  site?: Pick<SavedSite, "usages" | "origine">;
}

export default function ResultPanel({ address, data, site }: Props) {
  // ⚠️ No longer `maxGravite(zones)`. The badge shows the level THIS SITE is
  // subject to, weighted by where its water comes from (ADR-003) — and says when
  // it had to fall back to the maximum instead, which the old call could not.
  const rattachement = resolveRattachement(data.zones, site ?? {});
  const worst = rattachement.niveauEffectif;
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

        {/* --- JS en vecteur par ressource (ADR-003, §4.1) ------------------- */}
        {data.zones.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <h4 className="text-sm font-medium text-ink">Niveau par ressource</h4>
            <dl className="mt-2 grid gap-2 sm:grid-cols-3">
              {rattachement.parRessource.map((r) => (
                <div key={r.type} className="rounded-lg border border-line bg-white p-2.5">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    {ZONE_TYPE_LABEL[r.type]?.long ?? r.type}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-ink">
                    {/* ⚠️ "Non couvert" and "aucune restriction" are DIFFERENT
                        statements, and only one of them is about this site's risk. */}
                    {r.niveau ? graviteInfo(r.niveau)?.label : "Aucune zone à ce point"}
                  </dd>
                  <dd className="mt-0.5 text-xs text-ink-subtle">
                    {r.part !== undefined
                      ? `${Math.round(r.part * 100)} % du volume restreignable`
                      : "part non déclarée"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-ink-subtle">{rattachement.detail}</p>
          </div>
        )}

        {/* --- rattachement_ambigu : listé, jamais résolu en silence -------- */}
        {rattachement.ambigu && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">Rattachement ambigu</p>
            <p className="mt-1 text-xs text-amber-900">{rattachement.motifAmbiguite}</p>
            {rattachement.candidats.map((c) => (
              <ul key={c.type} className="mt-1.5 space-y-0.5 text-xs text-amber-900">
                {c.zones.map((z, i) => (
                  <li key={`${c.type}-${z.code ?? i}`}>
                    • <span className="font-mono">{z.code ?? "code inconnu"}</span>{" "}
                    {z.nom ?? ""} — {z.niveau ? graviteInfo(z.niveau)?.label : "niveau illisible"}
                  </li>
                ))}
              </ul>
            ))}
            <p className="mt-1.5 text-xs text-amber-900">
              L&apos;outil ne choisit pas à votre place : il retient le niveau le plus sévère de la
              ressource concernée et vous montre les candidats. Seul le texte des arrêtés dit lequel
              s&apos;applique à votre point de prélèvement.
            </p>
          </div>
        )}
      </Panel>

      {sorted.map((zone, i) => (
        <ZoneCard key={`${zone.id ?? zone.code ?? i}`} zone={zone} />
      ))}
    </section>
  );
}
