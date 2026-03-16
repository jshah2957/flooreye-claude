import { useState, useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Camera,
  Activity,
  AlertTriangle,
  CalendarDays,
  Zap,
  Loader2,
  Play,
  Square,
  CameraIcon,
  Save,
  ChevronDown,
  ChevronUp,
  Wifi,
  WifiOff,
  Server,
  HardDrive,
  Cpu,
  X,
  RefreshCw,
} from "lucide-react";

import api from "@/lib/api";
import type {
  Store,
  Camera as CameraType,
  Detection,
  Incident,
  PaginatedResponse,
} from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import { useWebSocket } from "@/hooks/useWebSocket";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const MODE_COLORS: Record<string, string> = {
  cloud: "bg-[#DBEAFE] text-[#2563EB]",
  edge: "bg-[#F3E8FF] text-[#7C3AED]",
  hybrid: "bg-[#CCFBF1] text-[#0D9488]",
};

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [realtimeDetections, setRealtimeDetections] = useState<Detection[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [frameData, setFrameData] = useState<string | null>(null);
  const [frameAge, setFrameAge] = useState(0);
  const [healthOpen, setHealthOpen] = useState(true);
  const [detailDetection, setDetailDetection] = useState<Detection | null>(
    null
  );

  // ── Data queries with 30s auto-refresh (DASH-1) ──
  const refetchInterval = 30000;

  const { data: storesData, isLoading: storesLoading } = useQuery({
    queryKey: ["dashboard-stores"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", {
        params: { limit: 100 },
      });
      return res.data;
    },
    refetchInterval,
  });

  const { data: camerasData, isLoading: camerasLoading } = useQuery({
    queryKey: ["dashboard-cameras"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<CameraType>>("/cameras", {
        params: { limit: 100 },
      });
      return res.data;
    },
    refetchInterval,
  });

  const { data: incidentsData, isLoading: incidentsLoading } = useQuery({
    queryKey: ["dashboard-incidents"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Incident>>("/events", {
        params: { status: "new", limit: 5 },
      });
      return res.data;
    },
    refetchInterval,
  });

  const { data: detectionsData, isLoading: detectionsLoading } = useQuery({
    queryKey: ["dashboard-detections"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Detection>>(
        "/detection/history",
        { params: { limit: 10 } }
      );
      return res.data;
    },
    refetchInterval,
  });

  // System health query (DASH-19 to DASH-24)
  const { data: healthData } = useQuery({
    queryKey: ["dashboard-health"],
    queryFn: async () => {
      const start = Date.now();
      const res = await api.get("/health");
      const pingMs = Date.now() - start;
      return { ...res.data, pingMs };
    },
    refetchInterval: 60000,
  });

  const { data: edgeData } = useQuery({
    queryKey: ["dashboard-edge-agents"],
    queryFn: async () => {
      const res = await api.get("/edge/agents", { params: { limit: 100 } });
      return res.data;
    },
    refetchInterval: 60000,
  });

  const { data: integrationStatus } = useQuery({
    queryKey: ["dashboard-integration-status"],
    queryFn: async () => {
      const res = await api.get("/integrations/status");
      return res.data?.data ?? [];
    },
    refetchInterval: 60000,
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

  // Derived data
  const stores = storesData?.data ?? [];
  const cameraList = camerasData?.data ?? [];
  const onlineCameras = cameraList.filter(
    (c) => c.status === "online" || c.status === "active"
  ).length;
  const cloudCount = cameraList.filter(
    (c) => c.inference_mode === "cloud"
  ).length;
  const edgeCount = cameraList.filter(
    (c) => c.inference_mode === "edge"
  ).length;
  const hybridCount = cameraList.filter(
    (c) => c.inference_mode === "hybrid"
  ).length;

  const filteredCameras = useMemo(
    () =>
      selectedStoreId
        ? cameraList.filter((c) => c.store_id === selectedStoreId)
        : cameraList,
    [cameraList, selectedStoreId]
  );

  const selectedCamera = cameraList.find((c) => c.id === selectedCameraId);

  const activeIncidents = incidentsData?.data ?? [];
  const detectionsFeed =
    realtimeDetections.length > 0
      ? realtimeDetections
      : (detectionsData?.data ?? []);

  const edgeAgents = edgeData?.data ?? [];
  const onlineAgents = edgeAgents.filter(
    (a: Record<string, string>) => a.status === "online"
  ).length;

  const roboflowStatus = (integrationStatus as Record<string, string>[])?.find(
    (s: Record<string, string>) => s.service === "roboflow"
  );

  // Live frame polling (DASH-9)
  useEffect(() => {
    if (!streaming || !selectedCameraId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.get(
          `/live/stream/${selectedCameraId}/frame`
        );
        if (!cancelled && res.data?.data?.frame_base64) {
          setFrameData(res.data.data.frame_base64);
          setFrameAge(0);
        }
      } catch {
        /* camera may be offline */
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    const ageInterval = setInterval(
      () => setFrameAge((a) => a + 1),
      1000
    );
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(ageInterval);
    };
  }, [streaming, selectedCameraId]);

  // ── Loading skeletons (DASH-2) ──
  const isLoading =
    storesLoading || camerasLoading || incidentsLoading || detectionsLoading;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1C1917]">Dashboard</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => queryClient.invalidateQueries()}
            className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-2 py-1 text-xs text-[#78716C] hover:bg-[#F1F0ED]"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <div className="flex items-center gap-2 text-xs text-[#78716C]">
            <span
              className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-[#16A34A]" : "bg-[#DC2626]"}`}
            />
            {connected ? "Live" : "Connecting..."}
          </div>
        </div>
      </div>

      {/* Stats Row (DASH-1 to DASH-4) */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[76px] animate-pulse rounded-lg border border-[#E7E5E0] bg-gray-100"
            />
          ))
        ) : (
          <>
            <StatCard
              icon={Building2}
              label="Total Stores"
              value={storesData?.meta?.total ?? 0}
              color="info"
            />
            <StatCard
              icon={Camera}
              label="Total Cameras"
              value={camerasData?.meta?.total ?? 0}
              color="info"
            />
            <StatCard
              icon={Activity}
              label="Online Cameras"
              value={`${onlineCameras} / ${cameraList.length}`}
              color="success"
            />
            <StatCard
              icon={AlertTriangle}
              label="Active Incidents"
              value={incidentsData?.meta?.total ?? 0}
              color="danger"
            />
            <StatCard
              icon={CalendarDays}
              label="Events Today"
              value={detectionsData?.meta?.total ?? 0}
              color="warning"
            />
            <StatCard
              icon={Zap}
              label="Inference Modes"
              value={`C${cloudCount} E${edgeCount} H${hybridCount}`}
              color="brand"
            />
          </>
        )}
      </div>

      {/* Main Content — 60/40 split */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left Column: Live Monitoring (DASH-5 to DASH-11) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-[#1C1917]">
              Live Monitoring
            </h2>

            {/* Store + Camera Selectors (DASH-5, DASH-6) */}
            <div className="mb-3 grid grid-cols-2 gap-3">
              <select
                value={selectedStoreId}
                onChange={(e) => {
                  setSelectedStoreId(e.target.value);
                  setSelectedCameraId("");
                  setStreaming(false);
                  setFrameData(null);
                }}
                className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
              >
                <option value="">All Stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedCameraId}
                onChange={(e) => {
                  setSelectedCameraId(e.target.value);
                  setStreaming(false);
                  setFrameData(null);
                }}
                className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
              >
                <option value="">Select Camera</option>
                {filteredCameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.status === "active" || c.status === "online"
                      ? "\u{1F7E2}"
                      : "\u{1F534}"}{" "}
                    {c.name} [{c.inference_mode?.toUpperCase()}]
                  </option>
                ))}
              </select>
            </div>

            {/* Inference mode pill + model label (DASH-7, DASH-8) */}
            {selectedCamera && (
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${MODE_COLORS[selectedCamera.inference_mode ?? "cloud"]}`}
                >
                  {(selectedCamera.inference_mode ?? "cloud").toUpperCase()}
                </span>
                <span className="text-xs text-[#78716C]">
                  {selectedCamera.inference_mode === "edge"
                    ? "Student Model"
                    : "Roboflow"}
                </span>
              </div>
            )}

            {/* Live Frame Viewer (DASH-9) */}
            <div className="relative mb-3 flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-[#1C1917]">
              {!selectedCameraId ? (
                <p className="text-sm text-[#78716C]">
                  Select a camera to view live feed
                </p>
              ) : !streaming ? (
                <div className="text-center">
                  <CameraIcon size={32} className="mx-auto mb-2 text-[#78716C]" />
                  <p className="text-sm text-[#78716C]">
                    Press Start to begin streaming
                  </p>
                </div>
              ) : frameData ? (
                <>
                  <img
                    src={`data:image/jpeg;base64,${frameData}`}
                    alt="Live frame"
                    className="h-full w-full object-contain"
                  />
                  {/* Updated indicator */}
                  <div className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">
                    Updated {frameAge}s ago
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <Loader2
                    size={24}
                    className="mx-auto animate-spin text-[#0D9488]"
                  />
                  <p className="mt-2 text-xs text-[#78716C]">
                    Connecting to stream...
                  </p>
                </div>
              )}
            </div>

            {/* Stream Controls (DASH-10) */}
            <div className="mb-2 flex items-center gap-2">
              <button
                disabled={!selectedCameraId}
                onClick={() => setStreaming(!streaming)}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white ${
                  streaming
                    ? "bg-[#DC2626] hover:bg-[#B91C1C]"
                    : "bg-[#0D9488] hover:bg-[#0F766E]"
                } disabled:opacity-50`}
              >
                {streaming ? (
                  <>
                    <Square size={12} /> Stop
                  </>
                ) : (
                  <>
                    <Play size={12} /> Start Stream
                  </>
                )}
              </button>
              <button
                disabled={!streaming}
                onClick={async () => {
                  if (!selectedCameraId) return;
                  try {
                    await api.post(`/dataset/frames`, {
                      camera_id: selectedCameraId,
                      frame_base64: frameData,
                      label_source: "manual",
                    });
                  } catch {
                    /* ignore */
                  }
                }}
                className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-3 py-1.5 text-xs text-[#1C1917] hover:bg-[#F1F0ED] disabled:opacity-50"
              >
                <Save size={12} /> Snapshot
              </button>
            </div>

            {/* Stream quality badges (DASH-11) */}
            {selectedCamera && streaming && (
              <div className="flex items-center gap-2 text-[10px] text-[#78716C]">
                <span className="rounded bg-[#F1F0ED] px-1.5 py-0.5">
1920x1080
                </span>
                <span className="rounded bg-[#F1F0ED] px-1.5 py-0.5">
                  2 FPS
                </span>
                <span className="rounded bg-[#F1F0ED] px-1.5 py-0.5">
                  ~{healthData?.pingMs ?? "?"}ms
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (40%) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recent Detections (DASH-12 to DASH-16) */}
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1C1917]">
                Recent Detections
              </h3>
              <Link
                to="/detection/history"
                className="text-xs text-[#0D9488] hover:underline"
              >
                View All
              </Link>
            </div>
            {detectionsFeed.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#78716C]">
                No recent detections
              </p>
            ) : (
              <div className="space-y-2">
                {detectionsFeed.slice(0, 10).map((d) => (
                  <div
                    key={d.id}
                    onClick={() => setDetailDetection(d)}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-[#E7E5E0] p-2 hover:border-[#0D9488]"
                  >
                    {d.frame_base64 ? (
                      <img
                        src={`data:image/jpeg;base64,${d.frame_base64}`}
                        alt="Detection"
                        className="h-[80px] w-[120px] rounded object-cover bg-gray-100"
                      />
                    ) : (
                      <div className="flex h-[80px] w-[120px] items-center justify-center rounded bg-gray-100 text-[8px] text-[#78716C]">
                        No frame
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${d.is_wet ? "bg-[#FEE2E2] text-[#DC2626]" : "bg-[#DCFCE7] text-[#16A34A]"}`}
                        >
                          {d.is_wet ? "WET" : "DRY"}
                        </span>
                        <span className="text-xs font-medium text-[#1C1917]">
                          {(d.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-[#78716C]">
                        {d.camera_id?.substring(0, 8)}...
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={`rounded px-1 py-0.5 text-[8px] font-semibold ${MODE_COLORS[d.model_source ?? "roboflow"] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {(d.model_source ?? "roboflow").toUpperCase()}
                        </span>
                        <span className="text-[10px] text-[#A8A29E]">
                          {d.timestamp ? timeAgo(d.timestamp) : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Incidents (DASH-17, DASH-18) */}
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1C1917]">
                Active Incidents
              </h3>
              <Link
                to="/incidents"
                className="text-xs text-[#0D9488] hover:underline"
              >
                View All
              </Link>
            </div>
            {activeIncidents.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#78716C]">
                No active incidents
              </p>
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
                        inc.severity === "critical" || inc.severity === "high"
                          ? "bg-[#DC2626]"
                          : "bg-[#D97706]"
                      }`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={inc.severity} size="sm" />
                        <StatusBadge status={inc.status} size="sm" />
                      </div>
                      <p className="mt-0.5 text-[10px] text-[#78716C]">
                        {inc.camera_id?.substring(0, 8)}... &middot;{" "}
                        {inc.detection_count} detections &middot;{" "}
                        {inc.start_time ? timeAgo(inc.start_time) : ""}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* System Health Panel (DASH-19 to DASH-25) */}
          <div className="rounded-lg border border-[#E7E5E0] bg-white">
            <button
              onClick={() => setHealthOpen(!healthOpen)}
              className="flex w-full items-center justify-between p-4"
            >
              <h3 className="text-sm font-semibold text-[#1C1917]">
                System Health
              </h3>
              {healthOpen ? (
                <ChevronUp size={14} className="text-[#78716C]" />
              ) : (
                <ChevronDown size={14} className="text-[#78716C]" />
              )}
            </button>
            {healthOpen && (
              <div className="space-y-2 border-t border-[#E7E5E0] px-4 pb-4 pt-3">
                {/* Backend */}
                <HealthRow
                  icon={Server}
                  label="Cloud Backend"
                  status={healthData ? "Connected" : "Unknown"}
                  ok={!!healthData}
                  detail={
                    healthData ? `${healthData.pingMs}ms` : ""
                  }
                />
                {/* Roboflow */}
                <HealthRow
                  icon={Cpu}
                  label="Roboflow API"
                  status={
                    roboflowStatus?.status === "connected"
                      ? "Active"
                      : "Not configured"
                  }
                  ok={roboflowStatus?.status === "connected"}
                />
                {/* Edge Agents */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Wifi size={12} className="text-[#78716C]" />
                    <span className="text-[#1C1917]">Edge Agents</span>
                  </div>
                  <Link
                    to="/edge"
                    className="text-[#0D9488] hover:underline"
                  >
                    {onlineAgents} / {edgeAgents.length}
                  </Link>
                </div>
                {/* Storage */}
                <HealthRow
                  icon={HardDrive}
                  label="Storage"
                  status="Local"
                  ok={true}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detection Detail Modal (DASH-15) */}
      {detailDetection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1C1917]">
                Detection Detail
              </h3>
              <button
                onClick={() => setDetailDetection(null)}
                className="text-[#78716C] hover:text-[#1C1917]"
              >
                <X size={18} />
              </button>
            </div>
            {detailDetection.frame_base64 && (
              <img
                src={`data:image/jpeg;base64,${detailDetection.frame_base64}`}
                alt="Detection"
                className="mb-4 w-full rounded-lg"
              />
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[#78716C]">Status</p>
                <p className="font-medium">
                  {detailDetection.is_wet ? "WET" : "DRY"}
                </p>
              </div>
              <div>
                <p className="text-[#78716C]">Confidence</p>
                <p className="font-medium">
                  {(detailDetection.confidence * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[#78716C]">Model</p>
                <p className="font-medium">
                  {(detailDetection.model_source ?? "roboflow").toUpperCase()}
                </p>
              </div>
              <div>
                <p className="text-[#78716C]">Inference</p>
                <p className="font-medium">
                  {detailDetection.inference_time_ms?.toFixed(0) ?? "?"}ms
                </p>
              </div>
              <div>
                <p className="text-[#78716C]">Wet Area</p>
                <p className="font-medium">
                  {(detailDetection.wet_area_percent ?? 0).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[#78716C]">Time</p>
                <p className="font-medium">
                  {detailDetection.timestamp
                    ? new Date(detailDetection.timestamp).toLocaleString()
                    : "?"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
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

function HealthRow({
  icon: Icon,
  label,
  status,
  ok,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  status: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <Icon size={12} className="text-[#78716C]" />
        <span className="text-[#1C1917]">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={ok ? "text-[#16A34A]" : "text-[#DC2626]"}>
          {ok ? "\u2705" : "\u274C"} {status}
        </span>
        {detail && <span className="text-[#A8A29E]">{detail}</span>}
      </div>
    </div>
  );
}
