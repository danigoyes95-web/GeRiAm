"use client";
import { useNow } from "@/lib/hooks/useNow";
import { formatDate, formatTime } from "@/lib/format";

export function LiveClock() {
  const now = useNow(1000);
  return (
    <div className="hidden flex-col items-end leading-tight sm:flex" aria-live="off">
      <span className="tabular font-mono text-[15px] font-semibold tracking-tight text-fg" suppressHydrationWarning>
        {now ? formatTime(now) : "--:--:--"}
      </span>
      <span className="tabular font-mono text-[10.5px] text-fg-faint" suppressHydrationWarning>
        {now ? formatDate(now) : "--/--/----"} · GYE
      </span>
    </div>
  );
}
