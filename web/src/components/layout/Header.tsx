import { useState, useRef, useEffect } from "react";
import { Bell, LogOut, ChevronRight, Menu, Sun, Moon, User as UserIcon } from "lucide-react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useNotifications } from "@/components/NotificationProvider";
import type { User } from "@/types";
import { UI_LIMITS } from "@/constants";
import { cn } from "@/lib/utils";

interface HeaderProps {
  user: User;
  onLogout: () => void;
  onMenuToggle?: () => void;
}

/** Maps route segments to human-readable breadcrumb labels */
const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  monitoring: "Live Monitoring",
  clips: "Recorded Clips",
  compliance: "Compliance",
  detection: "Detection",
  history: "Detection History",
  incidents: "Incidents",
  dataset: "Dataset",
  models: "Model Registry",
  ml: "ML",
  "test-inference": "Test Inference",
  "roboflow-test": "Roboflow Test",
  stores: "Stores",
  cameras: "Cameras",
  devices: "Devices",
  notifications: "Notifications",
  settings: "Settings",
  storage: "Storage",
  "detection-control": "Detection Control",
  classes: "Class Manager",
  integrations: "Integrations",
  "api-manager": "API Manager",
  "api-tester": "API Tester",
  roboflow: "Roboflow",
  edge: "Edge Agents",
  admin: "Administration",
  users: "Users",
  logs: "System Logs",
  docs: "User Manual",
  "notification-center": "Notification Center",
  profile: "Profile",
  "notification-preferences": "Notification Preferences",
};

function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, idx) => {
    const path = "/" + segments.slice(0, idx + 1).join("/");
    const label = ROUTE_LABELS[seg] || seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const isLast = idx === segments.length - 1;

    return { path, label, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-sm md:flex">
      <Link to="/dashboard" className="text-[#0D9488] hover:underline">
        Home
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight size={14} className="text-gray-400" aria-hidden="true" />
          {crumb.isLast ? (
            <span className="font-semibold text-gray-900">{crumb.label}</span>
          ) : (
            <Link to={crumb.path} className="text-[#0D9488] hover:underline">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Simple page title for mobile (last breadcrumb segment) */
function MobilePageTitle() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "Dashboard";
  const label = ROUTE_LABELS[last] || last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span className="text-sm font-semibold text-gray-900 md:hidden">{label}</span>
  );
}

export default function Header({ user, onLogout, onMenuToggle }: HeaderProps) {
  const navigate = useNavigate();
  const { unreadCount, clearUnread } = useNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleBellClick = () => {
    clearUnread();
    navigate("/incidents");
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  // Close dropdown on Escape
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    if (dropdownOpen) {
      document.addEventListener("keydown", handleEsc);
    }
    return () => document.removeEventListener("keydown", handleEsc);
  }, [dropdownOpen]);

  const userInitial = user.name ? user.name.charAt(0).toUpperCase() : "U";
  const roleLabel = user.role.replace(/_/g, " ");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6">
      {/* Left: hamburger (mobile) + breadcrumbs */}
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
        )}
        <Breadcrumbs />
        <MobilePageTitle />
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notification bell */}
        <button
          onClick={handleBellClick}
          className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white" aria-hidden="true">
              {unreadCount > UI_LIMITS.BADGE_MAX_DISPLAY ? `${UI_LIMITS.BADGE_MAX_DISPLAY}+` : unreadCount}
            </span>
          )}
        </button>

        {/* User dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-md p-1.5 hover:bg-gray-100"
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
            aria-label="User menu"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0D9488] text-sm font-semibold text-white">
              {userInitial}
            </div>
            <span className="hidden text-sm font-medium text-gray-700 lg:inline">
              {user.name}
            </span>
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-2 shadow-lg"
              role="menu"
            >
              <div className="px-4 py-2">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
                <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-600">
                  {roleLabel}
                </span>
              </div>
              <div className="my-1 h-px bg-gray-200" role="separator" />
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  navigate("/profile/notification-preferences");
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                role="menuitem"
              >
                <UserIcon size={14} />
                Settings
              </button>
              <div className="my-1 h-px bg-gray-200" role="separator" />
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                role="menuitem"
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
