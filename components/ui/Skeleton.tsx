/**
 * A placeholder that occupies the height its content will occupy.
 *
 * The site sheet fires seven independent requests, and production timings put
 * two of them at 11 and 16 seconds (HANDBOOK, run 39). Until now every one of
 * them rendered a one-line "Chargement…" and then expanded to a full block, so
 * the page kept growing under the reader's cursor for a quarter of a minute.
 *
 * `lines` is therefore not decoration: it is a HEIGHT CLAIM. Each caller passes
 * roughly what its loaded state occupies, so the reflow when data lands is
 * small instead of being the height of the whole block.
 *
 * The skeleton is `aria-hidden` and paired with a visible, readable status line
 * by its caller — a screen reader should hear "chargement en cours", not a
 * description of grey rectangles.
 */
export default function Skeleton({
  lines = 3,
  className = "",
}: {
  /** Number of placeholder rows. Match the loaded block, do not guess low. */
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`animate-pulse ${className}`.trim()} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`h-3.5 rounded bg-slate-200/70 ${i > 0 ? "mt-2.5" : ""} ${
            // A uniform stack of equal bars reads as a table. Varying the last
            // row's width is what makes it read as text that has not arrived.
            i === lines - 1 ? "w-2/3" : i % 3 === 1 ? "w-11/12" : "w-full"
          }`}
        />
      ))}
    </div>
  );
}

/** A skeleton wearing the card frame, for a whole panel that has not arrived. */
export function PanelSkeleton({
  lines = 4,
  className = "",
  label,
}: {
  lines?: number;
  className?: string;
  /** Visible status text. Never omit it: the bars alone say nothing. */
  label: string;
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-surface p-5 shadow-sm ${className}`.trim()}
      role="status"
    >
      <p className="text-sm text-ink-subtle">{label}</p>
      <Skeleton lines={lines} className="mt-4" />
    </div>
  );
}
