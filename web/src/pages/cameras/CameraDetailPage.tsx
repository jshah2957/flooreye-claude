import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
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
  Pencil,
  Trash2,
  X,
  Monitor,
  Crosshair,
  Image,
  Activity,
  Shield,
  ScrollText,
} from "lucide-react";

import api from "@/lib/api";
import type { Camera } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import RoiCanvas from "@/components/roi/RoiCanvas";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
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

const TAB_ICONS: Record<Tab, React.ElementType> = {
  "Overview": Monitor,
  "Live Feed": Play,
  "Detection History": Activity,
  "ROI": Crosshair,
  "Dry Reference": Image,
  "Inference Config": Settings,
  "Detection Overrides": Shield,
  "Audit Log": ScrollText,
};

function TabSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="space-y-4">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
        <div className="grid gap-6 sm:grid-cols-2">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoiHistory({ cameraId, snapshotBase64 }: { cameraId: string; snapshotBase64?: string }) {
  const [open, setOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<ROIData | null>(null);
  const { data } = useQuery({
    queryKey: ["roi-history", cameraId],
    queryFn: async () => {
      const res = await api.get(`/cameras/${cameraId}/roi/history`);
      return res.data.data as ROIData[];
    },
    enabled: open,
  });
  const history = data ?? [];
  if (history.length <= 1 && !open) return null;
  return (
    <div className="mt-5 border-t border-gray-100 pt-5">
      <button onClick={() => setOpen(!open)} className="text-sm font-medium text-[#0D9488] transition-colors hover:text-[#0F766E]">
        {open ? "Hide" : "Show"} version history ({history.length} versions)
      </button>
      {open && history.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {history.map((r) => (
            <div
              key={r.version}
              onClick={() => setPreviewVersion(previewVersion?.version === r.version ? null : r)}
              className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-2.5 text-sm transition-all ${
                previewVersion?.version === r.version
                  ? "border-[#0D9488] bg-[#F0FDFA] shadow-sm"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
              }`}
            >
              <span className="font-medium text-gray-900">
                v{r.version}
                {r.is_active && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">active</span>}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-400">{r.polygon_points.length} points</span>
                <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Read-only polygon overlay preview */}
      {previewVersion && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">
              Preview: v{previewVersion.version}
              {previewVersion.mask_outside && <span className="ml-2 text-xs text-gray-400">(mask outside)</span>}
            </span>
            <button onClick={() => setPreviewVersion(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
          <RoiPreviewOverlay snapshotBase64={snapshotBase64} points={previewVersion.polygon_points} />
        </div>
      )}
    </div>
  );
}

function RoiPreviewOverlay({ snapshotBase64, points }: { snapshotBase64?: string; points: { x: number; y: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ w: 640, h: 360 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = (imgW: number, imgH: number) => {
      canvas.width = imgW;
      canvas.height = imgH;
      setDimensions({ w: imgW, h: imgH });

      // Draw polygon
      if (points.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(points[0]!.x * imgW, points[0]!.y * imgH);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i]!.x * imgW, points[i]!.y * imgH);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(13, 148, 136, 0.15)";
        ctx.fill();
        ctx.strokeStyle = "#0D9488";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw vertices
        for (const p of points) {
          ctx.beginPath();
          ctx.arc(p.x * imgW, p.y * imgH, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#0D9488";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    };

    if (snapshotBase64) {
      const img = new window.Image();
      img.onload = () => {
        const displayW = Math.min(img.width, 640);
        const scale = displayW / img.width;
        const displayH = img.height * scale;
        canvas.width = displayW;
        canvas.height = displayH;
        ctx.drawImage(img, 0, 0, displayW, displayH);
        draw(displayW, displayH);
      };
      img.src = `data:image/jpeg;base64,${snapshotBase64}`;
    } else {
      // No snapshot -- draw on grey background
      draw(640, 360);
      ctx.fillStyle = "#E7E5E0";
      ctx.fillRect(0, 0, 640, 360);
      // Re-draw polygon on top
      if (points.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(points[0]!.x * 640, points[0]!.y * 360);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i]!.x * 640, points[i]!.y * 360);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(13, 148, 136, 0.15)";
        ctx.fill();
        ctx.strokeStyle = "#0D9488";
        ctx.lineWidth = 2;
        ctx.stroke();
        for (const p of points) {
          ctx.beginPath();
          ctx.arc(p.x * 640, p.y * 360, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#0D9488";
          ctx.fill();
        }
      }
    }
  }, [snapshotBase64, points]);

  return <canvas ref={canvasRef} className="w-full rounded-lg" style={{ maxWidth: dimensions.w }} />;
}

export default function CameraDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [showUrl, setShowUrl] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStreamUrl, setEditStreamUrl] = useState("");
  const [editShowStreamUrl, setEditShowStreamUrl] = useState(false);
  const [editFloorType, setEditFloorType] = useState("tile");
  const [editFps, setEditFps] = useState(2);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "pushing" | "pushed" | "unreachable">("idle");
  const [roiPushStatus, setRoiPushStatus] = useState<"idle" | "pushing" | "received" | "unreachable">("idle");
  const navigate = useNavigate();

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

  // Live Feed polling with detection overlay
  const [livePlaying, setLivePlaying] = useState(true);
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const [liveDetection, setLiveDetection] = useState(false);
  const [liveInterval, setLiveInterval] = useState(2000);
  const [liveError, setLiveError] = useState(0);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (activeTab !== "Live Feed" || !livePlaying || !id) {
      if (liveIntervalRef.current) { clearInterval(liveIntervalRef.current); liveIntervalRef.current = null; }
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        if (liveDetection) {
          // Run inference + get annotated frame
          const res = await api.post("/inference/test", { camera_id: id, confidence: 0.5 });
          if (!cancelled && res.data?.data?.annotated_frame_base64) {
            setLiveFrame(res.data.data.annotated_frame_base64);
            setLiveError(0);
          }
        } else {
          const res = await api.get(`/live/stream/${id}/frame`);
          if (!cancelled && res.data?.data?.frame_base64) {
            setLiveFrame(res.data.data.frame_base64);
            setLiveError(0);
          }
        }
      } catch {
        setLiveError((p) => p + 1);
      }
    };
    poll();
    liveIntervalRef.current = setInterval(poll, liveInterval);
    return () => { cancelled = true; if (liveIntervalRef.current) { clearInterval(liveIntervalRef.current); liveIntervalRef.current = null; } };
  }, [id, activeTab, livePlaying, liveDetection, liveInterval]);

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

  const editMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: editName,
        floor_type: editFloorType,
        fps_config: editFps,
      };
      if (editStreamUrl) payload.stream_url = editStreamUrl;
      return api.put(`/cameras/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["camera", id] });
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      setEditOpen(false);
      success(camera?.edge_agent_id ? "Camera updated — config pushed to edge" : "Camera updated");
    },
    onError: (err: any) => showError(err?.response?.data?.detail || "Update failed"),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => api.delete(`/cameras/${id}`),
    onSuccess: () => {
      success("Camera deactivated");
      navigate("/cameras");
    },
    onError: (err: any) => showError(err?.response?.data?.detail || "Deactivation failed"),
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
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-[#0D9488]" />
          <p className="text-sm text-gray-400">Loading camera details...</p>
        </div>
      </div>
    );
  }

  if (!camera) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <CamIcon size={40} className="mb-3 text-gray-300" />
        <p className="text-sm font-medium text-gray-500">Camera not found</p>
        <Link to="/cameras" className="mt-2 text-sm text-[#0D9488] hover:underline">Back to Cameras</Link>
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
    <div className="min-h-[calc(100vh-120px)]">
      {/* Breadcrumbs */}
      <nav className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Link to="/cameras" className="flex items-center gap-1 transition-colors hover:text-[#0D9488]">
          <ArrowLeft size={14} />
          Cameras
        </Link>
        <span>/</span>
        <span className="font-medium text-gray-700">{camera.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900">{camera.name}</h1>
            <StatusBadge status={camera.status} />
            <StatusBadge status={camera.inference_mode} />
          </div>
          <p className="mt-1 text-sm text-gray-400">
            {(camera.stream_type ?? 'rtsp').toUpperCase()} &middot; {camera.floor_type ?? 'tile'} &middot; {camera.resolution ?? "Unknown"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md disabled:opacity-50"
          >
            {testMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Wifi size={14} />
            )}
            Test
          </button>
          <button
            onClick={() => { setEditName(camera.name); setEditStreamUrl(""); setEditShowStreamUrl(false); setEditFloorType(camera.floor_type); setEditFps(camera.fps_config); setEditOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
          >
            <Pencil size={14} /> Edit
          </button>
          {camera.status !== "inactive" && (
            <button
              onClick={() => setDeactivateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 shadow-sm transition-all hover:bg-red-50 hover:shadow-md"
            >
              <Trash2 size={14} /> Deactivate
            </button>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Edit Camera</h3>
              <button onClick={() => setEditOpen(false)} className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">RTSP / Stream URL</label>
                <div className="relative">
                  <input
                    type={editShowStreamUrl ? "text" : "password"}
                    value={editStreamUrl}
                    onChange={(e) => setEditStreamUrl(e.target.value)}
                    placeholder="rtsp://..."
                    className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setEditShowStreamUrl(!editShowStreamUrl)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {editShowStreamUrl ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">Leave empty to keep current URL</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Floor Type</label>
                <select value={editFloorType} onChange={(e) => setEditFloorType(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20">
                  {["tile","wood","concrete","carpet","vinyl","linoleum"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">FPS ({editFps})</label>
                <input type="range" min={1} max={30} value={editFps} onChange={(e) => setEditFps(Number(e.target.value))}
                  className="w-full accent-[#0D9488]" />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>1</span>
                  <span>15</span>
                  <span>30</span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditOpen(false)} className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">Cancel</button>
              <button onClick={() => editMutation.mutate()} disabled={editMutation.isPending || !editName.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0F766E] disabled:opacity-50">
                {editMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {editMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
            {camera.edge_agent_id && (
              <p className="mt-3 text-xs text-gray-400">
                This camera is edge-managed. Config will be pushed to edge agent after save.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Deactivate Confirmation */}
      <ConfirmDialog
        open={deactivateOpen}
        title="Deactivate Camera"
        description={`Deactivate "${camera.name}"? Detection will stop. All history is preserved.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => deactivateMutation.mutate()}
        onCancel={() => setDeactivateOpen(false)}
      />

      {/* Tabs */}
      <div className="mb-6 -mx-1 overflow-x-auto scrollbar-none">
        <div className="flex min-w-max gap-0.5 border-b border-gray-200 px-1">
          {TABS.map((tab) => {
            const Icon = TAB_ICONS[tab];
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "text-[#0D9488]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon size={14} />
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#0D9488]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overview */}
      {activeTab === "Overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Snapshot */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {camera.snapshot_base64 ? (
              <img
                src={`data:image/jpeg;base64,${camera.snapshot_base64}`}
                alt="Camera snapshot"
                className="w-full"
              />
            ) : (
              <div className="flex h-72 flex-col items-center justify-center bg-gray-100 text-gray-400">
                <CamIcon size={32} className="mb-2" />
                <p className="text-sm">No snapshot available</p>
                <p className="text-xs">Run a connection test to capture</p>
              </div>
            )}
          </div>

          {/* Config details */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-400">Configuration</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Stream URL</dt>
                <dd className="flex items-center gap-2 font-medium text-gray-900">
                  <span className="max-w-[180px] truncate font-mono text-xs">{showUrl ? camera.stream_url : maskUrl(camera.stream_url)}</span>
                  <button onClick={() => setShowUrl(!showUrl)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    {showUrl ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Stream Type</dt>
                <dd className="font-medium text-gray-900">{(camera.stream_type ?? 'rtsp').toUpperCase()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Resolution</dt>
                <dd className="font-medium text-gray-900">{camera.resolution ?? "Unknown"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">FPS Config</dt>
                <dd className="font-medium text-gray-900">{camera.fps_config}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Floor Type</dt>
                <dd className="font-medium capitalize text-gray-900">{camera.floor_type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Min Wet Area</dt>
                <dd className="font-medium text-gray-900">{camera.min_wet_area_percent}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Detection</dt>
                <dd>
                  {camera.detection_enabled ? (
                    <span className="font-semibold text-green-600">Enabled</span>
                  ) : (
                    <span className="font-medium text-gray-400">Disabled</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Inference Mode</dt>
                <dd><StatusBadge status={camera.inference_mode} /></dd>
              </div>
              {camera.hybrid_threshold && camera.inference_mode === "hybrid" && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Escalation Threshold</dt>
                  <dd className="font-medium text-gray-900">{camera.hybrid_threshold}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Last Seen</dt>
                <dd className="font-medium text-gray-900">
                  {camera.last_seen ? new Date(camera.last_seen).toLocaleString() : "Never"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd className="font-medium text-gray-900">{new Date(camera.created_at).toLocaleString()}</dd>
              </div>
              {camera.edge_agent_id && (
                <>
                  <div className="my-2 border-t border-gray-100" />
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Edge Config</dt>
                    <dd>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        camera.config_status === "received" ? "bg-green-100 text-green-700" :
                        camera.config_status === "failed" ? "bg-red-100 text-red-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {camera.config_status || "waiting"}
                      </span>
                    </dd>
                  </div>
                  {camera.last_config_push_at && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Last Push</dt>
                      <dd className="text-xs font-medium text-gray-900">{new Date(camera.last_config_push_at).toLocaleString()}</dd>
                    </div>
                  )}
                  {camera.last_config_ack_at && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Edge ACK</dt>
                      <dd className="text-xs font-medium text-gray-900">{new Date(camera.last_config_ack_at).toLocaleString()}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
            {/* Config ACK error alert */}
            {camera.config_ack_error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs font-semibold text-red-700">Edge Config Error</p>
                <p className="mt-1 text-xs text-red-600">{camera.config_ack_error}</p>
              </div>
            )}
            {camera.edge_agent_id && (
              <button
                onClick={() => {
                  setPushStatus("pushing");
                  api.post(`/cameras/${camera.id}/push-config`)
                    .then(() => {
                      queryClient.invalidateQueries({ queryKey: ["camera", id] });
                      setPushStatus("pushed");
                      success("Config pushed to edge");
                    })
                    .catch(() => {
                      setPushStatus("unreachable");
                      showError("Edge agent unreachable");
                    });
                }}
                disabled={pushStatus === "pushing"}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[#0D9488] px-4 py-2 text-sm font-medium text-[#0D9488] transition-colors hover:bg-[#F0FDFA] disabled:opacity-50"
              >
                {pushStatus === "pushing" ? (
                  <><Loader2 size={14} className="animate-spin" /> Pushing...</>
                ) : (
                  "Push Config to Edge"
                )}
              </button>
            )}
            {pushStatus === "pushed" && (
              <p className="mt-2 text-xs font-medium text-green-600">Edge received config</p>
            )}
            {pushStatus === "unreachable" && (
              <p className="mt-2 text-xs font-medium text-amber-600">Edge unreachable -- retry later</p>
            )}
          </div>
        </div>
      )}

      {/* ROI Tab */}
      {activeTab === "ROI" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Region of Interest</h3>
            {roi && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Version {roi.version}</span>
            )}
          </div>
          <RoiCanvas
            snapshotBase64={camera.snapshot_base64 ?? undefined}
            initialPoints={roi?.polygon_points}
            initialMaskOutside={roi?.mask_outside}
            cameraId={camera.id}
            onSave={() => {
              if (camera.edge_agent_id) {
                setRoiPushStatus("pushing");
                api.post(`/cameras/${camera.id}/push-config`)
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: ["camera", id] });
                    setRoiPushStatus("received");
                  })
                  .catch(() => {
                    setRoiPushStatus("unreachable");
                  });
              }
            }}
          />
          {/* ROI push status feedback */}
          {roiPushStatus === "pushing" && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#F0FDFA] px-4 py-2.5 text-sm text-[#0D9488]">
              <Loader2 size={14} className="animate-spin" /> Pushing ROI config to edge...
            </div>
          )}
          {roiPushStatus === "received" && (
            <div className="mt-4 rounded-lg bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700">
              Edge received updated ROI config
            </div>
          )}
          {roiPushStatus === "unreachable" && (
            <div className="mt-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700">
              Edge unreachable -- ROI saved but config push failed
            </div>
          )}
          {/* ROI Version History */}
          <RoiHistory cameraId={camera.id} snapshotBase64={camera.snapshot_base64 ?? undefined} />
        </div>
      )}

      {/* Dry Reference Tab */}
      {activeTab === "Dry Reference" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Dry Reference Frames</h3>
              {dryRef && (
                <p className="mt-1 text-xs text-gray-500">
                  Version {dryRef.version} &middot; {dryRef.frames.length} frames &middot;
                  Captured {new Date(dryRef.created_at).toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={() => captureDryRefMutation.mutate()}
              disabled={captureDryRefMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0F766E] hover:shadow-md disabled:opacity-50"
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
                <div key={i} className="overflow-hidden rounded-xl border border-gray-200">
                  <img
                    src={`data:image/jpeg;base64,${frame.frame_base64}`}
                    alt={`Dry ref ${i + 1}`}
                    className="w-full"
                  />
                  <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    <span>Brightness: <span className="font-medium text-gray-700">{frame.brightness_score}</span></span>
                    <span>Reflection: <span className="font-medium text-gray-700">{(frame.reflection_score * 100).toFixed(1)}%</span></span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50">
              <Image size={32} className="mb-2 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No dry reference captured yet</p>
              <p className="mt-1 text-xs text-gray-400">Capture a reference to enable Layer 4 validation</p>
            </div>
          )}
        </div>
      )}

      {/* Live Feed Tab */}
      {activeTab === "Live Feed" && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Live Feed</h3>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs">
                <input type="checkbox" checked={liveDetection} onChange={(e) => setLiveDetection(e.target.checked)} className="accent-[#0D9488]" />
                Detection Overlay
              </label>
              <select value={liveInterval} onChange={(e) => setLiveInterval(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs">
                <option value={1000}>1s</option>
                <option value={2000}>2s</option>
                <option value={3000}>3s</option>
                <option value={5000}>5s</option>
              </select>
              <button onClick={() => setLivePlaying(!livePlaying)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  livePlaying
                    ? "border-red-200 text-red-600 hover:bg-red-50"
                    : "border-[#0D9488] text-[#0D9488] hover:bg-[#F0FDFA]"
                }`}>
                {livePlaying ? <Pause size={12} /> : <Play size={12} />}
                {livePlaying ? "Pause" : "Play"}
              </button>
            </div>
          </div>
          <div className="p-4">
            {liveFrame ? (
              <img
                src={`data:image/jpeg;base64,${liveFrame}`}
                alt="Live camera feed"
                className="w-full rounded-lg"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-gray-900">
                {livePlaying ? (
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <Loader2 size={24} className="animate-spin" />
                    <span className="text-sm">Connecting to live feed...</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-500">Feed paused</span>
                )}
              </div>
            )}
            {livePlaying && liveFrame && (
              <p className="mt-3 text-xs text-gray-400">
                Refreshing every {liveInterval / 1000}s {liveDetection && " -- Detection overlay ON"}
              </p>
            )}
            {liveError >= 3 && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
                Camera offline -- {liveError} consecutive failures. Retrying...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detection History Tab */}
      {activeTab === "Detection History" && (
        <div>
          {historyLoading ? (
            <TabSkeleton />
          ) : !detectionHistory?.data?.length ? (
            <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50">
              <div className="mb-3 rounded-full bg-gray-100 p-3">
                <Activity size={24} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">No detection history</p>
              <p className="mt-1 text-xs text-gray-400">Detections will appear here once monitoring begins</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50/80">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Timestamp</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Confidence</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Model Source</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Wet Area</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Inference Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {detectionHistory.data.map((det: any) => (
                      <tr key={det.id} className="transition-colors hover:bg-gray-50/70">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900 sm:px-6">
                          {new Date(det.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 sm:px-6">
                          {det.is_wet ? (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                              Wet
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                              Dry
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 sm:px-6">
                          {(det.confidence * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 sm:px-6">
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                            {det.model_source}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 sm:px-6">
                          {det.wet_area_percent != null ? `${det.wet_area_percent.toFixed(1)}%` : "--"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 sm:px-6">
                          {det.inference_time_ms != null ? `${det.inference_time_ms}ms` : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detectionHistory.meta && (
                <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-2.5 text-xs text-gray-500">
                  Showing {detectionHistory.data.length} of {detectionHistory.meta.total} detections
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Inference Config Tab */}
      {activeTab === "Inference Config" && camera && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Inference Configuration</h3>
            <Link
              to="/detection-control"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0D9488] transition-colors hover:text-[#0F766E]"
            >
              Detection Control Center <ExternalLink size={14} />
            </Link>
          </div>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Detection Mode</h4>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Inference Mode</dt>
                  <dd><StatusBadge status={camera.inference_mode} /></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Detection Enabled</dt>
                  <dd className="font-medium">
                    {camera.detection_enabled ? (
                      <span className="text-green-600">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">FPS Config</dt>
                  <dd className="font-medium text-gray-900">{camera.fps_config}</dd>
                </div>
                {camera.inference_mode === "hybrid" && camera.hybrid_threshold && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Hybrid Escalation Threshold</dt>
                    <dd className="font-medium text-gray-900">{camera.hybrid_threshold}</dd>
                  </div>
                )}
              </dl>
            </div>
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Model & Floor Settings</h4>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Floor Type</dt>
                  <dd className="font-medium capitalize text-gray-900">{camera.floor_type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Min Wet Area</dt>
                  <dd className="font-medium text-gray-900">{camera.min_wet_area_percent}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Mask Outside ROI</dt>
                  <dd className="font-medium text-gray-900">{camera.mask_outside_roi ? "Yes" : "No"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Student Model Version</dt>
                  <dd className="font-medium text-gray-900">{camera.student_model_version ?? "None"}</dd>
                </div>
                {camera.edge_agent_id && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Edge Agent</dt>
                    <dd className="max-w-[120px] truncate font-mono text-xs font-medium text-gray-900">{camera.edge_agent_id}</dd>
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
            <TabSkeleton />
          ) : !effectiveSettings?.settings ? (
            <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50">
              <div className="mb-3 rounded-full bg-gray-100 p-3">
                <Shield size={24} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">Using global defaults</p>
              <p className="mt-1 max-w-sm text-center text-xs text-gray-400">
                No camera-level detection overrides configured. Settings are inherited from store, organization, or global defaults.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Effective Detection Settings</h3>
                <Link
                  to="/detection-control"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0D9488] transition-colors hover:text-[#0F766E]"
                >
                  Edit in Detection Control Center <ExternalLink size={14} />
                </Link>
              </div>
              <div className="grid gap-8 sm:grid-cols-2">
                <div>
                  <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Validation Layers</h4>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Layer 1 (Confidence)</dt>
                      <dd className="font-medium text-gray-900">
                        {effectiveSettings.settings.layer1_enabled != null
                          ? effectiveSettings.settings.layer1_enabled
                            ? `Enabled (${effectiveSettings.settings.layer1_confidence ?? "default"})`
                            : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Layer 2 (Area)</dt>
                      <dd className="font-medium text-gray-900">
                        {effectiveSettings.settings.layer2_enabled != null
                          ? effectiveSettings.settings.layer2_enabled
                            ? `Enabled (${effectiveSettings.settings.layer2_min_area_percent ?? "default"}%)`
                            : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Layer 3 (Voting)</dt>
                      <dd className="font-medium text-gray-900">
                        {effectiveSettings.settings.layer3_enabled != null
                          ? effectiveSettings.settings.layer3_enabled
                            ? `Enabled (${effectiveSettings.settings.layer3_voting_mode ?? "default"})`
                            : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Layer 4 (Dry Ref)</dt>
                      <dd className="font-medium text-gray-900">
                        {effectiveSettings.settings.layer4_enabled != null
                          ? effectiveSettings.settings.layer4_enabled ? "Enabled" : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Detection Settings</h4>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Detection Enabled</dt>
                      <dd className="font-medium text-gray-900">
                        {effectiveSettings.settings.detection_enabled != null
                          ? effectiveSettings.settings.detection_enabled ? "Yes" : "No"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Capture FPS</dt>
                      <dd className="font-medium text-gray-900">{effectiveSettings.settings.capture_fps ?? "Inherited"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Detection Interval</dt>
                      <dd className="font-medium text-gray-900">
                        {effectiveSettings.settings.detection_interval_seconds != null
                          ? `${effectiveSettings.settings.detection_interval_seconds}s`
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Auto Create Incident</dt>
                      <dd className="font-medium text-gray-900">
                        {effectiveSettings.settings.auto_create_incident != null
                          ? effectiveSettings.settings.auto_create_incident ? "Yes" : "No"
                          : "Inherited"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              {effectiveSettings.provenance && (
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Setting Sources</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(effectiveSettings.provenance).map(([key, source]) => (
                      <span key={key} className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
                        {key}: <span className="font-semibold text-gray-700">{String(source)}</span>
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
        <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="mb-3 rounded-full bg-gray-100 p-3">
            <ScrollText size={24} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">Audit Logging</p>
          <p className="mt-1 text-xs text-gray-400">
            Camera-level audit logging will be available in a future update.
          </p>
        </div>
      )}
    </div>
  );
}
