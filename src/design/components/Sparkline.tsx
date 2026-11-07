import { useId } from "react";
import { cn } from "@/lib/utils";

export function Sparkline({
  values,
  className,
  color = "var(--accent)",
  threshold,
  height = 28,
  fill = true,
}: {
  values: number[];
  className?: string;
  color?: string;
  threshold?: number;
  height?: number;
  fill?: boolean;
}) {
  const id = useId();
  const w = 120;
  const h = height;
  if (values.length < 2) {
    return <svg viewBox={`0 0 ${w} ${h}`} className={cn("w-full", className)} style={{ height }} aria-hidden />;
  }
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (threshold !== undefined) {
    min = Math.min(min, threshold);
    max = Math.max(max, threshold);
  }
  const span = max - min || 1;
  const pad = 2;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("w-full", className)} style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {threshold !== undefined && (
        <line x1="0" x2={w} y1={y(threshold)} y2={y(threshold)} stroke="var(--lvl-amarilla)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".7" />
      )}
      {fill && <path d={`${d}L${w},${h}L0,${h}Z`} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2" fill={color} />
    </svg>
  );
}
