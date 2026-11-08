import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { hasValidCronSecret } from "@/lib/auth/secret";
import { HttpError, requireApiRole, OPERATOR_ROLES } from "@/lib/auth/session";
import { runTick } from "@/lib/runtime/tick";
import { dispatchPending } from "@/lib/notifications/dispatch";
import { DEMO_MODE } from "@/lib/supabase/config";

export const maxDuration = 60;

/**
 * Tick del simulador. Acceso: secreto (pg_cron → Edge Function) o, en modo demo,
 * sesión admin/operador (fallback del panel si el cron no corre). Nunca público.
 */
export const POST = handle(async (req: Request) => {
  const sb = getAdminClient();
  const bySecret = await hasValidCronSecret(req, sb);
  if (!bySecret) {
    if (!DEMO_MODE) throw new HttpError(403, "Solo disponible para el cron");
    await requireApiRole(OPERATOR_ROLES);
    // anti-rebote: si el cron ya avanzó hace < 50 s, no hacer nada
    const last = await sb.from("sim_state").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (last.data && Date.now() - new Date(last.data.updated_at).getTime() < 50_000) {
      return NextResponse.json({ ok: true, skipped: true });
    }
  }
  const summary = await runTick(sb, Date.now());
  const dispatched = await dispatchPending(sb);
  return NextResponse.json({ ok: true, source: bySecret ? "cron" : "panel", ...summary, dispatched });
});
