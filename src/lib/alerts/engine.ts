/**
 * Motor de alertas (puro, sin E/S). Evalúa reglas sobre el estado reciente de un
 * embalse y devuelve qué alertas abrir, mantener, escalar de nivel o resolver.
 * Incluye histéresis, anti-rebote (mediana de las últimas lecturas) y una sola
 * alerta abierta por clave (regla + sensor).
 */
import type { AlertLevel, AlertType, SensorType, Thresholds } from "../domain/types";

export interface EvalSensor {
  id: string;
  code: string;
  name: string;
  type: SensorType;
  unit: string;
  decimals: number;
  intervalS: number;
  thresholds: Thresholds | null;
  lastValue: number | null;
  lastAt: number | null; // epoch ms
  /** estación de un punto aguas abajo */
  downstream?: boolean;
  status?: string;
}

export interface EvalRule {
  id: string;
  code: string;
  name: string;
  kind: "umbral" | "tasa" | "combinada" | "estructural" | "comunicacion";
  level: AlertLevel;
  params: Record<string, unknown>;
  enabled: boolean;
  cooldownMin: number;
}

export interface OpenAlert {
  id: string;
  dedupeKey: string;
  level: AlertLevel;
  status: string;
  lastTriggeredAt: number;
  startedAt: number;
  type: AlertType;
}

export interface Route {
  pointId: string;
  name: string;
  zoneId: string | null;
  llegadaMin: number; // onda por rotura
  transitoMin: number; // crecida ordinaria
  poblacion: number | null;
  kind: string;
}

export interface EvalContext {
  now: number;
  site: { id: string; code: string; name: string; zoneId: string | null; namo: number; cresta: number };
  sensors: EvalSensor[];
  /** historial reciente por sensor (≥ 6 h), ordenado por tiempo ascendente */
  history: Record<string, { t: number; v: number }[]>;
  rain24h: number;
  rules: EvalRule[];
  open: OpenAlert[];
  routes: Route[];
}

export interface EtaItem {
  point_id: string;
  name: string;
  minutes: number;
  poblacion: number | null;
}

export interface AlertDraft {
  dedupeKey: string;
  level: AlertLevel;
  type: AlertType;
  title: string;
  description: string;
  sensorId: string | null;
  ruleId: string;
  triggerValues: Record<string, unknown>;
  eta: EtaItem[];
  etaPrimaryMin: number | null;
  zoneIds: string[];
  /** alerta existente que se mantiene/actualiza */
  existing?: OpenAlert;
  /** nueva, o subió de nivel → notificar */
  notify: boolean;
}

export interface EvalResult {
  drafts: AlertDraft[];
  resolve: { alert: OpenAlert; reason: string }[];
}

const RANK: Record<AlertLevel, number> = { normal: 0, amarilla: 1, naranja: 2, roja: 3 };
const LEVEL_TXT: Record<AlertLevel, string> = { normal: "normal", amarilla: "amarilla", naranja: "naranja", roja: "roja" };

const fmt = (v: number, d = 2) => {
  const s = Math.abs(v).toFixed(d).split(".");
  const int = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 ? "−" : ""}${s[1] ? `${int},${s[1]}` : int}`;
};

export function median(xs: number[]): number {
  const a = xs.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Nivel según umbrales (sin histéresis). */
export function levelFor(v: number, t: Thresholds): AlertLevel {
  const crosses = (thr: number | undefined) => thr !== undefined && (t.direction === "asc" ? v >= thr : v <= thr);
  if (crosses(t.roja)) return "roja";
  if (crosses(t.naranja)) return "naranja";
  if (crosses(t.amarilla)) return "amarilla";
  return "normal";
}

/** ¿Sigue activa una condición de umbral ya abierta? (banda de histéresis bajo el umbral amarillo) */
export function stillActive(v: number, t: Thresholds, openLevel: AlertLevel): boolean {
  const h = t.hysteresis ?? 0;
  const thr = (openLevel === "roja" ? t.roja : openLevel === "naranja" ? t.naranja : t.amarilla) ?? t.amarilla;
  const base = t.amarilla ?? thr;
  if (base === undefined) return false;
  return t.direction === "asc" ? v >= base - h : v <= base + h;
}

function valueAgo(hist: { t: number; v: number }[] | undefined, now: number, minutes: number): number | null {
  if (!hist || hist.length === 0) return null;
  const target = now - minutes * 60_000;
  let best: { t: number; v: number } | null = null;
  for (const p of hist) {
    if (p.t <= target) best = p;
    else break;
  }
  return best ? best.v : hist[0].t <= target + 15 * 60_000 ? hist[0].v : null;
}

/** Valor robusto: mediana de las últimas 3 lecturas (anti-rebote ante ruido/picos). */
function robustValue(s: EvalSensor, hist: { t: number; v: number }[] | undefined): number | null {
  if (s.lastValue === null) return null;
  const tail = (hist ?? []).slice(-3).map((p) => p.v);
  if (tail.length < 3) return s.lastValue;
  return median(tail);
}

function rainLastHour(hist: { t: number; v: number }[] | undefined, now: number): number {
  if (!hist) return 0;
  return hist.filter((p) => p.t > now - 3_600_000).reduce((a, p) => a + p.v, 0);
}

export function computeEta(routes: Route[], mode: "rotura" | "crecida"): { eta: EtaItem[]; primary: number | null } {
  const eta = routes
    .map((r) => ({ point_id: r.pointId, name: r.name, minutes: mode === "rotura" ? r.llegadaMin : r.transitoMin, poblacion: r.poblacion }))
    .sort((a, b) => a.minutes - b.minutes);
  const city = routes.find((r) => r.kind === "ciudad");
  const primary = city ? (mode === "rotura" ? city.llegadaMin : city.transitoMin) : eta[eta.length - 1]?.minutes ?? null;
  return { eta, primary };
}

export function evaluate(ctx: EvalContext): EvalResult {
  const drafts: AlertDraft[] = [];
  const seen = new Set<string>();
  const openByKey = new Map(ctx.open.map((a) => [a.dedupeKey, a]));
  const siteZones = ctx.site.zoneId ? [ctx.site.zoneId] : [];
  const downstreamZones = Array.from(new Set([...siteZones, ...ctx.routes.map((r) => r.zoneId).filter((z): z is string => !!z)]));
  const flood = computeEta(ctx.routes, "crecida");
  const breach = computeEta(ctx.routes, "rotura");

  const push = (d: Omit<AlertDraft, "existing" | "notify">) => {
    seen.add(d.dedupeKey);
    const existing = openByKey.get(d.dedupeKey);
    if (existing) {
      const up = RANK[d.level] > RANK[existing.level];
      drafts.push({ ...d, level: up ? d.level : existing.level, existing, notify: up });
    } else {
      drafts.push({ ...d, notify: true });
    }
  };
  const isStale = (s: EvalSensor) => s.lastAt === null || ctx.now - s.lastAt > s.intervalS * 3 * 1000;

  for (const rule of ctx.rules) {
    if (!rule.enabled) continue;
    const p = rule.params;

    if (rule.kind === "umbral") {
      for (const s of ctx.sensors) {
        if (!s.thresholds || isStale(s) || s.status === "mantenimiento") continue;
        if (s.type === "starlink") continue; // la latencia se trata en reglas de comunicación
        const hist = ctx.history[s.id];
        const v = s.type === "pluviometro" ? rainLastHour(hist, ctx.now) : robustValue(s, hist);
        if (v === null) continue;
        const key = `${rule.code}:${s.code}`;
        const open = openByKey.get(key);
        const raw = levelFor(v, s.thresholds);
        const active = raw !== "normal" || (open ? stillActive(v, s.thresholds, open.level) : false);
        if (!active) continue;
        const level: AlertLevel = raw === "normal" ? (open?.level ?? "amarilla") : raw;
        const structural = s.type === "piezometro" || s.type === "asentamiento" || s.type === "inclinometro";
        const thr = s.thresholds[level === "normal" ? "amarilla" : level] ?? s.thresholds.amarilla;
        const unit = s.type === "pluviometro" ? "mm/h" : s.unit;
        const affectsDownstream = s.type === "nivel_radar" || structural || s.type === "caudal_entrada" || (s.type === "nivel_rio" && !s.downstream);
        const eta = structural ? breach : affectsDownstream ? flood : { eta: [], primary: null };
        push({
          dedupeKey: key,
          level,
          type: structural ? "estructural" : "umbral",
          title: `${ctx.site.name}: ${s.name.split(" — ")[0]} en nivel ${LEVEL_TXT[level]}`,
          description: `${s.name}: ${fmt(v, s.decimals)} ${unit} (umbral ${LEVEL_TXT[level]} ${thr !== undefined ? fmt(thr, s.decimals) : "—"} ${unit}).`,
          sensorId: s.id,
          ruleId: rule.id,
          triggerValues: { value: v, unit, threshold: thr ?? null, sensor: s.code },
          eta: eta.eta,
          etaPrimaryMin: eta.primary,
          zoneIds: s.downstream ? downstreamZones : affectsDownstream ? downstreamZones : siteZones,
        });
      }
    }

    if (rule.kind === "tasa") {
      const s = ctx.sensors.find((x) => x.type === (p.sensor_type as string));
      if (!s || isStale(s) || s.lastValue === null) continue;
      const windowMin = Number(p.window_min ?? 60);
      const delta = Number(p.delta ?? 0.1);
      const before = valueAgo(ctx.history[s.id], ctx.now, windowMin);
      const now = robustValue(s, ctx.history[s.id]);
      if (before === null || now === null) continue;
      const rise = now - before;
      const key = `${rule.code}`;
      const open = openByKey.get(key);
      if (rise >= delta || (open && rise >= delta * 0.6)) {
        push({
          dedupeKey: key,
          level: rule.level,
          type: "tasa",
          title: `${ctx.site.name}: subida rápida de nivel (+${fmt(rise * 100, 0)} cm/h)`,
          description: `El nivel subió ${fmt(rise * 100, 1)} cm en ${windowMin} min (regla: > ${fmt(delta * 100, 0)} cm).`,
          sensorId: s.id,
          ruleId: rule.id,
          triggerValues: { rise_m: rise, window_min: windowMin, threshold_m: delta },
          eta: flood.eta,
          etaPrimaryMin: flood.primary,
          zoneIds: downstreamZones,
        });
      }
    }

    if (rule.kind === "combinada") {
      const s = ctx.sensors.find((x) => x.type === "nivel_radar");
      if (!s || s.lastValue === null || isStale(s)) continue;
      const rainLim = Number(p.rain_24h_mm ?? 40);
      const lvl = Number(p.level_above ?? ctx.site.namo);
      const v = robustValue(s, ctx.history[s.id]) ?? s.lastValue;
      const open = openByKey.get(rule.code);
      if ((ctx.rain24h >= rainLim && v >= lvl) || (open && ctx.rain24h >= rainLim * 0.8 && v >= lvl - 0.05)) {
        push({
          dedupeKey: rule.code,
          level: rule.level,
          type: "combinada",
          title: `${ctx.site.name}: lluvia acumulada con embalse alto`,
          description: `Lluvia 24 h ${fmt(ctx.rain24h, 1)} mm (> ${fmt(rainLim, 0)}) con nivel ${fmt(v, 2)} m s. n. m. (> ${fmt(lvl, 2)}).`,
          sensorId: s.id,
          ruleId: rule.id,
          triggerValues: { rain_24h: ctx.rain24h, level: v, rain_limit: rainLim, level_limit: lvl },
          eta: flood.eta,
          etaPrimaryMin: flood.primary,
          zoneIds: downstreamZones,
        });
      }
    }

    if (rule.kind === "estructural") {
      const type = p.sensor_type as SensorType;
      const windowMin = Number(p.window_min ?? 60);
      const delta = Number(p.delta ?? 1);
      const maxRain = p.max_rain_24h_mm === undefined ? Infinity : Number(p.max_rain_24h_mm);
      for (const s of ctx.sensors.filter((x) => x.type === type)) {
        if (isStale(s) || s.lastValue === null) continue;
        const key = `${rule.code}:${s.code}`;
        const open = openByKey.get(key);
        const before = valueAgo(ctx.history[s.id], ctx.now, windowMin);
        const v = robustValue(s, ctx.history[s.id]);
        if (before === null || v === null) {
          if (open) seen.add(key); // sin historial suficiente: se mantiene
          continue;
        }
        const rise = v - before;
        if ((rise >= delta && ctx.rain24h <= maxRain) || open) {
          // las alertas estructurales no se resuelven solas: requieren cierre manual
          push({
            dedupeKey: key,
            level: rule.level,
            type: "estructural",
            title:
              type === "asentamiento"
                ? `${ctx.site.name}: salto de asentamiento en cresta (+${fmt(Math.max(rise, 0), 2)} mm)`
                : `${ctx.site.name}: presión de poro anómala sin lluvia (+${fmt(Math.max(rise, 0), 1)} kPa)`,
            description:
              type === "asentamiento"
                ? `${s.name}: +${fmt(Math.max(rise, 0), 2)} mm en ${windowMin} min (regla > ${fmt(delta, 1)} mm). Posible inicio de falla: evaluar evacuación aguas abajo.`
                : `${s.name}: +${fmt(Math.max(rise, 0), 1)} kPa en ${Math.round(windowMin / 60)} h con lluvia 24 h de ${fmt(ctx.rain24h, 1)} mm.`,
            sensorId: s.id,
            ruleId: rule.id,
            triggerValues: { rise, window_min: windowMin, value: v, rain_24h: ctx.rain24h },
            eta: breach.eta,
            etaPrimaryMin: breach.primary,
            zoneIds: downstreamZones,
          });
        }
      }
    }

    if (rule.kind === "comunicacion") {
      if (p.sensor_type === "starlink") {
        const s = ctx.sensors.find((x) => x.type === "starlink");
        if (!s) continue;
        const silenceMin = Number(p.silence_min ?? 5);
        const silent = s.lastAt === null || ctx.now - s.lastAt > silenceMin * 60_000;
        if (silent) {
          const mins = s.lastAt ? Math.round((ctx.now - s.lastAt) / 60_000) : null;
          push({
            dedupeKey: rule.code,
            level: rule.level,
            type: "comunicacion",
            title: `${ctx.site.name}: enlace Starlink caído`,
            description: `Sin datos de la presa desde hace ${mins ?? "—"} min. Se muestra el último valor conocido de cada sensor. Verificar energía y antena.`,
            sensorId: s.id,
            ruleId: rule.id,
            triggerValues: { silence_min: mins, last_at: s.lastAt },
            eta: [],
            etaPrimaryMin: null,
            zoneIds: siteZones,
          });
        }
      } else {
        const factor = Number(p.silence_factor ?? 3);
        const stl = ctx.sensors.find((x) => x.type === "starlink");
        const linkDown = stl ? stl.lastAt === null || ctx.now - stl.lastAt > 5 * 60_000 : false;
        if (linkDown) {
          // si cayó el enlace, la alerta de enlace ya cubre la ausencia de datos
          if (openByKey.has(rule.code)) seen.add(rule.code);
          continue;
        }
        const silent = ctx.sensors.filter(
          (s) => s.status !== "mantenimiento" && s.status !== "baja" && (s.lastAt === null || ctx.now - s.lastAt > s.intervalS * factor * 1000),
        );
        if (silent.length) {
          push({
            dedupeKey: rule.code,
            level: rule.level,
            type: "comunicacion",
            title: `${ctx.site.name}: ${silent.length === 1 ? "sensor sin reportar" : `${silent.length} sensores sin reportar`}`,
            description: `Un sensor caído también es una alerta. Sin datos en más de ${factor}× su intervalo: ${silent.map((s) => s.code).join(", ")}.`,
            sensorId: silent.length === 1 ? silent[0].id : null,
            ruleId: rule.id,
            triggerValues: { sensors: silent.map((s) => s.code), factor },
            eta: [],
            etaPrimaryMin: null,
            zoneIds: siteZones,
          });
        }
      }
    }
  }

  // Resolución automática: condiciones que ya no se cumplen durante el cooldown (salvo estructurales).
  const resolve: EvalResult["resolve"] = [];
  const ruleByPrefix = (key: string) => ctx.rules.find((r) => key === r.code || key.startsWith(`${r.code}:`));
  for (const a of ctx.open) {
    if (seen.has(a.dedupeKey)) continue;
    if (a.type === "estructural" || a.type === "manual") continue;
    const rule = ruleByPrefix(a.dedupeKey);
    if (!rule) continue;
    const quietMin = (ctx.now - a.lastTriggeredAt) / 60_000;
    if (quietMin >= (a.type === "comunicacion" ? 1 : rule.cooldownMin)) {
      resolve.push({ alert: a, reason: a.type === "comunicacion" ? "Comunicación restablecida" : `Condición normalizada durante ${Math.round(quietMin)} min` });
    }
  }
  return { drafts, resolve };
}

// ─── Escalamiento ─────────────────────────────────────────────────────────
export interface PolicyStep {
  level: AlertLevel;
  step: number;
  afterMin: number;
  roles: string[];
  channels: string[];
}

/** Paso de escalamiento que corresponde a una alerta no confirmada. */
export function dueEscalation(alert: { level: AlertLevel; status: string; startedAt: number; escalationStep: number }, policies: PolicyStep[], now: number): PolicyStep | null {
  if (alert.status !== "activa" && alert.status !== "escalada") return null;
  const elapsed = (now - alert.startedAt) / 60_000;
  const steps = policies.filter((p) => p.level === alert.level && p.step > alert.escalationStep && elapsed >= p.afterMin).sort((a, b) => a.step - b.step);
  return steps[0] ?? null;
}

export interface Recipient {
  userId: string;
  name: string;
  role: string;
  phone: string | null;
  zoneIds: string[];
  channels: string[];
}

export interface PlannedNotification {
  userId: string;
  name: string;
  channel: "push" | "sms" | "whatsapp";
  recipient: string;
}

/** Destinatarios y canales para un paso de política, filtrando por rol y zona. */
export function planNotifications(step: PolicyStep, alertZones: string[], recipients: Recipient[]): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const zonal = new Set(["tecnico", "director_junta"]);
  for (const r of recipients) {
    if (!step.roles.includes(r.role)) continue;
    if (zonal.has(r.role) && alertZones.length && !r.zoneIds.some((z) => alertZones.includes(z))) continue;
    for (const ch of step.channels) {
      if (ch !== "push" && ch !== "sms" && ch !== "whatsapp") continue;
      // en roja se usan todos los canales de la política; si no, respetar preferencias (push siempre)
      if (step.level !== "roja" && ch !== "push" && !r.channels.includes(ch)) continue;
      out.push({ userId: r.userId, name: r.name, channel: ch, recipient: ch === "push" ? r.userId : r.phone ?? "sin-telefono" });
    }
  }
  return out;
}
