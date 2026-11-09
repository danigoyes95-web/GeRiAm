"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, Droplets, FileText, Gauge, History, MapPin, Mountain, RadioTower, ShieldAlert, Video, Waves } from "lucide-react";
import { AlertCard, GaugeNivel, SignalBars, StatusBadge } from "@/design";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Pill, SegmentedControl, Skeleton } from "@/components/ui/misc";
import { TimeSeriesChart, type ChartLine } from "@/components/charts/TimeSeriesChart";
import { CameraMosaic } from "@/components/cameras/CameraMosaic";
import { ClimateCard, type ClimaView } from "./ClimateCard";
import { usePanel } from "@/components/panel/PanelContext";
import { isStale, useOrgLive, useSiteSummaries } from "@/lib/data/live";
import { useRainTotals, useSeries, type SeriesPoint } from "@/lib/data/series";
import { sensorThresholds, siteCurve, type Sensor } from "@/lib/data/types";
import { getBrowserClient } from "@/lib/supabase/browser";
import { formatAgo, formatDateTime, formatHm3, formatNumber } from "@/lib/format";
import { volumeAt } from "@/lib/hydro/curve";
import { SENSOR_LABEL, type AlertLevel, type SensorType } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Range = "24h" | "7d" | "30d";
const RANGE: Record<Range, { hours: number; bucket: number }> = {
  "24h": { hours: 24, bucket: 600 },
  "7d": { hours: 168, bucket: 3600 },
  "30d": { hours: 720, bucket: 3 * 3600 },
};

const pts = (s: SeriesPoint[] | undefined, f: (p: SeriesPoint) => number = (p) => p.value): [number, number][] => (s ?? []).map((p) => [p.ts, f(p)]);

function thrLines(sensor: Sensor | undefined, decimals = 2): ChartLine[] {
  const t = sensor ? sensorThresholds(sensor) : null;
  if (!t) return [];
  const out: ChartLine[] = [];
  if (t.amarilla !== undefined) out.push({ value: Number(t.amarilla.toFixed(decimals)), label: "Amarilla", color: "#facc15" });
  if (t.naranja !== undefined) out.push({ value: t.naranja, label: "Naranja", color: "#fb923c" });
  if (t.roja !== undefined) out.push({ value: t.roja, label: "Roja", color: "#ef4444" });
  return out;
}

const COLORS = { level: "#22d3ee", qin: "#38bdf8", qout: "#a3e635", rain: "#818cf8", pz1: "#f472b6", pz2: "#fbbf24", as: "#fb923c", inc: "#c084fc", river: "#2dd4bf" };

export function SiteDetail({ slug }: { slug: string }) {
  const panel = usePanel();
  const { data } = useOrgLive();
  const summaries = useSiteSummaries(data);
  const summary = summaries.find((s) => s.site.slug === slug);
  const [range, setRange] = useState<Range>("24h");
  const site = summary?.site;
  const sensors = useMemo(() => (data && site ? data.sensors.filter((s) => s.site_id === site.id) : []), [data, site]);
  const by = (t: SensorType, code?: string) => sensors.find((s) => s.type === t && (!code || s.code.endsWith(code)));
  const nivel = by("nivel_radar");
  const qin = by("caudal_entrada");
  const qout = by("caudal_salida");
  const rainS = by("pluviometro");
  const pz1 = by("piezometro", "PZ-01");
  const pz2 = by("piezometro", "PZ-02");
  const as1 = by("asentamiento");
  const in1 = by("inclinometro");
  const rio = sensors.find((s) => s.type === "nivel_rio" && s.code.startsWith(site?.code ?? "#"));
  const ids = [nivel, qin, qout, rainS, pz1, pz2, as1, in1, rio].filter((s): s is Sensor => !!s).map((s) => s.id);
  const r = RANGE[range];
  const series = useSeries(ids, r.hours, r.bucket);
  const rain = useRainTotals(site ? [site.id] : []);
  const history = useQuery({
    queryKey: ["site-alerts", site?.id],
    enabled: !!site,
    queryFn: async () => {
      const { data: rows } = await getBrowserClient().from("alerts").select("*").eq("site_id", site!.id).order("started_at", { ascending: false }).limit(25);
      return rows ?? [];
    },
  });

  if (!data) return <div className="space-y-3 p-4"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;
  if (!summary || !site) return <EmptyState title="Embalse no encontrado" description="Verifique el enlace." />;

  const S = series.data ?? {};
  const cota = nivel?.last_value ?? null;
  const vol = cota !== null ? volumeAt(siteCurve(site), cota) : null;
  const meta = (site.metadata ?? {}) as { usos?: string[]; fuentes?: string[]; altura_presa_m?: number; tipo_presa?: string; referencial?: boolean; clima?: ClimaView };
  const H = cota !== null ? cota - Number(site.cota_vertedero) : null;
  const q24 = (s: Sensor | undefined) => {
    const arr = s ? (S[s.id] ?? []).filter((p) => p.ts > Date.now() - 86400_000) : [];
    return arr.length ? arr.reduce((a, p) => a + p.value, 0) / arr.length : null;
  };
  const qinAvg = q24(qin);
  const qoutAvg = q24(qout);
  const dV = qinAvg !== null && qoutAvg !== null ? ((qinAvg - qoutAvg) / 1000) * 86400 : null;

  return (
    <div className="space-y-3 p-3 sm:p-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <nav aria-label="Embalses" className="flex gap-1">
            {data.sites.map((s) => (
              <Link
                key={s.id}
                href={`/panel/embalses/${s.slug}`}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium", s.slug === slug ? "bg-accent-soft text-fg" : "text-fg-muted hover:bg-surface-2")}
              >
                {s.name.replace("Embalse ", "")}
              </Link>
            ))}
          </nav>
          <h1 className="text-lg font-semibold tracking-tight">{site.name}</h1>
          <StatusBadge level={summary.level} />
          <Pill>
            <MapPin className="size-3" /> {site.lat.toFixed(5)}, {site.lng.toFixed(5)} {site.coord_verificado ? "· verificado" : ""}
          </Pill>
          <Pill>Fuente: {site.data_source === "simulado" ? "simulación (demo)" : site.data_source}</Pill>
        </div>
        <SegmentedControl label="Rango" value={range} onChange={setRange} options={[{ value: "24h", label: "24 h" }, { value: "7d", label: "7 d" }, { value: "30d", label: "30 d" }]} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* Columna izquierda */}
        <div className="space-y-3">
          <Card>
            <CardHeader title="Vaso del embalse" subtitle="Corte esquemático con cotas de operación" icon={<Waves />} />
            <CardBody>
              <GaugeNivel
                cota={cota}
                fondo={Number(site.cota_fondo)}
                namo={Number(site.cota_namo)}
                name={Number(site.cota_name)}
                vertedero={Number(site.cota_vertedero)}
                cresta={Number(site.cota_cresta)}
                fillPct={summary.fillPct}
                level={summary.level}
              />
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Volumen", vol !== null ? formatHm3(vol) : "—"],
                  ["Capacidad", formatHm3(Number(site.capacity_m3))],
                  ["Carga sobre vertedero", H !== null ? `${H > 0 ? "+" : ""}${formatNumber(H, 2)} m` : "—"],
                  ["Borde libre a cresta", cota !== null ? `${formatNumber(Number(site.cota_cresta) - cota, 2)} m` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
                    <dt className="text-fg-faint">{k}</dt>
                    <dd className="tabular mt-0.5 font-mono text-sm font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Balance hídrico (24 h)" subtitle="ΔV = (Qin − Qout) · Δt" icon={<Droplets />} />
            <CardBody className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Q entrada", qinAvg, "L/s", 0],
                ["Q salida", qoutAvg, "L/s", 0],
                ["ΔV 24 h", dV, "m³", 0],
              ].map(([k, v, u, d]) => (
                <div key={k as string} className="rounded-md border border-border bg-surface-2 p-2">
                  <div className="label-caps">{k}</div>
                  <div className={cn("tabular mt-1 font-mono text-base font-semibold", k === "ΔV 24 h" && (v as number) > 0 && "text-lvl-amarilla")}>
                    {v === null ? "—" : `${(v as number) > 0 && k === "ΔV 24 h" ? "+" : ""}${formatNumber(v as number, d as number)}`}
                  </div>
                  <div className="text-[10px] text-fg-faint">{u}</div>
                </div>
              ))}
              <p className="col-span-3 text-left text-[11px] text-fg-muted">
                Lluvia: <b className="tabular font-mono">{formatNumber(rain.data?.[site.id]?.h1, 1)}</b> mm (1 h) ·{" "}
                <b className="tabular font-mono">{formatNumber(rain.data?.[site.id]?.h24, 1)}</b> mm (24 h) ·{" "}
                <b className="tabular font-mono">{formatNumber(rain.data?.[site.id]?.h72, 1)}</b> mm (72 h)
              </p>
            </CardBody>
          </Card>
          {meta.clima && <ClimateCard clima={meta.clima} />}
          <Card>
            <CardHeader title="Ficha técnica" subtitle={meta.referencial ? "Valores referenciales · a validar con el GPT" : undefined} icon={<FileText />} />
            <CardBody className="space-y-1.5 text-xs">
              {[
                ["Río", site.river],
                ["Altitud", `${formatNumber(Number(site.altitude_m), 0)} m s. n. m.`],
                ["Tipo de presa", meta.tipo_presa ?? "—"],
                ["Altura de presa", meta.altura_presa_m ? `${formatNumber(meta.altura_presa_m, 1)} m` : "—"],
                ["Cotas fondo / NAMO / NAME / cresta", `${formatNumber(Number(site.cota_fondo), 1)} / ${formatNumber(Number(site.cota_namo), 1)} / ${formatNumber(Number(site.cota_name), 1)} / ${formatNumber(Number(site.cota_cresta), 1)}`],
                ["Vertedero (L · C)", `${formatNumber(Number(site.longitud_vertedero), 1)} m · ${formatNumber(Number(site.coeficiente_descarga), 2)}`],
                ["Caudal entrada / salida nominal", `${formatNumber(Number(site.caudal_entrada_base) * 1000, 0)} / ${formatNumber(Number(site.caudal_salida_nominal) * 1000, 0)} L/s`],
                ["Cuenca de aporte", `${formatNumber(Number(site.area_cuenca_km2), 1)} km²`],
                ["Usos", (meta.usos ?? []).join(" · ") || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0">
                  <span className="text-fg-faint">{k}</span>
                  <span className="text-right text-fg">{v}</span>
                </div>
              ))}
              {(meta.fuentes ?? []).map((f) => (
                <p key={f} className="text-[10.5px] text-fg-faint">• {f}</p>
              ))}
            </CardBody>
          </Card>
        </div>

        {/* Columna principal */}
        <div className="min-w-0 space-y-3">
          <Card>
            <CardHeader title="Nivel del embalse" subtitle="m s. n. m. · umbrales y cotas de operación" icon={<Gauge />} />
            <CardBody className="pt-2">
              {series.isLoading ? <Skeleton className="h-[260px]" /> : (
                <TimeSeriesChart
                  ariaLabel={`Nivel de ${site.name}`}
                  axes={[{ name: "m s. n. m.", decimals: 2 }]}
                  series={[{ name: "Nivel", data: pts(nivel ? S[nivel.id] : undefined), color: COLORS.level, area: true, decimals: 2, unit: "m" }]}
                  lines={[...thrLines(nivel), { value: Number(site.cota_cresta), label: "Cresta", color: "#93a3bd", dashed: false }]}
                />
              )}
            </CardBody>
          </Card>
          <div className="grid gap-3 2xl:grid-cols-2">
            <Card>
              <CardHeader title="Caudales y lluvia" subtitle="L/s · mm por intervalo" icon={<Activity />} />
              <CardBody className="pt-2">
                <TimeSeriesChart
                  ariaLabel="Caudales y lluvia"
                  height={230}
                  axes={[{ name: "L/s", decimals: 0, min: 0 }, { name: "mm", decimals: 1, min: 0 }]}
                  series={[
                    { name: "Q entrada", data: pts(qin ? S[qin.id] : undefined), color: COLORS.qin, decimals: 0, unit: "L/s" },
                    { name: "Q salida", data: pts(qout ? S[qout.id] : undefined), color: COLORS.qout, decimals: 0, unit: "L/s" },
                    { name: "Lluvia", data: pts(rainS ? S[rainS.id] : undefined, (p) => p.sum), color: COLORS.rain, type: "bar", axis: 1, decimals: 1, unit: "mm" },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Piezometría" subtitle="Presión de poro (kPa)" icon={<ShieldAlert />} />
              <CardBody className="pt-2">
                <TimeSeriesChart
                  ariaLabel="Piezómetros"
                  height={230}
                  axes={[{ name: "kPa", decimals: 0 }]}
                  series={[
                    { name: "PZ-01 cuerpo", data: pts(pz1 ? S[pz1.id] : undefined), color: COLORS.pz1, decimals: 1, unit: "kPa" },
                    { name: "PZ-02 cimentación", data: pts(pz2 ? S[pz2.id] : undefined), color: COLORS.pz2, decimals: 1, unit: "kPa" },
                  ]}
                  lines={thrLines(pz1, 0).slice(0, 1)}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Estructura" subtitle="Asentamiento de cresta e inclinómetro (mm)" icon={<Mountain />} />
              <CardBody className="pt-2">
                <TimeSeriesChart
                  ariaLabel="Asentamiento e inclinación"
                  height={230}
                  axes={[{ name: "asent. mm", decimals: 2 }, { name: "incl. mm", decimals: 2 }]}
                  series={[
                    { name: "Asentamiento", data: pts(as1 ? S[as1.id] : undefined), color: COLORS.as, decimals: 2, unit: "mm" },
                    { name: "Inclinómetro", data: pts(in1 ? S[in1.id] : undefined), color: COLORS.inc, axis: 1, decimals: 2, unit: "mm" },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Río al pie de presa" subtitle="Nivel (m) · descarga aguas abajo" icon={<Waves />} />
              <CardBody className="pt-2">
                <TimeSeriesChart
                  ariaLabel="Nivel de río"
                  height={230}
                  axes={[{ name: "m", decimals: 2, min: 0 }]}
                  series={[{ name: "Nivel de río", data: pts(rio ? S[rio.id] : undefined), color: COLORS.river, area: true, decimals: 2, unit: "m" }]}
                  lines={thrLines(rio)}
                />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Sensores del sitio" subtitle={`${sensors.length} nodos · LoRaWAN vía gateway + Starlink`} icon={<RadioTower />} />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-fg-faint">
                    <tr className="border-b border-border">
                      {["Sensor", "Valor", "Señal", "Batería", "Último reporte"].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensors.map((s) => {
                      const stale = isStale(s);
                      return (
                        <tr key={s.id} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-1.5">
                            <div className="font-medium text-fg">{s.code}</div>
                            <div className="text-[10.5px] text-fg-faint">{SENSOR_LABEL[s.type as SensorType]}</div>
                          </td>
                          <td className="tabular px-3 py-1.5 font-mono">{formatNumber(s.last_value, s.decimals)} <span className="text-fg-faint">{s.unit}</span></td>
                          <td className="px-3 py-1.5">{s.dev_eui ? <SignalBars rssi={s.rssi} snr={s.snr} /> : <span className="text-fg-faint">—</span>}</td>
                          <td className={cn("tabular px-3 py-1.5 font-mono", Number(s.battery_pct) < 30 && "text-lvl-naranja")}>{formatNumber(s.battery_pct, 0)} %</td>
                          <td className="px-3 py-1.5">
                            {stale ? <StatusBadge level="offline" size="sm" label={formatAgo(s.last_reading_at)} /> : <span className="text-fg-muted">{formatAgo(s.last_reading_at)}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="space-y-3">
              <Card>
                <CardHeader title="Cámaras del sitio" icon={<Video />} />
                <div className="p-2">
                  <CameraMosaic
                    cameras={data.cameras.filter((c) => c.site_id === site.id)}
                    sites={data.sites}
                    entity={panel.branding.entity ?? panel.orgName}
                    linkOnline={() => summary.linkOnline}
                    cols={2}
                  />
                </div>
              </Card>
              <Card>
                <CardHeader title="Histórico de alertas" subtitle="Últimas 25" icon={<History />} />
                <div className="scrollbar-thin max-h-80 space-y-2 overflow-y-auto p-3">
                  {history.data?.length ? (
                    history.data.map((a) => (
                      <AlertCard key={a.id} compact level={a.level as AlertLevel} title={a.title} status={a.status} startedAt={a.started_at} isDrill={!!a.drill_run_id} footer={<span className="text-[10.5px] text-fg-faint">{formatDateTime(a.started_at)}{a.resolved_at ? ` → ${formatDateTime(a.resolved_at)}` : ""}</span>} />
                    ))
                  ) : (
                    <EmptyState title="Sin alertas registradas" description="El histórico aparecerá aquí." />
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
