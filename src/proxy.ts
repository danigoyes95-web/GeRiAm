import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_SCHEMA, SUPABASE_URL, type DB, type GeriamSchema } from "@/lib/supabase/config";

/**
 * Proxy (antes "middleware"): refresca la sesión de Supabase y protege /panel y /app.
 * Un usuario de auth.users solo entra a GeRiAm si tiene fila activa en geriam.profiles.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<DB, GeriamSchema>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SUPABASE_SCHEMA },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/panel") || path.startsWith("/app");

  if (isProtected) {
    // /offline funciona sin sesión (shell offline de la PWA)
    if (path === "/offline") return response;
    if (!userId) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
    const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", userId).maybeSingle();
    if (!profile || !profile.active) {
      const url = request.nextUrl.clone();
      url.pathname = "/sin-acceso";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // El panel es para personal de sala; técnicos y directores de junta usan la PWA.
    if (path.startsWith("/panel") && (profile.role === "tecnico" || profile.role === "director_junta")) {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|serwist|manifest.webmanifest|icons|demo|brand|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|m3u8|ts|woff2?)$).*)",
  ],
};
