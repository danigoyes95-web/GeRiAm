import type { Tables } from "@/lib/supabase/config";
import type { AreaVolumePoint, Thresholds } from "@/lib/domain/types";

export type Site = Tables<"sites">;
export type Sensor = Tables<"sensors">;
export type Gateway = Tables<"gateways">;
export type Camera = Tables<"cameras">;
export type Alert = Tables<"alerts">;
export type DrillRun = Tables<"drill_runs">;
export type DownstreamPoint = Tables<"downstream_points">;
export type SiteDownstream = Tables<"site_downstream">;
export type Notification = Tables<"notifications">;
export type Ack = Tables<"alert_acknowledgements">;
export type Protocol = Tables<"protocols">;
export type Zone = Tables<"zones">;
export type AuditEntry = Tables<"audit_log">;
export type Incident = Tables<"incidents">;
export type AlertRule = Tables<"alert_rules">;
export type EscalationPolicy = Tables<"escalation_policies">;
export type ProfileRow = Tables<"profiles">;
export type OrganizationRow = Tables<"organizations">;

export interface EtaEntry {
  point_id: string;
  name: string;
  minutes: number;
  poblacion: number | null;
}

export function siteCurve(site: Site): AreaVolumePoint[] {
  return (site.curva_area_volumen as unknown as AreaVolumePoint[]) ?? [];
}
export function sensorThresholds(sensor: Sensor): Thresholds | null {
  const t = sensor.thresholds as unknown as Thresholds | null;
  return t && typeof t === "object" && "direction" in t ? t : null;
}
export function alertEta(alert: Alert): EtaEntry[] {
  return Array.isArray(alert.eta) ? (alert.eta as unknown as EtaEntry[]) : [];
}

export interface Branding {
  product?: string;
  tagline?: string;
  entity?: string;
  unit?: string;
  primary?: string;
  contacts?: { name: string; phone: string; kind?: string }[];
}
export function orgBranding(org: { branding: unknown }): Branding {
  return (org.branding ?? {}) as Branding;
}
export interface MapCenter {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}
