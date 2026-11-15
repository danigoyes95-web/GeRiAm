# GeRiAm · De dónde viene cada dato

Inventario de los datos que muestra la plataforma, su origen y su estado. Se mantiene al día con cada cambio.

**Estados:**
- **Real:** dato oficial o medido.
- **Simulado:** generado por el simulador físico mientras no haya sensores instalados.
- **Referencial:** valor estimado que hay que confirmar en campo o con un estudio.

## Sensores en las presas y en el río

| Dato | Origen hoy | Estado | Cómo pasa a real |
|---|---|---|---|
| Nivel del embalse, lluvia, caudal de entrada y salida, presión de poro, asentamiento, inclinómetro, energía y enlace Starlink | Simulador físico (balance hídrico, vertedero, escorrentía). La lluvia está calibrada con la climatología de las estaciones de la Red Hidrometeorológica de Tungurahua (2013–2025). | Simulado | Sensores LoRaWAN conectados por `/api/ingest` (ver `docs/INTEGRACION_SENSORES.md`). En Configuración → Integraciones se pasa cada sensor a "real". |
| Nivel del río en los 9 puntos de control | Simulador: caudal de salida de las presas con su tiempo de tránsito | Simulado | Estaciones hidrométricas por `/api/ingest` |

- **Aviso visible en el panel:** la barra superior dice "Datos simulados" mientras haya sensores simulados.
- **Fuente de cada lectura:** cada lectura guarda su origen (`raw.source`).
- **Lecturas reales validadas** antes de guardarse:
  - rango físico;
  - fecha creíble;
  - salto brusco, que se marca como dudoso.

## Datos oficiales externos (reales)

| Dato | Fuente | Actualización |
|---|---|---|
| Pronóstico de caudal a 15 días (51 escenarios + alta resolución) y caudales de crecida por periodo de retorno | INAMHI – GEOGLOWS (ECMWF), `services.geoglows.org` | Cada hora (pronóstico) y semanal (histórico desde 1980) |
| Avisos meteorológicos y sus zonas | INAMHI (Met Data Explorer) | Cada 30 min |
| Susceptibilidad a inundación | SNGR, capa `ecuador:flood2` del GeoServer de GEOGLOWS | Al mostrarse |
| Relieve (3D, cauces, zonas de impacto) | Terrarium / SRTM (AWS Open Data), ~19 m | Fijo |
| Mapa base, lugares, edificaciones y puentes | Mapbox / OpenStreetMap | Fijo (precálculo); la cobertura de edificaciones es incompleta |

## Datos de configuración

| Dato | Origen | Estado |
|---|---|---|
| Ficha técnica de Chiquiurco y Mulacorral (capacidad, cotas, vertedero) | Gobierno Provincial y documentos públicos | Coordenadas verificadas; demás parámetros por validar con la Dirección de Recursos Hídricos |
| Chiquicahua | Prefectura, prensa (Primicias, KCH) y tesis ESPOL | Ubicación estimada y validada con el volumen del relieve; cotas NAMO/NAME referenciales |
| Cauces aguas abajo | Trazado hidrológico sobre el relieve (`scripts/trace-cauce.py`) | Calculado |
| Puntos de control (9) | Ajustados al cauce trazado; Manzana Huaico en la estación INAMHI H1143 | Por verificar en campo (Configuración → Puntos) |
| Población expuesta | Estimación por punto | Referencial |
| Tiempos de llegada de la onda | Escalados desde los estudios HEC-RAS 2D de Chiquiurco y Mulacorral; Chiquicahua por distancia | Referencial (editable en Configuración → Puntos) |
| Zonas de impacto (área inundada, peligro, edificaciones) | Modelo HAND + curvas de Manning (`scripts/flood-hazard.py`) | Estimación de primer nivel |
| Cámaras | Sin video en la demostración | Aceptan streaming HLS de cámaras reales |

## Datos que genera la plataforma (reales)

- Usuarios.
- Alertas, confirmaciones, escalamientos y su línea de tiempo.
- Incidentes reportados desde la app de campo (con foto y GPS).
- Bitácora: no se puede editar ni borrar, ni siquiera el administrador.
- Notificaciones:
  - Web Push, real;
  - SMS y WhatsApp, en modo demostración hasta cargar las credenciales de Twilio.

Los simulacros llevan su propio identificador. Sus datos nunca se mezclan con los reales y se pueden purgar.
