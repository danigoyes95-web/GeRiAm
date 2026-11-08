/**
 * Motor físico de GeRiAm (TypeScript puro, sin dependencias de runtime):
 * lluvia estocástica → escorrentía (depósitos lineales) → balance hídrico del
 * embalse → vertedero (Q = C·L·H^1.5) → piezómetros con retardo → río aguas abajo.
 * Se ejecuta igual en Node (API / tests / backfill) y en Deno (Edge Function).
 */
import { cotaAt, volumeAt, areaAt } from "../hydro/curve";
import type { AreaVolumePoint } from "../domain/types";
import { createRng, type Rng } from "./prng";

export interface SiteParams {
  code: string;
  fondo: number;
  namo: number;
  name: number;
  vertedero: number;
  cresta: number;
  longitudVertedero: number;
  coefDescarga: number;
  qinBase: number; // m³/s
  qoutNominal: number; // m³/s
  areaCuencaKm2: number;
  capacity: number;
  curve: AreaVolumePoint[];
  /** capacidad máxima de la descarga de fondo (m³/s) */
  valveMax: number;
}

export interface Storm {
  remainingMin: number;
  durationMin: number;
  peak: number; // mm/h
}

export interface SiteState {
  t: number; // epoch ms
  seed: number;
  v: number; // m³
  cota: number;
  qin: number;
  qvalve: number;
  qspill: number;
  sFast: number; // m³ almacenados en el depósito rápido
  sSlow: number;
  storm: Storm | null;
  drizzleMin: number;
  intensity: number; // mm/h
  rainAcc: number; // mm acumulados aún no reportados (balancín)
  pz1: number;
  pz2: number;
  settle: number;
  incl: number;
  ups: number;
  stlOnline: boolean;
  stlLatency: number;
  riverStage: number;
  outHist: number[]; // Qout (m³/s) cada 5 min, el más reciente al final
  histAccS: number;
  lastEmit: Record<string, number>; // código → epoch s del último reporte
  battery: Record<string, number>;
}

/** Forzamientos de simulacro (todos opcionales). */
export interface Forcing {
  rainMmH?: number;
  runoffCoef?: number;
  pz1Delta?: number;
  pz2Delta?: number;
  settleJump?: number;
  inclDelta?: number;
  starlinkDown?: boolean;
  latencyBoost?: number;
  valveOpen?: number; // fuerza caudal de la descarga de fondo (m³/s)
}

export const MEAN_RAIN_MM_DAY = 4.5;
const K_FAST_S = 3.5 * 3600;
const K_SLOW_S = 60 * 3600;
const HIST_STEP_S = 300;
const HIST_LEN = 84; // 7 h

export function localHour(tMs: number): number {
  return (((new Date(tMs).getUTCHours() - 5) % 24) + 24) % 24 + new Date(tMs).getUTCMinutes() / 60;
}

function runoffCoef(p: SiteParams): number {
  const meanRate = ((MEAN_RAIN_MM_DAY / 1000) * p.areaCuencaKm2 * 1e6) / 86400; // m³/s de lluvia media
  return (0.7 * p.qinBase) / meanRate;
}

export function pz1Target(p: SiteParams, cota: number) {
  return 40 + 4.2 * (cota - p.fondo);
}
export function pz2Target(p: SiteParams, cota: number) {
  return 95 + 5 * (cota - p.fondo);
}
export function riverStageBelowDam(q: number) {
  return 0.35 + 0.42 * Math.pow(Math.max(0, q), 0.45);
}

/** Estado inicial en equilibrio a una cota dada. */
export function initialState(p: SiteParams, cota: number, tMs: number, seed: number): SiteState {
  const coef = runoffCoef(p);
  const meanRate = ((MEAN_RAIN_MM_DAY / 1000) * p.areaCuencaKm2 * 1e6) / 86400;
  const sFast = 0.4 * coef * meanRate * K_FAST_S;
  const sSlow = 0.6 * coef * meanRate * K_SLOW_S;
  const qout = p.qoutNominal;
  return {
    t: tMs,
    seed,
    v: volumeAt(p.curve, cota),
    cota,
    qin: p.qinBase,
    qvalve: p.qoutNominal,
    qspill: 0,
    sFast,
    sSlow,
    storm: null,
    drizzleMin: 0,
    intensity: 0,
    rainAcc: 0,
    pz1: pz1Target(p, cota),
    pz2: pz2Target(p, cota),
    settle: 12.4 + (seed % 100) / 100,
    incl: 3.1 + (seed % 37) / 100,
    ups: 96,
    stlOnline: true,
    stlLatency: 38,
    riverStage: riverStageBelowDam(qout),
    outHist: Array.from({ length: HIST_LEN }, () => qout),
    histAccS: 0,
    lastEmit: {},
    battery: {},
  };
}

function valveTarget(p: SiteParams, s: SiteState): number {
  // Operación: caudal nominal (abastecimiento/regulación). Si el nivel supera
  // NAMO − 0,45 m, la operación abre progresivamente la descarga de fondo.
  const trigger = p.namo - 0.45;
  if (s.cota <= trigger) return p.qoutNominal;
  const extra = (s.cota - trigger) * 1.6 * Math.max(1, s.qin / Math.max(0.05, p.qinBase));
  return Math.min(p.valveMax, Math.max(p.qoutNominal, p.qoutNominal + extra));
}

function stepRain(s: SiteState, rng: Rng, dtS: number, forcing?: Forcing) {
  if (forcing?.rainMmH !== undefined) {
    s.intensity = Math.max(0, forcing.rainMmH * (1 + rng.gauss(0, 0.08)));
    s.storm = null;
    return;
  }
  const dtMin = dtS / 60;
  const h = localHour(s.t);
  const diurnal = h >= 12 && h < 19 ? 1.8 : h >= 6 && h < 12 ? 0.8 : 0.6;
  if (!s.storm) {
    if (rng.chance((0.042 / 60) * dtMin * diurnal)) {
      const peak = Math.min(38, Math.exp(rng.gauss(Math.log(3.2), 0.7)));
      const dur = rng.range(40, 260);
      s.storm = { remainingMin: dur, durationMin: dur, peak };
    }
  }
  let storm = 0;
  if (s.storm) {
    const prog = 1 - s.storm.remainingMin / s.storm.durationMin;
    const shape = prog < 0.35 ? prog / 0.35 : (1 - prog) / 0.65;
    storm = s.storm.peak * Math.max(0, shape) * (1 + rng.gauss(0, 0.18));
    s.storm.remainingMin -= dtMin;
    if (s.storm.remainingMin <= 0) s.storm = null;
  }
  // garúa de páramo
  if (s.drizzleMin <= 0 && rng.chance((0.05 / 60) * dtMin)) s.drizzleMin = rng.range(20, 120);
  let drizzle = 0;
  if (s.drizzleMin > 0) {
    drizzle = Math.max(0, rng.gauss(0.35, 0.15));
    s.drizzleMin -= dtMin;
  }
  s.intensity = Math.max(0, storm + drizzle);
}

/** Avanza un embalse `dtS` segundos (subpasos de ≤ 60 s). */
export function stepSite(p: SiteParams, prev: SiteState, dtS: number, forcing?: Forcing): SiteState {
  const s: SiteState = { ...prev, storm: prev.storm ? { ...prev.storm } : null, outHist: prev.outHist.slice(), lastEmit: { ...prev.lastEmit }, battery: { ...prev.battery } };
  const rng = createRng(s.seed);
  const coefBase = runoffCoef(p);
  let remaining = dtS;
  while (remaining > 0) {
    const dt = Math.min(60, remaining);
    remaining -= dt;
    s.t += dt * 1000;

    stepRain(s, rng, dt, forcing);
    s.rainAcc += (s.intensity * dt) / 3600;

    // escorrentía: dos depósitos lineales
    const rainRate = ((s.intensity / 1000) * p.areaCuencaKm2 * 1e6) / 3600; // m³/s
    const coef = forcing?.runoffCoef ?? coefBase;
    const fFast = Math.min(0.9, 0.35 + s.intensity / 80);
    s.sFast += (fFast * coef * rainRate - s.sFast / K_FAST_S) * dt;
    s.sSlow += ((1 - fFast) * coef * rainRate - s.sSlow / K_SLOW_S) * dt;
    s.qin = 0.3 * p.qinBase + s.sFast / K_FAST_S + s.sSlow / K_SLOW_S;

    // salida: descarga de fondo (operación) + vertedero libre
    const vt = forcing?.valveOpen ?? valveTarget(p, s);
    s.qvalve += (vt - s.qvalve) * Math.min(1, dt / 1800);
    const H = s.cota - p.vertedero;
    s.qspill = H > 0 ? p.coefDescarga * p.longitudVertedero * Math.pow(H, 1.5) : 0;
    const evap = ((2 / 1000) * areaAt(p.curve, s.cota)) / 86400;

    // balance hídrico ΔV = (Qin − Qout − Qvert) · Δt
    s.v = Math.max(0, s.v + (s.qin - s.qvalve - s.qspill - evap) * dt);
    s.cota = cotaAt(p.curve, s.v);

    // geotecnia: presión de poro con retardo + deriva mínima
    const t1 = pz1Target(p, s.cota) + (forcing?.pz1Delta ?? 0);
    const t2 = pz2Target(p, s.cota) + (forcing?.pz2Delta ?? 0);
    const tau1 = forcing?.pz1Delta ? 1800 : 12 * 3600;
    const tau2 = forcing?.pz2Delta ? 3600 : 36 * 3600;
    s.pz1 += (t1 - s.pz1) * Math.min(1, dt / tau1);
    s.pz2 += (t2 - s.pz2) * Math.min(1, dt / tau2);
    s.settle += (0.002 / 86400) * dt;
    s.incl += (0.0006 / 86400) * dt + ((forcing?.inclDelta ?? 0) * dt) / 3600;

    // energía: banco solar (día carga, noche descarga)
    const h = localHour(s.t);
    const sun = h >= 7 && h < 17.5 ? Math.sin(((h - 7) / 10.5) * Math.PI) : 0;
    s.ups = Math.min(100, Math.max(0, s.ups + ((sun * 9 - 1.2) * dt) / 3600));

    // Starlink: latencia diurna + atenuación por lluvia + picos
    s.stlOnline = !forcing?.starlinkDown;
    const base = 36 + 7 * Math.sin((h / 24) * 2 * Math.PI) + Math.min(60, s.intensity * 1.8);
    const spike = rng.chance(0.025) ? Math.abs(rng.gauss(70, 30)) : 0;
    s.stlLatency = Math.max(22, base + rng.gauss(0, 4) + spike + (forcing?.latencyBoost ?? 0));

    const qout = s.qvalve + s.qspill;
    s.riverStage = riverStageBelowDam(qout);
    s.histAccS += dt;
    if (s.histAccS >= HIST_STEP_S) {
      s.histAccS -= HIST_STEP_S;
      s.outHist.push(qout);
      if (s.outHist.length > HIST_LEN) s.outHist.shift();
    }
  }
  if (forcing?.settleJump) s.settle += forcing.settleJump;
  s.seed = rng.state();
  return s;
}

export function qoutOf(s: SiteState) {
  return s.qvalve + s.qspill;
}

/** Qout del sitio hace `minutes` (historial cada 5 min). */
export function qoutAgo(s: SiteState, minutes: number): number {
  const idx = s.outHist.length - 1 - Math.round(minutes / 5);
  if (idx < 0) return s.outHist[0] ?? qoutOf(s);
  return s.outHist[idx];
}

export interface DownstreamStation {
  code: string;
  baseFlow: number; // m³/s aportes laterales
  transit: Record<string, number>; // código de sitio → minutos de tránsito ordinario
}

/** Caudal y nivel del río en una estación aguas abajo (desfase = tiempo de tránsito). */
export function downstreamStage(st: DownstreamStation, sites: Record<string, SiteState>): { q: number; stage: number } {
  let q = st.baseFlow;
  let localRain = 0;
  let n = 0;
  for (const [code, minutes] of Object.entries(st.transit)) {
    const s = sites[code];
    if (!s) continue;
    q += qoutAgo(s, minutes);
    localRain += s.sFast / K_FAST_S;
    n++;
  }
  q += n ? (localRain / n) * 1.6 : 0;
  return { q, stage: 0.45 + 0.36 * Math.sqrt(Math.max(0, q)) };
}

export function fillPct(p: SiteParams, s: SiteState) {
  return (s.v / p.capacity) * 100;
}
