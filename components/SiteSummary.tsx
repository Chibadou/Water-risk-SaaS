"use client";

import Link from "next/link";
import Panel from "./ui/Panel";
import type { SyntheseSite, SyntheseTone } from "@/lib/synthese";

// The site-level twin of PortfolioExecutiveSummary, and deliberately its mirror
// image: same tone dots, same dl/dt/dd structure, same "typographic rather than
// decorative" intent. Two synthesis blocks that looked different would suggest
// they were built differently, when they obey the same two rules.
//
// What it adds over its portfolio twin: each line links to the chapter it
// summarises. The synthesis is meant to be read alone by a decision-maker and
// used as an entry point by everyone else — the link is what serves both
// audiences from one block, which is how the "les trois publics" arbitration
// was resolved without picking one.

const TONE: Record<SyntheseTone, { dot: string; titre: string }> = {
  neutre: { dot: "bg-slate-300", titre: "text-ink-subtle" },
  attention: { dot: "bg-amber-400", titre: "text-amber-700" },
  alerte: { dot: "bg-red-500", titre: "text-red-700" },
};

export default function SiteSummary({ summary }: { summary: SyntheseSite }) {
  if (summary.lignes.length === 0) return null;

  return (
    <Panel
      as="section"
      ariaLabel="Synthèse du site"
      variant="modele"
      className="mt-6"
      eyebrow="Synthèse"
      aside={<span className="text-xs text-ink-subtle">Ce site — lecture d&apos;ensemble</span>}
    >
      {summary.accroche && (
        <p className="mt-2 text-lg leading-snug font-semibold text-ink">{summary.accroche}</p>
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
                <dt className={`text-xs font-semibold tracking-wide uppercase ${tone.titre}`}>
                  {l.ancre ? (
                    <Link href={`#${l.ancre}`} className="underline-offset-2 hover:underline">
                      {l.titre}
                    </Link>
                  ) : (
                    l.titre
                  )}
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
