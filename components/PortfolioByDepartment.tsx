import { departementName } from "@/lib/departements";
import { riskClass, scoreColor } from "@/lib/score";

export interface PortfolioItem {
  /** department code, or undefined when the site has no resolvable citycode */
  dept?: string;
  /** dashboard score, or undefined when not yet evaluated */
  score?: number;
}

interface DeptGroup {
  dept: string;
  count: number;
  scored: number;
  avg?: number;
  max?: number;
}

function groupByDept(items: PortfolioItem[]): DeptGroup[] {
  const map = new Map<string, { count: number; scores: number[] }>();
  for (const it of items) {
    const key = it.dept ?? "??";
    const g = map.get(key) ?? { count: 0, scores: [] };
    g.count += 1;
    if (it.score !== undefined) g.scores.push(it.score);
    map.set(key, g);
  }
  const groups: DeptGroup[] = [];
  for (const [dept, g] of map) {
    const avg = g.scores.length > 0 ? Math.round(g.scores.reduce((a, b) => a + b, 0) / g.scores.length) : undefined;
    const max = g.scores.length > 0 ? Math.max(...g.scores) : undefined;
    groups.push({ dept, count: g.count, scored: g.scores.length, avg, max });
  }
  // Sort by average risk (worst first); unscored departments last.
  return groups.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || b.count - a.count);
}

export default function PortfolioByDepartment({ items }: { items: PortfolioItem[] }) {
  if (items.length === 0) return null;
  const groups = groupByDept(items);
  // Only worth showing when the sites span more than one department.
  if (groups.length < 2) return null;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">Répartition géographique</h2>
      <p className="mt-1 text-xs text-slate-500">
        Vos sites regroupés par département, classés du risque moyen le plus élevé au plus faible.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {groups.map((g) => {
          const name = g.dept === "??" ? "Département inconnu" : departementName(g.dept) ?? g.dept;
          const rc = g.avg !== undefined ? riskClass(g.avg) : undefined;
          return (
            <div key={g.dept} className="flex items-center gap-3 text-xs">
              <span className="w-40 shrink-0 truncate text-slate-700" title={`${name}${g.dept !== "??" ? ` (${g.dept})` : ""}`}>
                {name}
                {g.dept !== "??" && <span className="text-slate-400"> ({g.dept})</span>}
              </span>
              <span className="w-16 shrink-0 tabular-nums text-slate-500">
                {g.count} site{g.count > 1 ? "s" : ""}
              </span>
              <div className="flex h-4 flex-1 items-center overflow-hidden rounded bg-slate-100">
                {g.avg !== undefined && (
                  <div
                    className="h-full rounded"
                    style={{ width: `${g.avg}%`, backgroundColor: scoreColor(g.avg) }}
                    title={`Score moyen ${g.avg}${g.max !== undefined ? ` · max ${g.max}` : ""}`}
                  />
                )}
              </div>
              <span className="w-28 shrink-0 text-right">
                {g.avg !== undefined && rc ? (
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${rc.badgeClass}`}>
                    moy. {g.avg}
                  </span>
                ) : (
                  <span className="text-slate-400">en cours…</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
