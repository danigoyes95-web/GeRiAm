"use client";
import { useQuery } from "@tanstack/react-query";
import { getBrowserClient } from "@/lib/supabase/browser";

export interface SeriesPoint {
  ts: number;
  value: number;
  min: number;
  max: number;
  sum: number;
}

/** Serie agregada (crudo + horario) por sensor. Respeta RLS. */
export function useSeries(
  sensorIds: string[],
  hours: number,
  bucketS: number,
  opts?: { enabled?: boolean; refetchMs?: number },
) {
  const key = sensorIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["series", key, hours, bucketS],
    enabled: (opts?.enabled ?? true) && sensorIds.length > 0,
    refetchInterval: opts?.refetchMs ?? 60_000,
    queryFn: async () => {
      const sb = getBrowserClient();
      const to = new Date();
      const from = new Date(to.getTime() - hours * 3600_000);
      // Una consulta por sensor: PostgREST limita cada respuesta a 1.000 filas, y varios
      // sensores juntos (p. ej. 11 × 96 puntos en 24 h) superaban ese límite y se cortaban.
      const results = await Promise.all(
        sensorIds.map((id) =>
          sb.rpc("series", {
            p_sensor_ids: [id],
            p_from: from.toISOString(),
            p_to: to.toISOString(),
            p_bucket_s: bucketS,
          }),
        ),
      );
      const out: Record<string, SeriesPoint[]> = {};
      for (const { data, error } of results) {
        if (error) throw new Error(error.message);
        for (const r of data ?? []) {
          (out[r.sensor_id] ??= []).push({
            ts: new Date(r.ts).getTime(),
            value: r.value,
            min: r.vmin,
            max: r.vmax,
            sum: r.vsum,
          });
        }
      }
      return out;
    },
  });
}

/** Lecturas del simulacro activo (incluye minuto simulado). */
export function useDrillSeries(drillId: string | null | undefined, sensorIds: string[]) {
  return useQuery({
    queryKey: ["drill-series", drillId, sensorIds.join(",")],
    enabled: !!drillId && sensorIds.length > 0,
    refetchInterval: 3_000,
    queryFn: async () => {
      const sb = getBrowserClient();
      // Por sensor (límite de 1.000 filas por respuesta de PostgREST).
      const results = await Promise.all(
        sensorIds.map((id) =>
          sb
            .from("readings")
            .select("sensor_id, ts, value, raw")
            .eq("drill_run_id", drillId!)
            .eq("sensor_id", id)
            .order("ts", { ascending: true })
            .limit(1000),
        ),
      );
      const out: Record<string, { simMin: number; value: number }[]> = {};
      for (const { data, error } of results) {
        if (error) throw new Error(error.message);
        for (const r of data ?? []) {
          const raw = (r.raw ?? {}) as { sim_min?: number };
          (out[r.sensor_id] ??= []).push({ simMin: raw.sim_min ?? 0, value: r.value });
        }
      }
      return out;
    },
  });
}

export function useRainTotals(siteIds: string[]) {
  return useQuery({
    queryKey: ["rain", siteIds.join(",")],
    enabled: siteIds.length > 0,
    refetchInterval: 120_000,
    queryFn: async () => {
      const sb = getBrowserClient();
      const res = await Promise.all(siteIds.map((id) => sb.rpc("rain_totals", { p_site: id })));
      const out: Record<string, { h1: number; h24: number; h72: number }> = {};
      res.forEach((r, i) => {
        out[siteIds[i]] = r.data?.[0] ?? { h1: 0, h24: 0, h72: 0 };
      });
      return out;
    },
  });
}
