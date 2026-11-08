/** Tipos de dominio compartidos (UI, API, simulador, motor de alertas, Edge Functions). */

export const ALERT_LEVELS = ["normal", "amarilla", "naranja", "roja"] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

/** Estado visual: nivel de alerta + estados de comunicación. */
export type StatusLevel = AlertLevel | "sin_datos" | "offline";

export const ROLES = ["admin", "operador", "tecnico", "director_junta", "observador"] as const;
export type Role = (typeof ROLES)[number];

export const SENSOR_TYPES = [
  "nivel_radar",
  "pluviometro",
  "caudal_entrada",
  "caudal_salida",
  "piezometro",
  "asentamiento",
  "inclinometro",
  "nivel_rio",
  "energia_ups",
  "starlink",
] as const;
export type SensorType = (typeof SENSOR_TYPES)[number];

export type DataSource = "simulado" | "lorawan" | "scada" | "api";

export type AlertStatus = "activa" | "confirmada" | "escalada" | "resuelta";

export type AlertType = "umbral" | "tasa" | "combinada" | "estructural" | "comunicacion" | "manual";

export type Channel = "push" | "sms" | "whatsapp" | "email" | "demo";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Umbrales por nivel: valor a partir del cual se entra en el nivel (dirección "asc" = sube es peor). */
export interface Thresholds {
  direction: "asc" | "desc";
  amarilla?: number;
  naranja?: number;
  roja?: number;
  /** Banda de histéresis (misma unidad) para salir del nivel. */
  hysteresis?: number;
}

export interface AreaVolumePoint {
  /** Cota (m s. n. m.) */
  cota: number;
  /** Área del espejo (m²) */
  area: number;
  /** Volumen almacenado (m³) */
  volumen: number;
}

export interface SiteHydraulics {
  capacidad_m3: number;
  cota_fondo: number;
  cota_cresta: number;
  cota_namo: number;
  cota_name: number;
  cota_vertedero: number;
  longitud_vertedero: number;
  coeficiente_descarga: number;
  caudal_entrada_base: number; // m³/s
  caudal_salida_nominal: number; // m³/s
  area_cuenca_km2: number;
  curva_area_volumen: AreaVolumePoint[];
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  operador: "Operador de sala",
  tecnico: "Técnico de campo",
  director_junta: "Director de junta",
  observador: "Observador",
};

export const SENSOR_LABEL: Record<SensorType, string> = {
  nivel_radar: "Nivel (radar)",
  pluviometro: "Pluviómetro",
  caudal_entrada: "Caudal de entrada",
  caudal_salida: "Caudal de salida",
  piezometro: "Piezómetro",
  asentamiento: "Asentamiento",
  inclinometro: "Inclinómetro",
  nivel_rio: "Nivel de río",
  energia_ups: "Energía / UPS",
  starlink: "Enlace Starlink",
};

export const LEVEL_RANK: Record<StatusLevel, number> = {
  normal: 0,
  sin_datos: 1,
  offline: 1,
  amarilla: 2,
  naranja: 3,
  roja: 4,
};

export function worstLevel(levels: StatusLevel[]): StatusLevel {
  return levels.reduce<StatusLevel>((w, l) => (LEVEL_RANK[l] > LEVEL_RANK[w] ? l : w), "normal");
}
