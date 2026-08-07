import type { ElementType, ReactNode } from "react";

/**
 * The single card frame of the application.
 *
 * Before this component, 31 blocks repeated the very same card class string
 * (rounded-xl / thin border / white ground / small shadow), which meant a
 * prefectoral decree — a fact that is legally enforceable — looked exactly like
 * a figure this tool modelled itself, and exactly like a 2050 projection that is
 * uncertain by construction. The code has always kept those apart (`available`
 * flags, confidence badges, lo/hi ranges); the interface did not.
 *
 * `variant` is that distinction, made visible:
 *
 * - `reglementaire` — an opposable fact read from an official source (VigiEau
 *   decree, zone level). Accented left edge: this is the one you can cite.
 * - `modele`        — a figure HydroVigie computes. The plain card.
 * - `projection`    — a future value (2050 trajectories). Dashed frame, because
 *   the border of an uncertain thing should not look solid.
 * - `pedagogie`     — an explanatory aside. Tinted, no shadow, recedes.
 *
 * `tag` is opt-in rather than automatic: on a chapter-level block it tells the
 * reader what kind of statement follows, but repeated on every nested sub-card
 * it would become noise.
 */
export type PanelVariant = "reglementaire" | "modele" | "projection" | "pedagogie";

const FRAME: Record<PanelVariant, string> = {
  reglementaire:
    "rounded-xl border border-line bg-surface shadow-sm border-l-4 border-l-brand",
  modele: "rounded-xl border border-line bg-surface shadow-sm",
  projection: "rounded-xl border border-dashed border-line-strong bg-surface shadow-sm",
  pedagogie: "rounded-xl border border-line bg-canvas",
};

/** Default wording of the `tag` chip, per variant. */
const TAG_LABEL: Record<PanelVariant, string | null> = {
  reglementaire: "Fait réglementaire",
  modele: "Estimation HydroVigie",
  projection: "Projection",
  pedagogie: null,
};

const TAG_CLASS: Record<PanelVariant, string> = {
  reglementaire: "border-sky-200 bg-brand-wash text-brand-ink",
  modele: "border-line bg-canvas text-ink-subtle",
  projection: "border-line-strong bg-canvas text-ink-subtle",
  pedagogie: "border-line bg-surface text-ink-subtle",
};

interface Props {
  variant?: PanelVariant;
  /** Small uppercase label above the title (e.g. "Score de risque courant"). */
  eyebrow?: string;
  title?: ReactNode;
  /**
   * Heading level for `title`. Defaults to `h3`; pass `h2` when the panel is a
   * chapter of the page rather than a card inside one. Getting this right is
   * what keeps the document outline usable by a screen reader.
   */
  titleAs?: Extract<ElementType, "h2" | "h3" | "h4">;
  /** Right-hand side of the header row — a badge, a confidence chip, a date. */
  aside?: ReactNode;
  /** Show the variant chip. `true` uses the default wording, a string overrides it. */
  tag?: boolean | string;
  /** Footnote under the content: where the figure comes from. */
  source?: ReactNode;
  /** Rendered element. `section` when the panel stands on its own in the page. */
  as?: Extract<ElementType, "div" | "section" | "article">;
  /**
   * Accessible name of the region. A `section` only becomes a landmark once it
   * is named, so dropping this on a `section` silently removes it from the
   * document's landmark list — which is exactly what the e2e suite caught when
   * PortfolioExecutiveSummary was first migrated to this component.
   */
  ariaLabel?: string;
  /** Anchor target, so a table of contents can link to this panel. */
  id?: string;
  /** Padding utility, so the few dense panels (tables, maps) can opt out. */
  padding?: string;
  className?: string;
  children?: ReactNode;
}

export default function Panel({
  variant = "modele",
  eyebrow,
  title,
  titleAs: TitleTag = "h3",
  aside,
  tag,
  source,
  as: Tag = "div",
  ariaLabel,
  id,
  padding = "p-5",
  className = "",
  children,
}: Props) {
  const tagLabel =
    tag === true ? TAG_LABEL[variant] : typeof tag === "string" ? tag : null;
  const hasHeader = Boolean(eyebrow || title || aside || tagLabel);

  return (
    <Tag id={id} aria-label={ariaLabel} className={`${FRAME[variant]} ${padding} ${className}`.trim()}>
      {hasHeader && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">
                {eyebrow}
              </p>
            )}
            {title && (
              <TitleTag
                className={`font-semibold text-ink ${
                  TitleTag === "h2" ? "text-lg" : "text-sm"
                } ${eyebrow ? "mt-0.5" : ""}`.trim()}
              >
                {title}
              </TitleTag>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {aside}
            {tagLabel && (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TAG_CLASS[variant]}`}
              >
                {tagLabel}
              </span>
            )}
          </div>
        </div>
      )}
      {children}
      {source && <p className="mt-3 text-xs text-ink-subtle">{source}</p>}
    </Tag>
  );
}
