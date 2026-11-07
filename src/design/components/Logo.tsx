import { cn } from "@/lib/utils";

/**
 * Isotipo GeRiAm: gota con curvas de nivel topográficas y una onda de agua en la base.
 * El color de acento es configurable por organización (branding.primary).
 */
export function Isotipo({ className, color = "var(--accent)", title }: { className?: string; color?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-8", className)} role={title ? "img" : "presentation"} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id="geriam-iso-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.95" />
          <stop offset="1" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
        <clipPath id="geriam-iso-clip">
          <path d="M24 3.5C24 3.5 9 19.6 9 29.6 9 37.9 15.7 44.5 24 44.5S39 37.9 39 29.6C39 19.6 24 3.5 24 3.5Z" />
        </clipPath>
      </defs>
      <path
        d="M24 3.5C24 3.5 9 19.6 9 29.6 9 37.9 15.7 44.5 24 44.5S39 37.9 39 29.6C39 19.6 24 3.5 24 3.5Z"
        fill="none"
        stroke="url(#geriam-iso-g)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <g clipPath="url(#geriam-iso-clip)" fill="none" stroke={color} strokeLinecap="round">
        {/* curvas de nivel */}
        <path d="M15.5 24.5c3-2.6 6.4-3.4 9.6-2.4 2.7.8 4.6.5 7.4-1.4" strokeWidth="1.4" strokeOpacity=".55" />
        <path d="M12.6 29c3.9-3.1 8-4 12-2.8 3.4 1 6.3.7 10.4-1.9" strokeWidth="1.4" strokeOpacity=".75" />
        {/* onda */}
        <path d="M9.5 35.2c2.6-2 5.2-2 7.8 0s5.2 2 7.8 0 5.2-2 7.8 0 5.2 2 7.8 0" strokeWidth="2.4" />
      </g>
      <circle cx="24" cy="15.6" r="1.7" fill={color} />
    </svg>
  );
}

export function Logo({
  className,
  product = "GeRiAm",
  tagline,
  color,
  compact = false,
}: {
  className?: string;
  product?: string;
  tagline?: string;
  color?: string;
  compact?: boolean;
}) {
  const head = product.slice(0, 2);
  const mid = product.slice(2, 4);
  const tail = product.slice(4);
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Isotipo color={color} title={product} />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-fg">
            {head}
            <span className="text-accent">{mid}</span>
            {tail}
          </span>
          {tagline ? <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-fg-faint">{tagline}</span> : null}
        </span>
      )}
    </span>
  );
}
