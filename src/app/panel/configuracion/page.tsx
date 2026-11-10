import type { Metadata } from "next";
import { ConfigPanel } from "@/components/panel/config/ConfigPanel";
import { requirePageRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  await requirePageRole(["admin"], "/panel/configuracion");
  return <ConfigPanel />;
}
