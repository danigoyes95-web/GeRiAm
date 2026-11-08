import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseJson } from "@/lib/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";
import { HttpError, requireApiRole, PANEL_ROLES } from "@/lib/auth/session";
import { audit, loadOrgBundle, policySteps } from "@/lib/runtime/repo";
import { insertNotifications } from "@/lib/runtime/alerts";
import { dispatchPending } from "@/lib/notifications/dispatch";
import type { Role } from "@/lib/domain/types";

const Body = z.object({
  action: z.enum(["confirmar", "escalar", "resolver", "recibido", "en_camino", "en_sitio", "comentario"]),
  note: z.string().trim().max(1000).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const OPERATOR_ONLY = new Set(["escalar", "resolver"]);
const ACK_ACTION: Record<string, string> = {
  confirmar: "confirmada",
  escalar: "escalada",
  resolver: "resuelta",
  recibido: "recibido",
  en_camino: "en_camino",
  en_sitio: "en_sitio",
  comentario: "comentario",
};

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireApiRole(PANEL_ROLES);
  const body = await parseJson(req, Body);
  const role = ctx.profile.role as Role;
  if (OPERATOR_ONLY.has(body.action) && role !== "admin" && role !== "operador") throw new HttpError(403, "Solo sala de operaciones");
  if (body.action === "confirmar" && role === "observador") throw new HttpError(403, "El observador no confirma alertas");

  // Visibilidad verificada con RLS (cliente del usuario): técnicos/directores solo sus zonas.
  const userSb = await getServerClient();
  const visible = await userSb.from("alerts").select("*").eq("id", id).maybeSingle();
  if (!visible.data) throw new HttpError(404, "Alerta no encontrada");
  const alert = visible.data;
  const sb = getAdminClient();
  const now = new Date().toISOString();

  await sb.from("alert_acknowledgements").insert({
    organization_id: alert.organization_id,
    alert_id: alert.id,
    user_id: ctx.userId,
    action: ACK_ACTION[body.action],
    note: body.note ?? null,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
  });

  if (body.action === "confirmar" && alert.status !== "resuelta" && !alert.acknowledged_at) {
    await sb.from("alerts").update({ status: "confirmada", acknowledged_at: now, acknowledged_by: ctx.userId }).eq("id", alert.id);
  }
  if (body.action === "resolver") {
    await sb.from("alerts").update({ status: "resuelta", resolved_at: now }).eq("id", alert.id);
  }
  if (body.action === "escalar") {
    const b = await loadOrgBundle(sb, alert.organization_id);
    const steps = policySteps(b).filter((p) => p.level === alert.level && p.step > alert.escalation_step).sort((a, z2) => a.step - z2.step);
    const next = steps[0] ?? { level: alert.level as "roja", step: alert.escalation_step + 1, afterMin: 0, roles: ["admin", "operador", "tecnico", "director_junta"], channels: ["push", "sms", "whatsapp"] };
    const up = await sb.from("alerts").update({ status: "escalada", escalated_at: now, escalation_step: next.step }).eq("id", alert.id).select("*").single();
    if (up.data) await insertNotifications(sb, b, up.data, next, { now: Date.now(), drillRunId: alert.drill_run_id });
    await dispatchPending(sb);
  }
  await audit(
    sb,
    alert.organization_id,
    `alerta.${body.action}`,
    "alert",
    alert.id,
    { note: body.note ?? null, lat: body.lat ?? null, lng: body.lng ?? null, level: alert.level },
    { id: ctx.userId, name: ctx.profile.full_name },
    alert.drill_run_id,
  );
  return NextResponse.json({ ok: true });
});
