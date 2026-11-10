"use client";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Database,
  RadioTower,
  Satellite,
  Send,
  Server,
  Siren,
  Smartphone,
  Waves,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { isStale, useOrgLive, useSiteSummaries } from "@/lib/data/live";
import { getBrowserClient } from "@/lib/supabase/browser";
import { formatAgo, formatNumber } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { cn } from "@/lib/utils";

type Health = "ok" | "warn" | "down";

const HEALTH: Record<Health, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  ok: { label: "Operativo", icon: CheckCircle2, cls: "text-lvl-normal" },
  warn: { label: "Degradado", icon: CircleAlert, cls: "text-lvl-amarilla" },
  down: { label: "Caído", icon: CircleX, cls: "text-lvl-roja" },
};

interface Row {
  name: string;
  detail: string;
  metric: string;
  health: Health;
  icon: typeof Database;
}

const COMMIT = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

export function SystemStatus() {
  const { data } = useOrgLive();
  const now = useNow(15_000);
  const summaries = useSiteSummaries(data, now || undefined);

  const db = useQuery({
    queryKey: ["system-db-ping"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const t = performance.now();
      const r = await getBrowserClient().from("organizations").select("id").limit(1);
      if (r.error) throw r.error;
      return Math.round(performance.now() - t);
    },
  });

  const notifs = useQuery({
    queryKey: ["system-notifs"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 864e5).toISOString();
      const r = await getBrowserClient()
        .from("notifications")
        .select("channel, status, error, created_at")
        .gte("created_at", since)
        .limit(5000);
      if (r.error) throw r.error;
      return r.data;
    },
  });

  if (!data || !now) {
    return (
      <div className="space-y-3 p-3 sm:p-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const sensors = data.sensors;
  const lastReading = sensors.reduce(
    (m, s) => Math.max(m, s.last_reading_at ? Date.parse(s.last_reading_at) : 0),
    0,
  );
  const ingestAge = (now - lastReading) / 60000;
  const reporting = sensors.filter((s) => !isStale(s, now)).length;
  const gwOnline = data.gateways.filter((g) => g.status !== "offline").length;

  const n = notifs.data ?? [];
  // "sin dispositivo": el destinatario no activó push; no es una falla de la plataforma
  const noDevice = (x: { status: string; error: string | null }) =>
    x.status === "fallida" && /no activó/i.test(x.error ?? "");
  const realFail = (x: { status: string; error: string | null }) => x.status === "fallida" && !noDevice(x);
  const failed = n.filter(realFail).length;
  const stuck = n.filter(
    (x) => x.status === "pendiente" && now - Date.parse(x.created_at) > 5 * 60000,
  ).length;
  const byChannel = (c: string) => n.filter((x) => x.channel === c);
  const channelHealth = (c: string): { metric: string; detail: string; health: Health } => {
    const list = byChannel(c);
    const demo = list.length > 0 && list.every((x) => x.status === "demo");
    const fail = list.filter((x) => x.status === "fallida").length;
    return {
      metric: `${list.length} en 24 h`,
      detail: demo
        ? "Modo demostración: se registra sin enviar (faltan credenciales Twilio)"
        : fail
          ? `${fail} envíos fallidos`
          : list.length
            ? "Entregando"
            : "Sin envíos en 24 h",
      health: fail && fail === list.length ? "down" : fail ? "warn" : "ok",
    };
  };

  const rows: Row[] = [
    {
      name: "Base de datos (Supabase)",
      icon: Database,
      metric: db.data !== undefined ? `${db.data} ms` : db.isError ? "sin respuesta" : "…",
      detail: "Consulta de ida y vuelta desde este navegador",
      health: db.isError ? "down" : (db.data ?? 0) > 1500 ? "warn" : "ok",
    },
    {
      name: "Ingesta de telemetría",
      icon: Activity,
      metric: lastReading ? formatAgo(lastReading, now) : "sin datos",
      detail: "Última lectura recibida (ciclo cada 60 s)",
      health: ingestAge > 10 ? "down" : ingestAge > 3 ? "warn" : "ok",
    },
    {
      name: "Sensores",
      icon: Waves,
      metric: `${reporting} / ${sensors.length}`,
      detail: "Reportando dentro de 3× su intervalo",
      health:
        reporting === sensors.length ? "ok" : reporting / Math.max(1, sensors.length) > 0.8 ? "warn" : "down",
    },
    {
      name: "Gateways LoRaWAN",
      icon: RadioTower,
      metric: `${gwOnline} / ${data.gateways.length}`,
      detail: data.gateways
        .map(
          (g) =>
            `${g.name.replace("Gateway LoRaWAN ", "")}: ${g.last_seen_at ? formatAgo(g.last_seen_at, now) : "—"}`,
        )
        .join(" · "),
      health: gwOnline === data.gateways.length ? "ok" : gwOnline ? "warn" : "down",
    },
    ...summaries.map<Row>((s) => {
      const lat = s.starlink?.last_value;
      return {
        name: `Enlace Starlink · ${s.site.name.replace("Embalse ", "")}`,
        icon: Satellite,
        metric:
          s.linkOnline && lat !== null && lat !== undefined
            ? `${formatNumber(Number(lat), 0)} ms`
            : "sin enlace",
        detail: s.linkOnline
          ? Number(lat) > 150
            ? "Latencia alta"
            : "Latencia normal"
          : "La presa no reporta: se muestra el último valor conocido",
        health: !s.linkOnline ? "down" : Number(lat) > 150 ? "warn" : "ok",
      };
    }),
    {
      name: "Despacho de notificaciones",
      icon: Send,
      metric: `${n.length} en 24 h`,
      detail:
        failed || stuck
          ? `${failed} fallidas · ${stuck} pendientes > 5 min`
          : "Sin fallas ni envíos atascados",
      health: stuck ? "down" : failed ? "warn" : "ok",
    },
    { name: "Web Push (app de campo)", icon: Smartphone, ...channelHealth("push") },
    { name: "SMS", icon: Send, ...channelHealth("sms") },
    { name: "WhatsApp", icon: Send, ...channelHealth("whatsapp") },
    {
      name: "Simulacro",
      icon: Siren,
      metric: data.drill ? (data.drill.status === "pausado" ? "en pausa" : "en curso") : "ninguno",
      detail: data.drill
        ? "Las lecturas y alertas del simulacro están separadas de la operación real"
        : "Operación real",
      health: "ok",
    },
  ];

  const worst: Health = rows.some((r) => r.health === "down")
    ? "down"
    : rows.some((r) => r.health === "warn")
      ? "warn"
      : "ok";
  const issues = rows.filter((r) => r.health !== "ok").length;
  const W = HEALTH[worst];

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Estado del sistema</h1>
        <p className="text-fg-muted text-xs">
          Salud de la plataforma, la red de campo y los canales de notificación. Se actualiza solo.
        </p>
      </div>

      <Card
        className={cn(
          "flex items-center gap-3 p-4",
          worst === "ok"
            ? "border-lvl-normal/40"
            : worst === "warn"
              ? "border-lvl-amarilla/40"
              : "border-lvl-roja/40",
        )}
      >
        <W.icon className={cn("size-8 shrink-0", W.cls)} aria-hidden />
        <div className="min-w-0">
          <div className="font-semibold">
            {worst === "ok"
              ? "Todos los sistemas operativos"
              : `${issues} ${issues === 1 ? "componente requiere" : "componentes requieren"} atención`}
          </div>
          <div className="text-fg-muted text-xs">
            Se verifica cada 15 s · Aplicación {COMMIT ? `versión ${COMMIT}` : "en desarrollo"} · Zona horaria
            America/Guayaquil
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Componentes" subtitle={`${rows.length} monitoreados`} icon={<Server />} />
        <ul className="divide-border divide-y">
          {rows.map((r) => {
            const h = HEALTH[r.health];
            return (
              <li key={r.name} className="flex items-center gap-3 px-4 py-2.5">
                <r.icon className="text-fg-faint size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.name}</div>
                  <div className="text-fg-faint text-[11px]">{r.detail}</div>
                </div>
                <div className="tabular text-fg-muted shrink-0 text-right font-mono text-xs">{r.metric}</div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center justify-end gap-1 text-xs font-medium sm:w-24",
                    h.cls,
                  )}
                  title={h.label}
                >
                  <h.icon className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">{h.label}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
