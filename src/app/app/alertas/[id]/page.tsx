"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, MapPinned, Navigation, Smartphone } from "lucide-react";
import { StatusBadge } from "@/design";
import { LEVELS } from "@/design/levels";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { AlertCountdown } from "@/components/alerts/AlertCountdown";
import { postAlertAction, type AlertAction } from "@/components/alerts/AlertActions";
import { useApp } from "@/components/app/AppContext";
import { useCachedLive } from "@/components/app/useCachedLive";
import { getBrowserClient } from "@/lib/supabase/browser";
import { alertEta, type Protocol } from "@/lib/data/types";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ROLE_LABEL, type AlertLevel, type Role } from "@/lib/domain/types";
import { ORG_LIVE_KEY } from "@/lib/data/live";

const STEPS: { action: AlertAction; label: string; icon: typeof Smartphone }[] = [
  { action: "recibido", label: "Recibido", icon: Smartphone },
  { action: "en_camino", label: "En camino", icon: Navigation },
  { action: "en_sitio", label: "En sitio", icon: MapPinned },
];

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export default function AppAlertDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const app = useApp();
  const qc = useQueryClient();
  const { data: live } = useCachedLive();
  const [busy, setBusy] = useState<AlertAction | null>(null);
  const q = useQuery({
    queryKey: ["app-alert", id],
    refetchInterval: 15_000,
    queryFn: async () => {
      const sb = getBrowserClient();
      const [a, acks, protocols, profiles] = await Promise.all([
        sb.from("alerts").select("*").eq("id", id).maybeSingle(),
        sb.from("alert_acknowledgements").select("*").eq("alert_id", id).order("created_at"),
        sb.from("protocols").select("*").order("sort"),
        sb.from("profiles").select("id, full_name"),
      ]);
      return { alert: a.data, acks: acks.data ?? [], protocols: (protocols.data ?? []) as Protocol[], profiles: profiles.data ?? [] };
    },
  });
  const alert = q.data?.alert ?? live?.alerts.find((a) => a.id === id) ?? null;
  if (q.isLoading && !alert) return <Skeleton className="h-64" />;
  if (!alert) return <EmptyState title="Alerta no disponible" description="Puede que ya se haya resuelto o no corresponda a sus zonas." />;

  const level = alert.level as AlertLevel;
  const myProtocols = (q.data?.protocols ?? []).filter((p) => p.level === level && (p.role === app.role || p.role === "todos"));
  const mine = (q.data?.acks ?? []).filter((a) => a.user_id === app.userId).map((a) => a.action);
  const site = live?.sites.find((s) => s.id === alert.site_id);
  const canAct = app.role !== "observador" && alert.status !== "resuelta";

  const act = async (action: AlertAction) => {
    setBusy(action);
    try {
      const pos = action === "recibido" ? null : await getPosition();
      await postAlertAction(alert.id, action, pos ?? undefined);
      toast.success(`Registrado: ${STEPS.find((s) => s.action === action)?.label}`, { description: pos ? "Con ubicación GPS" : undefined });
      await qc.invalidateQueries({ queryKey: ["app-alert", id] });
      await qc.invalidateQueries({ queryKey: ORG_LIVE_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/app/alertas" className="inline-flex items-center gap-1 text-sm text-fg-muted">
        <ArrowLeft className="size-4" /> Alertas
      </Link>
      <section className={`rounded-xl border p-4 ${LEVELS[level].border} ${LEVELS[level].bg}`}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge level={level} size="lg" />
          {alert.drill_run_id && <span className="rounded border border-lvl-amarilla/60 px-1.5 py-0.5 text-[10px] font-bold text-lvl-amarilla">SIMULACRO</span>}
        </div>
        <h1 className="mt-3 text-lg leading-snug font-semibold">{alert.title}</h1>
        <p className="mt-1 text-sm text-fg-muted">{alert.description}</p>
        <p className="mt-2 text-xs text-fg-faint">
          {site?.name} · desde {formatDateTime(alert.started_at)}
        </p>
      </section>

      {alertEta(alert).length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps">Llegada estimada de la crecida</h2>
          {alertEta(alert).map((e) => (
            <div key={e.point_id}>
              <AlertCountdown alert={alert} drill={live?.drill} target={e} size="md" />
              {e.poblacion ? <p className="mt-0.5 text-[11px] text-fg-faint">{formatNumber(e.poblacion, 0)} habitantes expuestos (ref.)</p> : null}
            </div>
          ))}
        </section>
      )}

      {canAct && (
        <section>
          <h2 className="label-caps mb-2">Su respuesta</h2>
          <div className="grid grid-cols-3 gap-2">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const done = mine.includes(s.action);
              return (
                <Button key={s.action} variant={done ? "secondary" : "primary"} className="h-16 flex-col gap-1" onClick={() => act(s.action)} disabled={!!busy}>
                  {busy === s.action ? <Loader2 className="animate-spin" /> : done ? <CheckCircle2 className="text-lvl-normal" /> : <Icon />}
                  <span className="text-xs">{s.label}</span>
                </Button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-fg-faint">Queda registrado en la bitácora con hora{" "}y ubicación (si la autoriza).</p>
        </section>
      )}

      <section>
        <h2 className="label-caps mb-2">Qué hacer · {ROLE_LABEL[app.role as Role]}</h2>
        {myProtocols.length === 0 ? (
          <p className="text-sm text-fg-muted">Siga las instrucciones de la sala de operaciones.</p>
        ) : (
          myProtocols.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-surface-1 p-4">
              <p className="font-semibold">{p.title}</p>
              <ol className="mt-2 space-y-2">
                {(p.actions as string[]).map((a, i) => (
                  <li key={a} className="flex gap-3 text-sm">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold">{i + 1}</span>
                    {a}
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>

      {(q.data?.acks.length ?? 0) > 0 && (
        <section>
          <h2 className="label-caps mb-2">Respuestas del equipo</h2>
          <ul className="space-y-1.5 text-sm">
            {q.data!.acks.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2">
                <span>
                  {q.data!.profiles.find((p) => p.id === a.user_id)?.full_name ?? "Usuario"} · <b>{a.action.replace("_", " ")}</b>
                </span>
                <span className="tabular shrink-0 font-mono text-xs text-fg-faint">{formatDateTime(a.created_at).slice(11)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
