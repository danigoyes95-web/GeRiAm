"use client";
import { useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { formatDateTime, formatNumber, formatTime } from "@/lib/format";
import { useTheme } from "@/lib/hooks/useBrowser";

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent, LegendComponent, CanvasRenderer]);

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
}

export interface ChartAxis {
  name: string;
  min?: number | "dataMin";
  max?: number | "dataMax";
  decimals?: number;
}

const PALETTE = {
  dark: { text: "#93a3bd", faint: "#5d6e8a", grid: "rgba(147,163,189,0.10)", tooltip: "#0d1829", border: "#27395a", fg: "#e6edf7" },
  light: { text: "#4a5b78", faint: "#7d8ba3", grid: "rgba(74,91,120,0.12)", tooltip: "#ffffff", border: "#c3cfe1", fg: "#0b1526" },
};

/** Serie temporal con zoom, umbrales dibujados (markLine) y eje secundario opcional. */
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
  const option = useMemo(() => {
    const yAxis = axes.map((a, i) => ({
      type: "value" as const,
      name: a.name,
      nameTextStyle: { color: c.faint, fontSize: 10, align: i === 0 ? ("left" as const) : ("right" as const) },
      min: a.min ?? "dataMin",
      max: a.max ?? "dataMax",
      scale: true,
      position: i === 0 ? ("left" as const) : ("right" as const),
      splitLine: { show: i === 0, lineStyle: { color: c.grid } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: c.text, fontSize: 10, fontFamily: "var(--font-jetbrains), monospace", formatter: (v: number) => formatNumber(v, a.decimals ?? 1) },
    }));
    return {
      animation: false,
      grid: { left: 52, right: axes.length > 1 ? 52 : 16, top: 28, bottom: zoom ? 44 : 24 },
      legend: { top: 0, right: 0, textStyle: { color: c.text, fontSize: 11 }, itemWidth: 12, itemHeight: 3, icon: "rect" },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: c.tooltip,
        borderColor: c.border,
        textStyle: { color: c.fg, fontSize: 11 },
        axisPointer: { type: "line" as const, lineStyle: { color: c.faint, type: "dashed" as const } },
        valueFormatter: undefined,
        formatter: (params: { seriesName: string; value: [number, number]; color: string; seriesIndex: number }[]) => {
          if (!params.length) return "";
          const x = params[0].value[0];
          const head = xLabel === "simmin" ? `Minuto simulado ${formatNumber(x, 0)}` : formatDateTime(x);
          const rows = params
            .map((p) => {
              const s = series[p.seriesIndex];
              return `<div style="display:flex;justify-content:space-between;gap:16px"><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};margin-right:6px"></span>${p.seriesName}</span><b style="font-family:monospace">${formatNumber(p.value[1], s?.decimals ?? 2)} ${s?.unit ?? ""}</b></div>`;
            })
            .join("");
          return `<div style="font-size:11px;color:${c.text};margin-bottom:4px">${head}</div>${rows}`;
        },
      },
      xAxis: {
        type: xLabel === "simmin" ? ("value" as const) : ("time" as const),
        axisLine: { lineStyle: { color: c.grid } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: c.text,
          fontSize: 10,
          hideOverlap: true,
          formatter: (v: number) => (xLabel === "simmin" ? `${formatNumber(v, 0)} min` : (() => {
            const span = (series[0]?.data.at(-1)?.[0] ?? 0) - (series[0]?.data[0]?.[0] ?? 0);
            return span > 2 * 86400_000 ? formatDateTime(v).slice(0, 5) : formatTime(v, undefined, false);
          })()),
        },
      },
      yAxis,
      dataZoom: zoom
        ? [
            { type: "inside" as const, throttle: 50 },
            { type: "slider" as const, height: 16, bottom: 8, borderColor: c.grid, fillerColor: "rgba(34,211,238,0.12)", handleStyle: { color: c.text }, textStyle: { color: c.faint, fontSize: 9 }, showDetail: false, dataBackground: { lineStyle: { color: c.faint }, areaStyle: { color: c.grid } } },
          ]
        : [],
      series: series.map((s, i) => ({
        name: s.name,
        type: s.type ?? "line",
        yAxisIndex: s.axis ?? 0,
        data: s.data,
        showSymbol: false,
        step: s.step ? ("end" as const) : undefined,
        smooth: false,
        sampling: "lttb" as const,
        barMaxWidth: 6,
        itemStyle: { color: s.color, opacity: s.type === "bar" ? 0.75 : 1 },
        lineStyle: { width: 1.6, color: s.color, type: s.dashed ? ("dashed" as const) : ("solid" as const) },
        areaStyle: s.area ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: s.color + "55" }, { offset: 1, color: s.color + "00" }]) } : undefined,
        markLine:
          series.findIndex((x) => (x.axis ?? 0) === (s.axis ?? 0)) === i && lines.length
            ? {
                silent: true,
                symbol: "none",
                data: lines
                  .filter((l) => (l.axis ?? 0) === (s.axis ?? 0))
                  .map((l) => ({
                    yAxis: l.value,
                    lineStyle: { color: l.color, type: l.dashed === false ? ("solid" as const) : ("dashed" as const), width: 1 },
                    label: { formatter: `${l.label} ${formatNumber(l.value, 2)}`, color: l.color, fontSize: 9.5, position: "insideEndTop" as const },
                  })),
              }
            : undefined,
      })),
    };
  }, [series, lines, axes, zoom, xLabel, c]);

  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ReactEChartsCore echarts={echarts} option={option} notMerge style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
    </div>
  );
}
