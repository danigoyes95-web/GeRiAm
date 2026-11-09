/**
 * Escenarios de SIMULACRO. Cada escenario es una función pura del tiempo simulado
 * (minutos desde el inicio) que devuelve el forzamiento y la fase narrativa.
 */
import type { Forcing } from "./physics";

export type ScenarioId = "tormenta" | "estructural" | "comunicacion";

export interface ScenarioPhase {
  forcing: Forcing;
  phase: string;
  /** texto corto para la línea de tiempo del simulacro */
  narrative: string;
  /** asentamiento acumulado impuesto por el escenario (mm); el runner aplica la diferencia */
  settleOffset?: number;
}

export interface ScenarioDef {
  id: ScenarioId;
  title: string;
  summary: string;
  durationMin: number;
  /** cota inicial relativa al NAMO (m) para que el escenario sea demostrable */
  startOffsetNamo: number | null;
  steps: { atMin: number; label: string }[];
  at(minute: number): ScenarioPhase;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  tormenta: {
    id: "tormenta",
    title: "Tormenta extrema en páramo",
    summary:
      "Escenario de diseño extremo: ~210 mm en 5,5 h, unas 2,7 veces la lluvia diaria máxima registrada en 13 años (78,2 mm el 26/02/2020, estación HGPT-MT-01). La entrada crece, se activa el vertedero y el nivel se acerca a la cresta.",
    durationMin: 330,
    startOffsetNamo: -0.35,
    steps: [
      { atMin: 0, label: "Inicio de lluvia" },
      { atMin: 30, label: "Lluvia intensa (> 40 mm/h; récord horario 36,2 mm)" },
      { atMin: 75, label: "Vertedero entra en funcionamiento" },
      { atMin: 150, label: "Nivel sobre NAME" },
      { atMin: 240, label: "Nivel cercano a cresta" },
    ],
    at(m) {
      const rain = m < 30 ? 12 + m * 1.1 : m < 210 ? 52 + 6 * Math.sin(m / 9) : m < 300 ? clamp(52 - (m - 210) * 0.55, 0, 52) : 2;
      const phase = m < 30 ? "lluvia" : m < 90 ? "crecida" : m < 210 ? "vertedero" : m < 300 ? "pico" : "recesion";
      const narrative =
        phase === "lluvia"
          ? "Lluvia en aumento sobre el páramo"
          : phase === "crecida"
            ? "Caudal de entrada en aumento sostenido"
            : phase === "vertedero"
              ? "Vertedero de excesos en funcionamiento"
              : phase === "pico"
                ? "Nivel máximo: cerca de la cresta"
                : "Recesión de la crecida";
      return { forcing: { rainMmH: rain, runoffCoef: 0.78 }, phase, narrative };
    },
  },
  estructural: {
    id: "estructural",
    title: "Anomalía estructural en la presa",
    summary:
      "Sin lluvia, la presión de poro sube de forma anómala y se registra un salto de asentamiento en la cresta. Alerta estructural roja con cuenta regresiva de llegada a Ambato.",
    durationMin: 180,
    startOffsetNamo: null,
    steps: [
      { atMin: 0, label: "Condiciones secas" },
      { atMin: 15, label: "Piezómetro en ascenso sin lluvia" },
      { atMin: 70, label: "Salto de asentamiento en cresta" },
      { atMin: 90, label: "Deformación en talud" },
    ],
    at(m) {
      const pz1 = m < 15 ? 0 : clamp((m - 15) * 0.55, 0, 42);
      const pz2 = m < 35 ? 0 : clamp((m - 35) * 0.4, 0, 30);
      const settleOffset = m >= 74 ? 2.5 : m >= 70 ? 1.4 : 0;
      const inclDelta = m >= 80 ? 2.4 : 0;
      const phase = m < 15 ? "normal" : m < 70 ? "piezometria" : m < 90 ? "asentamiento" : "deformacion";
      const narrative =
        phase === "normal"
          ? "Embalse estable, sin lluvia"
          : phase === "piezometria"
            ? "Presión de poro en ascenso sin explicación hidrológica"
            : phase === "asentamiento"
              ? "Salto de asentamiento detectado en la cresta"
              : "Deformación progresiva del talud aguas abajo";
      return { forcing: { rainMmH: 0, pz1Delta: pz1, pz2Delta: pz2, inclDelta }, phase, narrative, settleOffset };
    },
  },
  comunicacion: {
    id: "comunicacion",
    title: "Pérdida de comunicación (Starlink)",
    summary:
      "El enlace satelital de la presa se degrada y cae. La plataforma detecta la ausencia de datos, alerta por comunicación y muestra el último valor conocido con su antigüedad.",
    durationMin: 90,
    startOffsetNamo: null,
    steps: [
      { atMin: 0, label: "Enlace nominal" },
      { atMin: 6, label: "Degradación (latencia alta)" },
      { atMin: 12, label: "Enlace caído" },
      { atMin: 70, label: "Restablecimiento" },
    ],
    at(m) {
      const down = m >= 12 && m < 70;
      const boost = m >= 6 && m < 12 ? 180 + (m - 6) * 60 : 0;
      const phase = m < 6 ? "normal" : m < 12 ? "degradado" : m < 70 ? "caido" : "restablecido";
      const narrative =
        phase === "normal"
          ? "Enlace Starlink nominal"
          : phase === "degradado"
            ? "Latencia en aumento, pérdida de paquetes"
            : phase === "caido"
              ? "Sin enlace: la presa no reporta"
              : "Enlace restablecido, datos fluyendo";
      return { forcing: { starlinkDown: down, latencyBoost: boost }, phase, narrative };
    },
  },
};

export const SCENARIO_LIST = Object.values(SCENARIOS);
