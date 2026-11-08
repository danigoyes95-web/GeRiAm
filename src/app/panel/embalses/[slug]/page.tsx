import type { Metadata } from "next";
import { SiteDetail } from "@/components/panel/site/SiteDetail";

export const metadata: Metadata = { title: "Detalle de embalse" };

export default async function EmbalsePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SiteDetail slug={slug} />;
}
