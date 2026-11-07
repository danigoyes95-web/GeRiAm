"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Loader2, Mail, Send } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Label, SegmentedControl } from "@/components/ui/misc";
import { getBrowserClient } from "@/lib/supabase/browser";
import { DEMO_EMAIL_DOMAIN } from "@/lib/supabase/config";

const DEMO_ROLES = [
  { email: `admin@${DEMO_EMAIL_DOMAIN}`, label: "Administrador" },
  { email: `operador@${DEMO_EMAIL_DOMAIN}`, label: "Operador" },
  { email: `tecnico@${DEMO_EMAIL_DOMAIN}`, label: "Técnico" },
  { email: `director.pasa@${DEMO_EMAIL_DOMAIN}`, label: "Director junta" },
  { email: `observador@${DEMO_EMAIL_DOMAIN}`, label: "Observador" },
];

const emailSchema = z.email("Correo inválido");

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/panel";
  return raw;
}

export function LoginForm({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError("Ingrese un correo válido.");
      return;
    }
    setLoading(true);
    const supabase = getBrowserClient();
    try {
      if (mode === "password") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: parsed.data, password });
        if (err) throw err;
        router.replace(next);
        router.refresh();
      } else {
        const { error: err } = await supabase.auth.signInWithOtp({
          email: parsed.data,
          options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (err) throw err;
        setSent(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        /invalid login/i.test(msg)
          ? "Correo o contraseña incorrectos."
          : /signups not allowed|not found/i.test(msg)
            ? "Este correo no tiene acceso a GeRiAm."
            : "No se pudo iniciar sesión. Intente nuevamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <SegmentedControl
        label="Método de acceso"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setSent(false);
          setError(null);
        }}
        options={[
          { value: "password", label: "Contraseña" },
          { value: "magic", label: "Enlace por correo" },
        ]}
      />
      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@institucion.gob.ec" required />
        </div>
        {mode === "password" && (
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-lvl-roja/40 bg-[var(--lvl-roja-bg)] px-3 py-2 text-xs text-lvl-roja">
            {error}
          </p>
        )}
        {sent ? (
          <p role="status" className="rounded-md border border-lvl-normal/40 bg-[var(--lvl-normal-bg)] px-3 py-2 text-xs text-lvl-normal">
            Enviamos un enlace de acceso a {email}. Revise su bandeja de entrada.
          </p>
        ) : (
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : mode === "password" ? <KeyRound /> : <Send />}
            {mode === "password" ? "Ingresar" : "Enviar enlace de acceso"}
          </Button>
        )}
      </form>

      {demoMode && (
        <div className="mt-8 rounded-lg border border-dashed border-border-strong p-3">
          <p className="label-caps mb-2 flex items-center gap-1.5">
            <Mail className="size-3" aria-hidden /> Usuarios de demostración
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ROLES.map((r) => (
              <button
                key={r.email}
                type="button"
                onClick={() => {
                  setMode("password");
                  setEmail(r.email);
                  setPassword("GeRiAm-Demo-2026");
                }}
                className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-fg-muted transition-colors hover:border-accent/50 hover:text-fg"
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-fg-faint">Solo en modo demostración. Contraseña común documentada en el README.</p>
        </div>
      )}
    </div>
  );
}
