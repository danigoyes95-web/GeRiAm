/**
 * SIMULACRO: corre un escenario acelerado (x30/x60) sobre el estado real de un
 * embalse sin alterarlo. Las lecturas, alertas y notificaciones del simulacro
 * llevan drill_run_id; al finalizar se restaura el estado físico real.
 */
import { evaluate, type OpenAlert } from "../alerts/engine";
import { stepSite, type SiteState } from "../sim/physics";
import { emitReadings } from "../sim/telemetry";
import { ROTURA_STAGGER, SCENARIOS, type ScenarioId } from "../sim/scenarios";
import { DEBRIS, type Debris } from "../flood/impact";
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

/** Estado de simulacro de un embalse. */
export interface SiteDrill {
  sim: SiteState;
  settleApplied: number;
  preRain24h: number;
  rainLog: { t: number; mm: number }[];
  last: Record<string, { v: number; t: number }>;
  hist: Record<string, { t: number; v: number }[]>;
  /** desfase del escenario para este embalse (min) */
  offsetMin?: number;
  /** pasivo: evoluciona sin forzamiento (p. ej. dueño de las estaciones del río) */
  passive?: boolean;
  phase?: string;
}

/** El embalse principal guarda su estado en la raíz; los demás en `extra` (rotura de varias presas). */
export interface DrillState extends SiteDrill {
  startT: number; // ms (reloj simulado = real al iniciar)
  phase: string;
  events: { min: number; label: string }[];
  extra?: Record<string, SiteDrill>;
  /** rotura: lo que arrastra la crecida (agua, escombros o lodo) */
  debris?: Debris;
  /** embalses del simulacro sin su estado físico (lo lee el cliente: la columna snapshot no se le envía) */
  sites?: { id: string; code: string; role: DrillSnapshotSite["role"]; offset_min: number }[];
}

/** Embalses de un simulacro, tal como se guardan en drill_runs.snapshot (lo lee también el cliente). */
export interface DrillSnapshotSite {
  id: string;
  code: string;
  role: "rotura" | "principal" | "pasivo";
  offset_min: number;
  sim_state: SiteState;
}

export function drillSiteIds(drill: { site_id: string; snapshot?: unknown } | null | undefined): string[] {
  if (!drill) return [];
  const sites = ((drill.snapshot ?? {}) as { sites?: DrillSnapshotSite[] }).sites;
  return sites?.length ? sites.map((s) => s.id) : [drill.site_id];
}

const prefixOf = (drillId: string) => `D${drillId.slice(0, 8)}:`;

async function siteDrillFor(
  sb: Admin,
  b: OrgBundle,
  site: OrgBundle["sites"][number],
  now: number,
  startOffsetNamo: number | null,
) {
  const p = paramsFor(site);
  const real = stateFor(b, site, now);
  const sim: SiteState = {
    ...real,
    t: now,
    lastEmit: {},
    battery: { ...real.battery },
    outHist: real.outHist.slice(),
    storm: null,
    drizzleMin: 0,
  };
  if (startOffsetNamo !== null) {
    sim.cota = Math.max(real.cota, p.namo + startOffsetNamo);
    sim.v = volumeAt(p.curve, sim.cota);
  }
  const last: SiteDrill["last"] = {};
  for (const s of b.sensors.filter((x) => x.site_id === site.id)) {
    if (s.last_value !== null && s.last_reading_at)
      last[s.id] = { v: s.last_value, t: new Date(s.last_reading_at).getTime() };
  }
  const sd: SiteDrill = {
    sim,
    settleApplied: 0,
    preRain24h: await rain24h(sb, site.id, now),
    rainLog: [],
    last,
    hist: {},
  };
  return { sd, real };
}

export async function startDrill(
  sb: Admin,
  args: {
    orgId: string;
    siteId: string;
    scenario: ScenarioId;
    speed: number;
    actor: { id: string; name: string };
    extraSiteIds?: string[];
    debris?: Debris;
  },
) {
  const b = await loadOrgBundle(sb, args.orgId);
  if (b.drill) throw new Error("Ya hay un simulacro en curso");
  const site = b.sites.find((s) => s.id === args.siteId);
  if (!site) throw new Error("Embalse no encontrado");
  const now = Date.now();
  const def = SCENARIOS[args.scenario];
  const { sd, real } = await siteDrillFor(sb, b, site, now, def.startOffsetNamo);
  const state: DrillState = {
    ...sd,
    offsetMin: 0,
    startT: now,
    phase: "inicio",
    events: [{ min: 0, label: `Inicio del simulacro: ${def.title}` }],
  };
  const snapSites: DrillSnapshotSite[] = [
    {
      id: site.id,
      code: site.code,
      role: def.multiSite ? "rotura" : "principal",
      offset_min: 0,
      sim_state: real,
    },
  ];
  if (def.multiSite) {
    state.debris = args.debris ?? "agua";
    // presas adicionales que fallan (desfasadas) + embalses dueños de las estaciones del río (pasivos)
    const extra = (args.extraSiteIds ?? []).filter((id, i, a) => id !== site.id && a.indexOf(id) === i);
    const stationOwners = b.sites
      .filter((s) =>
        b.sensors.some((x) => x.site_id === s.id && b.points.some((p) => p.nivel_rio_sensor_id === x.id)),
      )
      .map((s) => s.id);
    const ids = [...extra, ...stationOwners.filter((id) => id !== site.id && !extra.includes(id))];
    state.extra = {};
    for (const id of ids) {
      const other = b.sites.find((s) => s.id === id);
      if (!other) throw new Error("Embalse no encontrado");
      const passive = !extra.includes(id);
      const offset = passive ? 0 : (extra.indexOf(id) + 1) * ROTURA_STAGGER;
      const r = await siteDrillFor(sb, b, other, now, passive ? null : def.startOffsetNamo);
      state.extra[id] = { ...r.sd, offsetMin: offset, passive, phase: "inicio" };
      snapSites.push({
        id,
        code: other.code,
        role: passive ? "pasivo" : "rotura",
        offset_min: offset,
        sim_state: r.real,
      });
    }
    const names = snapSites
      .filter((x) => x.role === "rotura")
      .map((x) => b.sites.find((s) => s.id === x.id)?.name.replace("Embalse ", "") ?? x.code);
    state.events = [
      {
        min: 0,
        label: `Inicio del simulacro: ${def.title} (${names.join(" + ")}) · ${DEBRIS[state.debris].label.toLowerCase()}`,
      },
    ];
  }
  state.sites = snapSites.map(({ id, code, role, offset_min }) => ({ id, code, role, offset_min }));
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
      snapshot: { sim_state: real, sites: snapSites } as never,
      state: state as never,
    })
    .select("*")
    .single();
  if (ins.error)
    throw new Error(
      /unique|duplicate/i.test(ins.error.message) ? "Ya hay un simulacro en curso" : ins.error.message,
    );
  await audit(
    sb,
    b.org.id,
    "simulacro.iniciado",
    "drill_run",
    ins.data.id,
    {
      scenario: args.scenario,
      site: snapSites
        .filter((x) => x.role !== "pasivo")
        .map((x) => x.code)
        .join(" + "),
      speed: args.speed,
    },
    args.actor,
    ins.data.id,
  );
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
  const entries = [
    { site, sd: st as SiteDrill, primary: true },
    ...Object.entries(st.extra ?? {}).flatMap(([id, sd]) => {
      const s = b.sites.find((x) => x.id === id);
      return s ? [{ site: s, sd, primary: false }] : [];
    }),
  ].map((e) => ({ ...e, p: paramsFor(e.site), sensors: simSensorsFor(b, e.site) }));
  // los escombros aumentan el volumen de la onda que ven las estaciones del río
  const bulking = st.debris ? DEBRIS[st.debris].bulking : 1;
  for (const e of entries) for (const sn of e.sensors) if (sn.station) sn.station.bulking = bulking;
  const inDrill = new Set(entries.map((e) => e.site.id));
  const others: Record<string, SiteState> = {};
  for (const s of b.sites) if (!inDrill.has(s.id)) others[s.code] = stateFor(b, s, Date.now());

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
    for (const e of entries) {
      const sd = e.sd;
      if (sd.passive) {
        sd.sim = stepSite(e.p, sd.sim, dt);
        continue;
      }
      const ph = def.at(simMin - (sd.offsetMin ?? 0));
      const settleTarget = ph.settleOffset ?? 0;
      const forcing = { ...ph.forcing, settleJump: settleTarget - sd.settleApplied || undefined };
      sd.settleApplied = settleTarget;
      sd.sim = stepSite(e.p, sd.sim, dt, forcing);
      const curPhase = e.primary ? st.phase : sd.phase;
      if (ph.phase !== curPhase) {
        const label = e.primary ? ph.narrative : `${e.site.name.replace("Embalse ", "")}: ${ph.narrative}`;
        if (ph.phase !== "espera") {
          st.events.push({ min: Math.round(simMin + dt / 60), label });
          await audit(
            sb,
            b.org.id,
            "simulacro.fase",
            "drill_run",
            drill.id,
            { phase: ph.phase, narrative: label, sim_min: Math.round(simMin + dt / 60) },
            undefined,
            drill.id,
          );
        }
        if (e.primary) {
          st.phase = ph.phase;
          phaseLabel = ph.phase;
        } else sd.phase = ph.phase;
      }
    }
    simMin += dt / 60;
    const all: Record<string, SiteState> = { ...others };
    for (const e of entries) all[e.site.code] = e.sd.sim;
    const ts = new Date(nowReal - (nChunks - 1 - chunkIdx) * 50).toISOString();
    chunkIdx++;
    for (const e of entries) {
      const sd = e.sd;
      const em = { ...sd.sim, lastEmit: { ...sd.sim.lastEmit }, battery: { ...sd.sim.battery } };
      const readings = emitReadings(
        em,
        e.sensors,
        { ...all, [e.site.code]: em },
        { mode: "live", packetLoss: 0.005 },
      );
      sd.sim = em;
      for (const r of readings) {
        r.raw = { ...r.raw, sim_t: em.t, sim_min: Math.round(simMin * 10) / 10 };
        sd.last[r.sensorId] = { v: r.value, t: em.t };
        const sensor = e.sensors.find((x) => x.id === r.sensorId);
        if (sensor && HIST_TYPES.has(sensor.type)) {
          const h = (sd.hist[r.sensorId] ??= []);
          h.push({ t: em.t, v: r.value });
          while (h.length && h[0].t < em.t - 6.5 * 3600 * 1000) h.shift();
        }
        if (sensor?.type === "pluviometro" && r.value > 0) sd.rainLog.push({ t: em.t, mm: r.value });
      }
      rows.push(...readingRows(b.org.id, em, readings, drill.id, ts));
    }
  }
  for (const e of entries) e.sd.rainLog = e.sd.rainLog.filter((x) => x.t > e.sd.sim.t - 24 * 3600 * 1000);
  await insertReadings(sb, rows);

  // Evaluación de alertas en reloj simulado, embalse por embalse
  const simNow = st.sim.t;
  const prefix = prefixOf(drill.id);
  const openQ = await sb.from("alerts").select("*").eq("drill_run_id", drill.id).neq("status", "resuelta");
  const openRows = openQ.data ?? [];
  // Si el simulacro se finalizó mientras se calculaba este paso, no se tocan alertas ni estado.
  const still = await sb.from("drill_runs").select("status").eq("id", drill.id).single();
  if (still.data?.status === "finalizado") return { ...drill, status: "finalizado" };
  for (const e of entries) {
    const sd = e.sd;
    const p = e.p;
    const ids = b.sensors.filter((s) => s.site_id === e.site.id).map((s) => s.id);
    const pre = await loadHistory(sb, ids, st.startT - 6.5 * 3600 * 1000, st.startT);
    const history: Record<string, { t: number; v: number }[]> = {};
    for (const id of ids) history[id] = [...(pre[id] ?? []), ...(sd.hist[id] ?? [])];
    const overrides: Record<string, { value: number | null; at: number | null }> = {};
    for (const id of ids)
      overrides[id] = sd.last[id] ? { value: sd.last[id].v, at: sd.last[id].t } : { value: null, at: null };
    const siteOpen = openRows.filter((a) => a.site_id === e.site.id);
    const open: OpenAlert[] = siteOpen.map((a) => {
      const o = toOpenAlert(a);
      const tv = (a.trigger_values ?? {}) as { sim_started_min?: number };
      return {
        ...o,
        dedupeKey: a.dedupe_key.replace(prefix, ""),
        lastTriggeredAt: simNow - 3_600_000, // en simulacro solo se auto-resuelven las de comunicación (filtro abajo)
        startedAt: tv.sim_started_min !== undefined ? st.startT + tv.sim_started_min * 60_000 : simNow,
      };
    });
    const rain =
      sd.preRain24h * Math.max(0, 1 - (simNow - st.startT) / (24 * 3600 * 1000)) +
      sd.rainLog.reduce((a, x) => a + x.mm, 0);
    const result = evaluate({
      now: simNow,
      site: {
        id: e.site.id,
        code: e.site.code,
        name: e.site.name,
        zoneId: e.site.zone_id,
        namo: p.namo,
        cresta: p.cresta,
      },
      sensors: evalSensors(b, e.site, overrides),
      history,
      rain24h: rain,
      rules: evalRules(b, e.site),
      open,
      routes: routesFor(b, e.site),
    });
    // resolución en simulacro: solo comunicación (al restablecerse el enlace)
    result.resolve = result.resolve.filter((r) => r.alert.type === "comunicacion");
    for (const d of result.drafts) {
      d.dedupeKey = prefix + d.dedupeKey;
      if (d.existing)
        d.existing = siteOpen.map((a) => toOpenAlert(a)).find((a) => a.id === d.existing?.id) ?? d.existing;
    }
    await applyEvaluation(sb, b, e.site, result, {
      now: simNow,
      drillRunId: drill.id,
      simMinutes: Math.round(simMin),
    });
  }
  await runEscalations(sb, b, openRows, { now: simNow, drillRunId: drill.id, simStartMs: st.startT });

  const done = simMin >= def.durationMin;
  if (done && !st.events.some((e) => e.label.startsWith("Fin del escenario")))
    st.events.push({ min: Math.round(simMin), label: "Fin del escenario (en pausa)" });
  const up = await sb
    .from("drill_runs")
    .update({
      sim_minutes: simMin,
      phase: phaseLabel,
      last_step_at: new Date().toISOString(),
      state: st as never,
      ...(done ? { status: "pausado" } : {}),
    })
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
    const r = await sb
      .from("drill_runs")
      .update({ status: action === "pausar" ? "pausado" : "activo", last_step_at: new Date().toISOString() })
      .eq("id", drillId)
      .select("*")
      .single();
    await audit(
      sb,
      orgId,
      `simulacro.${action === "pausar" ? "pausado" : "reanudado"}`,
      "drill_run",
      drillId,
      {},
      actor,
      drillId,
    );
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
    const snap = (drill.snapshot ?? {}) as DrillSnapshot;
    const scenario = drill.scenario as ScenarioId;
    const siteId = drill.site_id;
    const speed = drill.speed;
    const extraSiteIds = (snap.sites ?? [])
      .filter((x) => x.role === "rotura" && x.id !== siteId)
      .map((x) => x.id);
    const debris = (drill.state as unknown as DrillState | null)?.debris;
    await finishDrill(sb, drill.id, snap, actor, true);
    return startDrill(sb, { orgId, siteId, scenario, speed, actor, extraSiteIds, debris });
  }
  const snap = (drill.snapshot ?? {}) as DrillSnapshot;
  await finishDrill(sb, drill.id, snap, actor, false);
  return null;
}

/** Finaliza: restaura el estado físico real y los últimos valores; opcionalmente purga los datos del simulacro. */
type DrillSnapshot = { sim_state?: SiteState; sites?: DrillSnapshotSite[] };

async function finishDrill(
  sb: Admin,
  drillId: string,
  snap: DrillSnapshot,
  actor: { id: string; name: string },
  purge: boolean,
) {
  const dr = await sb.from("drill_runs").select("*").eq("id", drillId).single();
  if (dr.error) throw new Error(dr.error.message);
  const drill = dr.data;
  const restore = snap.sites?.length
    ? snap.sites.map((x) => ({ id: x.id, state: x.sim_state }))
    : snap.sim_state
      ? [{ id: drill.site_id, state: snap.sim_state }]
      : [];
  for (const r of restore) {
    await sb
      .from("sim_state")
      .update({
        state: r.state as never,
        sim_time: new Date(r.state.t).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("site_id", r.id);
  }
  // Primero se marca finalizado (los pasos en curso lo verifican antes de escribir) y luego se cierran sus alertas.
  await sb
    .from("drill_runs")
    .update({ status: "finalizado", ended_at: new Date().toISOString() })
    .eq("id", drillId);
  await sb
    .from("alerts")
    .update({ status: "resuelta", resolved_at: new Date().toISOString() })
    .eq("drill_run_id", drillId)
    .neq("status", "resuelta");
  if (purge) await sb.rpc("purge_drill", { p_drill: drillId });
  for (const id of drillSiteIds(drill)) await sb.rpc("restore_last_values", { p_site: id });
  await audit(
    sb,
    drill.organization_id,
    purge ? "simulacro.reiniciado" : "simulacro.finalizado",
    "drill_run",
    drillId,
    { sim_minutes: Math.round(drill.sim_minutes) },
    actor,
    drillId,
  );
}
