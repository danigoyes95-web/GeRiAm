/// <reference lib="webworker" />
/**
 * Service worker de GeRiAm (Serwist): shell offline, caché de datos de
 * Supabase (NetworkFirst) para mostrar el último estado sin señal, y Web Push.
 */
import { defaultCache } from "@serwist/turbopack/worker";
import { NetworkFirst, ExpirationPlugin, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Datos de Supabase (lecturas GET): último estado disponible sin conexión
      matcher: ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/rest/v1/"),
      handler: new NetworkFirst({
        cacheName: "geriam-datos",
        networkTimeoutSeconds: 6,
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});
serwist.addEventListeners();

interface PushData {
  title?: string;
  body?: string;
  url?: string;
  level?: string;
  tag?: string;
  drill?: boolean;
}

self.addEventListener("push", (event) => {
  let data: PushData = {};
  try {
    data = (event.data?.json() ?? {}) as PushData;
  } catch {
    data = { title: "GeRiAm", body: event.data?.text() ?? "" };
  }
  const critical = data.level === "roja" || data.level === "naranja";
  event.waitUntil(
    self.registration.showNotification(data.title ?? "GeRiAm — Alerta", {
      body: data.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: data.tag,
      requireInteraction: critical,
      data: { url: data.url ?? "/app/alertas" },
      // @ts-expect-error vibrate es válido en Android/Chrome
      vibrate: critical ? [300, 120, 300, 120, 600] : [200, 100, 200],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/app";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await (c as WindowClient).navigate(url).catch(() => undefined);
          return (c as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
