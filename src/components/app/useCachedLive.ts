"use client";
import { useEffect, useState } from "react";
import { useOrgLive, type OrgLive } from "@/lib/data/live";

const KEY = "geriam-app-last-state";

/**
 * Estado vivo con respaldo offline: guarda el último estado recibido y, sin
 * conexión, lo devuelve junto con su antigüedad.
 */
export function useCachedLive(): { data: OrgLive | undefined; cachedAt: number | null; fromCache: boolean; isLoading: boolean } {
  const q = useOrgLive();
  const [cached, setCached] = useState<{ data: OrgLive; savedAt: number } | null>(null);

  useEffect(() => {
    if (q.data) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ data: q.data, savedAt: Date.now() }));
      } catch {
        /* almacenamiento lleno o bloqueado */
      }
    }
  }, [q.data]);

  useEffect(() => {
    if (q.data) return;
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) setCached(JSON.parse(raw) as { data: OrgLive; savedAt: number });
      } catch {
        /* sin caché */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [q.data, q.isError]);

  if (q.data) return { data: q.data, cachedAt: null, fromCache: false, isLoading: false };
  if (cached) return { data: cached.data, cachedAt: cached.savedAt, fromCache: true, isLoading: false };
  return { data: undefined, cachedAt: null, fromCache: false, isLoading: q.isLoading };
}
