import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
  Maximize2,
} from "lucide-react";

import api from "@/lib/api";
import type {
  Store,
  Camera as CameraType,
  PaginatedResponse,
} from "@/types";

const MODE_COLORS: Record<string, string> = {
  cloud: "bg-[#DBEAFE] text-[#2563EB]",
  edge: "bg-[#F3E8FF] text-[#7C3AED]",
  hybrid: "bg-[#CCFBF1] text-[#0D9488]",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-[#DCFCE7] text-[#16A34A]",
  online: "bg-[#DCFCE7] text-[#16A34A]",
  testing: "bg-[#FEF3C7] text-[#D97706]",
  offline: "bg-[#FEE2E2] text-[#DC2626]",
};

function CameraCell({ camera }: { camera: CameraType }) {
  const [frameData, setFrameData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Poll for live frame every 2 seconds
  useEffect(() => {
    if (camera.status !== "active" && camera.status !== "online") return;

    let cancelled = false;
    setLoading(true);

    const poll = async () => {
      try {
        const res = await api.get(`/live/stream/${camera.id}/frame`);
        if (!cancelled && res.data?.data?.frame_base64) {
          setFrameData(res.data.data.frame_base64);
        }
      } catch {
        // Camera may not be streaming
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    poll();
    const interval = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [camera.id, camera.status]);

  const isOnline = camera.status === "active" || camera.status === "online";

  return (
    <div className="overflow-hidden rounded-lg border border-[#E7E5E0] bg-white transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E7E5E0] px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Camera size={14} className="shrink-0 text-[#78716C]" />
          <span className="truncate text-sm font-medium text-[#1C1917]">
            {camera.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[camera.status] ?? STATUS_COLORS.offline}`}
          >
            {camera.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Frame */}
      <div className="relative aspect-video w-full bg-[#1C1917]">
        {!isOnline ? (
          <div className="flex h-full flex-col items-center justify-center gap-1">
            <WifiOff size={20} className="text-[#78716C]" />
            <p className="text-[10px] text-[#78716C]">Camera offline</p>
          </div>
        ) : loading && !frameData ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={20} className="animate-spin text-[#0D9488]" />
          </div>
        ) : frameData ? (
          <img
            src={`data:image/jpeg;base64,${frameData}`}
            alt={`Live feed from ${camera.name}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1">
            <Camera size={20} className="text-[#78716C]" />
            <p className="text-[10px] text-[#78716C]">No frame available</p>
          </div>
        )}

        {/* Live indicator */}
        {isOnline && frameData && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#DC2626]" />
            <span className="text-[9px] font-medium text-white">LIVE</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${MODE_COLORS[camera.inference_mode ?? "cloud"]}`}
        >
          {(camera.inference_mode ?? "cloud").toUpperCase()}
        </span>
        <Link
          to={`/cameras/${camera.id}`}
          className="flex items-center gap-1 text-[10px] text-[#0D9488] hover:underline"
        >
          <Maximize2 size={10} /> Detail
        </Link>
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  // Fetch stores
  const { data: storesData, isLoading: storesLoading } = useQuery({
    queryKey: ["monitoring-stores"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", {
        params: { limit: 100 },
      });
      return res.data;
    },
    refetchInterval: 30000,
  });

  // Fetch cameras
  const { data: camerasData, isLoading: camerasLoading } = useQuery({
    queryKey: ["monitoring-cameras"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<CameraType>>("/cameras", {
        params: { limit: 200 },
      });
      return res.data;
    },
    refetchInterval: 30000,
  });

  const stores = storesData?.data ?? [];
  const cameras = camerasData?.data ?? [];

  const filteredCameras = useMemo(
    () =>
      selectedStoreId
        ? cameras.filter((c) => c.store_id === selectedStoreId)
        : cameras,
    [cameras, selectedStoreId]
  );

  const onlineCount = filteredCameras.filter(
    (c) => c.status === "active" || c.status === "online"
  ).length;

  const isLoading = storesLoading || camerasLoading;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">
            Live Monitoring
          </h1>
          <p className="mt-1 text-sm text-[#78716C]">
            Multi-camera live view across all stores
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-[#78716C]">
            <Wifi size={12} />
            <span>
              {onlineCount} / {filteredCameras.length} online
            </span>
          </div>
        </div>
      </div>

      {/* Store selector */}
      <div className="mb-6 flex items-center gap-3">
        <select
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          className="rounded-md border border-[#E7E5E0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
        >
          <option value="">All Stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-[#A8A29E]">
          {filteredCameras.length} camera{filteredCameras.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Camera grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[260px] animate-pulse rounded-lg border border-[#E7E5E0] bg-gray-100"
            />
          ))}
        </div>
      ) : filteredCameras.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
          <div className="text-center">
            <Camera size={32} className="mx-auto mb-2 text-[#78716C]" />
            <p className="text-sm text-[#78716C]">
              {cameras.length === 0
                ? "No cameras configured yet"
                : "No cameras found for the selected store"}
            </p>
            {cameras.length === 0 && (
              <Link
                to="/cameras/wizard"
                className="mt-2 inline-block text-sm text-[#0D9488] hover:underline"
              >
                Add a camera
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCameras.map((camera) => (
            <CameraCell key={camera.id} camera={camera} />
          ))}
        </div>
      )}
    </div>
  );
}
