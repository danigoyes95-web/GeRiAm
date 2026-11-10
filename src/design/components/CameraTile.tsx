"use client";
import { useEffect, useRef, useState } from "react";
import { useNow } from "@/lib/hooks/useNow";
import { Maximize2, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";

export interface CameraTileProps {
  code: string;
  name: string;
  siteName: string;
  entity: string;
  streamUrl?: string | null;
  demoClip?: string | null;
  snapshotUrl?: string | null;
  online?: boolean;
  latencyMs?: number | null;
  /** modo de datos móviles: solo snapshot refrescado */
  snapshotMode?: boolean;
  onExpand?: () => void;
  className?: string;
  priority?: boolean;
  /** Overlay de simulacro / alerta */
  alertLevelColor?: string;
  /** Mosaico pequeño: solo código, estado y hora */
  compact?: boolean;
}

type Source = "hls" | "clip" | "none";

/** Mosaico de cámara con overlay tipo CCTV (código, sitio, reloj con segundos, REC, latencia). */
export function CameraTile({
  code,
  name,
  siteName,
  entity,
  streamUrl,
  demoClip,
  online = true,
  latencyMs,
  snapshotMode = false,
  onExpand,
  className,
  alertLevelColor,
  compact = false,
}: CameraTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // nivel de degradación: 0 = preferido, 1 = clip de respaldo, 2 = sin señal
  const [failure, setFailure] = useState<{ key: string; level: number }>({ key: "", level: 0 });
  const key = `${online}|${streamUrl ?? ""}|${demoClip ?? ""}`;
  const fail = failure.key === key ? failure.level : 0;
  const preferred: Source[] = !online
    ? ["none"]
    : [...(streamUrl ? (["hls"] as Source[]) : []), ...(demoClip ? (["clip"] as Source[]) : []), "none"];
  const source: Source = preferred[Math.min(fail, preferred.length - 1)];
  const degrade = () => setFailure((f) => ({ key, level: (f.key === key ? f.level : 0) + 1 }));
  const now = useNow(1000);
  // latencia percibida Starlink + re-streaming: variación suave determinista por segundo
  const base = latencyMs ?? 320;
  const latency = now ? Math.round(base + Math.sin(now / 7000) * 40 + Math.sin(now / 1900) * 15) : base;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || source !== "hls" || !streamUrl || snapshotMode) return;
    let destroyed = false;
    let hlsInstance: { destroy: () => void } | null = null;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (destroyed) return;
        if (!Hls.isSupported()) {
          degrade();
          return;
        }
        const hls = new Hls({ lowLatencyMode: true, maxBufferLength: 10 });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) degrade();
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hlsInstance = hls;
      });
    }
    return () => {
      destroyed = true;
      hlsInstance?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, streamUrl, snapshotMode]);

  const live = source !== "none";

  return (
    <div
      className={cn(
        "group border-border relative aspect-video overflow-hidden rounded-md border bg-black",
        className,
      )}
      style={alertLevelColor ? { boxShadow: `inset 0 0 0 2px ${alertLevelColor}` } : undefined}
    >
      {live ? (
        <video
          ref={videoRef}
          className="absolute inset-0 size-full object-cover"
          src={source === "clip" && demoClip ? demoClip : undefined}
          muted
          playsInline
          autoPlay={!snapshotMode}
          loop
          preload={snapshotMode ? "metadata" : "auto"}
          onError={degrade}
          aria-label={`Cámara ${code} — ${name}`}
          style={{ filter: "saturate(0.85) contrast(1.05)" }}
        />
      ) : (
        <NoSignal online={online} compact={compact} />
      )}
      {/* scanlines + viñeta */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 1px, transparent 1px 3px)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,.55))]"
        aria-hidden
      />

      {/* overlay CCTV */}
      {compact ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-1 bg-gradient-to-b from-black/70 to-transparent px-2 pt-1.5 pb-3 font-mono text-[10px] leading-none text-white">
          <span className="truncate font-semibold tracking-wide">{code}</span>
          <span className="inline-flex shrink-0 items-center gap-1">
            {live ? (
              <>
                <span className="animate-pulse-soft size-1.5 rounded-full bg-red-500" aria-hidden />
                REC
              </>
            ) : (
              <span className="text-red-300">SIN SEÑAL</span>
            )}
          </span>
        </div>
      ) : (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 font-mono text-[10.5px] leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,.9)]">
            <div className="min-w-0">
              <div className="font-semibold tracking-wide">{code}</div>
              <div className="truncate opacity-85">
                {siteName} · {name}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="inline-flex items-center gap-1">
                {live ? (
                  <>
                    <span className="animate-pulse-soft size-2 rounded-full bg-red-500" aria-hidden />
                    <span className="font-semibold">REC</span>
                  </>
                ) : (
                  <span className="font-semibold text-red-300">SIN SEÑAL</span>
                )}
              </span>
              <span className="tabular" suppressHydrationWarning>
                {now ? formatDateTime(now, undefined, true) : "--/--/---- --:--:--"}
              </span>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 font-mono text-[10px] text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,.9)]">
            <span className="truncate">{entity}</span>
            <span className="tabular shrink-0">{live ? `${latency} ms · Starlink` : "— ms"}</span>
          </div>
        </>
      )}
      {onExpand && (
        <button
          type="button"
          onClick={onExpand}
          className="absolute right-2 bottom-7 grid size-7 place-items-center rounded bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Ampliar cámara ${code}`}
        >
          <Maximize2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function NoSignal({ online, compact = false }: { online: boolean; compact?: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0a0f18]">
      <svg
        className="absolute -inset-[10%] size-[120%] opacity-[0.22]"
        style={{ animation: "geriam-noise .35s steps(2) infinite" }}
        aria-hidden
      >
        <filter id="cam-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cam-noise)" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <VideoOff className="size-6 text-white/50" aria-hidden />
          {!compact && (
            <span className="font-mono text-[11px] tracking-[0.2em] text-white/70">
              {online ? "SIN SEÑAL DE VIDEO" : "CÁMARA FUERA DE LÍNEA"}
            </span>
          )}
          {!compact && (
            <span className="text-[10px] text-white/40">
              {online ? "Reconectando…" : "Verifique enlace Starlink / energía"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
