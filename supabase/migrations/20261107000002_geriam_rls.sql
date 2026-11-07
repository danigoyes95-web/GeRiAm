-- ═══════════════════════════════════════════════════════════════════════════
-- GeRiAm · 0002 · Funciones de contexto, RLS y permisos
-- Regla: cada usuario solo ve su organización; técnico/director de junta solo
-- ven alertas de sus zonas; solo admin edita configuración (umbrales, usuarios…).
-- Las escrituras operativas (lecturas, alertas, notificaciones, simulacro) las
-- hace el servidor con service_role tras verificar el rol.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Contexto del usuario actual ─────────────────────────────────────────
-- security definer + search_path vacío: leen geriam.profiles sin recursión de RLS.
-- Solo devuelven datos del propio usuario (auth.uid()), así que exponerlos es inocuo.
create or replace function geriam.my_org()
returns uuid language sql stable security definer set search_path = ''
as $$ select p.organization_id from geriam.profiles p where p.id = (select auth.uid()) and p.active $$;

create or replace function geriam.my_role()
returns text language sql stable security definer set search_path = ''
as $$ select p.role from geriam.profiles p where p.id = (select auth.uid()) and p.active $$;

create or replace function geriam.my_zones()
returns uuid[] language sql stable security definer set search_path = ''
as $$ select coalesce(p.zone_ids, '{}') from geriam.profiles p where p.id = (select auth.uid()) and p.active $$;

create or replace function geriam.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select p.role in ('admin','operador','observador') from geriam.profiles p where p.id = (select auth.uid()) and p.active), false) $$;

create or replace function geriam.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select p.role = 'admin' from geriam.profiles p where p.id = (select auth.uid()) and p.active), false) $$;

create or replace function geriam.is_operator()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select p.role in ('admin','operador') from geriam.profiles p where p.id = (select auth.uid()) and p.active), false) $$;

revoke all on function geriam.my_org(), geriam.my_role(), geriam.my_zones(), geriam.is_staff(), geriam.is_admin(), geriam.is_operator() from public, anon;
grant execute on function geriam.my_org(), geriam.my_role(), geriam.my_zones(), geriam.is_staff(), geriam.is_admin(), geriam.is_operator() to authenticated, service_role;

-- ─── Permisos del schema ─────────────────────────────────────────────────
grant usage on schema geriam to anon, authenticated, service_role;

-- service_role: acceso completo (bypassa RLS) — solo servidor / Edge Functions.
grant all on all tables in schema geriam to service_role;
grant all on all sequences in schema geriam to service_role;
grant all on all functions in schema geriam to service_role;

-- authenticated: lectura general (filtrada por RLS) + escrituras puntuales.
grant select on all tables in schema geriam to authenticated;
revoke select on geriam.app_secrets, geriam.integrations, geriam.ingest_log from authenticated;
grant select (id, organization_id, kind, name, enabled, last_used_at, created_at) on geriam.integrations to authenticated;

grant update (full_name, phone, channels) on geriam.profiles to authenticated;
grant insert, update, delete on geriam.sites, geriam.downstream_points, geriam.site_downstream, geriam.gateways,
  geriam.sensors, geriam.cameras, geriam.protocols, geriam.alert_rules, geriam.escalation_policies, geriam.zones
  to authenticated;
grant update (name, short_name, branding, map_center, settings) on geriam.organizations to authenticated;
grant insert on geriam.alert_acknowledgements, geriam.incidents, geriam.audit_log to authenticated;
grant insert, delete on geriam.push_subscriptions to authenticated;
grant update (status, acknowledged_at, acknowledged_by, escalated_at, resolved_at, updated_at) on geriam.alerts to authenticated;

-- anon: nada directo; el portal usa geriam.public_status() (0003).
alter default privileges in schema geriam grant all on tables to service_role;
alter default privileges in schema geriam grant all on sequences to service_role;
alter default privileges in schema geriam grant all on functions to service_role;
alter default privileges in schema geriam grant select on tables to authenticated;
alter default privileges in schema geriam revoke execute on functions from public;

-- ─── RLS en TODAS las tablas ─────────────────────────────────────────────
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'geriam' loop
    execute format('alter table geriam.%I enable row level security', t.tablename);
  end loop;
end $$;

-- organizations
create policy org_select on geriam.organizations for select to authenticated
  using (id = (select geriam.my_org()));
create policy org_update on geriam.organizations for update to authenticated
  using (id = (select geriam.my_org()) and (select geriam.is_admin()))
  with check (id = (select geriam.my_org()));

-- profiles: misma organización; cada uno edita sus datos de contacto (columnas limitadas por grant)
create policy profiles_select on geriam.profiles for select to authenticated
  using (organization_id = (select geriam.my_org()));
create policy profiles_update_self on geriam.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Catálogos de la organización: lectura para todos los miembros, escritura solo admin.
do $$
declare t text;
begin
  foreach t in array array['zones','sites','downstream_points','site_downstream','gateways','sensors','cameras',
                           'protocols','alert_rules','escalation_policies'] loop
    execute format('create policy %1$s_select on geriam.%1$I for select to authenticated using (organization_id = (select geriam.my_org()))', t);
    execute format('create policy %1$s_admin_insert on geriam.%1$I for insert to authenticated with check (organization_id = (select geriam.my_org()) and (select geriam.is_admin()))', t);
    execute format('create policy %1$s_admin_update on geriam.%1$I for update to authenticated using (organization_id = (select geriam.my_org()) and (select geriam.is_admin())) with check (organization_id = (select geriam.my_org()))', t);
    execute format('create policy %1$s_admin_delete on geriam.%1$I for delete to authenticated using (organization_id = (select geriam.my_org()) and (select geriam.is_admin()))', t);
  end loop;
end $$;

-- Series temporales y estado: lectura por organización (escritura solo service_role)
create policy readings_select on geriam.readings for select to authenticated
  using (organization_id = (select geriam.my_org()));
create policy readings_hourly_select on geriam.readings_hourly for select to authenticated
  using (organization_id = (select geriam.my_org()));
create policy sim_state_select on geriam.sim_state for select to authenticated
  using (organization_id = (select geriam.my_org()));
create policy drill_runs_select on geriam.drill_runs for select to authenticated
  using (organization_id = (select geriam.my_org()));

-- Alertas: staff ve todas las de su organización; técnico / director de junta solo sus zonas.
create policy alerts_select on geriam.alerts for select to authenticated
  using (
    organization_id = (select geriam.my_org())
    and ((select geriam.is_staff()) or zone_ids && (select geriam.my_zones()))
  );
create policy alerts_update on geriam.alerts for update to authenticated
  using (organization_id = (select geriam.my_org()) and (select geriam.is_operator()))
  with check (organization_id = (select geriam.my_org()));

create policy acks_select on geriam.alert_acknowledgements for select to authenticated
  using (organization_id = (select geriam.my_org()));
create policy acks_insert on geriam.alert_acknowledgements for insert to authenticated
  with check (organization_id = (select geriam.my_org()) and user_id = (select auth.uid()));

create policy notifications_select on geriam.notifications for select to authenticated
  using (organization_id = (select geriam.my_org()) and ((select geriam.is_staff()) or user_id = (select auth.uid())));

create policy incidents_select on geriam.incidents for select to authenticated
  using (organization_id = (select geriam.my_org()));
create policy incidents_insert on geriam.incidents for insert to authenticated
  with check (organization_id = (select geriam.my_org()) and author_id = (select auth.uid()));

create policy audit_select on geriam.audit_log for select to authenticated
  using (organization_id = (select geriam.my_org()) and (select geriam.is_staff()));
create policy audit_insert on geriam.audit_log for insert to authenticated
  with check (organization_id = (select geriam.my_org()) and actor_id = (select auth.uid()));

create policy push_select on geriam.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_insert on geriam.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()) and organization_id = (select geriam.my_org()));
create policy push_delete on geriam.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy integrations_select on geriam.integrations for select to authenticated
  using (organization_id = (select geriam.my_org()) and (select geriam.is_admin()));

-- app_secrets e ingest_log: sin políticas → inaccesibles salvo service_role.
