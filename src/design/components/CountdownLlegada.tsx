"use client";
import { useNow } from "@/lib/hooks/useNow";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCountdown, formatDuration } from "@/lib/format";

/**
 * Cuenta regresiva hasta la llegada estimada de la onda a un punto aguas abajo.
 * `startedAt` = disparo de la alerta; `minutes` = tiempo de tránsito.
 * `speed` permite acelerar en simulacro (x30/x60).
 */
export function CountdownLlegada({
  startedAt,
  minutes,
  target,
  speed = 1,
  simElapsedMin,
  size = "md",
  className,
}: {
  startedAt: string;
  minutes: number;
  target: string;
  speed?: number;
  /** minutos simulados transcurridos (simulacro) — si se da, reemplaza el reloj real */
  simElapsedMin?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const now = useNow(1000) ?? new Date(startedAt).getTime();
  const elapsedS = simElapsedMin !== undefined ? simElapsedMin * 60 : ((now - new Date(startedAt).getTime()) / 1000) * speed;
  const remaining = Math.max(0, minutes * 60 - elapsedS);
  const arrived = remaining <= 0;
  const urgent = remaining < 30 * 60;
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-2.5 py-1.5",
        arrived || urgent ? "border-lvl-roja/50 bg-[var(--lvl-roja-bg)]" : "border-border bg-surface-2",
        className,
      )}
      role="timer"
      aria-label={`Llegada estimada a ${target}`}
    >
      <Timer className={cn("shrink-0", urgent ? "text-lvl-roja" : "text-fg-faint", size === "lg" ? "size-5" : "size-4")} aria-hidden />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-fg-faint">Llegada a {target}</div>
        <div className={cn("tabular font-mono font-semibold", urgent ? "text-lvl-roja" : "text-fg", size === "lg" ? "text-2xl" : size === "md" ? "text-base" : "text-sm")}>
          {arrived ? "LLEGADA ESTIMADA ALCANZADA" : formatCountdown(remaining)}
        </div>
        {size !== "sm" && <div className="text-[10px] text-fg-faint">Tránsito estimado {formatDuration(minutes)}</div>}
      </div>
    </div>
  );
}
