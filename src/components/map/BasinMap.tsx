"use client";
import { useEffect, useRef, useState } from "react";
import type { DrillScene } from "@/lib/drill/scene";
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
  /** Sin mensajes de carga/error (fondo decorativo del portal) */
  quiet?: boolean;
  /** Escena del simulacro en curso: lluvia 3D, frente de crecida por el cauce y llegada a cada punto */
  scene?: DrillScene | null;
}

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/**
 * Respaldo cuando la cuenta de Mapbox no entrega teselas raster (satélite / relieve):
 * estilo topográfico vectorial + relieve 3D de Terrain Tiles (AWS Open Data, Terrarium).
 */
const STYLE_SATELLITE = "mapbox://styles/mapbox/satellite-streets-v12";
const STYLE_TOPO = "mapbox://styles/mapbox/outdoors-v12";
const RASTER_FLAG = "geriam-map-raster-blocked";
function rasterBlocked(): boolean {
  try {
    return sessionStorage.getItem(RASTER_FLAG) === "1";
  } catch {
    return false;
  }
}
function markRasterBlocked() {
  try {
    sessionStorage.setItem(RASTER_FLAG, "1");
  } catch {
    /* noop */
  }
}

function circlePolygon(
  lng: number,
  lat: number,
  radiusM: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
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

/** El mapa sigue montado y con estilo (tras map.remove() el estilo queda indefinido). */
const alive = (map: MapboxMap) => !!(map as unknown as { style?: unknown }).style;

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
  quiet,
  scene,
}: BasinMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [dataNonce, setDataNonce] = useState(0);
  const [failed, setFailed] = useState<string | null>(TOKEN ? null : "Falta NEXT_PUBLIC_MAPBOX_TOKEN");
  const [topo, setTopo] = useState(false);
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
      let fallback = rasterBlocked();
      if (fallback) setTopo(true);
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: fallback ? STYLE_TOPO : STYLE_SATELLITE,
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
        const ev = e as { sourceId?: string; error?: { message?: string; status?: number } };
        const msg = ev.error?.message ?? "";
        const status = ev.error?.status;
        const rasterSource = ev.sourceId === "mapbox-satellite" || ev.sourceId === "mapbox-dem";
        if (
          rasterSource &&
          (status === 429 || status === 403 || status === 401 || /too many|forbidden/i.test(msg))
        ) {
          if (!fallback) {
            fallback = true;
            markRasterBlocked();
            setTopo(true);
            console.warn(
              "[mapa] Mapbox no entrega teselas raster; se usa vista topográfica + relieve abierto",
            );
            if (map.getTerrain()) map.setTerrain(null);
            map.setStyle(STYLE_TOPO);
          }
          return;
        }
        if (/access token/i.test(msg) || status === 401) setFailed("Token de Mapbox inválido o restringido");
      });
      // "style.load" puede dispararse más de una vez (p. ej. al localizar el estilo):
      // todo lo que se agrega aquí debe ser idempotente.
      const setupStyle = () => {
        try {
          if (!map.getSource("mapbox-dem")) {
            map.addSource(
              "mapbox-dem",
              fallback
                ? {
                    type: "raster-dem",
                    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
                    encoding: "terrarium",
                    tileSize: 256,
                    maxzoom: 14,
                    attribution: "Relieve: Terrain Tiles (AWS Open Data)",
                  }
                : {
                    type: "raster-dem",
                    url: "mapbox://mapbox.mapbox-terrain-dem-v1",
                    tileSize: 512,
                    maxzoom: 14,
                  },
            );
          }
          map.setTerrain({ source: "mapbox-dem", exaggeration: 1.45 });
          map.setFog({
            range: [0.8, 9],
            color: "rgba(186, 210, 235, 0.55)",
            "high-color": "#24324a",
            "horizon-blend": 0.12,
            "space-color": "#070d18",
            "star-intensity": 0.15,
          });
          const empty = { type: "FeatureCollection" as const, features: [] };
          if (!map.getSource("cauce")) map.addSource("cauce", { type: "geojson", data: empty });
          if (!map.getLayer("cauce-glow"))
            map.addLayer({
              id: "cauce-glow",
              type: "line",
              source: "cauce",
              paint: { "line-color": "#22d3ee", "line-width": 9, "line-opacity": 0.22, "line-blur": 6 },
            });
          if (!map.getLayer("cauce-line"))
            map.addLayer({
              id: "cauce-line",
              type: "line",
              source: "cauce",
              paint: { "line-color": "#67e8f9", "line-width": 2.4, "line-dasharray": [2, 1.5] },
            });
          if (!map.getSource("coverage")) map.addSource("coverage", { type: "geojson", data: empty });
          if (!map.getLayer("coverage-fill"))
            map.addLayer({
              id: "coverage-fill",
              type: "fill",
              source: "coverage",
              paint: { "fill-color": "#a78bfa", "fill-opacity": 0.07 },
            });
          if (!map.getLayer("coverage-line"))
            map.addLayer({
              id: "coverage-line",
              type: "line",
              source: "coverage",
              paint: {
                "line-color": "#a78bfa",
                "line-width": 1.2,
                "line-opacity": 0.6,
                "line-dasharray": [3, 2],
              },
            });
          if (!map.getSource("sensors")) map.addSource("sensors", { type: "geojson", data: empty });
          if (!map.getLayer("sensors-dot")) {
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
          }
          // Simulacro: frente de crecida (line-gradient requiere lineMetrics) y pulso en la presa
          if (!map.getSource("flood"))
            map.addSource("flood", { type: "geojson", data: empty, lineMetrics: true });
          if (!map.getLayer("flood-glow"))
            map.addLayer({
              id: "flood-glow",
              type: "line",
              source: "flood",
              layout: { "line-cap": "round", "line-join": "round" },
              paint: {
                "line-width": 22,
                "line-blur": 14,
                "line-opacity": 0.55,
                "line-gradient": "rgba(0,0,0,0)",
              },
            });
          if (!map.getLayer("flood-line"))
            map.addLayer({
              id: "flood-line",
              type: "line",
              source: "flood",
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-width": 6, "line-gradient": "rgba(0,0,0,0)" },
            });
          if (!map.getSource("scene-pulse")) map.addSource("scene-pulse", { type: "geojson", data: empty });
          if (!map.getLayer("scene-pulse"))
            map.addLayer({
              id: "scene-pulse",
              type: "circle",
              source: "scene-pulse",
              paint: {
                "circle-radius": 20,
                "circle-color": "#ef4444",
                "circle-opacity": 0,
                "circle-stroke-color": "#ef4444",
                "circle-stroke-width": 2,
                "circle-stroke-opacity": 0,
                "circle-pitch-alignment": "map",
              },
            });
          setReady(true);
          setDataNonce((n) => n + 1);
        } catch (e) {
          console.error("[mapa]", e);
          setFailed("No se pudo preparar el relieve 3D");
        }
      };
      map.on("style.load", setupStyle);
      map.on("click", "sensors-dot", (e) => {
        const f = e.features?.[0] as { properties?: Record<string, unknown> | null } | undefined;
        const id = f?.properties?.id as string | undefined;
        if (id) onSelectRef.current?.({ kind: "sensor", id });
      });
      map.on("mouseenter", "sensors-dot", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "sensors-dot", () => (map.getCanvas().style.cursor = ""));
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
    // las fuentes existen desde setupStyle (ready); isStyleLoaded() es false mientras cargan teselas
    if (!map || !ready || !map.getSource("cauce")) return;
    const cauce = map.getSource("cauce") as GeoJSONSource | undefined;
    cauce?.setData({
      type: "FeatureCollection",
      features: sites
        .filter((s) => s.site.cauce_geojson)
        .map((s) => ({
          type: "Feature",
          properties: { site: s.site.code },
          geometry: s.site.cauce_geojson as unknown as GeoJSON.LineString,
        })),
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
            const stale =
              !s.last_reading_at || now - new Date(s.last_reading_at).getTime() > s.report_interval_s * 3000;
            return {
              type: "Feature",
              properties: { id: s.id, color: stale ? "#a78bfa" : "#22d3ee" },
              geometry: { type: "Point", coordinates: [s.lng, s.lat] },
            };
          })
        : [],
    });
  }, [ready, dataNonce, sites, gateways, sensors, showCoverage, showSensors]);

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
      const add = (
        el: HTMLElement,
        lng: number,
        lat: number,
        sel: MapSelection,
        anchor: "bottom" | "center" = "center",
      ) => {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current?.(sel);
        });
        markersRef.current.push(
          new mapboxgl.Marker({ element: el, anchor }).setLngLat([lng, lat]).addTo(map),
        );
      };
      for (const s of sites) {
        const el = document.createElement("button");
        el.type = "button";
        el.setAttribute("aria-label", `${s.site.name}: ${LEVELS[s.level].label}`);
        el.innerHTML = siteMarkerHtml(s, selected?.kind === "site" && selected.id === s.site.id);
        add(el, s.site.lng, s.site.lat, { kind: "site", id: s.site.id }, "bottom");
        const clima = (
          s.site.metadata as { clima?: { estacion?: string; lat?: number; lng?: number } } | null
        )?.clima;
        if (!compact && clima?.lat && clima?.lng) {
          const st = document.createElement("div");
          st.className = "geriam-station";
          st.title = `Estación meteorológica ${clima.estacion} (red HGPT)`;
          st.innerHTML = `<span class="gs-dot"></span><span class="gs-label">${clima.estacion}</span>`;
          markersRef.current.push(
            new mapboxgl.Marker({ element: st, anchor: "left" }).setLngLat([clima.lng, clima.lat]).addTo(map),
          );
        }
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
      userMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([userPosition.lng, userPosition.lat])
        .addTo(map);
    })();
  }, [ready, userPosition]);

  // ─── Simulacro: lluvia, frente de crecida, pulso y llegada a cada punto ───
  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);
  const etaMarkersRef = useRef<Map<string, { marker: Marker; el: HTMLDivElement }>>(new Map());
  const sceneSite = scene?.siteId ?? null;
  const floodOn = scene?.flood !== null && scene?.flood !== undefined;

  // cauce del sitio del simulacro y punto de pulso
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !alive(map) || !map.getSource("flood")) return;
    const site = sites.find((x) => x.site.id === sceneSite)?.site;
    const line = site?.cauce_geojson as unknown as GeoJSON.LineString | undefined;
    (map.getSource("flood") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: line && floodOn ? [{ type: "Feature", properties: {}, geometry: line }] : [],
    });
    (map.getSource("scene-pulse") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: site
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: [site.dam_lng ?? site.lng, site.dam_lat ?? site.lat] },
            },
          ]
        : [],
    });
  }, [ready, sceneSite, floodOn, sites]);

  // lluvia 3D y niebla de tormenta
  const rainBucket = scene ? Math.round(Math.min(scene.rainMmH, 60) / 5) : 0;
  const levelKey = scene?.level ?? "none";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const m = map as MapboxMap & { setRain?: (r: Record<string, unknown> | null) => void };
    try {
      if (rainBucket > 0) {
        const k = rainBucket / 12;
        m.setRain?.({
          density: 0.35 + k * 0.65,
          intensity: 0.4 + k * 0.6,
          color: "#9fb0c8",
          opacity: 0.55 + k * 0.3,
          vignette: 0.35 + k * 0.4,
          "vignette-color": "#1e2a3b",
          direction: [0, 75],
          "droplet-size": [2.6, 18],
          "distortion-strength": 0.5,
          "center-thinning": 0,
        });
      } else m.setRain?.(null);
      const red = levelKey === "roja";
      map.setFog({
        range: rainBucket > 0 ? [0.4, 6] : [0.8, 9],
        color: red
          ? "rgba(120, 60, 70, 0.6)"
          : rainBucket > 0
            ? "rgba(110, 125, 145, 0.7)"
            : "rgba(186, 210, 235, 0.55)",
        "high-color": red ? "#3a1620" : rainBucket > 0 ? "#1a2333" : "#24324a",
        "horizon-blend": rainBucket > 0 ? 0.3 : 0.12,
        "space-color": "#070d18",
        "star-intensity": rainBucket > 0 ? 0 : 0.15,
      });
    } catch (e) {
      console.warn("[mapa] efectos del simulacro", e);
    }
  }, [ready, rainBucket, levelKey]);

  // animación: frente de crecida y pulso en la presa
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !sceneSite) return;
    let raf = 0;
    let last = 0;
    const COLORS: Record<string, string> = {
      normal: "#22d3ee",
      amarilla: "#facc15",
      naranja: "#fb923c",
      roja: "#ef4444",
    };
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      if (ms - last < 60 || document.hidden) return;
      last = ms;
      const sc = sceneRef.current;
      if (!sc || !alive(map) || !map.getLayer("scene-pulse")) return;
      const col = COLORS[sc.level] ?? "#22d3ee";
      const p = (ms / 1600) % 1;
      map.setPaintProperty("scene-pulse", "circle-radius", 14 + p * 60);
      map.setPaintProperty("scene-pulse", "circle-stroke-opacity", (1 - p) * 0.9);
      map.setPaintProperty("scene-pulse", "circle-opacity", (1 - p) * 0.18);
      map.setPaintProperty("scene-pulse", "circle-color", col);
      map.setPaintProperty("scene-pulse", "circle-stroke-color", col);
      if (sc.flood !== null && map.getLayer("flood-line")) {
        const f = Math.min(0.995, Math.max(0.02, sc.flood));
        const shimmer = 0.5 + 0.5 * Math.sin(ms / 220);
        const head = `rgba(255,${Math.round(220 + 35 * shimmer)},${Math.round(200 + 55 * shimmer)},1)`;
        const body = sc.level === "roja" ? "rgba(239,68,68,0.95)" : "rgba(251,146,60,0.95)";
        const grad = [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0,
          body,
          Math.max(0.001, f - 0.04),
          body,
          f,
          head,
          Math.min(0.999, f + 0.004),
          "rgba(0,0,0,0)",
          1,
          "rgba(0,0,0,0)",
        ];
        map.setPaintProperty("flood-line", "line-gradient", grad as never);
        map.setPaintProperty("flood-glow", "line-gradient", grad as never);
        map.setPaintProperty("flood-glow", "line-opacity", 0.35 + 0.3 * shimmer);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (alive(map) && map.getLayer("scene-pulse")) {
        map.setPaintProperty("scene-pulse", "circle-opacity", 0);
        map.setPaintProperty("scene-pulse", "circle-stroke-opacity", 0);
      }
    };
  }, [ready, sceneSite]);

  // marcadores de llegada (cuenta regresiva simulada en cada punto aguas abajo)
  const etaKey = scene?.etas.map((e) => `${e.name}:${Math.ceil(e.remainingMin)}`).join("|") ?? "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const cur = etaMarkersRef.current;
      const etas = sceneRef.current?.etas ?? [];
      for (const [name, m] of cur) {
        if (etas.some((e) => e.name === name)) continue;
        m.marker.remove();
        cur.delete(name);
      }
      for (const e of etas) {
        let m = cur.get(e.name);
        if (!m) {
          const el = document.createElement("div");
          el.className = "geriam-eta";
          m = {
            el,
            marker: new mapboxgl.Marker({ element: el, anchor: "bottom", offset: [0, -26] })
              .setLngLat([e.lng, e.lat])
              .addTo(map),
          };
          cur.set(e.name, m);
        }
        const arrived = e.remainingMin <= 0;
        const h = Math.floor(Math.max(0, e.remainingMin) / 60);
        const mm = Math.floor(Math.max(0, e.remainingMin) % 60);
        m.el.dataset.state = arrived ? "llego" : e.remainingMin < 30 ? "pronto" : "espera";
        m.el.innerHTML = `<span class="ge-name">${e.name}</span><span class="ge-time">${arrived ? "CRECIDA EN EL PUNTO" : `llega en ${h ? `${h} h ` : ""}${mm} min`}</span>`;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, etaKey]);
  useEffect(
    () => () => {
      etaMarkersRef.current.forEach((m) => m.marker.remove());
      etaMarkersRef.current.clear();
    },
    [],
  );

  // cámara: al iniciar, ir a la presa; cuando sale la crecida, seguir el cauce
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !sceneSite) return;
    const s = sites.find((x) => x.site.id === sceneSite)?.site;
    if (s)
      map.flyTo({
        center: [s.lng, s.lat],
        zoom: 13.4,
        pitch: 62,
        bearing: map.getBearing(),
        duration: 2600,
        essential: true,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sceneSite]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !floodOn || !sceneSite) return;
    const line = sites.find((x) => x.site.id === sceneSite)?.site.cauce_geojson as unknown as
      GeoJSON.LineString | undefined;
    if (!line) return;
    const coords = line.coordinates as [number, number][];
    const c = coords[Math.floor(coords.length * 0.35)];
    const prev = coords[Math.max(0, Math.floor(coords.length * 0.35) - 3)];
    const bearing = (Math.atan2(c[0] - prev[0], c[1] - prev[1]) * 180) / Math.PI;
    map.flyTo({ center: c, zoom: 11.6, pitch: 60, bearing, duration: 4000, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, floodOn, sceneSite]);

  // Vuelos programáticos
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !flight) return;
    if (flight.target === "cuenca") {
      map.flyTo({
        center: [center.lng, center.lat],
        zoom: center.zoom,
        pitch: center.pitch,
        bearing: center.bearing,
        duration: 2600,
        essential: true,
      });
    } else if (flight.target === "site") {
      const s = sites.find((x) => x.site.id === flight.siteId);
      if (s)
        map.flyTo({
          center: [s.site.lng, s.site.lat],
          zoom: 15.2,
          pitch: 64,
          bearing: map.getBearing(),
          duration: 2200,
          essential: true,
        });
    } else {
      // seguir el cauce hasta Ambato
      const line = sites.find((s) => s.site.cauce_geojson)?.site.cauce_geojson as unknown as
        GeoJSON.LineString | undefined;
      if (!line) return;
      const coords = line.coordinates as [number, number][];
      const keys = [Math.floor(coords.length * 0.25), Math.floor(coords.length * 0.55), coords.length - 1];
      let i = 0;
      const next = () => {
        if (i >= keys.length || !mapRef.current) return;
        const c = coords[keys[i]];
        const prev = coords[Math.max(0, keys[i] - 2)];
        const bearing = (Math.atan2(c[0] - prev[0], c[1] - prev[1]) * 180) / Math.PI;
        map.flyTo({
          center: c,
          zoom: i === keys.length - 1 ? 13.6 : 13,
          pitch: 66,
          bearing,
          duration: 3200,
          essential: true,
        });
        i++;
        map.once("moveend", next);
      };
      next();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.nonce, ready]);

  return (
    <div className={cn("relative overflow-hidden bg-[#0b1626]", className)}>
      {/* estilo en línea: mapbox-gl.css aplica position:relative a .mapboxgl-map y anularía la clase */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {!ready && !failed && !quiet && (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,#13233a,#070d18)]">
          <div className="text-fg-faint flex flex-col items-center gap-2 text-xs">
            <span
              className="border-accent/30 border-t-accent size-6 animate-spin rounded-full border-2"
              aria-hidden
            />
            Cargando relieve 3D de la cuenca…
          </div>
        </div>
      )}
      {topo && !quiet && !failed && (
        <div
          className="bg-bg/80 text-fg-muted pointer-events-none absolute top-3 right-14 hidden rounded px-2 py-1 text-[10px] backdrop-blur sm:block"
          role="note"
        >
          Vista topográfica · imagen satelital no disponible
        </div>
      )}
      {failed && !quiet && (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,#13233a,#070d18)] p-6 text-center">
          <div className="flex max-w-xs flex-col items-center gap-2">
            <MapPinOff className="text-fg-faint size-6" aria-hidden />
            <p className="text-fg text-sm font-medium">Mapa no disponible</p>
            <p className="text-fg-muted text-xs">
              {failed}. Los datos en vivo siguen disponibles en los paneles.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
