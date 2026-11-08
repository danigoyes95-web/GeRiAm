import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseJson } from "@/lib/api";
import { getServerClient } from "@/lib/supabase/server";
import { requireApiRole, PANEL_ROLES } from "@/lib/auth/session";

const Sub = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(8) }),
});

export const POST = handle(async (req: Request) => {
  const ctx = await requireApiRole(PANEL_ROLES);
  const sub = await parseJson(req, Sub);
  const sb = await getServerClient();
  await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const r = await sb.from("push_subscriptions").insert({
    organization_id: ctx.profile.organization_id,
    user_id: ctx.userId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (r.error) throw new Error(r.error.message);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  await requireApiRole(PANEL_ROLES);
  const { endpoint } = await parseJson(req, z.object({ endpoint: z.url() }));
  const sb = await getServerClient();
  await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
});
