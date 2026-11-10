import {
  LayoutDashboard,
  Waves,
  Video,
  RadioTower,
  BellRing,
  Siren,
  FileText,
  Settings,
  ScrollText,
  Activity,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/domain/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
  /** pantalla aún no publicada: no se muestra en el menú */
  pending?: boolean;
}

export const PANEL_NAV_ALL: NavItem[] = [
  { href: "/panel", label: "Vista general", icon: LayoutDashboard },
  { href: "/panel/embalses/chiquiurco", label: "Embalses", icon: Waves },
  { href: "/panel/red-sensores", label: "Red de sensores", icon: RadioTower },
  { href: "/panel/alertas", label: "Alertas", icon: BellRing },
  { href: "/panel/camaras", label: "Cámaras", icon: Video },
  { href: "/panel/simulacro", label: "Simulacro", icon: Siren, roles: ["admin", "operador"] },
  { href: "/panel/reportes", label: "Reportes", icon: FileText },
  { href: "/panel/bitacora", label: "Bitácora", icon: ScrollText, roles: ["admin", "operador", "observador"] },
  { pending: true, href: "/panel/estado-sistema", label: "Estado del sistema", icon: Activity },
  { pending: true, href: "/panel/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
];

export const PANEL_NAV: NavItem[] = PANEL_NAV_ALL.filter((i) => !i.pending);
