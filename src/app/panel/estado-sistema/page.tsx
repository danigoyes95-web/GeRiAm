import type { Metadata } from "next";
import { SystemStatus } from "@/components/panel/system/SystemStatus";
import { requirePageRole, STAFF_ROLES } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Estado del sistema" };

export default async function EstadoSistemaPage() {
  await requirePageRole(STAFF_ROLES, "/panel/estado-sistema");
  return <SystemStatus />;
}
