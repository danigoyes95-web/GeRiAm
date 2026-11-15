import type { Metadata } from "next";
import { ImpactExplorer } from "@/components/panel/impact/ImpactExplorer";

export const metadata: Metadata = { title: "Zonas de impacto" };

export default function ImpactoPage() {
  return <ImpactExplorer />;
}
