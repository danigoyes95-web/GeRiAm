"use client";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, CloudOff, Minus, Siren } from "lucide-react";
import { RiverForecast } from "@/components/inamhi/RiverForecast";
import { StatusBadge } from "@/design";
import { LEVELS } from "@/design/levels";
import { Skeleton } from "@/components/ui/misc";
import { AlertCountdown } from "@/components/alerts/AlertCountdown";
import { useCachedLive } from "@/components/app/useCachedLive";
import { useApp } from "@/components/app/AppContext";
import { sortAlerts, useSiteSummaries } from "@/lib/data/live";
import { useSeries } from "@/lib/data/series";
import { alertEta } from "@/lib/data/types";
import { formatAgo, formatNumber } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import type { AlertLevel } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export default function AppHome() {
  const app = useApp();
  const { data, fromCache, cachedAt, isLoading } = useCachedLive();
  const summaries = useSiteSummaries(data);
  const now = useNow(15_000) ?? undefined;
  const nivelIds = summaries.map((s) => s.nivel?.id).filter((x): x is string => !!x);
  const series = useSeries(nivelIds, 3, 600, { enabled: !fromCache });
  const alerts = sortAlerts(data?.alerts ?? []);
  const top = alerts[0];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-fg-muted text-sm">Hola, {app.name.split(" ")[0]}</p>
        <h1 className="text-xl font-semibold tracking-tight">Estado de los embalses</h1>
      </div>

      <RiverForecast reaches={["ambato", "pasa"]} showWarnings />

      {fromCache && (
        <div
          role="status"
          className="border-lvl-offline/40 text-lvl-offline flex items-start gap-2 rounded-lg border bg-[var(--lvl-offline-bg)] p-3 text-sm"
        >
          <CloudOff className="mt-0.5 size-4 shrink-0" />
          <span>
            Sin conexión. Mostrando el último estado guardado{" "}
            <b suppressHydrationWarning>{formatAgo(cachedAt, now)}</b>.
          </span>
        </div>
      )}

      {top && (
        <Link
          href={`/app/alertas/${top.id}`}
          className={cn(
            "block rounded-xl border p-4",
            LEVELS[top.level as AlertLevel].border,
            LEVELS[top.level as AlertLevel].bg,
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <StatusBadge level={top.level as AlertLevel} size="md" />
            <span className="text-fg-muted inline-flex items-center gap-1 text-xs font-medium">
              {alerts.length > 1 ? `${alerts.length} alertas` : "Ver alerta"}{" "}
              <ChevronRight className="size-4" />
            </span>
          </div>
          <p className="mt-2 leading-snug font-semibold">{top.title}</p>
          {top.drill_run_id && (
            <p className="text-lvl-amarilla mt-1 text-[11px] font-bold tracking-wide">SIMULACRO</p>
          )}
          {alertEta(top).length > 0 && (
            <div className="mt-3">
              <AlertCountdown alert={top} drill={data?.drill} size="md" />
            </div>
          )}
        </Link>
      )}

      {isLoading && !data && (
        <>
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </>
      )}

      {summaries.map((s) => {
        const pts = s.nivel ? series.data?.[s.nivel.id] : undefined;
        const d = pts && pts.length > 1 ? pts[pts.length - 1].value - pts[0].value : null;
        const TrendIcon = d === null || Math.abs(d) < 0.005 ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight;
        const meta = LEVELS[s.level];
        const pct = s.fillPct ?? 0;
        return (
          <article
            key={s.site.id}
            className={cn(
              "bg-surface-1 overflow-hidden rounded-xl border",
              s.level === "normal" ? "border-border" : meta.border,
            )}
          >
            <div className="flex items-center justify-between gap-2 p-4 pb-3">
              <div>
                <h2 className="text-lg font-semibold">{s.site.name.replace("Embalse ", "")}</h2>
                <p className="text-fg-faint text-xs" suppressHydrationWarning>
                  Actualizado {formatAgo(s.nivel?.last_reading_at, now)}
                </p>
              </div>
              <StatusBadge level={s.level} size="lg" />
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 pb-4">
              <div>
                <div className="label-caps">Llenado</div>
                <div className="tabular font-mono text-3xl font-semibold">
                  {formatNumber(s.fillPct, 0)}
                  <span className="text-fg-faint text-base">%</span>
                </div>
              </div>
              <div>
                <div className="label-caps">Nivel</div>
                <div className="tabular mt-1.5 font-mono text-base font-semibold">
                  {formatNumber(s.nivel?.last_value, 2)}
                </div>
                <div className="text-fg-faint text-[10px]">m s. n. m.</div>
              </div>
              <div>
                <div className="label-caps">Tendencia 3 h</div>
                <div
                  className={cn(
                    "tabular mt-1.5 inline-flex items-center gap-0.5 font-mono text-base font-semibold",
                    d !== null && d > 0.02 ? "text-lvl-naranja" : "text-fg",
                  )}
                >
                  <TrendIcon className="size-4" />
                  {d === null ? "—" : `${d > 0 ? "+" : ""}${formatNumber(d * 100, 0)} cm`}
                </div>
              </div>
            </div>
            <div className="bg-surface-3 h-2" aria-hidden>
              <div
                className="h-full transition-[width] duration-700"
                style={{
                  width: `${Math.min(100, pct)}%`,
                  background: s.level === "normal" ? "var(--accent)" : meta.cssVar,
                }}
              />
            </div>
            <div className="text-fg-muted flex items-center justify-between gap-2 px-4 py-2.5 text-xs">
              <span>
                Entrada <b className="tabular text-fg font-mono">{formatNumber(s.qin?.last_value, 0)}</b> L/s
                · Salida <b className="tabular text-fg font-mono">{formatNumber(s.qout?.last_value, 0)}</b>{" "}
                L/s
              </span>
              {!s.linkOnline && <span className="text-lvl-roja font-semibold">Sin enlace</span>}
            </div>
          </article>
        );
      })}

      {data && alerts.length === 0 && (
        <p className="border-border bg-surface-1 text-fg-muted rounded-lg border p-3 text-center text-sm">
          Sin alertas activas en sus zonas.
        </p>
      )}
      {data?.drill && (
        <p className="text-lvl-amarilla flex items-center justify-center gap-1.5 text-xs">
          <Siren className="size-3.5" /> Hay un simulacro en curso
        </p>
      )}
    </div>
  );
}
