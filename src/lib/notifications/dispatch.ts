import type { Admin } from "../runtime/repo";
import { DemoLogProvider, TwilioProvider, WebPushProvider, type NotificationProvider, type NotificationRow, type ProviderConfig, type SendResult, type Channel } from "./providers";

/** Secretos: primero variables de entorno; si faltan, geriam.app_secrets (solo service_role). */
export async function loadProviderConfig(sb: Admin): Promise<ProviderConfig> {
  const r = await sb.from("app_secrets").select("name, value");
  const db = Object.fromEntries((r.data ?? []).map((x) => [x.name, x.value]));
  const pick = (env: string, key: string) => process.env[env] || db[key] || null;
  return {
    vapidPublic: pick("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "vapid_public_key"),
    vapidPrivate: pick("VAPID_PRIVATE_KEY", "vapid_private_key"),
    vapidSubject: process.env.VAPID_SUBJECT || db.vapid_subject || "mailto:alertas@geriam.ec",
    twilioSid: pick("TWILIO_ACCOUNT_SID", "twilio_account_sid"),
    twilioToken: pick("TWILIO_AUTH_TOKEN", "twilio_auth_token"),
    twilioFromSms: pick("TWILIO_FROM_SMS", "twilio_from_sms"),
    twilioFromWhatsapp: pick("TWILIO_FROM_WHATSAPP", "twilio_from_whatsapp"),
  };
}

export async function getSecret(sb: Admin, name: string): Promise<string | null> {
  const r = await sb.from("app_secrets").select("value").eq("name", name).maybeSingle();
  return r.data?.value ?? null;
}

/** Despacha notificaciones pendientes. Reclama cada fila para evitar dobles envíos. */
export async function dispatchPending(sb: Admin, limit = 300) {
  const cfg = await loadProviderConfig(sb);
  const push = new WebPushProvider(sb, cfg);
  const twilio = new TwilioProvider(cfg);
  const demo = new DemoLogProvider();
  const providerFor = (c: Channel): NotificationProvider => (push.supports(c) ? push : twilio.supports(c) && twilio.configured ? twilio : demo);

  const pending = await sb.from("notifications").select("*").eq("status", "pendiente").order("created_at").limit(limit);
  if (pending.error) throw new Error(pending.error.message);
  const counts: Record<string, number> = {};
  await Promise.all(
    (pending.data ?? []).map(async (n: NotificationRow) => {
      const claim = await sb.from("notifications").update({ attempts: n.attempts + 1 }).eq("id", n.id).eq("status", "pendiente").eq("attempts", n.attempts).select("id");
      if (!claim.data?.length) return;
      const provider = providerFor(n.channel as Channel);
      let r: SendResult;
      try {
        r = await provider.send(n);
      } catch (e) {
        r = { status: "fallida", provider: provider.name, error: e instanceof Error ? e.message : String(e) };
      }
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      await sb
        .from("notifications")
        .update({
          status: r.status,
          provider: r.provider,
          error: r.error ?? null,
          sent_at: r.status === "enviada" || r.status === "demo" ? new Date().toISOString() : null,
          payload: { ...((n.payload ?? {}) as Record<string, unknown>), ...(r.meta ? { delivery: r.meta } : {}) } as never,
        })
        .eq("id", n.id);
    }),
  );
  return { processed: pending.data?.length ?? 0, counts };
}
