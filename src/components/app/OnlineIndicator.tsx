"use client";
import { CloudOff } from "lucide-react";
import { useOnline } from "@/lib/hooks/useBrowser";

export function OnlineIndicator() {
  const online = useOnline();
  if (online) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-lvl-offline/40 bg-[var(--lvl-offline-bg)] px-2 py-0.5 text-[10.5px] font-semibold text-lvl-offline" role="status">
      <CloudOff className="size-3" aria-hidden /> Sin conexión
    </span>
  );
}
