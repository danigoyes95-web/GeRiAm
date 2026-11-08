"use client";
import Link from "next/link";
import { BellOff, BellRing } from "lucide-react";
import { AlertCard } from "@/design";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { AlertActions } from "@/components/alerts/AlertActions";
import { AlertCountdown } from "@/components/alerts/AlertCountdown";
import { sortAlerts, type OrgLive } from "@/lib/data/live";
import { alertEta } from "@/lib/data/types";
import type { AlertLevel, Role } from "@/lib/domain/types";
import { useNow } from "@/lib/hooks/useNow";

export function AlertsColumn({ data, role, className }: { data: OrgLive | undefined; role: Role; className?: string }) {
  const now = useNow(30_000) ?? undefined;
  const alerts = sortAlerts(data?.alerts ?? []);
  const siteName = (id: string | null) => data?.sites.find((s) => s.id === id)?.name.replace("Embalse ", "") ?? null;
  return (
    <Card className={className}>
      <CardHeader
        title="Alertas activas"
        subtitle={alerts.length ? `${alerts.length} abiertas · ordenadas por severidad` : "Sin alertas abiertas"}
        icon={<BellRing />}
        actions={
          <Link href="/panel/alertas" className="text-xs font-medium text-accent hover:underline">
            Centro de alertas
          </Link>
        }
      />
      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-3">
        {!data &&
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        {data && alerts.length === 0 && (
          <EmptyState icon={BellOff} title="Todo en condiciones normales" description="Las alertas aparecerán aquí en tiempo real, ordenadas por severidad." />
        )}
        {alerts.map((a) => (
          <AlertCard
            key={a.id}
            level={a.level as AlertLevel}
            title={a.title}
            siteName={siteName(a.site_id)}
            description={a.description}
            status={a.status}
            startedAt={a.started_at}
            isDrill={!!a.drill_run_id}
            now={now}
            footer={alertEta(a).length ? <AlertCountdown alert={a} drill={data?.drill} /> : null}
            actions={<AlertActions alert={a} role={role} />}
          />
        ))}
      </div>
    </Card>
  );
}
