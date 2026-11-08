import type { Metadata } from "next";
import { DrillConsole } from "@/components/panel/drill/DrillConsole";
import { requirePageRole, OPERATOR_ROLES } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Simulacro" };

export default async function SimulacroPage() {
  await requirePageRole(OPERATOR_ROLES, "/panel/simulacro");
  return <DrillConsole />;
}
