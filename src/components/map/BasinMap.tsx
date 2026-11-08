"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap, Marker, GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type * as GeoJSON from "geojson";
import { MapPinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVELS } from "@/design/levels";
import { formatNumber } from "@/lib/format";
import type { StatusLevel } from "@/lib/domain/types";
import type { Camera, DownstreamPoint, Gateway, MapCenter, Sensor, Site } from "@/lib/data/types";

export type MapSelection =
  | { kind: "site"; id: string }
  | { kind: "gateway"; id: string }
  | { kind: "sensor"; id: string }
  | { kind: "camera"; id: string }
  | { kind: "point"; id: string };

export interface BasinMapSite {
  site: Site;
  level: StatusLevel;
  fillPct: number | null;
}

export interface BasinMapProps {
  center: MapCenter;
  sites: BasinMapSite[];
  gateways?: Gateway[];
  sensors?: Sensor[];
  cameras?: Camera[];
  points?: DownstreamPoint[];
  showCoverage?: boolean;
  showSensors?: boolean;
  /** rotación lenta (portal) */
  orbit?: boolean;
  interactive?: boolean;
  userPosition?: { lat: number; lng: number; accuracy?: number } | null;
  onSelect?: (s: MapSelection | null) => void;
  selected?: MapSelection | null;
  className?: string;
  /** controla un vuelo programático (cambia el nonce para repetir) */
  flight?: { target: "cuenca" | "ambato" | "site"; siteId?: string; nonce: number } | null;
  /** Mostrar solo nivel de detalle compacto (app móvil) */
  compact?: boolean;
}

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

function circlePolygon(lng: number, lat: number, radiusM: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const dLat = radiusM / 110574;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

function siteMarkerHtml(s: BasinMapSite, selected: boolean) {
  const lvl = LEVELS[s.level];
  const pct = s.fillPct === null ? "—" : `${formatNumber(s.fillPct, 0)}%`;
  return `
  <div class="geriam-site-marker" style="--c:${lvl.cssVar}">
    <div class="gsm-ring ${s.level === "roja" || s.level === "naranja" ? "gsm-pulse" : ""}"></div>
    <div class="gsm-chip ${selected ? "gsm-sel" : ""}">
      <span class="gsm-dot"></span>
      <span class="gsm-name">${s.site.name.replace("Embalse ", "")}</span>
      <span class="gsm-pct">${pct}</span>
    </div>
    <div class="gsm-stem"></div>
  </div>`;
}

export function BasinMap({
  center,
  sites,
  gateways = [],
  sensors = [],
  cameras = [],
  points = [],
  showCoverage = true,
  showSensors = true,
  orbit = false,
  interactive = true,
  userPosition,
  onSelect,
  selected,
  className,
  flight,
  compact,
}: BasinMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(TOKEN ? null : "Falta NEXT_PUBLIC_MAPBOX_TOKEN");
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Inicialización
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    let raf = 0;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [center.lng, center.lat],
        zoom: center.zoom,
        pitch: center.pitch,
        bearing: center.bearing,
        interactive,
        attributionControl: true,
        cooperativeGestures: compact,
        language: "es",
      });
      mapRef.current = map;
      if (interactive) map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
      map.on("error", (e) => {
        const msg = (e as { error?: { message?: string } }).error?.message ?? "";
        if (/access token|401|403/i.test(msg)) setFailed("Token de Mapbox inválido o restringido");
      });
      map.on("style.load", () => {
        map.addSource("mapbox-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1.45 });
        map.setFog({
          range: [0.8, 9],
          color: "rgba(186, 210, 235, 0.55)",
          "high-color": "#24324a",
          "horizon-blend": 0.12,
          "space-color": "#070d18",
          "star-intensity": 0.15,
        });
        map.addSource("cauce", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "cauce-glow", type: "line", source: "cauce", paint: { "line-color": "#22d3ee", "line-width": 9, "line-opacity": 0.22, "line-blur": 6 } });
        map.addLayer({ id: "cauce-line", type: "line", source: "cauce", paint: { "line-color": "#67e8f9", "line-width": 2.4, "line-dasharray": [2, 1.5] } });
        map.addSource("coverage", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "coverage-fill", type: "fill", source: "coverage", paint: { "fill-color": "#a78bfa", "fill-opacity": 0.07 } });
        map.addLayer({ id: "coverage-line", type: "line", source: "coverage", paint: { "line-color": "#a78bfa", "line-width": 1.2, "line-opacity": 0.6, "line-dasharray": [3, 2] } });
        map.addSource("sensors", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "sensors-dot",
          type: "circle",
          source: "sensors",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 15, 6],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#04121a",
            "circle-stroke-width": 1.2,
          },
        });
        map.on("click", "sensors-dot", (e) => {
          const f = e.features?.[0] as { properties?: Record<string, unknown> | null } | undefined;
          const id = f?.properties?.id as string | undefined;
          if (id) onSelectRef.current?.({ kind: "sensor", id });
        });
        map.on("mouseenter", "sensors-dot", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "sensors-dot", () => (map.getCanvas().style.cursor = ""));
        setReady(true);
      });
      if (orbit) {
        const rotate = () => {
          if (!mapRef.current) return;
          if (!map.isMoving()) map.rotateTo(map.getBearing() + 0.6, { duration: 1000, easing: (t) => t });
          raf = window.setTimeout(rotate, 1000) as unknown as number;
        };
        map.once("idle", rotate);
      }
    })().catch((e) => setFailed(e instanceof Error ? e.message : "No se pudo cargar el mapa"));
    return () => {
      cancelled = true;
      clearTimeout(raf);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // la inicialización ocurre una sola vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Datos: cauce, cobertura, sensores
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const cauce = map.getSource("cauce") as GeoJSONSource | undefined;
    cauce?.setData({
      type: "FeatureCollection",
      features: sites
        .filter((s) => s.site.cauce_geojson)
        .map((s) => ({ type: "Feature", properties: { site: s.site.code }, geometry: s.site.cauce_geojson as unknown as GeoJSON.LineString })),
    });
    (map.getSource("coverage") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: showCoverage ? gateways.map((g) => circlePolygon(g.lng, g.lat, g.coverage_radius_m)) : [],
    });
    const now = Date.now();
    (map.getSource("sensors") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: showSensors
        ? sensors.map((s) => {
            const stale = !s.last_reading_at || now - new Date(s.last_reading_at).getTime() > s.report_interval_s * 3000;
            return {
              type: "Feature",
              properties: { id: s.id, color: stale ? "#a78bfa" : "#22d3ee" },
              geometry: { type: "Point", coordinates: [s.lng, s.lat] },
            };
          })
        : [],
    });
  }, [ready, sites, gateways, sensors, showCoverage, showSensors]);

  // Marcadores HTML (embalses, cámaras, gateways, puntos de control)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      const add = (el: HTMLElement, lng: number, lat: number, sel: MapSelection, anchor: "bottom" | "center" = "center") => {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current?.(sel);
        });
        markersRef.current.push(new mapboxgl.Marker({ element: el, anchor }).setLngLat([lng, lat]).addTo(map));
      };
      for (const s of sites) {
        const el = document.createElement("button");
        el.type = "button";
        el.setAttribute("aria-label", `${s.site.name}: ${LEVELS[s.level].label}`);
        el.innerHTML = siteMarkerHtml(s, selected?.kind === "site" && selected.id === s.site.id);
        add(el, s.site.lng, s.site.lat, { kind: "site", id: s.site.id }, "bottom");
        if (!compact) {
          const dam = document.createElement("div");
          dam.className = "geriam-dam";
          dam.title = `Cortina ${s.site.name}`;
          add(dam, s.site.dam_lng, s.site.dam_lat, { kind: "site", id: s.site.id });
        }
      }
      if (!compact) {
        for (const g of gateways) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = `geriam-gw ${g.status === "offline" ? "is-off" : ""}`;
          el.setAttribute("aria-label", `${g.name} (${g.status})`);
          el.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/></svg>`;
          add(el, g.lng, g.lat, { kind: "gateway", id: g.id });
        }
        for (const c of cameras) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "geriam-cam";
          el.setAttribute("aria-label", `Cámara ${c.code}`);
          el.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>`;
          add(el, c.lng, c.lat, { kind: "camera", id: c.id });
        }
      }
      for (const p of points) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "geriam-point";
        el.innerHTML = `<span class="gp-dot"></span><span class="gp-label">${p.name}${p.poblacion_expuesta ? ` · ${formatNumber(p.poblacion_expuesta, 0)} hab.` : ""}</span>`;
        add(el, p.lng, p.lat, { kind: "point", id: p.id });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, sites, gateways, cameras, points, selected, compact]);

  // Posición del usuario (PWA)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      userMarkerRef.current?.remove();
      if (!userPosition) return;
      const el = document.createElement("div");
      el.className = "geriam-user";
      userMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([userPosition.lng, userPosition.lat]).addTo(map);
    })();
  }, [ready, userPosition]);

  // Vuelos programáticos
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !flight) return;
    if (flight.target === "cuenca") {
      map.flyTo({ center: [center.lng, center.lat], zoom: center.zoom, pitch: center.pitch, bearing: center.bearing, duration: 2600, essential: true });
    } else if (flight.target === "site") {
      const s = sites.find((x) => x.site.id === flight.siteId);
      if (s) map.flyTo({ center: [s.site.lng, s.site.lat], zoom: 15.2, pitch: 64, bearing: map.getBearing(), duration: 2200, essential: true });
    } else {
      // seguir el cauce hasta Ambato
      const line = sites.find((s) => s.site.cauce_geojson)?.site.cauce_geojson as unknown as GeoJSON.LineString | undefined;
      if (!line) return;
      const coords = line.coordinates as [number, number][];
      const keys = [Math.floor(coords.length * 0.25), Math.floor(coords.length * 0.55), coords.length - 1];
      let i = 0;
      const next = () => {
        if (i >= keys.length || !mapRef.current) return;
        const c = coords[keys[i]];
        const prev = coords[Math.max(0, keys[i] - 2)];
        const bearing = (Math.atan2(c[0] - prev[0], c[1] - prev[1]) * 180) / Math.PI;
        map.flyTo({ center: c, zoom: i === keys.length - 1 ? 13.6 : 13, pitch: 66, bearing, duration: 3200, essential: true });
        i++;
        map.once("moveend", next);
      };
      next();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.nonce, ready]);

  return (
    <div className={cn("relative overflow-hidden bg-[#0b1626]", className)}>
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && !failed && (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,#13233a,#070d18)]">
          <div className="flex flex-col items-center gap-2 text-xs text-fg-faint">
            <span className="size-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-hidden />
            Cargando relieve 3D de la cuenca…
          </div>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,#13233a,#070d18)] p-6 text-center">
          <div className="flex max-w-xs flex-col items-center gap-2">
            <MapPinOff className="size-6 text-fg-faint" aria-hidden />
            <p className="text-sm font-medium text-fg">Mapa no disponible</p>
            <p className="text-xs text-fg-muted">{failed}. Los datos en vivo siguen disponibles en los paneles.</p>
          </div>
        </div>
      )}
    </div>
  );
}
