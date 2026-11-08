import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Logo } from "@/design";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Sin acceso" };

export default async function SinAccesoPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-grid px-4">
      <div className="panel w-full max-w-md p-8 text-center">
        <div className="mb-6 flex justify-center">
          <Logo compact />
        </div>
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-lvl-naranja/40 bg-[var(--lvl-naranja-bg)] text-lvl-naranja">
          <ShieldAlert className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Sin acceso a GeRiAm</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {motivo === "rol"
            ? "Su rol no tiene permiso para esta sección."
            : "Su cuenta existe, pero no está habilitada en GeRiAm. Solicite el alta a la administración de la plataforma."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/">Portal</Link>
          </Button>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost">
              Cerrar sesión
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
