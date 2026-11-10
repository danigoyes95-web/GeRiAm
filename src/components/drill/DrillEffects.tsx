"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertOctagon, CloudLightning, CloudRain, Radar, Siren, Timer, Waves } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { pollDrill, useOrgLive } from "@/lib/data/live";
import { drillScene, estimateAmbatoFlow, type DrillScene } from "@/lib/drill/scene";
import { useInamhi } from "@/components/inamhi/useInamhi";
import { useNow } from "@/lib/hooks/useNow";
import { formatNumber } from "@/lib/format";
import { SCENARIO_LABEL } from "@/components/DrillBanner";
import { cn } from "@/lib/utils";

const RANK: Record<string, number> = { normal: 0, amarilla: 1, naranja: 2, roja: 3 };
const LABEL: Record<string, string> = {
  amarilla: "ALERTA AMARILLA",
  naranja: "ALERTA NARANJA",
  roja: "ALERTA ROJA",
};
const KEY = "geriam-drill-flash";

/** Escena del simulacro en curso, recalculada cada segundo. */
export function useDrillScene(): DrillScene | null {
  const { data } = useOrgLive();
  const now = useNow(1000);
  return useMemo(() => drillScene(data, now ?? 0), [data, now]);
}

function fmtMin(m: number) {
  const v = Math.max(0, Math.round(m));
  const h = Math.floor(v / 60);
  return h ? `${h} h ${v % 60} min` : `${v} min`;
}

function readSeen(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * Efectos globales del simulacro: viñeta pulsante en naranja/roja y aviso a pantalla completa
 * cada vez que la alerta sube de nivel (en el panel y en la app de campo de todos los asistentes).
 */
export function DrillEffects() {
  const scene = useDrillScene();
  const qc = useQueryClient();
  const pollSite = scene?.siteId ?? null;
  useEffect(() => {
    if (!pollSite) return;
    const t = setInterval(() => {
      if (!document.hidden) void pollDrill(qc, pollSite);
    }, 4000);
    return () => clearInterval(t);
  }, [qc, pollSite]);
  const [seen, setSeen] = useState<Record<string, number>>(readSeen);
  const rank = scene ? RANK[scene.level] : 0;
  const show = !!scene && rank >= 1 && rank > (seen[scene.drillId] ?? 0);

  const dismiss = () => {
    if (!scene) return;
    const next = { ...seen, [scene.drillId]: rank };
    setSeen(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* sin almacenamiento: solo en memoria */
    }
  };

  useEffect(() => {
    if (!show) return;
    try {
      navigator.vibrate?.(rank >= 3 ? [400, 150, 400, 150, 600] : [300, 150, 300]);
    } catch {
      /* iOS no vibra desde la web */
    }
    const t = setTimeout(dismiss, 9000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, rank, scene?.drillId]);

  if (!scene) return null;
  const ambato = scene.etas.find((e) => /ambato/i.test(e.name)) ?? scene.etas[scene.etas.length - 1];

  return (
    <>
      {(scene.level === "roja" || scene.level === "naranja") && (
        <div className="geriam-vignette" data-level={scene.level} aria-hidden />
      )}
      {show && (
        <div
          className="geriam-flash"
          data-level={scene.level}
          role="alertdialog"
          aria-live="assertive"
          aria-label={LABEL[scene.level]}
          onClick={dismiss}
        >
          <div className="relative flex max-w-md flex-col items-center text-center text-white">
            <span className="mb-4 rounded-full border border-white/40 bg-black/30 px-3 py-1 text-[11px] font-bold tracking-[0.2em]">
              SIMULACRO · NO ES REAL
            </span>
            <AlertOctagon
              className="size-16 animate-pulse drop-shadow-[0_0_24px_rgba(255,255,255,.5)]"
              aria-hidden
            />
            <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{LABEL[scene.level]}</h2>
            <p className="mt-2 text-base font-medium text-white/90">
              {scene.topAlert?.title ?? scene.siteName}
            </p>
            {ambato && (
              <div className="mt-5 rounded-xl border border-white/25 bg-black/35 px-5 py-3 backdrop-blur">
                <div className="text-[11px] font-semibold tracking-widest text-white/70 uppercase">
                  La crecida llegaría a {ambato.name} en
                </div>
                <div className="tabular font-mono text-3xl font-bold">{fmtMin(ambato.remainingMin)}</div>
              </div>
            )}
            <p className="mt-5 text-xs text-white/60">Toque para continuar</p>
          </div>
        </div>
      )}
    </>
  );
}

/** Tablero sobre el mapa durante el simulacro: reloj simulado, fase, lluvia, borde libre y llegada. */
export function DrillHud({ scene, className }: { scene: DrillScene; className?: string }) {
  const h = Math.floor(scene.simMin / 60);
  const m = Math.floor(scene.simMin % 60);
  const free = scene.nivel !== null ? scene.cotaCresta - Number(scene.nivel) : null;
  const ambato = scene.etas.find((e) => /ambato/i.test(e.name));
  const tone =
    scene.level === "roja"
      ? "border-lvl-roja/70"
      : scene.level === "naranja"
        ? "border-lvl-naranja/70"
        : scene.level === "amarilla"
          ? "border-lvl-amarilla/70"
          : "border-border";
  return (
    <div
      className={cn(
        "pointer-events-none w-[min(300px,calc(100%-24px))] rounded-lg border bg-[#070d18]/85 p-3 text-white shadow-2xl backdrop-blur-md",
        tone,
        className,
      )}
    >
      <div className="text-lvl-amarilla flex items-center gap-2 text-[10.5px] font-bold tracking-[0.14em]">
        <Siren className="size-3.5 animate-pulse" aria-hidden /> SIMULACRO EN CURSO
      </div>
      <div className="mt-1 text-sm font-semibold">{SCENARIO_LABEL[scene.scenario] ?? scene.scenario}</div>
      {scene.scenario === "tormenta" && (
        <div className="border-lvl-naranja/60 bg-lvl-naranja/15 text-lvl-naranja mt-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold">
          <CloudLightning className="size-3" aria-hidden /> Aviso INAMHI (simulado) · Muy Alto
        </div>
      )}
      <div className="text-[11px] text-white/70">{scene.siteName}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="tabular font-mono text-2xl font-bold">
          T+{h}:{String(m).padStart(2, "0")}
        </span>
        <span className="text-[11px] text-white/60">horas simuladas</span>
      </div>
      {scene.narrative && <div className="mt-1 text-[12px] text-white/85">{scene.narrative}</div>}
      <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md bg-white/5 p-1.5">
          <div className="flex items-center gap-1 text-white/60">
            <CloudRain className="size-3" aria-hidden /> Lluvia
          </div>
          <div className="tabular font-mono text-sm font-semibold">{formatNumber(scene.rainMmH, 0)} mm/h</div>
          <div className="mt-1 h-1 overflow-hidden rounded bg-white/10">
            <div
              className="h-full rounded bg-sky-400"
              style={{ width: `${Math.min(100, (scene.rainMmH / 60) * 100)}%` }}
            />
          </div>
        </div>
        <div className="rounded-md bg-white/5 p-1.5">
          <div className="flex items-center gap-1 text-white/60">
            <Waves className="size-3" aria-hidden /> Borde libre
          </div>
          <div
            className={cn(
              "tabular font-mono text-sm font-semibold",
              free !== null && free < 0.8 && "text-lvl-roja",
            )}
          >
            {free === null ? "—" : `${formatNumber(free, 2)} m`}
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded bg-white/10">
            <div
              className="bg-lvl-roja h-full rounded"
              style={{ width: `${free === null ? 0 : Math.min(100, Math.max(0, (1 - free / 3) * 100))}%` }}
            />
          </div>
        </div>
      </div>
      {scene.scenario === "tormenta" && <FlowEquivalence scene={scene} />}
      {ambato && (
        <div className="border-lvl-roja/50 bg-lvl-roja/15 mt-2 flex items-center justify-between rounded-md border px-2 py-1.5 text-[11px]">
          <span className="flex items-center gap-1">
            <Timer className="size-3.5" aria-hidden /> Llegada a {ambato.name}
          </span>
          <b className="tabular font-mono text-sm">
            {ambato.remainingMin <= 0 ? "AHORA" : fmtMin(ambato.remainingMin)}
          </b>
        </div>
      )}
    </div>
  );
}

const RP_T = [2, 10, 50, 100] as const;
const RP_COL: Record<number, string> = { 2: "#facc15", 10: "#fb923c", 50: "#ef4444", 100: "#b91c1c" };

/** Caudal estimado en Ambato comparado con los caudales de crecida (2–100 años) del INAMHI–GEOGLOWS. */
function FlowEquivalence({ scene }: { scene: DrillScene }) {
  const q = useInamhi("ambato");
  const f = q.data?.forecast;
  const rp = f?.returnPeriods;
  if (!rp) return null;
  const base = f?.series.find((p) => p.avg !== null)?.avg ?? 20;
  const flow = estimateAmbatoFlow(scene, base);
  const hit = [...RP_T].reverse().find((T) => flow >= rp[T]);
  const top = rp[100] * 1.15;
  const pct = (v: number) => `${Math.min(100, (v / top) * 100)}%`;
  const label =
    hit === 100
      ? "supera la crecida de 100 años"
      : hit
        ? `≈ crecida de ${hit} años`
        : "bajo la crecida de 2 años";
  return (
    <div className="mt-2 rounded-md bg-white/5 p-1.5 text-[11px]">
      <div className="flex items-center justify-between gap-2 text-white/60">
        <span className="flex items-center gap-1">
          <Waves className="size-3" aria-hidden /> Caudal estimado en Ambato
        </span>
        <b className="tabular font-mono text-sm text-white">{formatNumber(flow, 0)} m³/s</b>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded"
          style={{
            width: pct(flow),
            background: hit ? RP_COL[hit] : "#38bdf8",
            transition: "width .6s ease",
          }}
        />
        {RP_T.map((T) => (
          <span
            key={T}
            className="absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 rounded"
            style={{ left: pct(rp[T]), background: RP_COL[T] }}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2">
        <span className="font-semibold" style={{ color: hit ? RP_COL[hit] : "#7dd3fc" }}>
          {label}
        </span>
        <span className="text-[9.5px] text-white/45">umbrales INAMHI–GEOGLOWS</span>
      </div>
    </div>
  );
}

const PROLOGUE = [
  {
    at: "T − 72 h",
    icon: Radar,
    title: "Pronóstico INAMHI–GEOGLOWS",
    text: "El escenario extremo del río Ambato muestra un pico fuera de lo normal para la próxima semana.",
  },
  {
    at: "T − 48 h",
    icon: CloudLightning,
    title: "Aviso meteorológico INAMHI · nivel Muy Alto",
    text: "Lluvias, tormentas y viento. El polígono del aviso cubre Chiquiurco, Mulacorral, Pasa y Ambato.",
  },
  {
    at: "T − 6 h",
    icon: Siren,
    title: "GeRiAm en vigilancia reforzada",
    text: "La sala de operaciones confirma el aviso y los técnicos de zona quedan notificados.",
  },
  {
    at: "T 0",
    icon: CloudRain,
    title: "Empieza la tormenta sobre el páramo",
    text: "A partir de aquí, todo lo que ven lo detectan los sensores en tiempo real.",
  },
];
const STEP_S = 4.5;

/** Prólogo del simulacro de tormenta: del pronóstico y el aviso del INAMHI a la primera gota (≈18 s). */
export function DrillPrologue() {
  const scene = useDrillScene();
  const now = useNow(250);
  const [skipped, setSkipped] = useState<string | null>(null);
  if (!scene || scene.scenario !== "tormenta" || !now || skipped === scene.drillId) return null;
  const elapsed = (now - scene.startedAt) / 1000;
  if (elapsed < 0 || elapsed > PROLOGUE.length * STEP_S + 0.8) return null;
  const step = Math.min(PROLOGUE.length - 1, Math.floor(elapsed / STEP_S));
  return (
    <div
      className="geriam-prologue"
      role="dialog"
      aria-label="Prólogo del simulacro"
      onClick={() => setSkipped(scene.drillId)}
    >
      <div className="relative w-full max-w-lg min-w-0 px-5">
        <div className="text-lvl-amarilla mb-4 flex items-center justify-between text-[11px] font-bold tracking-[0.2em]">
          <span>SIMULACRO · ANTES DE LA TORMENTA</span>
          <span className="font-medium tracking-normal text-white/50">Toque para saltar</span>
        </div>
        <ol className="space-y-3">
          {PROLOGUE.map((p, i) => {
            const Icon = p.icon;
            const state = i < step ? "done" : i === step ? "now" : "next";
            return (
              <li
                key={p.at}
                className={cn(
                  "flex gap-3 rounded-xl border p-3 transition-all duration-500",
                  state === "now"
                    ? "border-cyan-300/60 bg-cyan-400/10 shadow-[0_0_30px_rgba(34,211,238,.25)]"
                    : state === "done"
                      ? "border-white/10 bg-white/5 opacity-70"
                      : "border-white/5 opacity-25",
                )}
              >
                <div
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full",
                    state === "now" ? "bg-cyan-400 text-[#04121a]" : "bg-white/10 text-white/70",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="tabular font-mono text-[11px] font-bold text-cyan-300">{p.at}</div>
                  <div className="text-[14.5px] font-semibold text-white">{p.title}</div>
                  <div className="text-[12.5px] text-white/70">{p.text}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 h-1 overflow-hidden rounded bg-white/10">
          <div
            className="h-full bg-cyan-400"
            style={{ width: `${Math.min(100, (elapsed / (PROLOGUE.length * STEP_S)) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
