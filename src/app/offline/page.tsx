import { CloudOff } from "lucide-react";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-lvl-offline/40 bg-[var(--lvl-offline-bg)] text-lvl-offline">
        <CloudOff className="size-6" />
      </span>
      <h1 className="text-lg font-semibold">Sin conexión</h1>
      <p className="max-w-xs text-sm text-fg-muted">
        Esta sección no está disponible sin señal. El inicio muestra el último estado guardado y los reportes de campo se envían al recuperar la conexión.
      </p>
      <a href="/app" className="text-sm font-medium text-accent">Reintentar</a>
    </main>
  );
}
