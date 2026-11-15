"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CloudLightning,
  FastForward,
  Flag,
  Waves,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  SatelliteDish,
  ShieldAlert,
  Siren,
  Square,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { AlertCard, GaugeNivel, StatusBadge } from "@/design";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, SegmentedControl, Select } from "@/components/ui/misc";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { AlertCountdown } from "@/components/alerts/AlertCountdown";
import { AlertActions } from "@/components/alerts/AlertActions";
import { NotificationLog } from "@/components/alerts/NotificationLog";
import { usePanel } from "@/components/panel/PanelContext";
import { ORG_LIVE_KEY, refreshDrill, sortAlerts, useOrgLive, useSiteSummaries } from "@/lib/data/live";
import { useDrillSeries } from "@/lib/data/series";
import { getBrowserClient } from "@/lib/supabase/browser";
import { ROTURA_STAGGER, SCENARIOS, SCENARIO_LIST, type ScenarioId } from "@/lib/sim/scenarios";
import { formatDuration, formatNumber } from "@/lib/format";
import type { AlertLevel, SensorType } from "@/lib/domain/types";
import type { DrillRun } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { useDrillScene } from "@/components/drill/DrillEffects";
import { drillSites } from "@/lib/drill/scene";
import { DEBRIS, type Debris } from "@/lib/flood/impact";
import { useDamInputs, useFloodData, useImpact } from "@/lib/flood/useImpact";
import { HazardLegend, ZoneRanking } from "@/components/panel/impact/ImpactExplorer";
import { levelFor } from "@/lib/alerts/engine";

const ICON: Record<ScenarioId, LucideIcon> = {
  tormenta: CloudLightning,
  estructural: ShieldAlert,
  comunicacion: SatelliteDish,
  rotura: Waves,
};
const DEFAULT_SITE: Record<ScenarioId, string> = {
  tormenta: "chiquiurco",
  estructural: "mulacorral",
  comunicacion: "chiquiurco",
  rotura: "chiquiurco",
};

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string; drill?: DrillRun | null };
  if (!res.ok) throw new Error(j.error ?? "Error");
  return j;
}

function simClock(min: number) {
  const m = Math.max(0, Math.floor(min));
  return `T+${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function DrillConsole() {
  const panel = usePanel();
  const qc = useQueryClient();
  const { data } = useOrgLive();
  const summaries = useSiteSummaries(data);
  const drill = data?.drill ?? null;
  const canRun = panel.role === "admin" || panel.role === "operador";

  // ── Conductor: avanza el simulacro cada 3 s mientras la página está abierta
  const stepping = useRef(false);
  useEffect(() => {
    if (!drill || drill.status !== "activo" || !canRun) return;
    const t = setInterval(async () => {
      if (stepping.current) return;
      stepping.current = true;
      try {
        const r = await post("/api/simulacro/step", { drill_id: drill.id });
        if (r.drill)
          qc.setQueryData(ORG_LIVE_KEY, (d: typeof data) =>
            d ? { ...d, drill: r.drill?.status === "finalizado" ? null : (r.drill ?? null) } : d,
          );
      } catch {
        /* reintenta en el próximo ciclo */
      } finally {
        stepping.current = false;
      }
    }, 3000);
    return () => clearInterval(t);
  }, [drill, canRun, qc]);

  if (!data) return <div className="text-fg-muted p-6 text-sm">Cargando…</div>;
  if (drill && !SCENARIOS[drill.scenario as ScenarioId]) {
    void refreshDrill(qc);
    return <div className="text-fg-muted p-6 text-sm">Sincronizando simulacro…</div>;
  }
  return drill ? (
    <Active drill={drill} summaries={summaries} canRun={canRun} />
  ) : (
    <Picker
      sites={data.sites}
      canRun={canRun}
      onStarted={() => qc.invalidateQueries({ queryKey: ORG_LIVE_KEY })}
    />
  );
}

function Picker({
  sites,
  canRun,
  onStarted,
}: {
  sites: { id: string; slug: string; name: string }[];
  canRun: boolean;
  onStarted: () => void;
}) {
  const [scenario, setScenario] = useState<ScenarioId>("tormenta");
  const [siteSlug, setSiteSlug] = useState(DEFAULT_SITE.tormenta);
  const [speed, setSpeed] = useState<"30" | "60">("60");
  const [busy, setBusy] = useState(false);
  // rotura: presas que fallan, en orden (la primera falla primero; las demás, desfasadas)
  const [broken, setBroken] = useState<string[]>(["chiquiurco", "mulacorral"]);
  const [debris, setDebris] = useState<Debris>("moderado");
  const def = SCENARIOS[scenario];
  const multi = !!def.multiSite;
  const chosen = multi
    ? broken.map((slug) => sites.find((s) => s.slug === slug)).filter((s): s is (typeof sites)[number] => !!s)
    : [];
  const site = multi ? chosen[0] : (sites.find((s) => s.slug === siteSlug) ?? sites[0]);
  const toggle = (slug: string) =>
    setBroken((b) => (b.includes(slug) ? b.filter((x) => x !== slug) : [...b, slug]));
  const where = multi ? chosen.map((s) => s.name.replace("Embalse ", "")).join(" + ") : site?.name;
  const start = async () => {
    if (!site) return;
    if (
      !window.confirm(
        `¿Iniciar el simulacro "${def.title}" en ${where}?\n\nSe mostrará el banner "SIMULACRO — no es una emergencia real" en todas las superficies y se enviarán notificaciones de prueba.`,
      )
    )
      return;
    setBusy(true);
    try {
      await post("/api/simulacro/start", {
        site_id: site.id,
        scenario,
        speed: Number(speed),
        extra_site_ids: multi ? chosen.slice(1).map((s) => s.id) : [],
        debris,
      });
      toast.success("Simulacro iniciado", { description: def.title });
      onStarted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo iniciar");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header>
        <p className="label-caps text-accent">Modo simulacro</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Ejercicios de respuesta con datos simulados
        </h1>
        <p className="text-fg-muted mt-1 max-w-3xl text-sm">
          Cada escenario acelera el tiempo (×30 / ×60) sobre una copia del estado real del embalse. Se
          disparan las reglas reales, se crean alertas, se envían notificaciones de prueba, todo aparece en la
          app móvil en tiempo real y queda en la bitácora. Al finalizar, el estado físico real se restaura.
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Escenario">
        {SCENARIO_LIST.map((s) => {
          const Icon = ICON[s.id];
          const on = s.id === scenario;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setScenario(s.id);
                setSiteSlug(DEFAULT_SITE[s.id]);
              }}
              className={cn(
                "panel flex flex-col gap-3 p-4 text-left transition-colors",
                on ? "border-accent ring-accent/50 ring-1" : "hover:border-border-strong",
              )}
            >
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-lg border",
                  on
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border bg-surface-2 text-fg-muted",
                )}
              >
                <Icon className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">{s.title}</h2>
                <p className="text-fg-muted mt-1 text-xs leading-relaxed">{s.summary}</p>
              </div>
              <ol className="border-border text-fg-faint mt-auto space-y-1 border-t pt-3 text-[11px]">
                {s.steps.map((st) => (
                  <li key={st.atMin} className="flex gap-2">
                    <span className="tabular text-fg-muted w-12 shrink-0 font-mono">
                      {simClock(st.atMin)}
                    </span>
                    {st.label}
                  </li>
                ))}
              </ol>
            </button>
          );
        })}
      </div>
      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          {multi ? (
            <fieldset className="space-y-1">
              <legend className="text-fg-muted mb-1 block text-xs">
                Presas que fallan (en este orden, cada {ROTURA_STAGGER} min)
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {sites.map((s) => {
                  const idx = broken.indexOf(s.slug);
                  const on = idx >= 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(s.slug)}
                      className={cn(
                        "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                        on
                          ? "border-lvl-roja/60 bg-lvl-roja/10 text-fg"
                          : "border-border text-fg-muted hover:border-border-strong",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-5 place-items-center rounded-full text-[11px] font-bold",
                          on ? "bg-lvl-roja text-white" : "border-border border",
                        )}
                      >
                        {on ? idx + 1 : ""}
                      </span>
                      {s.name.replace("Embalse ", "")}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          {multi && (
            <div className="space-y-1">
              <span className="text-fg-muted block text-xs">Lo que arrastra la crecida</span>
              <SegmentedControl<Debris>
                label="Escombros"
                size="md"
                value={debris}
                onChange={setDebris}
                options={(Object.keys(DEBRIS) as Debris[]).map((k) => ({ value: k, label: DEBRIS[k].label }))}
              />
            </div>
          )}
          {multi ? null : (
            <label className="space-y-1">
              <span className="text-fg-muted block text-xs">Embalse</span>
              <Select value={siteSlug} onChange={(e) => setSiteSlug(e.target.value)} aria-label="Embalse">
                {sites.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <div className="space-y-1">
            <span className="text-fg-muted block text-xs">Aceleración</span>
            <SegmentedControl
              label="Aceleración"
              value={speed}
              onChange={setSpeed}
              size="md"
              options={[
                { value: "30", label: "×30" },
                { value: "60", label: "×60" },
              ]}
            />
          </div>
          <p className="text-fg-faint text-xs">
            Duración simulada {formatDuration(def.durationMin)} · real ≈{" "}
            {formatDuration(def.durationMin / Number(speed))}
          </p>
          <Button
            variant="warning"
            size="lg"
            className="ml-auto"
            disabled={!canRun || busy || !site}
            onClick={start}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Siren />} Iniciar simulacro
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function Active({
  drill,
  summaries,
  canRun,
}: {
  drill: DrillRun;
  summaries: ReturnType<typeof useSiteSummaries>;
  canRun: boolean;
}) {
  const panel = usePanel();
  const qc = useQueryClient();
  const { data } = useOrgLive();
  const [busy, setBusy] = useState<string | null>(null);
  const def = SCENARIOS[drill.scenario as ScenarioId];
  const summary = summaries.find((s) => s.site.id === drill.site_id);
  const site = summary?.site;
  const state = (drill.state ?? {}) as { events?: { min: number; label: string }[]; sim?: { cota?: number } };
  const sensors = useMemo(
    () => (data?.sensors ?? []).filter((s) => s.site_id === drill.site_id),
    [data, drill.site_id],
  );
  const by = (t: SensorType, suffix?: string) =>
    sensors.find((s) => s.type === t && (!suffix || s.code.endsWith(suffix)));
  const ids = useMemo(() => {
    const want: (SensorType | [SensorType, string])[] = [
      "nivel_radar",
      "pluviometro",
      "caudal_entrada",
      "caudal_salida",
      ["piezometro", "PZ-01"],
      "asentamiento",
      "starlink",
    ];
    return want
      .map((w) =>
        Array.isArray(w)
          ? sensors.find((s) => s.type === w[0] && s.code.endsWith(w[1]))
          : sensors.find((s) => s.type === w && !s.code.startsWith("RIO")),
      )
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => s.id);
  }, [sensors]);
  const brokenIds = useMemo(
    () =>
      drillSites(drill)
        .filter((x) => x.role === "rotura")
        .map((x) => x.id),
    [drill],
  );
  const outSensors = useMemo(
    () => (data?.sensors ?? []).filter((s) => brokenIds.includes(s.site_id) && s.type === "caudal_salida"),
    [data, brokenIds],
  );
  const seriesIds = useMemo(() => [...new Set([...ids, ...outSensors.map((s) => s.id)])], [ids, outSensors]);
  const series = useDrillSeries(drill.id, seriesIds);
  const S = series.data ?? {};
  const line = (id: string | undefined) =>
    id ? (S[id] ?? []).map((p) => [p.simMin, p.value] as [number, number]) : [];
  const alerts = sortAlerts((data?.alerts ?? []).filter((a) => a.drill_run_id === drill.id));
  const notifs = useQuery({
    queryKey: ["drill-notifs", drill.id],
    refetchInterval: 3000,
    queryFn: async () => {
      const { data: rows } = await getBrowserClient()
        .from("notifications")
        .select("*")
        .eq("drill_run_id", drill.id)
        .order("created_at", { ascending: false })
        .limit(60);
      return rows ?? [];
    },
  });

  const control = async (action: string, arg?: number) => {
    if (
      (action === "finalizar" || action === "reiniciar") &&
      !window.confirm(
        action === "finalizar"
          ? "¿Finalizar el simulacro? Se restaurará el estado real del embalse."
          : "¿Reiniciar el escenario desde cero? Se borrarán las lecturas y alertas de este simulacro.",
      )
    )
      return;
    setBusy(action);
    try {
      await post("/api/simulacro/control", { drill_id: drill.id, action, arg });
      await qc.invalidateQueries({ queryKey: ORG_LIVE_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  const pct = Math.min(100, (drill.sim_minutes / def.durationMin) * 100);
  const scene = useDrillScene();
  const rupture = drill.scenario === "rotura";
  const nivel = by("nivel_radar");
  const cota = nivel?.last_value ?? state.sim?.cota ?? null;

  return (
    <div className="space-y-3 p-3 sm:p-4">
      {/* Barra de control */}
      <Card className="border-lvl-amarilla/40">
        <CardBody className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-lvl-amarilla grid size-11 place-items-center rounded-lg bg-[var(--lvl-amarilla-bg)]">
              <Siren className="animate-pulse-soft size-5" />
            </span>
            <div>
              <p className="label-caps text-lvl-amarilla">
                Simulacro en curso · {drill.status === "pausado" ? "en pausa" : `×${drill.speed}`}
              </p>
              <h1 className="text-lg leading-tight font-semibold">{def.title}</h1>
              <p className="text-fg-muted text-xs">
                {scene?.brokenSiteIds.length ? `Presas: ${scene.siteName}` : site?.name}
              </p>
            </div>
          </div>
          <div className="border-border bg-surface-2 flex items-center gap-2 rounded-lg border px-3 py-1.5">
            <Timer className="text-fg-faint size-4" />
            <span className="tabular font-mono text-2xl font-semibold">{simClock(drill.sim_minutes)}</span>
            <span className="text-fg-faint text-[11px]">tiempo simulado</span>
          </div>
          {canRun && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <SegmentedControl
                label="Aceleración"
                value={String(drill.speed) as "30" | "60"}
                onChange={(v) => control("velocidad", Number(v))}
                options={[
                  { value: "30", label: "×30" },
                  { value: "60", label: "×60" },
                ]}
              />
              {drill.status === "activo" ? (
                <Button variant="secondary" onClick={() => control("pausar")} disabled={!!busy}>
                  <Pause /> Pausar
                </Button>
              ) : (
                <Button variant="primary" onClick={() => control("reanudar")} disabled={!!busy}>
                  <Play /> Reanudar
                </Button>
              )}
              <Button variant="secondary" onClick={() => control("adelantar", 15)} disabled={!!busy}>
                {busy === "adelantar" ? <Loader2 className="animate-spin" /> : <FastForward />} +15 min
              </Button>
              <Button variant="ghost" onClick={() => control("reiniciar")} disabled={!!busy}>
                <RotateCcw /> Reiniciar
              </Button>
              <Button variant="danger" onClick={() => control("finalizar")} disabled={!!busy}>
                <Square /> Finalizar
              </Button>
            </div>
          )}
        </CardBody>
        <div className="bg-surface-3 relative mx-4 mb-4 h-2 rounded-full">
          <div
            className="bg-lvl-amarilla h-full rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
          {def.steps.map((s) => (
            <span
              key={s.atMin}
              title={s.label}
              className="border-bg bg-fg-muted absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{ left: `${(s.atMin / def.durationMin) * 100}%` }}
            />
          ))}
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader title="Nivel del embalse" subtitle="m s. n. m. · minuto simulado" />
              <CardBody className="pt-2">
                <TimeSeriesChart
                  xLabel="simmin"
                  zoom={false}
                  height={220}
                  ariaLabel="Nivel en simulacro"
                  axes={[{ name: "m s. n. m.", decimals: 2 }]}
                  series={[{ name: "Nivel", data: line(nivel?.id), color: "#22d3ee", area: true, unit: "m" }]}
                  lines={
                    site
                      ? [
                          { value: Number(site.cota_vertedero), label: "Vertedero", color: "#facc15" },
                          { value: Number(site.cota_name), label: "NAME", color: "#fb923c" },
                          {
                            value: Number(site.cota_cresta),
                            label: "Cresta",
                            color: "#ef4444",
                            dashed: false,
                          },
                        ]
                      : []
                  }
                />
              </CardBody>
            </Card>
            {rupture ? (
              <Card>
                <CardHeader title="Caudal de salida de cada presa" subtitle="m³/s · incluye la brecha" />
                <CardBody className="pt-2">
                  <TimeSeriesChart
                    xLabel="simmin"
                    zoom={false}
                    height={220}
                    ariaLabel="Caudal de salida en la rotura"
                    axes={[{ name: "m³/s", decimals: 0, min: 0 }]}
                    series={outSensors.map((o, i) => ({
                      name:
                        data?.sites.find((x) => x.id === o.site_id)?.name.replace("Embalse ", "") ?? o.code,
                      data: (S[o.id] ?? []).map((p) => [p.simMin, p.value / 1000] as [number, number]),
                      color: ["#ef4444", "#fb923c", "#f472b6"][i % 3],
                      unit: "m³/s",
                      decimals: 0,
                    }))}
                  />
                </CardBody>
              </Card>
            ) : drill.scenario === "estructural" ? (
              <Card>
                <CardHeader title="Estructura" subtitle="Piezómetro (kPa) y asentamiento (mm)" />
                <CardBody className="pt-2">
                  <TimeSeriesChart
                    xLabel="simmin"
                    zoom={false}
                    height={220}
                    ariaLabel="Estructura en simulacro"
                    axes={[
                      { name: "kPa", decimals: 0 },
                      { name: "mm", decimals: 2 },
                    ]}
                    series={[
                      {
                        name: "Piezómetro PZ-01",
                        data: line(by("piezometro", "PZ-01")?.id),
                        color: "#f472b6",
                        unit: "kPa",
                        decimals: 1,
                      },
                      {
                        name: "Asentamiento",
                        data: line(by("asentamiento")?.id),
                        color: "#fb923c",
                        axis: 1,
                        unit: "mm",
                        decimals: 2,
                        step: true,
                      },
                    ]}
                  />
                </CardBody>
              </Card>
            ) : drill.scenario === "comunicacion" ? (
              <Card>
                <CardHeader title="Enlace Starlink" subtitle="Latencia (ms) · huecos = sin datos" />
                <CardBody className="pt-2">
                  <TimeSeriesChart
                    xLabel="simmin"
                    zoom={false}
                    height={220}
                    ariaLabel="Latencia Starlink"
                    axes={[{ name: "ms", decimals: 0, min: 0 }]}
                    series={[
                      {
                        name: "Latencia",
                        data: line(by("starlink")?.id),
                        color: "#a78bfa",
                        unit: "ms",
                        decimals: 0,
                      },
                    ]}
                    lines={[{ value: 150, label: "Degradado", color: "#facc15" }]}
                  />
                </CardBody>
              </Card>
            ) : (
              <Card>
                <CardHeader title="Lluvia y caudales" subtitle="mm por intervalo · L/s" />
                <CardBody className="pt-2">
                  <TimeSeriesChart
                    xLabel="simmin"
                    zoom={false}
                    height={220}
                    ariaLabel="Lluvia y caudales en simulacro"
                    axes={[
                      { name: "L/s", decimals: 0, min: 0 },
                      { name: "mm", decimals: 1, min: 0 },
                    ]}
                    series={[
                      {
                        name: "Q entrada",
                        data: line(by("caudal_entrada")?.id),
                        color: "#38bdf8",
                        unit: "L/s",
                        decimals: 0,
                      },
                      {
                        name: "Q salida",
                        data: line(by("caudal_salida")?.id),
                        color: "#a3e635",
                        unit: "L/s",
                        decimals: 0,
                      },
                      {
                        name: "Lluvia",
                        data: line(by("pluviometro")?.id),
                        color: "#818cf8",
                        type: "bar",
                        axis: 1,
                        unit: "mm",
                        decimals: 1,
                      },
                    ]}
                  />
                </CardBody>
              </Card>
            )}
          </div>
          {rupture && scene && <RuptureBoard scene={scene} />}
          {rupture && scene && <RuptureImpact scene={scene} />}
          <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Vaso" subtitle={site?.name} />
              <CardBody>
                {site && (
                  <GaugeNivel
                    compact
                    cota={cota}
                    fondo={Number(site.cota_fondo)}
                    namo={Number(site.cota_namo)}
                    name={Number(site.cota_name)}
                    vertedero={Number(site.cota_vertedero)}
                    cresta={Number(site.cota_cresta)}
                    fillPct={summary?.fillPct}
                    level={summary?.level ?? "normal"}
                  />
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Línea de tiempo del ejercicio" icon={<Flag />} />
              <ol className="max-h-64 scrollbar-thin space-y-2 overflow-y-auto p-4">
                {(state.events ?? [])
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <li key={`${e.min}-${i}`} className="flex gap-3 text-sm">
                      <span className="tabular text-fg-muted w-14 shrink-0 font-mono text-xs">
                        {simClock(e.min)}
                      </span>
                      <span className="text-fg">{e.label}</span>
                    </li>
                  ))}
                {alerts
                  .slice()
                  .reverse()
                  .map((a) => {
                    const tv = (a.trigger_values ?? {}) as { sim_started_min?: number };
                    return (
                      <li key={a.id} className="flex items-center gap-3 text-sm">
                        <span className="tabular text-fg-muted w-14 shrink-0 font-mono text-xs">
                          {simClock(tv.sim_started_min ?? 0)}
                        </span>
                        <StatusBadge level={a.level as AlertLevel} size="sm" />
                        <span className="text-fg-muted truncate">{a.title}</span>
                      </li>
                    );
                  })}
              </ol>
            </Card>
          </div>
          <NotificationLog rows={notifs.data ?? []} title="Notificaciones del simulacro" />
        </div>
        <Card className="flex max-h-[calc(100dvh-14rem)] flex-col overflow-hidden">
          <CardHeader
            title="Alertas generadas"
            subtitle={`${alerts.length} abiertas en este ejercicio`}
            icon={<Siren />}
          />
          <div className="flex-1 scrollbar-thin space-y-2 overflow-y-auto p-3">
            {alerts.length === 0 && (
              <EmptyState
                title="Aún sin alertas"
                description="Las reglas reales se evalúan en cada paso del simulacro."
              />
            )}
            {alerts.map((a) => (
              <AlertCard
                key={a.id}
                level={a.level as AlertLevel}
                title={a.title}
                description={a.description}
                status={a.status}
                startedAt={a.started_at}
                isDrill
                footer={<AlertCountdown alert={a} drill={drill} size="md" />}
                actions={<AlertActions alert={a} role={panel.role} />}
              />
            ))}
          </div>
          <p className="border-border text-fg-faint border-t px-3 py-2 text-[11px]">
            Cuenta regresiva en tiempo simulado (×{drill.speed}). Llegada a Ambato desde {site?.code}: ver ETA
            de cada alerta. {formatNumber(drill.sim_minutes, 0)} / {formatNumber(def.durationMin, 0)} min
            simulados.
          </p>
        </Card>
      </div>
    </div>
  );
}

/** Rotura: llegada de la onda a cada punto de control, población expuesta y nivel del río en vivo. */
function RuptureBoard({ scene }: { scene: NonNullable<ReturnType<typeof useDrillScene>> }) {
  const { data } = useOrgLive();
  const rows = scene.etas;
  const total = rows.reduce((a, e) => a + (e.poblacion ?? 0), 0);
  return (
    <Card>
      <CardHeader
        title="Puntos de control · llegada de la onda"
        subtitle={
          rows.length
            ? `${rows.length} puntos · ${formatNumber(total, 0)} habitantes expuestos (ref.)`
            : "La cuenta regresiva empieza cuando se abre la brecha"
        }
        icon={<Timer />}
      />
      {rows.length === 0 ? (
        <CardBody>
          <p className="text-fg-muted text-sm">
            Antes de la falla la presa da señales (filtración, presión de poro, asentamiento): ese es el
            tiempo para evacuar.
          </p>
        </CardBody>
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-border text-fg-faint border-b text-left text-[11px] tracking-wide uppercase">
                <th className="px-4 py-2 font-medium">Punto</th>
                <th className="px-2 py-2 font-medium">Onda desde</th>
                <th className="px-2 py-2 text-right font-medium">Hab.</th>
                <th className="px-2 py-2 text-right font-medium">Llegada</th>
                <th className="px-4 py-2 text-right font-medium">Nivel del río</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const point = data?.points.find((p) => p.name === e.name);
                const sensor = data?.sensors.find((x) => x.id === point?.nivel_rio_sensor_id);
                const v = sensor?.last_value ?? null;
                const thr = sensor?.thresholds as unknown as Parameters<typeof levelFor>[1] | null;
                const lvl = v === null || !thr || !("direction" in thr) ? "sin_datos" : levelFor(v, thr);
                const arrived = e.remainingMin <= 0;
                return (
                  <tr
                    key={e.name}
                    className={cn("border-border/60 border-b last:border-0", arrived && "bg-lvl-roja/10")}
                  >
                    <td className="px-4 py-2 font-medium">{e.name}</td>
                    <td className="text-fg-muted px-2 py-2">{e.from}</td>
                    <td className="tabular text-fg-muted px-2 py-2 text-right font-mono">
                      {formatNumber(e.poblacion ?? 0, 0)}
                    </td>
                    <td
                      className={cn(
                        "tabular px-2 py-2 text-right font-mono font-semibold",
                        arrived ? "text-lvl-roja" : e.remainingMin < 30 ? "text-lvl-naranja" : "",
                      )}
                    >
                      {arrived ? "LLEGÓ" : formatDuration(Math.ceil(e.remainingMin))}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="tabular font-mono">
                          {v === null ? "—" : `${formatNumber(v, 2)} m`}
                        </span>
                        <StatusBadge level={lvl as AlertLevel} size="sm" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Rotura: zonas más afectadas hasta el minuto simulado actual (envolvente de la crecida). */
function RuptureImpact({ scene }: { scene: NonNullable<ReturnType<typeof useDrillScene>> }) {
  const { data } = useOrgLive();
  const flood = useFloodData();
  const dams = useDamInputs(data, scene.breaches);
  const impact = useImpact(flood.data, dams, scene.debris, scene.simMin);
  const t = impact?.totals;
  const severe = t ? t.buildingsByClass[3] + t.buildingsByClass[4] : 0;
  return (
    <Card>
      <CardHeader
        title="Zonas más afectadas hasta ahora"
        subtitle={
          t && t.areaHa > 0
            ? `${formatNumber(t.areaHa, 0)} ha inundadas · ${formatNumber(severe, 0)} edificaciones en peligro alto o extremo · ${formatNumber(t.bridgesHit, 0)} puentes · ${DEBRIS[scene.debris].label.toLowerCase()}`
            : `Crecida con ${DEBRIS[scene.debris].label.toLowerCase()} · estimación de primer nivel`
        }
        icon={<Siren />}
        actions={<HazardLegend className="hidden md:flex" />}
      />
      {impact ? (
        <ZoneRanking impact={impact} limit={6} tNow={scene.simMin} />
      ) : (
        <CardBody>
          <p className="text-fg-muted text-sm">Cargando el modelo del valle…</p>
        </CardBody>
      )}
    </Card>
  );
}
