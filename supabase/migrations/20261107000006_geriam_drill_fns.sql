-- ═══════════════════════════════════════════════════════════════════════════
-- GeRiAm · 0006 · Funciones de soporte del simulacro (solo service_role)
-- ═══════════════════════════════════════════════════════════════════════════

-- Restaura el último valor de cada sensor del sitio desde lecturas reales (no simulacro).
create or replace function geriam.restore_last_values(p_site uuid)
returns void language sql security definer set search_path = ''
as $$
  update geriam.sensors s
     set last_value = r.value, last_reading_at = r.ts
    from (
      select distinct on (sensor_id) sensor_id, value, ts from geriam.readings
       where drill_run_id is null and sensor_id in (select id from geriam.sensors where site_id = p_site)
       order by sensor_id, ts desc
    ) r
   where s.id = r.sensor_id;
$$;
revoke all on function geriam.restore_last_values(uuid) from public, anon, authenticated;
grant execute on function geriam.restore_last_values(uuid) to service_role;

-- Elimina los datos generados por un simulacro (lecturas y alertas → notificaciones/acuses en cascada).
-- La bitácora (audit_log) es inmutable y conserva el registro.
create or replace function geriam.purge_drill(p_drill uuid)
returns void language sql security definer set search_path = ''
as $$
  delete from geriam.readings where drill_run_id = p_drill;
  delete from geriam.alerts where drill_run_id = p_drill;
$$;
revoke all on function geriam.purge_drill(uuid) from public, anon, authenticated;
grant execute on function geriam.purge_drill(uuid) to service_role;
