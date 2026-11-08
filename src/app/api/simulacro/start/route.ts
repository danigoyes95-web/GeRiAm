import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseJson } from "@/lib/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { HttpError, requireApiRole, OPERATOR_ROLES } from "@/lib/auth/session";
import { startDrill } from "@/lib/runtime/drill";

const Body = z.object({
  site_id: z.uuid(),
  scenario: z.enum(["tormenta", "estructural", "comunicacion"]),
  speed: z.union([z.literal(30), z.literal(60)]).default(60),
});

export const POST = handle(async (req: Request) => {
  const ctx = await requireApiRole(OPERATOR_ROLES);
  const body = await parseJson(req, Body);
  const sb = getAdminClient();
  const site = await sb.from("sites").select("id").eq("id", body.site_id).eq("organization_id", ctx.profile.organization_id).maybeSingle();
  if (!site.data) throw new HttpError(404, "Embalse no encontrado");
  try {
    const drill = await startDrill(sb, {
      orgId: ctx.profile.organization_id,
      siteId: body.site_id,
      scenario: body.scenario,
      speed: body.speed,
      actor: { id: ctx.userId, name: ctx.profile.full_name },
    });
    return NextResponse.json({ ok: true, drill });
  } catch (e) {
    throw new HttpError(409, e instanceof Error ? e.message : "No se pudo iniciar");
  }
});
