"use client";
import { Siren } from "lucide-react";
import { useOrgLive } from "@/lib/data/live";

export const SCENARIO_LABEL: Record<string, string> = {
  tormenta: "Tormenta extrema en páramo",
  estructural: "Anomalía estructural en presa",
  comunicacion: "Pérdida de comunicación (Starlink)",
};

/** Banner global obligatorio mientras hay un simulacro activo. */
export function DrillBanner({ drill: drillProp }: { drill?: { scenario: string; status: string } | null }) {
  const { data } = useOrgLive();
  const drill = drillProp !== undefined ? drillProp : data?.drill;
  if (!drill) return null;
  return (
    <div role="status" aria-live="polite" className="drill-stripes sticky top-0 z-50 bg-lvl-amarilla text-[#1a1402]">
      <div className="flex items-center justify-center gap-2 px-3 py-1.5 text-center text-[12.5px] font-bold tracking-wide sm:text-[13px]">
        <Siren className="size-4 shrink-0 animate-pulse-soft" aria-hidden />
        <span>SIMULACRO — NO ES UNA EMERGENCIA REAL</span>
        <span className="hidden font-semibold opacity-80 sm:inline">· {SCENARIO_LABEL[drill.scenario] ?? drill.scenario}</span>
        {drill.status === "pausado" && <span className="rounded bg-black/15 px-1.5 text-[11px]">EN PAUSA</span>}
      </div>
    </div>
  );
}
