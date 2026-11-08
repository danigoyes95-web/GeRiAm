import { describe, expect, it } from "vitest";
import { SITES, buildCurve, siteRules } from "@config/sites.tungurahua";
import { siteParamsFromRow } from "@/lib/sim/params";
import { initialState, stepSite, type SiteState } from "@/lib/sim/physics";
import { emitReadings, type SimSensor } from "@/lib/sim/telemetry";
import { SCENARIOS } from "@/lib/sim/scenarios";
import { evaluate, levelFor, stillActive, dueEscalation, planNotifications, type EvalRule, type EvalSensor, type OpenAlert, type AlertDraft } from "@/lib/alerts/engine";
import { volumeAt } from "@/lib/hydro/curve";
import type { AlertLevel, SensorType, Thresholds } from "@/lib/domain/types";

const RANK: Record<string, number> = { amarilla: 1, naranja: 2, roja: 3 };

function setup(i: number) {
  const c = SITES[i];
  const p = siteParamsFromRow({ ...c, curva_area_volumen: buildCurve(c.cota_fondo, c.cota_namo, c.cota_cresta, c.capacity_m3, c.curva_m) } as never);
  const sensors = c.sensors.filter((s) => !s.downstreamPoint);
  const sim: SimSensor[] = sensors.map((s, k) => ({ id: `s${k}`, code: s.code, type: s.type, intervalS: s.interval_s, lora: !s.gateway, baseRssi: s.rssi, baseSnr: s.snr }));
  const ev: EvalSensor[] = sensors.map((s, k) => ({
    id: `s${k}`,
    code: s.code,
    name: s.name,
    type: s.type as SensorType,
    unit: s.unit,
    decimals: s.decimals,
    intervalS: s.interval_s,
    thresholds: (s.thresholds as Thresholds) ?? null,
    lastValue: null,
    lastAt: null,
  }));
  const rules: EvalRule[] = siteRules(c).map((r, k) => ({ id: `r${k}`, code: r.code, name: r.name, kind: r.kind, level: r.level as AlertLevel, params: r.params as Record<string, unknown>, enabled: true, cooldownMin: r.cooldown_min }));
  const routes = c.downstream.map((d) => ({ pointId: d.point, name: d.point === "ambato" ? "Ambato (ciudad)" : d.point, zoneId: null, llegadaMin: d.llegada_min, transitoMin: d.transito_min, poblacion: 1000, kind: d.point === "ambato" ? "ciudad" : "poblado" }));
  return { c, p, sim, ev, rules, routes };
}

/** Corre un escenario completo evaluando alertas como lo hace el runtime de simulacro. */
function runScenario(i: number, scenario: keyof typeof SCENARIOS) {
  const { c, p, sim, ev, rules, routes } = setup(i);
  const def = SCENARIOS[scenario];
  const t0 = Date.UTC(2026, 10, 7, 20);
  let s: SiteState = initialState(p, p.namo - 0.6, t0 - 7 * 3600_000, 99);
  // 7 h de historia previa
  const hist: Record<string, { t: number; v: number }[]> = {};
  const last: Record<string, { v: number; t: number }> = {};
  const record = (st: SiteState, rs: ReturnType<typeof emitReadings>) => {
    for (const r of rs) {
      (hist[r.sensorId] ??= []).push({ t: st.t, v: r.value });
      last[r.sensorId] = { v: r.value, t: st.t };
    }
  };
  for (let k = 0; k < 7 * 12; k++) {
    s = stepSite(p, s, 300, { rainMmH: 0 });
    const e = { ...s, lastEmit: { ...s.lastEmit } };
    record(e, emitReadings(e, sim, { [c.code]: e }, { mode: "backfill", packetLoss: 0 }));
    s = e;
  }
  if (def.startOffsetNamo !== null) {
    s.cota = p.namo + def.startOffsetNamo;
    s.v = volumeAt(p.curve, s.cota);
  }
  const open = new Map<string, OpenAlert & { draft: AlertDraft }>();
  const timeline: { min: number; level: string; type: string; key: string }[] = [];
  let settleApplied = 0;
  let rainLog: { t: number; mm: number }[] = [];
  for (let m = 0; m < def.durationMin; m += 2) {
    const ph = def.at(m);
    const target = ph.settleOffset ?? 0;
    s = stepSite(p, s, 120, { ...ph.forcing, settleJump: target - settleApplied || undefined });
    settleApplied = target;
    const e = { ...s, lastEmit: { ...s.lastEmit } };
    const rs = emitReadings(e, sim, { [c.code]: e }, { mode: "live", packetLoss: 0 });
    record(e, rs);
    for (const r of rs) if (r.code.includes("PLU") && r.value > 0) rainLog.push({ t: e.t, mm: r.value });
    rainLog = rainLog.filter((x) => x.t > e.t - 86400_000);
    s = e;
    const res = evaluate({
      now: s.t,
      site: { id: "site", code: c.code, name: c.name, zoneId: "z1", namo: p.namo, cresta: p.cresta },
      sensors: ev.map((x) => ({ ...x, lastValue: last[x.id]?.v ?? null, lastAt: last[x.id]?.t ?? null })),
      history: hist,
      rain24h: rainLog.reduce((a, x) => a + x.mm, 0),
      rules,
      open: [...open.values()].map((o) => ({ ...o, lastTriggeredAt: s.t - 3600_000 })),
      routes,
    });
    for (const d of res.drafts) {
      const prev = open.get(d.dedupeKey);
      if (!prev || RANK[d.level] > RANK[prev.level]) timeline.push({ min: m, level: d.level, type: d.type, key: d.dedupeKey });
      open.set(d.dedupeKey, { id: d.dedupeKey, dedupeKey: d.dedupeKey, level: d.level, status: "activa", lastTriggeredAt: s.t, startedAt: s.t, type: d.type, draft: d });
    }
    for (const r of res.resolve) if (r.alert.type === "comunicacion") open.delete(r.alert.dedupeKey);
  }
  return { timeline, open, p, s };
}

describe("umbrales e histéresis", () => {
  const t: Thresholds = { direction: "asc", amarilla: 10, naranja: 20, roja: 30, hysteresis: 1 };
  it("nivel por umbral", () => {
    expect(levelFor(9.9, t)).toBe("normal");
    expect(levelFor(10, t)).toBe("amarilla");
    expect(levelFor(25, t)).toBe("naranja");
    expect(levelFor(31, t)).toBe("roja");
  });
  it("histéresis: no se libera hasta bajar del umbral − banda", () => {
    expect(stillActive(9.5, t, "amarilla")).toBe(true);
    expect(stillActive(8.9, t, "amarilla")).toBe(false);
  });
  it("dirección descendente (batería / UPS)", () => {
    const d: Thresholds = { direction: "desc", amarilla: 40, naranja: 25, roja: 10 };
    expect(levelFor(50, d)).toBe("normal");
    expect(levelFor(30, d)).toBe("amarilla");
    expect(levelFor(5, d)).toBe("roja");
  });
});

describe("escenario: tormenta extrema", () => {
  it("escala amarilla → naranja → roja por nivel cercano a cresta, sin duplicar alertas", () => {
    const { timeline, open } = runScenario(0, "tormenta");
    const nivelEvents = timeline.filter((e) => e.key.includes("NIV"));
    expect(nivelEvents.map((e) => e.level)).toEqual(["amarilla", "naranja", "roja"]);
    expect(nivelEvents[0].min).toBeLessThan(nivelEvents[1].min);
    expect(nivelEvents[1].min).toBeLessThan(nivelEvents[2].min);
    // una sola alerta abierta por clave
    const keys = [...open.keys()];
    expect(new Set(keys).size).toBe(keys.length);
    // la alerta de nivel lleva ETA aguas abajo
    const nivel = [...open.values()].find((o) => o.dedupeKey.includes("NIV"))!;
    expect(nivel.draft.eta.length).toBeGreaterThan(0);
  });
});

describe("escenario: anomalía estructural", () => {
  it("dispara alerta estructural roja con llegada a Ambato en 140 min (Mulacorral)", () => {
    const { timeline, open } = runScenario(1, "estructural");
    const reds = timeline.filter((e) => e.type === "estructural" && e.level === "roja");
    expect(reds.length).toBeGreaterThan(0);
    const red = [...open.values()].find((o) => o.type === "estructural" && o.level === "roja")!;
    expect(red.draft.etaPrimaryMin).toBe(140);
    // ninguna alerta por lluvia
    expect(timeline.some((e) => e.type === "combinada")).toBe(false);
  });
});

describe("escenario: pérdida de comunicación", () => {
  it("alerta de enlace Starlink y se resuelve al restablecerse", () => {
    const { timeline, open } = runScenario(0, "comunicacion");
    expect(timeline.some((e) => e.type === "comunicacion" && e.key.endsWith("STL"))).toBe(true);
    expect([...open.values()].some((o) => o.type === "comunicacion")).toBe(false);
  });
});

describe("escalamiento", () => {
  const policies = [
    { level: "amarilla" as const, step: 0, afterMin: 0, roles: ["operador", "tecnico"], channels: ["push"] },
    { level: "amarilla" as const, step: 1, afterMin: 15, roles: ["admin"], channels: ["push", "sms"] },
  ];
  it("escala si nadie confirma en N minutos", () => {
    const a = { level: "amarilla" as const, status: "activa", startedAt: 0, escalationStep: 0 };
    expect(dueEscalation(a, policies, 10 * 60_000)).toBeNull();
    expect(dueEscalation(a, policies, 16 * 60_000)?.step).toBe(1);
    expect(dueEscalation({ ...a, status: "confirmada" }, policies, 60 * 60_000)).toBeNull();
  });
  it("planifica por rol y zona (técnico solo si la alerta afecta su zona)", () => {
    const recips = [
      { userId: "op", name: "Op", role: "operador", phone: "+593990000001", zoneIds: [], channels: ["push"] },
      { userId: "t1", name: "T1", role: "tecnico", phone: null, zoneIds: ["Z1"], channels: ["push", "whatsapp"] },
      { userId: "t2", name: "T2", role: "tecnico", phone: null, zoneIds: ["Z9"], channels: ["push"] },
    ];
    const plan = planNotifications(policies[0], ["Z1"], recips);
    expect(plan.map((p) => p.userId).sort()).toEqual(["op", "t1"]);
  });
});
