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
  CheckCircle,
  VideoOff,
} from "lucide-react";

import api from "@/lib/api";
import { INTERVALS } from "@/constants";
import type {
  Store,
  Camera as CameraType,
  Detection,
  Incident,
  PaginatedResponse,
} from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";

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
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "org_admin" || user?.role === "ml_engineer";
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
  const refetchInterval = INTERVALS.DASHBOARD_REFRESH_MS;

  const { data: storesData, isLoading: storesLoading, isError, refetch } = useQuery({
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
    refetchInterval: INTERVALS.HEALTH_REFRESH_MS,
  });

  const { data: edgeData } = useQuery({
    queryKey: ["dashboard-edge-agents"],
    queryFn: async () => {
      const res = await api.get("/edge/agents", { params: { limit: 100 } });
      return res.data;
    },
    refetchInterval: INTERVALS.HEALTH_REFRESH_MS,
  });

  const { data: integrationStatus } = useQuery({
    queryKey: ["dashboard-integration-status"],
    queryFn: async () => {
      const res = await api.get("/integrations/status");
      return res.data?.data ?? [];
    },
    refetchInterval: INTERVALS.HEALTH_REFRESH_MS,
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

  // Camera name lookup for displaying names instead of UUIDs
  const cameraNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cam of cameraList) {
      map[cam.id] = cam.name;
    }
    return map;
  }, [cameraList]);

  const hasActiveIncidents = (incidentsData?.meta?.total ?? 0) > 0;

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
    const interval = setInterval(poll, INTERVALS.LIVE_POLL_MS);
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

  // ── Loading / Error states ──
  const isLoading =
    storesLoading || camerasLoading || incidentsLoading || detectionsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-7 w-32 animate-pulse rounded-lg bg-gray-200" />
          <div className="flex items-center gap-3">
            <div className="h-7 w-20 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-4 w-16 animate-pulse rounded-lg bg-gray-200" />
          </div>
        </div>
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
        {/* Main content skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 h-96 animate-pulse rounded-xl bg-gray-200" />
          <div className="lg:col-span-2 space-y-4">
            <div className="h-64 animate-pulse rounded-xl bg-gray-200" />
            <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="h-12 w-12 text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900">Failed to load dashboard</h3>
        <p className="text-sm text-gray-500 mt-1">Please check your connection and try again.</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1C1917]">Dashboard</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => queryClient.invalidateQueries()}
            className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] px-3 py-1.5 text-xs font-medium text-[#78716C] hover:bg-[#F1F0ED] transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <div className="flex items-center gap-2 text-xs text-[#78716C]">
            <span
              className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-[#16A34A] animate-pulse" : "bg-[#DC2626]"}`}
            />
            {connected ? "Live" : "Connecting..."}
          </div>
        </div>
      </div>

      {/* Status Banner for store owners */}
      {!isAdmin && (
        <div className={`rounded-xl p-6 text-center ${
          hasActiveIncidents
            ? "bg-[#FEE2E2] border-2 border-[#DC2626]"
            : "bg-[#DCFCE7] border-2 border-[#16A34A]"
        }`}>
          <p className={`text-3xl font-bold ${hasActiveIncidents ? "text-[#DC2626]" : "text-[#16A34A]"}`}>
            {hasActiveIncidents ? "ALERT" : "ALL CLEAR"}
          </p>
          <p className="mt-1 text-sm text-[#78716C]">
            {hasActiveIncidents
              ? `${incidentsData?.meta?.total} active wet floor alert(s)`
              : "No wet floor alerts across your stores"}
          </p>
        </div>
      )}

      {/* Stats Row */}
      <div className={`grid gap-4 ${isAdmin ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" : "grid-cols-2 md:grid-cols-3"}`}>
        {isAdmin ? (
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
        ) : (
          <>
            <StatCard
              icon={Building2}
              label="My Stores"
              value={storesData?.meta?.total ?? 0}
              color="info"
            />
            <StatCard
              icon={AlertTriangle}
              label="Active Alerts"
              value={incidentsData?.meta?.total ?? 0}
              color={(incidentsData?.meta?.total ?? 0) > 0 ? "danger" : "success"}
            />
            <StatCard
              icon={Camera}
              label="Cameras Online"
              value={`${onlineCameras} / ${cameraList.length}`}
              color="success"
            />
          </>
        )}
      </div>

      {/* Main Content — 60/40 split */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-5">
        {/* Left Column: Live Monitoring */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-xl border border-[#E7E5E0] bg-white shadow-sm overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between border-b border-[#E7E5E0] px-5 py-3">
              <h2 className="text-sm font-semibold text-[#1C1917]">Live Monitoring</h2>
              {selectedCamera && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${MODE_COLORS[selectedCamera.inference_mode ?? "cloud"]}`}
                >
                  {(selectedCamera.inference_mode ?? "cloud").toUpperCase()}
                </span>
              )}
            </div>

            <div className="p-4 space-y-3">
              {/* Store + Camera Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={selectedStoreId}
                  onChange={(e) => {
                    setSelectedStoreId(e.target.value);
                    setSelectedCameraId("");
                    setStreaming(false);
                    setFrameData(null);
                  }}
                  className="w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-colors"
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
                  className="w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-colors"
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

              {/* Inference mode pill + model label */}
              {selectedCamera && (
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${MODE_COLORS[selectedCamera.inference_mode ?? "cloud"]}`}
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

              {/* Live Frame Viewer */}
              <div className="relative aspect-video w-full flex items-center justify-center overflow-hidden rounded-lg bg-gray-900">
                {!selectedCameraId ? (
                  <div className="text-center">
                    <VideoOff size={32} className="mx-auto mb-2 text-gray-500" />
                    <p className="text-sm text-gray-400">
                      Select a camera to view live feed
                    </p>
                  </div>
                ) : !streaming ? (
                  <div className="text-center">
                    <CameraIcon size={32} className="mx-auto mb-2 text-gray-500" />
                    <p className="text-sm text-gray-400">
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
                    <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                      Updated {frameAge}s ago
                    </div>
                    {/* Live badge */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 backdrop-blur-sm">
                      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                      <span className="text-[10px] font-medium text-white">LIVE</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <Loader2
                      size={24}
                      className="mx-auto animate-spin text-[#0D9488]"
                    />
                    <p className="mt-2 text-xs text-gray-400">
                      Connecting to stream...
                    </p>
                  </div>
                )}
              </div>

              {/* Stream Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={!selectedCameraId}
                  onClick={() => setStreaming(!streaming)}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors ${
                    streaming
                      ? "bg-[#DC2626] hover:bg-[#B91C1C]"
                      : "bg-[#0D9488] hover:bg-[#0F766E]"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
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
                  className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] px-4 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#F1F0ED] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save size={12} /> Snapshot
                </button>

                {/* Stream quality badges */}
                {selectedCamera && streaming && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-medium text-[#78716C]">
                      1920x1080
                    </span>
                    <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-medium text-[#78716C]">
                      2 FPS
                    </span>
                    <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-medium text-[#78716C]">
                      ~{healthData?.pingMs ?? "?"}ms
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recent Detections */}
          <div className="rounded-xl border border-[#E7E5E0] bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] px-5 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[#1C1917]">Recent Detections</h3>
                <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-[#78716C]">
                  {detectionsFeed.length}
                </span>
              </div>
              <Link
                to="/detection/history"
                className="text-xs font-medium text-[#0D9488] hover:underline"
              >
                View All
              </Link>
            </div>
            <div className="p-3">
              {detectionsFeed.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#78716C]">
                  No recent detections
                </p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {detectionsFeed.slice(0, 10).map((d) => (
                    <div
                      key={d.id}
                      onClick={() => setDetailDetection(d)}
                      className="min-w-[140px] flex-shrink-0 rounded-lg overflow-hidden border border-[#E7E5E0] cursor-pointer hover:ring-2 ring-[#0D9488] transition-all"
                    >
                      {(d.annotated_frame_url || d.frame_url || d.frame_base64) ? (
                        <img
                          src={d.annotated_frame_url || d.frame_url || `data:image/jpeg;base64,${d.frame_base64}`}
                          alt="Detection"
                          className="h-20 w-full object-cover bg-gray-100"
                        />
                      ) : (
                        <div className="flex h-20 w-full items-center justify-center bg-gray-100 text-[10px] text-[#78716C]">
                          No frame
                        </div>
                      )}
                      <div className="p-2 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${d.is_wet ? "bg-[#FEE2E2] text-[#DC2626]" : "bg-[#DCFCE7] text-[#16A34A]"}`}
                          >
                            {d.is_wet ? "WET" : "DRY"}
                          </span>
                          <span className="text-[10px] font-medium text-[#1C1917]">
                            {(d.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="truncate text-[10px] text-[#78716C]">
                          {cameraNames[d.camera_id] ?? d.camera_id?.substring(0, 8)}
                        </p>
                        <span className="text-[10px] text-[#A8A29E]">
                          {d.timestamp ? timeAgo(d.timestamp) : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active Incidents */}
          <div className="rounded-xl border border-[#E7E5E0] bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] px-5 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[#1C1917]">Active Incidents</h3>
                {activeIncidents.length > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                    {activeIncidents.length}
                  </span>
                )}
              </div>
              <Link
                to="/incidents"
                className="text-xs font-medium text-[#0D9488] hover:underline"
              >
                View All
              </Link>
            </div>
            <div>
              {activeIncidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle size={24} className="text-green-500 mb-2" />
                  <p className="text-xs text-[#78716C]">No active incidents</p>
                </div>
              ) : (
                <div className="divide-y divide-[#E7E5E0]">
                  {activeIncidents.map((inc) => (
                    <Link
                      key={inc.id}
                      to={`/incidents/${inc.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div
                        className={`w-[3px] self-stretch rounded-full flex-shrink-0 ${
                          inc.severity === "critical" || inc.severity === "high"
                            ? "bg-[#DC2626]"
                            : inc.severity === "medium"
                            ? "bg-[#D97706]"
                            : "bg-[#78716C]"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <StatusBadge status={inc.severity} size="sm" />
                          <StatusBadge status={inc.status} size="sm" />
                        </div>
                        <p className="truncate text-[11px] text-[#78716C]">
                          {cameraNames[inc.camera_id] ?? inc.camera_id?.substring(0, 8)} &middot;{" "}
                          {inc.detection_count} detections &middot;{" "}
                          {inc.start_time ? timeAgo(inc.start_time) : ""}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* System Health Panel — admin only */}
          {isAdmin && (
            <div className="rounded-xl border border-[#E7E5E0] bg-white shadow-sm overflow-hidden">
              <button
                onClick={() => setHealthOpen(!healthOpen)}
                className="flex w-full items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
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
                <div className="space-y-3 border-t border-[#E7E5E0] px-5 pb-4 pt-3">
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
          )}
        </div>
      </div>

      {/* Detection Detail Modal */}
      {detailDetection && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setDetailDetection(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1C1917]">
                Detection Detail
              </h3>
              <button
                onClick={() => setDetailDetection(null)}
                className="rounded-lg p-1 text-[#78716C] hover:text-[#1C1917] hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            {(detailDetection.annotated_frame_url || detailDetection.frame_url || detailDetection.frame_base64) && (
              <img
                src={detailDetection.annotated_frame_url || detailDetection.frame_url || `data:image/jpeg;base64,${detailDetection.frame_base64}`}
                alt="Detection"
                className="mb-4 w-full rounded-lg"
              />
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-[#78716C]">Status</p>
                <p className="mt-0.5 font-semibold">
                  {detailDetection.is_wet ? "WET" : "DRY"}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-[#78716C]">Confidence</p>
                <p className="mt-0.5 font-semibold">
                  {(detailDetection.confidence * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-[#78716C]">Model</p>
                <p className="mt-0.5 font-semibold">
                  {(detailDetection.model_source ?? "roboflow").toUpperCase()}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-[#78716C]">Inference</p>
                <p className="mt-0.5 font-semibold">
                  {detailDetection.inference_time_ms?.toFixed(0) ?? "?"}ms
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-[#78716C]">Wet Area</p>
                <p className="mt-0.5 font-semibold">
                  {(detailDetection.wet_area_percent ?? 0).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-[#78716C]">Time</p>
                <p className="mt-0.5 font-semibold">
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
    info: { bg: "bg-[#DBEAFE]", text: "text-[#2563EB]", ring: "ring-blue-100" },
    success: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", ring: "ring-green-100" },
    danger: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", ring: "ring-red-100" },
    warning: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", ring: "ring-amber-100" },
    brand: { bg: "bg-[#CCFBF1]", text: "text-[#0D9488]", ring: "ring-teal-100" },
  };
  const c = colors[color];

  return (
    <div className="rounded-xl border border-[#E7E5E0] bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${c.bg}`}>
          <Icon size={16} className={c.text} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[#78716C] uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-[#1C1917] leading-tight">{value}</p>
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
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
        />
        <span className={ok ? "text-[#16A34A]" : "text-[#DC2626]"}>
          {status}
        </span>
        {detail && <span className="text-[#A8A29E]">{detail}</span>}
      </div>
    </div>
  );
}
