"use client";

// What the reader was never told: how much of the page is still coming.
//
// The site sheet fires seven independent requests and inserts each block as it
// lands. Production timings put /api/hydro at 16,0 s and /api/piezo at 11,0 s
// (HANDBOOK, run 39), so for a quarter of a minute the page grew with no
// indication of whether it was finished, stuck, or broken — and a reader who
// exported a report at second five got one missing three chapters.
//
// It disappears once everything has answered: a progress bar stuck at 100 %
// is furniture, and the page should end up looking like a page.

export interface SourceState {
  id: string;
  label: string;
  /** true once the request has SETTLED — answered or failed. Not "succeeded". */
  ready: boolean;
}

export default function SourceProgress({ sources }: { sources: SourceState[] }) {
  const total = sources.length;
  const done = sources.filter((s) => s.ready).length;
  if (total === 0 || done === total) return null;

  const pending = sources.filter((s) => !s.ready).map((s) => s.label);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-4 rounded-lg border border-line bg-canvas px-4 py-2.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-ink-muted">
          <span className="tabular-nums">
            {done} / {total}
          </span>{" "}
          sources chargées
        </p>
        {/* Naming what is still missing is the point: "en cours" alone does not
            tell a reader whether the chapter they are waiting for is the slow
            one, or whether it will never come. */}
        <p className="text-xs text-ink-subtle">En attente : {pending.join(" · ")}</p>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Chargement des sources de données"
      >
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${Math.max((done / total) * 100, 4)}%` }}
        />
      </div>
    </div>
  );
}
