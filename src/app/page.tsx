import Link from "next/link";
import { Logo } from "@/design";
import { Button } from "@/components/ui/button";

export default function Portal() {
  return (
    <main className="grid min-h-dvh place-items-center bg-grid px-4">
      <div className="text-center">
        <Logo tagline="Gestión de Riesgos Ambato" className="justify-center" />
        <div className="mt-6">
          <Button asChild variant="primary">
            <Link href="/login">Ingresar</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
