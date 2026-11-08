"use client";
import "./globals.css";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-EC" data-theme="dark">
      <body className="min-h-dvh bg-bg text-fg">
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
