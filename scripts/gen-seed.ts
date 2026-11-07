/**
 * Genera supabase/seed.sql a partir de config/sites.tungurahua.ts.
 * Uso: pnpm tsx scripts/gen-seed.ts
 * Idempotente: usa ON CONFLICT sobre claves naturales (slug / code).
 */
import fs from "node:fs";
import path from "node:path";
import {
  ORGANIZATION,
  ZONES,
  DOWNSTREAM_POINTS,
  SITES,
  PROTOCOLS,
  ESCALATION,
  siteRules,
} from "../config/sites.tungurahua";

const q = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const arr = (xs: readonly string[]) => `array[${xs.map(q).join(",")}]::text[]`;

const ORG = "v_org";
const zone = (code: string) => `geriam._seed_zone(v_org, ${q(code)})`;
const site = (slug: string) => `geriam._seed_site(v_org, ${q(slug)})`;

const out: string[] = [];
out.push("-- ════════════════════════════════════════════════════════════════════");
out.push("-- GeRiAm · seed (generado por scripts/gen-seed.ts — no editar a mano)");
out.push("-- Organización Tungurahua · parámetros REFERENCIALES a validar");
out.push("-- ════════════════════════════════════════════════════════════════════");
out.push(`create or replace function geriam._seed_zone(o uuid, c text) returns uuid language sql stable set search_path = '' as $f$ select id from geriam.zones where organization_id = o and code = c $f$;
create or replace function geriam._seed_site(o uuid, s text) returns uuid language sql stable set search_path = '' as $f$ select id from geriam.sites where organization_id = o and slug = s $f$;
create or replace function geriam._seed_point(o uuid, n text) returns uuid language sql stable set search_path = '' as $f$ select id from geriam.downstream_points where organization_id = o and name = n $f$;
do $seed$
declare v_org uuid;
begin`);

out.push(`insert into geriam.organizations (slug, name, short_name, timezone, map_center, branding, settings)
values (${q(ORGANIZATION.slug)}, ${q(ORGANIZATION.name)}, ${q(ORGANIZATION.short_name)}, ${q(ORGANIZATION.timezone)}, ${q(ORGANIZATION.map_center)}, ${q(ORGANIZATION.branding)}, ${q(ORGANIZATION.settings)})
on conflict (slug) do update set name = excluded.name, short_name = excluded.short_name, map_center = excluded.map_center,
  branding = excluded.branding, settings = geriam.organizations.settings || excluded.settings
returning id into v_org;`);

for (const z of ZONES) {
  out.push(`insert into geriam.zones (organization_id, code, name, description) values (${ORG}, ${q(z.code)}, ${q(z.name)}, ${q(z.description)})
on conflict (organization_id, code) do update set name = excluded.name, description = excluded.description;`);
}

for (const s of SITES) {
  const cauce = { type: "LineString", coordinates: s.cauce };
  out.push(`insert into geriam.sites (organization_id, zone_id, slug, code, name, river, description, lat, lng, dam_lat, dam_lng,
  coord_verificado, dam_verificado, altitude_m, capacity_m3, cota_fondo, cota_cresta, cota_namo, cota_name, cota_vertedero,
  longitud_vertedero, coeficiente_descarga, curva_area_volumen, caudal_entrada_base, caudal_salida_nominal, area_cuenca_km2,
  cauce_geojson, data_source, metadata)
values (${ORG}, ${zone(s.zone)}, ${q(s.slug)}, ${q(s.code)}, ${q(s.name)}, ${q(s.river)}, ${q(s.description)}, ${s.lat}, ${s.lng}, ${s.dam_lat}, ${s.dam_lng},
  ${q(s.coord_verificado)}, false, ${s.altitude_m}, ${s.capacity_m3}, ${s.cota_fondo}, ${s.cota_cresta}, ${s.cota_namo}, ${s.cota_name}, ${s.cota_vertedero},
  ${s.longitud_vertedero}, ${s.coeficiente_descarga}, geriam.build_curve(${s.cota_fondo}, ${s.cota_namo}, ${s.cota_cresta}, ${s.capacity_m3}, ${s.curva_m}), ${s.caudal_entrada_base}, ${s.caudal_salida_nominal}, ${s.area_cuenca_km2},
  ${q(cauce)}, 'simulado', ${q(s.metadata)})
on conflict (organization_id, slug) do update set name = excluded.name, description = excluded.description, lat = excluded.lat, lng = excluded.lng,
  altitude_m = excluded.altitude_m, capacity_m3 = excluded.capacity_m3, cota_fondo = excluded.cota_fondo, cota_cresta = excluded.cota_cresta,
  cota_namo = excluded.cota_namo, cota_name = excluded.cota_name, cota_vertedero = excluded.cota_vertedero,
  longitud_vertedero = excluded.longitud_vertedero, coeficiente_descarga = excluded.coeficiente_descarga,
  curva_area_volumen = excluded.curva_area_volumen, caudal_entrada_base = excluded.caudal_entrada_base,
  caudal_salida_nominal = excluded.caudal_salida_nominal, area_cuenca_km2 = excluded.area_cuenca_km2,
  cauce_geojson = excluded.cauce_geojson, metadata = excluded.metadata;`);

  const g = s.gateway;
  out.push(`insert into geriam.gateways (organization_id, site_id, name, eui, lat, lng, link, coverage_radius_m, status, last_seen_at, metadata)
values (${ORG}, ${site(s.slug)}, ${q(g.name)}, ${q(g.eui)}, ${g.lat}, ${g.lng}, 'starlink', ${g.radius_m}, 'online', now(),
  ${q({ modelo: "RAK7289 V2 (referencial)", backhaul: "Starlink Standard", antena: "Omnidireccional 5,8 dBi" })})
on conflict (eui) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, coverage_radius_m = excluded.coverage_radius_m;`);

  for (const c of s.cameras) {
    out.push(`insert into geriam.cameras (organization_id, site_id, code, name, kind, demo_clip, lat, lng, bearing, position_label, status)
values (${ORG}, ${site(s.slug)}, ${q(c.code)}, ${q(c.name)}, ${q(c.kind)}, ${q(c.clip)}, ${c.lat}, ${c.lng}, ${c.bearing}, ${q(c.position)}, 'online')
on conflict (organization_id, code) do update set name = excluded.name, demo_clip = excluded.demo_clip, lat = excluded.lat, lng = excluded.lng, position_label = excluded.position_label;`);
  }
}

for (const d of DOWNSTREAM_POINTS) {
  out.push(`insert into geriam.downstream_points (organization_id, zone_id, name, kind, lat, lng, verificado, poblacion_expuesta)
select ${ORG}, ${zone(d.zone)}, ${q(d.name)}, ${q(d.kind)}, ${d.lat}, ${d.lng}, ${q(d.verificado)}, ${d.poblacion}
where not exists (select 1 from geriam.downstream_points where organization_id = ${ORG} and name = ${q(d.name)});`);
}
const point = (key: string) => {
  const d = DOWNSTREAM_POINTS.find((p) => p.key === key);
  if (!d) throw new Error(`punto ${key}`);
  return `geriam._seed_point(v_org, ${q(d.name)})`;
};

for (const s of SITES) {
  for (const d of s.downstream) {
    out.push(`insert into geriam.site_downstream (site_id, point_id, organization_id, distancia_km, tiempo_llegada_min, tiempo_transito_normal_min, fuente)
values (${site(s.slug)}, ${point(d.point)}, ${ORG}, ${d.distancia_km}, ${d.llegada_min}, ${d.transito_min}, ${q(d.fuente)})
on conflict (site_id, point_id) do update set distancia_km = excluded.distancia_km, tiempo_llegada_min = excluded.tiempo_llegada_min,
  tiempo_transito_normal_min = excluded.tiempo_transito_normal_min, fuente = excluded.fuente;`);
  }
  for (const se of s.sensors) {
    const gw = se.downstreamPoint ? "null" : `(select id from geriam.gateways where eui = ${q(s.gateway.eui)})`;
    const eui = se.downstreamPoint ? "null" : q(`70B3D57ED00${s.code === "CHQ" ? "1" : "2"}${se.code.replace(/[^A-Z0-9]/g, "").slice(-4).padStart(4, "0")}`);
    out.push(`insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (${ORG}, ${site(s.slug)}, ${gw}, ${q(se.code)}, ${q(se.name)}, ${q(se.type)}, ${eui}, ${q(se.unit)}, ${se.decimals}, ${se.lat}, ${se.lng}, ${q(se.position)},
  ${se.battery}, ${se.rssi}, ${se.snr}, ${se.interval_s}, ${q(se.thresholds ?? {})}, 'activo', 'simulado',
  ${q({ enlace: se.downstreamPoint ? "celular/API" : se.gateway ? "cableado al gateway" : "LoRaWAN", downstream_point: se.downstreamPoint ?? null })})
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;`);
    if (se.downstreamPoint) {
      out.push(`update geriam.downstream_points set nivel_rio_sensor_id = (select id from geriam.sensors where organization_id = ${ORG} and code = ${q(se.code)}) where id = ${point(se.downstreamPoint)};`);
    }
  }
  for (const r of siteRules(s)) {
    out.push(`insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (${ORG}, ${site(s.slug)}, ${q(r.code)}, ${q(r.name)}, ${q(r.kind)}, ${q(r.level)}, ${q(r.params)}, ${r.cooldown_min})
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;`);
  }
}

PROTOCOLS.forEach((p, i) => {
  out.push(`insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select ${ORG}, ${q(p.level)}, ${q(p.role)}, ${q(p.phase)}, ${q(p.title)}, ${q(p.actions)}, ${i}
where not exists (select 1 from geriam.protocols where organization_id = ${ORG} and level = ${q(p.level)} and role = ${q(p.role)} and title = ${q(p.title)});`);
});
for (const e of ESCALATION) {
  out.push(`insert into geriam.escalation_policies (organization_id, level, step, after_min, roles, channels, description)
values (${ORG}, ${q(e.level)}, ${e.step}, ${e.after_min}, ${arr(e.roles)}, ${arr(e.channels)}, ${q(e.description)})
on conflict (organization_id, level, step) do update set after_min = excluded.after_min, roles = excluded.roles, channels = excluded.channels, description = excluded.description;`);
}

out.push(`end $seed$;
drop function geriam._seed_zone(uuid, text);
drop function geriam._seed_site(uuid, text);
drop function geriam._seed_point(uuid, text);`);
const file = path.join(process.cwd(), "supabase/seed.sql");
fs.writeFileSync(file, out.join("\n\n") + "\n");
console.log(`seed.sql: ${out.length} sentencias, ${fs.statSync(file).size} bytes`);
