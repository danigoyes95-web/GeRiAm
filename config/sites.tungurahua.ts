/**
 * Configuración inicial de la organización "Gobierno Provincial de Tungurahua".
 * Fuente única para generar `supabase/seed.sql` (scripts/gen-seed.ts).
 *
 * ⚠ Todos los parámetros hidráulicos son REFERENCIALES y deben validarse con el
 * Gobierno Provincial. Las coordenadas del espejo de agua están VERIFICADAS por el
 * cliente (Google Maps); las de la cortina son una estimación inicial editable.
 */
import type { AreaVolumePoint, Role, SensorType, Thresholds } from "@/lib/domain/types";
import { CLIMATOLOGIA } from "./climatologia.tungurahua";

export interface SensorSeed {
  code: string;
  name: string;
  type: SensorType;
  unit: string;
  decimals: number;
  lat: number;
  lng: number;
  position: string;
  interval_s: number;
  thresholds?: Thresholds;
  /** índice del punto aguas abajo (para nivel_rio en puntos de control) */
  downstreamPoint?: string;
  gateway?: boolean;
  rssi: number;
  snr: number;
  battery: number;
}

export interface SiteSeed {
  slug: string;
  code: string;
  name: string;
  river: string;
  description: string;
  zone: string;
  lat: number;
  lng: number;
  coord_verificado: boolean;
  dam_lat: number;
  dam_lng: number;
  altitude_m: number;
  capacity_m3: number;
  cota_fondo: number;
  cota_cresta: number;
  cota_namo: number;
  cota_name: number;
  cota_vertedero: number;
  longitud_vertedero: number;
  coeficiente_descarga: number;
  caudal_entrada_base: number;
  caudal_salida_nominal: number;
  area_cuenca_km2: number;
  /** exponente de la curva V = k·h^m */
  curva_m: number;
  metadata: Record<string, unknown>;
  cauce: [number, number][];
  downstream: { point: string; distancia_km: number; llegada_min: number; transito_min: number; fuente: string }[];
  sensors: SensorSeed[];
  cameras: { code: string; name: string; kind: "PTZ" | "fija"; lat: number; lng: number; position: string; clip: string; bearing: number }[];
  gateway: { name: string; eui: string; lat: number; lng: number; radius_m: number };
}

/** Curva área–volumen sintética V = k·(cota−fondo)^m calibrada para V(NAMO)=capacidad. */
export function buildCurve(fondo: number, namo: number, cresta: number, capacidad: number, m: number): AreaVolumePoint[] {
  const H = namo - fondo;
  const k = capacidad / Math.pow(H, m);
  const pts: AreaVolumePoint[] = [];
  for (let c = fondo; c <= cresta + 0.001; c += 0.5) {
    const h = Math.max(0, c - fondo);
    const v = k * Math.pow(h, m);
    const a = h === 0 ? 0 : m * k * Math.pow(h, m - 1);
    pts.push({ cota: Math.round(c * 100) / 100, area: Math.round(a), volumen: Math.round(v) });
  }
  return pts;
}

export const ORGANIZATION = {
  slug: "tungurahua",
  name: "Gobierno Provincial de Tungurahua",
  short_name: "GPT",
  timezone: "America/Guayaquil",
  map_center: { lng: -78.8168, lat: -1.1985, zoom: 13.4, pitch: 62, bearing: -28 },
  branding: {
    product: "GeRiAm",
    tagline: "Gestión de Riesgos Ambato",
    entity: "Gobierno Provincial de Tungurahua",
    unit: "Dirección de Recursos Hídricos y Gestión de Riesgos",
    primary: "#22d3ee",
    contacts: [
      { name: "ECU 911 — Emergencias", phone: "911", kind: "emergencia" },
      { name: "Sala de operaciones GeRiAm", phone: "Por configurar", kind: "sala" },
      { name: "Unidad de Gestión de Riesgos — GPT", phone: "Por configurar", kind: "institucional" },
    ],
  },
  settings: {
    demo_mode: true,
    demo_email_domain: "geriam.demo",
    ciudad_referencia: { name: "Ambato", lat: -1.2491, lng: -78.6168 },
  },
};

export const ZONES = [
  { code: "Z1", name: "Cuenca alta — Embalses", description: "Páramo de Chiquiurco y Mulacorral (presas, cortinas y accesos)" },
  { code: "Z2", name: "Pasa", description: "Parroquia Pasa y riberas del río Ambato" },
  { code: "Z3", name: "Quisapincha", description: "Parroquia Quisapincha y riberas" },
  { code: "Z4", name: "Ambato urbano", description: "Ribera del río Ambato en la ciudad" },
];

export const DOWNSTREAM_POINTS = [
  { key: "pasa", name: "Pasa", kind: "poblado", lat: -1.2685, lng: -78.7262, zone: "Z2", poblacion: 850, verificado: false },
  { key: "quisapincha", name: "Quisapincha", kind: "poblado", lat: -1.2412, lng: -78.6794, zone: "Z3", poblacion: 1200, verificado: false },
  { key: "ambato", name: "Ambato (ciudad)", kind: "ciudad", lat: -1.2491, lng: -78.6168, zone: "Z4", poblacion: 14500, verificado: false },
];

const sharedCauceTail: [number, number][] = [
  [-78.7905, -1.2215],
  [-78.7735, -1.2372],
  [-78.7552, -1.2508],
  [-78.7398, -1.2622],
  [-78.7262, -1.2685],
  [-78.7105, -1.2641],
  [-78.6952, -1.2553],
  [-78.6794, -1.2468],
  [-78.6623, -1.2471],
  [-78.6441, -1.2502],
  [-78.6301, -1.2497],
  [-78.6168, -1.2491],
];

function lvl(namo: number, cresta: number): Thresholds {
  return {
    direction: "asc",
    amarilla: Math.round((namo - 0.2) * 100) / 100,
    naranja: Math.round((namo + 0.4) * 100) / 100,
    roja: Math.round((cresta - 0.6) * 100) / 100,
    hysteresis: 0.05,
  };
}

function off(lat: number, lng: number, dLatM: number, dLngM: number): [number, number] {
  const mLat = 1 / 110574;
  const mLng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLatM * mLat, lng + dLngM * mLng];
}

function siteSensors(code: string, lake: [number, number], dam: [number, number], inflow: [number, number], namo: number, cresta: number, qinBase: number): SensorSeed[] {
  const [dl, dg] = dam;
  const p = (dLat: number, dLng: number) => off(dl, dg, dLat, dLng);
  const s: SensorSeed[] = [
    { code: `${code}-NIV-01`, name: "Radar de nivel — torre de toma", type: "nivel_radar", unit: "m s. n. m.", decimals: 2, lat: p(60, 70)[0], lng: p(60, 70)[1], position: "Torre de toma, sobre el espejo", interval_s: 60, thresholds: lvl(namo, cresta), rssi: -96, snr: 6.5, battery: 88 },
    { code: `${code}-PLU-01`, name: "Pluviómetro de balancín", type: "pluviometro", unit: "mm", decimals: 1, lat: lake[0] + 0.0012, lng: lake[1] - 0.0016, position: "Orilla, caseta meteorológica", interval_s: 60, thresholds: { direction: "asc", amarilla: 10, naranja: 20, roja: 35, hysteresis: 2 }, rssi: -104, snr: 3.2, battery: 76 },
    { code: `${code}-QIN-01`, name: "Caudal de entrada — quebrada principal", type: "caudal_entrada", unit: "L/s", decimals: 0, lat: inflow[0], lng: inflow[1], position: "Estación de aforo, cola del embalse", interval_s: 60, thresholds: { direction: "asc", amarilla: qinBase * 1000 * 5, naranja: qinBase * 1000 * 10, roja: qinBase * 1000 * 20, hysteresis: qinBase * 100 }, rssi: -112, snr: -1.5, battery: 64 },
    { code: `${code}-QOUT-01`, name: "Caudal de salida — descarga de fondo + vertedero", type: "caudal_salida", unit: "L/s", decimals: 0, lat: p(-90, -40)[0], lng: p(-90, -40)[1], position: "Canal de descarga al pie de presa", interval_s: 60, rssi: -92, snr: 7.8, battery: 91 },
    { code: `${code}-PZ-01`, name: "Piezómetro cuerpo de presa", type: "piezometro", unit: "kPa", decimals: 1, lat: p(5, 15)[0], lng: p(5, 15)[1], position: "Cuerpo de presa, eje central", interval_s: 300, thresholds: { direction: "asc", amarilla: 150, naranja: 162, roja: 175, hysteresis: 2 }, rssi: -88, snr: 9.1, battery: 82 },
    { code: `${code}-PZ-02`, name: "Piezómetro cimentación", type: "piezometro", unit: "kPa", decimals: 1, lat: p(-8, -25)[0], lng: p(-8, -25)[1], position: "Cimentación, estribo izquierdo", interval_s: 300, thresholds: { direction: "asc", amarilla: 215, naranja: 228, roja: 242, hysteresis: 2 }, rssi: -90, snr: 8.4, battery: 79 },
    { code: `${code}-AS-01`, name: "Placa de asentamiento — cresta", type: "asentamiento", unit: "mm", decimals: 2, lat: p(0, 40)[0], lng: p(0, 40)[1], position: "Cresta, progresiva 0+080", interval_s: 600, thresholds: { direction: "asc", amarilla: 15, naranja: 18, roja: 22, hysteresis: 0.3 }, rssi: -86, snr: 9.6, battery: 93 },
    { code: `${code}-IN-01`, name: "Inclinómetro talud aguas abajo", type: "inclinometro", unit: "mm", decimals: 2, lat: p(-30, 10)[0], lng: p(-30, 10)[1], position: "Talud aguas abajo, berma 1", interval_s: 600, thresholds: { direction: "asc", amarilla: 5, naranja: 7, roja: 10, hysteresis: 0.2 }, rssi: -91, snr: 7.2, battery: 87 },
    { code: `${code}-RIO-01`, name: "Nivel de río al pie de presa", type: "nivel_rio", unit: "m", decimals: 2, lat: p(-260, -120)[0], lng: p(-260, -120)[1], position: "Cauce, 300 m aguas abajo", interval_s: 60, thresholds: { direction: "asc", amarilla: 1.2, naranja: 1.8, roja: 2.6, hysteresis: 0.05 }, rssi: -108, snr: 0.8, battery: 71 },
    { code: `${code}-UPS-01`, name: "Energía — UPS y banco solar", type: "energia_ups", unit: "%", decimals: 0, lat: p(-40, -70)[0], lng: p(-40, -70)[1], position: "Caseta de control", interval_s: 300, thresholds: { direction: "desc", amarilla: 40, naranja: 25, roja: 10, hysteresis: 3 }, rssi: -78, snr: 11.2, battery: 100, gateway: true },
    { code: `${code}-STL-01`, name: "Enlace Starlink — latencia", type: "starlink", unit: "ms", decimals: 0, lat: p(-42, -74)[0], lng: p(-42, -74)[1], position: "Mástil de la caseta de control", interval_s: 60, thresholds: { direction: "asc", amarilla: 150, naranja: 400, hysteresis: 20 }, rssi: -70, snr: 12, battery: 100, gateway: true },
  ];
  return s;
}

const CHQ_LAKE: [number, number] = [-1.205154, -78.806672];
const CHQ_DAM: [number, number] = [-1.20855, -78.81032];
const MLC_LAKE: [number, number] = [-1.190775, -78.826447];
const MLC_DAM: [number, number] = [-1.19575, -78.82772];

export const SITES: SiteSeed[] = [
  {
    slug: "chiquiurco",
    code: "CHQ",
    name: "Embalse Chiquiurco",
    river: "Río Ambato (cuenca alta)",
    description:
      "Embalse de regulación del río Ambato. Abastece agua potable a Ambato y Pelileo y riego en la cuenca media.",
    zone: "Z1",
    lat: CHQ_LAKE[0],
    lng: CHQ_LAKE[1],
    coord_verificado: true,
    dam_lat: CHQ_DAM[0],
    dam_lng: CHQ_DAM[1],
    altitude_m: 3744,
    capacity_m3: 3_500_000,
    cota_fondo: 3721,
    cota_namo: 3743,
    cota_vertedero: 3743,
    cota_name: 3744.4,
    cota_cresta: 3745.5,
    longitud_vertedero: 22,
    coeficiente_descarga: 1.75,
    caudal_entrada_base: 0.3,
    caudal_salida_nominal: 0.365,
    area_cuenca_km2: 21.5,
    curva_m: 2.2,
    metadata: {
      referencial: true,
      usos: ["Agua potable Ambato", "Agua potable Pelileo", "Riego"],
      fuentes: [
        "Estudio HEC-RAS: ~27 km de cauce hasta la parroquia Pasa (referencial)",
        "Parámetros a validar con el Gobierno Provincial",
      ],
      altura_presa_m: 24.5,
      tipo_presa: "Materiales sueltos con núcleo impermeable (referencial)",
      clima: CLIMATOLOGIA.CHQ,
    },
    cauce: [
      [CHQ_DAM[1], CHQ_DAM[0]],
      [-78.8061, -1.2121],
      [-78.7988, -1.2168],
      ...sharedCauceTail,
    ],
    downstream: [
      { point: "pasa", distancia_km: 27, llegada_min: 50, transito_min: 125, fuente: "Estimación referencial (HEC-RAS 2D Chiquiurco–Pasa)" },
      { point: "quisapincha", distancia_km: 34, llegada_min: 92, transito_min: 210, fuente: "Estimación referencial" },
      { point: "ambato", distancia_km: 41, llegada_min: 130, transito_min: 290, fuente: "Estimación referencial" },
    ],
    sensors: [],
    cameras: [
      { code: "CHQ-CAM-01", name: "Cortina — vista general", kind: "PTZ", lat: off(CHQ_DAM[0], CHQ_DAM[1], -120, -90)[0], lng: off(CHQ_DAM[0], CHQ_DAM[1], -120, -90)[1], position: "Ladera derecha, frente a la cortina", clip: "/demo/cams/cam1.mp4", bearing: 40 },
      { code: "CHQ-CAM-02", name: "Vertedero de excesos", kind: "fija", lat: off(CHQ_DAM[0], CHQ_DAM[1], 30, 110)[0], lng: off(CHQ_DAM[0], CHQ_DAM[1], 30, 110)[1], position: "Estribo izquierdo", clip: "/demo/cams/cam2.mp4", bearing: 300 },
      { code: "CHQ-CAM-03", name: "Espejo de agua", kind: "PTZ", lat: off(CHQ_DAM[0], CHQ_DAM[1], 40, -20)[0], lng: off(CHQ_DAM[0], CHQ_DAM[1], 40, -20)[1], position: "Torre de toma", clip: "/demo/cams/cam3.mp4", bearing: 35 },
    ],
    gateway: { name: "Gateway LoRaWAN Chiquiurco", eui: "A84041FFFF1A2B01", lat: off(CHQ_DAM[0], CHQ_DAM[1], -42, -76)[0], lng: off(CHQ_DAM[0], CHQ_DAM[1], -42, -76)[1], radius_m: 3000 },
  },
  {
    slug: "mulacorral",
    code: "MLC",
    name: "Embalse Mulacorral",
    river: "Río Ambato (cuenca alta)",
    description:
      "Embalse en la cuenca alta del río Ambato, ~42 km al NO de Ambato. Almacenamiento estacional y regulación.",
    zone: "Z1",
    lat: MLC_LAKE[0],
    lng: MLC_LAKE[1],
    coord_verificado: true,
    dam_lat: MLC_DAM[0],
    dam_lng: MLC_DAM[1],
    altitude_m: 3831,
    capacity_m3: 2_750_000,
    cota_fondo: 3806,
    cota_namo: 3829,
    cota_vertedero: 3829,
    cota_name: 3830.2,
    cota_cresta: 3831,
    longitud_vertedero: 18,
    coeficiente_descarga: 1.7,
    caudal_entrada_base: 0.25,
    caudal_salida_nominal: 0.08,
    area_cuenca_km2: 17.8,
    curva_m: 2.1,
    metadata: {
      referencial: true,
      usos: ["Regulación", "Agua potable Ambato"],
      fuentes: ["Estudio HEC-RAS 2D: onda por rotura llega a Ambato en ~2 h 20 min (140 min)"],
      altura_presa_m: 26,
      tipo_presa: "Materiales sueltos (referencial)",
      clima: CLIMATOLOGIA.MLC,
    },
    cauce: [
      [MLC_DAM[1], MLC_DAM[0]],
      [-78.8231, -1.2016],
      [-78.8146, -1.2094],
      [-78.8061, -1.2121],
      [-78.7988, -1.2168],
      ...sharedCauceTail,
    ],
    downstream: [
      { point: "pasa", distancia_km: 29, llegada_min: 55, transito_min: 135, fuente: "Estimación referencial" },
      { point: "quisapincha", distancia_km: 36, llegada_min: 98, transito_min: 225, fuente: "Estimación referencial" },
      { point: "ambato", distancia_km: 42, llegada_min: 140, transito_min: 310, fuente: "Estudio HEC-RAS 2D rotura Mulacorral (140 min)" },
    ],
    sensors: [],
    cameras: [
      { code: "MLC-CAM-01", name: "Cortina — vista general", kind: "PTZ", lat: off(MLC_DAM[0], MLC_DAM[1], -110, 80)[0], lng: off(MLC_DAM[0], MLC_DAM[1], -110, 80)[1], position: "Ladera izquierda", clip: "/demo/cams/cam4.mp4", bearing: 330 },
      { code: "MLC-CAM-02", name: "Vertedero de excesos", kind: "fija", lat: off(MLC_DAM[0], MLC_DAM[1], 20, -120)[0], lng: off(MLC_DAM[0], MLC_DAM[1], 20, -120)[1], position: "Estribo derecho", clip: "/demo/cams/cam5.mp4", bearing: 60 },
      { code: "MLC-CAM-03", name: "Espejo de agua", kind: "PTZ", lat: off(MLC_DAM[0], MLC_DAM[1], 60, 10)[0], lng: off(MLC_DAM[0], MLC_DAM[1], 60, 10)[1], position: "Torre de toma", clip: "/demo/cams/cam6.mp4", bearing: 15 },
    ],
    gateway: { name: "Gateway LoRaWAN Mulacorral", eui: "A84041FFFF1A2B02", lat: off(MLC_DAM[0], MLC_DAM[1], -40, 70)[0], lng: off(MLC_DAM[0], MLC_DAM[1], -40, 70)[1], radius_m: 3000 },
  },
];

SITES[0].sensors = siteSensors("CHQ", CHQ_LAKE, CHQ_DAM, [-1.2001, -78.8001], SITES[0].cota_namo, SITES[0].cota_cresta, SITES[0].caudal_entrada_base);
SITES[1].sensors = siteSensors("MLC", MLC_LAKE, MLC_DAM, [-1.1846, -78.8228], SITES[1].cota_namo, SITES[1].cota_cresta, SITES[1].caudal_entrada_base);
// Estaciones hidrométricas en puntos de control (vinculadas a Chiquiurco, enlace celular/API)
for (const dp of DOWNSTREAM_POINTS) {
  SITES[0].sensors.push({
    code: `RIO-${dp.key.toUpperCase().slice(0, 3)}-01`,
    name: `Estación hidrométrica ${dp.name}`,
    type: "nivel_rio",
    unit: "m",
    decimals: 2,
    lat: dp.lat,
    lng: dp.lng,
    position: `Puente / ribera — ${dp.name}`,
    interval_s: 60,
    thresholds: { direction: "asc", amarilla: 1.8, naranja: 2.5, roja: 3.3, hysteresis: 0.05 },
    downstreamPoint: dp.key,
    rssi: -99,
    snr: 4,
    battery: 84,
  });
}

/** Reglas de alerta por embalse. `{SITE}` se reemplaza por el código. */
export function siteRules(site: SiteSeed) {
  const c = site.code;
  return [
    { code: `${c}-UMB`, name: "Umbrales por sensor (multinivel)", kind: "umbral", level: "amarilla", params: { multilevel: true }, cooldown_min: 20 },
    { code: `${c}-TASA-A`, name: "Subida rápida de nivel (> 8 cm/h)", kind: "tasa", level: "amarilla", params: { sensor_type: "nivel_radar", delta: 0.08, window_min: 60 }, cooldown_min: 30 },
    { code: `${c}-TASA-N`, name: "Subida muy rápida de nivel (> 20 cm/h)", kind: "tasa", level: "naranja", params: { sensor_type: "nivel_radar", delta: 0.2, window_min: 60 }, cooldown_min: 30 },
    { code: `${c}-COMB`, name: "Lluvia 24 h > 35 mm con embalse sobre NAMO−0,3 m", kind: "combinada", level: "naranja", params: { rain_24h_mm: 35, level_above: site.cota_namo - 0.3 }, cooldown_min: 60 },
    { code: `${c}-PZ`, name: "Presión de poro anómala sin lluvia (+10 kPa / 6 h)", kind: "estructural", level: "naranja", params: { sensor_type: "piezometro", delta: 10, window_min: 360, max_rain_24h_mm: 8 }, cooldown_min: 60 },
    { code: `${c}-AS`, name: "Salto de asentamiento en cresta (> 1,5 mm / 1 h)", kind: "estructural", level: "roja", params: { sensor_type: "asentamiento", delta: 1.5, window_min: 60 }, cooldown_min: 60 },
    { code: `${c}-COM`, name: "Sensor sin reportar (> 3× intervalo)", kind: "comunicacion", level: "amarilla", params: { silence_factor: 3 }, cooldown_min: 10 },
    { code: `${c}-STL`, name: "Enlace Starlink caído (> 5 min)", kind: "comunicacion", level: "naranja", params: { sensor_type: "starlink", silence_min: 5 }, cooldown_min: 10 },
  ] as const;
}

export const PROTOCOLS: { level: "normal" | "amarilla" | "naranja" | "roja"; role: Role | "todos"; phase: string; title: string; actions: string[] }[] = [
  { level: "normal", role: "operador", phase: "preparacion", title: "Monitoreo rutinario", actions: ["Revisar el panel cada turno", "Verificar salud de sensores y enlaces Starlink", "Registrar novedades en bitácora"] },
  { level: "normal", role: "tecnico", phase: "preparacion", title: "Mantenimiento preventivo", actions: ["Inspección visual semanal de cortina y vertedero", "Revisar baterías < 30 %", "Limpieza de pluviómetros"] },
  { level: "amarilla", role: "operador", phase: "respuesta", title: "Vigilancia reforzada", actions: ["Confirmar la alerta en ≤ 10 min", "Verificar cámaras del sitio", "Contrastar con pronóstico INAMHI", "Notificar al técnico de zona"] },
  { level: "amarilla", role: "tecnico", phase: "respuesta", title: "Verificación en campo", actions: ["Marcar 'Recibido' en la app", "Dirigirse al sitio si la tendencia persiste > 1 h", "Reportar con foto y GPS"] },
  { level: "amarilla", role: "director_junta", phase: "preparacion", title: "Atención", actions: ["Mantenerse atento a nuevas notificaciones", "Verificar lista de contactos de la junta"] },
  { level: "naranja", role: "operador", phase: "respuesta", title: "Preparación de respuesta", actions: ["Activar sala de crisis", "Coordinar con ECU 911 y COE cantonal", "Evaluar apertura de descarga de fondo", "Emitir notificación manual a juntas aguas abajo"] },
  { level: "naranja", role: "tecnico", phase: "respuesta", title: "Patrullaje y control", actions: ["Desplazarse al sitio ('En camino' → 'En sitio')", "Inspeccionar cortina, vertedero y filtraciones", "Coordinar cierre preventivo de vías ribereñas"] },
  { level: "naranja", role: "director_junta", phase: "respuesta", title: "Alistamiento comunitario", actions: ["Avisar a la comunidad por los canales acordados", "Revisar rutas de evacuación y puntos de encuentro", "Identificar personas con movilidad reducida"] },
  { level: "roja", role: "operador", phase: "respuesta", title: "Activación de evacuación", actions: ["Solicitar activación de sirenas / alerta pública vía ECU 911", "Comunicar tiempo de llegada estimado a cada punto de control", "Mantener enlace permanente con COE provincial"] },
  { level: "roja", role: "tecnico", phase: "respuesta", title: "Seguridad del personal", actions: ["No acercarse a la cortina ni al cauce", "Reportar posición y estado", "Apoyar el cierre de vías y puentes"] },
  { level: "roja", role: "director_junta", phase: "respuesta", title: "Evacuación", actions: ["Iniciar evacuación hacia zonas altas", "Confirmar en la app el inicio de la evacuación", "Reportar personas pendientes de evacuar"] },
  { level: "roja", role: "admin", phase: "respuesta", title: "Conducción de la emergencia", actions: ["Convocar COE provincial", "Autorizar comunicación oficial", "Asegurar registro completo en bitácora"] },
];

export const ESCALATION = [
  { level: "amarilla", step: 0, after_min: 0, roles: ["operador", "tecnico"], channels: ["push"], description: "Aviso inicial a sala y técnico de zona" },
  { level: "amarilla", step: 1, after_min: 15, roles: ["admin"], channels: ["push", "sms"], description: "Sin confirmación en 15 min → jefatura" },
  { level: "naranja", step: 0, after_min: 0, roles: ["operador", "tecnico", "director_junta"], channels: ["push", "whatsapp"], description: "Aviso a sala, técnicos y juntas de la zona" },
  { level: "naranja", step: 1, after_min: 10, roles: ["admin"], channels: ["push", "sms", "whatsapp"], description: "Sin confirmación en 10 min → jefatura" },
  { level: "roja", step: 0, after_min: 0, roles: ["admin", "operador", "tecnico", "director_junta", "observador"], channels: ["push", "sms", "whatsapp"], description: "Difusión inmediata a todos los roles" },
  { level: "roja", step: 1, after_min: 5, roles: ["admin", "operador"], channels: ["sms", "whatsapp"], description: "Sin confirmación en 5 min → reiterar a mando" },
] as const;

export const DEMO_USERS: { email: string; full_name: string; role: Role; zones: string[]; phone: string | null; channels: string[] }[] = [
  { email: "admin@geriam.demo", full_name: "Administración GeRiAm", role: "admin", zones: ["Z1", "Z2", "Z3", "Z4"], phone: null, channels: ["push", "sms"] },
  { email: "operador@geriam.demo", full_name: "Operador de sala", role: "operador", zones: ["Z1", "Z2", "Z3", "Z4"], phone: null, channels: ["push", "whatsapp"] },
  { email: "tecnico@geriam.demo", full_name: "Técnico de campo — Cuenca alta", role: "tecnico", zones: ["Z1"], phone: null, channels: ["push", "whatsapp"] },
  { email: "director.pasa@geriam.demo", full_name: "Director de junta — Pasa", role: "director_junta", zones: ["Z2"], phone: null, channels: ["push", "sms"] },
  { email: "observador@geriam.demo", full_name: "Observador institucional", role: "observador", zones: [], phone: null, channels: ["push"] },
];
export const DEMO_PASSWORD = "GeRiAm-Demo-2026";
