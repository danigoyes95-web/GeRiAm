/**
 * SIMULACRO: corre un escenario acelerado (x30/x60) sobre el estado real de un
 * embalse sin alterarlo. Las lecturas, alertas y notificaciones del simulacro
 * llevan drill_run_id; al finalizar se restaura el estado físico real.
 */
import { evaluate, type OpenAlert } from "../alerts/engine";
import { stepSite, type SiteState } from "../sim/physics";
import { emitReadings } from "../sim/telemetry";
import { SCENARIOS, type ScenarioId } from "../sim/scenarios";
import { volumeAt } from "../hydro/curve";
import {
  audit,
  evalRules,
  evalSensors,
  loadHistory,
  loadOrgBundle,
  paramsFor,
  rain24h,
  routesFor,
  simSensorsFor,
  toOpenAlert,
  type Admin,
  type OrgBundle,
} from "./repo";
import { applyEvaluation, runEscalations } from "./alerts";
import { insertReadings, readingRows, stateFor } from "./tick";

const HIST_TYPES = new Set(["nivel_radar", "piezometro", "asentamiento", "pluviometro", "inclinometro"]);
const CHUNK_S = 120;

export interface DrillState {
  sim: SiteState;
  startT: number; // ms (reloj simulado = real al iniciar)
  settleApplied: number;
  preRain24h: number;
  rainLog: { t: number; mm: number }[];
  last: Record<string, { v: number; t: number }>;
  hist: Record<string, { t: number; v: number }[]>;
  phase: string;
  events: { min: number; label: string }[];
}

const prefixOf = (drillId: string) => `D${drillId.slice(0, 8)}:`;

export async function startDrill(
  sb: Admin,
  args: { orgId: string; siteId: string; scenario: ScenarioId; speed: number; actor: { id: string; name: string } },
) {
  const b = await loadOrgBundle(sb, args.orgId);
  if (b.drill) throw new Error("Ya hay un simulacro en curso");
  const site = b.sites.find((s) => s.id === args.siteId);
  if (!site) throw new Error("Embalse no encontrado");
  const now = Date.now();
  const p = paramsFor(site);
  const real = stateFor(b, site, now);
  const sim: SiteState = { ...real, t: now, lastEmit: {}, battery: { ...real.battery }, outHist: real.outHist.slice(), storm: null, drizzleMin: 0 };
  const def = SCENARIOS[args.scenario];
  if (def.startOffsetNamo !== null) {
    sim.cota = Math.max(real.cota, p.namo + def.startOffsetNamo);
    sim.v = volumeAt(p.curve, sim.cota);
  }
  const last: DrillState["last"] = {};
  for (const s of b.sensors.filter((x) => x.site_id === site.id)) {
    if (s.last_value !== null && s.last_reading_at) last[s.id] = { v: s.last_value, t: new Date(s.last_reading_at).getTime() };
  }
  const state: DrillState = {
    sim,
    startT: now,
    settleApplied: 0,
    preRain24h: await rain24h(sb, site.id, now),
    rainLog: [],
    last,
    hist: {},
    phase: "inicio",
    events: [{ min: 0, label: `Inicio del simulacro: ${def.title}` }],
  };
  const ins = await sb
    .from("drill_runs")
    .insert({
      organization_id: b.org.id,
      scenario: args.scenario,
      site_id: site.id,
      speed: args.speed,
      status: "activo",
      sim_minutes: 0,
      phase: "inicio",
      started_by: args.actor.id,
      snapshot: { sim_state: real } as never,
      state: state as never,
    })
    .select("*")
    .single();
  if (ins.error) throw new Error(/unique|duplicate/i.test(ins.error.message) ? "Ya hay un simulacro en curso" : ins.error.message);
  await audit(sb, b.org.id, "simulacro.iniciado", "drill_run", ins.data.id, { scenario: args.scenario, site: site.code, speed: args.speed }, args.actor, ins.data.id);
  return ins.data;
}

export async function stepDrill(sb: Admin, drillId: string, realDtS: number) {
  const dr = await sb.from("drill_runs").select("*").eq("id", drillId).single();
  if (dr.error) throw new Error(dr.error.message);
  const drill = dr.data;
  if (drill.status !== "activo") return drill;
  const b = await loadOrgBundle(sb, drill.organization_id);
  return advance(sb, b, drill, Math.min(realDtS * drill.speed, 3 * 3600));
}

async function advance(sb: Admin, b: OrgBundle, drill: NonNullable<OrgBundle["drill"]>, simDtS: number) {
  const site = b.sites.find((s) => s.id === drill.site_id);
  if (!site) throw new Error("sitio del simulacro no existe");
  const def = SCENARIOS[drill.scenario as ScenarioId];
  const st = drill.state as unknown as DrillState;
  const p = paramsFor(site);
  const sensors = simSensorsFor(b, site);
  const others: Record<string, SiteState> = {};
  for (const s of b.sites) if (s.id !== site.id) others[s.code] = stateFor(b, s, Date.now());

  let simMin = drill.sim_minutes;
  let remaining = Math.max(0, simDtS);
  const rows: ReturnType<typeof readingRows> = [];
  const nowReal = Date.now();
  const nChunks = Math.max(1, Math.ceil(remaining / CHUNK_S));
  let chunkIdx = 0;
  let phaseLabel = st.phase;
  while (remaining > 0) {
    const dt = Math.min(CHUNK_S, remaining);
    remaining -= dt;
    const ph = def.at(simMin);
    const settleTarget = ph.settleOffset ?? 0;
    const forcing = { ...ph.forcing, settleJump: settleTarget - st.settleApplied || undefined };
    st.settleApplied = settleTarget;
    st.sim = stepSite(p, st.sim, dt, forcing);
    simMin += dt / 60;
    if (ph.phase !== st.phase) {
      st.events.push({ min: Math.round(simMin), label: ph.narrative });
      await audit(sb, b.org.id, "simulacro.fase", "drill_run", drill.id, { phase: ph.phase, narrative: ph.narrative, sim_min: Math.round(simMin) }, undefined, drill.id);
      st.phase = ph.phase;
      phaseLabel = ph.phase;
    }
    const em = { ...st.sim, lastEmit: { ...st.sim.lastEmit }, battery: { ...st.sim.battery } };
    const readings = emitReadings(em, sensors, { ...others, [site.code]: em }, { mode: "live", packetLoss: 0.005 });
    st.sim = em;
    const ts = new Date(nowReal - (nChunks - 1 - chunkIdx) * 50).toISOString();
    chunkIdx++;
    for (const r of readings) {
      r.raw = { ...r.raw, sim_t: em.t, sim_min: Math.round(simMin * 10) / 10 };
      st.last[r.sensorId] = { v: r.value, t: em.t };
      const sensor = sensors.find((x) => x.id === r.sensorId);
      if (sensor && HIST_TYPES.has(sensor.type)) {
        const h = (st.hist[r.sensorId] ??= []);
        h.push({ t: em.t, v: r.value });
        while (h.length && h[0].t < em.t - 6.5 * 3600 * 1000) h.shift();
      }
      if (sensor?.type === "pluviometro" && r.value > 0) st.rainLog.push({ t: em.t, mm: r.value });
    }
    rows.push(...readingRows(b.org.id, em, readings, drill.id, ts));
  }
  st.rainLog = st.rainLog.filter((x) => x.t > st.sim.t - 24 * 3600 * 1000);
  await insertReadings(sb, rows);

  // Evaluación de alertas en reloj simulado
  const simNow = st.sim.t;
  const ids = b.sensors.filter((s) => s.site_id === site.id).map((s) => s.id);
  const pre = await loadHistory(sb, ids, st.startT - 6.5 * 3600 * 1000, st.startT);
  const history: Record<string, { t: number; v: number }[]> = {};
  for (const id of ids) history[id] = [...(pre[id] ?? []), ...(st.hist[id] ?? [])];
  const overrides: Record<string, { value: number | null; at: number | null }> = {};
  for (const id of ids) overrides[id] = st.last[id] ? { value: st.last[id].v, at: st.last[id].t } : { value: null, at: null };
  const prefix = prefixOf(drill.id);
  const openQ = await sb.from("alerts").select("*").eq("drill_run_id", drill.id).neq("status", "resuelta");
  const openRows = openQ.data ?? [];
  const open: OpenAlert[] = openRows.map((a) => {
    const o = toOpenAlert(a);
    const tv = (a.trigger_values ?? {}) as { sim_started_min?: number };
    return {
      ...o,
      dedupeKey: a.dedupe_key.replace(prefix, ""),
      lastTriggeredAt: simNow - 3_600_000, // en simulacro solo se auto-resuelven las de comunicación (filtro abajo)
      startedAt: tv.sim_started_min !== undefined ? st.startT + tv.sim_started_min * 60_000 : simNow,
    };
  });
  const rain = st.preRain24h * Math.max(0, 1 - (simNow - st.startT) / (24 * 3600 * 1000)) + st.rainLog.reduce((a, x) => a + x.mm, 0);
  const result = evaluate({
    now: simNow,
    site: { id: site.id, code: site.code, name: site.name, zoneId: site.zone_id, namo: p.namo, cresta: p.cresta },
    sensors: evalSensors(b, site, overrides),
    history,
    rain24h: rain,
    rules: evalRules(b, site),
    open,
    routes: routesFor(b, site),
  });
  // resolución en simulacro: solo comunicación (al restablecerse el enlace)
  result.resolve = result.resolve.filter((r) => r.alert.type === "comunicacion");
  for (const d of result.drafts) {
    d.dedupeKey = prefix + d.dedupeKey;
    if (d.existing) d.existing = openRows.map((a) => toOpenAlert(a)).find((a) => a.id === d.existing?.id) ?? d.existing;
  }
  // Si el simulacro se finalizó mientras se calculaba este paso, no se tocan alertas ni estado.
  const still = await sb.from("drill_runs").select("status").eq("id", drill.id).single();
  if (still.data?.status === "finalizado") return { ...drill, status: "finalizado" };
  await applyEvaluation(sb, b, site, result, { now: simNow, drillRunId: drill.id, simMinutes: Math.round(simMin) });
  await runEscalations(sb, b, openRows, { now: simNow, drillRunId: drill.id, simStartMs: st.startT });

  const done = simMin >= def.durationMin;
  if (done && !st.events.some((e) => e.label.startsWith("Fin del escenario"))) st.events.push({ min: Math.round(simMin), label: "Fin del escenario (en pausa)" });
  const up = await sb
    .from("drill_runs")
    .update({ sim_minutes: simMin, phase: phaseLabel, last_step_at: new Date().toISOString(), state: st as never, ...(done ? { status: "pausado" } : {}) })
    .eq("id", drill.id)
    .neq("status", "finalizado")
    .select("*")
    .maybeSingle();
  if (!up.data && !up.error) return { ...drill, status: "finalizado" };
  if (up.error) throw new Error(up.error.message);
  return up.data;
}

export async function controlDrill(
  sb: Admin,
  drillId: string,
  action: "pausar" | "reanudar" | "velocidad" | "adelantar" | "reiniciar" | "finalizar",
  actor: { id: string; name: string },
  arg?: number,
) {
  const dr = await sb.from("drill_runs").select("*").eq("id", drillId).single();
  if (dr.error) throw new Error(dr.error.message);
  const drill = dr.data;
  const orgId = drill.organization_id;
  if (action === "pausar" || action === "reanudar") {
    const r = await sb.from("drill_runs").update({ status: action === "pausar" ? "pausado" : "activo", last_step_at: new Date().toISOString() }).eq("id", drillId).select("*").single();
    await audit(sb, orgId, `simulacro.${action === "pausar" ? "pausado" : "reanudado"}`, "drill_run", drillId, {}, actor, drillId);
    return r.data;
  }
  if (action === "velocidad") {
    const speed = arg === 60 ? 60 : 30;
    const r = await sb.from("drill_runs").update({ speed }).eq("id", drillId).select("*").single();
    await audit(sb, orgId, "simulacro.velocidad", "drill_run", drillId, { speed }, actor, drillId);
    return r.data;
  }
  if (action === "adelantar") {
    const minutes = Math.min(120, Math.max(5, arg ?? 15));
    const b = await loadOrgBundle(sb, orgId);
    await audit(sb, orgId, "simulacro.adelantado", "drill_run", drillId, { minutes }, actor, drillId);
    return advance(sb, b, { ...drill, status: "activo" }, minutes * 60);
  }
  if (action === "reiniciar") {
    const snap = (drill.snapshot ?? {}) as { sim_state?: SiteState };
    const scenario = drill.scenario as ScenarioId;
    const siteId = drill.site_id;
    const speed = drill.speed;
    await finishDrill(sb, drill.id, snap, actor, true);
    return startDrill(sb, { orgId, siteId, scenario, speed, actor });
  }
  const snap = (drill.snapshot ?? {}) as { sim_state?: SiteState };
  await finishDrill(sb, drill.id, snap, actor, false);
  return null;
}

/** Finaliza: restaura el estado físico real y los últimos valores; opcionalmente purga los datos del simulacro. */
async function finishDrill(sb: Admin, drillId: string, snap: { sim_state?: SiteState }, actor: { id: string; name: string }, purge: boolean) {
  const dr = await sb.from("drill_runs").select("*").eq("id", drillId).single();
  if (dr.error) throw new Error(dr.error.message);
  const drill = dr.data;
  if (snap.sim_state) {
    await sb
      .from("sim_state")
      .update({ state: snap.sim_state as never, sim_time: new Date(snap.sim_state.t).toISOString(), updated_at: new Date().toISOString() })
      .eq("site_id", drill.site_id);
  }
  // Primero se marca finalizado (los pasos en curso lo verifican antes de escribir) y luego se cierran sus alertas.
  await sb.from("drill_runs").update({ status: "finalizado", ended_at: new Date().toISOString() }).eq("id", drillId);
  await sb.from("alerts").update({ status: "resuelta", resolved_at: new Date().toISOString() }).eq("drill_run_id", drillId).neq("status", "resuelta");
  if (purge) await sb.rpc("purge_drill", { p_drill: drillId });
  await sb.rpc("restore_last_values", { p_site: drill.site_id });
  await audit(sb, drill.organization_id, purge ? "simulacro.reiniciado" : "simulacro.finalizado", "drill_run", drillId, { sim_minutes: Math.round(drill.sim_minutes) }, actor, drillId);
}
