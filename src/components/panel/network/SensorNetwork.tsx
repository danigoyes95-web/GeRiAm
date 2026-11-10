"use client";
import { useMemo, useState } from "react";
import { Battery, BatteryLow, Cpu, RadioTower, Search, Signal, Unplug, Zap } from "lucide-react";
import { BasinMap, type MapSelection } from "@/components/map/BasinMap";
import { usePanel } from "@/components/panel/PanelContext";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Input, Select, Skeleton } from "@/components/ui/misc";
import { SignalBars, StarlinkStatus, StatusBadge } from "@/design";
import { isStale, useOrgLive, useSiteSummaries } from "@/lib/data/live";
import type { Sensor } from "@/lib/data/types";
import { formatAgo, formatDateTime, formatNumber } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { SENSOR_LABEL, type SensorType } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Health = "ok" | "sin_reporte" | "bateria" | "mantenimiento";
type Filter = "todos" | Health;

function healthOf(s: Sensor, now: number): Health {
  if (s.status === "mantenimiento" || s.status === "baja") return "mantenimiento";
  if (isStale(s, now)) return "sin_reporte";
  if (s.battery_pct !== null && Number(s.battery_pct) < 30) return "bateria";
  return "ok";
}

const HEALTH_LABEL: Record<Health, string> = {
  ok: "Reportando",
  sin_reporte: "Sin reporte",
  bateria: "Batería baja",
  mantenimiento: "Mantenimiento",
};

function linkOf(s: Sensor): string {
  const m = (s.metadata ?? {}) as { enlace?: string };
  return m.enlace ?? (s.dev_eui ? "LoRaWAN" : "—");
}

function BatteryBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-fg-faint">—</span>;
  const low = pct < 30;
  return (
    <span className="inline-flex items-center gap-1.5" title={`${formatNumber(pct, 0)} %`}>
      <span className="relative h-2 w-9 overflow-hidden rounded-sm bg-surface-3">
        <span className={cn("absolute inset-y-0 left-0", low ? "bg-lvl-naranja" : "bg-lvl-normal")} style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
      </span>
      <span className={cn("tabular font-mono text-[11px]", low ? "text-lvl-naranja" : "text-fg-muted")}>{formatNumber(pct, 0)} %</span>
    </span>
  );
}

export function SensorNetwork() {
  const panel = usePanel();
  const { data } = useOrgLive();
  const summaries = useSiteSummaries(data);
  const now = useNow(15_000) ?? 0;
  const [siteId, setSiteId] = useState("");
  const [type, setType] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<MapSelection | null>(null);

  const sensors = useMemo(() => data?.sensors ?? [], [data]);
  const withHealth = useMemo(() => sensors.map((s) => ({ s, h: now ? healthOf(s, now) : ("ok" as Health) })), [sensors, now]);
  const counts = useMemo(() => {
    const c = { total: sensors.length, ok: 0, sin_reporte: 0, bateria: 0, mantenimiento: 0 };
    for (const x of withHealth) c[x.h]++;
    return c;
  }, [withHealth, sensors.length]);
  const lora = sensors.filter((s) => s.rssi !== null && linkOf(s) === "LoRaWAN");
  const avgRssi = lora.length ? lora.reduce((a, s) => a + Number(s.rssi), 0) / lora.length : null;
  const avgSnr = lora.length ? lora.reduce((a, s) => a + Number(s.snr ?? 0), 0) / lora.length : null;

  const rows = withHealth
    .filter(({ s, h }) => (!siteId || s.site_id === siteId) && (!type || s.type === type) && (filter === "todos" || h === filter))
    .filter(({ s }) => !q || `${s.code} ${s.name} ${s.dev_eui ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const order: Record<Health, number> = { sin_reporte: 0, bateria: 1, mantenimiento: 2, ok: 3 };
      return order[a.h] - order[b.h] || a.s.code.localeCompare(b.s.code);
    });
  const selectedSensor = sel?.kind === "sensor" ? sel.id : null;

  if (!data) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Red de sensores</h1>
          <p className="text-xs text-fg-muted">
            Nodos LoRaWAN, gateways y enlaces Starlink. Un sensor que no reporta en más de 3 veces su intervalo genera una alerta: un sensor caído también es una alerta.
          </p>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {[
          { k: "Sensores", v: counts.total, sub: `${data.gateways.length} gateways`, icon: Cpu, tone: "" },
          { k: "Reportando", v: counts.ok + counts.bateria, sub: `${formatNumber(((counts.ok + counts.bateria) / Math.max(1, counts.total)) * 100, 0)} % de la red`, icon: Signal, tone: "text-lvl-normal" },
          { k: "Sin reporte", v: counts.sin_reporte, sub: "> 3× su intervalo", icon: Unplug, tone: counts.sin_reporte ? "text-lvl-offline" : "" },
          { k: "Batería baja", v: counts.bateria, sub: "< 30 %", icon: BatteryLow, tone: counts.bateria ? "text-lvl-naranja" : "" },
          { k: "RSSI medio", v: avgRssi === null ? "—" : `${formatNumber(avgRssi, 0)} dBm`, sub: `SNR medio ${formatNumber(avgSnr, 1)} dB`, icon: RadioTower, tone: "" },
          {
            k: "Gateways en línea",
            v: `${data.gateways.filter((g) => g.status !== "offline").length} / ${data.gateways.length}`,
            sub: "backhaul Starlink",
            icon: Zap,
            tone: data.gateways.some((g) => g.status === "offline") ? "text-lvl-roja" : "text-lvl-normal",
          },
        ].map((x) => {
          const Icon = x.icon;
          return (
            <div key={x.k} className="rounded-lg border border-border bg-surface-1 p-3">
              <div className="flex items-center justify-between">
                <span className="label-caps">{x.k}</span>
                <Icon className={cn("size-4 text-fg-faint", x.tone)} aria-hidden />
              </div>
              <div className={cn("tabular mt-1 font-mono text-2xl font-semibold", x.tone)}>{x.v}</div>
              <div className="text-[11px] text-fg-faint">{x.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Gateways + mapa */}
      <div className="grid gap-3 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-3">
          {summaries.map((sm) => {
            const gw = sm.gateway;
            const nodes = sensors.filter((s) => s.gateway_id && s.gateway_id === gw?.id);
            const reporting = nodes.filter((s) => now && !isStale(s, now)).length;
            return (
              <Card key={sm.site.id}>
                <CardHeader
                  title={gw?.name ?? `Gateway ${sm.site.code}`}
                  subtitle={gw ? `EUI ${gw.eui}` : "Sin gateway registrado"}
                  icon={<RadioTower />}
                  actions={
                    <StatusBadge
                      level={!gw || gw.status === "offline" ? "sin_datos" : gw.status === "degradado" ? "amarilla" : "normal"}
                      label={!gw ? "—" : gw.status === "offline" ? "SIN ENLACE" : gw.status === "degradado" ? "DEGRADADO" : "EN LÍNEA"}
                      size="sm"
                    />
                  }
                />
                <CardBody className="space-y-3">
                  <StarlinkStatus name={sm.site.code} info={{ online: sm.linkOnline, latencyMs: sm.starlink?.last_value ?? null }} />
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ["Nodos reportando", `${reporting} / ${nodes.length}`],
                      ["Cobertura LoRa", gw ? `${formatNumber(gw.coverage_radius_m / 1000, 1)} km` : "—"],
                      ["Energía (UPS)", sm.ups?.last_value != null ? `${formatNumber(sm.ups.last_value, 0)} %` : "—"],
                      ["Última conexión", gw?.last_seen_at ? formatAgo(gw.last_seen_at, now || undefined) : "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
                        <dt className="text-fg-faint">{k}</dt>
                        <dd className="tabular mt-0.5 font-mono text-sm font-semibold" suppressHydrationWarning>
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {gw && (
                    <p className="text-[11px] text-fg-faint">
                      {String((gw.metadata as { modelo?: string } | null)?.modelo ?? "")} · {String((gw.metadata as { backhaul?: string } | null)?.backhaul ?? "")}
                    </p>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
        <Card className="relative h-[420px] overflow-hidden xl:h-auto xl:min-h-[460px]">
          <BasinMap
            className="absolute inset-0"
            center={{ ...panel.mapCenter, zoom: panel.mapCenter.zoom + 0.6, pitch: 45 }}
            sites={summaries.map((s) => ({ site: s.site, level: s.level, fillPct: s.fillPct }))}
            gateways={data.gateways}
            sensors={data.sensors}
            showCoverage
            showSensors
            onSelect={setSel}
            selected={sel}
          />
          <div className="pointer-events-none absolute bottom-9 left-3 flex flex-wrap gap-3 rounded-md bg-bg/85 px-3 py-1.5 text-[10.5px] backdrop-blur">
            <span className="inline-flex items-center gap-1 text-accent">
              <span className="size-2 rounded-full bg-accent" /> Reportando
            </span>
            <span className="inline-flex items-center gap-1 text-lvl-offline">
              <span className="size-2 rounded-full bg-lvl-offline" /> Sin reporte
            </span>
            <span className="inline-flex items-center gap-1 text-lvl-offline">
              <span className="size-2 rounded-full border border-lvl-offline" /> Cobertura LoRa
            </span>
          </div>
        </Card>
      </div>

      {/* Inventario */}
      <Card>
        <CardHeader title="Inventario de nodos" subtitle={`${rows.length} de ${sensors.length} sensores · se actualiza en tiempo real`} icon={<Cpu />} />
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-faint" />
            <Input aria-label="Buscar" placeholder="Código, nombre o DevEUI" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-8" />
          </div>
          <Select aria-label="Embalse" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Todos los embalses</option>
            {data.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Tipo" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Todos los tipos</option>
            {Array.from(new Set(sensors.map((s) => s.type))).map((t) => (
              <option key={t} value={t}>
                {SENSOR_LABEL[t as SensorType]}
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Estado">
            {(["todos", "ok", "sin_reporte", "bateria", "mantenimiento"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn("h-8 rounded-md border px-2.5 text-xs font-medium", filter === f ? "border-accent bg-accent-soft text-fg" : "border-border text-fg-muted hover:text-fg")}
              >
                {f === "todos" ? "Todos" : HEALTH_LABEL[f]}
                {f !== "todos" && <span className="tabular ml-1 font-mono text-fg-faint">{counts[f]}</span>}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Ningún sensor con estos filtros" />
        ) : (
          <>
            {/* Tabla (escritorio) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="text-fg-faint">
                  <tr className="border-b border-border">
                    {["Sensor", "Embalse", "Valor", "Enlace / señal", "Batería", "Intervalo", "Último reporte", "Estado"].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ s, h }) => {
                    const site = data.sites.find((x) => x.id === s.site_id);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setSel({ kind: "sensor", id: s.id })}
                        className={cn("cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-2", selectedSensor === s.id && "bg-accent-soft")}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium text-fg">{s.code}</div>
                          <div className="text-[10.5px] text-fg-faint">
                            {SENSOR_LABEL[s.type as SensorType]} · {s.position_label}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-fg-muted">{site?.code}</td>
                        <td className="tabular px-3 py-2 font-mono whitespace-nowrap">
                          {formatNumber(s.last_value, s.decimals)} <span className="text-fg-faint">{s.unit}</span>
                        </td>
                        <td className="px-3 py-2">
                          {linkOf(s) === "LoRaWAN" ? (
                            <div className="flex flex-col gap-0.5">
                              <SignalBars rssi={s.rssi} snr={s.snr} showValues />
                              <span className="font-mono text-[10px] text-fg-faint">{s.dev_eui}</span>
                            </div>
                          ) : (
                            <span className="text-fg-muted">{linkOf(s)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{linkOf(s) === "LoRaWAN" ? <BatteryBar pct={s.battery_pct === null ? null : Number(s.battery_pct)} /> : <span className="inline-flex items-center gap-1 text-fg-faint"><Battery className="size-3.5" /> red / UPS</span>}</td>
                        <td className="tabular px-3 py-2 font-mono text-fg-muted">{s.report_interval_s >= 60 ? `${s.report_interval_s / 60} min` : `${s.report_interval_s} s`}</td>
                        <td className="px-3 py-2 whitespace-nowrap" title={formatDateTime(s.last_reading_at, undefined, true)} suppressHydrationWarning>
                          {formatAgo(s.last_reading_at, now || undefined)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge
                            size="sm"
                            level={h === "ok" ? "normal" : h === "sin_reporte" ? "offline" : h === "bateria" ? "amarilla" : "sin_datos"}
                            label={HEALTH_LABEL[h].toUpperCase()}
                            pulse={h === "sin_reporte"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Tarjetas (móvil) */}
            <ul className="divide-y divide-border md:hidden">
              {rows.map(({ s, h }) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{s.code}</div>
                    <div className="truncate text-[11px] text-fg-faint">{SENSOR_LABEL[s.type as SensorType]}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-fg-muted" suppressHydrationWarning>
                      <span className="tabular whitespace-nowrap font-mono">
                        {formatNumber(s.last_value, s.decimals)} {s.unit}
                      </span>
                      {linkOf(s) === "LoRaWAN" && <SignalBars rssi={s.rssi} snr={s.snr} />}
                      <span className="whitespace-nowrap">{formatAgo(s.last_reading_at, now || undefined)}</span>
                    </div>
                  </div>
                  <StatusBadge size="sm" level={h === "ok" ? "normal" : h === "sin_reporte" ? "offline" : h === "bateria" ? "amarilla" : "sin_datos"} label={HEALTH_LABEL[h].toUpperCase()} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
