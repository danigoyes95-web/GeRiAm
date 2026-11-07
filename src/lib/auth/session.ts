import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/config";
import type { Role } from "@/lib/domain/types";

export type Profile = Tables<"profiles">;
export type Organization = Tables<"organizations">;

export interface SessionContext {
  userId: string;
  email: string;
  profile: Profile;
  organization: Organization;
}

/** Lee la sesión verificada (getClaims valida la firma del JWT) y el perfil GeRiAm. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const userId = data.claims.sub;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile || !profile.active) return null;
  const { data: organization } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .maybeSingle();
  if (!organization) return null;
  return { userId, email: String(data.claims.email ?? profile.email), profile, organization };
});

/** Para páginas: exige sesión con perfil y (opcional) uno de los roles. */
export async function requirePageRole(roles?: readonly Role[], next = "/panel"): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (roles && !roles.includes(ctx.profile.role as Role)) redirect("/sin-acceso?motivo=rol");
  return ctx;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Para Route Handlers: lanza HttpError(401/403). */
export async function requireApiRole(roles?: readonly Role[]): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new HttpError(401, "Sesión requerida");
  if (roles && !roles.includes(ctx.profile.role as Role)) throw new HttpError(403, "Rol sin permiso");
  return ctx;
}

export const OPERATOR_ROLES = ["admin", "operador"] as const satisfies readonly Role[];
export const STAFF_ROLES = ["admin", "operador", "observador"] as const satisfies readonly Role[];
export const PANEL_ROLES = ["admin", "operador", "observador", "tecnico", "director_junta"] as const satisfies readonly Role[];
