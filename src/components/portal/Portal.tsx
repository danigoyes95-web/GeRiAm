"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  Cloud,
  LayoutDashboard,
  Mountain,
  Phone,
  RadioTower,
  Satellite,
  ShieldCheck,
  Siren,
  Smartphone,
  Timer,
  Waves,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { Logo, StatusBadge } from "@/design";
import { LEVELS } from "@/design/levels";
import { Button } from "@/components/ui/button";
import { DrillBanner } from "@/components/DrillBanner";
import { publicClient, type PublicStatus } from "@/lib/data/public";
import { DEFAULT_ORG_SLUG } from "@/lib/supabase/config";
import { fillPercent } from "@/lib/hydro/curve";
import { formatAgo, formatDuration, formatHm3, formatNumber } from "@/lib/format";
import { ROLE_LABEL, worstLevel, type Role, type StatusLevel } from "@/lib/domain/types";
import { useNow } from "@/lib/hooks/useNow";
import { cn } from "@/lib/utils";

const BasinMap = dynamic(() => import("@/components/map/BasinMap").then((m) => m.BasinMap), { ssr: false });

function useLiveStatus(initial: PublicStatus | null) {
  const [status, setStatus] = useState(initial);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await publicClient().rpc("public_status", { p_slug: DEFAULT_ORG_SLUG });
      if (alive && data) setStatus(data as unknown as PublicStatus);
    };
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return status;
}

function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getDesktop = () => window.matchMedia("(min-width: 1024px)").matches;
const getDesktopServer = () => false;
function useIsDesktop() {
  return useSyncExternalStore(subscribeDesktop, getDesktop, getDesktopServer);
}

const FLOW: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Activity, title: "Sensores", text: "Nivel, lluvia, caudales, piezómetros, asentamiento e inclinación en cada presa." },
  { icon: RadioTower, title: "LoRaWAN", text: "Radio de largo alcance y bajo consumo: kilómetros de cobertura con baterías." },
  { icon: Mountain, title: "Gateway en la presa", text: "Concentra los sensores y las cámaras IP de cada embalse." },
  { icon: Satellite, title: "Starlink", text: "Enlace satelital en el páramo, donde no hay cobertura celular." },
  { icon: Cloud, title: "Nube GeRiAm", text: "Reglas de alerta, histórico, simulacros y bitácora inmutable." },
  { icon: LayoutDashboard, title: "Panel y app", text: "Sala de operaciones y teléfonos de técnicos y juntas, en tiempo real." },
];

const ALERT_LEVELS = ["normal", "amarilla", "naranja", "roja"] as const;

export function Portal({ initial }: { initial: PublicStatus | null }) {
  const status = useLiveStatus(initial);
  const desktop = useIsDesktop();
  const now = useNow(30_000) ?? undefined;
  const [level, setLevel] = useState<(typeof ALERT_LEVELS)[number]>("naranja");
  const branding = status?.organization?.branding ?? {};
  const entity = branding.entity ?? status?.organization?.name ?? "Gobierno Provincial";
  const sites = useMemo(() => status?.sites ?? [], [status]);
  const worst: StatusLevel = worstLevel(sites.map((s) => s.level));
  const lastUpdate = sites.map((s) => s.updated_at).filter(Boolean).sort().at(-1) ?? null;
  const stale = !lastUpdate || (now !== undefined && now - new Date(lastUpdate).getTime() > 10 * 60_000);
  const protocols = (status?.protocols ?? []).filter((p) => p.level === level);

  return (
    <div className="min-h-dvh bg-bg">
      <DrillBanner drill={status?.drill ? { scenario: status.drill.scenario, status: "activo" } : null} />
      {/* Encabezado */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" aria-label="Inicio">
            <Logo tagline={branding.tagline ?? "Gestión de Riesgos"} product={branding.product} color={branding.primary} />
          </Link>
          <nav className="hidden items-center gap-6 text-[13px] text-fg-muted md:flex" aria-label="Secciones">
            <a href="#estado" className="hover:text-fg">Estado</a>
            <a href="#como-funciona" className="hover:text-fg">Cómo funciona</a>
            <a href="#niveles" className="hover:text-fg">Niveles y protocolos</a>
            <a href="#embalses" className="hover:text-fg">Embalses</a>
            <a href="#contactos" className="hover:text-fg">Contactos</a>
          </nav>
          <Button asChild variant="primary" size="sm">
            <Link href="/login">
              Ingresar <ArrowRight />
            </Link>
          </Button>
        </div>
      </header>

      {/* Héroe */}
      <section className="relative overflow-hidden border-b border-border" id="estado">
        {desktop && status?.organization ? (
          <div className="absolute inset-0 opacity-90" aria-hidden>
            <BasinMap
              className="absolute inset-0"
              center={{ ...status.organization.map_center, zoom: status.organization.map_center.zoom - 0.6 }}
              sites={sites.map((s) => ({
                site: { ...s, id: s.slug, cauce_geojson: s.cauce_geojson } as never,
                level: s.level,
                fillPct: fillPercent(s.curva_area_volumen, s.nivel, Number(s.capacity_m3)),
              }))}
              interactive={false}
              orbit
              compact
              showCoverage={false}
              showSensors={false}
              quiet
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--bg)_0%,color-mix(in_oklab,var(--bg)_85%,transparent)_38%,transparent_75%)]" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,.16),transparent_60%)]" aria-hidden />
        )}
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:py-16 lg:min-h-[560px] lg:grid-cols-[minmax(0,560px)_1fr] lg:items-center lg:py-20">
          <div>
            <p className="label-caps text-accent">{entity}</p>
            <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[44px] lg:leading-[1.08]">
              Monitoreo y alerta temprana de los embalses de la cuenca alta del río Ambato
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-muted">
              Sensores en las presas de Chiquiurco y Mulacorral, enlazados por satélite desde el páramo, vigilan día y noche el nivel, la
              lluvia y la estructura. Ante un riesgo, el sistema alerta al personal y estima en cuánto tiempo llegaría la crecida a cada
              comunidad aguas abajo.
            </p>
            {/* Estado general en vivo */}
            <div className="mt-6 rounded-xl border border-border bg-surface-1/90 p-4 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="relative inline-flex size-2.5">
                    <span className={cn("absolute inset-0 rounded-full", stale ? "bg-lvl-sin-datos" : "animate-ring bg-lvl-normal")} />
                    <span className={cn("relative inline-flex size-2.5 rounded-full", stale ? "bg-lvl-sin-datos" : "bg-lvl-normal")} />
                  </span>
                  <span className="text-[13px] font-semibold">Estado general en vivo</span>
                </div>
                <StatusBadge level={stale ? "sin_datos" : worst} />
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {sites.map((s) => {
                  const pct = fillPercent(s.curva_area_volumen, s.nivel, Number(s.capacity_m3));
                  return (
                    <li key={s.slug} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{s.name}</div>
                        <div className="text-[11px] text-fg-faint" suppressHydrationWarning>
                          Llenado <b className="tabular font-mono text-fg-muted">{formatNumber(pct, 0)} %</b> · {formatAgo(s.updated_at, now)}
                        </div>
                      </div>
                      <StatusBadge level={s.level} size="sm" />
                    </li>
                  );
                })}
                {sites.length === 0 && <li className="text-sm text-fg-muted">Estado no disponible por el momento.</li>}
              </ul>
              <p className="mt-3 text-[11px] text-fg-faint">Vista pública resumida. El detalle técnico está disponible para el personal autorizado.</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild variant="primary" size="lg">
                <Link href="/login">
                  Acceso del personal <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <a href="#como-funciona">Cómo funciona</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-14">
        <p className="label-caps text-accent">Cómo funciona</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Del sensor en el páramo al teléfono del técnico, en segundos</h2>
        <ol className="relative mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:gap-0">
          {FLOW.map((f, i) => {
            const Icon = f.icon;
            return (
              <li
                key={f.title}
                className="relative flex gap-3 rounded-xl border border-border bg-surface-1 p-4 lg:flex-col lg:rounded-none lg:border-y lg:border-r-0 lg:first:rounded-l-xl lg:first:border-l lg:last:rounded-r-xl lg:last:border-r"
              >
                <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-lg border border-accent/40 bg-accent-soft text-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">
                    <span className="tabular mr-1.5 font-mono text-fg-faint">{String(i + 1).padStart(2, "0")}</span>
                    {f.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">{f.text}</p>
                </div>
                {i < FLOW.length - 1 && (
                  <svg className="absolute top-9 -right-3 z-20 hidden h-3 w-6 text-accent lg:block" viewBox="0 0 24 12" aria-hidden>
                    <path d="M0 6h20" stroke="currentColor" strokeWidth="2" className="animate-flow" />
                    <path d="M18 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Niveles y protocolos */}
      <section id="niveles" className="scroll-mt-16 border-y border-border bg-bg-elevated">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <p className="label-caps text-accent">Niveles de alerta</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Qué significa cada nivel y qué hace cada persona</h2>
          <div className="mt-6 grid gap-2 sm:grid-cols-4" role="tablist" aria-label="Niveles de alerta">
            {ALERT_LEVELS.map((l) => {
              const m = LEVELS[l];
              const Icon = m.icon;
              const on = l === level;
              return (
                <button
                  key={l}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  onClick={() => setLevel(l)}
                  className={cn("rounded-xl border p-4 text-left transition-colors", on ? cn(m.border, m.bg) : "border-border bg-surface-1 hover:bg-surface-2")}
                >
                  <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", m.text)}>
                    <Icon className="size-4" aria-hidden /> {m.label}
                  </span>
                  <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{m.description}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3" role="tabpanel">
            {protocols.map((p) => (
              <div key={`${p.role}-${p.title}`} className="rounded-xl border border-border bg-surface-1 p-4">
                <p className="label-caps">{ROLE_LABEL[p.role as Role] ?? p.role}</p>
                <h3 className="mt-1 text-sm font-semibold">{p.title}</h3>
                <ul className="mt-2 space-y-1 text-xs text-fg-muted">
                  {p.actions.map((a) => (
                    <li key={a} className="flex gap-2">
                      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", LEVELS[level].dot)} aria-hidden />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {protocols.length === 0 && <p className="text-sm text-fg-muted">Protocolos no disponibles.</p>}
          </div>
        </div>
      </section>

      {/* Embalses */}
      <section id="embalses" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-14">
        <p className="label-caps text-accent">Embalses monitoreados</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Infraestructura crítica del agua de Ambato</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {sites.map((s) => {
            const pct = fillPercent(s.curva_area_volumen, s.nivel, Number(s.capacity_m3));
            const ambato = s.routes.find((r) => /ambato/i.test(r.name));
            return (
              <article key={s.slug} className="panel overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b border-border p-4">
                  <div>
                    <h3 className="text-base font-semibold">{s.name}</h3>
                    <p className="text-xs text-fg-faint">{s.river}</p>
                  </div>
                  <StatusBadge level={s.level} size="sm" />
                </div>
                <div className="p-4">
                  <p className="text-sm leading-relaxed text-fg-muted">{s.description}</p>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Altitud", `${formatNumber(Number(s.altitude_m), 0)}`, "m s. n. m."],
                      ["Capacidad", formatHm3(Number(s.capacity_m3)).replace(" hm³", ""), "hm³"],
                      ["Llenado", formatNumber(pct, 0), "%"],
                    ].map(([k, v, u]) => (
                      <div key={k} className="rounded-lg border border-border bg-surface-2 px-2 py-2.5">
                        <dt className="label-caps">{k}</dt>
                        <dd className="tabular mt-1 font-mono text-lg font-semibold">{v}</dd>
                        <dd className="text-[10px] text-fg-faint">{u}</dd>
                      </div>
                    ))}
                  </dl>
                  {s.routes.length > 0 && (
                    <div className="mt-4 rounded-lg border border-border p-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold">
                        <Timer className="size-3.5 text-fg-faint" aria-hidden /> Tiempo estimado de llegada de la onda (escenario de rotura)
                      </p>
                      <ul className="mt-2 grid grid-cols-3 gap-2">
                        {s.routes.map((r) => (
                          <li key={r.name} className="text-center">
                            <div className="tabular font-mono text-sm font-semibold">{formatDuration(r.llegada_min)}</div>
                            <div className="truncate text-[11px] text-fg-faint">{r.name}</div>
                          </li>
                        ))}
                      </ul>
                      {ambato && <p className="mt-2 text-[10.5px] text-fg-faint">Valores referenciales de estudios hidráulicos; se validan con el Gobierno Provincial.</p>}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Contactos y acceso */}
      <section id="contactos" className="scroll-mt-16 border-t border-border bg-bg-elevated">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-[1fr_380px]">
          <div>
            <p className="label-caps text-accent">Contactos de emergencia</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Ante una emergencia, llame primero al 911</h2>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {(branding.contacts ?? []).map((c) => (
                <li key={c.name} className="flex items-center gap-3 rounded-xl border border-border bg-surface-1 p-3">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", c.kind === "emergencia" ? "bg-[var(--lvl-roja-bg)] text-lvl-roja" : "bg-surface-3 text-fg-muted")}>
                    {c.kind === "emergencia" ? <Siren className="size-4" /> : <Phone className="size-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    {/^\d+$/.test(c.phone.replace(/\s/g, "")) ? (
                      <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="tabular font-mono text-sm text-accent">{c.phone}</a>
                    ) : (
                      <span className="text-xs text-fg-faint">{c.phone}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel p-5">
            <ShieldCheck className="size-6 text-accent" aria-hidden />
            <h2 className="mt-3 text-lg font-semibold">Acceso para el personal</h2>
            <p className="mt-1 text-sm text-fg-muted">Sala de operaciones, técnicos de campo y directores de juntas.</p>
            <div className="mt-4 grid gap-2">
              <Button asChild variant="primary" size="lg">
                <Link href="/login?next=/panel">
                  <LayoutDashboard /> Panel de control
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/login?next=/app">
                  <Smartphone /> App de campo
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-fg-faint">
          <span className="inline-flex items-center gap-2">
            <Waves className="size-4" aria-hidden /> {branding.product ?? "GeRiAm"} · {entity}
          </span>
          <span>{branding.unit ?? "Gestión de Riesgos"}</span>
        </div>
      </footer>
    </div>
  );
}
