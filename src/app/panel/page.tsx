import type { Metadata } from "next";
import { Overview } from "@/components/panel/overview/Overview";

export const metadata: Metadata = { title: "Vista general" };

export default function PanelHome() {
  return <Overview />;
}
