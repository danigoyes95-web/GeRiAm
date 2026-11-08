import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/panel";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/panel";
  if (code) {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=El%20enlace%20expir%C3%B3%20o%20no%20es%20v%C3%A1lido", url.origin));
}
