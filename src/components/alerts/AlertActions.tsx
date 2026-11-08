"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUp, CircleCheckBig, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Alert } from "@/lib/data/types";
import type { Role } from "@/lib/domain/types";
import { ORG_LIVE_KEY } from "@/lib/data/live";

export type AlertAction = "confirmar" | "escalar" | "resolver" | "recibido" | "en_camino" | "en_sitio" | "comentario";

export async function postAlertAction(id: string, action: AlertAction, extra?: { note?: string; lat?: number; lng?: number }) {
  const res = await fetch(`/api/alerts/${id}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "No se pudo registrar la acción");
  }
}

const LABEL: Record<AlertAction, string> = {
  confirmar: "Alerta confirmada",
  escalar: "Alerta escalada al siguiente nivel de contactos",
  resolver: "Alerta resuelta",
  recibido: "Recibido",
  en_camino: "En camino",
  en_sitio: "En sitio",
  comentario: "Comentario registrado",
};

export function AlertActions({ alert, role, size = "sm", showResolve = false }: { alert: Alert; role: Role; size?: "sm" | "md"; showResolve?: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<AlertAction | null>(null);
  const canOperate = role === "admin" || role === "operador";
  const run = async (a: AlertAction) => {
    setBusy(a);
    try {
      await postAlertAction(alert.id, a);
      toast.success(LABEL[a], { description: alert.title });
      await qc.invalidateQueries({ queryKey: ORG_LIVE_KEY });
      await qc.invalidateQueries({ queryKey: ["alert", alert.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };
  if (!canOperate || alert.status === "resuelta") return null;
  return (
    <>
      {!alert.acknowledged_at && (
        <Button size={size} variant="primary" onClick={() => run("confirmar")} disabled={!!busy}>
          {busy === "confirmar" ? <Loader2 className="animate-spin" /> : <Check />} Confirmar
        </Button>
      )}
      <Button size={size} variant="secondary" onClick={() => run("escalar")} disabled={!!busy}>
        {busy === "escalar" ? <Loader2 className="animate-spin" /> : <ChevronsUp />} Escalar
      </Button>
      {showResolve && (
        <Button size={size} variant="ghost" onClick={() => run("resolver")} disabled={!!busy}>
          {busy === "resolver" ? <Loader2 className="animate-spin" /> : <CircleCheckBig />} Resolver
        </Button>
      )}
    </>
  );
}
