import type { Metadata } from "next";
import { Portal } from "@/components/portal/Portal";
import { fetchPublicStatus } from "@/lib/data/public";
import { APP_NAME } from "@/lib/brand";

export const revalidate = 30;

export const metadata: Metadata = {
  title: { absolute: APP_NAME },
  description: "Estado en vivo de los embalses de la cuenca alta del río Ambato, niveles de alerta, protocolos y acceso del personal.",
};

export default async function HomePage() {
  const status = await fetchPublicStatus();
  return <Portal initial={status} />;
}
