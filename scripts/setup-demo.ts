/**
 * Puesta en marcha de la demo en el proyecto Supabase (schema geriam expuesto):
 *   1. Semilla desde config/sites.tungurahua.ts (idempotente, upserts)
 *   2. Usuarios demo por rol (*@geriam.demo) + perfiles
 *   3. Secretos de la app (cron_secret, VAPID) en geriam.app_secrets
 *   4. Backfill de 30 días a 15 min con el mismo motor físico (si no hay lecturas)
 *
 * Uso: pnpm tsx scripts/setup-demo.ts [--only=seed,users,secrets,backfill] [--days=30]
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { DB, GeriamSchema } from "../src/lib/supabase/config";
import {
  ORGANIZATION,
  ZONES,
  DOWNSTREAM_POINTS,
  SITES,
  PROTOCOLS,
  ESCALATION,
  DEMO_USERS,
  DEMO_PASSWORD,
  siteRules,
  buildCurve,
} from "../config/sites.tungurahua";
import { loadOrgBundle, simSensorsFor, paramsFor } from "../src/lib/runtime/repo";
import { initialState, stepSite, type SiteState } from "../src/lib/sim/physics";
import { emitReadings } from "../src/lib/sim/telemetry";
import { hashSeed } from "../src/lib/sim/prng";
import { insertReadings, readingRows, saveStates } from "../src/lib/runtime/tick";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const schema = (process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "geriam") as GeriamSchema;
const sb = createClient<DB, GeriamSchema>(url, key, { db: { schema }, auth: { persistSession: false, autoRefreshToken: false } });

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const only = args.only ? new Set(String(args.only).split(",")) : null;
const run = (step: string) => !only || only.has(step);

function ok<T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data === null || r.data === undefined) throw new Error(`${what}: sin datos`);
  return r.data as NonNullable<T>;
}

async function seed() {
  const org = ok(
    await sb
      .from("organizations")
      .upsert(
        { slug: ORGANIZATION.slug, name: ORGANIZATION.name, short_name: ORGANIZATION.short_name, timezone: ORGANIZATION.timezone, map_center: ORGANIZATION.map_center, branding: ORGANIZATION.branding },
        { onConflict: "slug" },
      )
      .select("*")
      .single(),
    "org",
  );
  await sb.from("organizations").update({ settings: { ...((org.settings ?? {}) as object), ...ORGANIZATION.settings } }).eq("id", org.id);
  const zones = ok(await sb.from("zones").upsert(ZONES.map((z) => ({ ...z, organization_id: org.id })), { onConflict: "organization_id,code" }).select("*"), "zones");
  const zoneId = (code: string) => zones.find((z) => z.code === code)?.id ?? null;

  const points: Record<string, string> = {};
  for (const d of DOWNSTREAM_POINTS) {
    const ex = await sb.from("downstream_points").select("id").eq("organization_id", org.id).eq("name", d.name).maybeSingle();
    const row = { organization_id: org.id, zone_id: zoneId(d.zone), name: d.name, kind: d.kind, lat: d.lat, lng: d.lng, verificado: d.verificado, poblacion_expuesta: d.poblacion };
    const r = ex.data
      ? ok(await sb.from("downstream_points").update(row).eq("id", ex.data.id).select("id").single(), "point")
      : ok(await sb.from("downstream_points").insert(row).select("id").single(), "point");
    points[d.key] = r.id;
  }

  for (const s of SITES) {
    const site = ok(
      await sb
        .from("sites")
        .upsert(
          {
            organization_id: org.id,
            zone_id: zoneId(s.zone),
            slug: s.slug,
            code: s.code,
            name: s.name,
            river: s.river,
            description: s.description,
            lat: s.lat,
            lng: s.lng,
            dam_lat: s.dam_lat,
            dam_lng: s.dam_lng,
            coord_verificado: s.coord_verificado,
            altitude_m: s.altitude_m,
            capacity_m3: s.capacity_m3,
            cota_fondo: s.cota_fondo,
            cota_cresta: s.cota_cresta,
            cota_namo: s.cota_namo,
            cota_name: s.cota_name,
            cota_vertedero: s.cota_vertedero,
            longitud_vertedero: s.longitud_vertedero,
            coeficiente_descarga: s.coeficiente_descarga,
            curva_area_volumen: buildCurve(s.cota_fondo, s.cota_namo, s.cota_cresta, s.capacity_m3, s.curva_m) as never,
            caudal_entrada_base: s.caudal_entrada_base,
            caudal_salida_nominal: s.caudal_salida_nominal,
            area_cuenca_km2: s.area_cuenca_km2,
            cauce_geojson: { type: "LineString", coordinates: s.cauce } as never,
            data_source: "simulado",
            metadata: s.metadata as never,
          },
          { onConflict: "organization_id,slug", ignoreDuplicates: false },
        )
        .select("*")
        .single(),
      `site ${s.code}`,
    );
    const g = s.gateway;
    const gw = ok(
      await sb
        .from("gateways")
        .upsert(
          {
            organization_id: org.id,
            site_id: site.id,
            name: g.name,
            eui: g.eui,
            lat: g.lat,
            lng: g.lng,
            link: "starlink",
            coverage_radius_m: g.radius_m,
            status: "online",
            last_seen_at: new Date().toISOString(),
            metadata: { modelo: "RAK7289 V2 (referencial)", backhaul: "Starlink Standard", antena: "Omnidireccional 5,8 dBi" } as never,
          },
          { onConflict: "eui" },
        )
        .select("*")
        .single(),
      "gateway",
    );
    ok(
      await sb.from("cameras").upsert(
        s.cameras.map((c) => ({ organization_id: org.id, site_id: site.id, code: c.code, name: c.name, kind: c.kind, demo_clip: c.clip, lat: c.lat, lng: c.lng, bearing: c.bearing, position_label: c.position, status: "online" })),
        { onConflict: "organization_id,code" },
      ),
      "cameras",
    );
    for (const d of s.downstream) {
      ok(
        await sb.from("site_downstream").upsert(
          { site_id: site.id, point_id: points[d.point], organization_id: org.id, distancia_km: d.distancia_km, tiempo_llegada_min: d.llegada_min, tiempo_transito_normal_min: d.transito_min, fuente: d.fuente },
          { onConflict: "site_id,point_id" },
        ),
        "route",
      );
    }
    for (const se of s.sensors) {
      const r = ok(
        await sb
          .from("sensors")
          .upsert(
            {
              organization_id: org.id,
              site_id: site.id,
              gateway_id: se.downstreamPoint ? null : gw.id,
              code: se.code,
              name: se.name,
              type: se.type,
              dev_eui: se.downstreamPoint ? null : `70B3D57ED00${s.code === "CHQ" ? "1" : "2"}${se.code.replace(/[^A-Z0-9]/g, "").slice(-4).padStart(4, "0")}`,
              unit: se.unit,
              decimals: se.decimals,
              lat: se.lat,
              lng: se.lng,
              position_label: se.position,
              battery_pct: se.battery,
              rssi: se.rssi,
              snr: se.snr,
              report_interval_s: se.interval_s,
              thresholds: (se.thresholds ?? {}) as never,
              status: "activo",
              data_source: "simulado",
              metadata: { enlace: se.downstreamPoint ? "celular/API" : se.gateway ? "cableado al gateway" : "LoRaWAN", downstream_point: se.downstreamPoint ?? null } as never,
            },
            { onConflict: "organization_id,code" },
          )
          .select("id")
          .single(),
        `sensor ${se.code}`,
      );
      if (se.downstreamPoint) await sb.from("downstream_points").update({ nivel_rio_sensor_id: r.id }).eq("id", points[se.downstreamPoint]);
    }
    ok(
      await sb.from("alert_rules").upsert(
        siteRules(s).map((r) => ({ organization_id: org.id, site_id: site.id, code: r.code, name: r.name, kind: r.kind, level: r.level, params: r.params as never, cooldown_min: r.cooldown_min })),
        { onConflict: "organization_id,code" },
      ),
      "rules",
    );
  }

  const existing = ok(await sb.from("protocols").select("level, role, title").eq("organization_id", org.id), "protocols");
  const missing = PROTOCOLS.map((p, i) => ({ ...p, sort: i })).filter((p) => !existing.some((e) => e.level === p.level && e.role === p.role && e.title === p.title));
  if (missing.length) ok(await sb.from("protocols").insert(missing.map((p) => ({ organization_id: org.id, level: p.level, role: p.role, phase: p.phase, title: p.title, actions: p.actions as never, sort: p.sort }))), "protocols");
  ok(
    await sb.from("escalation_policies").upsert(
      ESCALATION.map((e) => ({ organization_id: org.id, level: e.level, step: e.step, after_min: e.after_min, roles: [...e.roles], channels: [...e.channels], description: e.description })),
      { onConflict: "organization_id,level,step" },
    ),
    "escalation",
  );
  console.log(`✓ semilla: ${SITES.length} embalses, ${SITES.reduce((a, s) => a + s.sensors.length, 0)} sensores, ${DOWNSTREAM_POINTS.length} puntos aguas abajo`);
  return org.id;
}

async function users(orgId: string) {
  const zones = ok(await sb.from("zones").select("id, code").eq("organization_id", orgId), "zones");
  const list = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of DEMO_USERS) {
    let user = list.data?.users.find((x) => x.email === u.email);
    if (!user) {
      const r = await sb.auth.admin.createUser({ email: u.email, password: DEMO_PASSWORD, email_confirm: true, app_metadata: { geriam_demo: true } });
      if (r.error) throw new Error(`usuario ${u.email}: ${r.error.message}`);
      user = r.data.user;
    }
    ok(
      await sb.from("profiles").upsert(
        {
          id: user.id,
          organization_id: orgId,
          full_name: u.full_name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          zone_ids: zones.filter((z) => u.zones.includes(z.code)).map((z) => z.id),
          channels: u.channels,
          is_demo: true,
          active: true,
        },
        { onConflict: "id" },
      ),
      `perfil ${u.email}`,
    );
  }
  console.log(`✓ usuarios demo: ${DEMO_USERS.map((u) => u.email).join(", ")}`);
}

async function secrets(orgId: string) {
  const current = ok(await sb.from("app_secrets").select("name"), "secrets").map((x) => x.name);
  const rows: { name: string; value: string }[] = [];
  if (!current.includes("cron_secret")) rows.push({ name: "cron_secret", value: randomBytes(24).toString("base64url") });
  if (!current.includes("functions_url")) rows.push({ name: "functions_url", value: `${url.replace(/\/$/, "")}/functions/v1` });
  const appUrl = String(args["app-url"] ?? process.env.GERIAM_APP_URL ?? "https://geriam.vercel.app");
  if (!current.includes("app_url")) rows.push({ name: "app_url", value: appUrl });
  else if (args["app-url"]) ok(await sb.from("app_secrets").update({ value: appUrl }).eq("name", "app_url").select("name"), "app_url");
  let vapidPublic: string | null = null;
  if (!current.includes("vapid_private_key")) {
    const v = webpush.generateVAPIDKeys();
    rows.push({ name: "vapid_public_key", value: v.publicKey }, { name: "vapid_private_key", value: v.privateKey });
    vapidPublic = v.publicKey;
  }
  if (rows.length) ok(await sb.from("app_secrets").insert(rows), "secrets insert");
  if (!vapidPublic) {
    const r = await sb.from("app_secrets").select("value").eq("name", "vapid_public_key").maybeSingle();
    vapidPublic = r.data?.value ?? null;
  }
  const org = ok(await sb.from("organizations").select("settings").eq("id", orgId).single(), "org");
  await sb.from("organizations").update({ settings: { ...((org.settings ?? {}) as object), vapid_public_key: vapidPublic } }).eq("id", orgId);
  console.log(`✓ secretos: ${rows.length ? rows.map((r) => r.name).join(", ") : "ya existían"} (clave pública VAPID publicada en settings)`);
}

async function backfill(orgId: string, days: number) {
  const count = await sb.from("readings").select("sensor_id", { count: "exact", head: true }).eq("organization_id", orgId);
  if ((count.count ?? 0) > 0 && !args.force) {
    console.log(`• backfill omitido: ya hay ${count.count} lecturas (use --force)`);
    return;
  }
  const b = await loadOrgBundle(sb, orgId);
  const end = Date.now();
  const start = Math.floor((end - days * 86400_000) / 900_000) * 900_000;
  const offsets: Record<string, number> = { CHQ: -0.5, MLC: -1.6 };
  const states: Record<string, SiteState> = {};
  for (const s of b.sites) {
    const p = paramsFor(s);
    states[s.code] = initialState(p, p.namo + (offsets[s.code] ?? -0.8), start, hashSeed(`${s.code}-backfill`));
  }
  let total = 0;
  let buffer: ReturnType<typeof readingRows> = [];
  for (let t = start + 900_000; t <= end; t += 900_000) {
    for (const s of b.sites) states[s.code] = stepSite(paramsFor(s), states[s.code], 900);
    for (const s of b.sites) {
      const st = { ...states[s.code], lastEmit: { ...states[s.code].lastEmit }, battery: { ...states[s.code].battery } };
      const readings = emitReadings(st, simSensorsFor(b, s), states, { mode: "backfill", stepS: 900 });
      states[s.code] = st;
      buffer.push(...readingRows(orgId, st, readings));
    }
    if (buffer.length >= 5000) {
      await insertReadings(sb, buffer);
      total += buffer.length;
      buffer = [];
      process.stdout.write(`\r  backfill: ${total} lecturas…`);
    }
  }
  await insertReadings(sb, buffer);
  total += buffer.length;
  await saveStates(sb, b, states);
  console.log(`\n✓ backfill: ${total} lecturas (${days} días a 15 min)`);
}

async function main() {
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  let orgId: string;
  if (run("seed")) orgId = await seed();
  else orgId = ok(await sb.from("organizations").select("id").eq("slug", ORGANIZATION.slug).single(), "org").id;
  if (run("users")) await users(orgId);
  if (run("secrets")) await secrets(orgId);
  if (run("backfill")) await backfill(orgId, Number(args.days ?? 30));
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
