import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/design";
import { TopoBackground } from "@/components/auth/TopoBackground";
import { LoginForm } from "@/components/auth/LoginForm";
import { DEMO_MODE } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Acceso" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-border bg-bg-elevated lg:block">
        <TopoBackground className="absolute inset-0 size-full opacity-60" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="w-fit" aria-label="Volver al portal">
            <Logo tagline="Gestión de Riesgos Ambato" />
          </Link>
          <div className="max-w-md">
            <p className="label-caps mb-3 text-accent">Sala de operaciones</p>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-fg">
              Monitoreo y alerta temprana de embalses de alta montaña.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-fg-muted">
              Sensores LoRaWAN, enlaces Starlink y cámaras en las presas, integrados en una sola vista para anticipar
              crecidas y proteger a la población aguas abajo.
            </p>
          </div>
          <p className="flex items-center gap-2 text-xs text-fg-faint">
            <ShieldCheck className="size-4" aria-hidden /> Acceso restringido al personal autorizado. Toda acción queda
            registrada en bitácora.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo tagline="Gestión de Riesgos Ambato" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Ingresar a GeRiAm</h2>
          <p className="mt-1 text-sm text-fg-muted">Use su correo institucional.</p>
          <Suspense>
            <LoginForm demoMode={DEMO_MODE} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
