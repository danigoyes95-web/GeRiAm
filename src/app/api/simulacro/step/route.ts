import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseJson } from "@/lib/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { HttpError, requireApiRole, OPERATOR_ROLES } from "@/lib/auth/session";
import { stepDrill } from "@/lib/runtime/drill";
import { dispatchPending } from "@/lib/notifications/dispatch";

export const maxDuration = 60;
const Body = z.object({ drill_id: z.uuid() });

export const POST = handle(async (req: Request) => {
  const ctx = await requireApiRole(OPERATOR_ROLES);
  const { drill_id } = await parseJson(req, Body);
  const sb = getAdminClient();
  const d = await sb.from("drill_runs").select("*").eq("id", drill_id).eq("organization_id", ctx.profile.organization_id).maybeSingle();
  if (!d.data) throw new HttpError(404, "Simulacro no encontrado");
  if (d.data.status !== "activo") return NextResponse.json({ ok: true, drill: d.data });
  const elapsed = (Date.now() - new Date(d.data.last_step_at).getTime()) / 1000;
  if (elapsed < 1.5) return NextResponse.json({ ok: true, drill: d.data, skipped: true });
  const drill = await stepDrill(sb, drill_id, Math.min(10, elapsed));
  await dispatchPending(sb);
  return NextResponse.json({ ok: true, drill });
});
