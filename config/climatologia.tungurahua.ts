/**
 * Climatología REAL de las estaciones meteorológicas de la red hidrometeorológica
 * del Gobierno Provincial de Tungurahua (HGPT), calculada con scripts/analyze-hgpt.py
 * a partir de los registros horarios (2013–2025) y de 1 minuto (dic 2025 – nov 2026).
 *
 * Fuente: https://rrnn.tungurahua.gob.ec — estaciones HGPT-MT-01 (Chiquiurco) y HGPT-MT-10 (Mulacorral).
 * Se usa para calibrar el generador de lluvia del simulador y para mostrar la climatología.
 */
export interface Climatologia {
  estacion: string;
  nombre: string;
  lat: number;
  lng: number;
  altitud_m: number;
  desde: string;
  periodo: string;
  anios: number;
  lluvia_anual_mm: number;
  lluvia_anual_min_mm: number;
  lluvia_anual_max_mm: number;
  lluvia_media_mm_dia: number;
  dias_lluvia_anio: number;
  lluvia_mensual_mm: number[];
  factor_mensual: number[];
  eventos_anio: number;
  evento_duracion_mediana_h: number;
  evento_duracion_p90_h: number;
  evento_pico_mediana_mmh: number;
  evento_pico_p90_mmh: number;
  evento_pico_p99_mmh: number;
  max_horario: { fecha: string; mm: number };
  max_diario: { fecha: string; mm: number };
  max_evento: { inicio: string; mm: number; horas: number; pico_mmh: number };
  max_24h_mm: number;
  max_72h_mm: number;
  max_10min_mmh: number;
  temp_media_c: number;
  temp_min_c: number;
  temp_max_c: number;
  dias_helada_anio: number;
  /** fracción de la lluvia que cae en cada hora local (0–23) */
  diurno: number[];
}

export const CLIMATOLOGIA: Record<"CHQ" | "MLC", Climatologia> = {
  CHQ: {
    estacion: "HGPT-MT-01",
    nombre: "Estación meteorológica Embalse Chiquiurco",
    lat: -1.2108677,
    lng: -78.809198,
    altitud_m: 3875,
    desde: "2013-02-16",
    periodo: "2013–2025",
    anios: 13,
    lluvia_anual_mm: 1016.8,
    lluvia_anual_min_mm: 293.2,
    lluvia_anual_max_mm: 1883.3,
    lluvia_media_mm_dia: 2.78,
    dias_lluvia_anio: 168.8,
    lluvia_mensual_mm: [91.0, 79.0, 95.0, 98.6, 119.3, 148.6, 145.1, 79.2, 64.2, 64.3, 76.7, 70.0],
    factor_mensual: [0.966, 0.838, 1.008, 1.046, 1.266, 1.577, 1.54, 0.84, 0.681, 0.682, 0.814, 0.743],
    eventos_anio: 122.6,
    evento_duracion_mediana_h: 6,
    evento_duracion_p90_h: 13,
    evento_pico_mediana_mmh: 1.8,
    evento_pico_p90_mmh: 4.4,
    evento_pico_p99_mmh: 10.2,
    max_horario: { fecha: "2020-10-13 10:00", mm: 36.2 },
    max_diario: { fecha: "2020-02-26", mm: 78.2 },
    max_evento: { inicio: "2020-06-19 01:00", mm: 113.6, horas: 59, pico_mmh: 8.4 },
    max_24h_mm: 79.2,
    max_72h_mm: 114.6,
    max_10min_mmh: 29.4,
    temp_media_c: 6.68,
    temp_min_c: -4.17,
    temp_max_c: 16.69,
    dias_helada_anio: 8.5,
    diurno: [0.048, 0.047, 0.053, 0.051, 0.048, 0.046, 0.044, 0.043, 0.037, 0.032, 0.033, 0.029, 0.034, 0.044, 0.05, 0.051, 0.047, 0.041, 0.031, 0.033, 0.033, 0.039, 0.041, 0.043],
  },
  MLC: {
    estacion: "HGPT-MT-10",
    nombre: "Estación meteorológica Embalse Mulacorral",
    lat: -1.1957494,
    lng: -78.828836,
    altitud_m: 3875,
    desde: "2013-02-16",
    periodo: "2013–2025",
    anios: 12,
    lluvia_anual_mm: 865.5,
    lluvia_anual_min_mm: 408.8,
    lluvia_anual_max_mm: 1198.7,
    lluvia_media_mm_dia: 2.37,
    dias_lluvia_anio: 163.2,
    lluvia_mensual_mm: [75.1, 60.4, 99.0, 89.6, 85.4, 112.4, 104.7, 62.0, 43.2, 52.9, 68.7, 67.4],
    factor_mensual: [0.979, 0.787, 1.29, 1.168, 1.113, 1.465, 1.364, 0.808, 0.563, 0.689, 0.895, 0.878],
    eventos_anio: 112.2,
    evento_duracion_mediana_h: 5,
    evento_duracion_p90_h: 12,
    evento_pico_mediana_mmh: 1.6,
    evento_pico_p90_mmh: 4.3,
    evento_pico_p99_mmh: 9.0,
    max_horario: { fecha: "2014-03-15 14:00", mm: 17.2 },
    max_diario: { fecha: "2024-02-05", mm: 34.2 },
    max_evento: { inicio: "2015-07-21 21:00", mm: 56.8, horas: 55, pico_mmh: 3.9 },
    max_24h_mm: 53.8,
    max_72h_mm: 71.6,
    max_10min_mmh: 25.8,
    temp_media_c: 6.34,
    temp_min_c: -1.93,
    temp_max_c: 18.14,
    dias_helada_anio: 6.8,
    diurno: [0.045, 0.044, 0.05, 0.047, 0.044, 0.038, 0.037, 0.036, 0.033, 0.03, 0.032, 0.031, 0.038, 0.05, 0.057, 0.067, 0.062, 0.046, 0.033, 0.032, 0.033, 0.037, 0.035, 0.042],
  },
};
