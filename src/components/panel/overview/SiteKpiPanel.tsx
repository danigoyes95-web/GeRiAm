"use client";
import Link from "next/link";
import { useId } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, CloudRain, Minus } from "lucide-react";
import { StatusBadge } from "@/design";
import { LEVELS } from "@/design/levels";
import { Card } from "@/components/ui/card";
import { formatAgo, formatHm3, formatNumber } from "@/lib/format";
import { isStale, type SiteSummary } from "@/lib/data/live";
import { sensorThresholds, siteCurve } from "@/lib/data/types";
import type { SeriesPoint } from "@/lib/data/series";
import { volumeAt } from "@/lib/hydro/curve";
import { useNow } from "@/lib/hooks/useNow";
import { cn } from "@/lib/utils";

function deltaOver(series: SeriesPoint[] | undefined, minutes: number): number | null {
  if (!series || series.length < 2) return null;
  const last = series[series.length - 1];
  const target = last.ts - minutes * 60_000;
  const prev = [...series].reverse().find((p) => p.ts <= target);
  return prev ? last.value - prev.value : null;
}

/** Trazo suavizado (monótono) para mini-gráficos. */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 3) return pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join("");
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return d;
}

/** Mini-gráfico de área con umbral, máximo/mínimo y punto final con halo. */
function AreaSpark({
  values,
  color,
  threshold,
  thresholdLabel,
  height = 56,
  decimals = 2,
}: {
  values: number[];
  color: string;
  threshold?: number;
  thresholdLabel?: string;
  height?: number;
  decimals?: number;
}) {
  const id = useId().replace(/:/g, "");
  const w = 300;
  const h = height;
  if (values.length < 2)
    return (
      <div style={{ height }} className="text-fg-faint grid place-items-center text-[11px]">
        Sin serie de 24 h
      </div>
    );
  // cada ~4 puntos para un trazo limpio
  const step = Math.max(1, Math.floor(values.length / 72));
  const v = values.filter((_, i) => i % step === 0 || i === values.length - 1);
  let min = Math.min(...v);
  let max = Math.max(...v);
  const showThr = threshold !== undefined && threshold - max < (max - min || 0.1) * 3;
  if (showThr) max = Math.max(max, threshold!);
  const span = max - min || Math.abs(max) * 0.001 || 1;
  min -= span * 0.12;
  max += span * 0.18;
  const x = (i: number) => (i / (v.length - 1)) * w;
  const y = (val: number) => (1 - (val - min) / (max - min)) * h;
  const pts = v.map((val, i) => [Number(x(i).toFixed(1)), Number(y(val).toFixed(1))] as [number, number]);
  const d = smoothPath(pts);
  const last = pts[pts.length - 1];
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block w-full overflow-visible"
        style={{ height }}
        aria-hidden
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.32" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={`f${id}`} x="-10%" y="-40%" width="120%" height="180%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={w}
            y1={h * f}
            y2={h * f}
            stroke="var(--border)"
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
            opacity="0.6"
          />
        ))}
        {showThr && (
          <line
            x1="0"
            x2={w}
            y1={y(threshold!)}
            y2={y(threshold!)}
            stroke="var(--lvl-amarilla)"
            strokeDasharray="4 3"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            opacity=".85"
          />
        )}
        <path d={`${d}L${w},${h}L0,${h}Z`} fill={`url(#g${id})`} />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          opacity="0.35"
          filter={`url(#f${id})`}
        />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      {/* punto final (fuera del SVG para que no se deforme con preserveAspectRatio) */}
      <span
        className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${(last[0] / w) * 100}%`,
          top: `${(last[1] / h) * 100}%`,
          background: color,
          boxShadow: `0 0 0 4px color-mix(in oklab, ${color} 25%, transparent), 0 0 12px ${color}`,
        }}
      />
      {showThr && (
        <span
          className="text-lvl-amarilla pointer-events-none absolute left-0 -translate-y-full pb-0.5 font-mono text-[9.5px]"
          style={{ top: `${(y(threshold!) / h) * 100}%` }}
        >
          {thresholdLabel} {formatNumber(threshold, decimals)}
        </span>
      )}
    </div>
  );
}

/** Indicador circular de llenado. */
function Donut({ pct, label }: { pct: number | null; label: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const p = pct === null ? 0 : Math.min(100, Math.max(0, pct));
  const over = (pct ?? 0) > 100;
  const color = over ? "var(--lvl-roja)" : "var(--accent)";
  return (
    <div className="relative grid size-[84px] shrink-0 place-items-center" role="img" aria-label={`${label}: ${pct === null ? "sin dato" : formatNumber(pct, 1) + " %"}`}>
      <svg viewBox="0 0 80 80" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(p / 100) * c} ${c}`}
          style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: "stroke-dasharray .6s ease" }}
        />
      </svg>
      <div className="tabular text-fg flex items-baseline font-mono leading-none">
        <span className="text-[17px] font-semibold">
          {pct === null ? "—" : formatNumber(pct, pct >= 100 ? 0 : 1)}
        </span>
        <span className="text-fg-faint ml-0.5 text-[10px]">%</span>
      </div>
    </div>
  );
}

function Trend({
  delta,
  decimals,
  unit,
  upIsBad,
}: {
  delta: number | null;
  decimals: number;
  unit: string;
  upIsBad?: boolean;
}) {
  const dir = delta === null || Math.abs(delta) < 1e-9 ? 0 : delta > 0 ? 1 : -1;
  const Icon = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;
  const cls =
    dir === 0
      ? "text-fg-faint bg-surface-2"
      : upIsBad && dir > 0
        ? "text-lvl-naranja bg-[var(--lvl-naranja-bg)]"
        : "text-fg-muted bg-surface-2";
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap",
        cls,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {delta === null ? "—" : `${delta > 0 ? "+" : ""}${formatNumber(delta, decimals)}`} {unit}
    </span>
  );
}

/** Escala de operación: dónde está el agua respecto de NAMO, NAME y cresta. */
function LevelScale({
  nivel,
  namo,
  name,
  cresta,
}: {
  nivel: number | null;
  namo: number;
  name: number;
  cresta: number;
}) {
  const lo = namo - 3;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (cresta - lo)) * 100))}%`;
  const free = nivel === null ? null : cresta - nivel;
  const over = nivel !== null && nivel > name ? "roja" : nivel !== null && nivel > namo ? "naranja" : null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10.5px]">
        <span className="text-fg-faint font-medium tracking-wide uppercase">Escala de operación</span>
        <span className="text-fg-faint">
          Borde libre{" "}
          <b
            className={cn(
              "tabular font-mono font-semibold",
              free !== null && free < 1 ? "text-lvl-roja" : "text-fg",
            )}
          >
            {free === null ? "—" : `${formatNumber(free, 2)} m`}
          </b>
        </span>
      </div>
      <div className="bg-surface-3 relative h-2 rounded-full">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: nivel === null ? 0 : pos(nivel),
            background:
              over === "roja"
                ? "var(--lvl-roja)"
                : over === "naranja"
                  ? "var(--lvl-naranja)"
                  : "linear-gradient(90deg, color-mix(in oklab, var(--accent) 35%, transparent), var(--accent))",
          }}
        />
        {[
          { v: namo, c: "var(--lvl-amarilla)" },
          { v: name, c: "var(--lvl-naranja)" },
          { v: cresta, c: "var(--lvl-roja)" },
        ].map((m) => (
          <span
            key={m.v}
            className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded"
            style={{ left: pos(m.v), background: m.c }}
          />
        ))}
      </div>
      <div className="text-fg-faint relative mt-1 h-3 font-mono text-[9.5px]">
        <span className="absolute -translate-x-1/2" style={{ left: pos(namo) }}>
          NAMO
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: pos(name) }}>
          NAME
        </span>
        <span className="absolute -translate-x-full" style={{ left: pos(cresta) }}>
          Cresta
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  decimals,
  delta,
  deltaUnit,
  deltaDecimals,
  upIsBad,
  spark,
  color,
  stale,
  icon,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  decimals: number;
  delta?: number | null;
  deltaUnit?: string;
  deltaDecimals?: number;
  upIsBad?: boolean;
  spark?: number[];
  color?: string;
  stale?: string | null;
  icon?: React.ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  let path = "";
  if (spark && spark.length > 1) {
    const step = Math.max(1, Math.floor(spark.length / 40));
    const v = spark.filter((_, i) => i % step === 0 || i === spark.length - 1);
    const mn = Math.min(...v);
    const mx = Math.max(...v);
    const sp = mx - mn || 1;
    path = smoothPath(
      v.map((val, i) => [
        Number(((i / (v.length - 1)) * 100).toFixed(1)),
        Number((22 - ((val - mn) / sp) * 18).toFixed(1)),
      ]),
    );
  }
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div className="text-fg-faint flex items-center justify-between gap-1 text-[10.5px] font-medium tracking-wide uppercase">
        <span className="flex min-w-0 items-center gap-1 truncate">
          {icon}
          {label}
        </span>
        {stale && <span className="text-lvl-sin-datos shrink-0 normal-case">{stale}</span>}
      </div>
      <div className="mt-1 flex items-baseline gap-1 whitespace-nowrap">
        <span className="tabular text-fg font-mono text-lg font-semibold">
          {formatNumber(value, decimals)}
        </span>
        <span className="text-fg-faint text-[11px]">{unit}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {delta !== undefined ? (
          <Trend
            delta={delta}
            decimals={deltaDecimals ?? decimals}
            unit={deltaUnit ?? ""}
            upIsBad={upIsBad}
          />
        ) : (
          <span />
        )}
        {path && (
          <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-16 shrink-0" aria-hidden>
            <defs>
              <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.3" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${path}L100,24L0,24Z`} fill={`url(#s${id})`} />
            <path d={path} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
    </div>
  );
}

export function SiteKpiPanel({
  summary,
  series,
  rain,
  className,
}: {
  summary: SiteSummary;
  series: Record<string, SeriesPoint[]> | undefined;
  rain: { h1: number; h24: number; h72: number } | undefined;
  className?: string;
}) {
  const now = useNow(15_000) ?? undefined;
  const { site, nivel, qin, qout, level, fillPct } = summary;
  const nivelSeries = nivel ? series?.[nivel.id] : undefined;
  const qinSeries = qin ? series?.[qin.id] : undefined;
  const qoutSeries = qout ? series?.[qout.id] : undefined;
  const thr = nivel ? sensorThresholds(nivel) : null;
  const stale = (s: typeof nivel) => (s && isStale(s, now) ? formatAgo(s.last_reading_at, now) : null);
  const d1h = deltaOver(nivelSeries, 60);
  const d6h = deltaOver(nivelSeries, 360);
  const cota = nivel?.last_value ?? null;
  const vol = cota !== null ? volumeAt(siteCurve(site), cota) : null;
  const alertOnLevel = summary.alerts.some((a) => a.sensor_id === nivel?.id);
  const lvlColor = level !== "normal" && LEVELS[level] ? LEVELS[level].cssVar : "var(--accent)";
  const short = site.name.replace(/^Embalse\s+/i, "");

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* cabecera */}
      <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="tabular bg-surface-3 text-fg-muted rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold">
            {site.code}
          </span>
          <div className="min-w-0">
            <div className="text-fg-faint text-[10px] font-medium tracking-wider uppercase">Embalse</div>
            <h2 className="truncate text-[15px] leading-tight font-semibold">{short}</h2>
          </div>
          <StatusBadge level={level} size="sm" />
        </div>
        <Link
          href={`/panel/embalses/${site.slug}`}
          className="border-border text-fg-muted hover:border-accent/50 hover:text-accent inline-flex shrink-0 items-center gap-0.5 rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors"
        >
          Detalle <ChevronRight className="size-3.5" />
        </Link>
      </div>

      {/* nivel + llenado */}
      <div className="flex items-start gap-3 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <div className="text-fg-faint flex items-center gap-2 text-[10.5px] font-medium tracking-wide uppercase">
            Nivel del embalse
            <span className="tracking-normal normal-case" suppressHydrationWarning>
              ·{" "}
              {stale(nivel) ? (
                <span className="text-lvl-sin-datos">sin datos {stale(nivel)}</span>
              ) : (
                `act. ${formatAgo(nivel?.last_reading_at, now)}`
              )}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap">
            <span
              className="tabular font-mono text-[28px] leading-none font-semibold tracking-tight"
              style={{ color: alertOnLevel ? lvlColor : undefined }}
            >
              {formatNumber(cota, 2)}
            </span>
            <span className="text-fg-faint text-xs">m s. n. m.</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Trend delta={d1h === null ? null : d1h * 100} decimals={1} unit="cm/h" upIsBad />
            <span className="text-fg-faint text-[11px]">
              6 h:{" "}
              <span className="tabular text-fg-muted font-mono">
                {d6h === null ? "—" : `${d6h > 0 ? "+" : ""}${formatNumber(d6h * 100, 1)} cm`}
              </span>
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <Donut pct={fillPct} label="llenado" />
          <span className="text-fg-faint mt-0.5 text-[9.5px] font-medium tracking-wide uppercase">
            llenado
          </span>
          <span className="tabular text-fg-faint mt-0.5 font-mono text-[10.5px]">
            {vol !== null ? formatHm3(vol) : "—"}
          </span>
        </div>
      </div>

      <div className="px-4 pt-2">
        <AreaSpark
          values={nivelSeries?.map((p) => p.value) ?? []}
          color={lvlColor}
          threshold={thr?.amarilla}
          thresholdLabel="Amarilla"
        />
        <div className="text-fg-faint mt-0.5 flex justify-between font-mono text-[9.5px]">
          <span>−24 h</span>
          <span>ahora</span>
        </div>
      </div>

      <div className="px-4 pt-2.5 pb-3">
        <LevelScale
          nivel={cota}
          namo={Number(site.cota_namo)}
          name={Number(site.cota_name)}
          cresta={Number(site.cota_cresta)}
        />
      </div>

      {/* métricas secundarias */}
      <div className="divide-border border-border grid grid-cols-2 divide-x divide-y border-t sm:grid-cols-4 sm:divide-y-0 xl:grid-cols-2 xl:divide-y 2xl:grid-cols-4 2xl:divide-y-0">
        <Stat
          label="Entrada"
          value={qin?.last_value}
          unit="L/s"
          decimals={0}
          delta={deltaOver(qinSeries, 60)}
          deltaUnit="1 h"
          upIsBad
          spark={qinSeries?.map((p) => p.value)}
          color="#38bdf8"
          stale={stale(qin)}
        />
        <Stat
          label="Salida"
          value={qout?.last_value}
          unit="L/s"
          decimals={0}
          delta={deltaOver(qoutSeries, 60)}
          deltaUnit="1 h"
          spark={qoutSeries?.map((p) => p.value)}
          color="#a3e635"
          stale={stale(qout)}
        />
        <Stat
          label="Lluvia 24 h"
          icon={<CloudRain className="size-3" aria-hidden />}
          value={rain?.h24}
          unit="mm"
          decimals={1}
          delta={rain?.h1 ?? null}
          deltaUnit="mm 1 h"
          upIsBad
        />
        <Stat label="Lluvia 72 h" value={rain?.h72} unit="mm" decimals={1} />
      </div>
    </Card>
  );
}
