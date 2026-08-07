import { GRAVITE } from "@/lib/gravite";
import { sectorImpact, secteurInfo } from "@/lib/secteur";
import type { Secteur } from "@/lib/sites";
import type { NiveauGravite } from "@/lib/types";
import Panel from "./ui/Panel";

const ORDER: NiveauGravite[] = ["vigilance", "alerte", "alerte_renforcee", "crise"];

export default function SectorImpactPanel({
  secteur,
  worst,
}: {
  secteur: Secteur;
  worst?: NiveauGravite;
}) {
  const info = secteurInfo(secteur);
  if (!info) return null;

  return (
    <Panel
      variant="pedagogie"
      // L'émoji sortait du titre prononcé (« usine Impact pour le secteur
      // Industrie »). Il reste visible, il cesse d'être lu.
      title={
        <>
          <span aria-hidden>{info.icon}</span> Impact pour{" "}
          {info.domestic ? "un" : "le secteur"} {info.label}
        </>
      }
    >
      <p className="mt-1 text-xs text-ink-subtle">
        Conséquences {info.domestic ? "concrètes" : "opérationnelles"} des restrictions par niveau de gravité
      </p>
      {info.domestic && (
        <p className="mt-2 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink-subtle">
          HydroVigie est conçu pour évaluer le risque des <strong>sites professionnels</strong>{" "}
          (score, secteur, rapport ESG). L&apos;usage domestique est proposé à titre indicatif :
          les restrictions VigiEau « particulier » s&apos;appliquent, mais l&apos;outil est moins
          pertinent pour un logement individuel.
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2">
        {ORDER.map((n) => {
          const impact = sectorImpact(secteur, n);
          if (!impact) return null;
          const isCurrent = worst === n;
          return (
            <div
              key={n}
              className={`rounded-lg border p-3 ${
                isCurrent
                  ? "border-slate-400 bg-canvas ring-1 ring-slate-300"
                  : "border-slate-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: GRAVITE[n].color }}
                />
                <span className="text-xs font-semibold text-ink-muted">
                  {GRAVITE[n].label}
                  {isCurrent && (
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-ink-muted">
                      en cours
                    </span>
                  )}
                </span>
                <span className="ml-auto text-xs font-medium text-ink-muted">
                  {impact.short}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-subtle">{impact.detail}</p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
