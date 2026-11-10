"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpCircle,
  BellPlus,
  CheckCircle2,
  Download,
  FastForward,
  Flag,
  Gauge,
  MapPin,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Search,
  Send,
  ShieldCheck,
  Siren,
  Smartphone,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, Input, SegmentedControl, Skeleton } from "@/components/ui/misc";
import { TimelineEvento, type TimelineItem } from "@/design";
import { LEVELS } from "@/design/levels";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { AuditEntry } from "@/lib/data/types";
import type { AlertLevel } from "@/lib/domain/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Cat = "todas" | "alerta" | "simulacro" | "incidente" | "notificacion";
type Origin = "todos" | "real" | "simulacro";
type Range = "24h" | "7d" | "30d";

const RANGE_MS: Record<Range, number> = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5 };

const SCENARIO: Record<string, string> = {
  tormenta: "Tormenta extrema",
  estructural: "Anomalía estructural",
  comunicacion: "Pérdida de comunicación",
};

type D = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const lvl = (v: unknown) => LEVELS[(v as AlertLevel) in LEVELS ? (v as AlertLevel) : "amarilla"];
const lvlTone = (v: unknown): TimelineItem["tone"] => (["amarilla", "naranja", "roja"].includes(str(v)) ? (v as "roja") : "accent");

/** Traduce una acción de la bitácora a título, detalle, ícono y tono. */
function describe(e: AuditEntry): { title: string; detail?: string; icon: LucideIcon; tone: TimelineItem["tone"] } {
  const d = (e.details ?? {}) as D;
  const note = d.note ? ` · “${str(d.note)}”` : "";
  switch (e.action) {
    case "alerta.creada":
      return { title: `${lvl(d.level).label} emitida`, detail: [str(d.title), str(d.site)].filter(Boolean).join(" · "), icon: BellPlus, tone: lvlTone(d.level) };
    case "alerta.nivel_elevado":
      return { title: `Elevada a ${lvl(d.level).label.toLowerCase()}`, detail: `${str(d.title)} · antes: ${lvl(d.from).short.toLowerCase()}`, icon: ArrowUpCircle, tone: lvlTone(d.level) };
    case "alerta.resuelta":
      return { title: "Alerta resuelta", detail: d.automatic ? `Resolución automática${d.reason ? `: ${str(d.reason)}` : ""}` : undefined, icon: CheckCircle2, tone: "normal" };
    case "alerta.escalada":
      return { title: `Escalamiento automático · paso ${str(d.step)}`, detail: `A ${(d.roles as string[] | undefined)?.join(", ") ?? "—"} por ${(d.channels as string[] | undefined)?.join(", ") ?? "—"}`, icon: Send, tone: "naranja" };
    case "alerta.escalar":
      return { title: "Alerta escalada manualmente", detail: note.slice(3) || undefined, icon: Send, tone: "naranja" };
    case "alerta.confirmar":
      return { title: "Alerta confirmada por operador", detail: note.slice(3) || undefined, icon: ShieldCheck, tone: "normal" };
    case "alerta.resolver":
      return { title: "Alerta cerrada por operador", detail: note.slice(3) || undefined, icon: CheckCircle2, tone: "normal" };
    case "alerta.recibido":
      return { title: "Recepción confirmada en campo", detail: note.slice(3) || undefined, icon: Smartphone, tone: "accent" };
    case "alerta.en_camino":
      return { title: "Personal en camino", detail: note.slice(3) || undefined, icon: MapPin, tone: "accent" };
    case "alerta.en_sitio":
      return { title: "Personal en sitio", detail: d.lat ? `GPS ${Number(d.lat).toFixed(5)}, ${Number(d.lng).toFixed(5)}${note}` : note.slice(3) || undefined, icon: MapPin, tone: "normal" };
    case "alerta.comentario":
      return { title: "Comentario en alerta", detail: str(d.note), icon: MessageSquare, tone: "muted" };
    case "notificacion.manual":
      return { title: "Notificación manual enviada", detail: [str(d.title), d.recipients ? `${str(d.recipients)} destinatarios` : ""].filter(Boolean).join(" · "), icon: Send, tone: lvlTone(d.level) };
    case "incidente.reportado":
      return { title: "Incidente reportado desde campo", detail: `${str(d.type).replace(/_/g, " ")}${d.gps ? " · con GPS" : ""}`, icon: TriangleAlert, tone: "amarilla" };
    case "simulacro.iniciado":
      return { title: `Simulacro iniciado: ${SCENARIO[str(d.scenario)] ?? str(d.scenario)}`, detail: `${str(d.site)} · velocidad x${str(d.speed)}`, icon: Siren, tone: "accent" };
    case "simulacro.fase":
      return { title: `Simulacro · ${str(d.narrative) || str(d.phase)}`, detail: `Minuto simulado ${str(d.sim_min)}`, icon: Flag, tone: "muted" };
    case "simulacro.pausado":
      return { title: "Simulacro en pausa", icon: Pause, tone: "muted" };
    case "simulacro.reanudado":
      return { title: "Simulacro reanudado", icon: Play, tone: "muted" };
    case "simulacro.velocidad":
      return { title: `Velocidad del simulacro: x${str(d.speed)}`, icon: Gauge, tone: "muted" };
    case "simulacro.adelantado":
      return { title: `Simulacro adelantado ${str(d.minutes)} min`, icon: FastForward, tone: "muted" };
    case "simulacro.finalizado":
      return { title: "Simulacro finalizado", detail: `${str(d.sim_minutes)} min simulados`, icon: Flag, tone: "normal" };
    case "simulacro.reiniciado":
      return { title: "Simulacro reiniciado", detail: "Datos del simulacro descartados (la bitácora se conserva)", icon: RotateCcw, tone: "muted" };
    default:
      return { title: e.action, icon: ScrollText, tone: "muted" };
  }
}

const category = (a: string): Exclude<Cat, "todas"> =>
  a.startsWith("simulacro.") ? "simulacro" : a.startsWith("incidente.") ? "incidente" : a.startsWith("notificacion.") ? "notificacion" : "alerta";

function toCsv(rows: AuditEntry[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = ["fecha_hora", "origen", "accion", "descripcion", "detalle", "responsable"];
  const lines = rows.map((e) => {
    const x = describe(e);
    return [formatDateTime(e.created_at, undefined, true), e.drill_run_id ? "simulacro" : "real", e.action, x.title, x.detail ?? "", e.actor_name ?? "Sistema GeRiAm"].map(esc).join(";");
  });
  return "﻿" + [head.join(";"), ...lines].join("\r\n");
}

export function AuditLog() {
  const [cat, setCat] = useState<Cat>("todas");
  const [origin, setOrigin] = useState<Origin>("todos");
  const [range, setRange] = useState<Range>("7d");
  const [q, setQ] = useState("");

  const log = useQuery({
    queryKey: ["audit_log", range],
    refetchInterval: 15_000,
    queryFn: async () => {
      const since = new Date(Date.now() - RANGE_MS[range]).toISOString();
      const r = await getBrowserClient().from("audit_log").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(1000);
      if (r.error) throw r.error;
      return r.data;
    },
  });

  const all = useMemo(() => log.data ?? [], [log.data]);
  const counts = useMemo(() => {
    const c: Record<Cat, number> = { todas: 0, alerta: 0, simulacro: 0, incidente: 0, notificacion: 0 };
    for (const e of all) {
      if (origin === "real" && e.drill_run_id) continue;
      if (origin === "simulacro" && !e.drill_run_id) continue;
      c.todas++;
      c[category(e.action)]++;
    }
    return c;
  }, [all, origin]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((e) => {
      if (origin === "real" && e.drill_run_id) return false;
      if (origin === "simulacro" && !e.drill_run_id) return false;
      if (cat !== "todas" && category(e.action) !== cat) return false;
      if (!needle) return true;
      const x = describe(e);
      return `${x.title} ${x.detail ?? ""} ${e.actor_name ?? ""}`.toLowerCase().includes(needle);
    });
  }, [all, cat, origin, q]);

  const days = useMemo(() => {
    const m = new Map<string, TimelineItem[]>();
    for (const e of rows) {
      const k = formatDate(e.created_at);
      const x = describe(e);
      const actor = e.actor_name && e.actor_name !== "Sistema GeRiAm" ? e.actor_name : "Sistema GeRiAm (automático)";
      m.set(k, [
        ...(m.get(k) ?? []),
        {
          id: String(e.id),
          at: e.created_at,
          title: x.title,
          icon: x.icon,
          tone: x.tone,
          detail: (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {e.drill_run_id && <span className="rounded border border-accent/40 px-1 text-[10px] font-semibold tracking-wide text-accent">SIMULACRO</span>}
              {x.detail && <span>{x.detail}</span>}
              <span className="text-fg-faint">· {actor}</span>
            </span>
          ),
        },
      ]);
    }
    return Array.from(m.entries());
  }, [rows]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `geriam-bitacora-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const CATS: { value: Cat; label: string }[] = [
    { value: "todas", label: "Todo" },
    { value: "alerta", label: "Alertas" },
    { value: "simulacro", label: "Simulacros" },
    { value: "incidente", label: "Incidentes" },
    { value: "notificacion", label: "Notificaciones" },
  ];

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Bitácora</h1>
        <p className="text-xs text-fg-muted">
          Registro inmutable de todo lo ocurrido: alertas, escalamientos, acciones del personal, incidentes de campo y simulacros. Nadie puede editar ni borrar una entrada.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Eventos"
          subtitle={log.isLoading ? "Cargando…" : `${rows.length} eventos en ${range === "24h" ? "las últimas 24 h" : range === "7d" ? "los últimos 7 días" : "los últimos 30 días"}`}
          icon={<ScrollText />}
          actions={
            <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              <Download /> <span className="hidden sm:inline">Exportar CSV</span>
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
            <Input className="pl-8" placeholder="Buscar en la bitácora" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
          </div>
          <SegmentedControl<Range>
            label="Periodo"
            value={range}
            onChange={setRange}
            options={[
              { value: "24h", label: "24 h" },
              { value: "7d", label: "7 días" },
              { value: "30d", label: "30 días" },
            ]}
          />
          <SegmentedControl<Origin>
            label="Origen"
            value={origin}
            onChange={setOrigin}
            options={[
              { value: "todos", label: "Todo" },
              { value: "real", label: "Operación real" },
              { value: "simulacro", label: "Simulacros" },
            ]}
          />
          <div className="flex w-full gap-1.5 overflow-x-auto pb-0.5 lg:ml-auto lg:w-auto">
            {CATS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCat(c.value)}
                aria-pressed={cat === c.value}
                className={cn(
                  "h-7 shrink-0 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  cat === c.value ? "border-accent/50 bg-accent-soft text-accent" : "border-border text-fg-muted hover:text-fg",
                )}
              >
                {c.label} <span className="tabular font-mono text-fg-faint">{counts[c.value]}</span>
              </button>
            ))}
          </div>
        </div>
        <CardBody>
          {log.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : log.isError ? (
            <EmptyState title="No se pudo cargar la bitácora" description="Revisa tu conexión e intenta de nuevo." />
          ) : !days.length ? (
            <EmptyState title="Sin eventos" description="No hay registros para los filtros seleccionados. Prueba con un periodo más amplio." />
          ) : (
            <div className="space-y-6">
              {days.map(([day, items]) => (
                <section key={day}>
                  <h3 className="sticky top-0 z-20 mb-3 bg-surface-1/95 py-1 text-[11px] font-semibold tracking-wider text-fg-faint uppercase backdrop-blur">
                    {day} · {items.length} eventos
                  </h3>
                  <TimelineEvento items={items} />
                </section>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
