/**
 * Acceso a datos del runtime (tick del simulador, simulacro, motor de alertas).
 * Usa un cliente supabase-js con service_role inyectado (Node o Deno).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DB, GeriamSchema, Tables } from "../supabase/config";
import type { AlertLevel, SensorType, Thresholds } from "../domain/types";
import type { EvalRule, EvalSensor, OpenAlert, PolicyStep, Recipient, Route } from "../alerts/engine";
import type { SimSensor } from "../sim/telemetry";
import type { DownstreamStation } from "../sim/physics";
import { siteParamsFromRow } from "../sim/params";

export type Admin = SupabaseClient<DB, GeriamSchema>;
export type SiteRow = Tables<"sites">;
export type SensorRow = Tables<"sensors">;
export type AlertRow = Tables<"alerts">;

export interface OrgBundle {
  org: Tables<"organizations">;
  sites: SiteRow[];
  sensors: SensorRow[];
  gateways: Tables<"gateways">[];
  rules: Tables<"alert_rules">[];
  points: Tables<"downstream_points">[];
  routes: Tables<"site_downstream">[];
  policies: Tables<"escalation_policies">[];
  profiles: Tables<"profiles">[];
  simStates: Tables<"sim_state">[];
  drill: Tables<"drill_runs"> | null;
}

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
}

export async function loadOrgBundle(sb: Admin, orgId: string): Promise<OrgBundle> {
  const [org, sites, sensors, gateways, rules, points, routes, policies, profiles, simStates, drills] = await Promise.all([
    sb.from("organizations").select("*").eq("id", orgId).single(),
    sb.from("sites").select("*").eq("organization_id", orgId).order("code"),
    sb.from("sensors").select("*").eq("organization_id", orgId).order("code"),
    sb.from("gateways").select("*").eq("organization_id", orgId),
    sb.from("alert_rules").select("*").eq("organization_id", orgId),
    sb.from("downstream_points").select("*").eq("organization_id", orgId),
    sb.from("site_downstream").select("*").eq("organization_id", orgId),
    sb.from("escalation_policies").select("*").eq("organization_id", orgId),
    sb.from("profiles").select("*").eq("organization_id", orgId).eq("active", true),
    sb.from("sim_state").select("*").eq("organization_id", orgId),
    sb.from("drill_runs").select("*").eq("organization_id", orgId).neq("status", "finalizado").limit(1),
  ]);
  return {
    org: must(org, "org"),
    sites: must(sites, "sites"),
    sensors: must(sensors, "sensors"),
    gateways: must(gateways, "gateways"),
    rules: must(rules, "rules"),
    points: must(points, "points"),
    routes: must(routes, "routes"),
    policies: must(policies, "policies"),
    profiles: must(profiles, "profiles"),
    simStates: must(simStates, "sim_state"),
    drill: must(drills, "drill")[0] ?? null,
  };
}

export async function listOrgIds(sb: Admin): Promise<string[]> {
  const r = await sb.from("organizations").select("id");
  return must(r, "orgs").map((o) => o.id);
}

export function sensorMeta(s: SensorRow): { downstream_point?: string | null } {
  return (s.metadata ?? {}) as { downstream_point?: string | null };
}

export function thresholdsOf(s: SensorRow): Thresholds | null {
  const t = s.thresholds as unknown as Thresholds | null;
  return t && typeof t === "object" && "direction" in t ? t : null;
}

/** Estaciones aguas abajo: base lateral + tránsito por sitio (en códigos de sitio). */
export function stationFor(b: OrgBundle, sensor: SensorRow): DownstreamStation | undefined {
  const point = b.points.find((p) => p.nivel_rio_sensor_id === sensor.id);
  if (!point) return undefined;
  const base = point.kind === "ciudad" ? 3.2 : (point.poblacion_expuesta ?? 0) > 1000 ? 2.0 : 1.2;
  const transit: Record<string, number> = {};
  for (const r of b.routes.filter((x) => x.point_id === point.id)) {
    const site = b.sites.find((s) => s.id === r.site_id);
    if (site) transit[site.code] = r.tiempo_transito_normal_min;
  }
  return { code: point.name, baseFlow: base, transit };
}

export function simSensorsFor(b: OrgBundle, site: SiteRow): SimSensor[] {
  return b.sensors
    .filter((s) => s.site_id === site.id && s.data_source === "simulado" && s.status !== "baja")
    .map((s) => {
      const station = stationFor(b, s);
      return {
        id: s.id,
        code: s.code,
        type: s.type as SensorType,
        intervalS: s.report_interval_s,
        station,
        lora: !!s.dev_eui && !station,
        baseRssi: Number(s.rssi ?? -100),
        baseSnr: Number(s.snr ?? 3),
      };
    });
}

export function paramsFor(site: SiteRow) {
  return siteParamsFromRow(site);
}

export function evalSensors(b: OrgBundle, site: SiteRow, overrides?: Record<string, { value: number | null; at: number | null }>): EvalSensor[] {
  return b.sensors
    .filter((s) => s.site_id === site.id)
    .map((s) => {
      const o = overrides?.[s.id];
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        type: s.type as SensorType,
        unit: s.unit,
        decimals: s.decimals,
        intervalS: s.report_interval_s,
        thresholds: thresholdsOf(s),
        lastValue: o ? o.value : s.last_value,
        lastAt: o ? o.at : s.last_reading_at ? new Date(s.last_reading_at).getTime() : null,
        downstream: !!sensorMeta(s).downstream_point,
        status: s.status,
      };
    });
}

export function evalRules(b: OrgBundle, site: SiteRow): EvalRule[] {
  return b.rules
    .filter((r) => r.site_id === site.id || (r.site_id === null && r.sensor_id === null))
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      kind: r.kind as EvalRule["kind"],
      level: r.level as AlertLevel,
      params: (r.params ?? {}) as Record<string, unknown>,
      enabled: r.enabled,
      cooldownMin: r.cooldown_min,
    }));
}

export function routesFor(b: OrgBundle, site: SiteRow): Route[] {
  return b.routes
    .filter((r) => r.site_id === site.id)
    .map((r) => {
      const p = b.points.find((x) => x.id === r.point_id);
      return {
        pointId: r.point_id,
        name: p?.name ?? "—",
        zoneId: p?.zone_id ?? null,
        llegadaMin: r.tiempo_llegada_min,
        transitoMin: r.tiempo_transito_normal_min,
        poblacion: p?.poblacion_expuesta ?? null,
        kind: p?.kind ?? "poblado",
      };
    });
}

export function policySteps(b: OrgBundle): PolicyStep[] {
  return b.policies.map((p) => ({ level: p.level as AlertLevel, step: p.step, afterMin: p.after_min, roles: p.roles, channels: p.channels }));
}

export function recipients(b: OrgBundle): Recipient[] {
  return b.profiles.map((p) => ({ userId: p.id, name: p.full_name, role: p.role, phone: p.phone, zoneIds: p.zone_ids, channels: p.channels }));
}

export function toOpenAlert(a: AlertRow, startedAtOverride?: number): OpenAlert {
  return {
    id: a.id,
    dedupeKey: a.dedupe_key,
    level: a.level as AlertLevel,
    status: a.status,
    lastTriggeredAt: new Date(a.last_triggered_at).getTime(),
    startedAt: startedAtOverride ?? new Date(a.started_at).getTime(),
    type: a.type as OpenAlert["type"],
  };
}

/** Historial reciente (≥ 6 h) de los sensores de un sitio, excluyendo simulacros. */
export async function loadHistory(sb: Admin, sensorIds: string[], sinceMs: number, untilMs?: number): Promise<Record<string, { t: number; v: number }[]>> {
  const out: Record<string, { t: number; v: number }[]> = {};
  if (!sensorIds.length) return out;
  let q = sb
    .from("readings")
    .select("sensor_id, ts, value")
    .in("sensor_id", sensorIds)
    .is("drill_run_id", null)
    .gte("ts", new Date(sinceMs).toISOString())
    .order("ts", { ascending: true })
    .limit(20000);
  if (untilMs) q = q.lte("ts", new Date(untilMs).toISOString());
  const r = await q;
  for (const row of must(r, "history")) {
    (out[row.sensor_id] ??= []).push({ t: new Date(row.ts).getTime(), v: row.value });
  }
  return out;
}

export async function rain24h(sb: Admin, siteId: string, atMs: number): Promise<number> {
  const r = await sb.rpc("rain_totals", { p_site: siteId, p_at: new Date(atMs).toISOString() });
  const rows = must(r, "rain_totals") as { h1: number; h24: number; h72: number }[];
  return rows[0]?.h24 ?? 0;
}

export async function audit(
  sb: Admin,
  orgId: string,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>,
  actor?: { id: string | null; name: string },
  drillRunId?: string | null,
) {
  await sb.from("audit_log").insert({
    organization_id: orgId,
    actor_id: actor?.id ?? null,
    actor_name: actor?.name ?? "Sistema GeRiAm",
    action,
    entity,
    entity_id: entityId,
    details: details as never,
    drill_run_id: drillRunId ?? null,
  });
}
