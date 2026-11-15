import { NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { handle, rateLimit } from "@/lib/api";
import { HttpError } from "@/lib/auth/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { decodeBody, extractValue, validateReading, type Uplink } from "@/lib/ingest/decode";
import { evaluateSitesNow } from "@/lib/runtime/tick";
import type { SensorType } from "@/lib/domain/types";

export const runtime = "nodejs";

const MAX_BYTES = 256 * 1024;
/** Una trama LoRaWAN repetida (mismo equipo y contador) dentro de esta ventana se ignora. */
const DEDUPE_MS = 6 * 3600 * 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Entrada de datos reales de sensores.
 *
 * Autenticación: `Authorization: Bearer <token de la integración>` (se guarda solo su SHA-256).
 * Si la integración tiene secreto HMAC, además `x-geriam-timestamp` (segundos) y
 * `x-geriam-signature` = hex(HMAC-SHA256(secreto, `${timestamp}.${cuerpo}`)), con ±5 min de margen
 * (impide reenviar una trama capturada).
 *
 * Formatos: evento "up" de ChirpStack v4, uplink de The Things Stack v3, o
 * `{ "readings": [{ "sensor_code": "...", "value": 0, "ts": "ISO" }] }`.
 *
 * Cada valor se valida (rango físico, fecha, salto brusco) antes de guardarse; solo se aceptan sensores de
 * la organización de la integración configurados como fuente real (no "simulado").
 */
export const POST = handle(async (req: Request) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new HttpError(413, "Cuerpo demasiado grande (máx. 256 KB)");
  const raw = await req.text();
  if (raw.length > MAX_BYTES) throw new HttpError(413, "Cuerpo demasiado grande (máx. 256 KB)");

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token.length < 24) throw new HttpError(401, "Token de integración requerido");
  const sb = getAdminClient();
  const integ = await sb.from("integrations").select("*").eq("token_hash", sha256(token)).maybeSingle();
  if (!integ.data || !integ.data.enabled)
    throw new HttpError(401, "Token inválido o integración desactivada");
  const it = integ.data;
  rateLimit(`ingest:${it.id}`, 1200, 60_000);

  if (it.hmac_secret) {
    const ts = req.headers.get("x-geriam-timestamp") ?? "";
    const sig = (req.headers.get("x-geriam-signature") ?? "").toLowerCase();
    const t = Number(ts);
    if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300)
      throw new HttpError(401, "Marca de tiempo ausente o fuera de margen");
    const want = createHmac("sha256", it.hmac_secret).update(`${ts}.${raw}`).digest("hex");
    if (!same(sig, want)) throw new HttpError(401, "Firma inválida");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
  let decoded: ReturnType<typeof decodeBody>;
  try {
    decoded = decodeBody(body);
  } catch (e) {
    throw new HttpError(422, e instanceof Error ? e.message : "Formato no reconocido");
  }

  const now = Date.now();
  const orgId = it.organization_id;
  const [sensorsQ, sitesQ] = await Promise.all([
    sb
      .from("sensors")
      .select("id, site_id, code, type, dev_eui, data_source, status, last_value, last_reading_at")
      .eq("organization_id", orgId),
    sb.from("sites").select("id, cota_fondo, cota_cresta").eq("organization_id", orgId),
  ]);
  if (sensorsQ.error || sitesQ.error) throw new Error((sensorsQ.error ?? sitesQ.error)!.message);
  const sensors = sensorsQ.data ?? [];
  const sites = new Map(
    (sitesQ.data ?? []).map((s) => [s.id, { fondo: Number(s.cota_fondo), cresta: Number(s.cota_cresta) }]),
  );

  const rejected: { ref: string; reason: string }[] = [];
  let duplicates = 0;
  let doubtful = 0;
  const rows: {
    sensor_id: string;
    ts: string;
    value: number;
    quality: number;
    organization_id: string;
    raw: never;
  }[] = [];
  const touched = new Set<string>();
  const radio: { id: string; rssi?: number; snr?: number; battery?: number }[] = [];

  for (const u of decoded.uplinks as Uplink[]) {
    const ref = u.devEui ?? u.sensorCode ?? "?";
    const s = u.devEui
      ? sensors.find((x) => x.dev_eui?.toUpperCase() === u.devEui)
      : sensors.find((x) => x.code === u.sensorCode);
    if (!s) {
      rejected.push({ ref, reason: "equipo o sensor no registrado en esta organización" });
      continue;
    }
    if (s.status === "baja") {
      rejected.push({ ref, reason: "sensor dado de baja" });
      continue;
    }
    if (s.data_source === "simulado") {
      rejected.push({
        ref,
        reason: "el sensor está en modo simulado: cámbielo a fuente real en Configuración → Integraciones",
      });
      continue;
    }
    // idempotencia LoRaWAN: misma trama (equipo + contador) en las últimas 6 h
    if (u.devEui && u.fcnt !== undefined) {
      const prev = await sb
        .from("ingest_log")
        .select("received_at")
        .eq("dev_eui", u.devEui)
        .eq("fcnt", u.fcnt)
        .maybeSingle();
      if (prev.data && now - new Date(prev.data.received_at).getTime() < DEDUPE_MS) {
        duplicates++;
        continue;
      }
      await sb
        .from("ingest_log")
        .upsert({
          dev_eui: u.devEui,
          fcnt: u.fcnt,
          organization_id: orgId,
          source: decoded.format,
          received_at: new Date(now).toISOString(),
        });
    }
    const value = extractValue(u, s.type as SensorType);
    if (value === undefined) {
      rejected.push({ ref, reason: `no se encontró un valor para un sensor de tipo ${s.type}` });
      continue;
    }
    const v = validateReading(s.type as SensorType, value, u.ts, {
      now,
      site: sites.get(s.site_id),
      last:
        s.last_value !== null && s.last_reading_at
          ? { value: s.last_value, ts: new Date(s.last_reading_at).getTime() }
          : null,
    });
    if (!v.ok) {
      rejected.push({ ref, reason: v.reason ?? "valor inválido" });
      continue;
    }
    if (v.quality) doubtful++;
    rows.push({
      sensor_id: s.id,
      ts: new Date(u.ts).toISOString(),
      value,
      quality: v.quality,
      organization_id: orgId,
      raw: {
        source: decoded.format,
        integration: it.name,
        fcnt: u.fcnt ?? null,
        rssi: u.rssi ?? null,
        snr: u.snr ?? null,
        note: v.reason ?? null,
      } as never,
    });
    touched.add(s.site_id);
    if (u.rssi !== undefined || u.snr !== undefined || u.battery !== undefined)
      radio.push({ id: s.id, rssi: u.rssi, snr: u.snr, battery: u.battery });
  }

  if (rows.length) {
    const ins = await sb
      .from("readings")
      .upsert(rows, { onConflict: "sensor_id,ts", ignoreDuplicates: true });
    if (ins.error) throw new Error(ins.error.message);
  }
  for (const r of radio) {
    const patch: { rssi?: number; snr?: number; battery_pct?: number } = {};
    if (r.rssi !== undefined) patch.rssi = r.rssi;
    if (r.snr !== undefined) patch.snr = r.snr;
    if (r.battery !== undefined && r.battery >= 0 && r.battery <= 100) patch.battery_pct = r.battery;
    if (Object.keys(patch).length) await sb.from("sensors").update(patch).eq("id", r.id);
  }
  await sb
    .from("integrations")
    .update({ last_used_at: new Date(now).toISOString() })
    .eq("id", it.id);
  // alertas al instante con el dato real (no se espera al ciclo de 60 s)
  const alertsEvaluated = touched.size ? await evaluateSitesNow(sb, orgId, [...touched], now) : 0;

  return NextResponse.json({
    ok: true,
    format: decoded.format,
    accepted: rows.length,
    doubtful,
    duplicates,
    rejected,
    alertsEvaluated,
  });
});
