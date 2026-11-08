import { Satellite } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

export interface StarlinkInfo {
  online: boolean;
  latencyMs: number | null;
  uptimePct?: number | null;
  obstructionPct?: number | null;
}

export function StarlinkStatus({ name, info, compact = false, className }: { name: string; info: StarlinkInfo; compact?: boolean; className?: string }) {
  const degraded = info.online && (info.latencyMs ?? 0) > 150;
  const color = !info.online ? "text-lvl-roja" : degraded ? "text-lvl-amarilla" : "text-lvl-normal";
  const state = !info.online ? "Sin enlace" : degraded ? "Degradado" : "En línea";
  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[11px]", className)} title={`Starlink ${name}: ${state}`}>
        <Satellite className={cn("size-3.5", color, !info.online && "animate-pulse-soft")} aria-hidden />
        <span className="text-fg-muted">{name}</span>
        <span className={cn("tabular font-mono", info.online ? "text-fg" : color)}>
          {info.online ? `${formatNumber(info.latencyMs, 0)} ms` : "CAÍDO"}
        </span>
      </span>
    );
  }
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2", className)}>
      <Satellite className={cn("size-5", color)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-fg">Starlink · {name}</span>
          <span className={cn("text-[11px] font-semibold", color)}>{state}</span>
        </div>
        <div className="mt-0.5 flex gap-3 text-[11px] text-fg-faint">
          <span>
            Latencia <b className="tabular font-mono font-medium text-fg-muted">{info.online ? `${formatNumber(info.latencyMs, 0)} ms` : "—"}</b>
          </span>
          {info.uptimePct !== undefined && (
            <span>
              Disp. 24 h <b className="tabular font-mono font-medium text-fg-muted">{formatNumber(info.uptimePct, 1)} %</b>
            </span>
          )}
          {info.obstructionPct !== undefined && (
            <span>
              Obstrucción <b className="tabular font-mono font-medium text-fg-muted">{formatNumber(info.obstructionPct, 1)} %</b>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
