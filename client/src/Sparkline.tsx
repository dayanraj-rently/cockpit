import type { HistoryPoint } from "./okrsClient";
import { formatDateTime } from "./dateUtils";
import { cn } from "@/lib/utils";

const PAD = 3;

// A key result's progress over time. Single series, so no legend; the
// fixed 0–100% y-domain keeps every sparkline on the same scale. The color
// comes from `className` (a `text-chart-N` class) via currentColor. Each
// point has an invisible, larger hit circle with a native tooltip; the
// check-in dialog's history list is the table view of the same data.
export function Sparkline({
  points,
  width = 72,
  height = 22,
  className,
}: {
  points: HistoryPoint[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;

  const times = points.map((p) => new Date(p.at).getTime());
  const minT = Math.min(...times);
  const spanT = Math.max(...times) - minT;
  const x = (i: number) =>
    PAD + (spanT > 0 ? (times[i] - minT) / spanT : i / (points.length - 1)) * (width - PAD * 2);
  const y = (progress: number) => PAD + (1 - progress) * (height - PAD * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.progress).toFixed(1)}`).join(" ");
  const last = points.length - 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 overflow-visible", className)}
      role="img"
      aria-label={`Progress trend: ${Math.round(points[0].progress * 100)}% to ${Math.round(points[last].progress * 100)}%`}
    >
      <line
        x1={PAD}
        x2={width - PAD}
        y1={y(0)}
        y2={y(0)}
        className="stroke-border"
        strokeWidth={1}
      />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={x(last)}
        cy={y(points[last].progress)}
        r={3}
        fill="currentColor"
        stroke="var(--background)"
        strokeWidth={1.5}
      />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.progress)} r={6} fill="transparent">
          <title>{`${formatDateTime(p.at)} · ${Math.round(p.progress * 100)}%`}</title>
        </circle>
      ))}
    </svg>
  );
}
