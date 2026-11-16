/**
 * Impacto de la crecida por rotura (estimación de primer nivel, sin dependencias de runtime).
 *
 * Datos (scripts/flood-hazard.py → public/flood/): celdas del valle con su altura sobre el río (HAND)
 * y la celda del río a la que drenan, curvas de descarga sintéticas por tramo de 500 m, edificaciones,
 * puentes y zonas con nombre.
 *
 * Modelo, con el mismo hidrograma de brecha y la misma onda que el simulacro (src/lib/sim/physics.ts):
 *   caudal en cada celda del río = Σ presas [hidrograma desfasado al tiempo de llegada × atenuación]
 *   × factor de volumen por escombros → nivel con la curva del tramo (Manning, n ajustado por
 *   escombros) → profundidad en cada celda = nivel − HAND → peligro por profundidad y por
 *   profundidad × velocidad × densidad (clases simplificadas de ARR 2019 / USBR).
 */
import { initialState, stepSite, type SiteParams } from "../sim/physics";

export type Debris = "agua" | "moderado" | "lodo";

/** Contenido de escombros: concentración volumétrica de sedimento Cv → volumen y densidad de la mezcla. */
export const DEBRIS: Record<
  Debris,
  {
    label: string;
    short: string;
    cv: number;
    bulking: number;
    density: number;
    nFactor: number;
    desc: string;
  }
> = {
  agua: {
    label: "Solo agua",
    short: "Agua",
    cv: 0,
    bulking: 1,
    density: 1000,
    nFactor: 1,
    desc: "Crecida de agua clara (caso de referencia).",
  },
  moderado: {
    label: "Con escombros",
    short: "Escombros",
    cv: 0.3,
    bulking: 1 / (1 - 0.3),
    density: 1000 + 1650 * 0.3,
    nFactor: 1.2,
    desc: "Flujo hiperconcentrado: arrastra el material de la presa, piedras y árboles (≈30 % de sólidos). El volumen crece ×1,4 y el golpe es ~1,5 veces más fuerte.",
  },
  lodo: {
    label: "Flujo de lodo",
    short: "Lodo",
    cv: 0.5,
    bulking: 1 / (1 - 0.5),
    density: 1000 + 1650 * 0.5,
    nFactor: 1.5,
    desc: "Flujo de lodo y detritos (≈50 % de sólidos): el volumen se duplica y la mezcla pesa ~1,8 veces el agua.",
  },
};

/** Clases de peligro (0 = seco). */
export const HAZARD = [
  { key: "seco", label: "Sin agua", color: [0, 0, 0, 0] },
  {
    key: "bajo",
    label: "Bajo",
    color: [56, 189, 248, 190],
    note: "Agua baja y lenta: peligro para niños y adultos mayores",
  },
  {
    key: "medio",
    label: "Medio",
    color: [250, 204, 21, 210],
    note: "Arrastra vehículos; peligroso para personas",
  },
  {
    key: "alto",
    label: "Alto",
    color: [251, 146, 60, 225],
    note: "Arrastra personas; daña viviendas livianas",
  },
  {
    key: "extremo",
    label: "Extremo",
    color: [239, 68, 68, 240],
    note: "Daño estructural y colapso de edificaciones",
  },
] as const;

/** Clase de peligro por profundidad (m) y fuerza del flujo (profundidad × velocidad × densidad relativa, m²/s). */
export function hazardClass(depth: number, velocity: number, density = 1000): number {
  if (depth <= 0.05) return 0;
  const dv = depth * velocity * (density / 1000);
  if (depth > 4 || dv > 3) return 4;
  if (depth > 2 || dv > 1) return 3;
  if (depth > 0.5 || dv > 0.5) return 2;
  return 1;
}

export interface FloodMeta {
  version: number;
  width: number;
  height: number;
  corners: [number, number][];
  cellM: number;
  cellArea: number;
  manning: number;
  levels: number[];
  river: { lng: number[]; lat: number[]; seg: number[]; zone: number[]; km: Record<string, number[]> };
  segments: { S: number; L: number; q: number[]; a: number[] }[];
  zones: string[];
  bridges: { name: string; rid: number; cell: number; lng: number; lat: number }[];
  nCells: number;
  nBuildings: number;
}

export interface FloodData {
  meta: FloodMeta;
  pix: Uint32Array;
  hand: Uint16Array; // cm
  rid: Uint16Array;
  buildings: Uint32Array; // índice de celda de cada edificación
}

export function parseFlood(meta: FloodMeta, cells: ArrayBuffer, buildings: ArrayBuffer): FloodData {
  const n = meta.nCells;
  return {
    meta,
    pix: new Uint32Array(cells, 0, n),
    hand: new Uint16Array(cells, 4 * n, n),
    rid: new Uint16Array(cells, 6 * n, n),
    buildings: new Uint32Array(buildings),
  };
}

/** Caudal por la brecha (m³/s) minuto a minuto desde que se abre, con el embalse lleno (NAMO). */
export function breachHydrograph(p: SiteParams, minutes = 300): Float64Array {
  let s = initialState(p, p.namo, 0, 7);
  const out = new Float64Array(minutes + 1);
  for (let m = 0; m <= minutes; m++) {
    s = stepSite(p, s, 60, { breachMin: m, rainMmH: 0 });
    out[m] = s.qbreach ?? 0;
  }
  return out;
}

export interface DamInput {
  code: string;
  name: string;
  /** minuto del escenario en que se abre la brecha */
  breachAtMin: number;
  hydro: Float64Array;
  /** tiempos de llegada del frente: pares (km por el cauce, minutos) */
  table: [number, number][];
}

/** Minutos de llegada del frente a `km` (interpolación de los tiempos de llegada de los puntos de control). */
export function arrivalAt(table: [number, number][], km: number): number {
  const t = [[0, 0] as [number, number], ...table].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < t.length; i++) {
    if (km <= t[i][0]) {
      const [k0, m0] = t[i - 1];
      const [k1, m1] = t[i];
      return m0 + ((m1 - m0) * (km - k0)) / Math.max(1e-6, k1 - k0);
    }
  }
  const [k0, m0] = t[t.length - 2] ?? [0, 0];
  const [k1, m1] = t[t.length - 1];
  return m1 + ((m1 - m0) * (km - k1)) / Math.max(1e-6, k1 - k0);
}

const LEAD_MIN = 10; // como BREACH_LEAD_MIN en physics.ts

function prefix(h: Float64Array) {
  const p = new Float64Array(h.length + 1);
  for (let i = 0; i < h.length; i++) p[i + 1] = p[i] + h[i];
  return p;
}

/** Nivel (m) para un caudal en un tramo, con la curva sintética; n escalado por escombros. */
export function stageFor(seg: FloodMeta["segments"][number], levels: number[], q: number, nFactor = 1) {
  const target = q * nFactor; // Q ∝ 1/n: con n mayor hace falta más nivel para el mismo caudal
  const Q = seg.q;
  if (target <= 0) return { h: 0, area: 0 };
  if (target <= Q[0]) {
    const h = levels[0] * Math.pow(target / Q[0], 0.6);
    return { h, area: seg.a[0] * (h / levels[0]) };
  }
  for (let i = 1; i < Q.length; i++) {
    if (target <= Q[i]) {
      const f = Math.log(target / Q[i - 1]) / Math.log(Q[i] / Q[i - 1]);
      return {
        h: levels[i - 1] + f * (levels[i] - levels[i - 1]),
        area: seg.a[i - 1] + f * (seg.a[i] - seg.a[i - 1]),
      };
    }
  }
  return { h: levels[levels.length - 1], area: seg.a[seg.a.length - 1] };
}

export interface ZoneImpact {
  zone: number;
  name: string;
  areaHa: number;
  maxDepth: number;
  buildings: [number, number, number, number, number]; // por clase
  bridges: { name: string; cls: number }[];
  /** minuto del escenario en que llega el frente */
  arrivalMin: number | null;
  worst: number;
  score: number;
  /** centro de la zona (tramo del río) para ubicarla en el mapa */
  lng: number;
  lat: number;
}

export interface ImpactResult {
  /** nivel de agua máximo (envolvente) por celda del río, m */
  stage: Float32Array;
  /** clase de peligro por celda del valle */
  cls: Uint8Array;
  depth: Float32Array;
  totals: {
    areaHa: number;
    areaByClass: number[];
    buildingsByClass: number[];
    bridgesHit: number;
    people: number;
    peakQ: number;
  };
  zones: ZoneImpact[];
}

/** Personas por vivienda (Censo INEC 2022, Tungurahua ≈ 3,4; se usa 3,5 como referencia). */
export const PEOPLE_PER_BUILDING = 3.5;

/**
 * Envolvente de la crecida hasta el minuto `tNow` del escenario (null = toda la crecida).
 * Si `scenarioMin` es null, se toma el máximo hasta el final de cada hidrograma.
 */
export function computeImpact(
  fd: FloodData,
  dams: DamInput[],
  debris: Debris,
  tNow: number | null,
): ImpactResult {
  const m = fd.meta;
  const nr = m.river.lng.length;
  const dbr = DEBRIS[debris];
  const stage = new Float32Array(nr);
  const vel = new Float32Array(nr);
  const peakQ = new Float32Array(nr);
  const pre = dams.map((d) => prefix(d.hydro));
  const lastT = Math.max(0, ...dams.map((d) => d.breachAtMin + d.hydro.length + 260));
  const tEnd = tNow === null ? lastT : Math.min(tNow, lastT);
  // por celda de río: llegada y atenuación de cada presa
  const arr = dams.map((d) => {
    const km = m.river.km[d.code];
    const a = new Float32Array(nr);
    const att = new Float32Array(nr);
    for (let r = 0; r < nr; r++) {
      const k = km?.[r] ?? -1;
      a[r] = k < 0 ? -1 : arrivalAt(d.table, k);
      att[r] = k < 0 ? 0 : 1 / (1 + 0.03 * k);
    }
    return { a, att };
  });
  for (let r = 0; r < nr; r++) {
    let best = 0;
    for (let t = 0; t <= tEnd; t += 2) {
      let q = 0;
      for (let di = 0; di < dams.length; di++) {
        const A = arr[di].a[r];
        if (A < 0) continue;
        const d = dams[di];
        // el agua no llega a un tramo antes que el frente de la onda (su tiempo de llegada)
        if (t - d.breachAtMin < A - 1) continue;
        const center = Math.max(0, A - LEAD_MIN);
        const spread = 5 + 0.1 * A;
        // agua que salió de la presa entre (t − breach − center − spread) y (t − breach − center + spread)
        const hi = Math.floor(t - d.breachAtMin - Math.max(0, center - spread));
        const lo = Math.floor(t - d.breachAtMin - (center + spread));
        const a0 = Math.max(0, lo);
        const a1 = Math.min(d.hydro.length - 1, hi);
        if (a1 < a0) continue;
        const width = Math.max(1, hi - lo + 1);
        q += ((pre[di][a1 + 1] - pre[di][a0]) / width) * arr[di].att[r];
      }
      if (q > best) best = q;
    }
    const Q = best * dbr.bulking;
    peakQ[r] = Q;
    const seg = m.segments[m.river.seg[r]];
    const { h, area } = stageFor(seg, m.levels, Q, dbr.nFactor);
    stage[r] = h;
    vel[r] = area > 0 ? Math.min(12, Q / area) : 0;
  }
  // celdas del valle
  const n = m.nCells;
  const cls = new Uint8Array(n);
  const depth = new Float32Array(n);
  const areaByClass = [0, 0, 0, 0, 0];
  const nz = m.zones.length;
  const zArea = new Float64Array(nz);
  const zMax = new Float32Array(nz);
  const zWorst = new Uint8Array(nz);
  for (let i = 0; i < n; i++) {
    const r = fd.rid[i];
    const h = stage[r];
    const d = h - fd.hand[i] / 100;
    if (d <= 0.05) continue;
    const v = vel[r] * Math.pow(Math.min(1, d / Math.max(0.1, h)), 2 / 3);
    const c = hazardClass(d, v, dbr.density);
    cls[i] = c;
    depth[i] = d;
    areaByClass[c] += m.cellArea / 1e4;
    const z = m.river.zone[r];
    zArea[z] += m.cellArea / 1e4;
    if (d > zMax[z]) zMax[z] = d;
    if (c > zWorst[z]) zWorst[z] = c;
  }
  const buildingsByClass = [0, 0, 0, 0, 0];
  const zB: number[][] = Array.from({ length: nz }, () => [0, 0, 0, 0, 0]);
  for (const bi of fd.buildings) {
    const c = cls[bi];
    buildingsByClass[c]++;
    if (c) zB[m.river.zone[fd.rid[bi]]][c]++;
  }
  const zBr: { name: string; cls: number }[][] = Array.from({ length: nz }, () => []);
  let bridgesHit = 0;
  for (const b of m.bridges) {
    // un puente se considera afectado si el agua llega a su celda (tablero bajo la crecida)
    const c = Math.max(
      cls[b.cell] ?? 0,
      stage[b.rid] > 3 ? hazardClass(stage[b.rid] - 3, vel[b.rid], dbr.density) : 0,
    );
    if (!c) continue;
    bridgesHit++;
    zBr[m.river.zone[b.rid]].push({ name: b.name, cls: c });
  }
  // llegada del frente a cada zona: la primera celda de río de la zona alcanzada por alguna presa
  const zArr = new Float64Array(nz).fill(Infinity);
  const zLng = new Float64Array(nz);
  const zLat = new Float64Array(nz);
  const zN = new Float64Array(nz);
  for (let r = 0; r < nr; r++) {
    if (stage[r] < 0.3) continue;
    const z = m.river.zone[r];
    zLng[z] += m.river.lng[r];
    zLat[z] += m.river.lat[r];
    zN[z]++;
  }
  for (let r = 0; r < nr; r++) {
    if (stage[r] < 0.5) continue;
    for (let di = 0; di < dams.length; di++) {
      const A = arr[di].a[r];
      if (A < 0) continue;
      const t = dams[di].breachAtMin + A;
      const z = m.river.zone[r];
      if (t < zArr[z]) zArr[z] = t;
    }
  }
  const zones: ZoneImpact[] = [];
  for (let z = 0; z < nz; z++) {
    if (zArea[z] <= 0) continue;
    const b = zB[z] as ZoneImpact["buildings"];
    const score =
      b[4] * 6 +
      b[3] * 3 +
      b[2] +
      zBr[z].reduce((a, x) => a + (x.cls >= 3 ? 8 : 2), 0) +
      zArea[z] * 0.05 +
      zWorst[z];
    zones.push({
      zone: z,
      name: m.zones[z],
      areaHa: zArea[z],
      maxDepth: zMax[z],
      buildings: b,
      bridges: zBr[z],
      arrivalMin: Number.isFinite(zArr[z]) ? zArr[z] : null,
      worst: zWorst[z],
      score,
      lng: zN[z] ? zLng[z] / zN[z] : m.river.lng[0],
      lat: zN[z] ? zLat[z] / zN[z] : m.river.lat[0],
    });
  }
  zones.sort((a, b) => b.score - a.score);
  const hit = buildingsByClass.slice(1).reduce((a, x) => a + x, 0);
  return {
    stage,
    cls,
    depth,
    totals: {
      areaHa: areaByClass.reduce((a, x) => a + x, 0),
      areaByClass,
      buildingsByClass,
      bridgesHit,
      people: Math.round(hit * PEOPLE_PER_BUILDING),
      peakQ: Math.max(0, ...peakQ),
    },
    zones,
  };
}

/** Pinta las clases de peligro en un buffer RGBA del tamaño de la rejilla (alineada al mapa). */
export function paintHazard(fd: FloodData, cls: Uint8Array, rgba: Uint8ClampedArray) {
  rgba.fill(0);
  for (let i = 0; i < cls.length; i++) {
    const c = cls[i];
    if (!c) continue;
    const o = fd.pix[i] * 4;
    const col = HAZARD[c].color;
    rgba[o] = col[0];
    rgba[o + 1] = col[1];
    rgba[o + 2] = col[2];
    rgba[o + 3] = col[3];
  }
}
