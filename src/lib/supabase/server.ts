import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_SCHEMA, SUPABASE_URL, type DB, type GeriamSchema } from "./config";

export type ServerClient = SupabaseClient<DB, GeriamSchema>;

/** Cliente con la sesión del usuario (RLS aplica). */
export async function getServerClient(): Promise<ServerClient> {
  const cookieStore = await cookies();
  return createServerClient<DB, GeriamSchema>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SUPABASE_SCHEMA },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Llamado desde un Server Component: el proxy refresca la sesión.
        }
      },
    },
  });
}
