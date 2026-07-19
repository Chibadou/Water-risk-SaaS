// Minimal single-series sparkline inside a stat tile: the headline value is
// carried by adjacent text, the sparkline shows shape only (no axes, no grid).
// 2px line, end-point marker, text stays in text colors (dataviz guidelines).

interface Point {
  date: string;
  value: number;
}

interface Props {
  points: Point[];
  width?: number;
  height?: number;
  stroke?: string;
  ariaLabel: string;
}

export default function Sparkline({
  points,
  width = 140,
  height = 40,
  stroke = "#0284c7",
  ariaLabel,
}: Props) {
  if (points.length < 2) return null;
  const pad = 4;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - 2 * pad);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - 2 * pad);
  const path = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="shrink-0"
    >
      <title>{ariaLabel}</title>
      <polyline
        points={path}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="3" fill={stroke} />
    </svg>
  );
}
