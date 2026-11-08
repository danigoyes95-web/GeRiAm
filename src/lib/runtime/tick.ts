/**
 * Tick del simulador en vivo (pg_cron → Edge Function geriam-simulator-tick, o
 * fallback de servidor en modo demo). Avanza la física de cada embalse hasta
 * "ahora", inserta lecturas, actualiza gateways/telemetría y evalúa alertas.
 */
import { evaluate } from "../alerts/engine";
import { initialState, stepSite, type SiteState } from "../sim/physics";
import { emitReadings, type EmittedReading } from "../sim/telemetry";
import { hashSeed } from "../sim/prng";
import {
  evalRules,
  evalSensors,
  listOrgIds,
  loadHistory,
  loadOrgBundle,
  paramsFor,
  rain24h,
  routesFor,
  simSensorsFor,
  toOpenAlert,
  type Admin,
  type OrgBundle,
  type SiteRow,
} from "./repo";
import { applyEvaluation, runEscalations } from "./alerts";
import { stepDrill } from "./drill";

const STEP_BACKFILL_S = 900;
const MAX_CATCHUP_MS = 24 * 3600 * 1000;

export interface TickSummary {
  orgs: number;
  readings: number;
  sites: string[];
  alertsEvaluated: number;
  escalations: number;
  drillStepped: boolean;
  ms: number;
}

export function readingRows(orgId: string, site: SiteState, readings: EmittedReading[], drillRunId: string | null = null, tsOverride?: string) {
  const ts = tsOverride ?? new Date(site.t).toISOString();
  return readings.map((r) => ({
    sensor_id: r.sensorId,
    ts,
    value: r.value,
    quality: r.quality,
    organization_id: orgId,
    drill_run_id: drillRunId,
    raw: r.raw as never,
  }));
}

export async function insertReadings(sb: Admin, rows: ReturnType<typeof readingRows>) {
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const r = await sb.from("readings").upsert(chunk, { onConflict: "sensor_id,ts", ignoreDuplicates: true });
    if (r.error) throw new Error(`readings: ${r.error.message}`);
  }
}

export function stateFor(b: OrgBundle, site: SiteRow, fallbackT: number): SiteState {
  const row = b.simStates.find((s) => s.site_id === site.id);
  if (row) return row.state as unknown as SiteState;
  const p = paramsFor(site);
  return initialState(p, p.namo - 0.6, fallbackT, hashSeed(site.code));
}

export async function saveStates(sb: Admin, b: OrgBundle, states: Record<string, SiteState>) {
  const rows = b.sites
    .filter((s) => states[s.code])
    .map((s) => ({ site_id: s.id, organization_id: b.org.id, sim_time: new Date(states[s.code].t).toISOString(), state: states[s.code] as never, updated_at: new Date().toISOString() }));
  if (!rows.length) return;
  const r = await sb.from("sim_state").upsert(rows, { onConflict: "site_id" });
  if (r.error) throw new Error(`sim_state: ${r.error.message}`);
}

async function evaluateSite(sb: Admin, b: OrgBundle, site: SiteRow, now: number, overrides: Record<string, { value: number | null; at: number | null }>) {
  const ids = b.sensors.filter((s) => s.site_id === site.id).map((s) => s.id);
  const [history, rain, open] = await Promise.all([
    loadHistory(sb, ids, now - 6.5 * 3600 * 1000),
    rain24h(sb, site.id, now),
    sb.from("alerts").select("*").eq("organization_id", b.org.id).eq("site_id", site.id).neq("status", "resuelta").is("drill_run_id", null),
  ]);
  if (open.error) throw new Error(open.error.message);
  const p = paramsFor(site);
  const result = evaluate({
    now,
    site: { id: site.id, code: site.code, name: site.name, zoneId: site.zone_id, namo: p.namo, cresta: p.cresta },
    sensors: evalSensors(b, site, overrides),
    history,
    rain24h: rain,
    rules: evalRules(b, site),
    open: (open.data ?? []).map((a) => toOpenAlert(a)),
    routes: routesFor(b, site),
  });
  await applyEvaluation(sb, b, site, result, { now });
  return result.drafts.length;
}

export async function tickOrg(sb: Admin, orgId: string, now: number): Promise<Omit<TickSummary, "orgs" | "ms">> {
  const b = await loadOrgBundle(sb, orgId);
  const drillSite = b.drill?.site_id ?? null;
  const sites = b.sites.filter((s) => s.data_source === "simulado" && s.id !== drillSite);
  const states: Record<string, SiteState> = {};
  for (const s of b.sites) states[s.code] = stateFor(b, s, now - 60_000);

  const rows: ReturnType<typeof readingRows> = [];
  const overrides: Record<string, { value: number | null; at: number | null }> = {};
  const collect = (site: SiteRow, st: SiteState, readings: EmittedReading[]) => {
    rows.push(...readingRows(b.org.id, st, readings));
    for (const r of readings) overrides[r.sensorId] = { value: r.value, at: st.t };
  };

  // Recuperación tras un hueco (cron detenido): pasos de 15 min, máx. 24 h.
  for (const site of sites) {
    const st = states[site.code];
    if (now - st.t > MAX_CATCHUP_MS) st.t = now - MAX_CATCHUP_MS;
  }
  const lag = () => Math.max(0, ...sites.map((s) => now - states[s.code].t));
  while (sites.length && lag() > 20 * 60_000) {
    for (const site of sites) {
      const st = states[site.code];
      if (now - st.t <= 20 * 60_000) continue;
      states[site.code] = stepSite(paramsFor(site), st, STEP_BACKFILL_S);
    }
    for (const site of sites) {
      const st = { ...states[site.code], lastEmit: { ...states[site.code].lastEmit }, battery: { ...states[site.code].battery } };
      const readings = emitReadings(st, simSensorsFor(b, site), states, { mode: "backfill", stepS: STEP_BACKFILL_S });
      states[site.code] = st;
      collect(site, st, readings);
    }
  }
  // Paso en vivo hasta ahora
  for (const site of sites) {
    const dt = Math.round((now - states[site.code].t) / 1000);
    if (dt > 0) states[site.code] = stepSite(paramsFor(site), states[site.code], dt);
  }
  for (const site of sites) {
    const st = { ...states[site.code], lastEmit: { ...states[site.code].lastEmit }, battery: { ...states[site.code].battery } };
    const readings = emitReadings(st, simSensorsFor(b, site), states, { mode: "live" });
    states[site.code] = st;
    collect(site, st, readings);
  }

  await insertReadings(sb, rows);
  await saveStates(sb, b, Object.fromEntries(sites.map((s) => [s.code, states[s.code]])));

  // Gateways (enlace Starlink) y telemetría de nodos
  const nowIso = new Date(now).toISOString();
  const quarter = Math.floor(now / 900_000) !== Math.floor((now - 60_000) / 900_000);
  for (const site of sites) {
    const st = states[site.code];
    const gw = b.gateways.find((g) => g.site_id === site.id);
    if (gw) {
      const status = st.stlOnline ? (st.stlLatency > 150 ? "degradado" : "online") : "offline";
      if (status !== gw.status || st.stlOnline) {
        await sb.from("gateways").update({ status, ...(st.stlOnline ? { last_seen_at: nowIso } : {}) }).eq("id", gw.id);
      }
    }
    if (quarter) {
      for (const r of rows.filter((x) => b.sensors.find((s) => s.id === x.sensor_id)?.site_id === site.id)) {
        const raw = r.raw as unknown as { battery?: number; rssi?: number; snr?: number };
        if (raw.battery === undefined) continue;
        await sb.from("sensors").update({ battery_pct: raw.battery, rssi: raw.rssi, snr: raw.snr }).eq("id", r.sensor_id);
      }
    }
  }

  // Alertas
  let evaluated = 0;
  for (const site of b.sites.filter((s) => s.id !== drillSite)) evaluated += await evaluateSite(sb, b, site, now, overrides);
  const openAll = await sb.from("alerts").select("*").eq("organization_id", b.org.id).neq("status", "resuelta").is("drill_run_id", null);
  const escalations = await runEscalations(sb, b, openAll.data ?? [], { now });

  // Simulacro sin conductor (página cerrada): el cron lo mantiene avanzando.
  let drillStepped = false;
  if (b.drill && b.drill.status === "activo" && now - new Date(b.drill.last_step_at).getTime() > 30_000) {
    await stepDrill(sb, b.drill.id, (now - new Date(b.drill.last_step_at).getTime()) / 1000);
    drillStepped = true;
  }
  return { readings: rows.length, sites: sites.map((s) => s.code), alertsEvaluated: evaluated, escalations, drillStepped };
}

export async function runTick(sb: Admin, now = Date.now()): Promise<TickSummary> {
  const t0 = Date.now();
  const orgs = await listOrgIds(sb);
  const acc: TickSummary = { orgs: orgs.length, readings: 0, sites: [], alertsEvaluated: 0, escalations: 0, drillStepped: false, ms: 0 };
  for (const id of orgs) {
    const r = await tickOrg(sb, id, now);
    acc.readings += r.readings;
    acc.sites.push(...r.sites);
    acc.alertsEvaluated += r.alertsEvaluated;
    acc.escalations += r.escalations;
    acc.drillStepped ||= r.drillStepped;
  }
  acc.ms = Date.now() - t0;
  return acc;
}
