/**
 * Genera src/lib/supabase/database.types.ts a partir de las migraciones de geriam
 * (el generador de Supabase solo cubre `public` en el proyecto compartido).
 * Uso: pnpm tsx scripts/gen-types.ts
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "supabase/migrations");
const sql = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
  .join("\n");

const typeMap: Record<string, string> = {
  uuid: "string",
  text: "string",
  "timestamptz": "string",
  "double precision": "number",
  numeric: "number",
  integer: "number",
  smallint: "number",
  bigint: "number",
  boolean: "boolean",
  jsonb: "Json",
  "uuid[]": "string[]",
  "text[]": "string[]",
};

interface Col {
  name: string;
  ts: string;
  nullable: boolean;
  hasDefault: boolean;
}
const tables: Record<string, Col[]> = {};
const re = /create table if not exists geriam\.(\w+) \(([\s\S]*?)\n\);/g;
let m: RegExpExecArray | null;
while ((m = re.exec(sql))) {
  const [, name, body] = m;
  const cols: Col[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.replace(/--.*$/, "").trim().replace(/,$/, "");
    if (!line || /^(primary key|unique|check|constraint)/i.test(line)) continue;
    const cm = /^(\w+)\s+(timestamptz|double precision|uuid\[\]|text\[\]|uuid|text|numeric|integer|smallint|bigint|boolean|jsonb)(.*)$/i.exec(line);
    if (!cm) continue;
    const [, col, type, rest] = cm;
    const isPk = /primary key/i.test(rest);
    const nullable = !/not null/i.test(rest) && !isPk;
    const hasDefault = /default|generated/i.test(rest);
    cols.push({ name: col, ts: typeMap[type.toLowerCase()] ?? "unknown", nullable, hasDefault });
  }
  tables[name] = cols;
}

const lines: string[] = [];
lines.push("// ⚠ Generado por scripts/gen-types.ts — no editar a mano.");
lines.push("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n");
lines.push("export interface Database {");
lines.push("  geriam: {");
lines.push("    Tables: {");
for (const [t, cols] of Object.entries(tables)) {
  const row = cols.map((c) => `          ${c.name}: ${c.ts}${c.nullable ? " | null" : ""};`).join("\n");
  const ins = cols
    .map((c) => `          ${c.name}${c.nullable || c.hasDefault ? "?" : ""}: ${c.ts}${c.nullable ? " | null" : ""};`)
    .join("\n");
  const upd = cols.map((c) => `          ${c.name}?: ${c.ts}${c.nullable ? " | null" : ""};`).join("\n");
  lines.push(`      ${t}: {\n        Row: {\n${row}\n        };\n        Insert: {\n${ins}\n        };\n        Update: {\n${upd}\n        };\n        Relationships: [];\n      };`);
}
lines.push("    };");
lines.push("    Views: { [_ in never]: never };");
lines.push(`    Functions: {
      my_org: { Args: Record<string, never>; Returns: string };
      my_role: { Args: Record<string, never>; Returns: string };
      series: {
        Args: { p_sensor_ids: string[]; p_from: string; p_to: string; p_bucket_s?: number };
        Returns: { sensor_id: string; ts: string; value: number; vmin: number; vmax: number; vsum: number }[];
      };
      drill_series: {
        Args: { p_drill: string; p_sensor_ids: string[] };
        Returns: { sensor_id: string; ts: string; value: number }[];
      };
      rain_totals: { Args: { p_site: string; p_at?: string }; Returns: { h1: number; h24: number; h72: number }[] };
      public_status: { Args: { p_slug: string }; Returns: Json };
      restore_last_values: { Args: { p_site: string }; Returns: undefined };
      purge_drill: { Args: { p_drill: string }; Returns: undefined };
      retention: { Args: { p_keep?: string }; Returns: number };
    };`);
lines.push("    Enums: { [_ in never]: never };");
lines.push("    CompositeTypes: { [_ in never]: never };");
lines.push("  };");
lines.push("}");
const out = path.join(process.cwd(), "src/lib/supabase/database.types.ts");
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(`tipos: ${Object.keys(tables).length} tablas → ${out}`);
