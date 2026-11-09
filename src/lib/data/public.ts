import { createClient } from "@supabase/supabase-js";
import { DEFAULT_ORG_SLUG, SUPABASE_ANON_KEY, SUPABASE_SCHEMA, SUPABASE_URL, type DB, type GeriamSchema } from "@/lib/supabase/config";
import type { AreaVolumePoint } from "@/lib/domain/types";
import type { Branding, MapCenter } from "./types";

/** Estado público (sin datos sensibles) que expone geriam.public_status() para el portal. */
export interface PublicSite {
  slug: string;
  name: string;
  code: string;
  lat: number;
  lng: number;
  dam_lat: number;
  dam_lng: number;
  altitude_m: number;
  capacity_m3: number;
  river: string | null;
  description: string | null;
  cota_fondo: number;
  cota_cresta: number;
  cota_namo: number;
  cota_vertedero: number;
  curva_area_volumen: AreaVolumePoint[];
  cauce_geojson: unknown;
  routes: { name: string; llegada_min: number; transito_min: number; distancia_km: number | null }[];
  nivel: number | null;
  updated_at: string | null;
  level: "normal" | "amarilla" | "naranja" | "roja";
}

export interface PublicStatus {
  organization: { name: string; short_name: string; slug: string; branding: Branding; map_center: MapCenter; timezone: string; vapid_public_key: string | null } | null;
  drill: { id: string; scenario: string } | null;
  sites: PublicSite[];
  points: { name: string; kind: string; lat: number; lng: number; poblacion: number | null; verificado: boolean }[];
  protocols: { level: string; role: string; title: string; actions: string[] }[];
  open_alerts: { roja: number; naranja: number; amarilla: number } | null;
  generated_at: string;
}

export function publicClient() {
  return createClient<DB, GeriamSchema>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SUPABASE_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function fetchPublicStatus(slug = DEFAULT_ORG_SLUG): Promise<PublicStatus | null> {
  const { data, error } = await publicClient().rpc("public_status", { p_slug: slug });
  if (error || !data) return null;
  return data as unknown as PublicStatus;
}
