import { GRAVITE } from "@/lib/gravite";
import type { YearHistory } from "@/lib/history";
import type { NiveauGravite } from "@/lib/types";

// Per-year restriction breakdown for the site's worst covering zone. Each year
// is a stacked bar of days at each gravity level, revealing structural tension
// (recurring bad summers) at a glance — the basis of the score's structural
// frequency component.

const ORDER: NiveauGravite[] = ["vigilance", "alerte", "alerte_renforcee", "crise"];

export default function RestrictionHistory({
  parAnnee,
}: {
  parAnnee: Record<string, YearHistory>;
}) {
  const years = Object.keys(parAnnee).sort(); // ascending
  if (years.length === 0) return null;

  // Common scale across years so bar lengths are comparable.
  const totals = years.map((y) =>
    ORDER.reduce((s, n) => s + (parAnnee[y].joursParNiveau[n] ?? 0), 0),
  );
  const max = Math.max(1, ...totals);
  const currentYear = String(new Date().getUTCFullYear());

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">
        Historique des restrictions par année
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Jours passés à chaque niveau de gravité sur la zone la plus contraignante du site
        (source : arrêtés officiels data.gouv). L&apos;année en cours est partielle.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {years.map((y, i) => {
          const yh = parAnnee[y];
          const total = totals[i];
          return (
            <div key={y} className="flex items-center gap-3 text-xs">
              <span className="w-16 shrink-0 tabular-nums text-slate-600">
                {y}
                {y === currentYear && <span className="text-slate-400"> (en cours)</span>}
              </span>
              <div className="flex h-4 flex-1 overflow-hidden rounded bg-slate-100">
                {ORDER.map((n) => {
                  const days = yh.joursParNiveau[n] ?? 0;
                  if (days === 0) return null;
                  return (
                    <div
                      key={n}
                      style={{ width: `${(days / max) * 100}%`, backgroundColor: GRAVITE[n].color }}
                      title={`${GRAVITE[n].label} : ${days} j`}
                    />
                  );
                })}
              </div>
              <span className="w-24 shrink-0 text-right tabular-nums text-slate-500">
                {total > 0 ? `${total} j restreint` : "aucune"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        {ORDER.map((n) => (
          <span key={n} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: GRAVITE[n].color }}
            />
            {GRAVITE[n].label}
          </span>
        ))}
      </div>
    </div>
  );
}
