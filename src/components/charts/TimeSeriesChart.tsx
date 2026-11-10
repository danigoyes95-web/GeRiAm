"use client";
import { useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { formatDateTime, formatNumber, formatTime } from "@/lib/format";
import { useTheme } from "@/lib/hooks/useBrowser";

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  LegendComponent,
  CanvasRenderer,
]);

export interface ChartSeries {
  name: string;
  data: [number, number][];
  type?: "line" | "bar";
  color: string;
  axis?: 0 | 1;
  area?: boolean;
  decimals?: number;
  unit?: string;
  step?: boolean;
  dashed?: boolean;
}

export interface ChartLine {
  value: number;
  label: string;
  color: string;
  axis?: 0 | 1;
  dashed?: boolean;
  /** umbral de alerta: además de la línea, pinta la franja de ese nivel hasta el siguiente */
  zone?: boolean;
}

export interface ChartAxis {
  name: string;
  min?: number | "dataMin";
  max?: number | "dataMax";
  decimals?: number;
}

const PALETTE = {
  dark: {
    text: "#8b9bb4",
    faint: "#56667f",
    grid: "rgba(139,155,180,0.09)",
    axis: "rgba(139,155,180,0.22)",
    tooltip: "rgba(10,19,34,0.94)",
    border: "rgba(80,104,140,0.45)",
    fg: "#e6edf7",
    shadow: "0 10px 30px rgba(0,0,0,.45)",
  },
  light: {
    text: "#4a5b78",
    faint: "#7d8ba3",
    grid: "rgba(74,91,120,0.10)",
    axis: "rgba(74,91,120,0.25)",
    tooltip: "rgba(255,255,255,0.96)",
    border: "#c3cfe1",
    fg: "#0b1526",
    shadow: "0 10px 30px rgba(15,23,42,.15)",
  },
};

const MONO = "JetBrains Mono, ui-monospace, monospace";

/** Paso "bonito" (1, 2, 2.5, 5 × 10^n) para que las marcas del eje sean redondas. */
function niceStep(span: number, ticks = 4) {
  const raw = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

/**
 * Rango del eje calculado aquí (no con "dataMin"/"dataMax" de ECharts): incluye los datos,
 * el umbral más cercano por encima y por debajo, y redondea a marcas limpias.
 */
function axisRange(
  values: number[],
  lines: number[],
  a: ChartAxis,
): { min: number; max: number; interval: number } | null {
  if (!values.length) return null;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const above = lines.filter((v) => v > hi).sort((x, y) => x - y)[0];
  const below = lines.filter((v) => v < lo).sort((x, y) => y - x)[0];
  if (above !== undefined) hi = above;
  if (below !== undefined && lo - below < (hi - lo) * 0.6) lo = below;
  if (typeof a.min === "number") lo = Math.min(a.min, lo);
  if (typeof a.max === "number") hi = Math.max(a.max, hi);
  const span = hi - lo || Math.abs(hi) * 0.01 || 1;
  const step = niceStep(span * 1.12);
  const min = typeof a.min === "number" ? a.min : Math.floor((lo - span * 0.06) / step) * step;
  const max = typeof a.max === "number" ? a.max : Math.ceil((hi + span * 0.08) / step) * step;
  return { min, max, interval: step };
}

const hexA = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (x) => x + x) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Serie temporal con zoom, franjas de alerta, valor actual destacado y eje secundario opcional. */
export function TimeSeriesChart({
  series,
  lines = [],
  axes,
  height = 260,
  zoom = true,
  xLabel = "time",
  ariaLabel,
}: {
  series: ChartSeries[];
  lines?: ChartLine[];
  axes: [ChartAxis] | [ChartAxis, ChartAxis];
  height?: number;
  zoom?: boolean;
  /** "time": eje temporal real; "simmin": minutos simulados */
  xLabel?: "time" | "simmin";
  ariaLabel: string;
}) {
  const [theme] = useTheme();
  const c = PALETTE[theme];
  const hasData = series.some((s) => s.data.length > 0);

  const option = useMemo(() => {
    const ranges = axes.map((a, i) =>
      axisRange(
        series
          .filter((s) => (s.axis ?? 0) === i)
          .flatMap((s) => s.data.map((d) => d[1]).filter(Number.isFinite)),
        lines.filter((l) => (l.axis ?? 0) === i).map((l) => l.value),
        a,
      ),
    );
    const lineCount = series.filter((s) => (s.type ?? "line") === "line").length;
    const endLabels = lineCount <= 2;

    const yAxis = axes.map((a, i) => ({
      type: "value" as const,
      name: a.name,
      nameGap: 12,
      nameTextStyle: {
        color: c.faint,
        fontSize: 10,
        align: i === 0 ? ("left" as const) : ("right" as const),
        padding: i === 0 ? [0, 0, 0, -38] : [0, -38, 0, 0],
      },
      min: ranges[i]?.min,
      max: ranges[i]?.max,
      interval: ranges[i]?.interval,
      position: i === 0 ? ("left" as const) : ("right" as const),
      splitLine: { show: i === 0, lineStyle: { color: c.grid, type: [3, 4] as unknown as "dashed" } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: c.text,
        fontSize: 10,
        fontFamily: MONO,
        margin: 10,
        formatter: (v: number) => formatNumber(v, a.decimals ?? 1),
      },
    }));

    const span = (series[0]?.data.at(-1)?.[0] ?? 0) - (series[0]?.data[0]?.[0] ?? 0);

    return {
      animationDuration: 500,
      animationEasing: "cubicOut" as const,
      textStyle: { fontFamily: "Inter, system-ui, sans-serif" },
      grid: {
        left: 54,
        right: axes.length > 1 ? 54 : endLabels ? 62 : 18,
        top: 46,
        bottom: zoom ? 46 : 26,
        containLabel: false,
      },
      legend: {
        top: 0,
        left: 0,
        textStyle: { color: c.text, fontSize: 11 },
        itemWidth: 14,
        itemHeight: 4,
        itemGap: 14,
        icon: "roundRect",
        inactiveColor: c.faint,
      },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: c.tooltip,
        borderColor: c.border,
        borderWidth: 1,
        padding: [8, 10],
        extraCssText: `backdrop-filter: blur(6px); border-radius: 8px; box-shadow: ${c.shadow};`,
        textStyle: { color: c.fg, fontSize: 11 },
        axisPointer: {
          type: "cross" as const,
          crossStyle: { color: c.faint, width: 1, type: "dashed" as const },
          lineStyle: { color: c.faint, type: "dashed" as const },
          label: {
            backgroundColor: theme === "dark" ? "#1b2b45" : "#334155",
            color: "#e6edf7",
            fontSize: 10,
            fontFamily: MONO,
            padding: [3, 6],
            borderRadius: 4,
          },
        },
        formatter: (
          params: { seriesName: string; value: [number, number]; color: string; seriesIndex: number }[],
        ) => {
          if (!params.length) return "";
          const x = params[0].value[0];
          const head = xLabel === "simmin" ? `Minuto simulado ${formatNumber(x, 0)}` : formatDateTime(x);
          const rows = params
            .map((p) => {
              const s = series[p.seriesIndex];
              return `<div style="display:flex;justify-content:space-between;align-items:center;gap:18px;line-height:1.7"><span style="color:${c.text}"><span style="display:inline-block;width:10px;height:3px;border-radius:2px;background:${p.color};margin-right:7px;vertical-align:middle"></span>${p.seriesName}</span><b style="font-family:${MONO};color:${c.fg}">${formatNumber(p.value[1], s?.decimals ?? 2)} <span style="font-weight:400;color:${c.faint}">${s?.unit ?? ""}</span></b></div>`;
            })
            .join("");
          return `<div style="font-size:10.5px;color:${c.faint};margin-bottom:4px;font-family:${MONO}">${head}</div>${rows}`;
        },
      },
      xAxis: {
        type: xLabel === "simmin" ? ("value" as const) : ("time" as const),
        boundaryGap: false,
        axisLine: { lineStyle: { color: c.axis } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisPointer: {
          label: {
            formatter: (p: { value: number }) =>
              xLabel === "simmin" ? `${formatNumber(p.value, 0)} min` : formatDateTime(p.value).slice(0, 16),
          },
        },
        axisLabel: {
          color: c.text,
          fontSize: 10,
          fontFamily: MONO,
          hideOverlap: true,
          margin: 10,
          formatter: (v: number) =>
            xLabel === "simmin"
              ? `${formatNumber(v, 0)} min`
              : span > 2 * 86400_000
                ? formatDateTime(v).slice(0, 5)
                : formatTime(v, undefined, false),
        },
      },
      yAxis,
      dataZoom: zoom
        ? [
            { type: "inside" as const, throttle: 50 },
            {
              type: "slider" as const,
              height: 14,
              bottom: 6,
              left: 54,
              right: axes.length > 1 ? 54 : endLabels ? 62 : 18,
              borderColor: "transparent",
              backgroundColor: c.grid,
              fillerColor: "rgba(34,211,238,0.14)",
              handleIcon:
                "path://M-3,-7 h6 a2,2 0 0 1 2,2 v10 a2,2 0 0 1 -2,2 h-6 a2,2 0 0 1 -2,-2 v-10 a2,2 0 0 1 2,-2 z",
              handleSize: "110%",
              handleStyle: { color: theme === "dark" ? "#2a3d5c" : "#cbd5e1", borderColor: c.axis },
              moveHandleSize: 0,
              textStyle: { color: c.faint, fontSize: 9 },
              showDetail: false,
              dataBackground: { lineStyle: { color: c.faint, opacity: 0.5 }, areaStyle: { color: c.grid } },
              selectedDataBackground: {
                lineStyle: { color: "#22d3ee", opacity: 0.6 },
                areaStyle: { color: "rgba(34,211,238,0.10)" },
              },
            },
          ]
        : [],
      series: series.map((s, i) => {
        const axisIdx = s.axis ?? 0;
        const isBar = (s.type ?? "line") === "bar";
        const firstOnAxis = series.findIndex((x) => (x.axis ?? 0) === axisIdx) === i;
        const axisLines = firstOnAxis ? lines.filter((l) => (l.axis ?? 0) === axisIdx) : [];
        const r = ranges[axisIdx];
        const zones = axisLines.filter((l) => l.zone).sort((a, b) => a.value - b.value);
        return {
          name: s.name,
          type: s.type ?? "line",
          yAxisIndex: axisIdx,
          data: s.data,
          showSymbol: false,
          symbol: "circle",
          symbolSize: 7,
          emphasis: { focus: "none" as const, itemStyle: { borderColor: "#fff", borderWidth: 2 } },
          step: s.step ? ("end" as const) : undefined,
          smooth: isBar || s.step ? false : 0.25,
          sampling: "lttb" as const,
          barMaxWidth: 8,
          z: isBar ? 1 : 3,
          itemStyle: isBar
            ? {
                borderRadius: [2, 2, 0, 0],
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: hexA(s.color, 0.95) },
                  { offset: 1, color: hexA(s.color, 0.35) },
                ]),
              }
            : { color: s.color },
          lineStyle: isBar
            ? undefined
            : {
                width: 2,
                color: s.color,
                type: s.dashed ? ("dashed" as const) : ("solid" as const),
                shadowColor: hexA(s.color, 0.45),
                shadowBlur: theme === "dark" ? 8 : 0,
                shadowOffsetY: 2,
                cap: "round" as const,
                join: "round" as const,
              },
          areaStyle: s.area
            ? {
                origin: "start" as const,
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: hexA(s.color, 0.3) },
                  { offset: 1, color: hexA(s.color, 0) },
                ]),
              }
            : undefined,
          endLabel:
            !isBar && endLabels && s.data.length
              ? {
                  show: true,
                  formatter: (p: { value: [number, number] }) => formatNumber(p.value[1], s.decimals ?? 2),
                  color: "#04121a",
                  backgroundColor: s.color,
                  borderRadius: 4,
                  padding: [2, 5],
                  fontSize: 10,
                  fontFamily: MONO,
                  fontWeight: 600 as const,
                  distance: 6,
                }
              : undefined,
          markArea:
            zones.length && r
              ? {
                  silent: true,
                  data: zones.map((z, k) => [
                    { yAxis: Math.max(z.value, r.min), itemStyle: { color: hexA(z.color, 0.11) } },
                    { yAxis: Math.min(zones[k + 1]?.value ?? r.max, r.max) },
                  ]),
                }
              : undefined,
          markLine: axisLines.length
            ? {
                silent: true,
                symbol: "none",
                animation: false,
                data: axisLines
                  .filter((l) => !r || (l.value >= r.min && l.value <= r.max))
                  .map((l) => ({
                    yAxis: l.value,
                    lineStyle: {
                      color: hexA(l.color, 0.85),
                      type: l.dashed === false ? ("solid" as const) : ([5, 4] as unknown as "dashed"),
                      width: 1,
                    },
                    label: {
                      formatter: `${l.label} · ${formatNumber(l.value, 2)}`,
                      color: l.color,
                      fontSize: 9.5,
                      fontFamily: MONO,
                      position: "insideStartTop" as const,
                      distance: [2, 3],
                    },
                  })),
              }
            : undefined,
        };
      }),
    };
  }, [series, lines, axes, zoom, xLabel, c, theme]);

  return (
    <div role="img" aria-label={ariaLabel} style={{ height }} className="relative">
      {hasData ? (
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          notMerge
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
        />
      ) : (
        <div className="border-border text-fg-faint grid h-full place-items-center rounded-md border border-dashed text-xs">
          Sin lecturas en el periodo seleccionado
        </div>
      )}
    </div>
  );
}
