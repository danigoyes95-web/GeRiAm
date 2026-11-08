"use client";
import { Bell, MessageCircle, MessageSquare, Smartphone } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { formatTime } from "@/lib/format";
import type { Notification } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const CH = { push: { icon: Smartphone, label: "Push" }, sms: { icon: MessageSquare, label: "SMS" }, whatsapp: { icon: MessageCircle, label: "WhatsApp" }, email: { icon: Bell, label: "Email" }, demo: { icon: Bell, label: "Demo" } } as const;
const ST: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "text-fg-muted border-border" },
  enviada: { label: "Enviada", cls: "text-lvl-normal border-lvl-normal/40" },
  entregada: { label: "Entregada", cls: "text-lvl-normal border-lvl-normal/40" },
  fallida: { label: "Fallida", cls: "text-lvl-roja border-lvl-roja/40" },
  demo: { label: "Demo (registrada)", cls: "text-accent border-accent/40" },
};

/** Registro de notificaciones con estado de entrega (incluye el modo demo: registradas sin enviar). */
export function NotificationLog({ rows, title = "Notificaciones", className }: { rows: Notification[]; title?: string; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle="Canal · destinatario · estado de entrega" icon={<Bell />} />
      {rows.length === 0 ? (
        <EmptyState title="Sin notificaciones" description="Aparecerán aquí al dispararse una alerta." />
      ) : (
        <div className="scrollbar-thin max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-1 text-fg-faint">
              <tr className="border-b border-border">
                {["Hora", "Canal", "Destinatario", "Mensaje", "Estado"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => {
                const ch = CH[n.channel as keyof typeof CH] ?? CH.demo;
                const st = ST[n.status] ?? ST.pendiente;
                const Icon = ch.icon;
                return (
                  <tr key={n.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="tabular px-3 py-1.5 font-mono text-fg-muted">{formatTime(n.created_at)}</td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1 text-fg"><Icon className="size-3.5 text-fg-faint" /> {ch.label}</span>
                    </td>
                    <td className="px-3 py-1.5 text-fg">{n.recipient_name ?? n.recipient}</td>
                    <td className="max-w-[340px] px-3 py-1.5">
                      <div className="truncate font-medium text-fg">{n.title}</div>
                      <div className="truncate text-fg-faint">{n.body}</div>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[10.5px] font-semibold", st.cls)} title={n.error ?? undefined}>{st.label}</span>
                      {n.error && <div className="mt-0.5 max-w-[180px] truncate text-[10px] text-fg-faint" title={n.error}>{n.error}</div>}
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
