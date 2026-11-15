import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { handle, parseJson } from "@/lib/api";
import { HttpError, requireApiRole } from "@/lib/auth/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/runtime/repo";

const Create = z.object({
  name: z.string().trim().min(3).max(80),
  kind: z.enum(["chirpstack", "ttn", "generic", "scada"]),
  hmac: z.boolean().default(true),
});
const Toggle = z.object({ id: z.uuid(), enabled: z.boolean() });

/** Crea una integración de ingesta. El token (y el secreto HMAC) se muestran una sola vez; se guarda el SHA-256 del token. */
export const POST = handle(async (req: Request) => {
  const ctx = await requireApiRole(["admin"]);
  const body = await parseJson(req, Create);
  const token = `grm_${randomBytes(32).toString("base64url")}`;
  const hmacSecret = body.hmac ? randomBytes(32).toString("hex") : null;
  const sb = getAdminClient();
  const ins = await sb
    .from("integrations")
    .insert({
      organization_id: ctx.profile.organization_id,
      kind: body.kind,
      name: body.name,
      token_hash: createHash("sha256").update(token).digest("hex"),
      hmac_secret: hmacSecret,
      enabled: true,
    })
    .select("id, name, kind, enabled, created_at")
    .single();
  if (ins.error) throw new Error(ins.error.message);
  await audit(
    sb,
    ctx.profile.organization_id,
    "integracion.creada",
    "integration",
    ins.data.id,
    { nombre: body.name, tipo: body.kind, firma_hmac: body.hmac },
    { id: ctx.userId, name: ctx.profile.full_name },
  );
  return NextResponse.json({ ok: true, integration: ins.data, token, hmacSecret });
});

/** Activa o desactiva una integración (desactivada, su token deja de funcionar al instante). */
export const PATCH = handle(async (req: Request) => {
  const ctx = await requireApiRole(["admin"]);
  const body = await parseJson(req, Toggle);
  const sb = getAdminClient();
  const up = await sb
    .from("integrations")
    .update({ enabled: body.enabled })
    .eq("id", body.id)
    .eq("organization_id", ctx.profile.organization_id)
    .select("id, name")
    .maybeSingle();
  if (!up.data) throw new HttpError(404, "Integración no encontrada");
  await audit(
    sb,
    ctx.profile.organization_id,
    body.enabled ? "integracion.activada" : "integracion.desactivada",
    "integration",
    body.id,
    { nombre: up.data.name },
    { id: ctx.userId, name: ctx.profile.full_name },
  );
  return NextResponse.json({ ok: true });
});
