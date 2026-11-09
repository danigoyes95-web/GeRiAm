"use client";
import { createContext, useContext } from "react";
import type { Role } from "@/lib/domain/types";
import type { Branding, MapCenter } from "@/lib/data/types";

export interface AppCtx {
  userId: string;
  name: string;
  role: Role;
  orgId: string;
  zoneIds: string[];
  phone: string | null;
  channels: string[];
  branding: Branding;
  mapCenter: MapCenter;
}

const Ctx = createContext<AppCtx | null>(null);
export function AppProvider({ value, children }: { value: AppCtx; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fuera de AppProvider");
  return v;
}
