import type { Metadata } from "next";
import { SensorNetwork } from "@/components/panel/network/SensorNetwork";

export const metadata: Metadata = { title: "Red de sensores" };

export default function RedSensoresPage() {
  return <SensorNetwork />;
}
