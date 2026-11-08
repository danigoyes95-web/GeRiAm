"use client";
import { motion, useReducedMotion } from "motion/react";
import { cn, clamp } from "@/lib/utils";
import { formatNumber, formatPercent } from "@/lib/format";
import { LEVELS } from "@/design/levels";
import type { StatusLevel } from "@/lib/domain/types";

export interface GaugeNivelProps {
  cota: number | null;
  fondo: number;
  namo: number;
  name: number;
  vertedero: number;
  cresta: number;
  fillPct?: number | null;
  level?: StatusLevel;
  className?: string;
  compact?: boolean;
}

/**
 * Corte esquemático del vaso: valle trapezoidal, cortina a la derecha, agua animada
 * y marcas de NAMO / NAME / vertedero / cresta.
 */
export function GaugeNivel({ cota, fondo, namo, name, vertedero, cresta, fillPct, level = "normal", className, compact }: GaugeNivelProps) {
  const reduce = useReducedMotion();
  const W = 320;
  const H = compact ? 150 : 210;
  const top = 18;
  const bottom = H - 16;
  // Escala por tramos: el fondo del vaso se comprime (30 % del alto) para dar espacio
  // a la franja de operación (NAMO − 4 m … cresta + 0,6 m), donde están todas las cotas.
  const top_c = cresta + 0.6;
  const split = Math.max(fondo + 1, Math.min(namo - 4, top_c - 2));
  const ySplit = bottom - 0.3 * (bottom - top);
  const y = (c: number) =>
    c <= split
      ? bottom - ((Math.max(c, fondo) - fondo) / (split - fondo)) * (bottom - ySplit)
      : ySplit - ((Math.min(c, top_c + 0.5) - split) / (top_c - split)) * (ySplit - top);
  const yw = cota === null ? bottom : clamp(y(cota), top - 4, bottom);
  const water = level === "normal" ? "var(--accent)" : LEVELS[level].cssVar;
  // valle: paredes inclinadas
  const valley = `M14,${top} L84,${bottom} L236,${bottom} L262,${top}`;
  const leftX = (yy: number) => 14 + ((yy - top) / (bottom - top)) * 70;
  const rightX = (yy: number) => 262 - ((yy - top) / (bottom - top)) * 26;
  const waterPath = `M${leftX(yw)},${yw} L${rightX(yw)},${yw} L236,${bottom} L84,${bottom} Z`;
  const marks: { c: number; label: string; color: string; dash?: string }[] = [
    { c: cresta, label: "Cresta", color: "var(--lvl-roja)" },
    { c: name, label: "NAME", color: "var(--lvl-naranja)", dash: "4 3" },
    { c: vertedero, label: vertedero === namo ? "NAMO · Vertedero" : "Vertedero", color: "var(--lvl-amarilla)", dash: "4 3" },
  ];
  if (vertedero !== namo) marks.push({ c: namo, label: "NAMO", color: "var(--fg-muted)", dash: "2 3" });

  // separar etiquetas que caen muy juntas
  const sorted = marks.slice().sort((a, b) => b.c - a.c);
  const labelY: Record<string, number> = {};
  let last = -Infinity;
  for (const m of sorted) {
    const yy = Math.max(y(m.c), last + 10);
    labelY[m.label] = yy;
    last = yy;
  }
  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Nivel ${formatNumber(cota, 2)} m s. n. m.`}>
        <defs>
          <linearGradient id="gauge-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={water} stopOpacity="0.55" />
            <stop offset="1" stopColor={water} stopOpacity="0.12" />
          </linearGradient>
          <pattern id="gauge-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--border-strong)" strokeWidth="1.2" />
          </pattern>
        </defs>
        {/* terreno */}
        <path d={`${valley} L262,${H} L14,${H} Z`} fill="url(#gauge-hatch)" opacity=".35" />
        <motion.path
          d={waterPath}
          fill="url(#gauge-water)"
          initial={false}
          animate={{ d: waterPath }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
        />
        <motion.line
          x1={leftX(yw)}
          x2={rightX(yw)}
          y1={yw}
          y2={yw}
          stroke={water}
          strokeWidth="2"
          initial={false}
          animate={{ x1: leftX(yw), x2: rightX(yw), y1: yw, y2: yw }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
        />
        <path d={valley} fill="none" stroke="var(--border-strong)" strokeWidth="1.5" />
        {/* cortina */}
        <path d={`M262,${y(cresta)} L272,${y(cresta)} L300,${bottom} L236,${bottom} Z`} fill="var(--surface-3)" stroke="var(--border-strong)" />
        {marks.map((m) => (
          <g key={m.label}>
            <line x1="14" x2="300" y1={y(m.c)} y2={y(m.c)} stroke={m.color} strokeDasharray={m.dash} strokeWidth="1" opacity=".8" />

            <text x="18" y={labelY[m.label] - 3} fontSize="8.5" fill={m.color} className="font-sans">
              {m.label} {m.c.toFixed(1).replace(".", ",")}
            </text>
          </g>
        ))}
        <text x="88" y={bottom - 4} fontSize="8.5" fill="var(--fg-faint)">
          Fondo {fondo.toFixed(0)}
        </text>
      </svg>
      <div className="pointer-events-none absolute right-12 bottom-6 text-right">
        <div className="tabular font-mono text-xl font-semibold text-fg">{formatNumber(cota, 2)}</div>
        <div className="text-[10px] text-fg-faint">m s. n. m.</div>
        {fillPct !== undefined && <div className="tabular mt-1 font-mono text-sm text-fg-muted">{formatPercent(fillPct)}</div>}
      </div>
    </div>
  );
}
