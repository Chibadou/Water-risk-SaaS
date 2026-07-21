import { GRAVITE } from "@/lib/gravite";
import type { YearHistory } from "@/lib/history";
import type { NiveauGravite } from "@/lib/types";
import { computeSeasonalProfile, historiqueScore, scoreColor } from "@/lib/score";

const ORDER: NiveauGravite[] = ["vigilance", "alerte", "alerte_renforcee", "crise"];

function RiskEvolution({
  parAnnee,
}: {
  parAnnee: Record<string, YearHistory>;
}) {
  const currentYear = new Date().getUTCFullYear();
  const years = Object.keys(parAnnee)
    .filter((y) => Number(y) < currentYear)
    .sort();
  if (years.length < 2) return null;

  const points = years.map((y) => {
    const days = parAnnee[y].joursAlertePlus;
    const score = historiqueScore(days);
    return { year: y, score, days };
  });

  const w = 240;
  const h = 48;
  const pad = 4;
  const xStep = (w - pad * 2) / Math.max(1, points.length - 1);

  const pathD = points
    .map((p, i) => {
      const x = pad + i * xStep;
      const y = h - pad - ((p.score / 100) * (h - pad * 2));
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  const lastPt = points[points.length - 1];
  const firstPt = points[0];
  const trend = lastPt.score - firstPt.score;
  const trendLabel =
    trend > 10
      ? "en aggravation"
      : trend < -10
        ? "en amélioration"
        : "stable";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Évolution du risque
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Composante fréquence des restrictions sur {years.length} ans — tendance{" "}
            <span className={trend > 10 ? "font-semibold text-red-700" : trend < -10 ? "font-semibold text-emerald-700" : "text-slate-600"}>
              {trendLabel}
            </span>
          </p>
        </div>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
          <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e2e8f0" strokeWidth="1" />
          <path d={pathD} fill="none" stroke={scoreColor(lastPt.score)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => (
            <circle
              key={p.year}
              cx={pad + i * xStep}
              cy={h - pad - ((p.score / 100) * (h - pad * 2))}
              r={3}
              fill={scoreColor(p.score)}
              stroke="#fff"
              strokeWidth="1"
            >
              <title>{p.year} : score {p.score} ({p.days} j en alerte+)</title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{years[0]}</span>
        <span>{years[years.length - 1]}</span>
      </div>
    </div>
  );
}

function SeasonalCalendar({
  parMois,
}: {
  parMois: Record<string, Record<number, number>>;
}) {
  const profile = computeSeasonalProfile({}, parMois);
  const maxAvg = Math.max(1, ...profile.map((m) => m.avgDaysRestricted));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">
        Calendrier saisonnier du risque
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Nombre moyen de jours en alerte ou plus par mois (sur les années complètes).
        Les mois les plus colorés concentrent historiquement le plus de restrictions.
      </p>
      <div className="mt-4 grid grid-cols-12 gap-1">
        {profile.map((m) => {
          const intensity = m.avgDaysRestricted / maxAvg;
          const bg =
            intensity === 0
              ? "#f1f5f9"
              : intensity < 0.25
                ? "#fef9c3"
                : intensity < 0.5
                  ? "#fed7aa"
                  : intensity < 0.75
                    ? "#fca5a5"
                    : "#f87171";
          return (
            <div
              key={m.month}
              className="flex flex-col items-center gap-1"
              title={`${m.label} : ${m.avgDaysRestricted} j/an en moyenne (max ${m.maxDaysRestricted} j), ${m.yearsWithRestriction}/${m.totalYears} années touchées`}
            >
              <div
                className="h-10 w-full rounded"
                style={{ backgroundColor: bg }}
              />
              <span className="text-[10px] font-medium text-slate-500">
                {m.label}
              </span>
              <span className="text-[10px] tabular-nums text-slate-400">
                {m.avgDaysRestricted > 0 ? `${m.avgDaysRestricted}` : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
        <span>Intensité :</span>
        {[
          { bg: "#f1f5f9", label: "0 j" },
          { bg: "#fef9c3", label: "faible" },
          { bg: "#fed7aa", label: "modéré" },
          { bg: "#fca5a5", label: "élevé" },
          { bg: "#f87171", label: "fort" },
        ].map((l) => (
          <span key={l.label} className="inline-flex items-center gap-0.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: l.bg }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RestrictionHistory({
  parAnnee,
  parMois,
}: {
  parAnnee: Record<string, YearHistory>;
  parMois?: Record<string, Record<number, number>>;
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
    <>
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

    <RiskEvolution parAnnee={parAnnee} />

    {parMois && Object.keys(parMois).length > 0 && (
      <SeasonalCalendar parMois={parMois} />
    )}
    </>
  );
}
