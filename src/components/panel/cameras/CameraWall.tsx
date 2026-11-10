"use client";
import { useMemo, useState } from "react";
import { Video } from "lucide-react";
import { CameraMosaic } from "@/components/cameras/CameraMosaic";
import { usePanel } from "@/components/panel/PanelContext";
import { Card, CardHeader } from "@/components/ui/card";
import { SegmentedControl, Skeleton } from "@/components/ui/misc";
import { StatusBadge } from "@/design";
import { useOrgLive, useSiteSummaries } from "@/lib/data/live";

type Layout = "1" | "4" | "9";

export function CameraWall() {
  const panel = usePanel();
  const { data } = useOrgLive();
  const summaries = useSiteSummaries(data);
  const [siteId, setSiteId] = useState("todos");
  const [layout, setLayout] = useState<Layout>("4");
  const [focus, setFocus] = useState<string | null>(null);

  const cams = useMemo(() => (data?.cameras ?? []).filter((c) => siteId === "todos" || c.site_id === siteId), [data, siteId]);
  const shown = focus ? cams.filter((c) => c.id === focus) : cams.slice(0, Number(layout));
  const linkOnline = (id: string) => summaries.find((s) => s.site.id === id)?.linkOnline ?? true;
  const cols = focus || layout === "1" ? 1 : layout === "4" ? 2 : 3;

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Cámaras</h1>
        <p className="text-xs text-fg-muted">
          Cámaras IP en cortinas, vertederos y espejo de agua, transmitidas por el enlace Starlink de cada presa. El video se integra por HLS cuando las cámaras estén instaladas.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {data && (
          <SegmentedControl
            label="Embalse"
            value={siteId}
            onChange={(v) => {
              setSiteId(v);
              setFocus(null);
            }}
            options={[{ value: "todos", label: "Todas" }, ...data.sites.map((s) => ({ value: s.id, label: s.name.replace("Embalse ", "") }))]}
          />
        )}
        <div className="hidden sm:block">
          <SegmentedControl<Layout>
            label="Mosaico"
            value={layout}
            onChange={(v) => {
              setLayout(v);
              setFocus(null);
            }}
            options={[
              { value: "1", label: "1" },
              { value: "4", label: "2×2" },
              { value: "9", label: "3×3" },
            ]}
          />
        </div>
      </div>

      {data ? (
        <CameraMosaic
          cameras={shown}
          sites={data.sites}
          entity={panel.branding.entity ?? panel.orgName}
          linkOnline={linkOnline}
          cols={cols}
          className="max-sm:grid-cols-1"
          onExpand={(c) => setFocus(focus === c.id ? null : c.id)}
        />
      ) : (
        <Skeleton className="aspect-video w-full" />
      )}

      <Card>
        <CardHeader title="Inventario de cámaras" subtitle={`${cams.length} cámaras · toca una para verla en grande`} icon={<Video />} />
        <ul className="divide-y divide-border">
          {cams.map((c) => {
            const site = data?.sites.find((s) => s.id === c.site_id);
            const online = c.status === "online" && linkOnline(c.site_id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setFocus(focus === c.id ? null : c.id)}
                  aria-pressed={focus === c.id}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-2 aria-pressed:bg-accent-soft"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {c.code} <span className="font-normal text-fg-muted">· {c.name}</span>
                    </div>
                    <div className="truncate text-[11px] text-fg-faint">
                      {site?.name} · {c.kind === "PTZ" ? "PTZ" : "Fija"} · {c.position_label}
                    </div>
                  </div>
                  <StatusBadge size="sm" level={online ? "normal" : "offline"} label={online ? "EN LÍNEA" : "SIN ENLACE"} />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
