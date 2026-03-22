import { useState, useEffect, useCallback } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import type { User } from "@/types";

interface AppLayoutProps {
  user: User;
  onLogout: () => void;
}

const COLLAPSED_KEY = "flooreye-sidebar-collapsed";

function getStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export default function AppLayout({ user, onLogout }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(getStoredCollapsed);

  // Persist collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch {
      // Ignore storage errors
    }
  }, [collapsed]);

  const handleMobileClose = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const handleMenuToggle = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const handleCollapse = useCallback((value: boolean) => {
    setCollapsed(value);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F7F4]">
      {/* Sidebar */}
      <Sidebar
        role={user.role}
        userName={user.name}
        collapsed={collapsed}
        onCollapse={handleCollapse}
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          user={user}
          onLogout={onLogout}
          onMenuToggle={handleMenuToggle}
        />
        <main className="flex-1 overflow-y-auto bg-[#F8F7F4] p-6">
          <div className="mx-auto w-full max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
