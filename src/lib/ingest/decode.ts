/**
 * Ingesta de datos reales: decodificación de los formatos que envían los servidores de red
 * LoRaWAN (ChirpStack v4, The Things Stack v3) y de un formato genérico por código de sensor,
 * y validación física de cada valor antes de guardarlo (TypeScript puro, probado en tests/ingest.test.ts).
 */
import type { SensorType } from "../domain/types";

export interface Uplink {
  /** identificador del dispositivo LoRaWAN (hex, mayúsculas) */
  devEui?: string;
  /** o el código del sensor en GeRiAm (formato genérico) */
  sensorCode?: string;
  /** contador de tramas (idempotencia LoRaWAN) */
  fcnt?: number;
  /** ms epoch del dato */
  ts: number;
  /** valor ya extraído o el objeto decodificado del que se extrae según el tipo de sensor */
  value?: number;
  decoded?: Record<string, unknown>;
  rssi?: number;
  snr?: number;
  battery?: number;
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : undefined;
const eui = (v: unknown) =>
  typeof v === "string" && /^[0-9a-fA-F]{16}$/.test(v) ? v.toUpperCase() : undefined;
const time = (v: unknown) => {
  const t = typeof v === "string" ? Date.parse(v) : typeof v === "number" ? (v > 1e12 ? v : v * 1000) : NaN;
  return Number.isFinite(t) ? t : undefined;
};
const obj = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

export type IngestFormat = "chirpstack" | "ttn" | "generic";

/** Detecta el formato y devuelve los uplinks. Lanza Error con un mensaje claro si no reconoce el cuerpo. */
export function decodeBody(body: unknown, now = Date.now()): { format: IngestFormat; uplinks: Uplink[] } {
  const b = obj(body);
  if (!b) throw new Error("El cuerpo debe ser un objeto JSON");

  // ChirpStack v4 (evento "up"): deviceInfo.devEui, fCnt, time, object, rxInfo[]
  const di = obj(b.deviceInfo);
  if (di && eui(di.devEui)) {
    const rx = Array.isArray(b.rxInfo) ? (b.rxInfo as unknown[]).map(obj).filter(Boolean) : [];
    const best = rx.sort((x, y) => (num(y!.rssi) ?? -999) - (num(x!.rssi) ?? -999))[0];
    const o = obj(b.object) ?? {};
    return {
      format: "chirpstack",
      uplinks: [
        {
          devEui: eui(di.devEui),
          fcnt: num(b.fCnt),
          ts: time(b.time) ?? now,
          decoded: o,
          rssi: num(best?.rssi),
          snr: num(best?.snr),
          battery: num(o.battery ?? o.bateria ?? o.batteryLevel),
        },
      ],
    };
  }

  // The Things Stack v3: end_device_ids.dev_eui, uplink_message.{f_cnt, decoded_payload, rx_metadata[]}
  const ids = obj(b.end_device_ids);
  const um = obj(b.uplink_message);
  if (ids && um && eui(ids.dev_eui)) {
    const rx = Array.isArray(um.rx_metadata) ? (um.rx_metadata as unknown[]).map(obj).filter(Boolean) : [];
    const best = rx.sort((x, y) => (num(y!.rssi) ?? -999) - (num(x!.rssi) ?? -999))[0];
    const o = obj(um.decoded_payload) ?? {};
    return {
      format: "ttn",
      uplinks: [
        {
          devEui: eui(ids.dev_eui),
          fcnt: num(um.f_cnt),
          ts: time(um.received_at) ?? time(b.received_at) ?? now,
          decoded: o,
          rssi: num(best?.rssi),
          snr: num(best?.snr),
          battery: num(o.battery ?? o.bateria ?? o.batteryLevel),
        },
      ],
    };
  }

  // Genérico: { readings: [{ sensor_code, value, ts? }] } (SCADA, estaciones por API, pruebas)
  if (Array.isArray(b.readings)) {
    const rows = b.readings as unknown[];
    if (rows.length > 500) throw new Error("Máximo 500 lecturas por envío");
    return {
      format: "generic",
      uplinks: rows.map((r, i) => {
        const o = obj(r);
        const code = typeof o?.sensor_code === "string" ? o.sensor_code.trim() : "";
        const v = num(o?.value);
        if (!code || v === undefined)
          throw new Error(`Lectura ${i + 1}: requiere sensor_code y value numérico`);
        return { sensorCode: code, value: v, ts: time(o?.ts) ?? now };
      }),
    };
  }
  throw new Error(
    "Formato no reconocido: se acepta ChirpStack v4, The Things Stack v3 o { readings: [...] }",
  );
}

/** Campos del objeto decodificado que se buscan para cada tipo de sensor (en orden). */
const FIELDS: Record<SensorType, string[]> = {
  nivel_radar: ["nivel", "level", "cota", "water_level", "value"],
  nivel_rio: ["nivel", "level", "stage", "water_level", "value"],
  pluviometro: ["lluvia", "rain", "rainfall", "precipitation", "value"],
  caudal_entrada: ["caudal", "flow", "q", "value"],
  caudal_salida: ["caudal", "flow", "q", "value"],
  piezometro: ["presion", "pressure", "pore_pressure", "kpa", "value"],
  asentamiento: ["asentamiento", "settlement", "displacement", "mm", "value"],
  inclinometro: ["inclinacion", "tilt", "displacement", "mm", "value"],
  energia_ups: ["bateria_ups", "ups", "soc", "battery", "value"],
  starlink: ["latencia", "latency", "latency_ms", "value"],
} as Record<SensorType, string[]>;

export function extractValue(u: Uplink, type: SensorType): number | undefined {
  if (u.value !== undefined) return u.value;
  const o = u.decoded ?? {};
  for (const k of FIELDS[type] ?? ["value"]) {
    const v = num(o[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Rango físicamente posible por tipo de sensor (fuera de él la lectura se rechaza). */
export function physicalRange(type: SensorType, site?: { fondo: number; cresta: number }): [number, number] {
  switch (type) {
    case "nivel_radar":
      return site ? [site.fondo - 2, site.cresta + 3] : [0, 6500];
    case "nivel_rio":
      return [0, 25];
    case "pluviometro":
      return [0, 80]; // mm por intervalo de reporte
    case "caudal_entrada":
    case "caudal_salida":
      return [0, 5_000_000]; // L/s (hasta 5.000 m³/s, rotura)
    case "piezometro":
      return [-100, 3000]; // kPa
    case "asentamiento":
    case "inclinometro":
      return [-1000, 1000]; // mm
    case "energia_ups":
      return [0, 100]; // %
    case "starlink":
      return [0, 60_000]; // ms
    default:
      return [-1e9, 1e9];
  }
}

/** Cambio máximo creíble por minuto; un salto mayor se guarda como "dudoso" (calidad 1) pero no se descarta. */
const MAX_RATE_PER_MIN: Partial<Record<SensorType, number>> = {
  nivel_radar: 0.5, // m/min
  nivel_rio: 1.5,
  piezometro: 40, // kPa/min
  asentamiento: 20,
  inclinometro: 20,
};

export interface Verdict {
  ok: boolean;
  quality: 0 | 1;
  reason?: string;
}

/** Valida un valor: rango físico, fecha creíble y salto respecto del último valor. */
export function validateReading(
  type: SensorType,
  value: number,
  ts: number,
  opts: {
    now: number;
    site?: { fondo: number; cresta: number };
    last?: { value: number; ts: number } | null;
  },
): Verdict {
  if (!Number.isFinite(value)) return { ok: false, quality: 0, reason: "valor no numérico" };
  if (ts > opts.now + 5 * 60_000)
    return { ok: false, quality: 0, reason: "fecha en el futuro (reloj del equipo desfasado)" };
  if (ts < opts.now - 7 * 86_400_000)
    return { ok: false, quality: 0, reason: "lectura de hace más de 7 días" };
  const [lo, hi] = physicalRange(type, opts.site);
  if (value < lo || value > hi)
    return { ok: false, quality: 0, reason: `fuera del rango físico (${lo} a ${hi})` };
  const rate = MAX_RATE_PER_MIN[type];
  if (rate !== undefined && opts.last && ts > opts.last.ts) {
    const min = Math.max(1, (ts - opts.last.ts) / 60_000);
    if (Math.abs(value - opts.last.value) / min > rate)
      return { ok: true, quality: 1, reason: "salto brusco respecto de la lectura anterior" };
  }
  return { ok: true, quality: 0 };
}
