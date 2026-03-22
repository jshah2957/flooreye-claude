import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Monitor,
  Film,
  History,
  AlertTriangle,
  Database,
  BrainCircuit,
  FlaskConical,
  Boxes,
  TestTube,
  Store,
  Camera,
  Joystick,
  Bell,
  HardDrive,
  Sliders,
  Layers,
  Plug,
  Terminal,
  Cpu,
  Users,
  FileText,
  BookOpen,
  ShieldCheck,
  Building2,
  Settings,
  UserCog,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { UserRole, Incident, PaginatedResponse } from "@/types";
import { cn } from "@/lib/utils";
import { UI_LIMITS } from "@/constants";

interface SidebarProps {
  role: UserRole;
  collapsed?: boolean;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  minRole?: UserRole[];
}

interface NavSection {
  title: string;
  items: NavItem[];
  minRole?: UserRole[];
}

const ALL_ROLES: UserRole[] = [
  "super_admin", "org_admin", "ml_engineer", "operator", "store_owner", "viewer",
];
const ADMIN_PLUS: UserRole[] = ["super_admin", "org_admin"];
const ML_PLUS: UserRole[] = ["super_admin", "org_admin", "ml_engineer"];
const OPERATOR_PLUS: UserRole[] = ["super_admin", "org_admin", "ml_engineer", "operator"];

/** Simplified sidebar for store_owner and viewer roles */
const SIMPLE_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Notification Center", path: "/notification-center", icon: Bell },
  { label: "Store Status", path: "/stores", icon: Building2 },
  { label: "Alerts", path: "/incidents", icon: AlertTriangle },
  { label: "Live Cameras", path: "/monitoring", icon: Camera },
  { label: "Settings", path: "/notifications", icon: Settings },
  { label: "Notification Preferences", path: "/profile/notification-preferences", icon: UserCog },
];

const NAV_SECTIONS: NavSection[] = [
  {
    title: "MONITORING",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, minRole: ALL_ROLES },
      { label: "Notification Center", path: "/notification-center", icon: Bell, minRole: ALL_ROLES },
      { label: "Live Monitoring", path: "/monitoring", icon: Monitor, minRole: OPERATOR_PLUS },
      { label: "Recorded Clips", path: "/clips", icon: Film, minRole: ALL_ROLES },
      { label: "Compliance Report", path: "/compliance", icon: ShieldCheck, minRole: ALL_ROLES },
    ],
  },
  {
    title: "DETECTION & REVIEW",
    items: [
      { label: "Detection History", path: "/detection/history", icon: History, minRole: ALL_ROLES },
      { label: "Incident Management", path: "/incidents", icon: AlertTriangle, minRole: OPERATOR_PLUS },
    ],
  },
  {
    title: "ML & TRAINING",
    minRole: ML_PLUS,
    items: [
      { label: "Dataset Management", path: "/dataset", icon: Database, minRole: ML_PLUS },
      { label: "Model Registry", path: "/models", icon: Boxes, minRole: ML_PLUS },
      { label: "Test Inference", path: "/ml/test-inference", icon: TestTube, minRole: ML_PLUS },
      { label: "Roboflow Test", path: "/ml/roboflow-test", icon: FlaskConical, minRole: ADMIN_PLUS },
    ],
  },
  {
    title: "CONFIGURATION",
    minRole: ADMIN_PLUS,
    items: [
      { label: "Stores", path: "/stores", icon: Store, minRole: ADMIN_PLUS },
      { label: "Cameras", path: "/cameras", icon: Camera, minRole: ADMIN_PLUS },
      { label: "Device Control", path: "/devices", icon: Joystick, minRole: ADMIN_PLUS },
      { label: "Notification Settings", path: "/notifications", icon: Bell, minRole: ADMIN_PLUS },
      { label: "Storage Settings", path: "/settings/storage", icon: HardDrive, minRole: ADMIN_PLUS },
    ],
  },
  {
    title: "DETECTION CONTROL",
    minRole: ADMIN_PLUS,
    items: [
      { label: "Detection Control Center", path: "/detection-control", icon: Sliders, minRole: ADMIN_PLUS },
      { label: "Class Manager", path: "/detection-control/classes", icon: Layers, minRole: ADMIN_PLUS },
    ],
  },
  {
    title: "INTEGRATIONS",
    minRole: ADMIN_PLUS,
    items: [
      { label: "API Integration Manager", path: "/integrations/api-manager", icon: Plug, minRole: ADMIN_PLUS },
      { label: "API Testing Console", path: "/integrations/api-tester", icon: Terminal, minRole: ADMIN_PLUS },
      { label: "Roboflow Integration", path: "/integrations/roboflow", icon: BrainCircuit, minRole: ADMIN_PLUS },
    ],
  },
  {
    title: "EDGE MANAGEMENT",
    minRole: ADMIN_PLUS,
    items: [
      { label: "Edge Agents", path: "/edge", icon: Cpu, minRole: ADMIN_PLUS },
    ],
  },
  {
    title: "ADMINISTRATION",
    minRole: ADMIN_PLUS,
    items: [
      { label: "User Management", path: "/admin/users", icon: Users, minRole: ADMIN_PLUS },
      { label: "System Logs & Audit", path: "/admin/logs", icon: FileText, minRole: ADMIN_PLUS },
      { label: "User Manual", path: "/docs", icon: BookOpen, minRole: ALL_ROLES },
    ],
  },
  {
    title: "PROFILE",
    items: [
      { label: "Notification Preferences", path: "/profile/notification-preferences", icon: UserCog, minRole: ALL_ROLES },
    ],
  },
];

function hasAccess(allowedRoles: UserRole[] | undefined, userRole: UserRole): boolean {
  if (!allowedRoles) return true;
  return allowedRoles.includes(userRole);
}

export default function Sidebar({ role, collapsed = false }: SidebarProps) {
  const isAdmin = role === "super_admin" || role === "org_admin" || role === "ml_engineer";

  const { data: unreadCount } = useQuery({
    queryKey: ["unread-incident-count"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Incident>>("/events", {
        params: { status: "new", limit: 1 },
      });
      return res.data.meta?.total ?? 0;
    },
    refetchInterval: 30000, // refresh every 30 seconds
  });

  const badgeCount = unreadCount ?? 0;

  return (
    <aside
      className={cn(
        "flex h-screen flex-col bg-[#0F172A] text-[#CBD5E1] transition-all",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center px-4">
        <span className="text-lg font-bold text-[#0D9488]">
          {collapsed ? "FE" : "FLOOREYE"}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {isAdmin ? (
          /* Full admin sidebar */
          NAV_SECTIONS.filter((s) => hasAccess(s.minRole, role)).map((section) => (
            <div key={section.title} className="mb-4">
              {!collapsed && (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-[#475569]">
                  {section.title}
                </p>
              )}
              {section.items
                .filter((item) => hasAccess(item.minRole, role))
                .map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-[#1E293B] text-white"
                          : "hover:bg-[#1E293B]/50 hover:text-white",
                      )
                    }
                  >
                    <item.icon size={18} />
                    {!collapsed && (
                      <span className="flex flex-1 items-center justify-between">
                        <span>{item.label}</span>
                        {item.path === "/notification-center" && badgeCount > 0 && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#DC2626] px-1.5 text-[10px] font-bold text-white">
                            {badgeCount > UI_LIMITS.BADGE_MAX_DISPLAY ? `${UI_LIMITS.BADGE_MAX_DISPLAY}+` : badgeCount}
                          </span>
                        )}
                      </span>
                    )}
                  </NavLink>
                ))}
            </div>
          ))
        ) : (
          /* Simplified sidebar for store_owner / viewer / operator */
          <div className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-[#475569]">
                MY STORE
              </p>
            )}
            {SIMPLE_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-[#1E293B] text-white"
                      : "hover:bg-[#1E293B]/50 hover:text-white",
                  )
                }
              >
                <item.icon size={18} />
                {!collapsed && (
                  <span className="flex flex-1 items-center justify-between">
                    <span>{item.label}</span>
                    {item.path === "/notification-center" && badgeCount > 0 && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#DC2626] px-1.5 text-[10px] font-bold text-white">
                        {badgeCount > UI_LIMITS.BADGE_MAX_DISPLAY ? `${UI_LIMITS.BADGE_MAX_DISPLAY}+` : badgeCount}
                      </span>
                    )}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}
