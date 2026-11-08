import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { Admin } from "@/lib/runtime/repo";

let cached: { value: string | null; at: number } | null = null;

/** Verifica la cabecera x-geriam-secret contra GERIAM_CRON_SECRET o geriam.app_secrets.cron_secret. */
export async function hasValidCronSecret(req: Request, sb: Admin): Promise<boolean> {
  const got = req.headers.get("x-geriam-secret");
  if (!got) return false;
  let expected = process.env.GERIAM_CRON_SECRET ?? null;
  if (!expected) {
    if (!cached || Date.now() - cached.at > 60_000) {
      const r = await sb.from("app_secrets").select("value").eq("name", "cron_secret").maybeSingle();
      cached = { value: r.data?.value ?? null, at: Date.now() };
    }
    expected = cached.value;
  }
  if (!expected) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
