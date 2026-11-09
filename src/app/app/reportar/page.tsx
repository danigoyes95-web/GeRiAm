"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CloudUpload, Loader2, LocateFixed, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/misc";
import { useCachedLive } from "@/components/app/useCachedLive";
import { enqueue, flushQueue, listQueued, sendIncident, type QueuedIncident } from "@/lib/offline/queue";
import { useOnline } from "@/lib/hooks/useBrowser";
import { formatNumber } from "@/lib/format";

const TYPES = [
  { v: "filtracion", l: "Filtración en la presa" },
  { v: "dano_estructural", l: "Grieta / daño estructural" },
  { v: "deslizamiento", l: "Deslizamiento de ladera" },
  { v: "crecida", l: "Crecida del río" },
  { v: "obstruccion", l: "Obstrucción de vertedero o cauce" },
  { v: "acceso", l: "Problema de acceso / vía" },
  { v: "otro", l: "Otro" },
];

/** Reduce la foto a ≤ 1600 px y JPEG 0,8 (datos móviles / Starlink). */
async function compress(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.8));
  } catch {
    return file;
  }
}

export default function ReportarPage() {
  const { data } = useCachedLive();
  const online = useOnline();
  const [type, setType] = useState("filtracion");
  const [desc, setDesc] = useState("");
  const [siteId, setSiteId] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshPending = async () => setPending((await listQueued().catch(() => [] as QueuedIncident[])).length);
  useEffect(() => {
    const t = setTimeout(refreshPending, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!online) return;
    flushQueue().then((n) => {
      if (n) toast.success(`${n} reporte(s) pendiente(s) enviado(s)`);
      void refreshPending();
    });
  }, [online]);

  const locate = () => {
    if (!("geolocation" in navigator)) return toast.error("Este dispositivo no tiene GPS disponible");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setLocating(false);
      },
      () => {
        toast.error("No se pudo obtener la ubicación");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  useEffect(() => {
    const t = setTimeout(locate, 0);
    return () => clearTimeout(t);
  }, []);

  const onPhoto = async (f: File | undefined) => {
    if (!f) return;
    const b = await compress(f);
    setPhoto(b);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(b);
    });
  };

  const submit = async () => {
    if (desc.trim().length < 3) return toast.error("Describa brevemente lo observado");
    const item: QueuedIncident = {
      client_id: crypto.randomUUID(),
      type,
      description: desc.trim(),
      site_id: siteId || null,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      accuracy_m: pos?.accuracy ?? null,
      captured_at: new Date().toISOString(),
      photo,
    };
    setSending(true);
    try {
      if (!navigator.onLine) throw new Error("offline");
      await sendIncident(item);
      toast.success("Reporte enviado a la sala de operaciones");
    } catch {
      await enqueue(item);
      toast.message("Sin señal: el reporte quedó guardado", { description: "Se enviará automáticamente al recuperar conexión." });
      void refreshPending();
    } finally {
      setSending(false);
      setDesc("");
      setPhoto(null);
      setPreview(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reportar incidente</h1>
        <p className="text-sm text-fg-muted">Funciona sin señal: se envía al recuperar conexión.</p>
      </div>
      {pending > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-lvl-offline/40 bg-[var(--lvl-offline-bg)] p-3 text-sm text-lvl-offline">
          <CloudUpload className="size-4" /> {pending} reporte(s) en cola de envío
        </p>
      )}
      <label className="block space-y-1.5">
        <Label>Tipo</Label>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="h-11 w-full">
          {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </Select>
      </label>
      <label className="block space-y-1.5">
        <Label>Embalse</Label>
        <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-11 w-full">
          <option value="">Otro lugar / aguas abajo</option>
          {data?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </label>
      <label className="block space-y-1.5">
        <Label>Descripción</Label>
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Qué observa, dónde exactamente, magnitud…" />
      </label>
      <div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
        {preview ? (
          <div className="relative overflow-hidden rounded-xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Foto del incidente" className="max-h-72 w-full object-cover" />
            <button type="button" onClick={() => { setPhoto(null); setPreview(null); }} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white" aria-label="Quitar foto">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <Button variant="secondary" size="lg" className="w-full" onClick={() => fileRef.current?.click()}>
            <Camera /> Tomar foto
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-sm">
        <span className="text-fg-muted">
          {pos ? (
            <>
              GPS <span className="tabular font-mono text-fg">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</span> ± {formatNumber(pos.accuracy, 0)} m
            </>
          ) : locating ? "Obteniendo ubicación…" : "Sin ubicación"}
        </span>
        <Button size="sm" variant="ghost" onClick={locate} disabled={locating} aria-label="Actualizar ubicación">
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
        </Button>
      </div>
      <Button variant="primary" size="lg" className="w-full" onClick={submit} disabled={sending}>
        {sending ? <Loader2 className="animate-spin" /> : <Send />} Enviar reporte
      </Button>
    </div>
  );
}
