import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Camera,
  Activity,
  AlertTriangle,
  CalendarDays,
  Zap,
  Loader2,
} from "lucide-react";

import api from "@/lib/api";
import type { Store, Camera as CameraType, Detection, Incident, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function DashboardPage() {
  const [realtimeDetections, setRealtimeDetections] = useState<Detection[]>([]);

  // Stats queries
  const { data: stores, isLoading: storesLoading } = useQuery({
    queryKey: ["stores-count"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", { params: { limit: 1 } });
      return res.data;
    },
  });

  const { data: cameras, isLoading: camerasLoading } = useQuery({
    queryKey: ["cameras-all"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<CameraType>>("/cameras", { params: { limit: 100 } });
      return res.data;
    },
  });

  const { data: incidents, isLoading: incidentsLoading } = useQuery({
    queryKey: ["incidents-active"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Incident>>("/events", {
        params: { status: "new", limit: 5 },
      });
      return res.data;
    },
  });

  const { data: recentDetections, isLoading: detectionsLoading } = useQuery({
    queryKey: ["detections-recent"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Detection>>("/detection/history", {
        params: { limit: 10, is_wet: true },
      });
      return res.data;
    },
  });

  // WebSocket for live detections
  const onWsMessage = useCallback((msg: unknown) => {
    const data = msg as { type: string; data: Detection };
    if (data.type === "detection") {
      setRealtimeDetections((prev) => [data.data, ...prev].slice(0, 10));
    }
  }, []);

  const { connected } = useWebSocket({
    url: "/ws/live-detections",
    onMessage: onWsMessage,
  });

  const cameraList = cameras?.data ?? [];
  const onlineCameras = cameraList.filter((c) => c.status === "online" || c.status === "active").length;
  const cloudCount = cameraList.filter((c) => c.inference_mode === "cloud").length;
  const edgeCount = cameraList.filter((c) => c.inference_mode === "edge").length;
  const hybridCount = cameraList.filter((c) => c.inference_mode === "hybrid").length;

  const activeIncidents = incidents?.data ?? [];
  const detectionsFeed = realtimeDetections.length > 0
    ? realtimeDetections
    : (recentDetections?.data ?? []);

  if (storesLoading || camerasLoading || incidentsLoading || detectionsLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1C1917]">Dashboard</h1>
        <div className="flex items-center gap-2 text-xs text-[#78716C]">
          <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-[#16A34A]" : "bg-[#DC2626]"}`} />
          {connected ? "Live" : "Connecting..."}
        </div>
      </div>

      {/* Stats Row */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Building2} label="Total Stores" value={stores?.meta?.total ?? 0} color="info" />
        <StatCard icon={Camera} label="Total Cameras" value={cameras?.meta?.total ?? 0} color="info" />
        <StatCard icon={Activity} label="Online Cameras" value={`${onlineCameras} / ${cameraList.length}`} color="success" />
        <StatCard icon={AlertTriangle} label="Active Incidents" value={incidents?.meta?.total ?? 0} color="danger" />
        <StatCard icon={CalendarDays} label="Events Today" value={recentDetections?.meta?.total ?? 0} color="warning" />
        <StatCard icon={Zap} label="Inference Modes" value={`C${cloudCount} E${edgeCount} H${hybridCount}`} color="brand" />
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Live Monitoring */}
        <div className="lg:col-span-3 space-y-6">
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
            <h2 className="mb-4 text-base font-semibold text-[#1C1917]">Live Monitoring</h2>
            <p className="text-sm text-[#78716C]">
              Select a camera from the <Link to="/cameras" className="text-[#0D9488] hover:underline">Cameras page</Link> to view live feed, or use the{" "}
              <Link to="/monitoring" className="text-[#0D9488] hover:underline">Live Monitoring</Link> page.
            </p>
          </div>
        </div>

        {/* Right: Feeds */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Detections */}
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1C1917]">Recent Detections</h3>
              <Link to="/detection/history" className="text-xs text-[#0D9488] hover:underline">View All</Link>
            </div>
            {detectionsFeed.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#78716C]">No recent detections</p>
            ) : (
              <div className="space-y-2">
                {detectionsFeed.slice(0, 10).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 rounded-md border border-[#E7E5E0] p-2"
                  >
                    {d.frame_base64 ? (
                      <img
                        src={`data:image/jpeg;base64,${d.frame_base64}`}
                        alt="Detection"
                        className="h-[50px] w-[80px] rounded object-cover bg-gray-100"
                      />
                    ) : (
                      <div className="flex h-[50px] w-[80px] items-center justify-center rounded bg-gray-100 text-[8px] text-[#78716C]">
                        No frame
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={d.is_wet ? "critical" : "online"} size="sm" />
                        <span className="text-xs font-medium text-[#1C1917]">
                          {(d.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-[#78716C]">
                        {d.model_source.toUpperCase()} &middot; {new Date(d.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Incidents */}
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1C1917]">Active Incidents</h3>
              <Link to="/incidents" className="text-xs text-[#0D9488] hover:underline">View All</Link>
            </div>
            {activeIncidents.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#78716C]">No active incidents</p>
            ) : (
              <div className="space-y-2">
                {activeIncidents.map((inc) => (
                  <Link
                    key={inc.id}
                    to={`/incidents/${inc.id}`}
                    className="flex items-center gap-3 rounded-md border border-[#E7E5E0] p-2 hover:border-[#0D9488]"
                  >
                    <div
                      className={`h-10 w-1 rounded-full ${
                        inc.severity === "critical"
                          ? "bg-[#DC2626]"
                          : inc.severity === "high"
                            ? "bg-[#DC2626]"
                            : inc.severity === "medium"
                              ? "bg-[#D97706]"
                              : "bg-[#D97706]"
                      }`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={inc.severity} size="sm" />
                        <StatusBadge status={inc.status} size="sm" />
                      </div>
                      <p className="mt-0.5 text-[10px] text-[#78716C]">
                        {inc.detection_count} detections &middot;{" "}
                        {new Date(inc.start_time).toLocaleTimeString()}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: "info" | "success" | "danger" | "warning" | "brand";
}) {
  const colors = {
    info: { bg: "bg-[#DBEAFE]", text: "text-[#2563EB]" },
    success: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]" },
    danger: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]" },
    warning: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
    brand: { bg: "bg-[#CCFBF1]", text: "text-[#0D9488]" },
  };
  const c = colors[color];

  return (
    <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${c.bg}`}>
          <Icon size={18} className={c.text} />
        </div>
        <div>
          <p className="text-xs text-[#78716C]">{label}</p>
          <p className="text-lg font-semibold text-[#1C1917]">{value}</p>
        </div>
      </div>
    </div>
  );
}
