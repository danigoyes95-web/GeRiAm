"use client";
import { useCallback, useSyncExternalStore } from "react";

/** Ticker compartido por intervalo: un solo setInterval por intervalo para toda la app. */
interface Ticker {
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  now: number;
}
const tickers = new Map<number, Ticker>();

function getTicker(ms: number): Ticker {
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
    t.timer = setInterval(() => {
      t.now = Date.now();
      t.listeners.forEach((l) => l());
    }, ms);
    // Si el reloj quedó desactualizado mientras nadie lo usaba, avisar en el próximo ciclo
    // (nunca de forma síncrona dentro de subscribe: eso provoca renderizados en bucle).
    if (Date.now() - t.now > ms) {
      queueMicrotask(() => {
        t.now = Date.now();
        t.listeners.forEach((l) => l());
      });
    }
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
  // subscribe y getSnapshot ESTABLES: si cambian en cada render, React re-suscribe sin fin.
  const sub = useCallback((cb: () => void) => subscribe(intervalMs, cb), [intervalMs]);
  const snap = useCallback(() => getTicker(intervalMs).now, [intervalMs]);
  return useSyncExternalStore(sub, snap, getServerNow);
}

function getServerNow(): number | null {
  return null;
}
