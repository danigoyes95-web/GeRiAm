/**
 * Integración con INAMHI–GEOGLOWS (https://inamhi.geoglows.org): pronóstico de caudal por tramo de río
 * (GEOGLOWS / ECMWF, 15 días, 51 miembros + alta resolución), serie histórica simulada desde 1980 para
 * calcular caudales por periodo de retorno, y avisos meteorológicos del INAMHI con sus polígonos.
 * Solo servidor: las respuestas se cachean con la caché de fetch de Next.
 */
export const GEOGLOWS_API = "https://services.geoglows.org/api";

/** Tramos de la red de drenaje GEOGLOWS (capa geoglows_drainage_ecuador) sobre el cauce de cada presa. */
export const REACHES = {
  CHQ: { comid: 620633306, name: "Salida de Chiquiurco" },
  MLC: { comid: 620583771, name: "Salida de Mulacorral" },
  pasa: { comid: 620886494, name: "Río Ambato a la altura de Pasa" },
  quisapincha: { comid: 620915389, name: "Río Ambato a la altura de Quisapincha" },
  ambato: { comid: 620927772, name: "Río Ambato en Ambato" },
} as const;
export type ReachKey = keyof typeof REACHES;

/** Puntos que se comprueban contra los polígonos de los avisos meteorológicos. */
const WATCH_POINTS: { name: string; lng: number; lat: number }[] = [
  { name: "Chiquiurco", lng: -78.81032, lat: -1.20855 },
  { name: "Mulacorral", lng: -78.82772, lat: -1.19575 },
  { name: "Pasa", lng: -78.7262, lat: -1.2685 },
  { name: "Ambato", lng: -78.6168, lat: -1.2491 },
];

export interface ForecastPoint {
  t: number;
  min: number | null;
  p25: number | null;
  avg: number | null;
  p75: number | null;
  max: number | null;
  hr: number | null;
}

export interface ReturnPeriods {
  2: number;
  5: number;
  10: number;
  25: number;
  50: number;
  100: number;
}

export interface RiverForecast {
  reach: ReachKey;
  comid: number;
  name: string;
  issued: string;
  series: ForecastPoint[];
  returnPeriods: ReturnPeriods | null;
  /** años de registro usados para los periodos de retorno */
  years: number;
  peak: { t: number; avg: number; max: number } | null;
  /** escenario más extremo del ensamble (máximo de los 51 miembros) */
  extreme: { t: number; max: number } | null;
  /** mayor periodo de retorno superado por el promedio y por el máximo del ensamble */
  exceeds: { avg: number | null; max: number | null };
}

const num = (s: string | undefined) => {
  if (s === undefined || s.trim() === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

function parseForecast(csv: string): ForecastPoint[] {
  const [head, ...rows] = csv.trim().split(/\r?\n/);
  const cols = head.split(",");
  const ix = (n: string) => cols.indexOf(n);
  const [iT, iMin, i25, iAvg, i75, iMax, iHr] = [
    "datetime",
    "flow_min",
    "flow_25",
    "flow_avg",
    "flow_75",
    "flow_max",
    "high_res",
  ].map(ix);
  return rows
    .map((r) => r.split(","))
    .map((c) => ({
      t: Date.parse(c[iT].replace(" ", "T") + "Z"),
      min: num(c[iMin]),
      p25: num(c[i25]),
      avg: num(c[iAvg]),
      p75: num(c[i75]),
      max: num(c[iMax]),
      hr: num(c[iHr]),
    }))
    .filter((p) => Number.isFinite(p.t));
}

/**
 * Caudales por periodo de retorno con la distribución de Gumbel sobre los máximos anuales
 * (mismo enfoque que GEOGLOWS): x_T = μ + K_T·σ, K_T = −(√6/π)·(γ + ln(ln(T/(T−1)))).
 */
export function gumbelReturnPeriods(annualMax: number[]): ReturnPeriods {
  const n = annualMax.length;
  const mean = annualMax.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(annualMax.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const k = (T: number) => -(Math.sqrt(6) / Math.PI) * (0.5772 + Math.log(Math.log(T / (T - 1))));
  const at = (T: number) => Math.round((mean + k(T) * sd) * 10) / 10;
  return { 2: at(2), 5: at(5), 10: at(10), 25: at(25), 50: at(50), 100: at(100) };
}

function annualMaxima(csv: string): number[] {
  const byYear = new Map<number, number>();
  const thisYear = new Date().getUTCFullYear();
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    const [d, v] = line.split(",");
    const y = Number(d.slice(0, 4));
    const val = Number(v);
    if (!Number.isFinite(y) || !Number.isFinite(val) || y >= thisYear) continue;
    byYear.set(y, Math.max(byYear.get(y) ?? 0, val));
  }
  return [...byYear.values()];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function getText(url: string, revalidate: number) {
  const r = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(25_000) });
  const text = await r.text();
  if (!r.ok || text.trimStart().startsWith("<"))
    throw new Error(`GEOGLOWS ${r.status} en ${url.split("?")[0]}`);
  return text;
}

export async function riverForecast(reach: ReachKey): Promise<RiverForecast> {
  const { comid, name } = REACHES[reach];
  // el pronóstico del día puede no estar listo temprano: se prueba hoy y los dos días anteriores
  let series: ForecastPoint[] = [];
  let issued = "";
  for (let back = 0; back < 3 && !series.length; back++) {
    const d = new Date(Date.now() - back * 864e5);
    try {
      series = parseForecast(
        await getText(`${GEOGLOWS_API}/hydroviewer/get-forecast-csv?comid=${comid}&date=${ymd(d)}`, 3600),
      );
      issued = ymd(d);
    } catch {
      /* se intenta el día anterior */
    }
  }
  if (!series.length) throw new Error("Pronóstico GEOGLOWS no disponible");

  let returnPeriods: ReturnPeriods | null = null;
  let years = 0;
  try {
    const maxima = annualMaxima(
      await getText(`${GEOGLOWS_API}/hydroviewer/get-historical-csv?comid=${comid}`, 7 * 86400),
    );
    years = maxima.length;
    if (years >= 10) returnPeriods = gumbelReturnPeriods(maxima);
  } catch {
    /* sin periodos de retorno: el gráfico se muestra igual */
  }

  const ens = series.filter((p) => p.avg !== null && p.max !== null);
  const peakP = ens.reduce<ForecastPoint | null>((m, p) => (!m || (p.avg ?? 0) > (m.avg ?? 0) ? p : m), null);
  const extremeP = ens.reduce<ForecastPoint | null>(
    (m, p) => (!m || (p.max ?? 0) > (m.max ?? 0) ? p : m),
    null,
  );
  const maxOfMax = extremeP?.max ?? 0;
  const exceeded = (v: number) => {
    if (!returnPeriods) return null;
    const hit = ([100, 50, 25, 10, 5, 2] as const).find((T) => v >= returnPeriods![T]);
    return hit ?? null;
  };
  return {
    reach,
    comid,
    name,
    issued,
    series,
    returnPeriods,
    years,
    peak: peakP ? { t: peakP.t, avg: peakP.avg ?? 0, max: peakP.max ?? 0 } : null,
    extreme: extremeP ? { t: extremeP.t, max: maxOfMax } : null,
    exceeds: { avg: peakP ? exceeded(peakP.avg ?? 0) : null, max: exceeded(maxOfMax) },
  };
}

export interface MeteoWarning {
  no: string;
  type: string;
  start: string;
  end: string;
  level: string | null;
  affects: string[];
  active: boolean;
}

type Ring = [number, number][];
function inRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inMultiPolygon(x: number, y: number, mp: Ring[][]) {
  return mp.some((poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((h) => inRing(x, y, h)));
}

const LEVEL_RANK: Record<string, number> = { Bajo: 1, Medio: 2, Alto: 3, "Muy Alto": 4, Crecida: 5 };

/** Avisos meteorológicos del INAMHI vigentes o próximos (48 h) y si cubren la cuenca. */
export async function meteoWarnings(
  now = Date.now(),
): Promise<{ warnings: MeteoWarning[]; last: MeteoWarning | null }> {
  const list = JSON.parse(await getText(`${GEOGLOWS_API}/hydroviewer/get-meteo-warnings`, 1800)) as {
    result: { warning: string; type: string; start: string; end: string }[];
  };
  // las fechas del INAMHI están en hora de Ecuador (UTC−5)
  const t = (s: string) => Date.parse(s + "-05:00");
  const items = list.result.filter((w) => t(w.end) >= now - 864e5 && t(w.start) <= now + 2 * 864e5);
  const lastRaw = [...list.result].sort((a, b) => t(b.start) - t(a.start))[0];
  const warnings: MeteoWarning[] = [];
  for (const w of items) {
    let level: string | null = null;
    const affects = new Set<string>();
    try {
      const fc = JSON.parse(
        (
          await getText(
            `${GEOGLOWS_API}/met-data-explorer/get-meteo-warnings?no=${encodeURIComponent(w.warning)}`,
            1800,
          )
        ).replace(/NaN/g, "null"),
      ) as {
        features: {
          properties: { level?: string };
          geometry: { type: string; coordinates: Ring[][] | Ring[] };
        }[];
      };
      for (const f of fc.features) {
        const mp = (
          f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates
        ) as Ring[][];
        for (const p of WATCH_POINTS) {
          if (inMultiPolygon(p.lng, p.lat, mp)) {
            affects.add(p.name);
            const lv = f.properties.level ?? null;
            if (lv && (!level || (LEVEL_RANK[lv] ?? 0) > (LEVEL_RANK[level] ?? 0))) level = lv;
          }
        }
      }
    } catch {
      /* sin polígonos: se informa el aviso sin cobertura */
    }
    warnings.push({
      no: w.warning,
      type: w.type,
      start: w.start,
      end: w.end,
      level,
      affects: [...affects],
      active: t(w.start) <= now && t(w.end) >= now,
    });
  }
  const last = lastRaw
    ? {
        no: lastRaw.warning,
        type: lastRaw.type,
        start: lastRaw.start,
        end: lastRaw.end,
        level: null,
        affects: [],
        active: false,
      }
    : null;
  return { warnings, last };
}
