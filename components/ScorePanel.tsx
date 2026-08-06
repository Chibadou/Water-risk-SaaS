"use client";

import Link from "next/link";
import Panel from "./ui/Panel";
import {
  UPCOMING_COMPONENTS,
  computeScore,
  riskClass,
  scoreColor,
  scoreConfidence,
  type ScoreConfidence,
  type ScoreInputs,
} from "@/lib/score";

export default function ScorePanel({
  inputs,
  stationDistanceKm,
}: {
  inputs: ScoreInputs;
  stationDistanceKm?: number;
}) {
  const { score, components, coverage } = computeScore(inputs);
  const color = scoreColor(score);
  const rc = riskClass(score);
  const confidence: ScoreConfidence = scoreConfidence(coverage, stationDistanceKm);

  return (
    <Panel
      variant="modele"
      tag
      eyebrow="Score de risque courant"
      aside={
        <p className="text-2xl font-bold text-ink">
          {score}
          <span className="text-sm font-medium text-ink-subtle">/100</span>
        </p>
      }
    >
      {/* Risk class label */}
      <div className="mt-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${rc.badgeClass}`}
        >
          <span
            className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: rc.color }}
          />
          {rc.label}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${confidence.badgeClass}`}
          title={confidence.detail}
        >
          {confidence.label}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-ink-subtle">{confidence.detail}</p>

      <div
        className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
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
              <span className={c.score === undefined ? "text-ink-subtle" : "text-ink-muted"}>
                {c.label}
                <span className="ml-1 text-ink-subtle">({c.weight} %)</span>
              </span>
              <span className={c.score === undefined ? "text-ink-subtle" : "font-semibold text-ink"}>
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
            {c.detail && <p className="mt-0.5 text-xs text-ink-subtle">{c.detail}</p>}
          </li>
        ))}
      </ul>

      <details className="mt-3 text-xs text-ink-subtle">
        <summary className="cursor-pointer select-none hover:text-ink-muted">
          {coverage < 1
            ? `Score calculé sur ${Math.round(coverage * 100)} % des composantes disponibles — détails`
            : "Composantes à venir — détails"}
        </summary>
        <p className="mt-1">
          Composantes prévues aux prochains sprints : {UPCOMING_COMPONENTS.join(" · ")}.{" "}
          <Link href="/methodologie" className="underline hover:text-ink-muted">
            Méthodologie
          </Link>
        </p>
      </details>
    </Panel>
  );
}
