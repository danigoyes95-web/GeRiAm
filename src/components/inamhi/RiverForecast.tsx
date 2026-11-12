"use client";
import { useMemo, useState } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { CloudLightning, Waves } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { SegmentedControl, Skeleton } from "@/components/ui/misc";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/hooks/useBrowser";
import { useNow } from "@/lib/hooks/useNow";
import { cn } from "@/lib/utils";
import type { ReachKey, RiverForecast as Forecast } from "@/lib/inamhi/geoglows";
import { useInamhi, type InamhiPayload } from "./useInamhi";

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, LegendComponent, CanvasRenderer]);

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

function WarningsStrip({ w }: { w: InamhiPayload["warnings"] }) {
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

type Plain = "tranquilo" | "atencion" | "crecida";

const PLAIN: Record<Plain, { cls: string; dot: string; label: string }> = {
  tranquilo: {
    cls: "border-lvl-normal/40 bg-[var(--lvl-normal-bg)] text-lvl-normal",
    dot: "bg-lvl-normal",
    label: "Normal",
  },
  atencion: {
    cls: "border-lvl-amarilla/40 bg-[var(--lvl-amarilla-bg)] text-lvl-amarilla",
    dot: "bg-lvl-amarilla",
    label: "Atención",
  },
  crecida: {
    cls: "border-lvl-roja/40 bg-[var(--lvl-roja-bg)] text-lvl-roja",
    dot: "bg-lvl-roja",
    label: "Crecida",
  },
};

const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const wday = new Intl.DateTimeFormat("es-EC", { weekday: "short", timeZone: TZ });
const dnum = new Intl.DateTimeFormat("es-EC", { day: "numeric", timeZone: TZ });
const wdayLong = new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", timeZone: TZ });

/** Resumen en lenguaje sencillo: nivel general, día del pico y comparación con una crecida. */
function plainSummary(f: Forecast) {
  const rp2 = f.returnPeriods?.[2] ?? null;
  const peak = f.peak?.avg ?? 0;
  const ext = f.extreme?.max ?? 0;
  const level: Plain =
    rp2 && peak >= rp2 ? "crecida" : rp2 && (ext >= rp2 || peak >= rp2 * 0.6) ? "atencion" : "tranquilo";
  const ratio = rp2 ? peak / rp2 : 0;
  const share =
    ratio < 0.25
      ? "menos de la cuarta parte"
      : ratio < 0.5
        ? "menos de la mitad"
        : ratio < 0.8
          ? "bastante menos"
          : ratio < 1
            ? "casi lo mismo"
            : "más";
  const peakDay = f.peak ? wdayLong.format(f.peak.t) : "";
  const extDay = f.extreme ? wdayLong.format(f.extreme.t) : "";
  const title =
    level === "crecida"
      ? "Se espera que el río crezca"
      : level === "atencion"
        ? "Río normal, con una posibilidad baja de crecida"
        : "Río tranquilo los próximos 15 días";
  const text =
    level === "crecida"
      ? `El pronóstico más probable supera el nivel de crecida el ${peakDay}. Prepare la respuesta.`
      : level === "atencion" && rp2 && ext >= rp2
        ? `Lo más probable es que el río siga normal. Solo en el peor de 51 escenarios llegaría a nivel de crecida (${extDay}).`
        : `Lo más alto que llegaría es ${formatNumber(peak, 0)} m³/s el ${peakDay}: ${share} de lo que se considera una crecida${rp2 ? ` (${formatNumber(rp2, 0)} m³/s)` : ""}.`;
  return { level, title, text, rp2, peak, ext };
}

/** Un día por columna: altura = lo más probable; punto = el peor escenario. */
function days(f: Forecast) {
  const rp2 = f.returnPeriods?.[2] ?? null;
  const map = new Map<string, { t: number; avg: number; max: number }>();
  for (const p of f.series) {
    if (p.avg === null || p.max === null) continue;
    const k = dayKey.format(p.t);
    const d = map.get(k) ?? { t: p.t, avg: 0, max: 0 };
    d.avg = Math.max(d.avg, p.avg);
    d.max = Math.max(d.max, p.max);
    map.set(k, d);
  }
  return [...map.values()].slice(0, 15).map((d) => ({
    ...d,
    level: (rp2 && d.avg >= rp2
      ? "crecida"
      : rp2 && (d.max >= rp2 || d.avg >= rp2 * 0.6)
        ? "atencion"
        : "tranquilo") as Plain,
  }));
}

function PlainWarnings({ w }: { w: InamhiPayload["warnings"] }) {
  if (!w) return null;
  const relevant = w.warnings.filter((x) => x.affects.length > 0);
  if (relevant.length) {
    return (
      <div className="space-y-1.5">
        {relevant.map((x) => (
          <div
            key={x.no + x.start}
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]",
              x.level === "Muy Alto" || x.level === "Crecida" ? PLAIN.crecida.cls : PLAIN.atencion.cls,
            )}
          >
            <CloudLightning className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <b>El INAMHI avisa: {x.type.toLowerCase()}</b>
              {x.level ? ` (nivel ${x.level})` : ""} {x.active ? "hasta el" : "desde el"}{" "}
              {wdayLong.format(Date.parse((x.active ? x.end : x.start) + "-05:00"))}. Afecta a{" "}
              {x.affects.join(", ")}.
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="border-border bg-surface-2 text-fg-muted flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]">
      <CloudLightning className="text-fg-faint mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <b className="text-fg">El INAMHI no tiene avisos de lluvia</b> para las presas ni para Ambato.
        {w.last && (
          <span className="text-fg-faint">
            {" "}
            Último aviso: N° {w.last.no}, del{" "}
            {formatDateTime(Date.parse(w.last.start + "-05:00")).slice(0, 5)} al{" "}
            {formatDateTime(Date.parse(w.last.end + "-05:00")).slice(0, 5)}.
          </span>
        )}
      </span>
    </div>
  );
}

const PLACE: Record<ReachKey, string> = {
  CHQ: "Salida de Chiquiurco",
  MLC: "Salida de Mulacorral",
  CQH: "Salida de Chiquicahua",
  pasa: "En Pasa",
  quisapincha: "En Quisapincha",
  ambato: "En Ambato",
};

/** Pronóstico del río en lenguaje sencillo (INAMHI · GEOGLOWS), con el detalle técnico a un toque. */
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
  const [tech, setTech] = useState(false);
  const q = useInamhi(reach);
  const f = q.data?.forecast ?? null;
  const st = f ? status(f) : null;
  const plain = f ? plainSummary(f) : null;
  const ds = f ? days(f) : [];
  const top = plain ? Math.max(plain.rp2 ?? 0, plain.ext, ...ds.map((d) => d.max)) * 1.05 || 1 : 1;
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader
        title="¿Qué va a pasar con el río?"
        subtitle={
          f
            ? `Pronóstico del INAMHI para los próximos 15 días · actualizado el ${formatDateTime(f.issued + "T12:00:00Z").slice(0, 5)}`
            : "Pronóstico del INAMHI para los próximos 15 días"
        }
        icon={<Waves />}
      />
      <div className="space-y-3 p-3 sm:p-4">
        {reaches.length > 1 && (
          <div className="-mx-1 max-w-full overflow-x-auto px-1">
            <SegmentedControl<ReachKey>
              label="Lugar del río"
              value={reach}
              onChange={setReach}
              options={reaches.map((r) => ({ value: r, label: PLACE[r] }))}
            />
          </div>
        )}
        {q.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !f || !plain ? (
          <div className="border-border text-fg-faint grid h-32 place-items-center rounded-md border border-dashed p-6 text-center text-xs">
            El pronóstico del INAMHI no está disponible en este momento. Se reintenta automáticamente.
          </div>
        ) : (
          <>
            {/* 1. La respuesta en una frase */}
            <div className={cn("rounded-xl border p-3 sm:p-4", PLAIN[plain.level].cls)}>
              <div className="flex items-center gap-2 text-[15px] font-bold sm:text-base">
                <span className={cn("size-2.5 shrink-0 rounded-full", PLAIN[plain.level].dot)} aria-hidden />
                {plain.title}
              </div>
              <p className="text-fg mt-1 text-[13.5px] leading-snug">{plain.text}</p>
            </div>

            {/* 2. Barra: lo más alto esperado vs. nivel de crecida */}
            {plain.rp2 && (
              <div>
                <div className="text-fg-muted mb-1.5 flex flex-wrap justify-between gap-x-3 text-[12px]">
                  <span>
                    Lo más alto que llegaría: <b className="text-fg">{formatNumber(plain.peak, 0)} m³/s</b>
                  </span>
                  <span>
                    Crecida: <b className="text-lvl-roja">{formatNumber(plain.rp2, 0)} m³/s</b>
                  </span>
                </div>
                <div className="bg-surface-3 relative h-3 rounded-full">
                  <div
                    className={cn("absolute inset-y-0 left-0 rounded-full", PLAIN[plain.level].dot)}
                    style={{ width: `${Math.min(100, (plain.peak / top) * 100)}%` }}
                  />
                  <span
                    className="bg-lvl-roja absolute -top-1 h-5 w-0.5 -translate-x-1/2 rounded"
                    style={{ left: `${Math.min(100, (plain.rp2 / top) * 100)}%` }}
                    title="Nivel de crecida"
                  />
                  {plain.ext > plain.peak && (
                    <span
                      className="border-fg-muted absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-transparent"
                      style={{ left: `${Math.min(100, (plain.ext / top) * 100)}%` }}
                      title="Peor escenario"
                    />
                  )}
                </div>
                <div className="text-fg-faint mt-1 text-[11px]">
                  ○ = el peor de los 51 escenarios ({formatNumber(plain.ext, 0)} m³/s)
                </div>
              </div>
            )}

            {/* 3. Los 15 días */}
            <div>
              <div className="text-fg-muted mb-1.5 text-[12px] font-medium">
                Día por día{" "}
                <span className="text-fg-faint font-normal">· la línea roja es el nivel de crecida</span>
              </div>
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex min-w-max gap-1 sm:grid sm:max-w-2xl sm:min-w-0 sm:grid-cols-[repeat(15,minmax(0,1fr))]">
                  {ds.map((d) => (
                    <div
                      key={d.t}
                      className="flex w-7 flex-col items-center gap-0.5 sm:w-auto"
                      title={`${wdayLong.format(d.t)}: hasta ${formatNumber(d.avg, 0)} m³/s (peor escenario ${formatNumber(d.max, 0)})`}
                    >
                      <div className="bg-surface-2 relative flex h-6 w-full items-end overflow-hidden rounded">
                        {plain.rp2 && (
                          <span
                            className="bg-lvl-roja/80 absolute inset-x-0 h-px"
                            style={{ bottom: `${Math.min(100, (plain.rp2 / top) * 100)}%` }}
                            aria-hidden
                          />
                        )}
                        <div
                          className={cn("w-full rounded", PLAIN[d.level].dot)}
                          style={{
                            height: `${Math.max(18, Math.min(100, (d.avg / top) * 100))}%`,
                            opacity: 0.85,
                          }}
                        />
                      </div>
                      <span className="text-fg-muted text-[9.5px] leading-none capitalize">
                        {wday.format(d.t).replace(".", "")}
                      </span>
                      <span className="tabular text-fg text-[10px] leading-none font-semibold">
                        {dnum.format(d.t)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-fg-muted mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {(["tranquilo", "atencion", "crecida"] as Plain[]).map((l) => (
                  <span key={l} className="inline-flex items-center gap-1">
                    <span className={cn("size-2 rounded-full", PLAIN[l].dot)} />
                    {l === "tranquilo"
                      ? "Normal"
                      : l === "atencion"
                        ? "Atención (podría subir)"
                        : "Crecida probable"}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {showWarnings && <PlainWarnings w={q.data?.warnings ?? null} />}

        {f && (
          <div>
            <button
              type="button"
              onClick={() => setTech((v) => !v)}
              aria-expanded={tech}
              className="text-accent hover:bg-accent-soft rounded-md px-2 py-1 text-[12px] font-medium"
            >
              {tech ? "Ocultar gráfico técnico" : "Ver gráfico técnico"}
            </button>
            {tech && (
              <div className="mt-2 space-y-3">
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
                      <div className="text-fg-faint text-[10.5px] font-medium tracking-wide uppercase">
                        {k}
                      </div>
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
                {showWarnings && <WarningsStrip w={q.data?.warnings ?? null} />}
                <p className="text-fg-faint text-[10.5px]">
                  Modelo hidrológico global GEOGLOWS (ECMWF) publicado por el INAMHI: 51 escenarios y una
                  corrida de alta resolución. Umbrales de crecida por periodo de retorno (Gumbel) con la serie
                  simulada desde 1980.
                </p>
              </div>
            )}
          </div>
        )}
        <p className="text-fg-faint text-[11px]">
          Fuente: INAMHI · modelo GEOGLOWS (ECMWF). Es un pronóstico: ayuda a anticipar, no reemplaza a los
          sensores.
        </p>
      </div>
    </Card>
  );
}
