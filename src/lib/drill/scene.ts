import type { OrgLive } from "@/lib/data/live";
import { alertEta, type Alert } from "@/lib/data/types";
import { ROTURA_BREACH_AT, SCENARIOS, type ScenarioId } from "@/lib/sim/scenarios";
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
  /** frente de crecida por cada presa (rotura de varias presas); el primero es el principal */
  floods: { siteId: string; fraction: number }[];
  /** presas que fallan en el escenario de rotura (ids) */
  brokenSiteIds: string[];
  /** rotura: presas con el minuto en que se abre su brecha, y lo que arrastra la crecida */
  breaches: { siteId: string; breachAtMin: number }[];
  debris: "agua" | "moderado" | "lodo";
  etas: {
    name: string;
    lat: number;
    lng: number;
    remainingMin: number;
    poblacion?: number | null;
    from?: string;
  }[];
  /** alerta más grave del simulacro (para el aviso a pantalla completa) */
  topAlert: Alert | null;
  /** inicio real del simulacro (ms) */
  startedAt: number;
  /** lluvia media de la última hora simulada (mm/h) */
  rainAvg60: number;
  /** caudal que sale de la presa: descarga + vertedero (+ brecha) (m³/s); en rotura, suma de las presas */
  damOutflow: number | null;
}

type SnapSite = { id: string; code: string; role: string; offset_min: number };

/** Embalses del simulacro (state.sites; snapshot.sites en filas antiguas). */
export function drillSites(drill: { state?: unknown; snapshot?: unknown }): SnapSite[] {
  return (
    ((drill.state ?? {}) as { sites?: SnapSite[] }).sites ??
    ((drill.snapshot ?? {}) as { sites?: SnapSite[] }).sites ??
    []
  );
}

/** Fracción del cauce alcanzada por el frente `elapsed` min después de la salida (interpola los tiempos de llegada de cada punto). */
function frontFraction(
  line: [number, number][],
  marks: { minutes: number; lng: number; lat: number }[],
  elapsed: number,
) {
  const pairs: [number, number][] = [[0, 0]];
  for (const m of marks) if (line.length > 1) pairs.push([m.minutes, progressAlong(line, m.lng, m.lat)]);
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
  return Math.min(1, Math.max(0.01, f));
}

const lineOf = (site: { cauce_geojson: unknown } | undefined) =>
  ((site?.cauce_geojson as { coordinates?: [number, number][] } | null)?.coordinates ?? []) as [
    number,
    number,
  ][];

/**
 * Rotura de presa: el frente sale de cada presa al abrirse su brecha y llega a cada punto de control
 * en su tiempo de llegada (geriam.site_downstream). En cada punto vale la presa cuya onda llega primero.
 */
function ruptureScene(data: OrgLive, snapSites: SnapSite[], simMin: number) {
  const broken = snapSites.filter((x) => x.role === "rotura");
  const floods: DrillScene["floods"] = [];
  const best = new Map<string, { at: number; from: string }>();
  let started = false;
  for (const b of broken) {
    const site = data.sites.find((s) => s.id === b.id);
    if (!site) continue;
    const breachAt = ROTURA_BREACH_AT + b.offset_min;
    const routes = data.routes.filter((r) => r.site_id === b.id);
    for (const r of routes) {
      const cur = best.get(r.point_id);
      const at = breachAt + r.tiempo_llegada_min;
      if (!cur || at < cur.at) best.set(r.point_id, { at, from: site.name.replace("Embalse ", "") });
    }
    const elapsed = simMin - breachAt;
    if (elapsed <= 0) continue;
    started = true;
    const marks = routes.flatMap((r) => {
      const p = data.points.find((x) => x.id === r.point_id);
      return p ? [{ minutes: r.tiempo_llegada_min, lng: p.lng, lat: p.lat }] : [];
    });
    floods.push({ siteId: b.id, fraction: frontFraction(lineOf(site), marks, elapsed) });
  }
  const etas: DrillScene["etas"] = started
    ? [...best.entries()].flatMap(([pid, v]) => {
        const p = data.points.find((x) => x.id === pid);
        return p
          ? [
              {
                name: p.name,
                lat: p.lat,
                lng: p.lng,
                remainingMin: v.at - simMin,
                poblacion: p.poblacion_expuesta,
                from: v.from,
              },
            ]
          : [];
      })
    : [];
  etas.sort((a, b) => a.remainingMin - b.remainingMin);
  return { floods, etas, brokenSiteIds: broken.map((b) => b.id) };
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
  // la más grave; entre iguales, el aviso de llegada más próximo (lo que la persona debe atender primero)
  const arrivalAt = (a: Alert) => {
    const tv = (a.trigger_values ?? {}) as { sim_started_min?: number };
    return (tv.sim_started_min ?? 0) + (alertEta(a)[0]?.minutes ?? 0);
  };
  const score = (a: Alert) => (RANK[a.level] ?? 0) * 1e6 + (a.type === "llegada" ? 1e5 - arrivalAt(a) : 0);
  const top = alerts.reduce<Alert | null>((m, a) => (!m || score(a) > score(m) ? a : m), null);
  const level = (top?.level ?? "normal") as DrillScene["level"];

  // Frente de crecida: la alerta más grave que tenga tiempos de llegada aguas abajo
  const withEta = alerts
    .filter((a) => alertEta(a).length > 0 && RANK[a.level] >= 2)
    .sort((a, b) => RANK[b.level] - RANK[a.level])[0];
  let flood: number | null = null;
  let etas: DrillScene["etas"] = [];
  let floods: DrillScene["floods"] = [];
  let brokenSiteIds: string[] = [];
  const snapSites = drillSites(drill);
  if (drill.scenario === "rotura") {
    const r = ruptureScene(
      data,
      snapSites.length ? snapSites : [{ id: site.id, code: site.code, role: "rotura", offset_min: 0 }],
      simMin,
    );
    floods = r.floods;
    etas = r.etas;
    brokenSiteIds = r.brokenSiteIds;
    flood = floods.find((f) => f.siteId === site.id)?.fraction ?? floods[0]?.fraction ?? null;
  } else if (withEta) {
    const tv = (withEta.trigger_values ?? {}) as { sim_started_min?: number };
    const elapsed = Math.max(0, simMin - (tv.sim_started_min ?? simMin));
    // Cada punto aguas abajo se proyecta sobre el cauce real: el frente de crecida llega a su
    // marcador justo cuando su cuenta regresiva llega a cero.
    const marks = alertEta(withEta).flatMap((e) => {
      const p = data.points.find((x) => x.id === e.point_id);
      return p ? [{ minutes: e.minutes, lng: p.lng, lat: p.lat }] : [];
    });
    flood = frontFraction(lineOf(site), marks, elapsed);
    floods = [{ siteId: site.id, fraction: flood }];
    etas = alertEta(withEta).flatMap((e) => {
      const p = data.points.find((x) => x.id === e.point_id);
      return p ? [{ name: e.name, lat: p.lat, lng: p.lng, remainingMin: e.minutes - elapsed }] : [];
    });
  }

  const nivelSensor = data.sensors.find((s) => s.site_id === site.id && s.type === "nivel_radar");
  const outSites = brokenSiteIds.length ? brokenSiteIds : [site.id];
  const qouts = data.sensors.filter(
    (s) => outSites.includes(s.site_id) && s.type === "caudal_salida" && s.last_value !== null,
  );
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
    siteName: brokenSiteIds.length
      ? brokenSiteIds
          .map((id) => data.sites.find((s) => s.id === id)?.name.replace("Embalse ", "") ?? "")
          .join(" + ")
      : site.name,
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
    floods,
    brokenSiteIds,
    breaches:
      drill.scenario === "rotura"
        ? (snapSites.length ? snapSites : [{ id: site.id, code: site.code, role: "rotura", offset_min: 0 }])
            .filter((x) => x.role === "rotura")
            .map((x) => ({ siteId: x.id, breachAtMin: ROTURA_BREACH_AT + x.offset_min }))
        : [],
    debris: ((drill.state ?? {}) as { debris?: DrillScene["debris"] }).debris ?? "agua",
    etas,
    topAlert: top,
    startedAt: new Date(drill.started_at).getTime(),
    rainAvg60,
    damOutflow: qouts.length ? qouts.reduce((a, x) => a + Number(x.last_value), 0) / 1000 : null,
  };
}
