import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { LucideIcon } from "lucide-react";

export interface TimelineItem {
  id: string;
  at: string;
  title: string;
  detail?: React.ReactNode;
  icon: LucideIcon;
  tone?: "accent" | "normal" | "amarilla" | "naranja" | "roja" | "muted" | "offline";
}

const toneClass: Record<NonNullable<TimelineItem["tone"]>, string> = {
  accent: "text-accent border-accent/40 bg-accent-soft",
  normal: "text-lvl-normal border-lvl-normal/40 bg-[var(--lvl-normal-bg)]",
  amarilla: "text-lvl-amarilla border-lvl-amarilla/40 bg-[var(--lvl-amarilla-bg)]",
  naranja: "text-lvl-naranja border-lvl-naranja/40 bg-[var(--lvl-naranja-bg)]",
  roja: "text-lvl-roja border-lvl-roja/40 bg-[var(--lvl-roja-bg)]",
  muted: "text-fg-muted border-border bg-surface-2",
  offline: "text-lvl-offline border-lvl-offline/40 bg-[var(--lvl-offline-bg)]",
};

export function TimelineEvento({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-3", className)}>
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <li key={it.id} className="relative flex gap-3">
            {i < items.length - 1 && <span className="absolute top-7 bottom-[-14px] left-[13px] w-px bg-border" aria-hidden />}
            <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full border", toneClass[it.tone ?? "muted"])}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-[13px] font-medium text-fg">{it.title}</p>
                <time className="tabular font-mono text-[11px] text-fg-faint" dateTime={it.at}>
                  {formatDateTime(it.at, undefined, true)}
                </time>
              </div>
              {it.detail && <div className="mt-0.5 text-xs text-fg-muted">{it.detail}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
