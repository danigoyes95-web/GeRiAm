import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "GeRiAm — Alerta temprana de embalses",
    short_name: "GeRiAm",
    description: "Estado de embalses, alertas, cámaras y reportes de campo.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070d18",
    theme_color: "#070d18",
    lang: "es-EC",
    categories: ["utilities", "government", "weather"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Alertas", url: "/app/alertas", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Reportar incidente", url: "/app/reportar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
