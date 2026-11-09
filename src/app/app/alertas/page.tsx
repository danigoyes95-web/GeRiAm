"use client";
import Link from "next/link";
import { BellOff } from "lucide-react";
import { AlertCard } from "@/design";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { AlertCountdown } from "@/components/alerts/AlertCountdown";
import { useCachedLive } from "@/components/app/useCachedLive";
import { sortAlerts } from "@/lib/data/live";
import { alertEta } from "@/lib/data/types";
import { useNow } from "@/lib/hooks/useNow";
import type { AlertLevel } from "@/lib/domain/types";

export default function AppAlertas() {
  const { data, isLoading } = useCachedLive();
  const now = useNow(30_000) ?? undefined;
  const alerts = sortAlerts(data?.alerts ?? []);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Alertas activas</h1>
      {isLoading && !data && <Skeleton className="h-32" />}
      {data && alerts.length === 0 && <EmptyState icon={BellOff} title="Sin alertas activas" description="Le avisaremos por notificación si se activa una alerta en sus zonas." />}
      {alerts.map((a) => (
        <Link key={a.id} href={`/app/alertas/${a.id}`} className="block">
          <AlertCard
            level={a.level as AlertLevel}
            title={a.title}
            siteName={data?.sites.find((s) => s.id === a.site_id)?.name ?? null}
            description={a.description}
            status={a.status}
            startedAt={a.started_at}
            isDrill={!!a.drill_run_id}
            now={now}
            footer={alertEta(a).length ? <AlertCountdown alert={a} drill={data?.drill} /> : null}
          />
        </Link>
      ))}
    </div>
  );
}
