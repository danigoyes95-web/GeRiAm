"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Gauge, ListChecks, Save, Send, Users } from "lucide-react";
import { usePanel } from "@/components/panel/PanelContext";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, SegmentedControl, Select, Skeleton } from "@/components/ui/misc";
import { LEVELS } from "@/design/levels";
import { ORG_LIVE_KEY, useOrgLive } from "@/lib/data/live";
import type { Sensor } from "@/lib/data/types";
import {
  ROLE_LABEL,
  SENSOR_LABEL,
  type AlertLevel,
  type Role,
  type SensorType,
  type Thresholds,
} from "@/lib/domain/types";
import { getBrowserClient } from "@/lib/supabase/browser";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "umbrales" | "reglas" | "escalamiento" | "usuarios" | "organizacion";
const LV = ["amarilla", "naranja", "roja"] as const;

async function audit(
  orgId: string,
  actor: { id: string; name: string },
  action: string,
  entity: string,
  entityId: string,
  details: Record<string, unknown>,
) {
  await getBrowserClient()
    .from("audit_log")
    .insert({
      organization_id: orgId,
      actor_id: actor.id,
      actor_name: actor.name,
      action,
      entity,
      entity_id: entityId,
      details: details as never,
    });
}

function levelOf(v: number | null, t: Thresholds): AlertLevel | "normal" {
  if (v === null) return "normal";
  const hit = (x?: number) => x !== undefined && (t.direction === "asc" ? v >= x : v <= x);
  return hit(t.roja) ? "roja" : hit(t.naranja) ? "naranja" : hit(t.amarilla) ? "amarilla" : "normal";
}

function ThresholdRow({ s, onSaved }: { s: Sensor; onSaved: () => void }) {
  const panel = usePanel();
  const t0 = s.thresholds as unknown as Thresholds;
  const [t, setT] = useState<Thresholds>(t0);
  const [saving, setSaving] = useState(false);
  const dirty = LV.some((l) => t[l] !== t0[l]) || t.hysteresis !== t0.hysteresis;
  const ordered =
    t.direction === "asc"
      ? (t.amarilla ?? -Infinity) < (t.naranja ?? Infinity) && (t.naranja ?? -Infinity) < (t.roja ?? Infinity)
      : (t.amarilla ?? Infinity) > (t.naranja ?? -Infinity) &&
        (t.naranja ?? Infinity) > (t.roja ?? -Infinity);
  const now = levelOf(s.last_value, t);

  const save = async () => {
    if (!ordered)
      return toast.error(
        `Los umbrales deben ${t.direction === "asc" ? "crecer" : "decrecer"}: amarilla → naranja → roja`,
      );
    setSaving(true);
    const r = await getBrowserClient()
      .from("sensors")
      .update({ thresholds: t as never })
      .eq("id", s.id);
    setSaving(false);
    if (r.error) return toast.error(`No se pudo guardar: ${r.error.message}`);
    await audit(panel.orgId, { id: panel.userId, name: panel.name }, "configuracion.umbral", "sensor", s.id, {
      sensor: s.code,
      antes: t0,
      despues: t,
    });
    toast.success(`Umbrales de ${s.code} guardados. Se aplican desde la próxima lectura.`);
    onSaved();
  };

  const num = (k: keyof Thresholds) => (
    <Input
      type="number"
      step="any"
      inputMode="decimal"
      aria-label={`${s.code} ${k}`}
      className={cn(
        "h-8 w-full min-w-0 px-2 font-mono text-xs",
        k !== "hysteresis" && !ordered && "border-lvl-roja",
      )}
      value={(t[k] as number | undefined) ?? ""}
      onChange={(e) => setT({ ...t, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}
    />
  );

  return (
    <li className="grid grid-cols-2 items-center gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.7fr))_auto]">
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div className="text-sm font-medium">
          {s.code} <span className="text-fg-faint font-normal">· {SENSOR_LABEL[s.type as SensorType]}</span>
        </div>
        <div className="text-fg-faint text-[11px]">
          Actual:{" "}
          <span className="tabular text-fg-muted font-mono">
            {s.last_value === null ? "—" : `${formatNumber(Number(s.last_value), s.decimals)} ${s.unit}`}
          </span>{" "}
          {now !== "normal" && (
            <span className={LEVELS[now].text}>
              → lectura puntual sobre umbral {now} (la alerta se confirma con lecturas sostenidas)
            </span>
          )}
          {t.direction === "desc" && " · alerta por descenso"}
        </div>
      </div>
      {LV.map((l) => (
        <label key={l} className="text-fg-faint min-w-0 text-[10px]">
          <span className={cn("mb-0.5 block font-semibold uppercase sm:hidden", LEVELS[l].text)}>{l}</span>
          {num(l)}
        </label>
      ))}
      <label className="text-fg-faint min-w-0 text-[10px]">
        <span className="mb-0.5 block font-semibold uppercase sm:hidden">Histéresis</span>
        {num("hysteresis")}
      </label>
      <Button
        size="sm"
        variant={dirty ? "primary" : "ghost"}
        disabled={!dirty || saving}
        onClick={save}
        className="col-span-2 sm:col-span-1"
      >
        <Save /> {saving ? "Guardando…" : "Guardar"}
      </Button>
    </li>
  );
}

export function ConfigPanel() {
  const panel = usePanel();
  const qc = useQueryClient();
  const { data } = useOrgLive();
  const [tab, setTab] = useState<Tab>("umbrales");
  const [siteId, setSiteId] = useState("");
  const site = data?.sites.find((s) => s.id === siteId) ?? data?.sites[0];

  const extra = useQuery({
    queryKey: ["config-extra"],
    queryFn: async () => {
      const sb = getBrowserClient();
      const [rules, esc, profiles, integrations, zones] = await Promise.all([
        sb.from("alert_rules").select("*").order("code"),
        sb.from("escalation_policies").select("*").order("level").order("step"),
        sb
          .from("profiles")
          .select("id, full_name, email, role, zone_ids, channels, active, is_demo")
          .order("role"),
        sb.from("integrations").select("id, kind, name, enabled, last_used_at"),
        sb.from("zones").select("id, code, name"),
      ]);
      return {
        rules: rules.data ?? [],
        esc: esc.data ?? [],
        profiles: profiles.data ?? [],
        integrations: integrations.data ?? [],
        zones: zones.data ?? [],
      };
    },
  });

  const toggleRule = async (id: string, code: string, enabled: boolean) => {
    const r = await getBrowserClient().from("alert_rules").update({ enabled }).eq("id", id);
    if (r.error) return toast.error(`No se pudo actualizar: ${r.error.message}`);
    await audit(
      panel.orgId,
      { id: panel.userId, name: panel.name },
      enabled ? "configuracion.regla_activada" : "configuracion.regla_desactivada",
      "alert_rule",
      id,
      { regla: code },
    );
    toast.success(`Regla ${code} ${enabled ? "activada" : "desactivada"}`);
    void extra.refetch();
  };

  const sensors = (data?.sensors ?? []).filter(
    (s) => s.site_id === site?.id && s.thresholds && (s.thresholds as unknown as Thresholds).direction,
  );
  const rules = (extra.data?.rules ?? []).filter((r) => !r.site_id || r.site_id === site?.id);
  const zoneName = (id: string) => extra.data?.zones.find((z) => z.id === id || z.code === id)?.name ?? "";

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Configuración</h1>
        <p className="text-fg-muted text-xs">
          Umbrales de alerta, reglas, escalamiento y usuarios. Cada cambio queda registrado en la bitácora con
          su autor.
        </p>
      </div>
      <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <SegmentedControl<Tab>
          label="Sección"
          value={tab}
          onChange={setTab}
          options={[
            { value: "umbrales", label: "Umbrales" },
            { value: "reglas", label: "Reglas" },
            { value: "escalamiento", label: "Escalamiento" },
            { value: "usuarios", label: "Usuarios" },
            { value: "organizacion", label: "Organización" },
          ]}
        />
      </div>

      {(tab === "umbrales" || tab === "reglas") && data && (
        <Select
          aria-label="Embalse"
          value={site?.id ?? ""}
          onChange={(e) => setSiteId(e.target.value)}
          className="w-auto"
        >
          {data.sites.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      )}

      {!data || extra.isLoading ? (
        <Skeleton className="h-96" />
      ) : tab === "umbrales" ? (
        <Card>
          <CardHeader
            title="Umbrales por sensor"
            subtitle="Amarilla → naranja → roja; la histéresis evita que la alerta se active y desactive con el ruido"
            icon={<Gauge />}
          />
          <div className="border-border text-fg-faint hidden grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.7fr))_auto] gap-2 border-b px-4 py-2 text-[11px] font-semibold uppercase sm:grid">
            <span>Sensor</span>
            <span className="text-lvl-amarilla">Amarilla</span>
            <span className="text-lvl-naranja">Naranja</span>
            <span className="text-lvl-roja">Roja</span>
            <span>Histéresis</span>
            <span className="w-[86px]" />
          </div>
          <ul className="divide-border divide-y">
            {sensors.map((s) => (
              <ThresholdRow
                key={`${s.id}-${JSON.stringify(s.thresholds)}`}
                s={s}
                onSaved={() => void qc.invalidateQueries({ queryKey: ORG_LIVE_KEY })}
              />
            ))}
          </ul>
        </Card>
      ) : tab === "reglas" ? (
        <Card>
          <CardHeader
            title="Reglas de alerta"
            subtitle="Tasa de subida, combinadas, estructurales y de comunicación"
            icon={<ListChecks />}
          />
          <ul className="divide-border divide-y">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.name}</div>
                  <div className="text-fg-faint text-[11px]">
                    {r.code} · {r.kind} · nivel{" "}
                    <span className={LEVELS[r.level as AlertLevel].text}>{r.level}</span> · enfriamiento{" "}
                    {r.cooldown_min} min
                  </div>
                </div>
                <label className="text-fg-muted inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={r.enabled}
                    onChange={(e) => toggleRule(r.id, r.code, e.target.checked)}
                  />
                  {r.enabled ? "Activa" : "Inactiva"}
                </label>
              </li>
            ))}
          </ul>
        </Card>
      ) : tab === "escalamiento" ? (
        <Card>
          <CardHeader
            title="Política de escalamiento"
            subtitle="A quién se notifica y por qué canal si la alerta no se confirma"
            icon={<Send />}
          />
          <ul className="divide-border divide-y">
            {extra.data!.esc.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span
                  className={cn("w-20 text-xs font-semibold uppercase", LEVELS[e.level as AlertLevel].text)}
                >
                  {e.level}
                </span>
                <span className="tabular text-fg-muted w-28 font-mono text-xs">
                  {e.step === 0 ? "Inmediato" : `Paso ${e.step} · ${e.after_min} min`}
                </span>
                <span className="min-w-0 flex-1 text-sm">{e.description}</span>
                <span className="text-fg-faint text-[11px]">
                  {e.roles.map((r) => ROLE_LABEL[r as Role] ?? r).join(", ")} · {e.channels.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : tab === "usuarios" ? (
        <Card>
          <CardHeader
            title="Usuarios"
            subtitle={`${extra.data!.profiles.length} usuarios · altas por invitación de correo (Supabase Auth)`}
            icon={<Users />}
          />
          <ul className="divide-border divide-y">
            {extra.data!.profiles.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {p.full_name}{" "}
                    {p.is_demo && (
                      <span className="border-border text-fg-faint ml-1 rounded border px-1 text-[10px]">
                        DEMO
                      </span>
                    )}
                  </div>
                  <div className="text-fg-faint truncate text-[11px]">{p.email}</div>
                </div>
                <span className="text-fg-muted text-xs">{ROLE_LABEL[p.role as Role] ?? p.role}</span>
                <span className="text-fg-faint text-[11px]">
                  {p.zone_ids.length
                    ? p.zone_ids.map(zoneName).filter(Boolean).join(", ") || `${p.zone_ids.length} zonas`
                    : "Todas las zonas (lectura)"}{" "}
                  · {p.channels.join(", ")}
                </span>
                <span className={cn("text-xs font-medium", p.active ? "text-lvl-normal" : "text-fg-faint")}>
                  {p.active ? "Activo" : "Inactivo"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Organización e integraciones" subtitle={panel.orgName} icon={<Building2 />} />
          <dl className="grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
            {[
              ["Entidad", panel.branding.entity ?? panel.orgName],
              ["Unidad", panel.branding.unit ?? "—"],
              ["Producto", `${panel.branding.product ?? "GeRiAm"} · ${panel.branding.tagline ?? ""}`],
              ["Zona horaria", panel.timezone],
              ["Embalses", data.sites.map((s) => s.name).join(", ")],
              [
                "Contactos de emergencia",
                (panel.branding.contacts ?? []).map((c) => `${c.name} ${c.phone}`).join(" · ") || "—",
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-fg-faint text-[11px] uppercase">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="border-border border-t p-4">
            <h3 className="mb-2 text-[13px] font-semibold">Integraciones</h3>
            <ul className="space-y-1.5 text-sm">
              {extra.data!.integrations.length === 0 && (
                <li className="text-fg-muted">Sin integraciones externas registradas.</li>
              )}
              {extra.data!.integrations.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3">
                  <span>
                    {i.name} <span className="text-fg-faint text-[11px]">· {i.kind}</span>
                  </span>
                  <span className={cn("text-xs", i.enabled ? "text-lvl-normal" : "text-fg-faint")}>
                    {i.enabled ? "Activa" : "Inactiva"}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3">
                <span>Twilio (SMS / WhatsApp)</span>
                <span className="text-lvl-amarilla text-xs">Modo demostración</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>Web Push (VAPID)</span>
                <span className="text-lvl-normal text-xs">Activo</span>
              </li>
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}
