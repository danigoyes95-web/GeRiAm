"use client";
import { useState } from "react";
import { CameraTile } from "@/design";
import { SegmentedControl, EmptyState } from "@/components/ui/misc";
import { useApp } from "@/components/app/AppContext";
import { useCachedLive } from "@/components/app/useCachedLive";

export default function AppCamaras() {
  const app = useApp();
  const { data } = useCachedLive();
  const [siteId, setSiteId] = useState<string>("todos");
  const [live, setLive] = useState<string | null>(null);
  const cams = (data?.cameras ?? []).filter((c) => siteId === "todos" || c.site_id === siteId);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Cámaras</h1>
      {data && (
        <SegmentedControl
          label="Embalse"
          value={siteId}
          onChange={setSiteId}
          options={[{ value: "todos", label: "Todas" }, ...data.sites.map((s) => ({ value: s.id, label: s.name.replace("Embalse ", "") }))]}
        />
      )}
      <p className="text-xs text-fg-faint">Ahorro de datos: el video se reproduce solo al tocar la cámara.</p>
      {cams.length === 0 && <EmptyState title="Sin cámaras" />}
      <div className="space-y-3">
        {cams.map((c) => {
          const site = data?.sites.find((s) => s.id === c.site_id);
          const gw = data?.gateways.find((g) => g.site_id === c.site_id);
          return (
            <button key={c.id} type="button" className="block w-full text-left" onClick={() => setLive(live === c.id ? null : c.id)} aria-pressed={live === c.id}>
              <CameraTile
                code={c.code}
                name={c.name}
                siteName={site?.name.replace("Embalse ", "") ?? ""}
                entity={app.branding.entity ?? ""}
                streamUrl={c.stream_url}
                demoClip={c.demo_clip}
                online={c.status === "online" && gw?.status !== "offline"}
                snapshotMode={live !== c.id}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
