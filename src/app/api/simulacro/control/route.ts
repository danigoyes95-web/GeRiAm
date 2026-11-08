import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseJson } from "@/lib/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { HttpError, requireApiRole, OPERATOR_ROLES } from "@/lib/auth/session";
import { controlDrill } from "@/lib/runtime/drill";
import { dispatchPending } from "@/lib/notifications/dispatch";

export const maxDuration = 60;
const Body = z.object({
  drill_id: z.uuid(),
  action: z.enum(["pausar", "reanudar", "velocidad", "adelantar", "reiniciar", "finalizar"]),
  arg: z.number().int().optional(),
});

export const POST = handle(async (req: Request) => {
  const ctx = await requireApiRole(OPERATOR_ROLES);
  const body = await parseJson(req, Body);
  const sb = getAdminClient();
  const d = await sb.from("drill_runs").select("id").eq("id", body.drill_id).eq("organization_id", ctx.profile.organization_id).maybeSingle();
  if (!d.data) throw new HttpError(404, "Simulacro no encontrado");
  const drill = await controlDrill(sb, body.drill_id, body.action, { id: ctx.userId, name: ctx.profile.full_name }, body.arg);
  await dispatchPending(sb);
  return NextResponse.json({ ok: true, drill });
});
