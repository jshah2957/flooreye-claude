import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Monitor,
  Film,
  History,
  AlertTriangle,
  Database,
  BrainCircuit,
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
  Droplets,
  ChevronLeft,
  ChevronRight,
  X,
  FlaskConical,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { UserRole, Incident, PaginatedResponse } from "@/types";
import { cn } from "@/lib/utils";
import { UI_LIMITS } from "@/constants";

interface SidebarProps {
  role: UserRole;
  userName?: string;
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
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
  { label: "Detection History", path: "/detection/history", icon: History },
  { label: "Settings", path: "/notifications", icon: Settings },
  { label: "Notification Preferences", path: "/profile/notification-preferences", icon: UserCog },
  { label: "User Manual", path: "/docs", icon: BookOpen },
];

const NAV_SECTIONS: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, minRole: ALL_ROLES },
      { label: "Notification Center", path: "/notification-center", icon: Bell, minRole: ALL_ROLES },
    ],
  },
  {
    title: "SETUP",
    minRole: ADMIN_PLUS,
    items: [
      { label: "Stores", path: "/stores", icon: Store, minRole: ADMIN_PLUS },
      { label: "Cameras", path: "/cameras", icon: Camera, minRole: ADMIN_PLUS },
      { label: "Edge Agents", path: "/edge", icon: Cpu, minRole: ADMIN_PLUS },
      { label: "IoT Devices", path: "/devices", icon: Joystick, minRole: ADMIN_PLUS },
    ],
  },
  {
    title: "MONITORING",
    items: [
      { label: "Live Monitoring", path: "/monitoring", icon: Monitor, minRole: OPERATOR_PLUS },
      { label: "Recorded Clips", path: "/clips", icon: Film, minRole: ALL_ROLES },
      { label: "Compliance Report", path: "/compliance", icon: ShieldCheck, minRole: ALL_ROLES },
    ],
  },
  {
    title: "DETECTION",
    items: [
      { label: "Detection History", path: "/detection/history", icon: History, minRole: ALL_ROLES },
      { label: "Incident Management", path: "/incidents", icon: AlertTriangle, minRole: OPERATOR_PLUS },
      { label: "Detection Control", path: "/detection-control", icon: Sliders, minRole: ADMIN_PLUS },
      { label: "Class Manager", path: "/detection-control/classes", icon: Layers, minRole: ADMIN_PLUS },
    ],
  },
  {
    title: "ML & AI",
    minRole: ML_PLUS,
    items: [
      { label: "Dataset Management", path: "/dataset", icon: Database, minRole: ML_PLUS },
      { label: "Model Registry", path: "/models", icon: Boxes, minRole: ML_PLUS },
      { label: "Test Inference", path: "/ml/test-inference", icon: TestTube, minRole: ML_PLUS },
      { label: "Learning Dashboard", path: "/learning", icon: BrainCircuit, minRole: ML_PLUS },
      { label: "Annotation Studio", path: "/learning/annotate", icon: Layers, minRole: ML_PLUS },
      { label: "Training Jobs", path: "/learning/training", icon: Cpu, minRole: ML_PLUS },
      { label: "Model Comparison", path: "/learning/models", icon: Boxes, minRole: ML_PLUS },
      { label: "Model Testing", path: "/learning/test", icon: FlaskConical, minRole: ML_PLUS },
      { label: "Dataset Browser", path: "/learning/dataset", icon: Database, minRole: ML_PLUS },
      { label: "Learning Settings", path: "/learning/settings", icon: Settings, minRole: ADMIN_PLUS },
    ],
  },
  {
    title: "SETTINGS",
    minRole: ADMIN_PLUS,
    items: [
      { label: "Notification Rules", path: "/notifications", icon: Bell, minRole: ADMIN_PLUS },
      { label: "Storage", path: "/settings/storage", icon: HardDrive, minRole: ADMIN_PLUS },
      { label: "Integrations", path: "/integrations/api-manager", icon: Plug, minRole: ADMIN_PLUS },
      { label: "Roboflow", path: "/integrations/roboflow", icon: BrainCircuit, minRole: ADMIN_PLUS },
      { label: "User Management", path: "/admin/users", icon: Users, minRole: ADMIN_PLUS },
    ],
  },
  {
    title: "TOOLS",
    items: [
      { label: "API Testing Console", path: "/integrations/api-tester", icon: Terminal, minRole: ADMIN_PLUS },
      { label: "System Logs", path: "/admin/logs", icon: FileText, minRole: ADMIN_PLUS },
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

function NavItemLink({
  item,
  collapsed,
  badgeCount,
}: {
  item: NavItem;
  collapsed: boolean;
  badgeCount: number;
}) {
  return (
    <NavLink
      key={item.path}
      to={item.path}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "border-l-2 border-[#0D9488] bg-white/10 text-white"
            : "border-l-2 border-transparent text-slate-300 hover:bg-white/5 hover:text-white",
          collapsed && "justify-center px-0",
        )
      }
      end={item.path === "/dashboard"}
    >
      {({ isActive }) => (
        <>
          <item.icon size={18} className="shrink-0" aria-hidden="true" />
          {!collapsed && (
            <span className="flex flex-1 items-center justify-between overflow-hidden">
              <span className="truncate">{item.label}</span>
              {item.path === "/notification-center" && badgeCount > 0 && (
                <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#DC2626] px-1.5 text-[10px] font-bold text-white">
                  {badgeCount > UI_LIMITS.BADGE_MAX_DISPLAY ? `${UI_LIMITS.BADGE_MAX_DISPLAY}+` : badgeCount}
                </span>
              )}
            </span>
          )}
          {/* Tooltip for collapsed mode */}
          {collapsed && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
            >
              {item.label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({
  role,
  userName,
  collapsed = false,
  onCollapse,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const isAdmin = role === "super_admin" || role === "org_admin" || role === "ml_engineer";
  const sidebarRef = useRef<HTMLElement>(null);

  const { data: unreadCount } = useQuery({
    queryKey: ["unread-incident-count"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Incident>>("/events", {
        params: { status: "new", limit: 1 },
      });
      return res.data.meta?.total ?? 0;
    },
    refetchInterval: 30000,
  });

  const badgeCount = unreadCount ?? 0;

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Focus trap: return focus when mobile closes
  useEffect(() => {
    if (mobileOpen && sidebarRef.current) {
      sidebarRef.current.focus();
    }
  }, [mobileOpen]);

  const userInitial = userName ? userName.charAt(0).toUpperCase() : "U";
  const roleLabel = role.replace(/_/g, " ");

  const renderNavItems = () => {
    if (!isAdmin) {
      return (
        <div className="mb-4">
          {!collapsed && (
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              MY STORE
            </p>
          )}
          {SIMPLE_NAV_ITEMS.map((item) => (
            <NavItemLink
              key={item.path}
              item={item}
              collapsed={collapsed}
              badgeCount={badgeCount}
            />
          ))}
        </div>
      );
    }

    return NAV_SECTIONS.filter((s) => hasAccess(s.minRole, role)).map((section) => (
      <div key={section.title} className="mb-4">
        {!collapsed && (
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {section.title}
          </p>
        )}
        {collapsed && <div className="mx-auto mb-1 mt-3 h-px w-8 bg-slate-700" />}
        {section.items
          .filter((item) => hasAccess(item.minRole, role))
          .map((item) => (
            <NavItemLink
              key={item.path}
              item={item}
              collapsed={collapsed}
              badgeCount={badgeCount}
            />
          ))}
      </div>
    ));
  };

  const sidebarContent = (
    <aside
      ref={sidebarRef}
      tabIndex={-1}
      className={cn(
        "flex h-screen flex-col bg-[#0F172A] text-slate-300 transition-all duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Logo area */}
      <div className="flex h-16 shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <Droplets size={24} className="shrink-0 text-[#0D9488]" aria-hidden="true" />
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-white">
              FloorEye
            </span>
          )}
        </div>
        {/* Mobile close button */}
        {mobileOpen && onMobileClose && (
          <button
            onClick={onMobileClose}
            className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav
        role="navigation"
        aria-label="Main navigation"
        className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700"
      >
        {renderNavItems()}
      </nav>

      {/* User info at bottom */}
      <div className="shrink-0 border-t border-slate-700/50 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0D9488] text-sm font-semibold text-white">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{userName || "User"}</p>
              <span className="inline-block rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium capitalize text-slate-300">
                {roleLabel}
              </span>
            </div>
          </div>
        ) : (
          <div className="group relative flex justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0D9488] text-sm font-semibold text-white">
              {userInitial}
            </div>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
            >
              {userName || "User"} ({roleLabel})
            </span>
          </div>
        )}
      </div>

      {/* Collapse toggle — desktop only */}
      {onCollapse && (
        <button
          onClick={() => onCollapse(!collapsed)}
          className="hidden shrink-0 border-t border-slate-700/50 p-3 text-slate-400 transition-colors hover:bg-white/5 hover:text-white lg:flex lg:items-center lg:justify-center"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span className="ml-2 text-xs">Collapse</span>}
        </button>
      )}
    </aside>
  );

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!mobileOpen}
      >
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        {sidebarContent}
      </div>
    </>
  );
}
