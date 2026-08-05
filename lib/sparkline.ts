// Geometry of a single-series sparkline, shared by the React component
// (components/Sparkline.tsx) and the map popups, which are built as HTML
// strings and cannot render React.
//
// Extracted rather than duplicated: two sparkline algorithms in one repo would
// drift, and the map would eventually draw a shape the site sheet does not.

export interface SparkPoint {
  date: string;
  value: number;
}

export interface SparkGeometry {
  /** "x,y x,y …" for a <polyline points=…> */
  path: string;
  /** end-point marker, the only dot drawn */
  last: { x: number; y: number };
  width: number;
  height: number;
}

/**
 * Returns undefined for fewer than two points: a single measurement has no
 * shape, and drawing a lone dot would suggest a trend that does not exist.
 *
 * ⚠️ A flat series (every value equal) has a span of 0. The fallback of 1 keeps
 * the division safe AND places the line mid-height, which reads as "flat" —
 * whereas a 0 span would put it at the top and read as "high".
 */
export function sparkGeometry(
  points: SparkPoint[],
  width = 140,
  height = 40,
  pad = 4,
): SparkGeometry | undefined {
  if (points.length < 2) return undefined;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - 2 * pad);
  const y = (v: number) =>
    max === min ? height / 2 : height - pad - ((v - min) / span) * (height - 2 * pad);
  return {
    path: points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" "),
    last: { x: x(points.length - 1), y: y(points[points.length - 1]!.value) },
    width,
    height,
  };
}

/** The same sparkline as an SVG string, for the map popups. */
export function sparklineSvg(points: SparkPoint[], stroke: string, ariaLabel: string): string {
  const g = sparkGeometry(points, 220, 44);
  if (!g) return "";
  return (
    `<svg width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}" role="img" aria-label="${ariaLabel}">` +
    `<polyline points="${g.path}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${g.last.x.toFixed(1)}" cy="${g.last.y.toFixed(1)}" r="3" fill="${stroke}"/>` +
    `</svg>`
  );
}
