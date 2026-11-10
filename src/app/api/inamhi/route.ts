import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireApiRole, PANEL_ROLES } from "@/lib/auth/session";
import { meteoWarnings, REACHES, riverForecast, type ReachKey } from "@/lib/inamhi/geoglows";

/**
 * Datos públicos INAMHI–GEOGLOWS para el panel y la app (pronóstico de caudal y avisos).
 * Solo lectura de fuentes externas; requiere sesión para no actuar como proxy abierto.
 */
export const GET = handle(async (req: Request) => {
  await requireApiRole(PANEL_ROLES);
  const url = new URL(req.url);
  const reach = (url.searchParams.get("reach") ?? "ambato") as ReachKey;
  if (!(reach in REACHES)) return NextResponse.json({ error: "Tramo desconocido" }, { status: 400 });
  const [forecast, warnings] = await Promise.allSettled([riverForecast(reach), meteoWarnings()]);
  return NextResponse.json(
    {
      forecast: forecast.status === "fulfilled" ? forecast.value : null,
      forecastError:
        forecast.status === "rejected" ? String(forecast.reason?.message ?? forecast.reason) : null,
      warnings: warnings.status === "fulfilled" ? warnings.value : null,
      source: "INAMHI · GEOGLOWS (ECMWF)",
    },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
});
