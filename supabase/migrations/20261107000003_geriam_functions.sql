-- ═══════════════════════════════════════════════════════════════════════════
-- GeRiAm · 0003 · Triggers, funciones de consulta y retención
-- ═══════════════════════════════════════════════════════════════════════════

-- Último valor por sensor (lecturas fuera de orden no lo pisan)
create or replace function geriam.tg_reading_last_value()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update geriam.sensors s
     set last_value = new.value,
         last_reading_at = new.ts
   where s.id = new.sensor_id
     and (s.last_reading_at is null or s.last_reading_at <= new.ts);
  return null;
end $$;
revoke all on function geriam.tg_reading_last_value() from public, anon, authenticated;

drop trigger if exists readings_last_value on geriam.readings;
create trigger readings_last_value after insert on geriam.readings
  for each row execute function geriam.tg_reading_last_value();

-- Bitácora inmutable
create or replace function geriam.tg_audit_immutable()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'geriam.audit_log es inmutable';
end $$;
revoke all on function geriam.tg_audit_immutable() from public, anon, authenticated;

drop trigger if exists audit_log_immutable on geriam.audit_log;
create trigger audit_log_immutable before update or delete on geriam.audit_log
  for each row execute function geriam.tg_audit_immutable();

-- updated_at en alertas
create or replace function geriam.tg_touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;
revoke all on function geriam.tg_touch_updated_at() from public, anon, authenticated;

drop trigger if exists alerts_touch on geriam.alerts;
create trigger alerts_touch before update on geriam.alerts
  for each row execute function geriam.tg_touch_updated_at();

-- ─── Serie temporal con agregación (une crudo + horario) ─────────────────
-- security invoker → respeta RLS del usuario.
create or replace function geriam.series(
  p_sensor_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_bucket_s integer default 900
)
returns table (sensor_id uuid, ts timestamptz, value double precision, vmin double precision, vmax double precision, vsum double precision)
language sql stable security invoker set search_path = ''
as $$
  with raw as (
    select r.sensor_id, r.ts, r.value as v, r.value as lo, r.value as hi, r.value as s
      from geriam.readings r
     where r.sensor_id = any(p_sensor_ids) and r.ts >= p_from and r.ts <= p_to
       and r.drill_run_id is null
    union all
    select h.sensor_id, h.hour, h.avg, h.min, h.max, h.sum
      from geriam.readings_hourly h
     where h.sensor_id = any(p_sensor_ids) and h.hour >= p_from and h.hour <= p_to
  )
  select raw.sensor_id,
         to_timestamp(floor(extract(epoch from raw.ts) / p_bucket_s) * p_bucket_s) as ts,
         avg(raw.v), min(raw.lo), max(raw.hi), sum(raw.s)
    from raw
   group by 1, 2
   order by 1, 2
$$;
revoke all on function geriam.series(uuid[], timestamptz, timestamptz, integer) from public, anon;
grant execute on function geriam.series(uuid[], timestamptz, timestamptz, integer) to authenticated, service_role;

-- Lecturas de un simulacro (incluye drill_run_id)
create or replace function geriam.drill_series(p_drill uuid, p_sensor_ids uuid[])
returns table (sensor_id uuid, ts timestamptz, value double precision)
language sql stable security invoker set search_path = ''
as $$
  select r.sensor_id, r.ts, r.value from geriam.readings r
   where r.drill_run_id = p_drill and r.sensor_id = any(p_sensor_ids)
   order by r.ts
$$;
revoke all on function geriam.drill_series(uuid, uuid[]) from public, anon;
grant execute on function geriam.drill_series(uuid, uuid[]) to authenticated, service_role;

-- ─── Acumulados de lluvia por embalse (mm) ───────────────────────────────
create or replace function geriam.rain_totals(p_site uuid, p_at timestamptz default now())
returns table (h1 double precision, h24 double precision, h72 double precision)
language sql stable security invoker set search_path = ''
as $$
  with s as (select id from geriam.sensors where site_id = p_site and type = 'pluviometro'),
  r as (
    select ts, value from geriam.readings where sensor_id in (select id from s) and ts > p_at - interval '72 hours' and ts <= p_at and drill_run_id is null
    union all
    select hour, sum from geriam.readings_hourly where sensor_id in (select id from s) and hour > p_at - interval '72 hours' and hour <= p_at
  )
  select coalesce(sum(value) filter (where ts > p_at - interval '1 hour'), 0),
         coalesce(sum(value) filter (where ts > p_at - interval '24 hours'), 0),
         coalesce(sum(value), 0)
    from r
$$;
revoke all on function geriam.rain_totals(uuid, timestamptz) from public, anon;
grant execute on function geriam.rain_totals(uuid, timestamptz) to authenticated, service_role;

-- ─── Estado público resumido para el portal (sin datos sensibles) ────────
create or replace function geriam.public_status(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with o as (select * from geriam.organizations where slug = p_slug),
  drill as (select d.id, d.scenario from geriam.drill_runs d join o on o.id = d.organization_id where d.status <> 'finalizado' limit 1),
  site_rows as (
    select s.id, s.slug, s.name, s.code, s.lat, s.lng, s.dam_lat, s.dam_lng, s.altitude_m, s.capacity_m3, s.river,
           s.cota_fondo, s.cota_cresta, s.cota_namo, s.cota_vertedero, s.curva_area_volumen,
           (select se.last_value from geriam.sensors se where se.site_id = s.id and se.type = 'nivel_radar' order by se.code limit 1) as nivel,
           (select se.last_reading_at from geriam.sensors se where se.site_id = s.id and se.type = 'nivel_radar' order by se.code limit 1) as nivel_ts,
           (select a.level from geriam.alerts a where a.site_id = s.id and a.status <> 'resuelta'
              order by case a.level when 'roja' then 3 when 'naranja' then 2 else 1 end desc limit 1) as level
      from geriam.sites s join o on o.id = s.organization_id
  )
  select jsonb_build_object(
    'organization', (select jsonb_build_object('name', o.name, 'short_name', o.short_name, 'slug', o.slug,
                       'branding', o.branding, 'map_center', o.map_center, 'timezone', o.timezone,
                       'vapid_public_key', o.settings->>'vapid_public_key') from o),
    'drill', (select jsonb_build_object('id', drill.id, 'scenario', drill.scenario) from drill),
    'sites', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', slug, 'name', name, 'code', code, 'lat', lat, 'lng', lng, 'dam_lat', dam_lat, 'dam_lng', dam_lng,
        'altitude_m', altitude_m, 'capacity_m3', capacity_m3, 'river', river,
        'cota_fondo', cota_fondo, 'cota_cresta', cota_cresta, 'cota_namo', cota_namo, 'cota_vertedero', cota_vertedero,
        'curva_area_volumen', curva_area_volumen,
        'nivel', nivel, 'updated_at', nivel_ts, 'level', coalesce(level, 'normal')) order by code) from site_rows), '[]'::jsonb),
    'generated_at', now()
  )
$$;
revoke all on function geriam.public_status(text) from public;
grant execute on function geriam.public_status(text) to anon, authenticated, service_role;

-- ─── Retención: agrega a horario lo que tenga más de 7 días ──────────────
create or replace function geriam.retention(p_keep interval default interval '7 days')
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_cut timestamptz := date_trunc('hour', now() - p_keep);
  v_n integer;
begin
  insert into geriam.readings_hourly (sensor_id, hour, organization_id, avg, min, max, sum, n)
  select sensor_id, date_trunc('hour', ts), organization_id, avg(value), min(value), max(value), sum(value), count(*)
    from geriam.readings
   where ts < v_cut and drill_run_id is null
   group by 1, 2, 3
  on conflict (sensor_id, hour) do update
     set avg = (geriam.readings_hourly.avg * geriam.readings_hourly.n + excluded.avg * excluded.n) / (geriam.readings_hourly.n + excluded.n),
         min = least(geriam.readings_hourly.min, excluded.min),
         max = greatest(geriam.readings_hourly.max, excluded.max),
         sum = geriam.readings_hourly.sum + excluded.sum,
         n = geriam.readings_hourly.n + excluded.n;
  delete from geriam.readings where ts < v_cut and drill_run_id is null;
  get diagnostics v_n = row_count;
  delete from geriam.ingest_log where received_at < now() - interval '30 days';
  return v_n;
end $$;
revoke all on function geriam.retention(interval) from public, anon, authenticated;

-- Curva área–volumen sintética V = k·h^m (calibrada a V(NAMO) = capacidad). Misma fórmula que buildCurve() en TS.
create or replace function geriam.build_curve(p_fondo numeric, p_namo numeric, p_cresta numeric, p_cap numeric, p_m numeric)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object(
           'cota', round((p_fondo + i * 0.5)::numeric, 2),
           'area', round(case when i = 0 then 0 else p_m * (p_cap / power(p_namo - p_fondo, p_m)) * power(i * 0.5, p_m - 1) end),
           'volumen', round((p_cap / power(p_namo - p_fondo, p_m)) * power(i * 0.5, p_m))
         ) order by i)
    from generate_series(0, floor((p_cresta - p_fondo) / 0.5)::int) as i
$$;
revoke all on function geriam.build_curve(numeric, numeric, numeric, numeric, numeric) from public, anon;
