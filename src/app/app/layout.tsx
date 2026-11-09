import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { AppProvider } from "@/components/app/AppContext";
import { getSessionContext } from "@/lib/auth/session";
import { orgBranding, type MapCenter } from "@/lib/data/types";
import { ROLE_LABEL, type Role } from "@/lib/domain/types";

export const metadata: Metadata = { title: "App de campo" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login?next=/app");
  const role = ctx.profile.role as Role;
  return (
    <AppProvider
      value={{
        userId: ctx.userId,
        name: ctx.profile.full_name,
        role,
        orgId: ctx.organization.id,
        zoneIds: ctx.profile.zone_ids,
        phone: ctx.profile.phone,
        channels: ctx.profile.channels,
        branding: orgBranding(ctx.organization),
        mapCenter: ctx.organization.map_center as unknown as MapCenter,
      }}
    >
      <AppShell userName={ctx.profile.full_name} roleLabel={ROLE_LABEL[role]}>
        {children}
      </AppShell>
    </AppProvider>
  );
}
