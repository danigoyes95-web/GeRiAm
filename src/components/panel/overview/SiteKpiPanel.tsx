"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { KpiTile, StatusBadge } from "@/design";
import { Card } from "@/components/ui/card";
import { formatAgo, formatHm3, formatNumber } from "@/lib/format";
import { isStale, type SiteSummary } from "@/lib/data/live";
import { sensorThresholds } from "@/lib/data/types";
import type { SeriesPoint } from "@/lib/data/series";
import { volumeAt } from "@/lib/hydro/curve";
import { siteCurve } from "@/lib/data/types";
import { useNow } from "@/lib/hooks/useNow";

function deltaOver(series: SeriesPoint[] | undefined, minutes: number): number | null {
  if (!series || series.length < 2) return null;
  const last = series[series.length - 1];
  const target = last.ts - minutes * 60_000;
  const prev = [...series].reverse().find((p) => p.ts <= target);
  return prev ? last.value - prev.value : null;
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
  const vol = nivel?.last_value != null ? volumeAt(siteCurve(site), nivel.last_value) : null;
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="tabular rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-fg-muted">{site.code}</span>
          <h2 className="truncate text-[13.5px] font-semibold">{site.name}</h2>
          <StatusBadge level={level} size="sm" />
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-fg-faint">
          <span suppressHydrationWarning>Act. {formatAgo(nivel?.last_reading_at, now)}</span>
          <Link href={`/panel/embalses/${site.slug}`} className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
            Detalle <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-2.5 lg:grid-cols-3">
        <KpiTile
          label="Nivel"
          value={nivel?.last_value}
          unit="m s. n. m."
          decimals={2}
          delta={d1h}
          deltaLabel="1 h"
          upIsBad
          series={nivelSeries?.map((p) => p.value)}
          threshold={thr?.amarilla}
          thresholdLabel="Amarilla"
          stale={stale(nivel)}
          level={summary.alerts.some((a) => a.sensor_id === nivel?.id) ? level : undefined}
          size="sm"
        />
        <KpiTile
          label="Capacidad"
          value={fillPct}
          unit="%"
          decimals={1}
          delta={null}
          deltaLabel={vol !== null ? formatHm3(vol) : ""}
          series={undefined}
          size="sm"
        />
        <KpiTile
          label="Caudal entrada"
          value={qin?.last_value}
          unit="L/s"
          decimals={0}
          delta={deltaOver(qinSeries, 60)}
          upIsBad
          series={qinSeries?.map((p) => p.value)}
          stale={stale(qin)}
          size="sm"
        />
        <KpiTile
          label="Caudal salida"
          value={qout?.last_value}
          unit="L/s"
          decimals={0}
          delta={deltaOver(qoutSeries, 60)}
          series={qoutSeries?.map((p) => p.value)}
          stale={stale(qout)}
          size="sm"
        />
        <KpiTile label="Lluvia 24 h" value={rain?.h24} unit="mm" decimals={1} delta={rain?.h1 ?? null} deltaLabel="última hora" deltaDecimals={1} upIsBad size="sm" />
        <KpiTile
          label="Tendencia nivel"
          value={d1h === null ? null : d1h * 100}
          unit="cm/h"
          decimals={1}
          delta={deltaOver(nivelSeries, 360) === null ? null : (deltaOver(nivelSeries, 360) as number) * 100}
          deltaLabel="cm en 6 h"
          upIsBad
          size="sm"
        />
      </div>
      <p className="px-3 pb-2 text-[10.5px] text-fg-faint">
        Cotas referenciales · NAMO {formatNumber(Number(site.cota_namo), 1)} · Cresta {formatNumber(Number(site.cota_cresta), 1)} m s. n. m.
      </p>
    </Card>
  );
}
