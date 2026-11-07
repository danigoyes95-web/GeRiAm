-- ═══════════════════════════════════════════════════════════════════════════
-- GeRiAm · 0001 · Núcleo del modelo de datos
-- Todo vive en el schema `geriam` (proyecto Supabase compartido).
-- Solo se referencia auth.users (lectura, FK desde geriam.profiles).
-- ═══════════════════════════════════════════════════════════════════════════
create schema if not exists geriam;

-- ─── Organizaciones (multi-tenant: una por provincia / GAD) ───────────────
create table if not exists geriam.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  short_name text not null,
  timezone text not null default 'America/Guayaquil',
  -- { lng, lat, zoom, pitch, bearing }
  map_center jsonb not null default '{"lng":-78.8166,"lat":-1.198,"zoom":13.2,"pitch":60,"bearing":-20}',
  -- { product, tagline, entity, colors{primary}, logo_svg?, contacts[] }
  branding jsonb not null default '{}',
  -- { vapid_public_key, demo_mode, demo_email_domain, ciudad_referencia{name,lat,lng} }
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists geriam.zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists zones_org_idx on geriam.zones (organization_id);

-- ─── Perfiles (acceso a GeRiAm = tener fila aquí) ─────────────────────────
create table if not exists geriam.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  role text not null check (role in ('admin','operador','tecnico','director_junta','observador')),
  zone_ids uuid[] not null default '{}',
  channels text[] not null default '{push}',
  is_demo boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists profiles_org_idx on geriam.profiles (organization_id);

-- ─── Embalses ─────────────────────────────────────────────────────────────
create table if not exists geriam.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  zone_id uuid references geriam.zones(id) on delete set null,
  slug text not null,
  code text not null,                 -- CHQ, MLC
  name text not null,
  kind text not null default 'embalse',
  river text,
  description text,
  -- espejo de agua
  lat double precision not null,
  lng double precision not null,
  -- cortina / presa (editable por admin)
  dam_lat double precision not null,
  dam_lng double precision not null,
  coord_verificado boolean not null default false,
  dam_verificado boolean not null default false,
  altitude_m numeric not null,
  capacity_m3 numeric not null,
  cota_fondo numeric not null,
  cota_cresta numeric not null,
  cota_namo numeric not null,
  cota_name numeric not null,
  cota_vertedero numeric not null,
  longitud_vertedero numeric not null,
  coeficiente_descarga numeric not null,
  curva_area_volumen jsonb not null,      -- [{cota, area, volumen}]
  caudal_entrada_base numeric not null,   -- m³/s
  caudal_salida_nominal numeric not null, -- m³/s
  area_cuenca_km2 numeric not null,
  cauce_geojson jsonb,                    -- LineString aguas abajo (aproximado)
  data_source text not null default 'simulado' check (data_source in ('simulado','lorawan','scada','api')),
  status text not null default 'operativo',
  metadata jsonb not null default '{}',   -- {referencial:true, usos:[...], fuentes:[...]}
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);
create index if not exists sites_org_idx on geriam.sites (organization_id);
create index if not exists sites_zone_idx on geriam.sites (zone_id);

-- ─── Puntos de control aguas abajo ────────────────────────────────────────
create table if not exists geriam.downstream_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  zone_id uuid references geriam.zones(id) on delete set null,
  name text not null,
  kind text not null default 'poblado', -- ciudad | poblado | puente | captacion
  lat double precision not null,
  lng double precision not null,
  verificado boolean not null default false,
  poblacion_expuesta integer,
  nivel_rio_sensor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists downstream_org_idx on geriam.downstream_points (organization_id);
create index if not exists downstream_zone_idx on geriam.downstream_points (zone_id);

-- Tiempos de llegada por embalse → punto
create table if not exists geriam.site_downstream (
  site_id uuid not null references geriam.sites(id) on delete cascade,
  point_id uuid not null references geriam.downstream_points(id) on delete cascade,
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  distancia_km numeric,
  tiempo_llegada_min integer not null,         -- onda por rotura / crecida extrema
  tiempo_transito_normal_min integer not null, -- tránsito de crecida ordinaria
  fuente text,
  primary key (site_id, point_id)
);
create index if not exists site_downstream_point_idx on geriam.site_downstream (point_id);
create index if not exists site_downstream_org_idx on geriam.site_downstream (organization_id);

-- ─── Gateways LoRaWAN ────────────────────────────────────────────────────
create table if not exists geriam.gateways (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  site_id uuid not null references geriam.sites(id) on delete cascade,
  name text not null,
  eui text not null unique,
  lat double precision not null,
  lng double precision not null,
  link text not null default 'starlink',
  coverage_radius_m integer not null default 2500,
  status text not null default 'online' check (status in ('online','degradado','offline')),
  last_seen_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists gateways_org_idx on geriam.gateways (organization_id);
create index if not exists gateways_site_idx on geriam.gateways (site_id);

-- ─── Sensores ─────────────────────────────────────────────────────────────
create table if not exists geriam.sensors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  site_id uuid not null references geriam.sites(id) on delete cascade,
  gateway_id uuid references geriam.gateways(id) on delete set null,
  code text not null,
  name text not null,
  type text not null check (type in ('nivel_radar','pluviometro','caudal_entrada','caudal_salida','piezometro','asentamiento','inclinometro','nivel_rio','energia_ups','starlink')),
  dev_eui text unique,
  unit text not null,
  decimals smallint not null default 2,
  lat double precision not null,
  lng double precision not null,
  position_label text,
  battery_pct numeric,
  rssi numeric,
  snr numeric,
  report_interval_s integer not null default 60,
  thresholds jsonb not null default '{}',
  status text not null default 'activo' check (status in ('activo','mantenimiento','offline','baja')),
  data_source text not null default 'simulado' check (data_source in ('simulado','lorawan','scada','api')),
  last_value double precision,
  last_reading_at timestamptz,
  last_fcnt bigint,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists sensors_org_idx on geriam.sensors (organization_id);
create index if not exists sensors_site_idx on geriam.sensors (site_id);
create index if not exists sensors_gateway_idx on geriam.sensors (gateway_id);

-- ─── Lecturas (serie temporal) ───────────────────────────────────────────
-- PK (sensor_id, ts) → idempotencia natural e índice para "últimas N lecturas".
create table if not exists geriam.readings (
  sensor_id uuid not null references geriam.sensors(id) on delete cascade,
  ts timestamptz not null,
  value double precision not null,
  quality smallint not null default 0, -- 0 ok · 1 dudosa · 2 mala
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  drill_run_id uuid,
  raw jsonb,
  primary key (sensor_id, ts)
);
create index if not exists readings_org_ts_idx on geriam.readings (organization_id, ts desc);
create index if not exists readings_drill_idx on geriam.readings (drill_run_id) where drill_run_id is not null;

-- Agregados horarios (retención: > 7 días)
create table if not exists geriam.readings_hourly (
  sensor_id uuid not null references geriam.sensors(id) on delete cascade,
  hour timestamptz not null,
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  avg double precision not null,
  min double precision not null,
  max double precision not null,
  sum double precision not null,
  n integer not null,
  primary key (sensor_id, hour)
);
create index if not exists readings_hourly_org_idx on geriam.readings_hourly (organization_id);

-- ─── Cámaras ──────────────────────────────────────────────────────────────
create table if not exists geriam.cameras (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  site_id uuid not null references geriam.sites(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null default 'fija' check (kind in ('PTZ','fija')),
  stream_url text,   -- HLS (.m3u8)
  snapshot_url text,
  demo_clip text,    -- /demo/cams/*.mp4
  lat double precision not null,
  lng double precision not null,
  bearing numeric,
  position_label text,
  status text not null default 'online' check (status in ('online','offline','mantenimiento')),
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists cameras_org_idx on geriam.cameras (organization_id);
create index if not exists cameras_site_idx on geriam.cameras (site_id);

-- ─── Protocolos de actuación ─────────────────────────────────────────────
create table if not exists geriam.protocols (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  level text not null check (level in ('normal','amarilla','naranja','roja')),
  role text not null check (role in ('admin','operador','tecnico','director_junta','observador','todos')),
  phase text not null default 'respuesta', -- preparacion | respuesta | recuperacion
  title text not null,
  actions jsonb not null default '[]',
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists protocols_org_idx on geriam.protocols (organization_id, level);

-- ─── Reglas de alerta ─────────────────────────────────────────────────────
create table if not exists geriam.alert_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  site_id uuid references geriam.sites(id) on delete cascade,
  sensor_id uuid references geriam.sensors(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null check (kind in ('umbral','tasa','combinada','estructural','comunicacion')),
  level text not null check (level in ('amarilla','naranja','roja')),
  params jsonb not null default '{}',
  enabled boolean not null default true,
  cooldown_min integer not null default 30,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists alert_rules_org_idx on geriam.alert_rules (organization_id);
create index if not exists alert_rules_site_idx on geriam.alert_rules (site_id);
create index if not exists alert_rules_sensor_idx on geriam.alert_rules (sensor_id);

-- ─── Simulacros ───────────────────────────────────────────────────────────
create table if not exists geriam.drill_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  scenario text not null check (scenario in ('tormenta','estructural','comunicacion')),
  site_id uuid not null references geriam.sites(id) on delete cascade,
  speed integer not null default 30,
  status text not null default 'activo' check (status in ('activo','pausado','finalizado')),
  sim_minutes double precision not null default 0, -- minutos simulados transcurridos
  phase text,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  last_step_at timestamptz not null default now(),
  ended_at timestamptz,
  snapshot jsonb not null default '{}', -- estado físico antes de iniciar (para reiniciar)
  state jsonb not null default '{}'
);
create index if not exists drill_runs_org_idx on geriam.drill_runs (organization_id, status);
create index if not exists drill_runs_site_idx on geriam.drill_runs (site_id);
create index if not exists drill_runs_user_idx on geriam.drill_runs (started_by);
create unique index if not exists drill_runs_one_active on geriam.drill_runs (organization_id) where status <> 'finalizado';

-- ─── Alertas ──────────────────────────────────────────────────────────────
create table if not exists geriam.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  site_id uuid references geriam.sites(id) on delete cascade,
  sensor_id uuid references geriam.sensors(id) on delete set null,
  rule_id uuid references geriam.alert_rules(id) on delete set null,
  level text not null check (level in ('amarilla','naranja','roja')),
  type text not null check (type in ('umbral','tasa','combinada','estructural','comunicacion','manual')),
  title text not null,
  description text,
  trigger_values jsonb not null default '{}',
  eta jsonb not null default '[]',      -- [{point_id, name, minutes, poblacion}]
  eta_primary_min integer,             -- llegada al punto principal (p. ej. Ambato)
  status text not null default 'activa' check (status in ('activa','confirmada','escalada','resuelta')),
  zone_ids uuid[] not null default '{}',
  dedupe_key text not null,
  drill_run_id uuid references geriam.drill_runs(id) on delete cascade,
  escalation_step integer not null default 0,
  started_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  escalated_at timestamptz,
  resolved_at timestamptz,
  last_triggered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Anti-rebote: una sola alerta abierta por clave (regla + sitio [+ sensor]).
create unique index if not exists alerts_open_dedupe on geriam.alerts (organization_id, dedupe_key) where status <> 'resuelta';
create index if not exists alerts_org_status_idx on geriam.alerts (organization_id, status, started_at desc);
create index if not exists alerts_site_idx on geriam.alerts (site_id);
create index if not exists alerts_sensor_idx on geriam.alerts (sensor_id);
create index if not exists alerts_rule_idx on geriam.alerts (rule_id);
create index if not exists alerts_drill_idx on geriam.alerts (drill_run_id);
create index if not exists alerts_ack_by_idx on geriam.alerts (acknowledged_by);
create index if not exists alerts_zones_gin on geriam.alerts using gin (zone_ids);

create table if not exists geriam.alert_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  alert_id uuid not null references geriam.alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('confirmada','recibido','en_camino','en_sitio','escalada','resuelta','comentario')),
  note text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
create index if not exists acks_alert_idx on geriam.alert_acknowledgements (alert_id, created_at);
create index if not exists acks_user_idx on geriam.alert_acknowledgements (user_id);
create index if not exists acks_org_idx on geriam.alert_acknowledgements (organization_id);

create table if not exists geriam.escalation_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  level text not null check (level in ('amarilla','naranja','roja')),
  step integer not null,
  after_min integer not null,   -- minutos sin confirmar para pasar a este paso
  roles text[] not null,
  channels text[] not null,
  description text,
  unique (organization_id, level, step)
);

create table if not exists geriam.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  alert_id uuid references geriam.alerts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  channel text not null check (channel in ('push','sms','whatsapp','email','demo')),
  recipient text not null,
  recipient_name text,
  provider text not null,       -- web-push | twilio | demo-log
  status text not null default 'pendiente' check (status in ('pendiente','enviada','entregada','fallida','demo')),
  title text not null,
  body text not null,
  payload jsonb not null default '{}',
  error text,
  escalation_step integer not null default 0,
  drill_run_id uuid references geriam.drill_runs(id) on delete cascade,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz
);
create index if not exists notifications_org_idx on geriam.notifications (organization_id, created_at desc);
create index if not exists notifications_alert_idx on geriam.notifications (alert_id);
create index if not exists notifications_user_idx on geriam.notifications (user_id);
create index if not exists notifications_pending_idx on geriam.notifications (status) where status = 'pendiente';
create index if not exists notifications_drill_idx on geriam.notifications (drill_run_id);

-- ─── Reportes de campo (PWA) ─────────────────────────────────────────────
create table if not exists geriam.incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  site_id uuid references geriam.sites(id) on delete set null,
  author_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null unique, -- idempotencia de la cola offline
  type text not null,
  description text not null,
  photo_path text,
  lat double precision,
  lng double precision,
  accuracy_m numeric,
  status text not null default 'nuevo' check (status in ('nuevo','en_revision','atendido')),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists incidents_org_idx on geriam.incidents (organization_id, created_at desc);
create index if not exists incidents_site_idx on geriam.incidents (site_id);
create index if not exists incidents_author_idx on geriam.incidents (author_id);

-- ─── Bitácora inmutable ──────────────────────────────────────────────────
create table if not exists geriam.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  actor_id uuid,
  actor_name text,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}',
  drill_run_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists audit_org_idx on geriam.audit_log (organization_id, created_at desc);

-- ─── Web Push ─────────────────────────────────────────────────────────────
create table if not exists geriam.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_user_idx on geriam.push_subscriptions (user_id);
create index if not exists push_org_idx on geriam.push_subscriptions (organization_id);

-- ─── Estado del simulador (uno por embalse) ──────────────────────────────
create table if not exists geriam.sim_state (
  site_id uuid primary key references geriam.sites(id) on delete cascade,
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  sim_time timestamptz not null,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists sim_state_org_idx on geriam.sim_state (organization_id);

-- ─── Integraciones (tokens de ingesta por organización) ──────────────────
create table if not exists geriam.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  kind text not null check (kind in ('chirpstack','ttn','generic','scada')),
  name text not null,
  token_hash text not null unique,   -- sha256 del token Bearer
  hmac_secret text,                  -- opcional: firma x-geriam-signature
  enabled boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists integrations_org_idx on geriam.integrations (organization_id);

-- Idempotencia de uplinks LoRaWAN (dev_eui + fcnt)
create table if not exists geriam.ingest_log (
  dev_eui text not null,
  fcnt bigint not null,
  organization_id uuid not null references geriam.organizations(id) on delete cascade,
  received_at timestamptz not null default now(),
  source text not null,
  primary key (dev_eui, fcnt)
);
create index if not exists ingest_log_org_idx on geriam.ingest_log (organization_id, received_at desc);

-- ─── Secretos de la app (solo service_role; sin políticas RLS) ───────────
create table if not exists geriam.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
