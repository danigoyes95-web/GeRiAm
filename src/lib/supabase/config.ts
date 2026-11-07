/**
 * ÚNICO punto que conoce el schema de GeRiAm. Ningún otro archivo (salvo migraciones)
 * debe referenciar el nombre del schema.
 */
import type { Database } from "./database.types";

export type GeriamSchema = "geriam";
export type DB = Database;
export type Tables<T extends keyof Database["geriam"]["Tables"]> = Database["geriam"]["Tables"][T]["Row"];

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SUPABASE_SCHEMA = (process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "geriam") as GeriamSchema;

/** Prefijo de canales Realtime y recursos sin schema. */
export const RESOURCE_PREFIX = SUPABASE_SCHEMA;
export const channelName = (name: string) => `${RESOURCE_PREFIX}:${name}`;
export const STORAGE_BUCKET = `${RESOURCE_PREFIX}-media`;

export const DEFAULT_ORG_SLUG = process.env.NEXT_PUBLIC_DEFAULT_ORG ?? "tungurahua";
export const DEMO_EMAIL_DOMAIN = process.env.NEXT_PUBLIC_DEMO_EMAIL_DOMAIN ?? "geriam.demo";
export const DEMO_MODE = (process.env.NEXT_PUBLIC_DEMO_MODE ?? "true") !== "false";

export function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}
