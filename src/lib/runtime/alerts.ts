/**
 * Aplica el resultado del motor de alertas: crea / actualiza / resuelve alertas,
 * planifica notificaciones (por rol, zona y canal) y escala las no confirmadas.
 * Todo queda en geriam.notifications y geriam.audit_log.
 */
import type { AlertLevel } from "../domain/types";
import { dueEscalation, planNotifications, type AlertDraft, type EvalResult, type PolicyStep } from "../alerts/engine";
import { audit, policySteps, recipients, toOpenAlert, type Admin, type AlertRow, type OrgBundle, type SiteRow } from "./repo";

const LEVEL_UP: Record<string, string> = { amarilla: "AMARILLA", naranja: "NARANJA", roja: "ROJA" };

export interface ApplyOptions {
  now: number;
  drillRunId?: string | null;
  /** minutos simulados al momento (simulacro) */
  simMinutes?: number;
}

function etaLine(d: { eta: { name: string; minutes: number }[] }) {
  const first = d.eta.find((e) => /ambato/i.test(e.name)) ?? d.eta[d.eta.length - 1];
  if (!first) return "";
  const h = Math.floor(first.minutes / 60);
  const m = first.minutes % 60;
  return ` Llegada estimada a ${first.name}: ${h ? `${h} h ` : ""}${m} min.`;
}

export async function insertNotifications(
  sb: Admin,
  b: OrgBundle,
  alert: { id: string; level: string; title: string; description: string | null; zone_ids: string[]; eta: unknown },
  step: PolicyStep,
  opts: ApplyOptions,
) {
  const planned = planNotifications(step, alert.zone_ids, recipients(b));
  if (!planned.length) return 0;
  const prefix = opts.drillRunId ? "[SIMULACRO] " : "";
  const eta = Array.isArray(alert.eta) ? etaLine({ eta: alert.eta as { name: string; minutes: number }[] }) : "";
  const rows = planned.map((p) => ({
    organization_id: b.org.id,
    alert_id: alert.id,
    user_id: p.userId,
    channel: p.channel,
    recipient: p.recipient,
    recipient_name: p.name,
    provider: p.channel === "push" ? "web-push" : "twilio",
    status: "pendiente",
    title: `${prefix}Alerta ${LEVEL_UP[alert.level] ?? alert.level} · ${alert.title}`,
    body: `${alert.description ?? ""}${eta}`.trim(),
    payload: { url: `/app/alertas/${alert.id}`, level: alert.level, alert_id: alert.id, drill: !!opts.drillRunId } as never,
    escalation_step: step.step,
    drill_run_id: opts.drillRunId ?? null,
  }));
  const r = await sb.from("notifications").insert(rows);
  if (r.error) throw new Error(`notifications: ${r.error.message}`);
  return rows.length;
}

async function createOrUpdate(sb: Admin, b: OrgBundle, site: SiteRow, d: AlertDraft, opts: ApplyOptions): Promise<void> {
  const nowIso = new Date(opts.now).toISOString();
  const realNow = new Date().toISOString();
  const policies = policySteps(b);
  if (d.existing) {
    // conservar el minuto simulado de inicio: la cuenta regresiva parte del primer disparo
    const keepStart = d.existing.simStartedMin ?? opts.simMinutes;
    const tvKeep = keepStart !== undefined ? { ...d.triggerValues, sim_started_min: keepStart } : d.triggerValues;
    const patch: Partial<AlertRow> = { last_triggered_at: opts.drillRunId ? realNow : nowIso, trigger_values: tvKeep as never };
    if (d.notify) {
      patch.level = d.level;
      patch.title = d.title;
      patch.description = d.description;
      patch.eta = d.eta as never;
      patch.eta_primary_min = d.etaPrimaryMin;
      patch.escalation_step = 0;
      patch.status = "activa";
      // al subir de nivel no se reinicia started_at (la llegada se cuenta desde el primer disparo)
    }
    const r = await sb.from("alerts").update(patch).eq("id", d.existing.id).select("*").single();
    if (r.error) throw new Error(`alert update: ${r.error.message}`);
    if (d.notify) {
      await audit(sb, b.org.id, "alerta.nivel_elevado", "alert", d.existing.id, { level: d.level, from: d.existing.level, title: d.title }, undefined, opts.drillRunId);
      const step0 = policies.find((p) => p.level === d.level && p.step === 0);
      if (step0) await insertNotifications(sb, b, r.data, step0, opts);
    }
    return;
  }
  const tv = opts.simMinutes !== undefined ? { ...d.triggerValues, sim_started_min: opts.simMinutes } : d.triggerValues;
  const ins = await sb
    .from("alerts")
    .insert({
      organization_id: b.org.id,
      site_id: site.id,
      sensor_id: d.sensorId,
      rule_id: d.ruleId,
      level: d.level,
      type: d.type,
      title: d.title,
      description: d.description,
      trigger_values: tv as never,
      eta: d.eta as never,
      eta_primary_min: d.etaPrimaryMin,
      zone_ids: d.zoneIds,
      dedupe_key: d.dedupeKey,
      drill_run_id: opts.drillRunId ?? null,
      started_at: realNow,
      last_triggered_at: realNow,
    })
    .select("*")
    .single();
  if (ins.error) {
    // carrera con otra evaluación: el índice único de dedupe evita duplicados
    if (/duplicate|unique/i.test(ins.error.message)) return;
    throw new Error(`alert insert: ${ins.error.message}`);
  }
  await audit(sb, b.org.id, "alerta.creada", "alert", ins.data.id, { level: d.level, type: d.type, title: d.title, site: site.code }, undefined, opts.drillRunId);
  const step0 = policies.find((p) => p.level === d.level && p.step === 0);
  if (step0) await insertNotifications(sb, b, ins.data, step0, opts);
}

export async function applyEvaluation(sb: Admin, b: OrgBundle, site: SiteRow, result: EvalResult, opts: ApplyOptions) {
  for (const d of result.drafts) await createOrUpdate(sb, b, site, d, opts);
  for (const { alert, reason } of result.resolve) {
    const r = await sb
      .from("alerts")
      .update({ status: "resuelta", resolved_at: new Date().toISOString() })
      .eq("id", alert.id)
      .neq("status", "resuelta");
    if (r.error) throw new Error(`alert resolve: ${r.error.message}`);
    await audit(sb, b.org.id, "alerta.resuelta", "alert", alert.id, { reason, automatic: true }, undefined, opts.drillRunId);
  }
}

/** Escala alertas no confirmadas según la política (minutos sin confirmar → siguiente paso). */
export async function runEscalations(sb: Admin, b: OrgBundle, openAlerts: AlertRow[], opts: ApplyOptions & { simStartMs?: number }) {
  const policies = policySteps(b);
  let n = 0;
  for (const a of openAlerts) {
    if ((a.drill_run_id ?? null) !== (opts.drillRunId ?? null)) continue;
    let startedAt = new Date(a.started_at).getTime();
    const tv = (a.trigger_values ?? {}) as { sim_started_min?: number };
    if (opts.drillRunId && opts.simStartMs !== undefined && tv.sim_started_min !== undefined) startedAt = opts.simStartMs + tv.sim_started_min * 60_000;
    const step = dueEscalation({ level: a.level as AlertLevel, status: a.status, startedAt, escalationStep: a.escalation_step }, policies, opts.now);
    if (!step) continue;
    const r = await sb
      .from("alerts")
      .update({ escalation_step: step.step, status: "escalada", escalated_at: new Date().toISOString() })
      .eq("id", a.id)
      .eq("escalation_step", a.escalation_step)
      .select("*")
      .maybeSingle();
    if (r.error || !r.data) continue;
    await audit(sb, b.org.id, "alerta.escalada", "alert", a.id, { step: step.step, roles: step.roles, channels: step.channels, after_min: step.afterMin }, undefined, opts.drillRunId);
    await insertNotifications(sb, b, r.data, step, opts);
    n++;
  }
  return n;
}

export { toOpenAlert };
