"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, Monitor, PanelLeftClose, PanelLeftOpen, Smartphone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo, StatusBadge } from "@/design";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PANEL_NAV } from "./nav";
import { LiveClock } from "./LiveClock";
import { StarlinkStrip } from "./StarlinkStrip";
import { DrillBanner } from "@/components/DrillBanner";
import { DrillEffects, DrillPrologue } from "@/components/drill/DrillEffects";
import { globalLevel, useOrgLive } from "@/lib/data/live";
import { useLocalStorage } from "@/lib/hooks/useBrowser";
import { ROLE_LABEL, type Role } from "@/lib/domain/types";
import type { Branding } from "@/lib/data/types";

export interface PanelUser {
  name: string;
  email: string;
  role: Role;
}

export function PanelShell({
  user,
  branding,
  orgName,
  children,
}: {
  user: PanelUser;
  branding: Branding;
  orgName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [navPref, setNavPref] = useLocalStorage("geriam-nav", "open");
  const collapsed = navPref === "collapsed";
  const [roomMode, setRoomMode] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreAt, setMoreAt] = useState(pathname);
  if (moreAt !== pathname) {
    setMoreAt(pathname);
    setMoreOpen(false);
  }
  const { data } = useOrgLive();
  const level = globalLevel(data);

  useEffect(() => {
    if (!roomMode) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setRoomMode(false);
    window.addEventListener("keydown", onKey);
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, [roomMode]);

  const toggleNav = () => setNavPref(collapsed ? "open" : "collapsed");

  const items = PANEL_NAV.filter((i) => !i.roles || i.roles.includes(user.role));
  const isActive = (href: string) =>
    href === "/panel" ? pathname === "/panel" : pathname.startsWith(href.replace(/\/chiquiurco$/, ""));

  return (
    <div className="bg-bg flex min-h-dvh flex-col">
      <DrillBanner />
      <DrillEffects />
      <DrillPrologue />
      <div className="flex min-h-0 flex-1">
        {!roomMode && (
          <aside
            className={cn(
              "border-border bg-bg-elevated sticky top-0 hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-200 md:flex",
              collapsed ? "w-[60px]" : "w-[232px]",
            )}
            aria-label="Navegación principal"
          >
            <div
              className={cn(
                "border-border flex h-14 items-center border-b",
                collapsed ? "justify-center" : "px-4",
              )}
            >
              <Link href="/panel" aria-label="Inicio del panel">
                <Logo
                  compact={collapsed}
                  tagline={branding.tagline}
                  product={branding.product}
                  color={branding.primary}
                />
              </Link>
            </div>
            <nav className="flex-1 scrollbar-thin overflow-y-auto p-2">
              <ul className="space-y-0.5">
                {items.map((it) => {
                  const Icon = it.icon;
                  const active = isActive(it.href);
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        title={collapsed ? it.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex h-9 items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors",
                          collapsed ? "justify-center" : "px-2.5",
                          active
                            ? "bg-accent-soft text-fg"
                            : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            active ? "text-accent" : "text-fg-faint group-hover:text-fg-muted",
                          )}
                          aria-hidden
                        />
                        {!collapsed && <span className="truncate">{it.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-border border-t p-2">
              <Link
                href="/app"
                className={cn(
                  "text-fg-muted hover:bg-surface-2 hover:text-fg flex h-9 items-center gap-2.5 rounded-md text-[13px]",
                  collapsed ? "justify-center" : "px-2.5",
                )}
                title="Abrir app móvil"
              >
                <Smartphone className="size-4" aria-hidden />
                {!collapsed && "App de campo"}
              </Link>
              <button
                type="button"
                onClick={toggleNav}
                className={cn(
                  "text-fg-muted hover:bg-surface-2 hover:text-fg flex h-9 w-full items-center gap-2.5 rounded-md text-[13px]",
                  collapsed ? "justify-center" : "px-2.5",
                )}
                aria-label={collapsed ? "Expandir navegación" : "Contraer navegación"}
              >
                {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
                {!collapsed && "Contraer"}
              </button>
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-border bg-bg/85 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-3 backdrop-blur-md sm:px-4">
            <div className="md:hidden">
              <Logo compact />
            </div>
            <div className="hidden min-w-0 flex-col leading-tight lg:flex">
              <span className="text-fg truncate text-[13px] font-semibold">{branding.entity ?? orgName}</span>
              <span className="text-fg-faint truncate text-[11px]">
                {branding.unit ?? "Sala de operaciones"}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-4">
              <StarlinkStrip />
              <div className="hidden items-center gap-2 sm:flex">
                <span className="label-caps">Estado</span>
                <StatusBadge level={level} />
              </div>
              <LiveClock />
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <Button
                  variant={roomMode ? "primary" : "ghost"}
                  size="icon-sm"
                  onClick={() => setRoomMode((v) => !v)}
                  aria-pressed={roomMode}
                  aria-label={roomMode ? "Salir del modo sala" : "Modo pantalla de sala"}
                  title="Modo pantalla de sala (Esc para salir)"
                >
                  {roomMode ? <X /> : <Monitor />}
                </Button>
              </div>
              <div className="border-border hidden items-center gap-2 border-l pl-3 xl:flex">
                <div className="text-right leading-tight">
                  <div className="text-fg text-[12px] font-medium">{user.name}</div>
                  <div className="text-fg-faint text-[10.5px]">{ROLE_LABEL[user.role]}</div>
                </div>
                <form action="/auth/signout" method="post">
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Cerrar sesión"
                    title="Cerrar sesión"
                  >
                    <LogOut />
                  </Button>
                </form>
              </div>
            </div>
          </header>
          <main id="contenido" className="min-w-0 flex-1">
            {children}
          </main>
          {/* navegación móvil: 4 accesos + "Más" cuando hay más de 5 pantallas */}
          {!roomMode && (
            <nav
              className="border-border bg-bg-elevated/95 sticky bottom-0 z-30 border-t backdrop-blur md:hidden"
              aria-label="Navegación"
            >
              {moreOpen && (
                <ul className="border-border grid grid-cols-2 gap-1 border-b p-2">
                  {items.slice(4).map((it) => {
                    const Icon = it.icon;
                    return (
                      <li key={it.href}>
                        <Link
                          href={it.href}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-3 py-2.5 text-[13px]",
                            isActive(it.href) ? "bg-accent-soft text-accent" : "text-fg-muted",
                          )}
                        >
                          <Icon className="size-4" aria-hidden />
                          {it.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex">
                {(items.length > 5 ? items.slice(0, 4) : items).map((it) => {
                  const Icon = it.icon;
                  const active = isActive(it.href);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
                        active ? "text-accent" : "text-fg-faint",
                      )}
                    >
                      <Icon className="size-4.5" aria-hidden />
                      <span className="truncate">{it.label.split(" ")[0]}</span>
                    </Link>
                  );
                })}
                {items.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setMoreOpen((v) => !v)}
                    aria-expanded={moreOpen}
                    className={cn(
                      "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
                      moreOpen || items.slice(4).some((i) => isActive(i.href))
                        ? "text-accent"
                        : "text-fg-faint",
                    )}
                  >
                    {moreOpen ? (
                      <X className="size-4.5" aria-hidden />
                    ) : (
                      <Menu className="size-4.5" aria-hidden />
                    )}
                    <span>Más</span>
                  </button>
                )}
              </div>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
