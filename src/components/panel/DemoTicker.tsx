"use client";
import { useEffect } from "react";
import { useOrgLive } from "@/lib/data/live";
import { DEMO_MODE } from "@/lib/supabase/config";

/**
 * Fallback de demo: si el cron no está empujando lecturas (> 3 min sin datos),
 * el panel de un admin/operador solicita el tick al servidor cada 60 s.
 * El endpoint exige sesión con rol y tiene anti-rebote contra el cron.
 */
export function DemoTicker({ enabled }: { enabled: boolean }) {
  const { data } = useOrgLive();
  useEffect(() => {
    if (!DEMO_MODE || !enabled) return;
    const tick = () => {
      const last = Math.max(0, ...(data?.sensors ?? []).map((s) => (s.last_reading_at ? new Date(s.last_reading_at).getTime() : 0)));
      if (data && Date.now() - last < 3 * 60_000) return;
      void fetch("/api/sim/tick", { method: "POST" }).catch(() => undefined);
    };
    const first = setTimeout(tick, 5_000);
    const t = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [enabled, data]);
  return null;
}
