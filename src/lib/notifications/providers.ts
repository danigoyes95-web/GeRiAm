/**
 * Proveedores de notificación detrás de una interfaz común (NotificationProvider),
 * para poder cambiar Twilio por otro proveedor sin tocar el motor de alertas.
 */
import * as webpush from "web-push";
import type { Admin } from "../runtime/repo";
import type { Tables } from "../supabase/config";

export type NotificationRow = Tables<"notifications">;
export type Channel = "push" | "sms" | "whatsapp" | "email" | "demo";

export interface SendResult {
  status: "enviada" | "entregada" | "fallida" | "demo";
  provider: string;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface NotificationProvider {
  readonly name: string;
  supports(channel: Channel): boolean;
  send(n: NotificationRow): Promise<SendResult>;
}

export interface ProviderConfig {
  vapidPublic?: string | null;
  vapidPrivate?: string | null;
  vapidSubject?: string;
  twilioSid?: string | null;
  twilioToken?: string | null;
  twilioFromSms?: string | null;
  twilioFromWhatsapp?: string | null;
}

export class WebPushProvider implements NotificationProvider {
  readonly name = "web-push";
  private ready: boolean;
  constructor(
    private sb: Admin,
    cfg: ProviderConfig,
  ) {
    this.ready = !!(cfg.vapidPublic && cfg.vapidPrivate);
    if (this.ready) webpush.setVapidDetails(cfg.vapidSubject ?? "mailto:alertas@geriam.ec", cfg.vapidPublic!, cfg.vapidPrivate!);
  }
  supports(c: Channel) {
    return c === "push";
  }
  async send(n: NotificationRow): Promise<SendResult> {
    if (!this.ready) return { status: "demo", provider: "demo-log", error: "VAPID no configurado: registrado sin enviar" };
    const subs = await this.sb.from("push_subscriptions").select("*").eq("user_id", n.user_id ?? n.recipient);
    if (!subs.data?.length) return { status: "fallida", provider: this.name, error: "El usuario no activó notificaciones push en ningún dispositivo" };
    const p = (n.payload ?? {}) as Record<string, unknown>;
    const body = JSON.stringify({ title: n.title, body: n.body, ...p, tag: `alert-${String(p.alert_id ?? n.id)}` });
    let ok = 0;
    const errors: string[] = [];
    for (const s of subs.data) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: "high" });
        ok++;
        await this.sb.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await this.sb.from("push_subscriptions").delete().eq("id", s.id);
        errors.push(String(code ?? "error"));
      }
    }
    return ok > 0
      ? { status: "enviada", provider: this.name, meta: { devices: ok } }
      : { status: "fallida", provider: this.name, error: `Push rechazado (${errors.join(", ")})` };
  }
}

export class TwilioProvider implements NotificationProvider {
  readonly name = "twilio";
  constructor(private cfg: ProviderConfig) {}
  get configured() {
    return !!(this.cfg.twilioSid && this.cfg.twilioToken && (this.cfg.twilioFromSms || this.cfg.twilioFromWhatsapp));
  }
  supports(c: Channel) {
    return c === "sms" || c === "whatsapp";
  }
  async send(n: NotificationRow): Promise<SendResult> {
    if (!/^\+\d{8,15}$/.test(n.recipient)) return { status: "fallida", provider: this.name, error: "Destinatario sin teléfono válido (formato +593…)" };
    const from = n.channel === "whatsapp" ? this.cfg.twilioFromWhatsapp : this.cfg.twilioFromSms;
    if (!from) return { status: "fallida", provider: this.name, error: `Remitente ${n.channel} no configurado` };
    const to = n.channel === "whatsapp" ? `whatsapp:${n.recipient}` : n.recipient;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.cfg.twilioSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.cfg.twilioSid}:${this.cfg.twilioToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: `${n.title}\n${n.body}`.slice(0, 1500) }),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; status?: string };
    if (!res.ok) return { status: "fallida", provider: this.name, error: data.message ?? `HTTP ${res.status}` };
    return { status: "enviada", provider: this.name, meta: { sid: data.sid, twilio_status: data.status } };
  }
}

/** Modo demo: registra el mensaje (visible en el panel) sin enviarlo. */
export class DemoLogProvider implements NotificationProvider {
  readonly name = "demo-log";
  supports() {
    return true;
  }
  async send(): Promise<SendResult> {
    return { status: "demo", provider: this.name, meta: { note: "Modo demo: mensaje registrado, no enviado" } };
  }
}
