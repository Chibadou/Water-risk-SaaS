"use client";

import { useEffect, useMemo, useState } from "react";

// The site sheet stays ONE page — printable, and searchable with Ctrl+F, which
// is what a reader assembling an ESG file actually does with it. Tabs would
// have made it shorter and would have hidden four fifths of the evidence from
// both the browser's find and the print stylesheet.
//
// So the page keeps its length and gains a map: a sticky rail on wide screens,
// a sticky row of chips below `lg`. The active chapter is tracked from the
// document itself rather than from scroll arithmetic, so it stays correct when
// a chapter grows as its data arrives.

export interface TocItem {
  id: string;
  label: string;
}

export default function SiteToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | undefined>(items[0]?.id);

  // `items` is rebuilt on every render by the parent; key the effect on the ids
  // so the observer is not torn down and rebuilt on each keystroke elsewhere.
  const key = useMemo(() => items.map((i) => i.id).join(","), [items]);

  useEffect(() => {
    const ids = key.split(",").filter(Boolean);
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => e !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Several chapters can intersect at once on a tall screen. The one the
        // reader is "in" is the highest of them, not the last one to fire.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      {
        // Top offset clears the sticky header; the large bottom margin means a
        // chapter only becomes active once it has actually reached the reading
        // area, instead of the moment its first pixel appears.
        rootMargin: "-96px 0px -55% 0px",
        threshold: 0,
      },
    );
    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, [key]);

  if (items.length === 0) return null;

  return (
    // `min-w-0`: a grid item defaults to min-width:auto, so below `lg` the nav
    // grew to the width of its widest chip instead of the column, and the
    // `overflow-x-auto` below never got a chance to clip. Measured at 390px:
    // 145px of horizontal body scroll before this.
    <nav
      aria-label="Sommaire de la fiche"
      className="min-w-0 lg:sticky lg:top-6 lg:self-start"
    >
      <p className="hidden text-xs font-semibold tracking-wide text-ink-subtle uppercase lg:block">
        Sur cette page
      </p>

      {/* Wide screens: a vertical rail, each item marked by a left rule that
          thickens on the active chapter. */}
      <ul className="mt-2 hidden lg:flex lg:flex-col">
        {items.map((it) => {
          const on = active === it.id;
          return (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                aria-current={on ? "true" : undefined}
                className={`block border-l-2 py-1.5 pl-3 text-sm transition-colors ${
                  on
                    ? "border-brand font-semibold text-brand-ink"
                    : "border-line text-ink-subtle hover:border-line-strong hover:text-ink-muted"
                }`}
              >
                {it.label}
              </a>
            </li>
          );
        })}
      </ul>

      {/* Below `lg`: the same map as a scrollable chip row, stuck under the
          header. `-mx-4 px-4` lets it bleed to the screen edges so the last
          chip does not look clipped mid-word. */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur lg:hidden">
        <ul className="flex gap-2 overflow-x-auto">
          {items.map((it) => {
            const on = active === it.id;
            return (
              <li key={it.id} className="shrink-0">
                <a
                  href={`#${it.id}`}
                  aria-current={on ? "true" : undefined}
                  className={`inline-block rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    on
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-surface text-ink-muted"
                  }`}
                >
                  {it.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
