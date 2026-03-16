import { LogOut, User as UserIcon } from "lucide-react";
import type { User } from "@/types";

interface HeaderProps {
  user: User;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-[#E7E5E0] bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
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
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
}
