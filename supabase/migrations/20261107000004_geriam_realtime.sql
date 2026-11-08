-- ═══════════════════════════════════════════════════════════════════════════
-- GeRiAm · 0004 · Realtime: solo las tablas de geriam necesarias
-- (Realtime respeta RLS para postgres_changes con usuarios autenticados)
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publicación supabase_realtime no existe; se omite';
    return;
  end if;
  foreach t in array array['readings','alerts','alert_acknowledgements','notifications','drill_runs','incidents','sensors','gateways'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'geriam' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table geriam.%I', t);
    end if;
  end loop;
end $$;
