"use client";
import { useCallback, useSyncExternalStore } from "react";

// Todas las funciones subscribe/getSnapshot son estables (nivel de módulo o useCallback).

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const getOnline = () => navigator.onLine;
const getOnlineServer = () => true;

/** navigator.onLine reactivo. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnline, getOnlineServer);
}

const LS_EVENT = "geriam-ls";

/** Valor de localStorage reactivo (tolerante a almacenamiento bloqueado). */
export function useLocalStorage(key: string, fallback: string): [string, (v: string) => void] {
  const sub = useCallback(
    (cb: () => void) => {
      const h = (e: Event) => {
        if (e instanceof StorageEvent ? e.key === key : (e as CustomEvent<string>).detail === key) cb();
      };
      window.addEventListener("storage", h);
      window.addEventListener(LS_EVENT, h);
      return () => {
        window.removeEventListener("storage", h);
        window.removeEventListener(LS_EVENT, h);
      };
    },
    [key],
  );
  const snap = useCallback(() => {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  const server = useCallback(() => fallback, [fallback]);
  const value = useSyncExternalStore(sub, snap, server);
  const set = useCallback(
    (v: string) => {
      try {
        localStorage.setItem(key, v);
      } catch {
        /* almacenamiento no disponible */
      }
      window.dispatchEvent(new CustomEvent(LS_EVENT, { detail: key }));
    },
    [key],
  );
  return [value, set];
}

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const getTheme = (): "dark" | "light" => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
const getThemeServer = (): "dark" | "light" => "dark";

/** Atributo data-theme del <html>. */
export function useTheme(): ["dark" | "light", (t: "dark" | "light") => void] {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getThemeServer);
  const set = useCallback((t: "dark" | "light") => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("geriam-theme", t);
    } catch {
      /* noop */
    }
  }, []);
  return [theme, set];
}
