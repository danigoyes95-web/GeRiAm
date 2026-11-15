-- GeRiAm · 0009 · Índice cubriente para las series de los gráficos y reportes
-- Las lecturas de un sensor quedan intercaladas con las de los demás (llegan cada minuto), así que la
-- consulta de 7 días de un sensor tocaba ~7.000 páginas de la tabla. Con (sensor_id, ts) + value en el
-- índice y solo lecturas reales (sin simulacro), la consulta se resuelve leyendo el índice (index-only scan).
create index if not exists readings_series_cover_idx
  on geriam.readings (sensor_id, ts) include (value)
  where drill_run_id is null;
