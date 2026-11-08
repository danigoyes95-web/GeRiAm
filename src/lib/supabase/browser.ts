"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_SCHEMA, SUPABASE_URL, type DB, type GeriamSchema } from "./config";

export type BrowserClient = SupabaseClient<DB, GeriamSchema>;
let client: BrowserClient | null = null;

export function getBrowserClient(): BrowserClient {
  if (!client) {
    client = createBrowserClient<DB, GeriamSchema>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: SUPABASE_SCHEMA },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}
