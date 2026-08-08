"use client";

import type { ExecutiveSummary, ExecutiveTone } from "@/lib/executive";
import Panel from "./ui/Panel";

// Sits between the site-entry row and the KPI tiles: the synthesis first, the
// facts underneath. Deliberately typographic rather than decorative — this is
// the block someone reads aloud in a meeting.

const TONE: Record<ExecutiveTone, { dot: string; titre: string }> = {
  neutre: { dot: "bg-slate-300", titre: "text-ink-subtle" },
  attention: { dot: "bg-amber-400", titre: "text-amber-700" },
  alerte: { dot: "bg-red-500", titre: "text-red-700" },
};

export default function PortfolioExecutiveSummary({ summary }: { summary: ExecutiveSummary }) {
  if (summary.lignes.length === 0) return null;

  return (
    <Panel
      as="section"
      ariaLabel="Synthèse du portefeuille"
      variant="modele"
      className="mb-6"
      eyebrow="Synthèse"
      aside={<span className="text-xs text-ink-subtle">Portefeuille — lecture d&apos;ensemble</span>}
    >

      {summary.accroche && (
        <p className="mt-2 text-lg font-semibold leading-snug text-ink">
          {summary.accroche}
        </p>
      )}

      {/* Two columns only once there is enough to fill them — a single line in a
          two-column grid reads as a block with something missing. */}
      <dl className={`mt-4 grid gap-3 ${summary.lignes.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {summary.lignes.map((l) => {
          const tone = TONE[l.ton];
          return (
            <div key={l.id} className="flex gap-2.5">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
              <div>
                <dt className={`text-xs font-semibold uppercase tracking-wide ${tone.titre}`}>
                  {l.titre}
                </dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-ink-muted">{l.texte}</dd>
              </div>
            </div>
          );
        })}
      </dl>
    </Panel>
  );
}
