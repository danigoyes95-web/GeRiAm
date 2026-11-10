import type { Metadata } from "next";
import { ReportBuilder } from "@/components/panel/reports/ReportBuilder";

export const metadata: Metadata = { title: "Reportes" };

export default function ReportesPage() {
  return <ReportBuilder />;
}
