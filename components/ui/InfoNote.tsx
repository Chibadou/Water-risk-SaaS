import type { ReactNode } from "react";

/**
 * A disclosure for the explanations that used to live in `title` attributes.
 *
 * A `title` tooltip fails four different readers at once: it does not exist on
 * a touch screen (which is precisely where "c'est quoi la représentativité ?"
 * gets asked), it is unreachable by keyboard, screen readers announce it
 * inconsistently, and it vanishes after a few seconds. The map page already
 * settled this at Sprint 31 and says so in its own code — this component is
 * what lets the rest of the application follow.
 *
 * `<details>` rather than a JS popover: it is a native disclosure, it is
 * keyboard- and screen-reader-operable with no code of ours, it survives a
 * failed hydration, and the browser's find-in-page can reach inside it — which
 * matters on a sheet a reader Ctrl+Fs while assembling an ESG file.
 */
export default function InfoNote({
  label = "En savoir plus",
  children,
  className = "",
}: {
  /** Summary text. Say what the reader will learn, not "info". */
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group text-xs ${className}`.trim()}>
      <summary className="cursor-pointer list-none text-ink-subtle underline decoration-dotted underline-offset-2 select-none hover:text-ink-muted">
        {label}
      </summary>
      <div className="mt-1.5 rounded-md border border-line bg-canvas px-3 py-2 leading-relaxed text-ink-muted">
        {children}
      </div>
    </details>
  );
}
