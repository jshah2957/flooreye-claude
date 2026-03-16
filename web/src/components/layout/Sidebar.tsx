import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Monitor,
  Film,
  History,
  AlertTriangle,
  ClipboardCheck,
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
} from "lucide-react";
import type { UserRole } from "@/types";
import { cn } from "@/lib/utils";

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

const NAV_SECTIONS: NavSection[] = [
  {
    title: "MONITORING",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, minRole: ALL_ROLES },
      { label: "Live Monitoring", path: "/monitoring", icon: Monitor, minRole: OPERATOR_PLUS },
      { label: "Recorded Clips", path: "/clips", icon: Film, minRole: ALL_ROLES },
    ],
  },
  {
    title: "DETECTION & REVIEW",
    items: [
      { label: "Detection History", path: "/detection/history", icon: History, minRole: ALL_ROLES },
      { label: "Incident Management", path: "/incidents", icon: AlertTriangle, minRole: OPERATOR_PLUS },
      { label: "Review Queue", path: "/review", icon: ClipboardCheck, minRole: OPERATOR_PLUS },
    ],
  },
  {
    title: "ML & TRAINING",
    minRole: ML_PLUS,
    items: [
      { label: "Dataset Management", path: "/dataset", icon: Database, minRole: ML_PLUS },
      { label: "Training Data Explorer", path: "/training/explorer", icon: FlaskConical, minRole: ML_PLUS },
      { label: "Distillation Jobs", path: "/training/jobs", icon: BrainCircuit, minRole: ML_PLUS },
      { label: "Model Registry", path: "/models", icon: Boxes, minRole: ML_PLUS },
      { label: "Test Inference", path: "/ml/test-inference", icon: TestTube, minRole: ML_PLUS },
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
];

function hasAccess(allowedRoles: UserRole[] | undefined, userRole: UserRole): boolean {
  if (!allowedRoles) return true;
  return allowedRoles.includes(userRole);
}

export default function Sidebar({ role, collapsed = false }: SidebarProps) {
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
        {NAV_SECTIONS.filter((s) => hasAccess(s.minRole, role)).map((section) => (
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
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
