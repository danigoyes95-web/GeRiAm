/**
 * Actualiza solo geriam.sites.cauce_geojson con los cauces trazados por scripts/trace-cauce.py.
 * Uso: npx tsx scripts/update-cauces.ts
 */
import { createClient } from "@supabase/supabase-js";
import CAUCES from "../config/cauces.tungurahua.json";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "geriam" },
  auth: { persistSession: false },
});

async function main() {
  for (const [code, coords] of Object.entries(CAUCES as unknown as Record<string, [number, number][]>)) {
    const { data, error } = await sb.from("sites").update({ cauce_geojson: { type: "LineString", coordinates: coords } }).eq("code", code).select("code");
    if (error) throw error;
    console.log(code, data?.length ? `${coords.length} puntos actualizados` : "sin fila");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
