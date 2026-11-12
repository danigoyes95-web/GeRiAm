"use client";
import { useMemo, useState } from "react";
import { Layers, Mountain, Navigation, RadioTower, Video } from "lucide-react";
import { BasinMap, type MapSelection } from "@/components/map/BasinMap";
import { DrillChip, DrillHud, useDrillScene } from "@/components/drill/DrillEffects";
import { RiverForecast } from "@/components/inamhi/RiverForecast";
import { usePanel } from "@/components/panel/PanelContext";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { CameraMosaic } from "@/components/cameras/CameraMosaic";
import { LEVELS } from "@/design/levels";
import { useOrgLive, useSiteSummaries } from "@/lib/data/live";
import { useRainTotals, useSeries } from "@/lib/data/series";
import { AlertsColumn } from "./AlertsColumn";
import { SiteKpiPanel } from "./SiteKpiPanel";
import { MapDetail } from "./MapDetail";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorScreen } from "@/components/ErrorScreen";

const LEGEND = ["normal", "amarilla", "naranja", "roja", "sin_datos", "offline"] as const;

export function Overview() {
  const panel = usePanel();
  const { data, isError, refetch } = useOrgLive();
  const summaries = useSiteSummaries(data);
  const [sel, setSel] = useState<MapSelection | null>(null);
  const scene = useDrillScene();
  const [flight, setFlight] = useState<{
    target: "cuenca" | "ambato" | "site";
    siteId?: string;
    nonce: number;
  } | null>(null);
  const [coverage, setCoverage] = useState(true);
  const [showSensors, setShowSensors] = useState(true);

  const keySensorIds = useMemo(
    () => summaries.flatMap((s) => [s.nivel?.id, s.qin?.id, s.qout?.id]).filter((x): x is string => !!x),
    [summaries],
  );
  const series = useSeries(keySensorIds, 24, 1800);
  const rain = useRainTotals(summaries.map((s) => s.site.id));

  const mapSites = useMemo(
    () => summaries.map((s) => ({ site: s.site, level: s.level, fillPct: s.fillPct })),
    [summaries],
  );
  const mosaic = useMemo(() => {
    if (!data) return [];
    const bySite = data.sites.map((s) => data.cameras.filter((c) => c.site_id === s.id).slice(0, 2));
    return bySite.flat().slice(0, 4);
  }, [data]);

  if (isError) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <div className="panel max-w-md p-6 text-center">
          <p className="font-semibold">No se pudo cargar el estado en vivo</p>
          <p className="text-fg-muted mt-1 text-sm">
            Verifique la conexión. El sistema reintentará automáticamente.
          </p>
          <Button className="mt-4" onClick={() => refetch()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-3">
      {/* Fila superior: mapa + alertas */}
      <div className="grid gap-3 xl:h-[clamp(440px,calc(100dvh-28rem),900px)] xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="relative h-[60vh] min-h-[380px] overflow-hidden xl:h-auto xl:min-h-0">
          {data ? (
            <ErrorBoundary
              fallback={(e, reset) => (
                <div className="absolute inset-0">
                  <ErrorScreen compact error={e} reset={reset} />
                </div>
              )}
            >
              <BasinMap
                className="absolute inset-0"
                center={panel.mapCenter}
                sites={mapSites}
                gateways={data.gateways}
                sensors={data.sensors}
                cameras={data.cameras}
                points={data.points}
                showCoverage={coverage}
                showSensors={showSensors}
                onSelect={setSel}
                selected={sel}
                flight={flight}
                scene={scene}
              />
            </ErrorBoundary>
          ) : (
            <Skeleton className="absolute inset-0 rounded-none" />
          )}
          {/* controles (durante un simulacro, el tablero del simulacro ocupa su lugar) */}
          {scene ? (
            <>
              {/* en celular el tablero completo va debajo del mapa; sobre el mapa, solo una franja */}
              <DrillHud scene={scene} className="absolute top-3 left-3 hidden sm:block" />
              <DrillChip scene={scene} className="absolute top-2 right-14 left-2 sm:hidden" />
            </>
          ) : (
            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                className="bg-bg/80 backdrop-blur"
                onClick={() => setFlight({ target: "cuenca", nonce: Date.now() })}
              >
                <Mountain /> Cuenca alta
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="bg-bg/80 backdrop-blur"
                onClick={() => setFlight({ target: "ambato", nonce: Date.now() })}
              >
                <Navigation /> Seguir cauce a Ambato
              </Button>
            </div>
          )}
          <div className="absolute bottom-9 left-3 flex flex-col gap-2">
            {sel && data && (
              <MapDetail
                sel={sel}
                data={data}
                summaries={summaries}
                entity={panel.branding.entity ?? panel.orgName}
                onClose={() => setSel(null)}
              />
            )}
            <div className="panel bg-bg/85 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 backdrop-blur">
              {LEGEND.map((l) => {
                const Icon = LEVELS[l].icon;
                return (
                  <span
                    key={l}
                    className={cn("inline-flex items-center gap-1 text-[10.5px] font-medium", LEVELS[l].text)}
                  >
                    <Icon className="size-3" aria-hidden /> {LEVELS[l].label.replace("Alerta ", "")}
                  </span>
                );
              })}
              <span className="bg-border h-3 w-px" aria-hidden />
              <button
                type="button"
                onClick={() => setCoverage((v) => !v)}
                aria-pressed={coverage}
                className={cn(
                  "inline-flex items-center gap-1 text-[10.5px] font-medium",
                  coverage ? "text-lvl-offline" : "text-fg-faint",
                )}
              >
                <RadioTower className="size-3" /> Cobertura LoRa
              </button>
              <button
                type="button"
                onClick={() => setShowSensors((v) => !v)}
                aria-pressed={showSensors}
                className={cn(
                  "inline-flex items-center gap-1 text-[10.5px] font-medium",
                  showSensors ? "text-accent" : "text-fg-faint",
                )}
              >
                <Layers className="size-3" /> Sensores
              </button>
            </div>
          </div>
        </Card>
        {scene && <DrillHud scene={scene} className="w-full sm:hidden" />}
        <AlertsColumn
          data={data}
          role={panel.role}
          className="flex min-h-[320px] flex-col overflow-hidden xl:min-h-0"
        />
      </div>

      {/* Pronóstico del río (INAMHI · GEOGLOWS) en lenguaje sencillo, justo debajo del mapa */}
      <RiverForecast reaches={["ambato", "pasa", "CHQ", "MLC"]} showWarnings />

      {/* Fila inferior: KPIs por embalse + cámaras */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        {data
          ? summaries.map((s) => (
              <SiteKpiPanel key={s.site.id} summary={s} series={series.data} rain={rain.data?.[s.site.id]} />
            ))
          : Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-[300px]" />)}
        <Card className="overflow-hidden">
          <CardHeader title="Cámaras en vivo" subtitle="Cortinas y vertederos" icon={<Video />} />
          <div className="p-2">
            {data ? (
              <CameraMosaic
                cameras={mosaic}
                sites={data.sites}
                entity={panel.branding.entity ?? panel.orgName}
                linkOnline={(id) => summaries.find((s) => s.site.id === id)?.linkOnline ?? true}
                compact
              />
            ) : (
              <Skeleton className="aspect-video w-full" />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
