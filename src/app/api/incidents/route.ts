import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, rateLimit } from "@/lib/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { HttpError, requireApiRole, PANEL_ROLES } from "@/lib/auth/session";
import { STORAGE_BUCKET } from "@/lib/supabase/config";
import { audit } from "@/lib/runtime/repo";

const Data = z.object({
  client_id: z.uuid(),
  type: z.enum(["filtracion", "deslizamiento", "crecida", "dano_estructural", "obstruccion", "acceso", "otro"]),
  description: z.string().trim().min(3).max(2000),
  site_id: z.uuid().nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracy_m: z.number().min(0).max(100000).nullable(),
  captured_at: z.iso.datetime(),
});

const MAX_PHOTO = 8 * 1024 * 1024;

/** Reporte de incidente desde la PWA (con foto opcional). Idempotente por client_id. */
export const POST = handle(async (req: Request) => {
  const ctx = await requireApiRole(PANEL_ROLES);
  rateLimit(`incident:${ctx.userId}`, 20, 60_000);
  const form = await req.formData();
  const data = Data.parse(JSON.parse(String(form.get("data") ?? "{}")));
  const photo = form.get("photo");
  const sb = getAdminClient();

  const existing = await sb.from("incidents").select("id").eq("client_id", data.client_id).maybeSingle();
  if (existing.data) return NextResponse.json({ ok: true, id: existing.data.id, duplicate: true });

  let photoPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO) throw new HttpError(413, "La foto supera 8 MB");
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(photo.type)) throw new HttpError(415, "Formato de imagen no admitido");
    const bucket = await sb.storage.getBucket(STORAGE_BUCKET);
    if (bucket.error) await sb.storage.createBucket(STORAGE_BUCKET, { public: false, fileSizeLimit: MAX_PHOTO });
    photoPath = `${ctx.profile.organization_id}/incidentes/${data.client_id}.${photo.type.split("/")[1].replace("jpeg", "jpg")}`;
    const up = await sb.storage.from(STORAGE_BUCKET).upload(photoPath, photo, { contentType: photo.type, upsert: true });
    if (up.error) throw new Error(up.error.message);
  }

  const ins = await sb
    .from("incidents")
    .insert({ ...data, organization_id: ctx.profile.organization_id, author_id: ctx.userId, photo_path: photoPath })
    .select("id")
    .single();
  if (ins.error) throw new Error(ins.error.message);
  await audit(sb, ctx.profile.organization_id, "incidente.reportado", "incident", ins.data.id, { type: data.type, site_id: data.site_id, gps: data.lat !== null }, { id: ctx.userId, name: ctx.profile.full_name });
  return NextResponse.json({ ok: true, id: ins.data.id });
});
