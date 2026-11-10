import type { OrgLive } from "@/lib/data/live";
import { alertEta, type Alert } from "@/lib/data/types";
import { SCENARIOS, type ScenarioId } from "@/lib/sim/scenarios";
import type { AlertLevel } from "@/lib/domain/types";

/** Estado visual del simulacro en curso, derivado de los datos en vivo (para mapa, HUD y avisos). */
export interface DrillScene {
  drillId: string;
  scenario: string;
  siteId: string;
  siteName: string;
  lat: number;
  lng: number;
  level: AlertLevel | "normal";
  /** minuto simulado (extrapolado entre pasos) */
  simMin: number;
  phase: string;
  narrative: string;
  rainMmH: number;
  /** cota actual del embalse (m s. n. m.) y referencias */
  nivel: number | null;
  cotaNamo: number;
  cotaCresta: number;
  /** avance del frente de crecida a lo largo del cauce (0–1); null si no hay alerta con tiempos de llegada */
  flood: number | null;
  etas: { name: string; lat: number; lng: number; remainingMin: number }[];
  /** alerta más grave del simulacro (para el aviso a pantalla completa) */
  topAlert: Alert | null;
  /** inicio real del simulacro (ms) */
  startedAt: number;
  /** lluvia media de la última hora simulada (mm/h) */
  rainAvg60: number;
  /** caudal que sale de la presa: descarga + vertedero (m³/s) */
  damOutflow: number | null;
}

/** Cuenca intermedia entre las presas y Ambato que aporta escorrentía (km², referencial). */
const INTERMEDIATE_KM2 = 45;
/** Coeficiente de escorrentía del páramo saturado (referencial). */
const RUNOFF_C = 0.35;

/**
 * Caudal estimado en Ambato durante el simulacro: caudal base del río (pronóstico INAMHI–GEOGLOWS)
 * + salida de la presa atenuada en el tránsito + escorrentía de la cuenca intermedia (método racional).
 * Es una estimación didáctica del simulacro, no un modelo hidráulico.
 */
export function estimateAmbatoFlow(scene: DrillScene, baseFlow: number): number {
  const dam = (scene.damOutflow ?? 0) * 0.85;
  const runoff = (RUNOFF_C * scene.rainAvg60 * INTERMEDIATE_KM2) / 3.6;
  return Math.round((baseFlow + dam + runoff) * 10) / 10;
}

const RANK: Record<string, number> = { normal: 0, amarilla: 1, naranja: 2, roja: 3 };

/** Fracción (0–1) del largo del cauce en el punto más cercano a (lng, lat). */
export function progressAlong(line: [number, number][], lng: number, lat: number): number {
  const k = Math.cos((lat * Math.PI) / 180);
  let total = 0;
  let best = Infinity;
  let bestAt = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const dx = (bx - ax) * k;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const t = len ? Math.max(0, Math.min(1, ((lng - ax) * k * dx + (lat - ay) * dy) / (len * len))) : 0;
    const d = Math.hypot((ax + (bx - ax) * t - lng) * k, ay + (by - ay) * t - lat);
    if (d < best) {
      best = d;
      bestAt = total + t * len;
    }
    total += len;
  }
  return total ? bestAt / total : 0;
}

export function drillScene(data: OrgLive | undefined, now: number): DrillScene | null {
  const drill = data?.drill;
  if (!data || !drill || (drill.status !== "activo" && drill.status !== "pausado")) return null;
  const site = data.sites.find((s) => s.id === drill.site_id);
  if (!site) return null;

  const since =
    drill.status === "activo" && now
      ? ((now - new Date(drill.last_step_at).getTime()) / 60_000) * drill.speed
      : 0;
  const simMin = drill.sim_minutes + Math.max(0, Math.min(since, 0.2 * drill.speed));
  const def = SCENARIOS[drill.scenario as ScenarioId];
  const ph = def?.at(Math.min(simMin, def.durationMin));

  const alerts = data.alerts.filter((a) => a.drill_run_id === drill.id && a.status !== "resuelta");
  const top = alerts.reduce<Alert | null>((m, a) => (!m || RANK[a.level] > RANK[m.level] ? a : m), null);
  const level = (top?.level ?? "normal") as DrillScene["level"];

  // Frente de crecida: la alerta más grave que tenga tiempos de llegada aguas abajo
  const withEta = alerts
    .filter((a) => alertEta(a).length > 0 && RANK[a.level] >= 2)
    .sort((a, b) => RANK[b.level] - RANK[a.level])[0];
  let flood: number | null = null;
  let etas: DrillScene["etas"] = [];
  if (withEta) {
    const tv = (withEta.trigger_values ?? {}) as { sim_started_min?: number };
    const elapsed = Math.max(0, simMin - (tv.sim_started_min ?? simMin));
    // Cada punto aguas abajo se proyecta sobre el cauce real: el frente de crecida llega a su
    // marcador justo cuando su cuenta regresiva llega a cero.
    const line = ((site.cauce_geojson as { coordinates?: [number, number][] } | null)?.coordinates ?? []) as [
      number,
      number,
    ][];
    const pairs: [number, number][] = [[0, 0]];
    for (const e of alertEta(withEta)) {
      const p = data.points.find((x) => x.id === e.point_id);
      if (p && line.length > 1) pairs.push([e.minutes, progressAlong(line, p.lng, p.lat)]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < pairs.length; i++) pairs[i][1] = Math.max(pairs[i][1], pairs[i - 1][1]);
    let f = 1;
    for (let i = 1; i < pairs.length; i++) {
      if (elapsed <= pairs[i][0]) {
        const [m0, f0] = pairs[i - 1];
        const [m1, f1] = pairs[i];
        f = f0 + ((f1 - f0) * (elapsed - m0)) / Math.max(1, m1 - m0);
        break;
      }
    }
    flood = Math.min(1, Math.max(0.01, f));
    etas = alertEta(withEta).flatMap((e) => {
      const p = data.points.find((x) => x.id === e.point_id);
      return p ? [{ name: e.name, lat: p.lat, lng: p.lng, remainingMin: e.minutes - elapsed }] : [];
    });
  }

  const nivelSensor = data.sensors.find((s) => s.site_id === site.id && s.type === "nivel_radar");
  const qoutSensor = data.sensors.find((s) => s.site_id === site.id && s.type === "caudal_salida");
  let rainAvg60 = 0;
  if (def) {
    for (let k = 0; k <= 6; k++)
      rainAvg60 += def.at(Math.max(0, Math.min(simMin, def.durationMin) - k * 10)).forcing.rainMmH ?? 0;
    rainAvg60 /= 7;
  }
  return {
    drillId: drill.id,
    scenario: drill.scenario,
    siteId: site.id,
    siteName: site.name,
    lat: site.lat,
    lng: site.lng,
    level,
    simMin,
    phase: ph?.phase ?? drill.phase ?? "",
    narrative: ph?.narrative ?? "",
    rainMmH: ph?.forcing.rainMmH ?? 0,
    nivel: nivelSensor?.last_value ?? null,
    cotaNamo: Number(site.cota_namo),
    cotaCresta: Number(site.cota_cresta),
    flood,
    etas,
    topAlert: top,
    startedAt: new Date(drill.started_at).getTime(),
    rainAvg60,
    damOutflow:
      qoutSensor?.last_value === null || qoutSensor?.last_value === undefined
        ? null
        : Number(qoutSensor.last_value) / 1000,
  };
}
