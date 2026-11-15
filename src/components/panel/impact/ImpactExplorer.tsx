"use client";
import { useMemo, useState } from "react";
import { Building2, Crosshair, Info, Layers, Route, Users, Waves } from "lucide-react";
import { BasinMap } from "@/components/map/BasinMap";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SegmentedControl, Skeleton } from "@/components/ui/misc";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorScreen } from "@/components/ErrorScreen";
import { useOrgLive, useSiteSummaries } from "@/lib/data/live";
import { computeImpact, DEBRIS, HAZARD, type Debris, type ImpactResult } from "@/lib/flood/impact";
import { useDamInputs, useFloodData, useImpact } from "@/lib/flood/useImpact";
import { ROTURA_BREACH_AT, ROTURA_STAGGER } from "@/lib/sim/scenarios";
import type { ZoneImpact } from "@/lib/flood/impact";
import { formatDuration, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

// vista casi cenital: con el mapa muy inclinado el relieve tapa el fondo del cañón
const CORRIDOR = { lng: -78.665, lat: -1.262, zoom: 12.3, pitch: 30, bearing: -12 };
const rgb = (c: readonly number[]) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

export function HazardChip({ cls, className }: { cls: number; className?: string }) {
  const h = HAZARD[cls];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold",
        className,
      )}
      style={{ background: `rgb(${h.color[0]} ${h.color[1]} ${h.color[2]} / 0.18)`, color: rgb(h.color) }}
    >
      <span className="size-1.5 rounded-full" style={{ background: rgb(h.color) }} aria-hidden />
      {h.label}
    </span>
  );
}

export function HazardLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]", className)}>
      {HAZARD.slice(1).map((h) => (
        <span key={h.key} className="inline-flex items-center gap-1" title={"note" in h ? h.note : undefined}>
          <span className="size-2.5 rounded-sm" style={{ background: rgb(h.color) }} aria-hidden /> {h.label}
        </span>
      ))}
    </div>
  );
}

/** Ranking de zonas críticas (de mayor a menor impacto). */
export function ZoneRanking({
  impact,
  limit = 10,
  tNow,
  onSelect,
}: {
  impact: ImpactResult;
  limit?: number;
  tNow?: number;
  onSelect?: (z: ZoneImpact) => void;
}) {
  const rows = impact.zones.slice(0, limit);
  if (!rows.length) return <p className="text-fg-muted p-4 text-sm">El agua aún no sale del cauce.</p>;
  return (
    <div>
      {/* celular: tarjetas compactas */}
      <ul className="divide-border divide-y sm:hidden">
        {rows.map((z, i) => {
          const severe = z.buildings[3] + z.buildings[4];
          const all = z.buildings.reduce((a, x) => a + x, 0);
          const when =
            z.arrivalMin === null
              ? "—"
              : tNow !== undefined && z.arrivalMin <= tNow
                ? "ya llegó"
                : `llega en ${formatDuration(Math.round(z.arrivalMin - (tNow ?? 0)))}`;
          return (
            <li key={z.zone} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={!onSelect}
                  onClick={() => onSelect?.(z)}
                  className="flex min-w-0 items-center gap-2 text-left font-medium"
                >
                  <span className="text-fg-faint font-mono text-xs">{i + 1}</span>
                  <span className="truncate">{z.name}</span>
                </button>
                <HazardChip cls={z.worst} className="shrink-0" />
              </div>
              <p className="text-fg-muted mt-0.5 text-xs">
                {when} · {formatNumber(z.areaHa, 1)} ha · hasta {formatNumber(z.maxDepth, 1)} m ·{" "}
                <span className={cn(severe > 0 && "text-lvl-roja font-semibold")}>{severe}</span>/{all}{" "}
                edificaciones
                {z.bridges.length ? ` · ${z.bridges.length} puente${z.bridges.length > 1 ? "s" : ""}` : ""}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="hidden scrollbar-thin overflow-x-auto sm:block">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-border text-fg-faint border-b text-left text-[11px] tracking-wide uppercase">
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Zona</th>
              <th className="px-2 py-2 font-medium">Peligro</th>
              <th className="px-2 py-2 text-right font-medium">Llega</th>
              <th className="px-2 py-2 text-right font-medium">Área</th>
              <th className="px-2 py-2 text-right font-medium">Prof. máx.</th>
              <th className="px-2 py-2 text-right font-medium">Edificaciones</th>
              <th className="px-4 py-2 font-medium">Puentes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((z, i) => {
              const severe = z.buildings[3] + z.buildings[4];
              const all = z.buildings.reduce((a, x) => a + x, 0);
              return (
                <tr key={z.zone} className="border-border/60 border-b last:border-0">
                  <td className="text-fg-faint px-4 py-2 font-mono">{i + 1}</td>
                  <td className="px-2 py-2 font-medium">
                    {onSelect ? (
                      <button
                        type="button"
                        onClick={() => onSelect(z)}
                        className="hover:text-accent inline-flex items-center gap-1.5 text-left"
                        title="Ver en el mapa"
                      >
                        <Crosshair className="text-fg-faint size-3.5 shrink-0" aria-hidden />
                        {z.name}
                      </button>
                    ) : (
                      z.name
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <HazardChip cls={z.worst} />
                  </td>
                  <td className="tabular px-2 py-2 text-right font-mono whitespace-nowrap">
                    {z.arrivalMin === null
                      ? "—"
                      : tNow !== undefined && z.arrivalMin <= tNow
                        ? "llegó"
                        : formatDuration(Math.round(z.arrivalMin - (tNow ?? 0)))}
                  </td>
                  <td className="tabular px-2 py-2 text-right font-mono whitespace-nowrap">
                    {formatNumber(z.areaHa, 1)} ha
                  </td>
                  <td className="tabular px-2 py-2 text-right font-mono whitespace-nowrap">
                    {formatNumber(z.maxDepth, 1)} m
                  </td>
                  <td className="tabular px-2 py-2 text-right font-mono whitespace-nowrap">
                    <span className={cn(severe > 0 && "text-lvl-roja font-semibold")}>{severe}</span>
                    <span className="text-fg-faint"> / {all}</span>
                  </td>
                  <td className="text-fg-muted px-4 py-2 text-xs">
                    {z.bridges.length
                      ? `${z.bridges.length} · ${z.bridges[0].name}${z.bridges.length > 1 ? "…" : ""}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-fg-faint px-4 py-2 text-[11px]">
        Edificaciones: en peligro alto o extremo / total con agua. Llegada: desde el inicio del escenario.
      </p>
    </div>
  );
}

export function ImpactExplorer() {
  const { data, isError, refetch } = useOrgLive();
  const summaries = useSiteSummaries(data);
  const flood = useFloodData();
  const [broken, setBroken] = useState<string[]>(["chiquiurco", "mulacorral"]);
  const [debris, setDebris] = useState<Debris>("moderado");
  const [flight, setFlight] = useState<{
    target: "lugar";
    lng: number;
    lat: number;
    zoom: number;
    pitch: number;
    nonce: number;
  } | null>(null);
  const focus = (z: ZoneImpact) => {
    setFlight({ target: "lugar", lng: z.lng, lat: z.lat, zoom: 15, pitch: 20, nonce: Date.now() });
    document.getElementById("impacto-mapa")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const chosen = useMemo(
    () =>
      broken
        .map((slug) => data?.sites.find((s) => s.slug === slug))
        .filter((s): s is NonNullable<typeof s> => !!s),
    [broken, data?.sites],
  );
  const dams = useDamInputs(
    data,
    chosen.map((s, i) => ({ siteId: s.id, breachAtMin: ROTURA_BREACH_AT + i * ROTURA_STAGGER })),
  );
  const impact = useImpact(flood.data, dams, debris, null);
  // comparación del efecto de los escombros (las tres variantes)
  const compare = useMemo(
    () =>
      flood.data && dams.length
        ? (["agua", "moderado", "lodo"] as const).map((d) => ({
            d,
            r: computeImpact(flood.data!, dams, d, null),
          }))
        : [],
    [flood.data, dams],
  );
  const mapSites = useMemo(
    () => summaries.map((s) => ({ site: s.site, level: s.level, fillPct: s.fillPct })),
    [summaries],
  );
  const hazard = useMemo(
    () => (flood.data && impact ? { fd: flood.data, cls: impact.cls } : null),
    [flood.data, impact],
  );
  const toggle = (slug: string) =>
    setBroken((b) => (b.includes(slug) ? b.filter((x) => x !== slug) : [...b, slug]));

  if (isError)
    return (
      <div className="p-6">
        <ErrorScreen compact error={new Error("No se pudo cargar")} reset={() => refetch()} />
      </div>
    );

  const t = impact?.totals;
  const severe = t ? t.buildingsByClass[3] + t.buildingsByClass[4] : 0;
  const maxCmp = Math.max(1, ...compare.map((c) => c.r.totals.areaHa));
  const maxCmpB = Math.max(
    1,
    ...compare.map((c) => c.r.totals.buildingsByClass.slice(1).reduce((a, x) => a + x, 0)),
  );

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <header>
        <p className="label-caps text-accent">Análisis de riesgo</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
          Zonas de impacto por rotura de presa
        </h1>
        <p className="text-fg-muted mt-1 max-w-3xl text-sm">
          Qué zonas se inundarían, con cuánta agua y dónde la crecida haría más daño, incluido el efecto de
          los escombros que arrastra. Estimación de primer nivel para priorizar; no reemplaza un estudio
          hidráulico detallado.
        </p>
      </header>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <fieldset className="space-y-1">
            <legend className="text-fg-muted mb-1 block text-xs">Presas que fallan (en este orden)</legend>
            <div className="flex flex-wrap gap-1.5">
              {(data?.sites ?? []).map((s) => {
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
          <p className="text-fg-muted max-w-md text-xs">{DEBRIS[debris].desc}</p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          icon={<Waves />}
          label="Área inundada"
          value={t ? `${formatNumber(t.areaHa, 0)} ha` : "—"}
          sub={t ? `pico ${formatNumber(t.peakQ, 0)} m³/s` : ""}
        />
        <Kpi
          icon={<Building2 />}
          label="Edificaciones en peligro alto o extremo"
          value={t ? formatNumber(severe, 0) : "—"}
          sub={
            t
              ? `${formatNumber(
                  t.buildingsByClass.slice(1).reduce((a, x) => a + x, 0),
                  0,
                )} con agua`
              : ""
          }
          tone={severe > 0 ? "roja" : undefined}
        />
        <Kpi
          icon={<Users />}
          label="Personas en zona inundada (est.)"
          value={t ? formatNumber(t.people, 0) : "—"}
          sub="3,5 personas por edificación"
        />
        <Kpi
          icon={<Route />}
          label="Puentes afectados"
          value={t ? formatNumber(t.bridgesHit, 0) : "—"}
          sub={flood.data ? `de ${flood.data.meta.bridges.length} sobre el río` : ""}
        />
        <Kpi
          icon={<Layers />}
          label="Zonas afectadas"
          value={impact ? formatNumber(impact.zones.length, 0) : "—"}
          sub={impact?.zones[0] ? `más crítica: ${impact.zones[0].name}` : ""}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card id="impacto-mapa" className="relative h-[62vh] min-h-[420px] overflow-hidden">
          {data && flood.data ? (
            <ErrorBoundary
              fallback={(e, reset) => (
                <div className="absolute inset-0">
                  <ErrorScreen compact error={e} reset={reset} />
                </div>
              )}
            >
              <BasinMap
                className="absolute inset-0"
                center={CORRIDOR}
                sites={mapSites}
                gateways={data.gateways}
                sensors={data.sensors}
                cameras={data.cameras}
                points={data.points}
                showCoverage={false}
                showSensors={false}
                hazard={hazard}
                flight={flight}
              />
            </ErrorBoundary>
          ) : (
            <Skeleton className="absolute inset-0 rounded-none" />
          )}
          <div className="panel bg-bg/85 absolute bottom-9 left-3 px-3 py-2 backdrop-blur">
            <p className="text-fg-muted mb-1 text-[10.5px] font-medium">Peligro de la crecida (máximo)</p>
            <HazardLegend />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Efecto de los escombros"
            subtitle="Misma rotura, distinto contenido de sólidos"
            icon={<Layers />}
          />
          <CardBody className="space-y-4">
            {compare.map(({ d, r }) => {
              const b = r.totals.buildingsByClass.slice(1).reduce((a, x) => a + x, 0);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDebris(d)}
                  className={cn(
                    "block w-full rounded-lg border p-2.5 text-left",
                    d === debris ? "border-accent" : "border-border",
                  )}
                >
                  <div className="flex items-baseline justify-between text-sm font-medium">
                    {DEBRIS[d].label}
                    <span className="text-fg-faint text-[11px]">
                      ×{formatNumber(DEBRIS[d].bulking, 1)} volumen
                    </span>
                  </div>
                  <Bar
                    label="Área"
                    value={`${formatNumber(r.totals.areaHa, 0)} ha`}
                    pct={r.totals.areaHa / maxCmp}
                    color="#38bdf8"
                  />
                  <Bar label="Edificaciones" value={formatNumber(b, 0)} pct={b / maxCmpB} color="#fb923c" />
                </button>
              );
            })}
            <p className="text-fg-faint flex gap-1.5 text-[11px] leading-relaxed">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Los escombros aumentan el volumen (1/(1−Cv)) y la densidad de la mezcla: el mismo flujo empuja
              más fuerte y pasa antes al nivel de peligro extremo.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Zonas críticas"
          subtitle="Ordenadas por daño esperado: edificaciones en peligro, puentes y área inundada · toque una zona para verla en el mapa"
          icon={<Layers />}
        />
        {impact ? <ZoneRanking impact={impact} onSelect={focus} /> : <Skeleton className="m-4 h-40" />}
      </Card>

      <Card>
        <CardHeader title="Cómo se calcula y sus límites" icon={<Info />} />
        <CardBody className="text-fg-muted grid gap-3 text-xs leading-relaxed md:grid-cols-2">
          <div>
            <p>
              <b className="text-fg">Crecida:</b> el mismo hidrograma de brecha del simulacro (Froehlich
              2008), con la onda que llega a cada tramo en su tiempo de llegada y se atenúa con la distancia.
            </p>
            <p className="mt-2">
              <b className="text-fg">Zona inundada:</b> método HAND (altura sobre el drenaje más cercano), el
              que usa NOAA para sus mapas de inundación, con curvas de descarga sintéticas de Manning por
              tramo de 500 m sobre el relieve de ~19 m.
            </p>
            <p className="mt-2">
              <b className="text-fg">Peligro:</b> por profundidad y por profundidad × velocidad × densidad
              (clases simplificadas de ARR 2019 y USBR): medio desde 0,5 m²/s, alto desde 1 m²/s (arrastra
              personas), extremo desde 3 m²/s o 4 m de agua (daño estructural).
            </p>
          </div>
          <div>
            <p>
              <b className="text-fg">Exposición:</b>{" "}
              {flood.data ? formatNumber(flood.data.meta.nBuildings, 0) : "—"} edificaciones del valle
              (huellas de OpenStreetMap) y {flood.data?.meta.bridges.length ?? "—"} puentes sobre el río. La
              cobertura de edificaciones de OpenStreetMap es incompleta: con el catastro municipal las cifras
              serían reales.
            </p>
            <p className="mt-2">
              <b className="text-fg">Límites:</b> el relieve de ~19 m no ve muros, calles ni quebradas
              angostas; en el cañón urbano de Ambato tiende a sobrestimar la zona inundada. Para decisiones de
              reubicación u obras se requiere un estudio HEC-RAS 2D (o FLO-2D para flujos de lodo) con
              topografía LiDAR; la plataforma puede cargar esos resultados cuando existan.
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "roja";
  className?: string;
}) {
  return (
    <div className={cn("panel p-3", className)}>
      <div className="text-fg-muted flex items-center gap-1.5 text-[11px] [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div
        className={cn("tabular mt-1 font-mono text-2xl font-semibold", tone === "roja" && "text-lvl-roja")}
      >
        {value}
      </div>
      {sub && <div className="text-fg-faint mt-0.5 truncate text-[11px]">{sub}</div>}
    </div>
  );
}

function Bar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="mt-1.5 grid grid-cols-[86px_minmax(0,1fr)_64px] items-center gap-2 text-[11px]">
      <span className="text-fg-muted">{label}</span>
      <span className="bg-surface-3 h-1.5 overflow-hidden rounded">
        <span
          className="block h-full rounded"
          style={{ width: `${Math.max(2, pct * 100)}%`, background: color }}
        />
      </span>
      <span className="tabular text-right font-mono">{value}</span>
    </div>
  );
}
