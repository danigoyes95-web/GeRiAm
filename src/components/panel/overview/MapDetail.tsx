"use client";
import Link from "next/link";
import { X, ArrowUpRight, Battery, Users, Timer } from "lucide-react";
import { SignalBars, StatusBadge, StarlinkStatus, CameraTile } from "@/design";
import { Button } from "@/components/ui/button";
import { formatAgo, formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { isStale, type OrgLive, type SiteSummary } from "@/lib/data/live";
import { SENSOR_LABEL, type SensorType } from "@/lib/domain/types";
import type { MapSelection } from "@/components/map/BasinMap";

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-fg-faint">{k}</span>
      <span className="tabular text-right font-mono text-fg">{v}</span>
    </div>
  );
}

export function MapDetail({ sel, data, summaries, entity, onClose }: { sel: MapSelection; data: OrgLive; summaries: SiteSummary[]; entity: string; onClose: () => void }) {
  let title = "";
  let body: React.ReactNode = null;
  if (sel.kind === "site") {
    const s = summaries.find((x) => x.site.id === sel.id);
    if (!s) return null;
    title = s.site.name;
    body = (
      <>
        <div className="mb-2 flex items-center gap-2">
          <StatusBadge level={s.level} size="sm" />
          <span className="text-[11px] text-fg-faint">{s.site.river}</span>
        </div>
        <Row k="Nivel" v={`${formatNumber(s.nivel?.last_value, 2)} m s. n. m.`} />
        <Row k="Llenado" v={`${formatNumber(s.fillPct, 1)} %`} />
        <Row k="Q entrada / salida" v={`${formatNumber(s.qin?.last_value, 0)} / ${formatNumber(s.qout?.last_value, 0)} L/s`} />
        <Row k="Altitud" v={`${formatNumber(Number(s.site.altitude_m), 0)} m s. n. m.`} />
        <Row k="Coordenadas" v={`${s.site.lat.toFixed(5)}, ${s.site.lng.toFixed(5)}${s.site.coord_verificado ? " ✓" : ""}`} />
        <Row k="Alertas abiertas" v={s.alerts.length} />
        <Button asChild size="sm" variant="secondary" className="mt-2 w-full">
          <Link href={`/panel/embalses/${s.site.slug}`}>
            Ver detalle del embalse <ArrowUpRight />
          </Link>
        </Button>
      </>
    );
  } else if (sel.kind === "gateway") {
    const g = data.gateways.find((x) => x.id === sel.id);
    if (!g) return null;
    const stl = data.sensors.find((s) => s.site_id === g.site_id && s.type === "starlink");
    const nodes = data.sensors.filter((s) => s.gateway_id === g.id);
    title = g.name;
    body = (
      <>
        <StarlinkStatus name={data.sites.find((s) => s.id === g.site_id)?.code ?? ""} info={{ online: g.status !== "offline", latencyMs: stl?.last_value ?? null }} className="mb-2" />
        <Row k="EUI" v={g.eui} />
        <Row k="Cobertura LoRa" v={`${formatNumber(g.coverage_radius_m / 1000, 1)} km`} />
        <Row k="Nodos asociados" v={`${nodes.filter((n) => !isStale(n)).length} / ${nodes.length} reportando`} />
        <Row k="Última conexión" v={formatAgo(g.last_seen_at)} />
      </>
    );
  } else if (sel.kind === "sensor") {
    const s = data.sensors.find((x) => x.id === sel.id);
    if (!s) return null;
    const stale = isStale(s);
    title = s.name;
    body = (
      <>
        <div className="mb-2 flex items-center gap-2">
          <StatusBadge level={stale ? "offline" : "normal"} size="sm" label={stale ? "SIN REPORTE" : "REPORTANDO"} />
          <span className="text-[11px] text-fg-faint">{SENSOR_LABEL[s.type as SensorType]}</span>
        </div>
        <Row k="Valor" v={`${formatNumber(s.last_value, s.decimals)} ${s.unit}`} />
        <Row k="Último reporte" v={formatDateTime(s.last_reading_at, undefined, true)} />
        <Row k="Intervalo" v={`${s.report_interval_s} s`} />
        <Row k="Enlace" v={<SignalBars rssi={s.rssi} snr={s.snr} showValues />} />
        <Row k={<span className="inline-flex items-center gap-1"><Battery className="size-3" /> Batería</span>} v={`${formatNumber(s.battery_pct, 0)} %`} />
        <Row k="Código / DevEUI" v={`${s.code}${s.dev_eui ? ` · ${s.dev_eui}` : ""}`} />
      </>
    );
  } else if (sel.kind === "camera") {
    const c = data.cameras.find((x) => x.id === sel.id);
    if (!c) return null;
    const site = data.sites.find((s) => s.id === c.site_id);
    title = `${c.code} · ${c.name}`;
    body = (
      <CameraTile code={c.code} name={c.name} siteName={site?.name.replace("Embalse ", "") ?? ""} entity={entity} streamUrl={c.stream_url} demoClip={c.demo_clip} online={c.status === "online"} />
    );
  } else {
    const p = data.points.find((x) => x.id === sel.id);
    if (!p) return null;
    const routes = data.routes.filter((r) => r.point_id === p.id);
    title = `Punto de control · ${p.name}`;
    body = (
      <>
        <Row k={<span className="inline-flex items-center gap-1"><Users className="size-3" /> Población expuesta</span>} v={`${formatNumber(p.poblacion_expuesta, 0)} hab. (ref.)`} />
        {routes.map((r) => {
          const s = data.sites.find((x) => x.id === r.site_id);
          return (
            <Row
              key={r.site_id}
              k={<span className="inline-flex items-center gap-1"><Timer className="size-3" /> Desde {s?.code}</span>}
              v={`rotura ${formatDuration(r.tiempo_llegada_min)} · crecida ${formatDuration(r.tiempo_transito_normal_min)}`}
            />
          );
        })}
        <p className="mt-1 text-[10.5px] text-fg-faint">{p.verificado ? "Coordenadas verificadas" : "Coordenadas aproximadas (por verificar)"}</p>
      </>
    );
  }
  return (
    <div className="panel w-[320px] max-w-[calc(100vw-2rem)] p-3 shadow-2xl">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-tight">{title}</h3>
        <button type="button" onClick={onClose} className="rounded p-0.5 text-fg-faint hover:bg-surface-2 hover:text-fg" aria-label="Cerrar detalle">
          <X className="size-4" />
        </button>
      </div>
      {body}
    </div>
  );
}
