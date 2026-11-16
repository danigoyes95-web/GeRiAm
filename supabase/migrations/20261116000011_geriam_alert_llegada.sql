-- GeRiAm · 0011 · Tipo de alerta "llegada": aviso anticipado a cada punto de control con su tiempo de
-- llegada de la onda (rotura de presa), dirigido a la zona del punto.
alter table geriam.alerts drop constraint if exists alerts_type_check;
alter table geriam.alerts
  add constraint alerts_type_check check (type in ('umbral', 'tasa', 'combinada', 'estructural', 'comunicacion', 'manual', 'llegada'));
