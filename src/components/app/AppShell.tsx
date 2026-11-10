"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, Camera, Home, Map, CirclePlus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Isotipo } from "@/design";
import { DrillBanner } from "@/components/DrillBanner";
import { DrillEffects, DrillPrologue } from "@/components/drill/DrillEffects";
import { OnlineIndicator } from "./OnlineIndicator";
import { useOrgLive } from "@/lib/data/live";

const TABS = [
  { href: "/app", label: "Inicio", icon: Home },
  { href: "/app/alertas", label: "Alertas", icon: BellRing },
  { href: "/app/reportar", label: "Reportar", icon: CirclePlus, primary: true },
  { href: "/app/mapa", label: "Mapa", icon: Map },
  { href: "/app/camaras", label: "Cámaras", icon: Camera },
];

export function AppShell({
  userName,
  roleLabel,
  children,
}: {
  userName: string;
  roleLabel: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data } = useOrgLive();
  const alertCount = data?.alerts.length ?? 0;
  const active = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
  return (
    <div className="bg-bg mx-auto flex min-h-dvh max-w-xl flex-col">
      <DrillBanner />
      <DrillEffects />
      <DrillPrologue />
      <header className="border-border bg-bg/85 sticky top-0 z-30 flex items-center gap-3 border-b px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 backdrop-blur-md">
        <Isotipo className="size-7" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[15px] font-semibold tracking-tight">
            Ge<span className="text-accent">Ri</span>Am
          </div>
          <div className="text-fg-faint truncate text-[11px]">
            {userName} · {roleLabel}
          </div>
        </div>
        <OnlineIndicator />
        <Link
          href="/app/perfil"
          className="border-border bg-surface-2 text-fg-muted grid size-9 place-items-center rounded-full border"
          aria-label="Perfil"
        >
          <UserRound className="size-4.5" />
        </Link>
      </header>
      <main className="flex-1 px-4 pt-4 pb-28">{children}</main>
      <nav
        className="border-border bg-bg-elevated/95 fixed inset-x-0 bottom-0 z-40 mx-auto max-w-xl border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
        aria-label="Navegación de la app"
      >
        <ul className="flex">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = active(t.href);
            return (
              <li key={t.href} className="flex-1">
                <Link
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium",
                    on ? "text-accent" : "text-fg-faint",
                  )}
                >
                  {t.primary ? (
                    <span className="bg-accent -mt-5 grid size-11 place-items-center rounded-full text-[#04121a] shadow-[0_8px_24px_-8px_var(--accent)]">
                      <Icon className="size-5.5" aria-hidden />
                    </span>
                  ) : (
                    <Icon className="size-5" aria-hidden />
                  )}
                  {t.label}
                  {t.href === "/app/alertas" && alertCount ? (
                    <span className="bg-lvl-roja absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full px-1 text-center text-[9.5px] font-bold text-white">
                      {alertCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
