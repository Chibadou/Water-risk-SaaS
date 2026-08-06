// Minimal single-series sparkline inside a stat tile: the headline value is
// carried by adjacent text, the sparkline shows shape only (no axes, no grid).
// 2px line, end-point marker, text stays in text colors (dataviz guidelines).
//
// The geometry lives in lib/sparkline.ts so the map popups — built as HTML
// strings, not React — draw exactly the same shape.

import { sparkGeometry, type SparkPoint } from "@/lib/sparkline";

interface Props {
  points: SparkPoint[];
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
  const geometry = sparkGeometry(points, width, height);
  if (!geometry) return null;

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
        points={geometry.path}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={geometry.last.x} cy={geometry.last.y} r="3" fill={stroke} />
    </svg>
  );
}
