import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SCHEMA, SUPABASE_URL, type DB, type GeriamSchema } from "./config";

export type AdminClient = SupabaseClient<DB, GeriamSchema>;
let admin: AdminClient | null = null;

/**
 * Cliente service_role: SOLO en el servidor y SIEMPRE tras verificar sesión + rol
 * (o un secreto). Bypassa RLS.
 */
export function getAdminClient(): AdminClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada");
  if (!admin) {
    admin = createClient<DB, GeriamSchema>(SUPABASE_URL, key, {
      db: { schema: SUPABASE_SCHEMA },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
