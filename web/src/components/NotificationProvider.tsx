import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";

interface NotificationContextValue {
  unreadCount: number;
  clearUnread: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#DC2626",
  high: "#EA580C",
  medium: "#D97706",
  low: "#2563EB",
};

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;

  // Clear unread when user navigates to /incidents
  useEffect(() => {
    if (location.pathname.startsWith("/incidents")) {
      setUnreadCount(0);
    }
  }, [location.pathname]);

  const handleMessage = useCallback(
    (data: unknown) => {
      const msg = data as {
        type?: string;
        event?: string;
        payload?: {
          severity?: string;
          title?: string;
          camera_name?: string;
          id?: string;
        };
      };

      const eventType = msg.type || msg.event;

      if (eventType === "incident_created" && msg.payload) {
        // Increment unread unless user is already on /incidents
        if (!locationRef.current.pathname.startsWith("/incidents")) {
          setUnreadCount((prev) => prev + 1);
        }

        const severity = msg.payload.severity || "medium";
        const title =
          msg.payload.title || "New incident detected";
        const camera = msg.payload.camera_name || "";
        const label = camera ? `${title} — ${camera}` : title;

        // Fire a toast with the severity as type mapping
        const toastType =
          severity === "critical" || severity === "high" ? "error" : "warning";
        toast(toastType, label);
      }

      if (eventType === "incident_updated") {
        // No specific UI action needed beyond the WebSocket triggering
        // TanStack Query cache invalidation elsewhere
      }
    },
    [toast],
  );

  // Only connect when authenticated
  useWebSocket({
    url: "/ws/incidents",
    onMessage: handleMessage,
    autoConnect: isAuthenticated,
  });

  const clearUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return (
    <NotificationContext.Provider value={{ unreadCount, clearUnread }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within NotificationProvider",
    );
  }
  return ctx;
}
