"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { CloudLightning, TrendingUp, Waves } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { SegmentedControl, Skeleton } from "@/components/ui/misc";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/hooks/useBrowser";
import { useNow } from "@/lib/hooks/useNow";
import { cn } from "@/lib/utils";
import type { MeteoWarning, ReachKey, RiverForecast as Forecast } from "@/lib/inamhi/geoglows";

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, LegendComponent, CanvasRenderer]);

const REACH_LABEL: Record<ReachKey, string> = {
  CHQ: "Salida Chiquiurco",
  MLC: "Salida Mulacorral",
  pasa: "Pasa",
  quisapincha: "Quisapincha",
  ambato: "Ambato",
};
const RP_COLOR: Record<number, string> = { 2: "#facc15", 10: "#fb923c", 50: "#ef4444" };
const MONO = "JetBrains Mono, ui-monospace, monospace";
const TZ = "America/Guayaquil";
const day = new Intl.DateTimeFormat("es-EC", { weekday: "short", day: "numeric", timeZone: TZ });
const dayHour = new Intl.DateTimeFormat("es-EC", {
  weekday: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});

interface Payload {
  forecast: Forecast | null;
  forecastError: string | null;
  warnings: { warnings: MeteoWarning[]; last: MeteoWarning | null } | null;
  source: string;
}

function status(f: Forecast) {
  if (f.exceeds.avg)
    return {
      tone: "roja" as const,
      text: `Crecida probable: el pronóstico medio supera el caudal de ${f.exceeds.avg} años`,
    };
  if (f.exceeds.max)
    return {
      tone: "amarilla" as const,
      text: `Crecida posible solo en el escenario extremo (supera ${f.exceeds.max} años)`,
    };
  return { tone: "normal" as const, text: "Sin crecida prevista en los próximos 15 días" };
}

const TONE = {
  normal: "border-lvl-normal/40 bg-[var(--lvl-normal-bg)] text-lvl-normal",
  amarilla: "border-lvl-amarilla/40 bg-[var(--lvl-amarilla-bg)] text-lvl-amarilla",
  roja: "border-lvl-roja/40 bg-[var(--lvl-roja-bg)] text-lvl-roja",
};

function ForecastChart({ f, height }: { f: Forecast; height: number }) {
  const [theme] = useTheme();
  const dark = theme === "dark";
  const nowMs = useNow(60_000) ?? 0;
  const option = useMemo(() => {
    const c = dark
      ? {
          text: "#8b9bb4",
          faint: "#56667f",
          grid: "rgba(139,155,180,0.09)",
          tip: "rgba(10,19,34,0.94)",
          border: "rgba(80,104,140,0.45)",
          fg: "#e6edf7",
        }
      : {
          text: "#4a5b78",
          faint: "#7d8ba3",
          grid: "rgba(74,91,120,0.10)",
          tip: "rgba(255,255,255,0.96)",
          border: "#c3cfe1",
          fg: "#0b1526",
        };

    const ens = f.series.filter(
      (p) => p.avg !== null && p.min !== null && p.max !== null && p.p25 !== null && p.p75 !== null,
    );
    const hr = f.series.filter((p) => p.hr !== null).map((p) => [p.t, p.hr as number]);
    const rp = f.returnPeriods;
    const top = Math.max(f.extreme?.max ?? 0, ...hr.map((p) => p[1]), rp ? rp[2] * 1.05 : 0) * 1.12;
    const lines = rp ? ([2, 10, 50] as const).filter((T) => rp[T] <= top).map((T) => ({ T, v: rp[T] })) : [];
    return {
      animationDuration: 500,
      grid: { left: 46, right: 14, top: 22, bottom: 26 },
      legend: { show: false },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: c.tip,
        borderColor: c.border,
        padding: [8, 10],
        extraCssText: "border-radius:8px;backdrop-filter:blur(6px);",
        axisPointer: { type: "line" as const, lineStyle: { color: c.faint, type: "dashed" as const } },
        formatter: (ps: { axisValue: number; dataIndex: number; seriesName: string }[]) => {
          const t = ps[0]?.axisValue;
          const p = ens.find((x) => x.t === t);
          const h = f.series.find((x) => x.t === t)?.hr;
          const row = (k: string, v: number | null | undefined, col: string) =>
            v === null || v === undefined
              ? ""
              : `<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.7"><span style="color:${c.text}"><span style="display:inline-block;width:9px;height:3px;border-radius:2px;background:${col};margin-right:6px;vertical-align:middle"></span>${k}</span><b style="font-family:${MONO};color:${c.fg}">${formatNumber(v, 1)} <span style="font-weight:400;color:${c.faint}">m³/s</span></b></div>`;
          return `<div style="font-size:10.5px;color:${c.faint};margin-bottom:4px;font-family:${MONO}">${dayHour.format(t)}</div>${row("Máximo", p?.max, "rgba(56,189,248,.35)")}${row("75 %", p?.p75, "rgba(56,189,248,.6)")}${row("Promedio", p?.avg, "#22d3ee")}${row("25 %", p?.p25, "rgba(56,189,248,.6)")}${row("Mínimo", p?.min, "rgba(56,189,248,.35)")}${row("Alta resolución", h, "#e879f9")}`;
        },
      },
      xAxis: {
        type: "time" as const,
        axisLine: { lineStyle: { color: c.grid } },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: c.grid } },
        axisLabel: {
          color: c.text,
          fontSize: 10,
          fontFamily: MONO,
          hideOverlap: true,
          formatter: (v: number) => day.format(v),
        },
      },
      yAxis: {
        type: "value" as const,
        name: "m³/s",
        nameTextStyle: { color: c.faint, fontSize: 10, align: "left" as const, padding: [0, 0, 0, -36] },
        min: 0,
        max: Math.ceil(top / 10) * 10 || 10,
        splitLine: { lineStyle: { color: c.grid, type: [3, 4] as unknown as "dashed" } },
        axisLabel: {
          color: c.text,
          fontSize: 10,
          fontFamily: MONO,
          formatter: (v: number) => formatNumber(v, 0),
        },
      },
      series: [
        {
          name: "Rango total",
          type: "line",
          stack: "full",
          data: ens.map((p) => [p.t, p.min]),
          lineStyle: { opacity: 0 },
          symbol: "none",
          silent: true,
          z: 1,
        },
        {
          name: "Rango total",
          type: "line",
          stack: "full",
          data: ens.map((p) => [p.t, (p.max as number) - (p.min as number)]),
          lineStyle: { opacity: 0 },
          symbol: "none",
          areaStyle: { color: dark ? "rgba(56,189,248,0.13)" : "rgba(14,116,144,0.12)" },
          itemStyle: { color: "rgba(56,189,248,0.35)" },
          silent: true,
          z: 1,
        },
        {
          name: "Rango 25–75 %",
          type: "line",
          stack: "iqr",
          data: ens.map((p) => [p.t, p.p25]),
          lineStyle: { opacity: 0 },
          symbol: "none",
          silent: true,
          z: 2,
        },
        {
          name: "Rango 25–75 %",
          type: "line",
          stack: "iqr",
          data: ens.map((p) => [p.t, (p.p75 as number) - (p.p25 as number)]),
          lineStyle: { opacity: 0 },
          symbol: "none",
          areaStyle: { color: dark ? "rgba(56,189,248,0.30)" : "rgba(14,116,144,0.28)" },
          itemStyle: { color: "rgba(56,189,248,0.6)" },
          silent: true,
          z: 2,
        },
        {
          name: "Promedio (51 escenarios)",
          type: "line",
          data: ens.map((p) => [p.t, p.avg]),
          symbol: "none",
          smooth: 0.3,
          z: 4,
          lineStyle: {
            width: 2.2,
            color: "#22d3ee",
            shadowColor: "rgba(34,211,238,.5)",
            shadowBlur: dark ? 8 : 0,
          },
          itemStyle: { color: "#22d3ee" },
          markLine: {
            silent: true,
            symbol: "none",
            data: [
              ...lines.map((l) => ({
                yAxis: l.v,
                lineStyle: { color: RP_COLOR[l.T], type: [5, 4] as unknown as "dashed", width: 1 },
                label: {
                  formatter: `Crecida ${l.T} años · ${formatNumber(l.v, 0)}`,
                  color: RP_COLOR[l.T],
                  fontSize: 9.5,
                  fontFamily: MONO,
                  position: "insideStartTop" as const,
                },
              })),
              ...(nowMs
                ? [
                    {
                      xAxis: nowMs,
                      lineStyle: { color: c.faint, type: "solid" as const, width: 1 },
                      label: { show: false },
                    },
                  ]
                : []),
            ],
          },
        },
        {
          name: "Alta resolución",
          type: "line",
          data: hr,
          symbol: "none",
          smooth: 0.3,
          z: 3,
          lineStyle: { width: 1.4, color: "#e879f9", type: [4, 3] as unknown as "dashed" },
          itemStyle: { color: "#e879f9" },
        },
      ],
    };
  }, [f, dark, nowMs]);
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}

function WarningsStrip({ w }: { w: Payload["warnings"] }) {
  if (!w) return null;
  const relevant = w.warnings.filter((x) => x.affects.length > 0);
  if (relevant.length) {
    return (
      <div className="space-y-1.5">
        {relevant.map((x) => (
          <div
            key={x.no + x.start}
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-3 py-2 text-xs",
              x.level === "Muy Alto" || x.level === "Crecida" ? TONE.roja : TONE.amarilla,
            )}
          >
            <CloudLightning className="size-4 shrink-0" aria-hidden />
            <b>Aviso INAMHI N° {x.no}</b>
            <span className="text-fg">{x.type}</span>
            {x.level && <span className="rounded bg-black/10 px-1.5 font-semibold">Nivel {x.level}</span>}
            <span className="text-fg-muted">
              {x.active ? "vigente hasta" : "desde"}{" "}
              {formatDateTime(Date.parse((x.active ? x.end : x.start) + "-05:00")).slice(0, 16)} · cubre{" "}
              {x.affects.join(", ")}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="border-border bg-surface-2 text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-3 py-2 text-xs">
      <CloudLightning className="text-fg-faint size-4 shrink-0" aria-hidden />
      <span>
        <b className="text-fg">Sin avisos meteorológicos del INAMHI</b> vigentes para la cuenca
      </span>
      {w.last && (
        <span className="text-fg-faint">
          · último: N° {w.last.no}, {w.last.type.toLowerCase()} (
          {formatDateTime(Date.parse(w.last.start + "-05:00")).slice(0, 5)} al{" "}
          {formatDateTime(Date.parse(w.last.end + "-05:00")).slice(0, 5)})
        </span>
      )}
    </div>
  );
}

/** Pronóstico de caudal GEOGLOWS (INAMHI) a 15 días con umbrales de crecida y avisos meteorológicos. */
export function RiverForecast({
  reaches,
  initial,
  showWarnings = false,
  height = 260,
  className,
}: {
  reaches: ReachKey[];
  initial?: ReachKey;
  showWarnings?: boolean;
  height?: number;
  className?: string;
}) {
  const [reach, setReach] = useState<ReachKey>(initial ?? reaches[0]);
  const q = useQuery({
    queryKey: ["inamhi", reach],
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/inamhi?reach=${reach}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as Payload;
    },
  });
  const f = q.data?.forecast ?? null;
  const st = f ? status(f) : null;
  return (
    <Card className={className}>
      <CardHeader
        title="Pronóstico de caudal · próximos 15 días"
        subtitle={
          f
            ? `${f.name} · INAMHI · GEOGLOWS (ECMWF) · emitido ${formatDateTime(f.issued + "T00:00:00Z").slice(0, 10)}`
            : "INAMHI · GEOGLOWS (ECMWF)"
        }
        icon={<TrendingUp />}
      />
      <div className="space-y-3 p-3 sm:p-4">
        {reaches.length > 1 && (
          <div className="-mx-1 overflow-x-auto px-1">
            <SegmentedControl<ReachKey>
              label="Tramo del río"
              value={reach}
              onChange={setReach}
              options={reaches.map((r) => ({ value: r, label: REACH_LABEL[r] }))}
            />
          </div>
        )}
        {q.isLoading ? (
          <Skeleton className="w-full" style={{ height: height + 70 }} />
        ) : !f ? (
          <div
            className="border-border text-fg-faint grid place-items-center rounded-md border border-dashed p-8 text-center text-xs"
            style={{ height }}
          >
            Pronóstico del INAMHI no disponible en este momento. Se reintenta automáticamente.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-stretch gap-2">
              {st && (
                <div
                  className={cn(
                    "flex min-w-[220px] flex-1 items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold",
                    TONE[st.tone],
                  )}
                >
                  <Waves className="size-4 shrink-0" aria-hidden />
                  {st.text}
                </div>
              )}
              {[
                [
                  "Pico esperado",
                  f.peak ? `${formatNumber(f.peak.avg, 1)} m³/s` : "—",
                  f.peak ? dayHour.format(f.peak.t) : "",
                ],
                [
                  "Escenario extremo",
                  f.extreme ? `${formatNumber(f.extreme.max, 1)} m³/s` : "—",
                  f.extreme ? dayHour.format(f.extreme.t) : "",
                ],
                [
                  "Crecida de 2 años",
                  f.returnPeriods ? `${formatNumber(f.returnPeriods[2], 0)} m³/s` : "—",
                  f.years ? `${f.years} años de registro` : "",
                ],
              ].map(([k, v, sub]) => (
                <div
                  key={k}
                  className="border-border bg-surface-2 min-w-[120px] flex-1 rounded-md border px-3 py-1.5"
                >
                  <div className="text-fg-faint text-[10.5px] font-medium tracking-wide uppercase">{k}</div>
                  <div className="tabular font-mono text-[15px] font-semibold whitespace-nowrap">{v}</div>
                  <div className="text-fg-faint text-[10.5px]">{sub}</div>
                </div>
              ))}
            </div>
            <div
              className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]"
              aria-hidden
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[3px] w-4 rounded bg-[#22d3ee]" />
                Promedio (51 escenarios)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-[#e879f9]" />
                Alta resolución
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm bg-sky-400/45" />
                25–75 %
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm bg-sky-400/15" />
                Rango total
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="bg-fg-faint h-3 w-px" />
                Ahora
              </span>
            </div>
            <ForecastChart f={f} height={height} />
          </>
        )}
        {showWarnings && <WarningsStrip w={q.data?.warnings ?? null} />}
        <p className="text-fg-faint text-[10.5px]">
          Modelo hidrológico global GEOGLOWS (ECMWF) publicado por el INAMHI: 51 escenarios y una corrida de
          alta resolución. Los umbrales de crecida se calculan con la serie simulada desde 1980 (Gumbel). Es
          orientativo y complementa, no reemplaza, la medición en sitio.
        </p>
      </div>
    </Card>
  );
}
