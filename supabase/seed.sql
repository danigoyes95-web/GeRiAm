-- ════════════════════════════════════════════════════════════════════

-- GeRiAm · seed (generado por scripts/gen-seed.ts — no editar a mano)

-- Organización Tungurahua · parámetros REFERENCIALES a validar

-- ════════════════════════════════════════════════════════════════════

create or replace function geriam._seed_zone(o uuid, c text) returns uuid language sql stable set search_path = '' as $f$ select id from geriam.zones where organization_id = o and code = c $f$;
create or replace function geriam._seed_site(o uuid, s text) returns uuid language sql stable set search_path = '' as $f$ select id from geriam.sites where organization_id = o and slug = s $f$;
create or replace function geriam._seed_point(o uuid, n text) returns uuid language sql stable set search_path = '' as $f$ select id from geriam.downstream_points where organization_id = o and name = n $f$;
do $seed$
declare v_org uuid;
begin

insert into geriam.organizations (slug, name, short_name, timezone, map_center, branding, settings)
values ('tungurahua', 'Gobierno Provincial de Tungurahua', 'GPT', 'America/Guayaquil', '{"lng":-78.8168,"lat":-1.1985,"zoom":13.4,"pitch":62,"bearing":-28}'::jsonb, '{"product":"GeRiAm","tagline":"Gestión de Riesgos Ambato","entity":"Gobierno Provincial de Tungurahua","unit":"Dirección de Recursos Hídricos y Gestión de Riesgos","primary":"#22d3ee","contacts":[{"name":"ECU 911 — Emergencias","phone":"911","kind":"emergencia"},{"name":"Sala de operaciones GeRiAm","phone":"Por configurar","kind":"sala"},{"name":"Unidad de Gestión de Riesgos — GPT","phone":"Por configurar","kind":"institucional"}]}'::jsonb, '{"demo_mode":true,"demo_email_domain":"geriam.demo","ciudad_referencia":{"name":"Ambato","lat":-1.2491,"lng":-78.6168}}'::jsonb)
on conflict (slug) do update set name = excluded.name, short_name = excluded.short_name, map_center = excluded.map_center,
  branding = excluded.branding, settings = geriam.organizations.settings || excluded.settings
returning id into v_org;

insert into geriam.zones (organization_id, code, name, description) values (v_org, 'Z1', 'Cuenca alta — Embalses', 'Páramo de Chiquiurco y Mulacorral (presas, cortinas y accesos)')
on conflict (organization_id, code) do update set name = excluded.name, description = excluded.description;

insert into geriam.zones (organization_id, code, name, description) values (v_org, 'Z2', 'Pasa', 'Parroquia Pasa y riberas del río Ambato')
on conflict (organization_id, code) do update set name = excluded.name, description = excluded.description;

insert into geriam.zones (organization_id, code, name, description) values (v_org, 'Z3', 'Quisapincha', 'Parroquia Quisapincha y riberas')
on conflict (organization_id, code) do update set name = excluded.name, description = excluded.description;

insert into geriam.zones (organization_id, code, name, description) values (v_org, 'Z4', 'Ambato urbano', 'Ribera del río Ambato en la ciudad')
on conflict (organization_id, code) do update set name = excluded.name, description = excluded.description;

insert into geriam.sites (organization_id, zone_id, slug, code, name, river, description, lat, lng, dam_lat, dam_lng,
  coord_verificado, dam_verificado, altitude_m, capacity_m3, cota_fondo, cota_cresta, cota_namo, cota_name, cota_vertedero,
  longitud_vertedero, coeficiente_descarga, curva_area_volumen, caudal_entrada_base, caudal_salida_nominal, area_cuenca_km2,
  cauce_geojson, data_source, metadata)
values (v_org, geriam._seed_zone(v_org, 'Z1'), 'chiquiurco', 'CHQ', 'Embalse Chiquiurco', 'Río Ambato (cuenca alta)', 'Embalse de regulación del río Ambato. Abastece agua potable a Ambato y Pelileo y riego en la cuenca media.', -1.205154, -78.806672, -1.20855, -78.81032,
  true, false, 3744, 3500000, 3721, 3745.5, 3743, 3744.4, 3743,
  22, 1.75, geriam.build_curve(3721, 3743, 3745.5, 3500000, 2.2), 0.3, 0.365, 21.5,
  '{"type":"LineString","coordinates":[[-78.81032,-1.20855],[-78.8061,-1.2121],[-78.7988,-1.2168],[-78.7905,-1.2215],[-78.7735,-1.2372],[-78.7552,-1.2508],[-78.7398,-1.2622],[-78.7262,-1.2685],[-78.7105,-1.2641],[-78.6952,-1.2553],[-78.6794,-1.2468],[-78.6623,-1.2471],[-78.6441,-1.2502],[-78.6301,-1.2497],[-78.6168,-1.2491]]}'::jsonb, 'simulado', '{"referencial":true,"usos":["Agua potable Ambato","Agua potable Pelileo","Riego"],"fuentes":["Estudio HEC-RAS: ~27 km de cauce hasta la parroquia Pasa (referencial)","Parámetros a validar con el Gobierno Provincial"],"altura_presa_m":24.5,"tipo_presa":"Materiales sueltos con núcleo impermeable (referencial)"}'::jsonb)
on conflict (organization_id, slug) do update set name = excluded.name, description = excluded.description, lat = excluded.lat, lng = excluded.lng,
  altitude_m = excluded.altitude_m, capacity_m3 = excluded.capacity_m3, cota_fondo = excluded.cota_fondo, cota_cresta = excluded.cota_cresta,
  cota_namo = excluded.cota_namo, cota_name = excluded.cota_name, cota_vertedero = excluded.cota_vertedero,
  longitud_vertedero = excluded.longitud_vertedero, coeficiente_descarga = excluded.coeficiente_descarga,
  curva_area_volumen = excluded.curva_area_volumen, caudal_entrada_base = excluded.caudal_entrada_base,
  caudal_salida_nominal = excluded.caudal_salida_nominal, area_cuenca_km2 = excluded.area_cuenca_km2,
  cauce_geojson = excluded.cauce_geojson, metadata = excluded.metadata;

insert into geriam.gateways (organization_id, site_id, name, eui, lat, lng, link, coverage_radius_m, status, last_seen_at, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'Gateway LoRaWAN Chiquiurco', 'A84041FFFF1A2B01', -1.208929836127842, -78.81100286839899, 'starlink', 3000, 'online', now(),
  '{"modelo":"RAK7289 V2 (referencial)","backhaul":"Starlink Standard","antena":"Omnidireccional 5,8 dBi"}'::jsonb)
on conflict (eui) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, coverage_radius_m = excluded.coverage_radius_m;

insert into geriam.cameras (organization_id, site_id, code, name, kind, demo_clip, lat, lng, bearing, position_label, status)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'CHQ-CAM-01', 'Cortina — vista general', 'PTZ', '/demo/cams/cam1.mp4', -1.2096352460795485, -78.81112865994616, 40, 'Ladera derecha, frente a la cortina', 'online')
on conflict (organization_id, code) do update set name = excluded.name, demo_clip = excluded.demo_clip, lat = excluded.lat, lng = excluded.lng, position_label = excluded.position_label;

insert into geriam.cameras (organization_id, site_id, code, name, kind, demo_clip, lat, lng, bearing, position_label, status)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'CHQ-CAM-02', 'Vertedero de excesos', 'fija', '/demo/cams/cam2.mp4', -1.2082786884801129, -78.80933163784358, 300, 'Estribo izquierdo', 'online')
on conflict (organization_id, code) do update set name = excluded.name, demo_clip = excluded.demo_clip, lat = excluded.lat, lng = excluded.lng, position_label = excluded.position_label;

insert into geriam.cameras (organization_id, site_id, code, name, kind, demo_clip, lat, lng, bearing, position_label, status)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'CHQ-CAM-03', 'Espejo de agua', 'PTZ', '/demo/cams/cam3.mp4', -1.2081882513068172, -78.81049970221027, 35, 'Torre de toma', 'online')
on conflict (organization_id, code) do update set name = excluded.name, demo_clip = excluded.demo_clip, lat = excluded.lat, lng = excluded.lng, position_label = excluded.position_label;

insert into geriam.sites (organization_id, zone_id, slug, code, name, river, description, lat, lng, dam_lat, dam_lng,
  coord_verificado, dam_verificado, altitude_m, capacity_m3, cota_fondo, cota_cresta, cota_namo, cota_name, cota_vertedero,
  longitud_vertedero, coeficiente_descarga, curva_area_volumen, caudal_entrada_base, caudal_salida_nominal, area_cuenca_km2,
  cauce_geojson, data_source, metadata)
values (v_org, geriam._seed_zone(v_org, 'Z1'), 'mulacorral', 'MLC', 'Embalse Mulacorral', 'Río Ambato (cuenca alta)', 'Embalse en la cuenca alta del río Ambato, ~42 km al NO de Ambato. Almacenamiento estacional y regulación.', -1.190775, -78.826447, -1.19575, -78.82772,
  true, false, 3831, 2750000, 3806, 3831, 3829, 3830.2, 3829,
  18, 1.7, geriam.build_curve(3806, 3829, 3831, 2750000, 2.1), 0.25, 0.08, 17.8,
  '{"type":"LineString","coordinates":[[-78.82772,-1.19575],[-78.8231,-1.2016],[-78.8146,-1.2094],[-78.8061,-1.2121],[-78.7988,-1.2168],[-78.7905,-1.2215],[-78.7735,-1.2372],[-78.7552,-1.2508],[-78.7398,-1.2622],[-78.7262,-1.2685],[-78.7105,-1.2641],[-78.6952,-1.2553],[-78.6794,-1.2468],[-78.6623,-1.2471],[-78.6441,-1.2502],[-78.6301,-1.2497],[-78.6168,-1.2491]]}'::jsonb, 'simulado', '{"referencial":true,"usos":["Regulación","Agua potable Ambato"],"fuentes":["Estudio HEC-RAS 2D: onda por rotura llega a Ambato en ~2 h 20 min (140 min)"],"altura_presa_m":26,"tipo_presa":"Materiales sueltos (referencial)"}'::jsonb)
on conflict (organization_id, slug) do update set name = excluded.name, description = excluded.description, lat = excluded.lat, lng = excluded.lng,
  altitude_m = excluded.altitude_m, capacity_m3 = excluded.capacity_m3, cota_fondo = excluded.cota_fondo, cota_cresta = excluded.cota_cresta,
  cota_namo = excluded.cota_namo, cota_name = excluded.cota_name, cota_vertedero = excluded.cota_vertedero,
  longitud_vertedero = excluded.longitud_vertedero, coeficiente_descarga = excluded.coeficiente_descarga,
  curva_area_volumen = excluded.curva_area_volumen, caudal_entrada_base = excluded.caudal_entrada_base,
  caudal_salida_nominal = excluded.caudal_salida_nominal, area_cuenca_km2 = excluded.area_cuenca_km2,
  cauce_geojson = excluded.cauce_geojson, metadata = excluded.metadata;

insert into geriam.gateways (organization_id, site_id, name, eui, lat, lng, link, coverage_radius_m, status, last_seen_at, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'Gateway LoRaWAN Mulacorral', 'A84041FFFF1A2B02', -1.196111748693183, -78.82709104521264, 'starlink', 3000, 'online', now(),
  '{"modelo":"RAK7289 V2 (referencial)","backhaul":"Starlink Standard","antena":"Omnidireccional 5,8 dBi"}'::jsonb)
on conflict (eui) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, coverage_radius_m = excluded.coverage_radius_m;

insert into geriam.cameras (organization_id, site_id, code, name, kind, demo_clip, lat, lng, bearing, position_label, status)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'MLC-CAM-01', 'Cortina — vista general', 'PTZ', '/demo/cams/cam4.mp4', -1.196744808906253, -78.82700119452873, 330, 'Ladera izquierda', 'online')
on conflict (organization_id, code) do update set name = excluded.name, demo_clip = excluded.demo_clip, lat = excluded.lat, lng = excluded.lng, position_label = excluded.position_label;

insert into geriam.cameras (organization_id, site_id, code, name, kind, demo_clip, lat, lng, bearing, position_label, status)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'MLC-CAM-02', 'Vertedero de excesos', 'fija', '/demo/cams/cam5.mp4', -1.1955691256534087, -78.8287982082069, 60, 'Estribo derecho', 'online')
on conflict (organization_id, code) do update set name = excluded.name, demo_clip = excluded.demo_clip, lat = excluded.lat, lng = excluded.lng, position_label = excluded.position_label;

insert into geriam.cameras (organization_id, site_id, code, name, kind, demo_clip, lat, lng, bearing, position_label, status)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'MLC-CAM-03', 'Espejo de agua', 'PTZ', '/demo/cams/cam6.mp4', -1.1952073769602258, -78.8276301493161, 15, 'Torre de toma', 'online')
on conflict (organization_id, code) do update set name = excluded.name, demo_clip = excluded.demo_clip, lat = excluded.lat, lng = excluded.lng, position_label = excluded.position_label;

insert into geriam.downstream_points (organization_id, zone_id, name, kind, lat, lng, verificado, poblacion_expuesta)
select v_org, geriam._seed_zone(v_org, 'Z2'), 'Pasa', 'poblado', -1.2685, -78.7262, false, 850
where not exists (select 1 from geriam.downstream_points where organization_id = v_org and name = 'Pasa');

insert into geriam.downstream_points (organization_id, zone_id, name, kind, lat, lng, verificado, poblacion_expuesta)
select v_org, geriam._seed_zone(v_org, 'Z3'), 'Quisapincha', 'poblado', -1.2412, -78.6794, false, 1200
where not exists (select 1 from geriam.downstream_points where organization_id = v_org and name = 'Quisapincha');

insert into geriam.downstream_points (organization_id, zone_id, name, kind, lat, lng, verificado, poblacion_expuesta)
select v_org, geriam._seed_zone(v_org, 'Z4'), 'Ambato (ciudad)', 'ciudad', -1.2491, -78.6168, false, 14500
where not exists (select 1 from geriam.downstream_points where organization_id = v_org and name = 'Ambato (ciudad)');

insert into geriam.site_downstream (site_id, point_id, organization_id, distancia_km, tiempo_llegada_min, tiempo_transito_normal_min, fuente)
values (geriam._seed_site(v_org, 'chiquiurco'), geriam._seed_point(v_org, 'Pasa'), v_org, 27, 50, 125, 'Estimación referencial (HEC-RAS 2D Chiquiurco–Pasa)')
on conflict (site_id, point_id) do update set distancia_km = excluded.distancia_km, tiempo_llegada_min = excluded.tiempo_llegada_min,
  tiempo_transito_normal_min = excluded.tiempo_transito_normal_min, fuente = excluded.fuente;

insert into geriam.site_downstream (site_id, point_id, organization_id, distancia_km, tiempo_llegada_min, tiempo_transito_normal_min, fuente)
values (geriam._seed_site(v_org, 'chiquiurco'), geriam._seed_point(v_org, 'Quisapincha'), v_org, 34, 92, 210, 'Estimación referencial')
on conflict (site_id, point_id) do update set distancia_km = excluded.distancia_km, tiempo_llegada_min = excluded.tiempo_llegada_min,
  tiempo_transito_normal_min = excluded.tiempo_transito_normal_min, fuente = excluded.fuente;

insert into geriam.site_downstream (site_id, point_id, organization_id, distancia_km, tiempo_llegada_min, tiempo_transito_normal_min, fuente)
values (geriam._seed_site(v_org, 'chiquiurco'), geriam._seed_point(v_org, 'Ambato (ciudad)'), v_org, 41, 130, 290, 'Estimación referencial')
on conflict (site_id, point_id) do update set distancia_km = excluded.distancia_km, tiempo_llegada_min = excluded.tiempo_llegada_min,
  tiempo_transito_normal_min = excluded.tiempo_transito_normal_min, fuente = excluded.fuente;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B01'), 'CHQ-NIV-01', 'Radar de nivel — torre de toma', 'nivel_radar', '70B3D57ED001IV01', 'm s. n. m.', 2, -1.2080073769602258, -78.8096910422641, 'Torre de toma, sobre el espejo',
  88, -96, 6.5, 60, '{"direction":"asc","amarilla":3742.8,"naranja":3743.4,"roja":3744.9,"hysteresis":0.05}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B01'), 'CHQ-PLU-01', 'Pluviómetro de balancín', 'pluviometro', '70B3D57ED001LU01', 'mm', 1, -1.203954, -78.808272, 'Orilla, caseta meteorológica',
  76, -104, 3.2, 60, '{"direction":"asc","amarilla":10,"naranja":20,"roja":35,"hysteresis":2}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B01'), 'CHQ-QIN-01', 'Caudal de entrada — quebrada principal', 'caudal_entrada', '70B3D57ED001IN01', 'L/s', 0, -1.2001, -78.8001, 'Estación de aforo, cola del embalse',
  64, -112, -1.5, 60, '{"direction":"asc","amarilla":1500,"naranja":3000,"roja":6000,"hysteresis":30}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B01'), 'CHQ-QOUT-01', 'Caudal de salida — descarga de fondo + vertedero', 'caudal_salida', '70B3D57ED001UT01', 'L/s', 0, -1.2093639345596614, -78.81067940442053, 'Canal de descarga al pie de presa',
  91, -92, 7.8, 60, '{}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B01'), 'CHQ-PZ-01', 'Piezómetro cuerpo de presa', 'piezometro', '70B3D57ED001PZ01', 'kPa', 1, -1.208504781413352, -78.81018522334232, 'Cuerpo de presa, eje central',
  82, -88, 9.1, 300, '{"direction":"asc","amarilla":150,"naranja":162,"roja":175,"hysteresis":2}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B01'), 'CHQ-PZ-02', 'Piezómetro cimentación', 'piezometro', '70B3D57ED001PZ02', 'kPa', 1, -1.2086223497386366, -78.81054462776282, 'Cimentación, estribo izquierdo',
  79, -90, 8.4, 300, '{"direction":"asc","amarilla":215,"naranja":228,"roja":242,"hysteresis":2}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B01'), 'CHQ-AS-01', 'Placa de asentamiento — cresta', 'asentamiento', '70B3D57ED001AS01', 'mm', 2, -1.20855, -78.80996059557948, 'Cresta, progresiva 0+080',
  93, -86, 9.6, 600, '{"direction":"asc","amarilla":15,"naranja":18,"roja":22,"hysteresis":0.3}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B01'), 'CHQ-IN-01', 'Inclinómetro talud aguas abajo', 'inclinometro', '70B3D57ED001IN01', 'mm', 2, -1.2088213115198871, -78.81023014889487, 'Talud aguas abajo, berma 1',
  87, -91, 7.2, 600, '{"direction":"asc","amarilla":5,"naranja":7,"roja":10,"hysteresis":0.2}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B01'), 'CHQ-RIO-01', 'Nivel de río al pie de presa', 'nivel_rio', '70B3D57ED001IO01', 'm', 2, -1.2109013665056885, -78.81139821326155, 'Cauce, 300 m aguas abajo',
  71, -108, 0.8, 60, '{"direction":"asc","amarilla":1.2,"naranja":1.8,"roja":2.6,"hysteresis":0.05}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B01'), 'CHQ-UPS-01', 'Energía — UPS y banco solar', 'energia_ups', '70B3D57ED001PS01', '%', 0, -1.2089117486931829, -78.8109489577359, 'Caseta de control',
  100, -78, 11.2, 300, '{"direction":"desc","amarilla":40,"naranja":25,"roja":10,"hysteresis":3}'::jsonb, 'activo', 'simulado',
  '{"enlace":"cableado al gateway","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B01'), 'CHQ-STL-01', 'Enlace Starlink — latencia', 'starlink', '70B3D57ED001TL01', 'ms', 0, -1.208929836127842, -78.81098489817796, 'Mástil de la caseta de control',
  100, -70, 12, 60, '{"direction":"asc","amarilla":150,"naranja":400,"hysteresis":20}'::jsonb, 'activo', 'simulado',
  '{"enlace":"cableado al gateway","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), null, 'RIO-PAS-01', 'Estación hidrométrica Pasa', 'nivel_rio', null, 'm', 2, -1.2685, -78.7262, 'Puente / ribera — Pasa',
  84, -99, 4, 60, '{"direction":"asc","amarilla":1.8,"naranja":2.5,"roja":3.3,"hysteresis":0.05}'::jsonb, 'activo', 'simulado',
  '{"enlace":"celular/API","downstream_point":"pasa"}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

update geriam.downstream_points set nivel_rio_sensor_id = (select id from geriam.sensors where organization_id = v_org and code = 'RIO-PAS-01') where id = geriam._seed_point(v_org, 'Pasa');

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), null, 'RIO-QUI-01', 'Estación hidrométrica Quisapincha', 'nivel_rio', null, 'm', 2, -1.2412, -78.6794, 'Puente / ribera — Quisapincha',
  84, -99, 4, 60, '{"direction":"asc","amarilla":1.8,"naranja":2.5,"roja":3.3,"hysteresis":0.05}'::jsonb, 'activo', 'simulado',
  '{"enlace":"celular/API","downstream_point":"quisapincha"}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

update geriam.downstream_points set nivel_rio_sensor_id = (select id from geriam.sensors where organization_id = v_org and code = 'RIO-QUI-01') where id = geriam._seed_point(v_org, 'Quisapincha');

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), null, 'RIO-AMB-01', 'Estación hidrométrica Ambato (ciudad)', 'nivel_rio', null, 'm', 2, -1.2491, -78.6168, 'Puente / ribera — Ambato (ciudad)',
  84, -99, 4, 60, '{"direction":"asc","amarilla":1.8,"naranja":2.5,"roja":3.3,"hysteresis":0.05}'::jsonb, 'activo', 'simulado',
  '{"enlace":"celular/API","downstream_point":"ambato"}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

update geriam.downstream_points set nivel_rio_sensor_id = (select id from geriam.sensors where organization_id = v_org and code = 'RIO-AMB-01') where id = geriam._seed_point(v_org, 'Ambato (ciudad)');

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'CHQ-UMB', 'Umbrales por sensor (multinivel)', 'umbral', 'amarilla', '{"multilevel":true}'::jsonb, 20)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'CHQ-TASA-A', 'Subida rápida de nivel (> 8 cm/h)', 'tasa', 'amarilla', '{"sensor_type":"nivel_radar","delta":0.08,"window_min":60}'::jsonb, 30)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'CHQ-TASA-N', 'Subida muy rápida de nivel (> 20 cm/h)', 'tasa', 'naranja', '{"sensor_type":"nivel_radar","delta":0.2,"window_min":60}'::jsonb, 30)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'CHQ-COMB', 'Lluvia 24 h > 35 mm con embalse sobre NAMO−0,3 m', 'combinada', 'naranja', '{"rain_24h_mm":35,"level_above":3742.7}'::jsonb, 60)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'CHQ-PZ', 'Presión de poro anómala sin lluvia (+10 kPa / 6 h)', 'estructural', 'naranja', '{"sensor_type":"piezometro","delta":10,"window_min":360,"max_rain_24h_mm":8}'::jsonb, 60)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'CHQ-AS', 'Salto de asentamiento en cresta (> 1,5 mm / 1 h)', 'estructural', 'roja', '{"sensor_type":"asentamiento","delta":1.5,"window_min":60}'::jsonb, 60)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'CHQ-COM', 'Sensor sin reportar (> 3× intervalo)', 'comunicacion', 'amarilla', '{"silence_factor":3}'::jsonb, 10)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'chiquiurco'), 'CHQ-STL', 'Enlace Starlink caído (> 5 min)', 'comunicacion', 'naranja', '{"sensor_type":"starlink","silence_min":5}'::jsonb, 10)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.site_downstream (site_id, point_id, organization_id, distancia_km, tiempo_llegada_min, tiempo_transito_normal_min, fuente)
values (geriam._seed_site(v_org, 'mulacorral'), geriam._seed_point(v_org, 'Pasa'), v_org, 29, 55, 135, 'Estimación referencial')
on conflict (site_id, point_id) do update set distancia_km = excluded.distancia_km, tiempo_llegada_min = excluded.tiempo_llegada_min,
  tiempo_transito_normal_min = excluded.tiempo_transito_normal_min, fuente = excluded.fuente;

insert into geriam.site_downstream (site_id, point_id, organization_id, distancia_km, tiempo_llegada_min, tiempo_transito_normal_min, fuente)
values (geriam._seed_site(v_org, 'mulacorral'), geriam._seed_point(v_org, 'Quisapincha'), v_org, 36, 98, 225, 'Estimación referencial')
on conflict (site_id, point_id) do update set distancia_km = excluded.distancia_km, tiempo_llegada_min = excluded.tiempo_llegada_min,
  tiempo_transito_normal_min = excluded.tiempo_transito_normal_min, fuente = excluded.fuente;

insert into geriam.site_downstream (site_id, point_id, organization_id, distancia_km, tiempo_llegada_min, tiempo_transito_normal_min, fuente)
values (geriam._seed_site(v_org, 'mulacorral'), geriam._seed_point(v_org, 'Ambato (ciudad)'), v_org, 42, 140, 310, 'Estudio HEC-RAS 2D rotura Mulacorral (140 min)')
on conflict (site_id, point_id) do update set distancia_km = excluded.distancia_km, tiempo_llegada_min = excluded.tiempo_llegada_min,
  tiempo_transito_normal_min = excluded.tiempo_transito_normal_min, fuente = excluded.fuente;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B02'), 'MLC-NIV-01', 'Radar de nivel — torre de toma', 'nivel_radar', '70B3D57ED002IV01', 'm s. n. m.', 2, -1.1952073769602258, -78.82709104521264, 'Torre de toma, sobre el espejo',
  88, -96, 6.5, 60, '{"direction":"asc","amarilla":3828.8,"naranja":3829.4,"roja":3830.4,"hysteresis":0.05}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B02'), 'MLC-PLU-01', 'Pluviómetro de balancín', 'pluviometro', '70B3D57ED002LU01', 'mm', 1, -1.1895749999999998, -78.828047, 'Orilla, caseta meteorológica',
  76, -104, 3.2, 60, '{"direction":"asc","amarilla":10,"naranja":20,"roja":35,"hysteresis":2}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B02'), 'MLC-QIN-01', 'Caudal de entrada — quebrada principal', 'caudal_entrada', '70B3D57ED002IN01', 'L/s', 0, -1.1846, -78.8228, 'Estación de aforo, cola del embalse',
  64, -112, -1.5, 60, '{"direction":"asc","amarilla":1250,"naranja":2500,"roja":5000,"hysteresis":25}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B02'), 'MLC-QOUT-01', 'Caudal de salida — descarga de fondo + vertedero', 'caudal_salida', '70B3D57ED002UT01', 'L/s', 0, -1.1965639345596615, -78.82807940273564, 'Canal de descarga al pie de presa',
  91, -92, 7.8, 60, '{}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B02'), 'MLC-PZ-01', 'Piezómetro cuerpo de presa', 'piezometro', '70B3D57ED002PZ01', 'kPa', 1, -1.1957047814133521, -78.82758522397414, 'Cuerpo de presa, eje central',
  82, -88, 9.1, 300, '{"direction":"asc","amarilla":150,"naranja":162,"roja":175,"hysteresis":2}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B02'), 'MLC-PZ-02', 'Piezómetro cimentación', 'piezometro', '70B3D57ED002PZ02', 'kPa', 1, -1.1958223497386367, -78.82794462670977, 'Cimentación, estribo izquierdo',
  79, -90, 8.4, 300, '{"direction":"asc","amarilla":215,"naranja":228,"roja":242,"hysteresis":2}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B02'), 'MLC-AS-01', 'Placa de asentamiento — cresta', 'asentamiento', '70B3D57ED002AS01', 'mm', 2, -1.19575, -78.82736059726436, 'Cresta, progresiva 0+080',
  93, -86, 9.6, 600, '{"direction":"asc","amarilla":15,"naranja":18,"roja":22,"hysteresis":0.3}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B02'), 'MLC-IN-01', 'Inclinómetro talud aguas abajo', 'inclinometro', '70B3D57ED002IN01', 'mm', 2, -1.1960213115198872, -78.8276301493161, 'Talud aguas abajo, berma 1',
  87, -91, 7.2, 600, '{"direction":"asc","amarilla":5,"naranja":7,"roja":10,"hysteresis":0.2}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B02'), 'MLC-RIO-01', 'Nivel de río al pie de presa', 'nivel_rio', '70B3D57ED002IO01', 'm', 2, -1.1981013665056885, -78.8287982082069, 'Cauce, 300 m aguas abajo',
  71, -108, 0.8, 60, '{"direction":"asc","amarilla":1.2,"naranja":1.8,"roja":2.6,"hysteresis":0.05}'::jsonb, 'activo', 'simulado',
  '{"enlace":"LoRaWAN","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B02'), 'MLC-UPS-01', 'Energía — UPS y banco solar', 'energia_ups', '70B3D57ED002PS01', '%', 0, -1.196111748693183, -78.82834895478736, 'Caseta de control',
  100, -78, 11.2, 300, '{"direction":"desc","amarilla":40,"naranja":25,"roja":10,"hysteresis":3}'::jsonb, 'activo', 'simulado',
  '{"enlace":"cableado al gateway","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.sensors (organization_id, site_id, gateway_id, code, name, type, dev_eui, unit, decimals, lat, lng, position_label,
  battery_pct, rssi, snr, report_interval_s, thresholds, status, data_source, metadata)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), (select id from geriam.gateways where eui = 'A84041FFFF1A2B02'), 'MLC-STL-01', 'Enlace Starlink — latencia', 'starlink', '70B3D57ED002TL01', 'ms', 0, -1.196129836127842, -78.82838489506092, 'Mástil de la caseta de control',
  100, -70, 12, 60, '{"direction":"asc","amarilla":150,"naranja":400,"hysteresis":20}'::jsonb, 'activo', 'simulado',
  '{"enlace":"cableado al gateway","downstream_point":null}'::jsonb)
on conflict (organization_id, code) do update set name = excluded.name, unit = excluded.unit, decimals = excluded.decimals, lat = excluded.lat, lng = excluded.lng,
  position_label = excluded.position_label, report_interval_s = excluded.report_interval_s, thresholds = excluded.thresholds, metadata = excluded.metadata;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'MLC-UMB', 'Umbrales por sensor (multinivel)', 'umbral', 'amarilla', '{"multilevel":true}'::jsonb, 20)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'MLC-TASA-A', 'Subida rápida de nivel (> 8 cm/h)', 'tasa', 'amarilla', '{"sensor_type":"nivel_radar","delta":0.08,"window_min":60}'::jsonb, 30)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'MLC-TASA-N', 'Subida muy rápida de nivel (> 20 cm/h)', 'tasa', 'naranja', '{"sensor_type":"nivel_radar","delta":0.2,"window_min":60}'::jsonb, 30)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'MLC-COMB', 'Lluvia 24 h > 35 mm con embalse sobre NAMO−0,3 m', 'combinada', 'naranja', '{"rain_24h_mm":35,"level_above":3828.7}'::jsonb, 60)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'MLC-PZ', 'Presión de poro anómala sin lluvia (+10 kPa / 6 h)', 'estructural', 'naranja', '{"sensor_type":"piezometro","delta":10,"window_min":360,"max_rain_24h_mm":8}'::jsonb, 60)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'MLC-AS', 'Salto de asentamiento en cresta (> 1,5 mm / 1 h)', 'estructural', 'roja', '{"sensor_type":"asentamiento","delta":1.5,"window_min":60}'::jsonb, 60)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'MLC-COM', 'Sensor sin reportar (> 3× intervalo)', 'comunicacion', 'amarilla', '{"silence_factor":3}'::jsonb, 10)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.alert_rules (organization_id, site_id, code, name, kind, level, params, cooldown_min)
values (v_org, geriam._seed_site(v_org, 'mulacorral'), 'MLC-STL', 'Enlace Starlink caído (> 5 min)', 'comunicacion', 'naranja', '{"sensor_type":"starlink","silence_min":5}'::jsonb, 10)
on conflict (organization_id, code) do update set name = excluded.name, kind = excluded.kind, level = excluded.level, params = excluded.params, cooldown_min = excluded.cooldown_min;

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'normal', 'operador', 'preparacion', 'Monitoreo rutinario', '["Revisar el panel cada turno","Verificar salud de sensores y enlaces Starlink","Registrar novedades en bitácora"]'::jsonb, 0
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'normal' and role = 'operador' and title = 'Monitoreo rutinario');

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'normal', 'tecnico', 'preparacion', 'Mantenimiento preventivo', '["Inspección visual semanal de cortina y vertedero","Revisar baterías < 30 %","Limpieza de pluviómetros"]'::jsonb, 1
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'normal' and role = 'tecnico' and title = 'Mantenimiento preventivo');

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'amarilla', 'operador', 'respuesta', 'Vigilancia reforzada', '["Confirmar la alerta en ≤ 10 min","Verificar cámaras del sitio","Contrastar con pronóstico INAMHI","Notificar al técnico de zona"]'::jsonb, 2
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'amarilla' and role = 'operador' and title = 'Vigilancia reforzada');

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'amarilla', 'tecnico', 'respuesta', 'Verificación en campo', '["Marcar ''Recibido'' en la app","Dirigirse al sitio si la tendencia persiste > 1 h","Reportar con foto y GPS"]'::jsonb, 3
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'amarilla' and role = 'tecnico' and title = 'Verificación en campo');

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'amarilla', 'director_junta', 'preparacion', 'Atención', '["Mantenerse atento a nuevas notificaciones","Verificar lista de contactos de la junta"]'::jsonb, 4
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'amarilla' and role = 'director_junta' and title = 'Atención');

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'naranja', 'operador', 'respuesta', 'Preparación de respuesta', '["Activar sala de crisis","Coordinar con ECU 911 y COE cantonal","Evaluar apertura de descarga de fondo","Emitir notificación manual a juntas aguas abajo"]'::jsonb, 5
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'naranja' and role = 'operador' and title = 'Preparación de respuesta');

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'naranja', 'tecnico', 'respuesta', 'Patrullaje y control', '["Desplazarse al sitio (''En camino'' → ''En sitio'')","Inspeccionar cortina, vertedero y filtraciones","Coordinar cierre preventivo de vías ribereñas"]'::jsonb, 6
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'naranja' and role = 'tecnico' and title = 'Patrullaje y control');

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'naranja', 'director_junta', 'respuesta', 'Alistamiento comunitario', '["Avisar a la comunidad por los canales acordados","Revisar rutas de evacuación y puntos de encuentro","Identificar personas con movilidad reducida"]'::jsonb, 7
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'naranja' and role = 'director_junta' and title = 'Alistamiento comunitario');

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'roja', 'operador', 'respuesta', 'Activación de evacuación', '["Solicitar activación de sirenas / alerta pública vía ECU 911","Comunicar tiempo de llegada estimado a cada punto de control","Mantener enlace permanente con COE provincial"]'::jsonb, 8
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'roja' and role = 'operador' and title = 'Activación de evacuación');

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'roja', 'tecnico', 'respuesta', 'Seguridad del personal', '["No acercarse a la cortina ni al cauce","Reportar posición y estado","Apoyar el cierre de vías y puentes"]'::jsonb, 9
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'roja' and role = 'tecnico' and title = 'Seguridad del personal');

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'roja', 'director_junta', 'respuesta', 'Evacuación', '["Iniciar evacuación hacia zonas altas","Confirmar en la app el inicio de la evacuación","Reportar personas pendientes de evacuar"]'::jsonb, 10
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'roja' and role = 'director_junta' and title = 'Evacuación');

insert into geriam.protocols (organization_id, level, role, phase, title, actions, sort)
select v_org, 'roja', 'admin', 'respuesta', 'Conducción de la emergencia', '["Convocar COE provincial","Autorizar comunicación oficial","Asegurar registro completo en bitácora"]'::jsonb, 11
where not exists (select 1 from geriam.protocols where organization_id = v_org and level = 'roja' and role = 'admin' and title = 'Conducción de la emergencia');

insert into geriam.escalation_policies (organization_id, level, step, after_min, roles, channels, description)
values (v_org, 'amarilla', 0, 0, array['operador','tecnico']::text[], array['push']::text[], 'Aviso inicial a sala y técnico de zona')
on conflict (organization_id, level, step) do update set after_min = excluded.after_min, roles = excluded.roles, channels = excluded.channels, description = excluded.description;

insert into geriam.escalation_policies (organization_id, level, step, after_min, roles, channels, description)
values (v_org, 'amarilla', 1, 15, array['admin']::text[], array['push','sms']::text[], 'Sin confirmación en 15 min → jefatura')
on conflict (organization_id, level, step) do update set after_min = excluded.after_min, roles = excluded.roles, channels = excluded.channels, description = excluded.description;

insert into geriam.escalation_policies (organization_id, level, step, after_min, roles, channels, description)
values (v_org, 'naranja', 0, 0, array['operador','tecnico','director_junta']::text[], array['push','whatsapp']::text[], 'Aviso a sala, técnicos y juntas de la zona')
on conflict (organization_id, level, step) do update set after_min = excluded.after_min, roles = excluded.roles, channels = excluded.channels, description = excluded.description;

insert into geriam.escalation_policies (organization_id, level, step, after_min, roles, channels, description)
values (v_org, 'naranja', 1, 10, array['admin']::text[], array['push','sms','whatsapp']::text[], 'Sin confirmación en 10 min → jefatura')
on conflict (organization_id, level, step) do update set after_min = excluded.after_min, roles = excluded.roles, channels = excluded.channels, description = excluded.description;

insert into geriam.escalation_policies (organization_id, level, step, after_min, roles, channels, description)
values (v_org, 'roja', 0, 0, array['admin','operador','tecnico','director_junta','observador']::text[], array['push','sms','whatsapp']::text[], 'Difusión inmediata a todos los roles')
on conflict (organization_id, level, step) do update set after_min = excluded.after_min, roles = excluded.roles, channels = excluded.channels, description = excluded.description;

insert into geriam.escalation_policies (organization_id, level, step, after_min, roles, channels, description)
values (v_org, 'roja', 1, 5, array['admin','operador']::text[], array['sms','whatsapp']::text[], 'Sin confirmación en 5 min → reiterar a mando')
on conflict (organization_id, level, step) do update set after_min = excluded.after_min, roles = excluded.roles, channels = excluded.channels, description = excluded.description;

end $seed$;
drop function geriam._seed_zone(uuid, text);
drop function geriam._seed_site(uuid, text);
drop function geriam._seed_point(uuid, text);
