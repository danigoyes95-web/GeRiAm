"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Plug, Power, RadioTower, ShieldCheck, TriangleAlert } from "lucide-react";
import { usePanel } from "@/components/panel/PanelContext";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/misc";
import { ORG_LIVE_KEY, useOrgLive } from "@/lib/data/live";
import type { Sensor } from "@/lib/data/types";
import { SENSOR_LABEL, type DataSource, type SensorType } from "@/lib/domain/types";
import { getBrowserClient } from "@/lib/supabase/browser";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  chirpstack: "ChirpStack (LoRaWAN)",
  ttn: "The Things Stack (LoRaWAN)",
  generic: "Genérico (API JSON)",
  scada: "SCADA",
};
const SOURCE_LABEL: Record<DataSource, string> = {
  simulado: "Simulado (demo)",
  lorawan: "LoRaWAN (real)",
  scada: "SCADA (real)",
  api: "API (real)",
};

type Created = { name: string; token: string; hmacSecret: string | null };

async function audit(
  orgId: string,
  actor: { id: string; name: string },
  action: string,
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
      entity: "sensor",
      entity_id: entityId,
      details: details as never,
    });
}

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-1">
      <span className="text-fg-muted block text-[11px]">{label}</span>
      <div className="flex gap-1.5">
        <code
          className={cn(
            "bg-surface-2 border-border min-w-0 flex-1 truncate rounded-md border px-2 py-1.5 font-mono text-xs",
            secret && "text-lvl-amarilla",
          )}
        >
          {value}
        </code>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Copiar ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => undefined);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
        >
          {done ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

export function IntegrationsTab() {
  const panel = usePanel();
  const qc = useQueryClient();
  const { data } = useOrgLive();
  const canEdit = panel.role === "admin";
  const list = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const r = await getBrowserClient()
        .from("integrations")
        .select("id, kind, name, enabled, last_used_at, created_at")
        .order("created_at");
      return r.data ?? [];
    },
  });
  const [form, setForm] = useState({ name: "", kind: "chirpstack", hmac: true });
  const [created, setCreated] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = typeof window === "undefined" ? "/api/ingest" : `${window.location.origin}/api/ingest`;

  const create = async () => {
    if (form.name.trim().length < 3) return toast.error("Ponga un nombre (p. ej. «ChirpStack Prefectura»)");
    setBusy(true);
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = (await res.json().catch(() => ({}))) as {
      error?: string;
      token?: string;
      hmacSecret?: string | null;
    };
    setBusy(false);
    if (!res.ok || !j.token) return toast.error(j.error ?? "No se pudo crear");
    setCreated({ name: form.name, token: j.token, hmacSecret: j.hmacSecret ?? null });
    setForm({ ...form, name: "" });
    void list.refetch();
  };
  const toggle = async (id: string, enabled: boolean) => {
    const res = await fetch("/api/integrations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    if (!res.ok) return toast.error("No se pudo actualizar");
    toast.success(enabled ? "Integración activada" : "Integración desactivada: su token ya no funciona");
    void list.refetch();
  };

  const sensors = useMemo(
    () => (data?.sensors ?? []).slice().sort((a, b) => a.code.localeCompare(b.code)),
    [data?.sensors],
  );
  const realCount = sensors.filter((s) => s.data_source !== "simulado").length;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Integraciones de datos reales"
          subtitle="Conecte el servidor LoRaWAN (ChirpStack o The Things Stack), un SCADA o cualquier sistema por API"
          icon={<Plug />}
        />
        <CardBody className="space-y-4">
          <div className="text-fg-muted grid gap-3 text-xs leading-relaxed md:grid-cols-3">
            <p className="flex gap-2">
              <KeyRound className="text-accent mt-0.5 size-4 shrink-0" />
              Cada integración tiene su propio token. GeRiAm guarda solo su huella (SHA-256): si se pierde, se
              crea otra y se desactiva la anterior.
            </p>
            <p className="flex gap-2">
              <ShieldCheck className="text-accent mt-0.5 size-4 shrink-0" />
              Con firma HMAC, cada envío lleva hora y firma: una trama capturada no se puede reenviar ni
              alterar.
            </p>
            <p className="flex gap-2">
              <RadioTower className="text-accent mt-0.5 size-4 shrink-0" />
              Cada valor se valida (rango físico, fecha y saltos bruscos) antes de guardarse, y las alertas se
              evalúan al instante.
            </p>
          </div>

          {created && (
            <div className="border-lvl-amarilla/50 bg-lvl-amarilla/5 space-y-3 rounded-lg border p-3">
              <p className="text-lvl-amarilla flex items-center gap-1.5 text-sm font-semibold">
                <TriangleAlert className="size-4" /> Copie estos datos ahora: no se volverán a mostrar
              </p>
              <CopyField label="URL de envío (POST)" value={endpoint} />
              <CopyField label="Cabecera Authorization" value={`Bearer ${created.token}`} secret />
              {created.hmacSecret && <CopyField label="Secreto HMAC" value={created.hmacSecret} secret />}
              <p className="text-fg-muted text-[11px] leading-relaxed">
                {created.hmacSecret
                  ? "Firma: enviar x-geriam-timestamp (segundos Unix) y x-geriam-signature = HMAC-SHA256 en hexadecimal de «timestamp.cuerpo» con el secreto. "
                  : ""}
                En ChirpStack: Aplicación → Integraciones → HTTP, con esta URL y la cabecera. En The Things
                Stack: Webhooks → Uplink message.
              </p>
              <Button size="sm" variant="secondary" onClick={() => setCreated(null)}>
                Ya los guardé
              </Button>
            </div>
          )}

          {canEdit && (
            <div className="grid gap-2 sm:items-end md:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto_auto]">
              <label className="space-y-1">
                <span className="text-fg-muted block text-[11px]">Nombre</span>
                <Input
                  value={form.name}
                  placeholder="ChirpStack Prefectura"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-fg-muted block text-[11px]">Tipo</span>
                <Select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}
                  aria-label="Tipo de integración"
                  className="w-full min-w-0"
                >
                  {Object.entries(KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.hmac}
                  onChange={(e) => setForm({ ...form, hmac: e.target.checked })}
                  className="size-4 accent-[var(--accent)]"
                />
                Exigir firma HMAC
              </label>
              <Button onClick={create} disabled={busy}>
                <KeyRound /> Crear integración
              </Button>
            </div>
          )}

          <ul className="divide-border border-border divide-y rounded-lg border text-sm">
            {(list.data ?? []).length === 0 && (
              <li className="text-fg-muted p-3">
                Aún no hay integraciones: todos los datos de sensores son simulados.
              </li>
            )}
            {(list.data ?? []).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-medium">{i.name}</p>
                  <p className="text-fg-faint text-[11px]">
                    {KIND_LABEL[i.kind] ?? i.kind} · último envío{" "}
                    {i.last_used_at ? formatDateTime(i.last_used_at) : "nunca"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn("text-xs font-medium", i.enabled ? "text-lvl-normal" : "text-fg-faint")}
                  >
                    {i.enabled ? "Activa" : "Desactivada"}
                  </span>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant={i.enabled ? "ghost" : "secondary"}
                      onClick={() => toggle(i.id, !i.enabled)}
                    >
                      <Power /> {i.enabled ? "Desactivar" : "Activar"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Fuente de datos de cada sensor"
          subtitle={`${realCount} de ${sensors.length} con datos reales · un sensor real deja de simularse y debe recibir datos de una integración`}
          icon={<RadioTower />}
        />
        <div className="divide-border divide-y">
          {sensors.map((s) => (
            <SensorSourceRow
              key={s.id}
              sensor={s}
              siteName={data?.sites.find((x) => x.id === s.site_id)?.name.replace("Embalse ", "") ?? ""}
              canEdit={canEdit}
              onSaved={() => qc.invalidateQueries({ queryKey: ORG_LIVE_KEY })}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function SensorSourceRow({
  sensor,
  siteName,
  canEdit,
  onSaved,
}: {
  sensor: Sensor;
  siteName: string;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const panel = usePanel();
  const [src, setSrc] = useState<DataSource>(sensor.data_source as DataSource);
  const [eui, setEui] = useState(sensor.dev_eui ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = src !== sensor.data_source || eui !== (sensor.dev_eui ?? "");
  const save = async () => {
    const e = eui.trim().toUpperCase();
    if (e && !/^[0-9A-F]{16}$/.test(e))
      return toast.error("El DevEUI debe tener 16 caracteres hexadecimales");
    if (src !== "simulado" && sensor.data_source === "simulado") {
      const ok = window.confirm(
        `¿Pasar ${sensor.code} a datos reales (${SOURCE_LABEL[src]})?\n\nEl simulador dejará de generar sus lecturas. Si no llegan datos reales en 3× su intervalo, se abrirá una alerta de "sensor sin reportar".`,
      );
      if (!ok) return;
    }
    setBusy(true);
    const r = await getBrowserClient()
      .from("sensors")
      .update({ data_source: src, dev_eui: e || null })
      .eq("id", sensor.id);
    setBusy(false);
    if (r.error) return toast.error(`No se pudo guardar: ${r.error.message}`);
    await audit(
      panel.orgId,
      { id: panel.userId, name: panel.name },
      "configuracion.fuente_sensor",
      sensor.id,
      {
        sensor: sensor.code,
        antes: { fuente: sensor.data_source, dev_eui: sensor.dev_eui },
        despues: { fuente: src, dev_eui: e || null },
      },
    );
    toast.success(`${sensor.code}: ${SOURCE_LABEL[src]}`);
    onSaved();
  };
  return (
    <div className="grid gap-2 px-4 py-2.5 text-sm sm:items-center md:grid-cols-[minmax(0,1fr)_190px_200px_auto]">
      <div className="min-w-0">
        <p className="truncate font-medium">
          <span className="font-mono text-xs">{sensor.code}</span> ·{" "}
          {SENSOR_LABEL[sensor.type as SensorType] ?? sensor.type}
        </p>
        <p className="text-fg-faint truncate text-[11px]">
          {siteName} · {sensor.name}
        </p>
      </div>
      <Select
        value={src}
        disabled={!canEdit}
        onChange={(e) => setSrc(e.target.value as DataSource)}
        aria-label={`Fuente de ${sensor.code}`}
      >
        {(Object.keys(SOURCE_LABEL) as DataSource[]).map((k) => (
          <option key={k} value={k}>
            {SOURCE_LABEL[k]}
          </option>
        ))}
      </Select>
      <Input
        value={eui}
        disabled={!canEdit}
        placeholder="DevEUI (LoRaWAN)"
        onChange={(e) => setEui(e.target.value)}
        className="font-mono text-xs"
        aria-label={`DevEUI de ${sensor.code}`}
      />
      {canEdit ? (
        <Button size="sm" variant={dirty ? "primary" : "ghost"} disabled={!dirty || busy} onClick={save}>
          Guardar
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}
