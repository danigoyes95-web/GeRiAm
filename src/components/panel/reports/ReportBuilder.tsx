"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { usePanel } from "@/components/panel/PanelContext";
import { Button } from "@/components/ui/button";
import { SegmentedControl, Select, Skeleton } from "@/components/ui/misc";
import { Logo } from "@/design";
import { LEVELS } from "@/design/levels";
import { isStale, useOrgLive } from "@/lib/data/live";
import { useSeries, type SeriesPoint } from "@/lib/data/series";
import type { Alert, Site } from "@/lib/data/types";
import type { AlertLevel } from "@/lib/domain/types";
import { getBrowserClient } from "@/lib/supabase/browser";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";

type Period = "24" | "168" | "720";
const PERIOD_LABEL: Record<Period, string> = {
  "24": "últimas 24 horas",
  "168": "últimos 7 días",
  "720": "últimos 30 días",
};

const stats = (pts: SeriesPoint[] | undefined) => {
  if (!pts?.length) return null;
  let min = Infinity,
    max = -Infinity,
    sum = 0;
  for (const p of pts) {
    min = Math.min(min, p.min);
    max = Math.max(max, p.max);
    sum += p.value;
  }
  return { min, max, mean: sum / pts.length, first: pts[0].value, last: pts[pts.length - 1].value };
};

function LevelChart({ site, level, rain }: { site: Site; level: SeriesPoint[]; rain: SeriesPoint[] }) {
  const W = 720,
    H = 240,
    L = 54,
    R = 70,
    T = 22,
    B = 70;
  if (!level.length)
    return <p className="py-8 text-center text-sm text-zinc-500">Sin lecturas de nivel en el periodo.</p>;
  const t0 = level[0].ts,
    t1 = level[level.length - 1].ts || t0 + 1;
  const refs = [
    { v: Number(site.cota_cresta), name: "Cresta", c: "#dc2626" },
    { v: Number(site.cota_name), name: "NAME", c: "#ea580c" },
    { v: Number(site.cota_namo), name: "NAMO", c: "#0891b2" },
  ];
  const lo = Math.min(...level.map((p) => p.min)) - 0.3;
  const hi = Math.max(Number(site.cota_cresta), ...level.map((p) => p.max)) + 0.2;
  const x = (ts: number) => L + ((ts - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = level.map((p, i) => `${i ? "L" : "M"}${x(p.ts).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const maxRain = Math.max(1, ...rain.map((p) => p.sum));
  const bw = Math.max(1, ((W - L - R) / Math.max(1, rain.length)) * 0.8);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const tTicks = Array.from({ length: 4 }, (_, i) => t0 + ((t1 - t0) * i) / 3);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Nivel del embalse y lluvia en el periodo"
    >
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e4e4e7" />
          <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#71717a">
            {formatNumber(v, 1)}
          </text>
        </g>
      ))}
      {refs.map((r) => (
        <g key={r.name}>
          <line x1={L} x2={W - R} y1={y(r.v)} y2={y(r.v)} stroke={r.c} strokeDasharray="5 4" />
          <text x={W - R + 4} y={y(r.v) + 3} fontSize="10" fill={r.c}>
            {r.name}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#0f172a" strokeWidth="1.6" />
      {/* lluvia */}
      {rain.map((p) => (
        <rect
          key={p.ts}
          x={x(p.ts) - bw / 2}
          y={H - 30 - (p.sum / maxRain) * 26}
          width={bw}
          height={(p.sum / maxRain) * 26}
          fill="#38bdf8"
        />
      ))}
      <line x1={L} x2={W - R} y1={H - 30} y2={H - 30} stroke="#a1a1aa" />
      <text x={L - 6} y={H - 30} textAnchor="end" fontSize="9" fill="#0284c7">
        lluvia
      </text>
      <text x={L - 6} y={H - 54} textAnchor="end" fontSize="9" fill="#0284c7">
        {formatNumber(maxRain, 1)} mm
      </text>
      {tTicks.map((t) => (
        <text key={t} x={x(t)} y={H - 14} textAnchor="middle" fontSize="10" fill="#71717a">
          {formatDateTime(t).slice(0, 16)}
        </text>
      ))}
      <text x={12} y={10} fontSize="10" fill="#71717a">
        m s. n. m.
      </text>
    </svg>
  );
}

function Kpi({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded border border-zinc-200 p-2.5">
      <div className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">{k}</div>
      <div className="tabular font-mono text-[14px] font-semibold whitespace-nowrap text-zinc-900">{v}</div>
      {sub && <div className="text-[10px] text-zinc-500">{sub}</div>}
    </div>
  );
}

export function ReportBuilder() {
  const panel = usePanel();
  const { data } = useOrgLive();
  const [siteId, setSiteId] = useState<string>("");
  const [period, setPeriod] = useState<Period>("168");
  const site = data?.sites.find((s) => s.id === siteId) ?? data?.sites[0];
  const hours = Number(period);
  const bucket = hours <= 24 ? 900 : 3600;

  const sensorOf = (t: string) =>
    data?.sensors.find(
      (s) =>
        s.site_id === site?.id &&
        s.type === t &&
        !(s.metadata as { downstream_point?: string | null })?.downstream_point,
    );
  const ids = {
    nivel: sensorOf("nivel_radar"),
    rain: sensorOf("pluviometro"),
    qin: sensorOf("caudal_entrada"),
    qout: sensorOf("caudal_salida"),
  };
  const sensorIds = Object.values(ids).flatMap((s) => (s ? [s.id] : []));
  const series = useSeries(sensorIds, hours, bucket, { refetchMs: 300_000 });

  const alerts = useQuery({
    queryKey: ["report-alerts", site?.id, period],
    enabled: !!site,
    queryFn: async () => {
      const from = new Date(Date.now() - hours * 3600_000).toISOString();
      const r = await getBrowserClient()
        .from("alerts")
        .select("*")
        .eq("site_id", site!.id)
        .is("drill_run_id", null)
        .gte("started_at", from)
        .order("started_at", { ascending: false })
        .limit(200);
      if (r.error) throw r.error;
      return r.data as Alert[];
    },
  });

  const s = series.data;
  const get = (k: keyof typeof ids) => (ids[k] ? (s?.[ids[k]!.id] ?? []) : []);
  const nivel = stats(get("nivel"));
  const qin = stats(get("qin"));
  const qout = stats(get("qout"));
  const rainTotal = get("rain").reduce((a, p) => a + p.sum, 0);
  const rainMax = get("rain").reduce((a, p) => Math.max(a, p.sum), 0);
  const now = useNow(60_000);
  const generatedAt = now ? formatDateTime(now) : "—";

  const byLevel = (alerts.data ?? []).reduce<Record<string, number>>(
    (m, a) => ((m[a.level] = (m[a.level] ?? 0) + 1), m),
    {},
  );
  const sensors = data?.sensors.filter((x) => x.site_id === site?.id) ?? [];

  const exportCsv = () => {
    const keys = ["nivel", "rain", "qin", "qout"] as const;
    const rows = new Map<number, (number | null)[]>();
    keys.forEach((k, i) => {
      for (const p of get(k)) {
        const r = rows.get(p.ts) ?? [null, null, null, null];
        r[i] = k === "rain" ? p.sum : p.value;
        rows.set(p.ts, r);
      }
    });
    const fmt = (v: number | null) =>
      v === null ? "" : String(Math.round(v * 1000) / 1000).replace(".", ",");
    const lines = Array.from(rows.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, r]) => [formatDateTime(ts), ...r.map(fmt)].join(";"));
    const csv =
      "﻿" + ["fecha_hora;nivel_m_snm;lluvia_mm;caudal_entrada_L_s;caudal_salida_L_s", ...lines].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `geriam-${site?.code ?? "embalse"}-${hours}h-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="space-y-2 print:hidden">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Reportes</h1>
          <p className="text-fg-muted text-xs">
            Reporte operativo por embalse y periodo. Imprímalo o guárdelo como PDF desde el navegador; los
            datos se descargan en CSV.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <Select
              aria-label="Embalse"
              value={site?.id ?? ""}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-auto"
            >
              {data.sites.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
          <SegmentedControl<Period>
            label="Periodo"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "24", label: "24 h" },
              { value: "168", label: "7 días" },
              { value: "720", label: "30 días" },
            ]}
          />
          <div className="flex gap-2 sm:ml-auto">
            <Button size="sm" variant="primary" onClick={() => window.print()} disabled={!s}>
              <Printer /> Imprimir / PDF
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!s}>
              <Download /> CSV
            </Button>
          </div>
        </div>
      </div>

      {!data || !site ? (
        <Skeleton className="h-[600px]" />
      ) : (
        <article
          id="reporte"
          className="shadow-panel mx-auto max-w-[860px] overflow-hidden rounded-md bg-white p-5 text-zinc-900 sm:p-8 print:max-w-none print:rounded-none print:p-0 print:shadow-none"
        >
          <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-zinc-900 pb-3">
            <div className="[&_.text-fg]:!text-zinc-900 [&_.text-fg-faint]:!text-zinc-500">
              <Logo tagline={panel.branding.tagline} color="#0891b2" />
            </div>
            <div className="text-right text-[11px] leading-snug text-zinc-600">
              <div className="font-semibold text-zinc-900">{panel.branding.entity ?? panel.orgName}</div>
              {panel.branding.unit && <div>{panel.branding.unit}</div>}
              <div>Generado: {generatedAt}</div>
              <div>Por: {panel.name}</div>
            </div>
          </header>

          <h2 className="mt-4 text-xl font-semibold">Reporte operativo · {site.name}</h2>
          <p className="text-xs text-zinc-600">
            Periodo: {PERIOD_LABEL[period]} · {site.river} · Cotas: NAMO{" "}
            {formatNumber(Number(site.cota_namo), 2)} · NAME {formatNumber(Number(site.cota_name), 2)} ·
            Cresta {formatNumber(Number(site.cota_cresta), 2)} m s. n. m.
          </p>

          {series.isLoading ? (
            <Skeleton className="mt-4 h-60 bg-zinc-100" />
          ) : (
            <>
              <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Kpi
                  k="Nivel actual"
                  v={nivel ? `${formatNumber(nivel.last, 2)} m` : "—"}
                  sub={
                    nivel
                      ? `${nivel.last - nivel.first >= 0 ? "+" : ""}${formatNumber(nivel.last - nivel.first, 2)} m en el periodo`
                      : undefined
                  }
                />
                <Kpi
                  k="Nivel mín · máx"
                  v={nivel ? `${formatNumber(nivel.min, 2)}–${formatNumber(nivel.max, 2)}` : "—"}
                  sub={
                    nivel
                      ? `Bajo NAMO: ${formatNumber(Number(site.cota_namo) - nivel.max, 2)} m (máx.)`
                      : undefined
                  }
                />
                <Kpi
                  k="Lluvia acumulada"
                  v={`${formatNumber(rainTotal, 1)} mm`}
                  sub={`Máx. ${formatNumber(rainMax, 1)} mm en ${bucket === 900 ? "15 min" : "1 h"}`}
                />
                <Kpi
                  k="Caudal medio"
                  v={qin ? `${formatNumber(qin.mean, 0)} L/s` : "—"}
                  sub={qout ? `Entrada · salida ${formatNumber(qout.mean, 0)} L/s` : undefined}
                />
              </section>

              <section className="mt-5">
                <h3 className="mb-1 text-sm font-semibold">Nivel del embalse y lluvia</h3>
                <LevelChart site={site} level={get("nivel")} rain={get("rain")} />
              </section>
            </>
          )}

          <section className="mt-5 break-inside-avoid">
            <h3 className="mb-1 text-sm font-semibold">Alertas en el periodo (operación real)</h3>
            <p className="mb-2 text-xs text-zinc-600">
              {alerts.data?.length ?? 0} {alerts.data?.length === 1 ? "alerta" : "alertas"}
              {Object.keys(byLevel).length > 0 &&
                ` · ${(["roja", "naranja", "amarilla"] as const)
                  .filter((l) => byLevel[l])
                  .map((l) => `${byLevel[l]} ${l}`)
                  .join(" · ")}`}
              . Los simulacros no se incluyen.
            </p>
            {alerts.data && alerts.data.length > 0 && (
              <table className="w-full text-left text-[11px]">
                <thead className="border-b border-zinc-300 text-zinc-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Inicio</th>
                    <th className="py-1 pr-2 font-medium">Nivel</th>
                    <th className="py-1 pr-2 font-medium">Descripción</th>
                    <th className="py-1 pr-2 font-medium">Estado</th>
                    <th className="py-1 font-medium">Duración</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {alerts.data.map((a) => (
                    <tr key={a.id}>
                      <td className="tabular py-1 pr-2 font-mono whitespace-nowrap">
                        {formatDateTime(a.started_at).slice(0, 16)}
                      </td>
                      <td className="py-1 pr-2 whitespace-nowrap">
                        {LEVELS[a.level as AlertLevel]?.short ?? a.level}
                      </td>
                      <td className="py-1 pr-2">{a.title}</td>
                      <td className="py-1 pr-2 capitalize">{a.status}</td>
                      <td className="tabular py-1 font-mono whitespace-nowrap">
                        {formatDuration(
                          ((a.resolved_at
                            ? new Date(a.resolved_at).getTime()
                            : now || new Date(a.started_at).getTime()) -
                            new Date(a.started_at).getTime()) /
                            60000,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="mt-5 break-inside-avoid">
            <h3 className="mb-1 text-sm font-semibold">Red de monitoreo</h3>
            <p className="text-xs text-zinc-600">
              {sensors.length} sensores registrados ·{" "}
              {sensors.filter((x) => !isStale(x, now || Date.parse(x.last_reading_at ?? "") || 0)).length}{" "}
              reportando · gateway{" "}
              {data.gateways.find((g) => g.site_id === site.id)?.status === "offline"
                ? "fuera de línea"
                : "en línea"}{" "}
              · enlace satelital Starlink.
            </p>
          </section>

          <footer className="mt-6 border-t border-zinc-200 pt-2 text-[10px] text-zinc-500">
            GeRiAm · Gestión de Riesgos Ambato. Datos de demostración generados por el simulador calibrado con
            la climatología de las estaciones HGPT (2013–2025); no corresponden a mediciones reales de la
            presa.
          </footer>
        </article>
      )}
    </div>
  );
}
