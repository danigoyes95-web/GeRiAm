"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BellPlus,
  CheckCircle2,
  ChevronsUp,
  CircleDot,
  ClipboardList,
  Footprints,
  Loader2,
  MapPinned,
  MessageSquare,
  Navigation,
  Search,
  Send,
  Smartphone,
  Timer,
} from "lucide-react";
import { AlertCard, StatusBadge, TimelineEvento, type TimelineItem } from "@/design";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Input, Label, Select, Skeleton, Textarea } from "@/components/ui/misc";
import { AlertActions, postAlertAction } from "@/components/alerts/AlertActions";
import { AlertCountdown } from "@/components/alerts/AlertCountdown";
import { NotificationLog } from "@/components/alerts/NotificationLog";
import { usePanel } from "@/components/panel/PanelContext";
import { getBrowserClient } from "@/lib/supabase/browser";
import { useOrgLive } from "@/lib/data/live";
import { alertEta, type Alert, type Protocol } from "@/lib/data/types";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { ROLE_LABEL, ROLES, type AlertLevel, type Role } from "@/lib/domain/types";
import { LEVELS } from "@/design/levels";
import { cn } from "@/lib/utils";

type StatusFilter = "abiertas" | "todas" | "resueltas";

export function AlertCenter() {
  const panel = usePanel();
  const { data: live } = useOrgLive();
  const [status, setStatus] = useState<StatusFilter>("abiertas");
  const [level, setLevel] = useState<"" | AlertLevel>("");
  const [siteId, setSiteId] = useState("");
  const [drills, setDrills] = useState(true);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const list = useQuery({
    queryKey: ["alerts-list", status, level, siteId, drills, live?.fetchedAt],
    queryFn: async () => {
      let qb = getBrowserClient().from("alerts").select("*").order("started_at", { ascending: false }).limit(150);
      if (status === "abiertas") qb = qb.neq("status", "resuelta");
      if (status === "resueltas") qb = qb.eq("status", "resuelta");
      if (level) qb = qb.eq("level", level);
      if (siteId) qb = qb.eq("site_id", siteId);
      if (!drills) qb = qb.is("drill_run_id", null);
      const { data, error } = await qb;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const rows = useMemo(() => (list.data ?? []).filter((a) => !q || `${a.title} ${a.description ?? ""}`.toLowerCase().includes(q.toLowerCase())), [list.data, q]);
  const selected = rows.find((a) => a.id === selectedId) ?? rows[0] ?? null;
  const siteName = (id: string | null) => live?.sites.find((s) => s.id === id)?.name ?? "Organización";

  const recent = useQuery({
    queryKey: ["notifications-recent", live?.fetchedAt],
    queryFn: async () => (await getBrowserClient().from("notifications").select("*").order("created_at", { ascending: false }).limit(40)).data ?? [],
  });

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Centro de alertas</h1>
          <p className="text-xs text-fg-muted">Disparo → notificaciones → confirmaciones → escalamientos → resolución. Todo queda en bitácora.</p>
        </div>
        {(panel.role === "admin" || panel.role === "operador") && (
          <Button variant="warning" onClick={() => setManualOpen(true)}>
            <BellPlus /> Notificación manual
          </Button>
        )}
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-2.5 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-faint" />
            <Input aria-label="Buscar" placeholder="Buscar por título o descripción" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-8" />
          </div>
          <Select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="abiertas">Abiertas</option>
            <option value="todas">Todas</option>
            <option value="resueltas">Resueltas</option>
          </Select>
          <Select aria-label="Nivel" value={level} onChange={(e) => setLevel(e.target.value as "" | AlertLevel)}>
            <option value="">Todos los niveles</option>
            <option value="roja">Roja</option>
            <option value="naranja">Naranja</option>
            <option value="amarilla">Amarilla</option>
          </Select>
          <Select aria-label="Embalse" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Todos los embalses</option>
            {live?.sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <label className="inline-flex h-9 items-center gap-2 text-xs text-fg-muted">
            <input type="checkbox" checked={drills} onChange={(e) => setDrills(e.target.checked)} className="accent-[var(--accent)]" /> Incluir simulacros
          </label>
        </CardBody>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="flex max-h-[calc(100dvh-15rem)] min-h-[300px] flex-col overflow-hidden">
          <CardHeader title={`${rows.length} alertas`} subtitle="Más recientes primero" />
          <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-3">
            {list.isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
            {!list.isLoading && rows.length === 0 && <EmptyState title="Sin alertas con estos filtros" />}
            {rows.map((a) => (
              <AlertCard
                key={a.id}
                compact
                level={a.level as AlertLevel}
                title={a.title}
                siteName={siteName(a.site_id)}
                status={a.status}
                startedAt={a.started_at}
                isDrill={!!a.drill_run_id}
                onClick={() => setSelectedId(a.id)}
                className={cn(selected?.id === a.id && "ring-1 ring-accent")}
              />
            ))}
          </div>
        </Card>
        {selected ? <AlertDetail key={selected.id} alert={selected} siteName={siteName(selected.site_id)} /> : <Card><EmptyState title="Seleccione una alerta" /></Card>}
      </div>

      <NotificationLog rows={recent.data ?? []} title="Últimas notificaciones (incluye registro en modo demo)" />
      {manualOpen && <ManualNotification onClose={() => setManualOpen(false)} />}
    </div>
  );
}

function AlertDetail({ alert, siteName }: { alert: Alert; siteName: string }) {
  const panel = usePanel();
  const qc = useQueryClient();
  const { data: live } = useOrgLive();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const detail = useQuery({
    queryKey: ["alert", alert.id, alert.updated_at],
    refetchInterval: 10_000,
    queryFn: async () => {
      const sb = getBrowserClient();
      const [notifs, acks, audit, protocols, profiles] = await Promise.all([
        sb.from("notifications").select("*").eq("alert_id", alert.id).order("created_at"),
        sb.from("alert_acknowledgements").select("*").eq("alert_id", alert.id).order("created_at"),
        sb.from("audit_log").select("*").eq("entity_id", alert.id).order("created_at"),
        sb.from("protocols").select("*").eq("level", alert.level).order("sort"),
        sb.from("profiles").select("id, full_name, role"),
      ]);
      return { notifs: notifs.data ?? [], acks: acks.data ?? [], audit: audit.data ?? [], protocols: (protocols.data ?? []) as Protocol[], profiles: profiles.data ?? [] };
    },
  });
  const who = (id: string | null) => detail.data?.profiles.find((p) => p.id === id)?.full_name ?? "Usuario";
  const items: TimelineItem[] = useMemo(() => {
    if (!detail.data) return [];
    const out: TimelineItem[] = [
      { id: "start", at: alert.started_at, title: `Disparo: ${LEVELS[alert.level as AlertLevel].label}`, detail: alert.description, icon: CircleDot, tone: alert.level as "amarilla" },
    ];
    const groups = new Map<string, typeof detail.data.notifs>();
    for (const n of detail.data.notifs) {
      const k = `${n.escalation_step}-${n.created_at.slice(0, 16)}`;
      groups.set(k, [...(groups.get(k) ?? []), n]);
    }
    for (const [k, g] of groups) {
      const ok = g.filter((n) => n.status === "enviada" || n.status === "entregada").length;
      const demo = g.filter((n) => n.status === "demo").length;
      const fail = g.filter((n) => n.status === "fallida").length;
      out.push({
        id: `n-${k}`,
        at: g[0].created_at,
        title: `${g.length} notificaciones${g[0].escalation_step ? ` · escalamiento paso ${g[0].escalation_step}` : ""}`,
        detail: (
          <span>
            {ok} enviadas · {demo} registradas (demo) · {fail} fallidas — {Array.from(new Set(g.map((n) => n.channel))).join(", ")} a{" "}
            {Array.from(new Set(g.map((n) => n.recipient_name))).slice(0, 4).join(", ")}
            {new Set(g.map((n) => n.recipient_name)).size > 4 ? "…" : ""}
          </span>
        ),
        icon: Send,
        tone: fail && !ok && !demo ? "roja" : "accent",
      });
    }
    const ACK: Record<string, { t: string; icon: typeof CheckCircle2; tone: TimelineItem["tone"] }> = {
      confirmada: { t: "Confirmada", icon: CheckCircle2, tone: "normal" },
      recibido: { t: "Recibido", icon: Smartphone, tone: "accent" },
      en_camino: { t: "En camino", icon: Navigation, tone: "accent" },
      en_sitio: { t: "En sitio", icon: MapPinned, tone: "normal" },
      escalada: { t: "Escalada manualmente", icon: ChevronsUp, tone: "naranja" },
      resuelta: { t: "Resuelta", icon: CheckCircle2, tone: "normal" },
      comentario: { t: "Comentario", icon: MessageSquare, tone: "muted" },
    };
    for (const a of detail.data.acks) {
      const m = ACK[a.action] ?? ACK.comentario;
      out.push({ id: a.id, at: a.created_at, title: `${m.t} · ${who(a.user_id)}`, detail: a.note ?? (a.lat ? `GPS ${a.lat.toFixed(5)}, ${a.lng?.toFixed(5)}` : undefined), icon: m.icon, tone: m.tone });
    }
    for (const e of detail.data.audit.filter((x) => x.action === "alerta.escalada" || x.action === "alerta.nivel_elevado" || (x.action === "alerta.resuelta" && x.actor_id === null))) {
      const d = (e.details ?? {}) as { step?: number; level?: string; reason?: string; after_min?: number };
      out.push({
        id: `a-${e.id}`,
        at: e.created_at,
        title: e.action === "alerta.escalada" ? `Escalamiento automático (paso ${d.step}) — sin confirmación en ${d.after_min} min` : e.action === "alerta.nivel_elevado" ? `Nivel elevado a ${d.level}` : `Resuelta automáticamente`,
        detail: d.reason,
        icon: e.action === "alerta.resuelta" ? CheckCircle2 : ChevronsUp,
        tone: e.action === "alerta.resuelta" ? "normal" : "naranja",
      });
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data, alert]);

  const eta = alertEta(alert);
  const protocolsByRole = (detail.data?.protocols ?? []).reduce<Record<string, Protocol[]>>((acc, p) => ((acc[p.role] ??= []).push(p), acc), {});

  const comment = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      await postAlertAction(alert.id, "comentario", { note: note.trim() });
      setNote("");
      await qc.invalidateQueries({ queryKey: ["alert", alert.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-w-0 space-y-3">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge level={alert.level as AlertLevel} size="lg" />
                {alert.drill_run_id && <span className="rounded border border-lvl-amarilla/50 px-1.5 py-0.5 text-[10px] font-bold text-lvl-amarilla">SIMULACRO</span>}
                <span className="text-xs text-fg-muted">{siteName} · {alert.type} · {alert.status}</span>
              </div>
              <h2 className="mt-2 text-lg font-semibold leading-snug">{alert.title}</h2>
              <p className="mt-1 text-sm text-fg-muted">{alert.description}</p>
              <p className="mt-1 text-[11px] text-fg-faint">
                Inicio {formatDateTime(alert.started_at, undefined, true)}
                {alert.acknowledged_at && ` · Confirmada ${formatDateTime(alert.acknowledged_at)} por ${who(alert.acknowledged_by)}`}
                {alert.resolved_at && ` · Resuelta ${formatDateTime(alert.resolved_at)}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <AlertActions alert={alert} role={panel.role} size="md" showResolve />
            </div>
          </div>
          {eta.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              {eta.map((e) => (
                <div key={e.point_id} className="space-y-1">
                  <AlertCountdown alert={alert} drill={live?.drill} target={e} size="sm" />
                  <p className="text-[10.5px] text-fg-faint">
                    {formatNumber(e.poblacion, 0)} hab. expuestos (ref.) · {formatDuration(e.minutes)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
      <div className="grid gap-3 2xl:grid-cols-2">
        <Card>
          <CardHeader title="Línea de tiempo" icon={<Timer />} />
          <CardBody>
            {detail.isLoading ? <Skeleton className="h-40" /> : <TimelineEvento items={items} />}
            <div className="mt-4 flex gap-2">
              <Input aria-label="Comentario" placeholder="Agregar nota a la bitácora de la alerta" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && comment()} className="h-9" />
              <Button onClick={comment} disabled={sending || !note.trim()}>
                {sending ? <Loader2 className="animate-spin" /> : <MessageSquare />} Anotar
              </Button>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Protocolo · ${LEVELS[alert.level as AlertLevel].label}`} subtitle="Acciones por rol" icon={<ClipboardList />} />
          <CardBody className="space-y-3">
            {Object.keys(protocolsByRole).length === 0 && <EmptyState title="Sin protocolo cargado para este nivel" />}
            {Object.entries(protocolsByRole).map(([role, ps]) => (
              <div key={role} className={cn("rounded-md border p-3", role === panel.role ? "border-accent/50 bg-accent-soft" : "border-border")}>
                <p className="label-caps mb-1.5 flex items-center gap-1.5">
                  <Footprints className="size-3" /> {ROLE_LABEL[role as Role] ?? role} {role === panel.role && "· su rol"}
                </p>
                {ps.map((p) => (
                  <div key={p.id}>
                    <p className="text-sm font-medium">{p.title}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-fg-muted">
                      {(p.actions as string[]).map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
      <NotificationLog rows={detail.data?.notifs ?? []} title="Notificaciones de esta alerta" />
    </div>
  );
}

function ManualNotification({ onClose }: { onClose: () => void }) {
  const { data: live } = useOrgLive();
  const qc = useQueryClient();
  const zones = useQuery({ queryKey: ["zones"], queryFn: async () => (await getBrowserClient().from("zones").select("*").order("code")).data ?? [] });
  const [level, setLevel] = useState<AlertLevel>("amarilla");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [siteId, setSiteId] = useState("");
  const [zoneIds, setZoneIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>(["tecnico", "director_junta"]);
  const [channels, setChannels] = useState<("push" | "sms" | "whatsapp")[]>(["push"]);
  const [busy, setBusy] = useState(false);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/alerts/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, title, message, site_id: siteId || null, zone_ids: zoneIds, roles, channels }),
      });
      const j = (await res.json()) as { error?: string; notifications?: number };
      if (!res.ok) throw new Error(j.error ?? "Error");
      toast.success("Notificación enviada", { description: `${j.notifications ?? 0} mensajes planificados` });
      await qc.invalidateQueries();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Notificación manual">
      <div className="panel max-h-[90dvh] w-full max-w-lg overflow-y-auto p-5">
        <h2 className="text-base font-semibold">Notificación manual</h2>
        <p className="mt-1 text-xs text-fg-muted">Se registra como alerta tipo “manual” y se envía por los canales seleccionados.</p>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <Label>Nivel</Label>
              <Select value={level} onChange={(e) => setLevel(e.target.value as AlertLevel)} className="w-full">
                <option value="amarilla">Amarilla</option>
                <option value="naranja">Naranja</option>
                <option value="roja">Roja</option>
              </Select>
            </label>
            <label className="space-y-1">
              <Label>Embalse (opcional)</Label>
              <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full">
                <option value="">General</option>
                {live?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </label>
          </div>
          <label className="block space-y-1">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Cierre preventivo de vía Pasa–Ambato" />
          </label>
          <label className="block space-y-1">
            <Label>Mensaje</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Instrucciones claras y breves" />
          </label>
          <fieldset>
            <legend className="text-xs font-medium text-fg-muted">Zonas</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {zones.data?.map((z) => (
                <button key={z.id} type="button" onClick={() => setZoneIds(toggle(zoneIds, z.id))} aria-pressed={zoneIds.includes(z.id)} className={cn("rounded-md border px-2 py-1 text-xs", zoneIds.includes(z.id) ? "border-accent bg-accent-soft text-fg" : "border-border text-fg-muted")}>
                  {z.code} · {z.name}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-xs font-medium text-fg-muted">Roles</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ROLES.map((r) => (
                <button key={r} type="button" onClick={() => setRoles(toggle(roles, r))} aria-pressed={roles.includes(r)} className={cn("rounded-md border px-2 py-1 text-xs", roles.includes(r) ? "border-accent bg-accent-soft text-fg" : "border-border text-fg-muted")}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-xs font-medium text-fg-muted">Canales</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(["push", "sms", "whatsapp"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setChannels(toggle(channels, c))} aria-pressed={channels.includes(c)} className={cn("rounded-md border px-2 py-1 text-xs", channels.includes(c) ? "border-accent bg-accent-soft text-fg" : "border-border text-fg-muted")}>
                  {c === "push" ? "Push" : c === "sms" ? "SMS" : "WhatsApp"}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="warning" onClick={send} disabled={busy || title.trim().length < 4 || message.trim().length < 4 || !roles.length || !channels.length}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />} Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
