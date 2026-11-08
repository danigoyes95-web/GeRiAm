import { PanelShell } from "@/components/panel/PanelShell";
import { PanelProvider } from "@/components/panel/PanelContext";
import { DemoTicker } from "@/components/panel/DemoTicker";
import { requirePageRole, STAFF_ROLES } from "@/lib/auth/session";
import { orgBranding, type MapCenter } from "@/lib/data/types";
import type { Role } from "@/lib/domain/types";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageRole(STAFF_ROLES, "/panel");
  const role = ctx.profile.role as Role;
  const branding = orgBranding(ctx.organization);
  return (
    <PanelProvider
      value={{
        userId: ctx.userId,
        name: ctx.profile.full_name,
        role,
        orgId: ctx.organization.id,
        orgName: ctx.organization.name,
        branding,
        mapCenter: ctx.organization.map_center as unknown as MapCenter,
        timezone: ctx.organization.timezone,
      }}
    >
      <DemoTicker enabled={role === "admin" || role === "operador"} />
      <PanelShell user={{ name: ctx.profile.full_name, email: ctx.email, role }} branding={branding} orgName={ctx.organization.name}>
        {children}
      </PanelShell>
    </PanelProvider>
  );
}
