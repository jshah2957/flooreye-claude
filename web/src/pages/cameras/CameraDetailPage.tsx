import { useState, useEffect, useRef } from "react";
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
  Play,
  Pause,
  Settings,
  FileText,
  ExternalLink,
} from "lucide-react";

import api from "@/lib/api";
import type { Camera } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import RoiCanvas from "@/components/roi/RoiCanvas";
import { useToast } from "@/components/ui/Toast";

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
  const { success, error: showError } = useToast();
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

  // Live Feed polling
  const [livePlaying, setLivePlaying] = useState(true);
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (activeTab !== "Live Feed" || !livePlaying || !id) {
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await api.get(`/live/stream/${id}/frame`);
        if (!cancelled && res.data?.data?.frame_base64) {
          setLiveFrame(res.data.data.frame_base64);
        }
      } catch {
        // Camera may not be streaming
      }
    };

    poll();
    liveIntervalRef.current = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
    };
  }, [id, activeTab, livePlaying]);

  // Detection History
  const { data: detectionHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["camera-detection-history", id],
    queryFn: async () => {
      const res = await api.get<{ data: any[]; meta: any }>("/detection/history", {
        params: { camera_id: id, limit: 20 },
      });
      return res.data;
    },
    enabled: !!id && activeTab === "Detection History",
  });

  // Detection Overrides (effective settings)
  const { data: effectiveSettings, isLoading: overridesLoading } = useQuery({
    queryKey: ["camera-effective-settings", id],
    queryFn: async () => {
      const res = await api.get<{ data: any }>(`/detection-control/effective/${id}`);
      return res.data.data;
    },
    enabled: !!id && activeTab === "Detection Overrides",
  });

  const testMutation = useMutation({
    mutationFn: () => api.post(`/cameras/${id}/test`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["camera", id] });
      success("Camera test successful");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Camera test failed");
    },
  });

  const captureDryRefMutation = useMutation({
    mutationFn: () => api.post(`/cameras/${id}/dry-reference`, null, { params: { num_frames: 5 } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["camera-dry-ref", id] });
      success("Dry reference captured");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to capture dry reference");
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
              {(camera.stream_type ?? 'rtsp').toUpperCase()} &middot; {camera.floor_type ?? 'tile'} &middot; {camera.resolution ?? "Unknown"}
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
                <dd className="text-[#1C1917]">{(camera.stream_type ?? 'rtsp').toUpperCase()}</dd>
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
              {camera.edge_agent_id && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-[#78716C]">Edge Config</dt>
                    <dd>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        camera.config_status === "received" ? "bg-[#DCFCE7] text-[#16A34A]" :
                        camera.config_status === "failed" ? "bg-[#FEE2E2] text-[#DC2626]" :
                        "bg-[#FEF9C3] text-[#CA8A04]"
                      }`}>
                        {camera.config_status || "waiting"}
                      </span>
                    </dd>
                  </div>
                  {camera.last_config_push_at && (
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Last Push</dt>
                      <dd className="text-[#1C1917] text-[11px]">{new Date(camera.last_config_push_at).toLocaleString()}</dd>
                    </div>
                  )}
                  {camera.last_config_ack_at && (
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Edge ACK</dt>
                      <dd className="text-[#1C1917] text-[11px]">{new Date(camera.last_config_ack_at).toLocaleString()}</dd>
                    </div>
                  )}
                  {camera.config_ack_error && (
                    <div className="flex justify-between">
                      <dt className="text-[#DC2626]">ACK Error</dt>
                      <dd className="text-[#DC2626] text-[11px]">{camera.config_ack_error}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
            {camera.edge_agent_id && (
              <button
                onClick={() => api.post(`/cameras/${camera.id}/push-config`).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["camera", id] });
                })}
                className="mt-3 flex items-center gap-1 rounded-md border border-[#0D9488] px-3 py-1.5 text-xs text-[#0D9488] hover:bg-[#F0FDFA]"
              >
                Push Config to Edge
              </button>
            )}
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

      {/* Live Feed Tab */}
      {activeTab === "Live Feed" && (
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1C1917]">Live Feed</h3>
            <button
              onClick={() => setLivePlaying(!livePlaying)}
              className="flex items-center gap-2 rounded-md border border-[#E7E5E0] px-3 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
            >
              {livePlaying ? <Pause size={14} /> : <Play size={14} />}
              {livePlaying ? "Pause" : "Play"}
            </button>
          </div>
          {liveFrame ? (
            <img
              src={`data:image/jpeg;base64,${liveFrame}`}
              alt="Live camera feed"
              className="w-full rounded"
            />
          ) : (
            <div className="flex h-[300px] items-center justify-center rounded bg-gray-100 text-sm text-[#78716C]">
              {livePlaying ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Connecting to live feed...
                </div>
              ) : (
                "No live feed available"
              )}
            </div>
          )}
          {livePlaying && liveFrame && (
            <p className="mt-2 text-xs text-[#78716C]">Refreshing every 2 seconds</p>
          )}
        </div>
      )}

      {/* Detection History Tab */}
      {activeTab === "Detection History" && (
        <div>
          {historyLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[#0D9488]" />
            </div>
          ) : !detectionHistory?.data?.length ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
              <CamIcon size={24} className="mb-2 text-[#78716C]" />
              <p className="text-sm text-[#78716C]">No detection history for this camera.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#E7E5E0]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8F7F4] text-xs font-medium text-[#78716C]">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Model Source</th>
                    <th className="px-4 py-3">Wet Area</th>
                    <th className="px-4 py-3">Inference Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E0]">
                  {detectionHistory.data.map((det: any) => (
                    <tr key={det.id} className="hover:bg-[#F8F7F4]">
                      <td className="px-4 py-3 text-[#1C1917]">
                        {new Date(det.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {det.is_wet ? (
                          <span className="inline-flex items-center rounded-full bg-[#FEE2E2] px-2 py-0.5 text-xs font-semibold text-[#DC2626]">
                            Wet
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[#DCFCE7] px-2 py-0.5 text-xs font-semibold text-[#16A34A]">
                            Dry
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#1C1917]">
                        {(det.confidence * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-[#DBEAFE] px-2 py-0.5 text-xs font-semibold text-[#2563EB]">
                          {det.model_source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#1C1917]">
                        {det.wet_area_percent != null ? `${det.wet_area_percent.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-[#78716C]">
                        {det.inference_time_ms != null ? `${det.inference_time_ms}ms` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detectionHistory.meta && (
                <div className="border-t border-[#E7E5E0] bg-[#F8F7F4] px-4 py-2 text-xs text-[#78716C]">
                  Showing {detectionHistory.data.length} of {detectionHistory.meta.total} detections
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Inference Config Tab */}
      {activeTab === "Inference Config" && camera && (
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1C1917]">Inference Configuration</h3>
            <Link
              to="/detection-control"
              className="flex items-center gap-1 text-sm font-medium text-[#0D9488] hover:text-[#0F766E]"
            >
              Detection Control Center <ExternalLink size={14} />
            </Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h4 className="mb-3 text-sm font-medium text-[#78716C]">Detection Mode</h4>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Inference Mode</dt>
                  <dd><StatusBadge status={camera.inference_mode} /></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Detection Enabled</dt>
                  <dd className="text-[#1C1917]">
                    {camera.detection_enabled ? (
                      <span className="text-[#16A34A]">Yes</span>
                    ) : (
                      <span className="text-[#78716C]">No</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">FPS Config</dt>
                  <dd className="text-[#1C1917]">{camera.fps_config}</dd>
                </div>
                {camera.inference_mode === "hybrid" && camera.hybrid_threshold && (
                  <div className="flex justify-between">
                    <dt className="text-[#78716C]">Hybrid Escalation Threshold</dt>
                    <dd className="text-[#1C1917]">{camera.hybrid_threshold}</dd>
                  </div>
                )}
              </dl>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-medium text-[#78716C]">Model & Floor Settings</h4>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Floor Type</dt>
                  <dd className="text-[#1C1917] capitalize">{camera.floor_type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Min Wet Area</dt>
                  <dd className="text-[#1C1917]">{camera.min_wet_area_percent}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Mask Outside ROI</dt>
                  <dd className="text-[#1C1917]">{camera.mask_outside_roi ? "Yes" : "No"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Student Model Version</dt>
                  <dd className="text-[#1C1917]">{camera.student_model_version ?? "None"}</dd>
                </div>
                {camera.edge_agent_id && (
                  <div className="flex justify-between">
                    <dt className="text-[#78716C]">Edge Agent</dt>
                    <dd className="truncate text-[#1C1917]">{camera.edge_agent_id}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      )}

      {/* Detection Overrides Tab */}
      {activeTab === "Detection Overrides" && (
        <div>
          {overridesLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[#0D9488]" />
            </div>
          ) : !effectiveSettings?.settings ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
              <Settings size={24} className="mb-2 text-[#78716C]" />
              <p className="text-sm text-[#78716C]">Using global defaults</p>
              <p className="mt-1 text-xs text-[#78716C]">
                No camera-level detection overrides configured. Settings are inherited from store, organization, or global defaults.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#1C1917]">Effective Detection Settings</h3>
                <Link
                  to="/detection-control"
                  className="flex items-center gap-1 text-sm font-medium text-[#0D9488] hover:text-[#0F766E]"
                >
                  Edit in Detection Control Center <ExternalLink size={14} />
                </Link>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <h4 className="mb-3 text-sm font-medium text-[#78716C]">Validation Layers</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Layer 1 (Confidence)</dt>
                      <dd className="text-[#1C1917]">
                        {effectiveSettings.settings.layer1_enabled != null
                          ? effectiveSettings.settings.layer1_enabled
                            ? `Enabled (${effectiveSettings.settings.layer1_confidence ?? "default"})`
                            : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Layer 2 (Area)</dt>
                      <dd className="text-[#1C1917]">
                        {effectiveSettings.settings.layer2_enabled != null
                          ? effectiveSettings.settings.layer2_enabled
                            ? `Enabled (${effectiveSettings.settings.layer2_min_area_percent ?? "default"}%)`
                            : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Layer 3 (Voting)</dt>
                      <dd className="text-[#1C1917]">
                        {effectiveSettings.settings.layer3_enabled != null
                          ? effectiveSettings.settings.layer3_enabled
                            ? `Enabled (${effectiveSettings.settings.layer3_voting_mode ?? "default"})`
                            : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Layer 4 (Dry Ref)</dt>
                      <dd className="text-[#1C1917]">
                        {effectiveSettings.settings.layer4_enabled != null
                          ? effectiveSettings.settings.layer4_enabled ? "Enabled" : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h4 className="mb-3 text-sm font-medium text-[#78716C]">Detection Settings</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Detection Enabled</dt>
                      <dd className="text-[#1C1917]">
                        {effectiveSettings.settings.detection_enabled != null
                          ? effectiveSettings.settings.detection_enabled ? "Yes" : "No"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Capture FPS</dt>
                      <dd className="text-[#1C1917]">{effectiveSettings.settings.capture_fps ?? "Inherited"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Detection Interval</dt>
                      <dd className="text-[#1C1917]">
                        {effectiveSettings.settings.detection_interval_seconds != null
                          ? `${effectiveSettings.settings.detection_interval_seconds}s`
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Auto Create Incident</dt>
                      <dd className="text-[#1C1917]">
                        {effectiveSettings.settings.auto_create_incident != null
                          ? effectiveSettings.settings.auto_create_incident ? "Yes" : "No"
                          : "Inherited"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              {effectiveSettings.provenance && (
                <div className="mt-4 rounded border border-[#E7E5E0] bg-[#F8F7F4] p-3">
                  <h4 className="mb-2 text-xs font-medium text-[#78716C]">Setting Sources</h4>
                  <div className="flex flex-wrap gap-2 text-xs text-[#78716C]">
                    {Object.entries(effectiveSettings.provenance).map(([key, source]) => (
                      <span key={key} className="rounded bg-white px-2 py-1 border border-[#E7E5E0]">
                        {key}: <span className="font-medium text-[#1C1917]">{String(source)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === "Audit Log" && (
        <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-[#E7E5E0] bg-white">
          <FileText size={24} className="mb-2 text-[#78716C]" />
          <p className="text-sm font-medium text-[#1C1917]">Audit Logging</p>
          <p className="mt-1 text-xs text-[#78716C]">
            Camera-level audit logging will be available in a future update.
          </p>
        </div>
      )}
    </div>
  );
}
