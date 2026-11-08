"use client";
import { StarlinkStatus } from "@/design";
import { useOrgLive } from "@/lib/data/live";

export function StarlinkStrip() {
  const { data } = useOrgLive();
  if (!data) return null;
  return (
    <div className="hidden items-center gap-3 2xl:flex xl:flex" aria-label="Enlaces Starlink">
      {data.sites.map((site) => {
        const gw = data.gateways.find((g) => g.site_id === site.id);
        const stl = data.sensors.find((s) => s.site_id === site.id && s.type === "starlink");
        const online = gw ? gw.status !== "offline" : false;
        return <StarlinkStatus key={site.id} compact name={site.code} info={{ online, latencyMs: stl?.last_value ?? null }} />;
      })}
    </div>
  );
}
