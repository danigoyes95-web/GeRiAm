"use client";
import { RotateCcw, TriangleAlert } from "lucide-react";

/** Pantalla de error con detalle técnico (para soporte) y reintento. */
export function ErrorScreen({ error, reset, compact = false }: { error: Error & { digest?: string }; reset: () => void; compact?: boolean }) {
  return (
    <div className={compact ? "grid h-full place-items-center p-4" : "grid min-h-[70vh] place-items-center p-6"}>
      <div className="panel w-full max-w-lg p-6 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full border border-lvl-naranja/40 bg-[var(--lvl-naranja-bg)] text-lvl-naranja">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <h1 className="mt-3 text-base font-semibold">Esta sección tuvo un problema</h1>
        <p className="mt-1 text-sm text-fg-muted">Los datos siguen registrándose. Reintente; si persiste, envíe este detalle a soporte.</p>
        <pre className="mt-3 max-h-32 overflow-auto rounded-md border border-border bg-surface-2 p-2 text-left font-mono text-[11px] whitespace-pre-wrap text-fg-muted">
          {error.message || "Error desconocido"}
          {error.digest ? `\nref: ${error.digest}` : ""}
        </pre>
        <button type="button" onClick={reset} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-[#04121a]">
          <RotateCcw className="size-4" /> Reintentar
        </button>
      </div>
    </div>
  );
}
