import * as React from "react";
import { cn } from "@/lib/utils";
import { Inbox, type LucideIcon } from "lucide-react";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse-soft rounded-md bg-surface-3", className)} {...props} />;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      <span className="grid size-10 place-items-center rounded-full border border-border bg-surface-2 text-fg-faint">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="max-w-sm text-xs text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
      {children}
    </kbd>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-faint transition-colors hover:border-border-strong focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint transition-colors hover:border-border-strong focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-border bg-surface-2 px-2.5 pr-8 text-sm text-fg transition-colors hover:border-border-strong focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-fg-muted", className)} {...props} />;
}

export function Divider({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-border", className)} />;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  size?: "sm" | "md";
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[5px] font-medium transition-colors",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
            value === o.value ? "bg-surface-hover text-fg shadow-sm" : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
