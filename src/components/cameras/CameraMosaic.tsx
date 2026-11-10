"use client";
import { CameraTile } from "@/design";
import type { Camera, Site } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export function CameraMosaic({
  cameras,
  sites,
  entity,
  linkOnline,
  cols = 2,
  onExpand,
  snapshotMode,
  compact,
  className,
}: {
  cameras: Camera[];
  sites: Site[];
  entity: string;
  linkOnline: (siteId: string) => boolean;
  cols?: 1 | 2 | 3;
  onExpand?: (c: Camera) => void;
  snapshotMode?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3",
        className,
      )}
    >
      {cameras.map((c) => {
        const site = sites.find((s) => s.id === c.site_id);
        return (
          <CameraTile
            key={c.id}
            code={c.code}
            name={c.name}
            siteName={site?.name.replace("Embalse ", "") ?? ""}
            entity={entity}
            streamUrl={c.stream_url}
            demoClip={c.demo_clip}
            online={c.status === "online" && linkOnline(c.site_id)}
            snapshotMode={snapshotMode}
            compact={compact}
            onExpand={onExpand ? () => onExpand(c) : undefined}
          />
        );
      })}
    </div>
  );
}
