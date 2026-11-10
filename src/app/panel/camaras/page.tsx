import type { Metadata } from "next";
import { CameraWall } from "@/components/panel/cameras/CameraWall";

export const metadata: Metadata = { title: "Cámaras" };

export default function CamarasPage() {
  return <CameraWall />;
}
