"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff, CheckCircle2, Download, Loader2, LogOut, Share, Smartphone, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/misc";
import { useApp } from "@/components/app/AppContext";
import { getBrowserClient } from "@/lib/supabase/browser";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/push/client";
import { ROLE_LABEL } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const CHANNELS = [
  { id: "push", label: "Notificación push" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "sms", label: "SMS" },
] as const;

export default function PerfilPage() {
  const app = useApp();
  const [support, setSupport] = useState<PushSupport>("ok");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(app.phone ?? "");
  const [channels, setChannels] = useState<string[]>(app.channels);
  const [saving, setSaving] = useState(false);
  const zones = useQuery({ queryKey: ["zones"], queryFn: async () => (await getBrowserClient().from("zones").select("*").order("code")).data ?? [] });

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const s = pushSupport();
      const sub = s === "ok" ? await currentSubscription().catch(() => null) : null;
      if (!alive) return;
      setSupport(s);
      setSubscribed(!!sub);
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
        toast.success("Notificaciones desactivadas en este dispositivo");
      } else {
        await enablePush();
        setSubscribed(true);
        toast.success("Notificaciones activadas", { description: "Recibirá las alertas de sus zonas en este dispositivo." });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar");
      setSupport(pushSupport());
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const clean = phone.replace(/[\s-]/g, "");
    if (clean && !/^\+\d{8,15}$/.test(clean)) {
      toast.error("Use formato internacional, por ejemplo +593987654321");
      return;
    }
    setSaving(true);
    const { error } = await getBrowserClient().from("profiles").update({ phone: clean || null, channels }).eq("id", app.userId);
    setSaving(false);
    if (error) toast.error("No se pudo guardar");
    else toast.success("Preferencias guardadas");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{app.name}</h1>
        <p className="text-sm text-fg-muted">{ROLE_LABEL[app.role]}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(zones.data ?? [])
            .filter((z) => app.zoneIds.includes(z.id))
            .map((z) => (
              <span key={z.id} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted">
                {z.code} · {z.name}
              </span>
            ))}
          {app.zoneIds.length === 0 && <span className="text-xs text-fg-faint">Todas las zonas (vista institucional)</span>}
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface-1 p-4">
        <div className="flex items-start gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", subscribed ? "bg-[var(--lvl-normal-bg)] text-lvl-normal" : "bg-surface-3 text-fg-muted")}>
            {subscribed ? <Bell className="size-5" /> : <BellOff className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Notificaciones en este teléfono</h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              {subscribed ? "Activas: recibirá las alertas aunque la app esté cerrada." : "Actívelas para recibir las alertas al instante."}
            </p>
          </div>
        </div>
        {support === "ok" && (
          <Button className="mt-4 w-full" size="lg" variant={subscribed ? "secondary" : "primary"} onClick={toggle} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : subscribed ? <BellOff /> : <Bell />}
            {subscribed ? "Desactivar notificaciones" : "Activar notificaciones"}
          </Button>
        )}
        {support === "ios-instalar" && (
          <div className="mt-4 rounded-lg border border-accent/40 bg-accent-soft p-3 text-sm">
            <p className="font-semibold">En iPhone, primero instale la app:</p>
            <ol className="mt-2 space-y-2 text-fg-muted">
              <li className="flex gap-2"><Share className="size-4 shrink-0 text-accent" /> Toque <b className="text-fg">Compartir</b> en la barra de Safari.</li>
              <li className="flex gap-2"><SquarePlus className="size-4 shrink-0 text-accent" /> Elija <b className="text-fg">“Añadir a pantalla de inicio”</b>.</li>
              <li className="flex gap-2"><Smartphone className="size-4 shrink-0 text-accent" /> Abra <b className="text-fg">GeRiAm</b> desde el ícono y vuelva a esta pantalla.</li>
            </ol>
            <p className="mt-2 text-xs text-fg-faint">Requiere iOS 16.4 o superior.</p>
          </div>
        )}
        {support === "bloqueado" && (
          <p className="mt-4 rounded-lg border border-lvl-naranja/40 bg-[var(--lvl-naranja-bg)] p-3 text-sm text-lvl-naranja">
            Las notificaciones están bloqueadas para este sitio. Habilítelas en los ajustes del navegador (Configuración del sitio → Notificaciones → Permitir) y recargue.
          </p>
        )}
        {support === "sin-soporte" && (
          <p className="mt-4 text-sm text-fg-muted">
            Este navegador no admite notificaciones push. En Android use Chrome; en iPhone, Safari con la app añadida a la pantalla de inicio.
          </p>
        )}
        <details className="mt-3 text-xs text-fg-faint">
          <summary className="cursor-pointer">Instalar en Android</summary>
          <p className="mt-1.5 flex gap-2">
            <Download className="size-4 shrink-0" /> En Chrome, menú ⋮ → <b>Instalar aplicación</b> (o “Añadir a pantalla de inicio”).
          </p>
        </details>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
        <h2 className="font-semibold">Canales y teléfono</h2>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Teléfono (WhatsApp / SMS)</Label>
          <Input id="phone" inputMode="tel" autoComplete="tel" placeholder="+593 98 765 4321" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-fg-muted">Recibir alertas por</legend>
          {CHANNELS.map((c) => (
            <label key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm">
              {c.label}
              <input
                type="checkbox"
                className="size-5 accent-[var(--accent)]"
                checked={channels.includes(c.id)}
                onChange={() => setChannels((cs) => (cs.includes(c.id) ? cs.filter((x) => x !== c.id) : [...cs, c.id]))}
              />
            </label>
          ))}
        </fieldset>
        <p className="text-[11px] text-fg-faint">En alerta roja se usan todos los canales disponibles.</p>
        <Button className="w-full" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Guardar preferencias
        </Button>
      </section>

      <form action="/auth/signout" method="post">
        <Button type="submit" variant="ghost" className="w-full">
          <LogOut /> Cerrar sesión
        </Button>
      </form>
    </div>
  );
}
