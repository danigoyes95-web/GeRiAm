import { PanelShell } from "@/components/panel/PanelShell";
import { requirePageRole, STAFF_ROLES } from "@/lib/auth/session";
import { orgBranding } from "@/lib/data/types";
import type { Role } from "@/lib/domain/types";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageRole(STAFF_ROLES, "/panel");
  return (
    <PanelShell
      user={{ name: ctx.profile.full_name, email: ctx.email, role: ctx.profile.role as Role }}
      branding={orgBranding(ctx.organization)}
      orgName={ctx.organization.name}
    >
      {children}
    </PanelShell>
  );
}
