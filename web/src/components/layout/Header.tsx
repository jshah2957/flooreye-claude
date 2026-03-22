import { Bell, LogOut, User as UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "@/components/NotificationProvider";
import type { User } from "@/types";
import { UI_LIMITS } from "@/constants";

interface HeaderProps {
  user: User;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  const navigate = useNavigate();
  const { unreadCount, clearUnread } = useNotifications();

  const handleBellClick = () => {
    clearUnread();
    navigate("/incidents");
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-[#E7E5E0] bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        {/* Notification bell */}
        <button
          onClick={handleBellClick}
          className="relative flex items-center justify-center rounded-md p-2 text-[#78716C] hover:bg-[#F1F0ED] hover:text-[#1C1917]"
          aria-label="Notifications"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > UI_LIMITS.BADGE_MAX_DISPLAY ? `${UI_LIMITS.BADGE_MAX_DISPLAY}+` : unreadCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 text-sm">
          <UserIcon size={16} className="text-[#78716C]" />
          <span className="font-medium text-[#1C1917]">{user.name}</span>
          <span className="rounded bg-[#F1F0ED] px-2 py-0.5 text-xs text-[#78716C]">
            {user.role.replace("_", " ")}
          </span>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[#78716C] hover:bg-[#F1F0ED] hover:text-[#1C1917]"
          aria-label="Logout"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
}
