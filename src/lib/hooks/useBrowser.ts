"use client";
import { useCallback, useSyncExternalStore } from "react";

/** navigator.onLine reactivo. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const LS_EVENT = "geriam-ls";

/** Valor de localStorage reactivo (tolerante a almacenamiento bloqueado). */
export function useLocalStorage(key: string, fallback: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(
    (cb) => {
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
    () => {
      try {
        return localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
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

/** Atributo data-theme del <html>. */
export function useTheme(): ["dark" | "light", (t: "dark" | "light") => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => mo.disconnect();
    },
    () => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"),
    () => "dark" as const,
  );
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
