import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { Sparkline } from "./Sparkline";
import { LEVELS } from "@/design/levels";
import type { StatusLevel } from "@/lib/domain/types";

export interface KpiTileProps {
  label: string;
  value: number | null | undefined;
  unit?: string;
  decimals?: number;
  /** cambio en la ventana de tendencia (misma unidad) */
  delta?: number | null;
  deltaLabel?: string;
  deltaDecimals?: number;
  /** si subir es malo (nivel, caudal) → rojo/naranja; si no, neutro */
  upIsBad?: boolean;
  series?: number[];
  threshold?: number;
  thresholdLabel?: string;
  level?: StatusLevel;
  stale?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function KpiTile({
  label,
  value,
  unit,
  decimals = 2,
  delta,
  deltaLabel = "1 h",
  deltaDecimals,
  upIsBad = false,
  series,
  threshold,
  thresholdLabel,
  level,
  stale,
  className,
  size = "md",
}: KpiTileProps) {
  const dir = delta === null || delta === undefined || Math.abs(delta) < 1e-9 ? 0 : delta > 0 ? 1 : -1;
  const TrendIcon = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;
  const trendColor = dir === 0 ? "text-fg-faint" : upIsBad && dir > 0 ? "text-lvl-naranja" : "text-fg-muted";
  const accent = level && level !== "normal" ? LEVELS[level].cssVar : "var(--accent)";
  return (
    <div
      className={cn(
        "group relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border border-border bg-surface-1 p-3",
        level && level !== "normal" && "border-[color-mix(in_oklab,var(--border)_40%,currentColor)]",
        className,
      )}
      style={level && level !== "normal" ? { color: accent } : undefined}
    >
      {level && level !== "normal" && <span className="absolute inset-y-0 left-0 w-0.5" style={{ background: accent }} aria-hidden />}
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps truncate">{label}</span>
        {stale ? <span className="text-[10px] font-medium text-lvl-sin-datos">{stale}</span> : null}
      </div>
      <div className="flex items-baseline gap-1.5 text-fg">
        <span
          className={cn(
            "tabular font-mono font-semibold tracking-tight",
            size === "lg" ? "text-3xl" : size === "md" ? "text-2xl" : "text-lg",
          )}
        >
          {formatNumber(value, decimals)}
        </span>
        {unit ? <span className="text-xs font-medium text-fg-faint">{unit}</span> : null}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={cn("inline-flex items-center gap-0.5 tabular font-mono", trendColor)}>
          <TrendIcon className="size-3.5" aria-hidden />
          {delta === null || delta === undefined ? "—" : `${delta > 0 ? "+" : ""}${formatNumber(delta, deltaDecimals ?? decimals)}`}
          <span className="ml-1 font-sans text-fg-faint">{deltaLabel}</span>
        </span>
        {threshold !== undefined && (
          <span className="truncate text-fg-faint">
            {thresholdLabel ?? "Umbral"} <span className="tabular font-mono text-fg-muted">{formatNumber(threshold, decimals)}</span>
          </span>
        )}
      </div>
      {series && series.length > 1 ? <Sparkline values={series} threshold={threshold} color={accent} className="mt-0.5" /> : null}
    </div>
  );
}
