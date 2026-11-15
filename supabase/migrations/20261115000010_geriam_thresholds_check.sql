-- GeRiAm · 0010 · Los umbrales de alerta deben estar ordenados (amarilla → naranja → roja)
-- La pantalla ya lo valida; esta regla lo garantiza también para cualquier otra vía de escritura.
create or replace function geriam.tg_sensor_thresholds_check()
returns trigger language plpgsql set search_path = ''
as $$
declare
  t jsonb := new.thresholds;
  a numeric; n numeric; r numeric;
  asc_ boolean;
begin
  if t is null or t = '{}'::jsonb or not (t ? 'direction') then
    return new;
  end if;
  asc_ := (t->>'direction') = 'asc';
  a := nullif(t->>'amarilla', '')::numeric;
  n := nullif(t->>'naranja', '')::numeric;
  r := nullif(t->>'roja', '')::numeric;
  if (asc_ and ((a is not null and n is not null and a >= n) or (n is not null and r is not null and n >= r) or (a is not null and r is not null and a >= r)))
     or (not asc_ and ((a is not null and n is not null and a <= n) or (n is not null and r is not null and n <= r) or (a is not null and r is not null and a <= r))) then
    raise exception 'Umbrales desordenados para %: deben ir amarilla → naranja → roja', new.code
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function geriam.tg_sensor_thresholds_check() from public, anon, authenticated;

drop trigger if exists sensors_thresholds_check on geriam.sensors;
create trigger sensors_thresholds_check before insert or update of thresholds on geriam.sensors
  for each row execute function geriam.tg_sensor_thresholds_check();
