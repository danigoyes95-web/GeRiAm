import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "@/lib/auth/session";

/** Envuelve un handler y traduce errores a JSON con el código adecuado. */
export function handle<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof z.ZodError) {
        return NextResponse.json({ error: "Datos inválidos", issues: e.issues }, { status: 422 });
      }
      console.error("[api]", e);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
  };
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
  return schema.parse(body);
}

/** Rate limit simple en memoria (por instancia). Suficiente como primera barrera; en producción usar Upstash/Redis. */
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  b.n += 1;
  if (b.n > max) throw new HttpError(429, "Demasiadas solicitudes");
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "local";
}
