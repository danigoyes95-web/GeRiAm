-- ═══════════════════════════════════════════════════════════════════════════
-- GeRiAm · 0007 · Estado público ampliado para el portal (sin datos sensibles):
-- protocolos por nivel/rol, puntos de control con tiempos de llegada y
-- alertas abiertas por nivel (solo conteos).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function geriam.public_status(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with o as (select * from geriam.organizations where slug = p_slug),
  drill as (select d.id, d.scenario from geriam.drill_runs d join o on o.id = d.organization_id where d.status <> 'finalizado' limit 1),
  site_rows as (
    select s.id, s.slug, s.name, s.code, s.lat, s.lng, s.dam_lat, s.dam_lng, s.altitude_m, s.capacity_m3, s.river, s.description,
           s.cota_fondo, s.cota_cresta, s.cota_namo, s.cota_vertedero, s.curva_area_volumen, s.cauce_geojson,
           (select se.last_value from geriam.sensors se where se.site_id = s.id and se.type = 'nivel_radar' order by se.code limit 1) as nivel,
           (select se.last_reading_at from geriam.sensors se where se.site_id = s.id and se.type = 'nivel_radar' order by se.code limit 1) as nivel_ts,
           (select a.level from geriam.alerts a where a.site_id = s.id and a.status <> 'resuelta'
              order by case a.level when 'roja' then 3 when 'naranja' then 2 else 1 end desc limit 1) as level,
           (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'llegada_min', sd.tiempo_llegada_min, 'transito_min', sd.tiempo_transito_normal_min, 'distancia_km', sd.distancia_km) order by sd.tiempo_llegada_min), '[]'::jsonb)
              from geriam.site_downstream sd join geriam.downstream_points p on p.id = sd.point_id where sd.site_id = s.id) as routes
      from geriam.sites s join o on o.id = s.organization_id
  )
  select jsonb_build_object(
    'organization', (select jsonb_build_object('name', o.name, 'short_name', o.short_name, 'slug', o.slug,
                       'branding', o.branding, 'map_center', o.map_center, 'timezone', o.timezone,
                       'vapid_public_key', o.settings->>'vapid_public_key') from o),
    'drill', (select jsonb_build_object('id', drill.id, 'scenario', drill.scenario) from drill),
    'sites', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', slug, 'name', name, 'code', code, 'lat', lat, 'lng', lng, 'dam_lat', dam_lat, 'dam_lng', dam_lng,
        'altitude_m', altitude_m, 'capacity_m3', capacity_m3, 'river', river, 'description', description,
        'cota_fondo', cota_fondo, 'cota_cresta', cota_cresta, 'cota_namo', cota_namo, 'cota_vertedero', cota_vertedero,
        'curva_area_volumen', curva_area_volumen, 'cauce_geojson', cauce_geojson, 'routes', routes,
        'nivel', nivel, 'updated_at', nivel_ts, 'level', coalesce(level, 'normal')) order by code) from site_rows), '[]'::jsonb),
    'points', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'kind', p.kind, 'lat', p.lat, 'lng', p.lng, 'poblacion', p.poblacion_expuesta, 'verificado', p.verificado))
        from geriam.downstream_points p join o on o.id = p.organization_id), '[]'::jsonb),
    'protocols', coalesce((select jsonb_agg(jsonb_build_object('level', pr.level, 'role', pr.role, 'title', pr.title, 'actions', pr.actions) order by pr.sort)
        from geriam.protocols pr join o on o.id = pr.organization_id), '[]'::jsonb),
    'open_alerts', (select jsonb_build_object(
        'roja', count(*) filter (where a.level = 'roja'),
        'naranja', count(*) filter (where a.level = 'naranja'),
        'amarilla', count(*) filter (where a.level = 'amarilla'))
        from geriam.alerts a join o on o.id = a.organization_id where a.status <> 'resuelta'),
    'generated_at', now()
  )
$$;
revoke all on function geriam.public_status(text) from public;
grant execute on function geriam.public_status(text) to anon, authenticated, service_role;
