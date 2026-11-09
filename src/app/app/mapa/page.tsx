"use client";
import { useEffect, useMemo, useState } from "react";
import { Crosshair, Navigation } from "lucide-react";
import { BasinMap } from "@/components/map/BasinMap";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/design";
import { useApp } from "@/components/app/AppContext";
import { useCachedLive } from "@/components/app/useCachedLive";
import { useSiteSummaries } from "@/lib/data/live";
import { formatNumber } from "@/lib/format";

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function AppMapa() {
  const app = useApp();
  const { data } = useCachedLive();
  const summaries = useSiteSummaries(data);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [flight, setFlight] = useState<{ target: "cuenca" | "ambato" | "site"; siteId?: string; nonce: number } | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setGeoError(null);
      },
      (e) => setGeoError(e.code === 1 ? "Permiso de ubicación denegado" : "No se pudo obtener la ubicación"),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const sites = useMemo(() => summaries.map((s) => ({ site: s.site, level: s.level, fillPct: s.fillPct })), [summaries]);

  return (
    <div className="-mx-4 -mt-4 flex flex-col">
      <div className="relative h-[58dvh] min-h-[320px]">
        {data && (
          <BasinMap
            className="absolute inset-0"
            center={{ ...app.mapCenter, zoom: app.mapCenter.zoom - 1.2, pitch: 50 }}
            sites={sites}
            gateways={data.gateways}
            points={data.points}
            showSensors={false}
            showCoverage={false}
            compact
            userPosition={pos}
            flight={flight}
          />
        )}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <Button size="sm" variant="secondary" className="bg-bg/85 backdrop-blur" onClick={() => setFlight({ target: "cuenca", nonce: Date.now() })}>
            <Crosshair /> Embalses
          </Button>
          <Button size="sm" variant="secondary" className="bg-bg/85 backdrop-blur" onClick={() => setFlight({ target: "ambato", nonce: Date.now() })}>
            <Navigation /> Cauce
          </Button>
        </div>
      </div>
      <div className="space-y-2 px-4 pt-4">
        <p className="text-xs text-fg-muted">
          {pos ? (
            <>
              Su ubicación: <span className="tabular font-mono">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</span> (± {formatNumber(pos.accuracy, 0)} m)
            </>
          ) : (
            geoError ?? "Buscando su ubicación…"
          )}
        </p>
        {summaries.map((s) => (
          <button
            key={s.site.id}
            type="button"
            onClick={() => setFlight({ target: "site", siteId: s.site.id, nonce: Date.now() })}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-left"
          >
            <div>
              <div className="text-sm font-medium">{s.site.name}</div>
              <div className="text-xs text-fg-faint">
                {pos ? `A ${formatNumber(distanceKm(pos, { lat: s.site.dam_lat, lng: s.site.dam_lng }), 1)} km de la cortina` : "Distancia: active la ubicación"}
              </div>
            </div>
            <StatusBadge level={s.level} size="sm" />
          </button>
        ))}
        {data?.points.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs text-fg-muted">
            <span>Punto de control · {p.name}</span>
            <span>{pos ? `${formatNumber(distanceKm(pos, p), 1)} km` : `${formatNumber(p.poblacion_expuesta, 0)} hab.`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
