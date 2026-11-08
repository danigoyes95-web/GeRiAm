// GeRiAm · Edge Function geriam-simulator-tick
// Disparada por pg_cron (job geriam_simulator_tick, cada minuto) vía pg_net.
// Relé autenticado hacia POST /api/sim/tick de la aplicación, donde corre el motor
// compartido (src/lib/runtime). El secreto y la URL de la app se leen de
// geriam.app_secrets (cron_secret, app_url) con la clave de servicio del proyecto.
const SCHEMA = Deno.env.get("GERIAM_SCHEMA") ?? "geriam";

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
  return keys.default ?? Object.values(keys)[0] ?? "";
}

let cache: { at: number; secrets: Record<string, string> } | null = null;
async function appSecrets(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.secrets;
  const key = serviceKey();
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/app_secrets?select=name,value&name=in.(cron_secret,app_url)`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": SCHEMA },
  });
  const rows = (await res.json()) as { name: string; value: string }[];
  const secrets = Object.fromEntries((Array.isArray(rows) ? rows : []).map((r) => [r.name, r.value]));
  cache = { at: Date.now(), secrets };
  return secrets;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  const s = await appSecrets();
  const got = req.headers.get("x-geriam-secret") ?? "";
  if (!s.cron_secret || !safeEqual(got, s.cron_secret)) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!s.app_url) return Response.json({ error: "app_url no configurada en geriam.app_secrets" }, { status: 500 });
  const res = await fetch(`${s.app_url.replace(/\/$/, "")}/api/sim/tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-geriam-secret": s.cron_secret },
    body: (await req.text()) || "{}",
    signal: AbortSignal.timeout(55_000),
  });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
});
