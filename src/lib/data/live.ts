"use client";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getBrowserClient } from "@/lib/supabase/browser";
import { channelName } from "@/lib/supabase/config";
import { LEVEL_RANK, type StatusLevel } from "@/lib/domain/types";
import { fillPercent } from "@/lib/hydro/curve";
import type { Alert, Camera, DownstreamPoint, DrillRun, Gateway, Sensor, Site, SiteDownstream } from "./types";
import { siteCurve } from "./types";

export interface OrgLive {
  sites: Site[];
  sensors: Sensor[];
  gateways: Gateway[];
  cameras: Camera[];
  alerts: Alert[];
  drill: DrillRun | null;
  points: DownstreamPoint[];
  routes: SiteDownstream[];
  fetchedAt: number;
}

export const ORG_LIVE_KEY = ["org-live"] as const;

async function fetchOrgLive(): Promise<OrgLive> {
  const sb = getBrowserClient();
  const [sites, sensors, gateways, cameras, alerts, drills, points, routes] = await Promise.all([
    sb.from("sites").select("*").order("code"),
    sb.from("sensors").select("*").order("code"),
    sb.from("gateways").select("*").order("name"),
    sb.from("cameras").select("*").order("code"),
    sb.from("alerts").select("*").neq("status", "resuelta").order("started_at", { ascending: false }).limit(200),
    sb.from("drill_runs").select("*").neq("status", "finalizado").limit(1),
    sb.from("downstream_points").select("*").order("name"),
    sb.from("site_downstream").select("*"),
  ]);
  const err = [sites, sensors, gateways, cameras, alerts, drills, points, routes].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  return {
    sites: sites.data ?? [],
    sensors: sensors.data ?? [],
    gateways: gateways.data ?? [],
    cameras: cameras.data ?? [],
    alerts: alerts.data ?? [],
    drill: drills.data?.[0] ?? null,
    points: points.data ?? [],
    routes: routes.data ?? [],
    fetchedAt: Date.now(),
  };
}

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return [row, ...list];
  const copy = list.slice();
  copy[i] = row;
  return copy;
}

let drillFetch: Promise<void> | null = null;
/** Relee el simulacro activo (sin la columna pesada `snapshot`). */
export function refreshDrill(qc: QueryClient) {
  if (drillFetch) return drillFetch;
  drillFetch = (async () => {
    const { data } = await getBrowserClient()
      .from("drill_runs")
      .select("id, organization_id, scenario, site_id, speed, status, sim_minutes, phase, started_by, started_at, last_step_at, ended_at, state")
      .neq("status", "finalizado")
      .limit(1);
    const drill = (data?.[0] as DrillRun | undefined) ?? null;
    qc.setQueryData<OrgLive>(ORG_LIVE_KEY, (d) => (d ? { ...d, drill, fetchedAt: Date.now() } : d));
  })().finally(() => {
    drillFetch = null;
  });
  return drillFetch;
}

// Una sola suscripción Realtime compartida por todos los componentes que usan useOrgLive
// (Supabase no permite registrar callbacks en un canal ya suscrito).
const shared: { count: number; channel: ReturnType<ReturnType<typeof getBrowserClient>["channel"]> | null } = { count: 0, channel: null };

function startRealtime(qc: QueryClient) {
  const sb = getBrowserClient();
  const patch = (fn: (d: OrgLive) => OrgLive) =>
    qc.setQueryData<OrgLive>(ORG_LIVE_KEY, (d) => (d ? { ...fn(d), fetchedAt: Date.now() } : d));
  return sb
    .channel(channelName("org-live"))
    .on("postgres_changes", { event: "UPDATE", schema: "geriam", table: "sensors" }, (p) => {
      const row = p.new as Sensor;
      patch((d) => ({ ...d, sensors: d.sensors.map((s) => (s.id === row.id ? row : s)) }));
    })
    .on("postgres_changes", { event: "*", schema: "geriam", table: "alerts" }, (p) => {
      if (p.eventType === "DELETE") {
        const old = p.old as Partial<Alert>;
        patch((d) => ({ ...d, alerts: d.alerts.filter((a) => a.id !== old.id) }));
        return;
      }
      const row = p.new as Alert;
      patch((d) => ({
        ...d,
        alerts: row.status === "resuelta" ? d.alerts.filter((a) => a.id !== row.id) : upsertById(d.alerts, row),
      }));
    })
    .on("postgres_changes", { event: "*", schema: "geriam", table: "drill_runs" }, (p) => {
      if (p.eventType === "DELETE") {
        patch((d) => ({ ...d, drill: null }));
        return;
      }
      // Realtime recorta cargas grandes (drill.state): si faltan campos, se pide la fila completa.
      const row = p.new as Partial<DrillRun>;
      if (row.status === "finalizado") {
        patch((d) => ({ ...d, drill: null }));
        return;
      }
      if (row.id && row.scenario && row.status && row.site_id) {
        patch((d) => ({ ...d, drill: { ...(d.drill?.id === row.id ? d.drill : {}), ...row } as DrillRun }));
      } else {
        void refreshDrill(qc);
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "geriam", table: "gateways" }, (p) => {
      const row = p.new as Gateway;
      patch((d) => ({ ...d, gateways: d.gateways.map((g) => (g.id === row.id ? row : g)) }));
    })
    .subscribe();
}

/** Estado vivo de la organización: carga inicial + Realtime (sensores, alertas, simulacro, gateways). */
export function useOrgLive() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ORG_LIVE_KEY, queryFn: fetchOrgLive, refetchInterval: 60_000 });

  useEffect(() => {
    shared.count += 1;
    if (!shared.channel) shared.channel = startRealtime(qc);
    return () => {
      shared.count -= 1;
      if (shared.count === 0 && shared.channel) {
        const ch = shared.channel;
        shared.channel = null;
        void getBrowserClient().removeChannel(ch);
      }
    };
  }, [qc]);

  return query;
}

const ALERT_LEVEL_ORDER: Record<string, number> = { roja: 3, naranja: 2, amarilla: 1 };

export function sortAlerts(alerts: Alert[]): Alert[] {
  return alerts
    .slice()
    .sort((a, b) => (ALERT_LEVEL_ORDER[b.level] ?? 0) - (ALERT_LEVEL_ORDER[a.level] ?? 0) || b.started_at.localeCompare(a.started_at));
}

/** Antigüedad máxima antes de considerar "sin datos". */
export function isStale(sensor: Sensor, now = Date.now()): boolean {
  if (!sensor.last_reading_at) return true;
  return now - new Date(sensor.last_reading_at).getTime() > sensor.report_interval_s * 3 * 1000;
}

export interface SiteSummary {
  site: Site;
  level: StatusLevel;
  nivel: Sensor | undefined;
  qin: Sensor | undefined;
  qout: Sensor | undefined;
  rain: Sensor | undefined;
  starlink: Sensor | undefined;
  ups: Sensor | undefined;
  gateway: Gateway | undefined;
  fillPct: number | null;
  linkOnline: boolean;
  alerts: Alert[];
  offlineSensors: Sensor[];
}

export function summarizeSites(data: OrgLive | undefined, now = Date.now()): SiteSummary[] {
  if (!data) return [];
  return data.sites.map((site) => {
    const sensors = data.sensors.filter((s) => s.site_id === site.id && !(s.metadata as { downstream_point?: string | null })?.downstream_point);
    const by = (t: string) => sensors.find((s) => s.type === t);
    const nivel = by("nivel_radar");
    const starlink = by("starlink");
    const gateway = data.gateways.find((g) => g.site_id === site.id);
    const alerts = sortAlerts(data.alerts.filter((a) => a.site_id === site.id));
    const linkOnline = gateway ? gateway.status !== "offline" : true;
    const offlineSensors = sensors.filter((s) => s.status === "offline" || isStale(s, now));
    let level: StatusLevel = "normal";
    for (const a of alerts) if (LEVEL_RANK[a.level as StatusLevel] > LEVEL_RANK[level]) level = a.level as StatusLevel;
    if (level === "normal" && !linkOnline) level = "sin_datos";
    else if (level === "normal" && offlineSensors.length > 0) level = "offline";
    return {
      site,
      level,
      nivel,
      qin: by("caudal_entrada"),
      qout: by("caudal_salida"),
      rain: by("pluviometro"),
      starlink,
      ups: by("energia_ups"),
      gateway,
      fillPct: fillPercent(siteCurve(site), nivel?.last_value, Number(site.capacity_m3)),
      linkOnline,
      alerts,
      offlineSensors,
    };
  });
}

export function useSiteSummaries(data: OrgLive | undefined, now?: number) {
  return useMemo(() => summarizeSites(data, now), [data, now]);
}

export function globalLevel(data: OrgLive | undefined): StatusLevel {
  if (!data) return "sin_datos";
  let lvl: StatusLevel = "normal";
  for (const a of data.alerts) if (LEVEL_RANK[a.level as StatusLevel] > LEVEL_RANK[lvl]) lvl = a.level as StatusLevel;
  return lvl;
}
