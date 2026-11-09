"use client";
/** Cola offline de reportes de campo (IndexedDB): se envía al recuperar señal. */
export interface QueuedIncident {
  client_id: string;
  type: string;
  description: string;
  site_id: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  captured_at: string;
  photo: Blob | null;
}

const DB = "geriam-offline";
const STORE = "incidents";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "client_id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const enqueue = (i: QueuedIncident) => tx("readwrite", (s) => s.put(i));
export const listQueued = () => tx<QueuedIncident[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedIncident[]>);
export const removeQueued = (id: string) => tx("readwrite", (s) => s.delete(id));

export async function sendIncident(i: QueuedIncident): Promise<void> {
  const fd = new FormData();
  const { photo, ...rest } = i;
  fd.set("data", JSON.stringify(rest));
  if (photo) fd.set("photo", photo, "foto.jpg");
  const res = await fetch("/api/incidents", { method: "POST", body: fd });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `HTTP ${res.status}`);
  }
}

/** Envía todo lo pendiente; devuelve cuántos se enviaron. */
export async function flushQueue(): Promise<number> {
  if (!navigator.onLine) return 0;
  let sent = 0;
  for (const i of await listQueued()) {
    try {
      await sendIncident(i);
      await removeQueued(i.client_id);
      sent++;
    } catch {
      break;
    }
  }
  return sent;
}
