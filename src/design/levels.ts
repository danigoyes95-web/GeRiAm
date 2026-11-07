import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Siren,
  CircleDashed,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import type { StatusLevel } from "@/lib/domain/types";

export interface LevelMeta {
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
  /** clase de color de texto/borde */
  text: string;
  bg: string;
  border: string;
  dot: string;
  cssVar: string;
}

/** Semántica fija de niveles (alineada a Gestión de Riesgos Ecuador). Ícono + texto para accesibilidad daltónica. */
export const LEVELS: Record<StatusLevel, LevelMeta> = {
  normal: {
    label: "Normal",
    short: "NORMAL",
    description: "Condiciones dentro de parámetros. Monitoreo rutinario.",
    icon: CheckCircle2,
    text: "text-lvl-normal",
    bg: "bg-[var(--lvl-normal-bg)]",
    border: "border-lvl-normal/40",
    dot: "bg-lvl-normal",
    cssVar: "var(--lvl-normal)",
  },
  amarilla: {
    label: "Alerta amarilla",
    short: "AMARILLA",
    description: "Tendencia anómala. Vigilancia reforzada y verificación en campo.",
    icon: AlertTriangle,
    text: "text-lvl-amarilla",
    bg: "bg-[var(--lvl-amarilla-bg)]",
    border: "border-lvl-amarilla/40",
    dot: "bg-lvl-amarilla",
    cssVar: "var(--lvl-amarilla)",
  },
  naranja: {
    label: "Alerta naranja",
    short: "NARANJA",
    description: "Evento probable. Preparación: patrullaje, cierre de vías, aviso a juntas.",
    icon: AlertOctagon,
    text: "text-lvl-naranja",
    bg: "bg-[var(--lvl-naranja-bg)]",
    border: "border-lvl-naranja/40",
    dot: "bg-lvl-naranja",
    cssVar: "var(--lvl-naranja)",
  },
  roja: {
    label: "Alerta roja",
    short: "ROJA",
    description: "Evento en curso o inminente. Activar evacuación aguas abajo.",
    icon: Siren,
    text: "text-lvl-roja",
    bg: "bg-[var(--lvl-roja-bg)]",
    border: "border-lvl-roja/50",
    dot: "bg-lvl-roja",
    cssVar: "var(--lvl-roja)",
  },
  sin_datos: {
    label: "Sin datos",
    short: "SIN DATOS",
    description: "No se reciben lecturas recientes.",
    icon: CircleDashed,
    text: "text-lvl-sin-datos",
    bg: "bg-[var(--lvl-sin-datos-bg)]",
    border: "border-lvl-sin-datos/40",
    dot: "bg-lvl-sin-datos",
    cssVar: "var(--lvl-sin-datos)",
  },
  offline: {
    label: "Sensor offline",
    short: "OFFLINE",
    description: "El nodo no reporta en más de 3× su intervalo.",
    icon: WifiOff,
    text: "text-lvl-offline",
    bg: "bg-[var(--lvl-offline-bg)]",
    border: "border-lvl-offline/40",
    dot: "bg-lvl-offline",
    cssVar: "var(--lvl-offline)",
  },
};
