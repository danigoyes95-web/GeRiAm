import type { Metadata } from "next";
import { AlertCenter } from "@/components/panel/alerts/AlertCenter";

export const metadata: Metadata = { title: "Centro de alertas" };

export default function AlertasPage() {
  return <AlertCenter />;
}
