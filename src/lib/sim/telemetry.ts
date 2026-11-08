/**
 * Conversión del estado físico a lecturas de sensores: ruido gaussiano pequeño,
 * cuantización del instrumento, pérdida ocasional de paquetes LoRa, batería y
 * calidad de enlace (RSSI/SNR) realistas.
 */
import type { SensorType } from "../domain/types";
import { createRng, quantize } from "./prng";
import { downstreamStage, qoutOf, type DownstreamStation, type SiteState } from "./physics";

export interface SimSensor {
  id: string;
  code: string;
  type: SensorType;
  intervalS: number;
  /** estación aguas abajo (nivel_rio en puntos de control) */
  station?: DownstreamStation;
  /** viaja por LoRaWAN (sujeto a pérdida de paquetes y al enlace del gateway) */
  lora: boolean;
  baseRssi: number;
  baseSnr: number;
}

export interface EmittedReading {
  sensorId: string;
  code: string;
  value: number;
  quality: number;
  raw: { rssi?: number; snr?: number; battery?: number; fcnt?: number; sim?: true; [k: string]: unknown };
}

export interface EmitOptions {
  /** "live": cada sensor reporta según su intervalo; "backfill": todos en cada paso */
  mode: "live" | "backfill";
  /** probabilidad de paquete perdido (LoRa) */
  packetLoss?: number;
  stepS?: number;
}

function physicalValue(sensor: SimSensor, s: SiteState, all: Record<string, SiteState>, emitIntervalS: number): number | null {
  switch (sensor.type) {
    case "nivel_radar":
      return s.cota;
    case "pluviometro":
      return null; // se maneja aparte (balancín)
    case "caudal_entrada":
      return s.qin * 1000;
    case "caudal_salida":
      return qoutOf(s) * 1000;
    case "piezometro":
      return sensor.code.endsWith("PZ-02") ? s.pz2 : s.pz1;
    case "asentamiento":
      return s.settle;
    case "inclinometro":
      return s.incl;
    case "nivel_rio":
      return sensor.station ? downstreamStage(sensor.station, all).stage : s.riverStage;
    case "energia_ups":
      return s.ups;
    case "starlink":
      return s.stlLatency;
    default:
      return emitIntervalS ? null : null;
  }
}

const NOISE: Record<SensorType, { sd: number; q: number; min?: number; max?: number }> = {
  nivel_radar: { sd: 0.0025, q: 0.001 },
  pluviometro: { sd: 0, q: 0.2, min: 0 },
  caudal_entrada: { sd: 0.012, q: 1, min: 0 }, // sd relativa
  caudal_salida: { sd: 0.006, q: 1, min: 0 },
  piezometro: { sd: 0.12, q: 0.1 },
  asentamiento: { sd: 0.015, q: 0.01 },
  inclinometro: { sd: 0.012, q: 0.01 },
  nivel_rio: { sd: 0.006, q: 0.005, min: 0 },
  energia_ups: { sd: 0.3, q: 1, min: 0, max: 100 },
  starlink: { sd: 0, q: 1, min: 20 },
};

/**
 * Emite las lecturas que corresponden en el instante `s.t`.
 * Muta `s.lastEmit`, `s.rainAcc` y `s.battery` (llamar con una copia del estado).
 */
export function emitReadings(
  s: SiteState,
  sensors: SimSensor[],
  all: Record<string, SiteState>,
  opts: EmitOptions,
): EmittedReading[] {
  const rng = createRng((s.seed ^ 0x9e3779b9) >>> 0);
  const tS = Math.floor(s.t / 1000);
  const out: EmittedReading[] = [];
  const loss = opts.packetLoss ?? (opts.mode === "live" ? 0.012 : 0.004);

  for (const sensor of sensors) {
    const last = s.lastEmit[sensor.code];
    const due = opts.mode === "backfill" || last === undefined || tS - last >= sensor.intervalS - 1;
    if (!due) continue;
    // Si el enlace Starlink del sitio cae, ningún sensor de la presa llega a la nube.
    if (!sensor.station && !s.stlOnline) continue;
    const elapsed = last === undefined ? (opts.stepS ?? sensor.intervalS) : tS - last;
    s.lastEmit[sensor.code] = tS;
    if (sensor.lora && rng.chance(loss)) continue; // paquete perdido

    let value: number | null;
    const n = NOISE[sensor.type];
    if (sensor.type === "pluviometro") {
      const tipped = Math.floor(s.rainAcc / 0.2 + 1e-9) * 0.2;
      s.rainAcc -= tipped;
      value = Math.round(tipped * 10) / 10;
    } else {
      const phys = physicalValue(sensor, s, all, elapsed);
      if (phys === null) continue;
      const relative = sensor.type === "caudal_entrada" || sensor.type === "caudal_salida";
      const noisy = relative ? phys * (1 + rng.gauss(0, n.sd)) : phys + rng.gauss(0, n.sd);
      value = quantize(noisy, n.q);
    }
    if (n.min !== undefined) value = Math.max(n.min, value);
    if (n.max !== undefined) value = Math.min(n.max, value);
    value = Math.round(value * 10000) / 10000;

    // batería: descarga lenta (≈ 0,35 %/día) con ligera recarga solar en nodos con panel
    const bat = s.battery[sensor.code] ?? 70 + (sensor.baseRssi % 25);
    const nextBat = Math.max(5, bat - (0.35 / 86400) * elapsed + (sensor.type === "energia_ups" || sensor.type === "starlink" ? 1 : 0));
    s.battery[sensor.code] = Math.min(100, nextBat);
    // atenuación por lluvia en LoRa (pequeña)
    const rainFade = Math.min(4, s.intensity * 0.12);
    const rssi = Math.round(sensor.baseRssi + rng.gauss(0, 2.2) - rainFade);
    const snr = Math.round((sensor.baseSnr + rng.gauss(0, 1.1) - rainFade * 0.6) * 10) / 10;
    out.push({
      sensorId: sensor.id,
      code: sensor.code,
      value,
      quality: 0,
      raw: sensor.lora ? { rssi, snr, battery: Math.round(nextBat * 10) / 10, sim: true } : { sim: true },
    });
  }
  return out;
}
