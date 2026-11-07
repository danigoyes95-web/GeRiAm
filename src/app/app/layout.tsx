import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { getSessionContext } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { ROLE_LABEL, type Role } from "@/lib/domain/types";

export const metadata: Metadata = { title: "App de campo" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login?next=/app");
  return (
    <AppShell userName={ctx.profile.full_name} roleLabel={ROLE_LABEL[ctx.profile.role as Role]}>
      {children}
    </AppShell>
  );
}
