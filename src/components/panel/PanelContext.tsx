"use client";
import { createContext, useContext } from "react";
import type { Role } from "@/lib/domain/types";
import type { Branding, MapCenter } from "@/lib/data/types";

export interface PanelCtx {
  userId: string;
  name: string;
  role: Role;
  orgId: string;
  orgName: string;
  branding: Branding;
  mapCenter: MapCenter;
  timezone: string;
}

const Ctx = createContext<PanelCtx | null>(null);

export function PanelProvider({ value, children }: { value: PanelCtx; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePanel(): PanelCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePanel fuera de PanelProvider");
  return v;
}
