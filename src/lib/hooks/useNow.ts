"use client";
import { useSyncExternalStore } from "react";

/** Ticker compartido por intervalo: un solo setInterval por intervalo para toda la app. */
const tickers = new Map<number, { listeners: Set<() => void>; timer: ReturnType<typeof setInterval> | null; now: number }>();

function getTicker(ms: number) {
  let t = tickers.get(ms);
  if (!t) {
    t = { listeners: new Set(), timer: null, now: Date.now() };
    tickers.set(ms, t);
  }
  return t;
}

function subscribe(ms: number, cb: () => void) {
  const t = getTicker(ms);
  t.listeners.add(cb);
  if (!t.timer) {
    t.now = Date.now();
    t.timer = setInterval(() => {
      t.now = Date.now();
      t.listeners.forEach((l) => l());
    }, ms);
  }
  return () => {
    t.listeners.delete(cb);
    if (t.listeners.size === 0 && t.timer) {
      clearInterval(t.timer);
      t.timer = null;
    }
  };
}

/** Reloj (ms). En el servidor devuelve `null` para evitar desajustes de hidratación. */
export function useNow(intervalMs = 1000): number | null {
  return useSyncExternalStore(
    (cb) => subscribe(intervalMs, cb),
    () => getTicker(intervalMs).now,
    () => null,
  );
}
