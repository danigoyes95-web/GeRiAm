import type { Metadata } from "next";
import { AuditLog } from "@/components/panel/log/AuditLog";
import { requirePageRole, STAFF_ROLES } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Bitácora" };

export default async function BitacoraPage() {
  await requirePageRole(STAFF_ROLES, "/panel/bitacora");
  return <AuditLog />;
}
