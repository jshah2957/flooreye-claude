import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  Wifi,
  Eye,
  EyeOff,
  RefreshCw,
  Camera as CamIcon,
} from "lucide-react";

import api from "@/lib/api";
import type { Camera } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import RoiCanvas from "@/components/roi/RoiCanvas";

interface ROIData {
  id: string;
  camera_id: string;
  version: number;
  polygon_points: { x: number; y: number }[];
  mask_outside: boolean;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

interface DryRefFrame {
  frame_base64: string;
  brightness_score: number;
  reflection_score: number;
  captured_at: string;
}

interface DryRefData {
  id: string;
  camera_id: string;
  version: number;
  frames: DryRefFrame[];
  is_active: boolean;
  created_by: string;
  created_at: string;
}

const TABS = [
  "Overview",
  "Live Feed",
  "Detection History",
  "ROI",
  "Dry Reference",
  "Inference Config",
  "Detection Overrides",
  "Audit Log",
] as const;
type Tab = (typeof TABS)[number];

export default function CameraDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [showUrl, setShowUrl] = useState(false);

  const { data: camera, isLoading } = useQuery({
    queryKey: ["camera", id],
    queryFn: async () => {
      const res = await api.get<{ data: Camera }>(`/cameras/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const { data: roi } = useQuery({
    queryKey: ["camera-roi", id],
    queryFn: async () => {
      const res = await api.get<{ data: ROIData | null }>(`/cameras/${id}/roi`);
      return res.data.data;
    },
    enabled: !!id && activeTab === "ROI",
  });

  const { data: dryRef } = useQuery({
    queryKey: ["camera-dry-ref", id],
    queryFn: async () => {
      const res = await api.get<{ data: DryRefData | null }>(`/cameras/${id}/dry-reference`);
      return res.data.data;
    },
    enabled: !!id && activeTab === "Dry Reference",
  });

  const testMutation = useMutation({
    mutationFn: () => api.post(`/cameras/${id}/test`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["camera", id] });
    },
  });

  const captureDryRefMutation = useMutation({
    mutationFn: () => api.post(`/cameras/${id}/dry-reference`, null, { params: { num_frames: 5 } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["camera-dry-ref", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#0D9488]" />
      </div>
    );
  }

  if (!camera) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[#78716C]">
        Camera not found
      </div>
    );
  }

  function maskUrl(url: string) {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.hostname}:****/****`;
    } catch {
      return "****";
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/cameras" className="mb-2 inline-flex items-center gap-1 text-sm text-[#78716C] hover:text-[#0D9488]">
          <ArrowLeft size={14} /> Back to Cameras
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#1C1917]">{camera.name}</h1>
            <p className="text-sm text-[#78716C]">
              {camera.stream_type.toUpperCase()} &middot; {camera.floor_type} &middot; {camera.resolution ?? "Unknown"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={camera.status} />
            <StatusBadge status={camera.inference_mode} />
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="flex items-center gap-2 rounded-md border border-[#E7E5E0] px-3 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED] disabled:opacity-50"
            >
              {testMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Wifi size={14} />
              )}
              Test
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[#E7E5E0]">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-[#0D9488] text-[#0D9488]"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === "Overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Snapshot */}
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
            {camera.snapshot_base64 ? (
              <img
                src={`data:image/jpeg;base64,${camera.snapshot_base64}`}
                alt="Camera snapshot"
                className="w-full rounded"
              />
            ) : (
              <div className="flex h-[300px] items-center justify-center rounded bg-gray-100 text-sm text-[#78716C]">
                No snapshot available — run a connection test
              </div>
            )}
          </div>

          {/* Config details */}
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
            <h3 className="mb-4 text-base font-semibold text-[#1C1917]">Configuration</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#78716C]">Stream URL</dt>
                <dd className="flex items-center gap-2 text-[#1C1917]">
                  {showUrl ? camera.stream_url : maskUrl(camera.stream_url)}
                  <button onClick={() => setShowUrl(!showUrl)} className="text-[#78716C] hover:text-[#1C1917]">
                    {showUrl ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#78716C]">Stream Type</dt>
                <dd className="text-[#1C1917]">{camera.stream_type.toUpperCase()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#78716C]">Resolution</dt>
                <dd className="text-[#1C1917]">{camera.resolution ?? "Unknown"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#78716C]">FPS Config</dt>
                <dd className="text-[#1C1917]">{camera.fps_config}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#78716C]">Floor Type</dt>
                <dd className="text-[#1C1917] capitalize">{camera.floor_type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#78716C]">Min Wet Area</dt>
                <dd className="text-[#1C1917]">{camera.min_wet_area_percent}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#78716C]">Detection</dt>
                <dd>
                  {camera.detection_enabled ? (
                    <span className="text-[#16A34A]">Enabled</span>
                  ) : (
                    <span className="text-[#78716C]">Disabled</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#78716C]">Inference Mode</dt>
                <dd><StatusBadge status={camera.inference_mode} /></dd>
              </div>
              {camera.hybrid_threshold && camera.inference_mode === "hybrid" && (
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Escalation Threshold</dt>
                  <dd className="text-[#1C1917]">{camera.hybrid_threshold}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[#78716C]">Last Seen</dt>
                <dd className="text-[#1C1917]">
                  {camera.last_seen ? new Date(camera.last_seen).toLocaleString() : "Never"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#78716C]">Created</dt>
                <dd className="text-[#1C1917]">{new Date(camera.created_at).toLocaleString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* ROI Tab */}
      {activeTab === "ROI" && (
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1C1917]">Region of Interest</h3>
            {roi && (
              <span className="text-xs text-[#78716C]">Version {roi.version}</span>
            )}
          </div>
          <RoiCanvas
            snapshotBase64={camera.snapshot_base64 ?? undefined}
            initialPoints={roi?.polygon_points}
            initialMaskOutside={roi?.mask_outside}
            cameraId={camera.id}
          />
        </div>
      )}

      {/* Dry Reference Tab */}
      {activeTab === "Dry Reference" && (
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-[#1C1917]">Dry Reference Frames</h3>
              {dryRef && (
                <p className="text-xs text-[#78716C]">
                  Version {dryRef.version} &middot; {dryRef.frames.length} frames &middot;
                  Captured {new Date(dryRef.created_at).toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={() => captureDryRefMutation.mutate()}
              disabled={captureDryRefMutation.isPending}
              className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
            >
              {captureDryRefMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Capture New Reference
            </button>
          </div>

          {dryRef && dryRef.frames.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dryRef.frames.map((frame, i) => (
                <div key={i} className="rounded-lg border border-[#E7E5E0] p-2">
                  <img
                    src={`data:image/jpeg;base64,${frame.frame_base64}`}
                    alt={`Dry ref ${i + 1}`}
                    className="mb-2 w-full rounded"
                  />
                  <div className="flex items-center justify-between text-xs text-[#78716C]">
                    <span>Brightness: {frame.brightness_score}</span>
                    <span>Reflection: {(frame.reflection_score * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0] text-sm text-[#78716C]">
              No dry reference captured yet
            </div>
          )}
        </div>
      )}

      {/* Placeholder tabs */}
      {["Live Feed", "Detection History", "Inference Config", "Detection Overrides", "Audit Log"].includes(activeTab) && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
          <p className="text-sm text-[#78716C]">{activeTab} — coming in a later phase</p>
        </div>
      )}
    </div>
  );
}
