import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { hasValidCronSecret } from "@/lib/auth/secret";
import { requireApiRole, OPERATOR_ROLES } from "@/lib/auth/session";
import { dispatchPending } from "@/lib/notifications/dispatch";

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const sb = getAdminClient();
  if (!(await hasValidCronSecret(req, sb))) await requireApiRole(OPERATOR_ROLES);
  return NextResponse.json({ ok: true, ...(await dispatchPending(sb)) });
});
