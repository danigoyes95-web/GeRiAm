"use client";
import { CountdownLlegada } from "@/design";
import type { Alert, DrillRun, EtaEntry } from "@/lib/data/types";
import { alertEta } from "@/lib/data/types";
import { useNow } from "@/lib/hooks/useNow";

/** Cuenta regresiva de llegada para una alerta (acelerada si pertenece a un simulacro). */
export function AlertCountdown({ alert, drill, size = "sm", target }: { alert: Alert; drill?: DrillRun | null; size?: "sm" | "md" | "lg"; target?: EtaEntry }) {
  const now = useNow(1000);
  const eta = alertEta(alert);
  const t = target ?? eta.find((e) => /ambato/i.test(e.name)) ?? eta[eta.length - 1];
  if (!t) return null;
  if (alert.drill_run_id && drill && drill.id === alert.drill_run_id) {
    const tv = (alert.trigger_values ?? {}) as { sim_started_min?: number };
    const since = drill.status === "activo" && now ? ((now - new Date(drill.last_step_at).getTime()) / 60_000) * drill.speed : 0;
    const elapsed = Math.max(0, drill.sim_minutes + Math.min(since, 0.2 * drill.speed) - (tv.sim_started_min ?? 0));
    return <CountdownLlegada startedAt={alert.started_at} minutes={t.minutes} target={t.name} simElapsedMin={elapsed} size={size} />;
  }
  return <CountdownLlegada startedAt={alert.started_at} minutes={t.minutes} target={t.name} size={size} />;
}
