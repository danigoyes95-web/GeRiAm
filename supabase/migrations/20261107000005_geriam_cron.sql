-- ═══════════════════════════════════════════════════════════════════════════
-- GeRiAm · 0005 · Jobs pg_cron (prefijo geriam_)
--
-- Configuración en geriam.app_secrets (solo service_role; la crea scripts/setup-demo.ts):
--   functions_url → https://<ref>.supabase.co/functions/v1
--   cron_secret   → secreto compartido con las Edge Functions geriam-*
--   app_url       → URL pública de la app (p. ej. https://geriam.vercel.app)
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
  select value into v_url from geriam.app_secrets where name = 'functions_url';
  select value into v_secret from geriam.app_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise notice 'GeRiAm: faltan functions_url / cron_secret en geriam.app_secrets';
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

-- Jobs (idempotente: cron.schedule reprograma por nombre)
select cron.schedule('geriam_simulator_tick', '* * * * *', $$select geriam.invoke_function('geriam-simulator-tick', '{"mode":"tick"}'::jsonb)$$);
select cron.schedule('geriam_dispatch_retry', '*/2 * * * *', $$select geriam.invoke_function('geriam-dispatch', '{"retry":true}'::jsonb)$$);
select cron.schedule('geriam_retention', '17 * * * *', $$select geriam.retention()$$);
