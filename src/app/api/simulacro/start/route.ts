import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseJson } from "@/lib/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { HttpError, requireApiRole, OPERATOR_ROLES } from "@/lib/auth/session";
import { startDrill } from "@/lib/runtime/drill";

const Body = z.object({
  site_id: z.uuid(),
  scenario: z.enum(["tormenta", "estructural", "comunicacion", "rotura"]),
  /** rotura de varias presas: embalses adicionales (en orden de falla) */
  extra_site_ids: z.array(z.uuid()).max(5).default([]),
  /** rotura: lo que arrastra la crecida */
  debris: z.enum(["agua", "moderado", "lodo"]).default("agua"),
  speed: z.union([z.literal(30), z.literal(60)]).default(60),
});

export const POST = handle(async (req: Request) => {
  const ctx = await requireApiRole(OPERATOR_ROLES);
  const body = await parseJson(req, Body);
  const sb = getAdminClient();
  const ids = [body.site_id, ...body.extra_site_ids];
  const found = await sb.from("sites").select("id").in("id", ids).eq("organization_id", ctx.profile.organization_id);
  if ((found.data ?? []).length !== new Set(ids).size) throw new HttpError(404, "Embalse no encontrado");
  try {
    const drill = await startDrill(sb, {
      orgId: ctx.profile.organization_id,
      siteId: body.site_id,
      scenario: body.scenario,
      speed: body.speed,
      actor: { id: ctx.userId, name: ctx.profile.full_name },
      extraSiteIds: body.scenario === "rotura" ? body.extra_site_ids : [],
      debris: body.debris,
    });
    return NextResponse.json({ ok: true, drill });
  } catch (e) {
    throw new HttpError(409, e instanceof Error ? e.message : "No se pudo iniciar");
  }
});
