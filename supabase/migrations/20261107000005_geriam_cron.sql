-- ═══════════════════════════════════════════════════════════════════════════
-- GeRiAm · 0005 · Jobs pg_cron (prefijo geriam_) y despacho de notificaciones
--
-- Requiere dos secretos en Vault (se crean aparte, NO en la migración):
--   geriam_functions_url  → https://<ref>.supabase.co/functions/v1
--   geriam_cron_secret    → igual al secreto GERIAM_CRON_SECRET de las Edge Functions
-- ═══════════════════════════════════════════════════════════════════════════

-- Invoca una Edge Function geriam-* de forma asíncrona (pg_net).
create or replace function geriam.invoke_function(p_name text, p_body jsonb default '{}')
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if p_name !~ '^geriam-[a-z0-9-]+$' then
    raise exception 'función no permitida: %', p_name;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'geriam_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'geriam_cron_secret';
  if v_url is null or v_secret is null then
    raise notice 'GeRiAm: faltan secretos en Vault (geriam_functions_url / geriam_cron_secret)';
    return null;
  end if;
  return net.http_post(
    url := v_url || '/' || p_name,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-geriam-secret', v_secret),
    timeout_milliseconds := 55000
  );
end $$;
revoke all on function geriam.invoke_function(text, jsonb) from public, anon, authenticated;

-- Al insertar notificaciones pendientes → despachar (push / SMS / WhatsApp / demo)
create or replace function geriam.tg_dispatch_notifications()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from new_rows where status = 'pendiente') then
    perform geriam.invoke_function('geriam-dispatch', '{}'::jsonb);
  end if;
  return null;
end $$;
revoke all on function geriam.tg_dispatch_notifications() from public, anon, authenticated;

drop trigger if exists notifications_dispatch on geriam.notifications;
create trigger notifications_dispatch after insert on geriam.notifications
  referencing new table as new_rows
  for each statement execute function geriam.tg_dispatch_notifications();

-- Jobs (idempotente: se reprograman con el mismo nombre)
select cron.schedule('geriam_simulator_tick', '* * * * *', $$select geriam.invoke_function('geriam-simulator-tick', '{"mode":"tick"}'::jsonb)$$);
select cron.schedule('geriam_dispatch_retry', '*/5 * * * *', $$select geriam.invoke_function('geriam-dispatch', '{"retry":true}'::jsonb)$$);
select cron.schedule('geriam_retention', '17 * * * *', $$select geriam.retention()$$);
