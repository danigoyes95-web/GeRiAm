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
}

const RANK: Record<string, number> = { normal: 0, amarilla: 1, naranja: 2, roja: 3 };

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
    const routes = data.routes.filter((r) => r.site_id === site.id);
    const pairs: [number, number][] = [[0, 0]];
    for (const e of alertEta(withEta)) {
      const km = routes.find((r) => r.point_id === e.point_id)?.distancia_km;
      if (km !== null && km !== undefined) pairs.push([e.minutes, Number(km)]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    const maxKm = Math.max(...pairs.map((p) => p[1])) || 1;
    let km = maxKm;
    for (let i = 1; i < pairs.length; i++) {
      if (elapsed <= pairs[i][0]) {
        const [m0, k0] = pairs[i - 1];
        const [m1, k1] = pairs[i];
        km = k0 + ((k1 - k0) * (elapsed - m0)) / Math.max(1, m1 - m0);
        break;
      }
    }
    flood = Math.min(1, Math.max(0.015, km / maxKm));
    etas = alertEta(withEta).flatMap((e) => {
      const p = data.points.find((x) => x.id === e.point_id);
      return p ? [{ name: e.name, lat: p.lat, lng: p.lng, remainingMin: e.minutes - elapsed }] : [];
    });
  }

  const nivelSensor = data.sensors.find((s) => s.site_id === site.id && s.type === "nivel_radar");
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
  };
}
