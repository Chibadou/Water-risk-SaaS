import { GRAVITE } from "@/lib/gravite";
import { sectorImpact, secteurInfo } from "@/lib/secteur";
import type { Secteur } from "@/lib/sites";
import type { NiveauGravite } from "@/lib/types";

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
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">
        {info.icon} Impact pour le secteur {info.label}
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Conséquences opérationnelles des restrictions par niveau de gravité
      </p>
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
                  ? "border-slate-400 bg-slate-50 ring-1 ring-slate-300"
                  : "border-slate-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: GRAVITE[n].color }}
                />
                <span className="text-xs font-semibold text-slate-700">
                  {GRAVITE[n].label}
                  {isCurrent && (
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      en cours
                    </span>
                  )}
                </span>
                <span className="ml-auto text-xs font-medium text-slate-600">
                  {impact.short}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{impact.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
