import type { AreaVolumePoint } from "../domain/types";
import { DEFAULT_CLIMATE, type RainClimate, type SiteParams } from "./physics";

/** Construye parámetros físicos desde una fila de geriam.sites (o equivalente). */
export function siteParamsFromRow(row: {
  code: string;
  cota_fondo: number | string;
  cota_namo: number | string;
  cota_name: number | string;
  cota_vertedero: number | string;
  cota_cresta: number | string;
  longitud_vertedero: number | string;
  coeficiente_descarga: number | string;
  caudal_entrada_base: number | string;
  caudal_salida_nominal: number | string;
  area_cuenca_km2: number | string;
  capacity_m3: number | string;
  curva_area_volumen: unknown;
  metadata?: unknown;
}): SiteParams {
  const n = (v: number | string) => Number(v);
  return {
    code: row.code,
    fondo: n(row.cota_fondo),
    namo: n(row.cota_namo),
    name: n(row.cota_name),
    vertedero: n(row.cota_vertedero),
    cresta: n(row.cota_cresta),
    longitudVertedero: n(row.longitud_vertedero),
    coefDescarga: n(row.coeficiente_descarga),
    qinBase: n(row.caudal_entrada_base),
    qoutNominal: n(row.caudal_salida_nominal),
    areaCuencaKm2: n(row.area_cuenca_km2),
    capacity: n(row.capacity_m3),
    curve: (row.curva_area_volumen as AreaVolumePoint[]) ?? [],
    valveMax: Math.max(1.5, 6 * n(row.caudal_salida_nominal)),
    climate: climateFromMetadata(row.metadata),
  };
}

interface ClimaMeta {
  lluvia_media_mm_dia?: number;
  factor_mensual?: number[];
  diurno?: number[];
  eventos_anio?: number;
  evento_duracion_mediana_h?: number;
  evento_duracion_p90_h?: number;
  evento_pico_mediana_mmh?: number;
  evento_pico_p90_mmh?: number;
  max_horario?: { mm: number };
}

/** Lee la climatología (sites.metadata.clima) cargada desde config/climatologia.*.ts */
export function climateFromMetadata(meta: unknown): RainClimate {
  const c = (meta as { clima?: ClimaMeta } | null | undefined)?.clima;
  if (!c?.lluvia_media_mm_dia) return DEFAULT_CLIMATE;
  return {
    meanMmDay: c.lluvia_media_mm_dia,
    monthlyFactor: c.factor_mensual?.length === 12 ? c.factor_mensual : DEFAULT_CLIMATE.monthlyFactor,
    diurnal: c.diurno?.length === 24 ? c.diurno : DEFAULT_CLIMATE.diurnal,
    eventsPerYear: c.eventos_anio ?? DEFAULT_CLIMATE.eventsPerYear,
    durMedianH: c.evento_duracion_mediana_h ?? DEFAULT_CLIMATE.durMedianH,
    durP90H: c.evento_duracion_p90_h ?? DEFAULT_CLIMATE.durP90H,
    peakMedianMmH: c.evento_pico_mediana_mmh ?? DEFAULT_CLIMATE.peakMedianMmH,
    peakP90MmH: c.evento_pico_p90_mmh ?? DEFAULT_CLIMATE.peakP90MmH,
    maxHourMmH: c.max_horario?.mm ?? DEFAULT_CLIMATE.maxHourMmH,
  };
}
