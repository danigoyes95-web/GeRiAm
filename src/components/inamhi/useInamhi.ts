"use client";
import { useQuery } from "@tanstack/react-query";
import type { MeteoWarning, ReachKey, RiverForecast } from "@/lib/inamhi/geoglows";

export interface InamhiPayload {
  forecast: RiverForecast | null;
  forecastError: string | null;
  warnings: { warnings: MeteoWarning[]; last: MeteoWarning | null } | null;
  source: string;
}

/** Datos INAMHI–GEOGLOWS de un tramo (pronóstico, umbrales de crecida y avisos), compartidos por caché. */
export function useInamhi(reach: ReachKey) {
  return useQuery({
    queryKey: ["inamhi", reach],
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/inamhi?reach=${reach}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as InamhiPayload;
    },
  });
}
