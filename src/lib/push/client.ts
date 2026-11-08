"use client";
import { getBrowserClient } from "@/lib/supabase/browser";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushSupport = "ok" | "sin-soporte" | "ios-instalar" | "bloqueado";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "sin-soporte";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios-instalar";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "sin-soporte";
  if (Notification.permission === "denied") return "bloqueado";
  return "ok";
}

async function vapidKey(): Promise<string | null> {
  const sb = getBrowserClient();
  const { data } = await sb.from("organizations").select("settings").limit(1).maybeSingle();
  const s = (data?.settings ?? {}) as { vapid_public_key?: string };
  return s.vapid_public_key ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permiso de notificaciones denegado");
  const key = await vapidKey();
  if (!key) throw new Error("La organización no tiene clave VAPID configurada");
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/serwist/sw.js", { scope: "/", type: "module" }));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  if (!res.ok) throw new Error("No se pudo registrar el dispositivo");
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
  await sub.unsubscribe();
}
