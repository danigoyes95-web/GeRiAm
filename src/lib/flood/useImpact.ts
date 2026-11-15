"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OrgLive } from "@/lib/data/live";
import { siteParamsFromRow } from "@/lib/sim/params";
import {
  breachHydrograph,
  computeImpact,
  parseFlood,
  type DamInput,
  type Debris,
  type FloodData,
  type FloodMeta,
  type ImpactResult,
} from "./impact";

/** Datos precalculados del valle (public/flood, generados por scripts/flood-hazard.py). */
export function useFloodData(enabled = true) {
  return useQuery({
    queryKey: ["flood-data"],
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<FloodData> => {
      const [meta, cells, bld] = await Promise.all([
        fetch("/flood/meta.json").then((r) => r.json() as Promise<FloodMeta>),
        fetch("/flood/cells.bin").then((r) => r.arrayBuffer()),
        fetch("/flood/buildings.bin").then((r) => r.arrayBuffer()),
      ]);
      return parseFlood(meta, cells, bld);
    },
  });
}

const hydroCache = new Map<string, Float64Array>();

/** Presas que fallan (código + minuto del escenario en que se abre la brecha) → entradas del modelo. */
export function useDamInputs(
  data: OrgLive | undefined,
  broken: { siteId: string; breachAtMin: number }[],
): DamInput[] {
  const key = broken.map((b) => `${b.siteId}@${b.breachAtMin}`).join(",");
  return useMemo(() => {
    if (!data) return [];
    return broken.flatMap((b) => {
      const site = data.sites.find((s) => s.id === b.siteId);
      if (!site) return [];
      let hydro = hydroCache.get(site.id);
      if (!hydro) {
        hydro = breachHydrograph(siteParamsFromRow(site));
        hydroCache.set(site.id, hydro);
      }
      const table = data.routes
        .filter((r) => r.site_id === site.id && r.distancia_km !== null)
        .map((r) => [Number(r.distancia_km), r.tiempo_llegada_min] as [number, number]);
      return [
        {
          code: site.code,
          name: site.name.replace("Embalse ", ""),
          breachAtMin: b.breachAtMin,
          hydro,
          table,
        },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.sites, data?.routes, key]);
}

/** Impacto (envolvente hasta `tNow`, o de toda la crecida si es null), recalculado solo cuando cambian las entradas. */
export function useImpact(
  fd: FloodData | undefined,
  dams: DamInput[],
  debris: Debris,
  tNow: number | null,
): ImpactResult | null {
  // en simulacro se recalcula cada 2 minutos simulados
  const t = tNow === null ? null : Math.floor(tNow / 2) * 2;
  return useMemo(
    () => (fd && dams.length ? computeImpact(fd, dams, debris, t) : null),
    [fd, dams, debris, t],
  );
}
