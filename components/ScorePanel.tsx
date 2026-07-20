"use client";

import Link from "next/link";
import { UPCOMING_COMPONENTS, computeScore, scoreColor, type ScoreInputs } from "@/lib/score";

export default function ScorePanel({ inputs }: { inputs: ScoreInputs }) {
  const { score, components, coverage } = computeScore(inputs);
  const color = scoreColor(score);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Score de risque courant (v1)
        </p>
        <p className="text-2xl font-bold text-slate-900">
          {score}
          <span className="text-sm font-medium text-slate-400">/100</span>
        </p>
      </div>
      <div
        className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
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

      <ul className="mt-4 space-y-2">
        {components.map((c) => (
          <li key={c.id}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className={c.score === undefined ? "text-slate-400" : "text-slate-600"}>
                {c.label}
                <span className="ml-1 text-slate-400">({c.weight} %)</span>
              </span>
              <span className={c.score === undefined ? "text-slate-400" : "font-semibold text-slate-800"}>
                {c.score === undefined ? "—" : c.score}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              {c.score !== undefined && (
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(c.score, 2)}%`, backgroundColor: scoreColor(c.score) }}
                />
              )}
            </div>
            {c.detail && <p className="mt-0.5 text-[11px] text-slate-400">{c.detail}</p>}
          </li>
        ))}
      </ul>

      <details className="mt-3 text-[11px] text-slate-400">
        <summary className="cursor-pointer select-none hover:text-slate-600">
          {coverage < 1
            ? `Score calculé sur ${Math.round(coverage * 100)} % des composantes disponibles — détails`
            : "Composantes à venir — détails"}
        </summary>
        <p className="mt-1">
          Composantes prévues aux prochains sprints : {UPCOMING_COMPONENTS.join(" · ")}.{" "}
          <Link href="/methodologie" className="underline hover:text-slate-600">
            Méthodologie
          </Link>
        </p>
      </details>
    </div>
  );
}
