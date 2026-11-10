import { cn } from "@/lib/utils";
import { LEVELS } from "@/design/levels";
import type { StatusLevel } from "@/lib/domain/types";

export function StatusBadge({
  level,
  size = "md",
  label,
  pulse,
  className,
}: {
  level: StatusLevel;
  size?: "sm" | "md" | "lg";
  label?: string;
  pulse?: boolean;
  className?: string;
}) {
  const meta = LEVELS[level] ?? LEVELS.sin_datos;
  const Icon = meta.icon;
  const shouldPulse = pulse ?? (level === "roja" || level === "naranja");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-semibold tracking-wide",
        meta.text,
        meta.bg,
        meta.border,
        size === "sm" && "h-5 px-1.5 text-[10px]",
        size === "md" && "h-6 px-2 text-[11px]",
        size === "lg" && "h-8 px-3 text-[13px]",
        className,
      )}
    >
      <Icon className={cn(size === "lg" ? "size-4" : "size-3.5", shouldPulse && "animate-pulse-soft")} aria-hidden />
      <span>{label ?? meta.short}</span>
    </span>
  );
}

export function StatusDot({ level, className, ring = false }: { level: StatusLevel; className?: string; ring?: boolean }) {
  const meta = LEVELS[level] ?? LEVELS.sin_datos;
  return (
    <span className={cn("relative inline-flex size-2.5", className)} aria-label={meta.label} role="img">
      {ring && <span className={cn("absolute inset-0 rounded-full animate-ring", meta.dot)} />}
      <span className={cn("relative inline-flex size-2.5 rounded-full", meta.dot)} />
    </span>
  );
}
