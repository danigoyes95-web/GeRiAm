/**
 * Formato es-EC: números `1.234,56`, fechas `dd/mm/aaaa HH:mm`, zona America/Guayaquil.
 * Se implementa a mano (sin depender de los datos ICU del runtime) para que sea idéntico
 * en navegador, Node y Deno.
 */
export const DEFAULT_TZ = "America/Guayaquil";
/** Ecuador continental no tiene horario de verano: UTC−5 fijo. */
const TZ_OFFSET_MIN: Record<string, number> = { "America/Guayaquil": -300, "Pacific/Galapagos": -360 };

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const neg = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const intWithSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const out = frac ? `${intWithSep},${frac}` : intWithSep;
  return neg && Number(fixed) !== 0 ? `−${out}` : out;
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${formatNumber(value, decimals)} %`;
}

/** m³ → hm³ con 3 decimales */
export function formatHm3(m3: number | null | undefined): string {
  if (m3 === null || m3 === undefined) return "—";
  return `${formatNumber(m3 / 1_000_000, 3)} hm³`;
}

/** m³/s → L/s */
export function toLps(m3s: number): number {
  return m3s * 1000;
}

function shift(date: Date, tz: string) {
  const off = TZ_OFFSET_MIN[tz] ?? -300;
  return new Date(date.getTime() + off * 60_000);
}
const p2 = (n: number) => String(n).padStart(2, "0");

export function formatDateTime(input: string | number | Date | null | undefined, tz = DEFAULT_TZ, seconds = false) {
  if (input === null || input === undefined) return "—";
  const d = shift(new Date(input), tz);
  if (Number.isNaN(d.getTime())) return "—";
  const base = `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  return seconds ? `${base}:${p2(d.getUTCSeconds())}` : base;
}

export function formatDate(input: string | number | Date, tz = DEFAULT_TZ) {
  const d = shift(new Date(input), tz);
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function formatTime(input: string | number | Date, tz = DEFAULT_TZ, seconds = true) {
  const d = shift(new Date(input), tz);
  return seconds
    ? `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`
    : `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** "hace 3 min", "hace 2 h", "hace 4 d" */
export function formatAgo(input: string | number | Date | null | undefined, now: number = Date.now()): string {
  if (!input) return "sin datos";
  const diff = Math.max(0, now - new Date(input).getTime());
  const s = Math.round(diff / 1000);
  if (s < 45) return "hace instantes";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** 140 → "2 h 20 min" */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** 8400 s → "02:20:00" */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
}

/** Fecha local (zona) → Date en UTC para inputs de rango. "2026-11-07" → inicio del día local. */
export function localDayStartUtc(isoDate: string, tz = DEFAULT_TZ): Date {
  const off = TZ_OFFSET_MIN[tz] ?? -300;
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() - off * 60_000);
}
