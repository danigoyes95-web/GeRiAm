import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseJson } from "@/lib/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireApiRole, OPERATOR_ROLES } from "@/lib/auth/session";
import { audit, loadOrgBundle } from "@/lib/runtime/repo";
import { insertNotifications } from "@/lib/runtime/alerts";
import { dispatchPending } from "@/lib/notifications/dispatch";

const Body = z.object({
  level: z.enum(["amarilla", "naranja", "roja"]),
  title: z.string().trim().min(4).max(140),
  message: z.string().trim().min(4).max(800),
  site_id: z.uuid().nullable().optional(),
  zone_ids: z.array(z.uuid()).default([]),
  roles: z.array(z.enum(["admin", "operador", "tecnico", "director_junta", "observador"])).min(1),
  channels: z.array(z.enum(["push", "sms", "whatsapp"])).min(1),
});

/** Notificación manual a zonas/roles (queda como alerta tipo "manual"). */
export const POST = handle(async (req: Request) => {
  const ctx = await requireApiRole(OPERATOR_ROLES);
  const body = await parseJson(req, Body);
  const sb = getAdminClient();
  const b = await loadOrgBundle(sb, ctx.profile.organization_id);
  const ins = await sb
    .from("alerts")
    .insert({
      organization_id: b.org.id,
      site_id: body.site_id ?? null,
      level: body.level,
      type: "manual",
      title: body.title,
      description: body.message,
      zone_ids: body.zone_ids,
      dedupe_key: `MANUAL:${crypto.randomUUID()}`,
      drill_run_id: b.drill?.id ?? null,
      trigger_values: { by: ctx.profile.full_name, roles: body.roles, channels: body.channels } as never,
      status: "confirmada",
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: ctx.userId,
    })
    .select("*")
    .single();
  if (ins.error) throw new Error(ins.error.message);
  const n = await insertNotifications(sb, b, ins.data, { level: body.level, step: 0, afterMin: 0, roles: body.roles, channels: body.channels }, { now: Date.now(), drillRunId: b.drill?.id ?? null });
  await audit(sb, b.org.id, "notificacion.manual", "alert", ins.data.id, { ...body, recipients: n }, { id: ctx.userId, name: ctx.profile.full_name }, b.drill?.id ?? null);
  const dispatched = await dispatchPending(sb);
  return NextResponse.json({ ok: true, alert: ins.data, notifications: n, dispatched });
});
