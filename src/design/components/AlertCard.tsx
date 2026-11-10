import { ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVELS } from "@/design/levels";
import { formatAgo, formatDateTime } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import type { AlertLevel } from "@/lib/domain/types";

export const ALERT_STATUS_LABEL: Record<string, string> = {
  activa: "Activa",
  confirmada: "Confirmada",
  escalada: "Escalada",
  resuelta: "Resuelta",
};

export interface AlertCardProps {
  level: AlertLevel;
  title: string;
  siteName?: string | null;
  description?: string | null;
  status: string;
  startedAt: string;
  isDrill?: boolean;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  compact?: boolean;
  className?: string;
  now?: number;
}

export function AlertCard({ level, title, siteName, description, status, startedAt, isDrill, footer, actions, onClick, compact, className, now }: AlertCardProps) {
  const meta = LEVELS[level] ?? LEVELS.sin_datos;
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-lg border bg-surface-1 transition-colors",
        meta.border,
        onClick && "cursor-pointer hover:bg-surface-2",
        className,
      )}
      onClick={onClick}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", meta.dot)} aria-hidden />
      <div className={cn("pl-4", compact ? "p-2.5" : "p-3")}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge level={level} size="sm" />
            {isDrill && (
              <span className="rounded border border-lvl-amarilla/50 bg-[var(--lvl-amarilla-bg)] px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider text-lvl-amarilla">
                SIMULACRO
              </span>
            )}
            <span className="text-[10.5px] font-medium text-fg-faint">{ALERT_STATUS_LABEL[status] ?? status}</span>
          </div>
          <time className="shrink-0 text-[10.5px] text-fg-faint" dateTime={startedAt} title={formatDateTime(startedAt)}>
            {formatAgo(startedAt, now)}
          </time>
        </div>
        <h3 className="mt-1.5 text-[13px] leading-snug font-semibold text-fg">{title}</h3>
        {siteName && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-fg-muted">
            <MapPin className="size-3" aria-hidden /> {siteName}
          </p>
        )}
        {!compact && description && <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{description}</p>}
        {footer && <div className="mt-2">{footer}</div>}
        {actions && <div className="mt-2.5 flex flex-wrap gap-1.5">{actions}</div>}
      </div>
      {onClick && <ChevronRight className="absolute top-1/2 right-2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />}
    </article>
  );
}
