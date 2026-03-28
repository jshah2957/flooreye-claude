import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Play, Loader2, CheckCircle, XCircle, Save, Camera, Image as ImageIcon,
  Upload, Video, Trash2, Pause, Eye, EyeOff,
} from "lucide-react";

import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { VALIDATION_DEFAULTS } from "@/constants";

/* ─── Shared Types ─────────────────────────────────────────────────── */

interface Prediction {
  class_name: string;
  confidence: number;
  area_percent: number;
  bbox: { x: number; y: number; w: number; h: number };
  severity?: string;
  mask_polygon?: { x: number; y: number }[];
}

interface ValidationResult {
  passed: boolean;
  is_wet: boolean;
  failed_at_layer: number | null;
  reason: string;
}

interface TestResult {
  annotated_frame_base64: string | null;
  raw_frame_base64: string | null;
  predictions: Prediction[];
  is_wet: boolean;
  confidence: number;
  inference_time_ms: number;
  model_source: string;
  validation: ValidationResult | null;
  prediction_count: number;
}

/* ─── Video Types ──────────────────────────────────────────────────── */

interface VideoFrameDetection {
  timestamp_ms: number;
  detections: Prediction[];
  is_wet: boolean;
  confidence: number;
  inference_time_ms: number;
}

interface VideoJobResult {
  job_id: string;
  status: "queued" | "processing" | "complete" | "error";
  progress?: { current_frame: number; total_frames: number; detection_count: number };
  result?: {
    frames: VideoFrameDetection[];
    total_frames: number;
    fps: number;
    duration_ms: number;
    detection_count: number;
    avg_inference_time_ms: number;
    max_confidence: number;
    wet_frame_count: number;
    dry_frame_count: number;
  };
  error?: string;
}

/* ─── Canvas Drawing Utility ───────────────────────────────────────── */

const CLASS_COLORS: Record<string, string> = {
  wet_floor: "#DC2626", puddle: "#DC2626", spill: "#D97706",
  water: "#3B82F6", dry_floor: "#16A34A", "Water Spill": "#DC2626",
  "Mopped Floor": "#D97706", "Caution Sign": "#F59E0B",
};

function drawDetectionsOnCanvas(
  ctx: CanvasRenderingContext2D,
  detections: Prediction[],
  canvasW: number, canvasH: number,
  videoW: number, videoH: number,
  confidenceFilter: number,
) {
  ctx.clearRect(0, 0, canvasW, canvasH);
  const sx = canvasW / videoW;
  const sy = canvasH / videoH;

  for (const det of detections) {
    if ((det.confidence || 0) < confidenceFilter) continue;
    const color = CLASS_COLORS[det.class_name] || "#00FFFF";
    const bbox: Record<string, number> = (det.bbox as any) || {};
    // Handle both normalized (0-1) and pixel coords
    let x = bbox.x ?? bbox.cx ?? 0;
    let y = bbox.y ?? bbox.cy ?? 0;
    let w = bbox.w ?? bbox.width ?? 0;
    let h = bbox.h ?? bbox.height ?? 0;
    if (x <= 1 && y <= 1) { x *= videoW; y *= videoW; w *= videoW; h *= videoH; }
    // Center format -> top-left
    const dx = (x - w / 2) * sx;
    const dy = (y - h / 2) * sy;
    const dw = w * sx;
    const dh = h * sy;

    // Draw polygon if available
    if (det.mask_polygon && det.mask_polygon.length > 2) {
      const poly = det.mask_polygon;
      ctx.beginPath();
      ctx.moveTo(poly[0]!.x * canvasW, poly[0]!.y * canvasH);
      for (const pt of poly.slice(1)) {
        ctx.lineTo(pt.x * canvasW, pt.y * canvasH);
      }
      ctx.closePath();
      ctx.fillStyle = color + "30";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(dx, dy, dw, dh);

    // Label
    const label = `${det.class_name || "?"} ${Math.round((det.confidence || 0) * 100)}%`;
    ctx.font = "bold 11px Inter, system-ui, sans-serif";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = color;
    ctx.fillRect(dx, dy - 16, tw + 8, 16);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, dx + 4, dy - 4);
  }
}

/* ─── Binary Search for Frame ──────────────────────────────────────── */

function findFrameForTime(frames: VideoFrameDetection[], timeMs: number): VideoFrameDetection | null {
  if (!frames.length) return null;
  let lo = 0, hi = frames.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid]!.timestamp_ms <= timeMs) { idx = mid; lo = mid + 1; }
    else { hi = mid - 1; }
  }
  if (idx < 0) return null;
  const match = frames[idx]!;
  // Expire if gap > 2 seconds
  if (timeMs - match.timestamp_ms > 2000) return null;
  return match;
}

/* ─── Detection Segments Helper ────────────────────────────────────── */

interface DetectionSegment {
  start_ms: number;
  end_ms: number;
  is_wet: boolean;
}

function computeSegments(frames: VideoFrameDetection[], duration_ms: number): DetectionSegment[] {
  if (!frames.length) return [{ start_ms: 0, end_ms: duration_ms, is_wet: false }];
  const segs: DetectionSegment[] = [];
  let cur: DetectionSegment | null = null;
  for (const f of frames) {
    if (!cur || cur.is_wet !== f.is_wet) {
      if (cur) { cur.end_ms = f.timestamp_ms; segs.push(cur); }
      cur = { start_ms: f.timestamp_ms, end_ms: f.timestamp_ms, is_wet: f.is_wet };
    } else {
      cur.end_ms = f.timestamp_ms;
    }
  }
  if (cur) { cur.end_ms = duration_ms; segs.push(cur); }
  return segs;
}

/* ─── Format Helpers ───────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Component                                                    */
/* ═══════════════════════════════════════════════════════════════════ */

export default function TestInferencePage() {
  const { success, error: showError } = useToast();

  /* ─── Shared state (Camera + Image) ─────────────────────────────── */
  const [tab, setTab] = useState<"camera" | "image" | "video">("camera");
  const [cameraId, setCameraId] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [modelSource, setModelSource] = useState("local_onnx");
  const [confidence, setConfidence] = useState(VALIDATION_DEFAULTS.CONFIDENCE);
  const [runValidation, setRunValidation] = useState(false);
  const [l1Conf, setL1Conf] = useState(VALIDATION_DEFAULTS.LAYER1_CONFIDENCE);
  const [l1On, setL1On] = useState(true);
  const [l2Area, setL2Area] = useState(VALIDATION_DEFAULTS.LAYER2_MIN_AREA);
  const [l2On, setL2On] = useState(true);
  const [l3K, setL3K] = useState(VALIDATION_DEFAULTS.LAYER3_K);
  const [l3M, setL3M] = useState(VALIDATION_DEFAULTS.LAYER3_M);
  const [l3On, setL3On] = useState(true);
  const [l4Delta, setL4Delta] = useState(VALIDATION_DEFAULTS.LAYER4_DELTA);
  const [l4On, setL4On] = useState(true);
  const [result, setResult] = useState<TestResult | null>(null);

  /* ─── Video state ───────────────────────────────────────────────── */
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoFps, setVideoFps] = useState<string>("auto");
  const [videoConfidence, setVideoConfidence] = useState(0.25);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [videoJobResult, setVideoJobResult] = useState<VideoJobResult | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [playbackConfFilter, setPlaybackConfFilter] = useState(0.1);
  const [videoError, setVideoError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Queries ───────────────────────────────────────────────────── */

  const { data: cameras } = useQuery({
    queryKey: ["cameras-test"],
    queryFn: async () => {
      const res = await api.get("/cameras", { params: { limit: 100 } });
      return res.data.data as { id: string; name: string; status: string }[];
    },
  });

  /* ─── Camera/Image inference mutation ───────────────────────────── */

  const testMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { model_source: modelSource, confidence, run_validation: runValidation };
      if (runValidation) {
        payload.validation_overrides = {
          layer1_confidence: l1Conf, layer1_enabled: l1On,
          layer2_min_area: l2Area, layer2_enabled: l2On,
          layer3_k: l3K, layer3_m: l3M, layer3_enabled: l3On,
          layer4_delta: l4Delta, layer4_enabled: l4On,
        };
      }
      if (tab === "camera") payload.camera_id = cameraId;
      else if (imageBase64) payload.image_base64 = imageBase64;
      const res = await api.post("/inference/test", payload);
      return res.data.data as TestResult;
    },
    onSuccess: (d) => setResult(d),
    onError: (e: any) => showError(e?.response?.data?.detail || "Inference failed"),
  });

  const saveMutation = useMutation({
    mutationFn: () => api.post("/dataset/frames", {
      frame_path: `test_${Date.now()}.jpg`, label_class: result?.is_wet ? "wet" : "dry",
      label_source: "manual_upload", split: "unassigned",
    }),
    onSuccess: () => success("Saved to dataset"),
    onError: () => showError("Save failed"),
  });

  /* ─── Video upload mutation ─────────────────────────────────────── */

  const videoUploadMutation = useMutation({
    mutationFn: async () => {
      if (!videoFile) throw new Error("No video file selected");
      const form = new FormData();
      form.append("file", videoFile);
      form.append("confidence", String(videoConfidence));
      if (videoFps !== "auto") form.append("fps", videoFps);
      const res = await api.post("/inference/video", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.data as { job_id: string };
    },
    onSuccess: (d) => {
      setVideoJobId(d.job_id);
      setVideoJobResult({ job_id: d.job_id, status: "queued" });
      setVideoError(null);
      // Create blob URL for local playback
      if (videoFile) {
        const url = URL.createObjectURL(videoFile);
        setVideoBlobUrl(url);
      }
    },
    onError: (e: any) => {
      setVideoError(e?.response?.data?.detail || "Video upload failed");
      showError(e?.response?.data?.detail || "Video upload failed");
    },
  });

  const videoDeleteMutation = useMutation({
    mutationFn: async () => {
      if (!videoJobId) throw new Error("No job to delete");
      await api.delete(`/inference/video/${videoJobId}`);
    },
    onSuccess: () => {
      resetVideoState();
      success("Video job deleted");
    },
    onError: (e: any) => showError(e?.response?.data?.detail || "Delete failed"),
  });

  /* ─── Video polling ─────────────────────────────────────────────── */

  useEffect(() => {
    if (!videoJobId || videoJobResult?.status === "complete" || videoJobResult?.status === "error") {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/inference/video/${videoJobId}`);
        const data = res.data.data as VideoJobResult;
        setVideoJobResult(data);
        if (data.status === "complete" || data.status === "error") {
          if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
          if (data.status === "error") setVideoError(data.error || "Processing failed");
        }
      } catch (e) {
        console.error("Inference poll failed:", e);
      }
    }, 750);

    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    };
  }, [videoJobId, videoJobResult?.status]);

  /* ─── Canvas overlay animation loop ─────────────────────────────── */

  const renderOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !videoJobResult?.result?.frames) {
      animFrameRef.current = requestAnimationFrame(renderOverlay);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) { animFrameRef.current = requestAnimationFrame(renderOverlay); return; }

    // Sync canvas size to video display size
    const rect = video.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    if (showAnnotations) {
      const timeMs = video.currentTime * 1000;
      const frame = findFrameForTime(videoJobResult.result.frames, timeMs);
      if (frame && frame.detections.length > 0) {
        drawDetectionsOnCanvas(
          ctx, frame.detections,
          canvas.width, canvas.height,
          video.videoWidth || canvas.width,
          video.videoHeight || canvas.height,
          playbackConfFilter,
        );
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    animFrameRef.current = requestAnimationFrame(renderOverlay);
  }, [videoJobResult, showAnnotations, playbackConfFilter]);

  useEffect(() => {
    if (videoJobResult?.status === "complete" && videoBlobUrl) {
      animFrameRef.current = requestAnimationFrame(renderOverlay);
      return () => { cancelAnimationFrame(animFrameRef.current); };
    }
  }, [videoJobResult?.status, videoBlobUrl, renderOverlay]);

  /* ─── Cleanup blob URL ──────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    };
  }, [videoBlobUrl]);

  /* ─── Helpers ───────────────────────────────────────────────────── */

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const d = r.result as string; setImagePreview(d); setImageBase64(d.split(",")[1] ?? null); setResult(null); };
    r.readAsDataURL(f);
  }

  function onVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    resetVideoState();
    setVideoFile(f);
  }

  function onVideoDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("video/")) {
      resetVideoState();
      setVideoFile(f);
    }
  }

  function resetVideoState() {
    setVideoJobId(null);
    setVideoJobResult(null);
    setVideoError(null);
    setVideoPlaying(false);
    if (videoBlobUrl) { URL.revokeObjectURL(videoBlobUrl); setVideoBlobUrl(null); }
    cancelAnimationFrame(animFrameRef.current);
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setVideoPlaying(true); }
    else { video.pause(); setVideoPlaying(false); }
  }

  function seekToMs(ms: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
  }

  const canTest = tab === "camera" ? !!cameraId : tab === "image" ? !!imageBase64 : false;

  const videoComplete = videoJobResult?.status === "complete" && videoJobResult.result;
  const videoProcessing = videoJobResult?.status === "processing" || videoJobResult?.status === "queued";
  const segments = videoComplete ? computeSegments(videoJobResult!.result!.frames, videoJobResult!.result!.duration_ms) : [];

  /* ═══════════════════════════════════════════════════════════════ */
  /*  Render                                                        */
  /* ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Test Inference</h1>
        <p className="mt-1 text-sm text-gray-500">Run model inference with custom settings. See annotated results with bounding boxes.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Upload + Controls */}
        <div className="space-y-4">
          {/* Source Tabs */}
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {(["camera", "image", "video"] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setResult(null); }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {t === "camera" ? <Camera size={13} /> : t === "image" ? <ImageIcon size={13} /> : <Video size={13} />}
                {t === "camera" ? "Camera" : t === "image" ? "Image" : "Video"}
              </button>
            ))}
          </div>

          {/* ── Camera Tab Content ──────────────────────────────── */}
          {tab === "camera" && (
            <select value={cameraId} onChange={(e) => setCameraId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20">
              <option value="">Select camera</option>
              {(cameras ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {/* ── Image Tab Content ──────────────────────────────── */}
          {tab === "image" && (
            <div>
              <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-teal-500 hover:bg-teal-50/30">
                <input type="file" accept="image/*" onChange={onFile} className="hidden" />
                {imagePreview ? (
                  <img src={imagePreview} alt="" className="max-h-32 rounded-lg object-contain" />
                ) : (
                  <>
                    <Upload size={24} className="mb-1.5 text-gray-400" />
                    <span className="text-xs text-gray-500">Click to upload or drag an image</span>
                  </>
                )}
              </label>
            </div>
          )}

          {/* ── Video Tab Content ──────────────────────────────── */}
          {tab === "video" && (
            <div className="space-y-4">
              {/* Video upload zone */}
              <label
                className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-teal-500 hover:bg-teal-50/30"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onVideoDrop}
              >
                <input type="file" accept="video/*" onChange={onVideoFile} className="hidden" />
                {videoFile ? (
                  <div className="flex flex-col items-center gap-1 px-4 py-3">
                    <Video size={24} className="text-teal-500" />
                    <span className="text-xs font-medium text-gray-900">{videoFile.name}</span>
                    <span className="text-[10px] text-gray-500">{formatBytes(videoFile.size)}</span>
                  </div>
                ) : (
                  <>
                    <Upload size={24} className="mb-1.5 text-gray-400" />
                    <span className="text-xs text-gray-500">Click or drag a video file</span>
                    <span className="text-[10px] text-gray-400">MP4, WebM, MOV, AVI</span>
                  </>
                )}
              </label>

              {/* FPS selector */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Video Settings</h4>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs text-gray-600 w-20">Sample FPS</span>
                  <select value={videoFps} onChange={(e) => setVideoFps(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none transition focus:border-teal-500">
                    <option value="auto">Auto</option>
                    <option value="1">1 FPS</option>
                    <option value="2">2 FPS</option>
                    <option value="4">4 FPS</option>
                    <option value="5">5 FPS</option>
                  </select>
                </div>
                <label className="block text-xs text-gray-500">
                  Confidence Threshold ({videoConfidence.toFixed(2)})
                  <input type="range" min={0.1} max={1} step={0.05} value={videoConfidence}
                    onChange={(e) => setVideoConfidence(Number(e.target.value))}
                    className="mt-1.5 w-full accent-teal-600" />
                </label>
              </div>

              {/* Process button */}
              <button
                onClick={() => videoUploadMutation.mutate()}
                disabled={!videoFile || videoUploadMutation.isPending || !!videoProcessing}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
              >
                {videoUploadMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Process Video
              </button>

              {/* Error */}
              {videoError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                  {videoError}
                </div>
              )}
            </div>
          )}

          {/* ── Model settings (Camera + Image only) ──────────── */}
          {(tab === "camera" || tab === "image") && (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Model Settings</h4>
                <select value={modelSource} onChange={(e) => setModelSource(e.target.value)}
                  className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none transition focus:border-teal-500">
                  <option value="local_onnx">Local ONNX</option>
                  <option value="roboflow">Roboflow API</option>
                </select>
                <label className="block text-xs text-gray-500">
                  Confidence Threshold ({confidence.toFixed(2)})
                  <input type="range" min={0.1} max={1} step={0.05} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="mt-1.5 w-full accent-teal-600" />
                </label>
              </div>

              {/* Validation */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <label className="mb-3 flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <input type="checkbox" checked={runValidation} onChange={(e) => setRunValidation(e.target.checked)} className="rounded accent-teal-600" />
                  4-Layer Validation Pipeline
                </label>
                {runValidation && (
                  <div className="space-y-2 text-xs">
                    {[
                      { label: "L1 Conf", on: l1On, setOn: setL1On, val: l1Conf, setVal: setL1Conf, min: 0.1, max: 1, step: 0.05, fmt: (v: number) => v.toFixed(2) },
                      { label: "L2 Area%", on: l2On, setOn: setL2On, val: l2Area, setVal: setL2Area, min: 0.01, max: 10, step: 0.1, fmt: (v: number) => v.toFixed(1) },
                      { label: "L4 Delta", on: l4On, setOn: setL4On, val: l4Delta, setVal: setL4Delta, min: 0.01, max: 0.5, step: 0.01, fmt: (v: number) => v.toFixed(2) },
                    ].map((s) => (
                      <div key={s.label} className="flex items-center gap-2">
                        <input type="checkbox" checked={s.on} onChange={(e) => s.setOn(e.target.checked)} className="rounded accent-teal-600" />
                        <span className="w-16 text-gray-600">{s.label}</span>
                        <span className="w-10 text-right font-mono text-gray-900">{s.fmt(s.val)}</span>
                        <input type="range" min={s.min} max={s.max} step={s.step} value={s.val} onChange={(e) => s.setVal(Number(e.target.value))} className="flex-1 accent-teal-600" />
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={l3On} onChange={(e) => setL3On(e.target.checked)} className="rounded accent-teal-600" />
                      <span className="text-gray-600">L3 K={l3K} of M={l3M}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Run button */}
              <button onClick={() => testMutation.mutate()} disabled={!canTest || testMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50">
                {testMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Run Inference
              </button>
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* Right: Results                                         */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div>
          {/* ── Camera / Image results ─────────────────────────── */}
          {(tab === "camera" || tab === "image") && (
            <>
              {!result ? (
                <div className="flex h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white">
                  <Upload size={36} className="mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500">Upload an image to test</p>
                  <p className="mt-1 text-xs text-gray-400">Select source and run inference to see results</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Annotated frame */}
                  {result.annotated_frame_base64 && (
                    <img src={`data:image/jpeg;base64,${result.annotated_frame_base64}`} alt="Annotated" className="w-full rounded-xl border border-gray-200 shadow-sm" />
                  )}

                  {/* Stats row */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className={`rounded-xl p-4 text-center ${result.is_wet ? "bg-red-50" : "bg-green-50"}`}>
                      <p className={`text-lg font-bold ${result.is_wet ? "text-red-600" : "text-green-600"}`}>{result.is_wet ? "WET" : "DRY"}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Confidence</p>
                      <p className="text-lg font-bold text-gray-900">{(result.confidence * 100).toFixed(1)}%</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Time</p>
                      <p className="text-lg font-bold text-gray-900">{result.inference_time_ms.toFixed(0)}ms</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Model</p>
                      <p className="text-sm font-bold text-gray-900">{result.model_source}</p>
                    </div>
                  </div>

                  {/* Validation pipeline */}
                  {result.validation && (
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Validation Pipeline</h4>
                      <div className="flex gap-2.5">
                        {[1, 2, 3, 4].map((l) => {
                          const fl = result.validation!.failed_at_layer;
                          const ok = fl === null || l < fl;
                          return (
                            <div key={l} className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl p-3 text-xs font-medium ${fl === l ? "bg-red-50 text-red-600" : ok ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-400"}`}>
                              {ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
                              L{l}
                            </div>
                          );
                        })}
                      </div>
                      {result.validation.reason && <p className="mt-2.5 text-xs text-gray-500">{result.validation.reason}</p>}
                    </div>
                  )}

                  {/* Predictions table */}
                  {result.predictions.length > 0 && (
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Predictions</h4>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="pb-2 text-left text-gray-500">Class</th>
                            <th className="pb-2 text-right text-gray-500">Conf</th>
                            <th className="pb-2 text-right text-gray-500">Area%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.predictions.map((p, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="py-2 font-medium text-gray-900">{p.class_name}</td>
                              <td className="py-2 text-right text-gray-600">{(p.confidence * 100).toFixed(1)}%</td>
                              <td className="py-2 text-right text-gray-600">{p.area_percent?.toFixed(1) ?? "\u2014"}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Save button */}
                  <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                    className="flex items-center gap-2 rounded-xl border border-teal-500 px-5 py-2.5 text-xs font-medium text-teal-600 transition hover:bg-teal-50 disabled:opacity-50">
                    <Save size={14} /> Save to Dataset
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Video results ──────────────────────────────────── */}
          {tab === "video" && (
            <div className="space-y-4">
              {/* Empty state */}
              {!videoJobResult && !videoUploadMutation.isPending && (
                <div className="flex h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white">
                  <Video size={36} className="mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500">Upload a video to test</p>
                  <p className="mt-1 text-xs text-gray-400">Select a video file and click Process to run frame-by-frame inference</p>
                </div>
              )}

              {/* Uploading state */}
              {videoUploadMutation.isPending && (
                <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
                  <Loader2 size={32} className="mb-3 animate-spin text-teal-500" />
                  <p className="text-sm font-medium text-gray-700">Uploading video...</p>
                  <p className="mt-1 text-xs text-gray-400">This may take a moment for large files</p>
                </div>
              )}

              {/* Processing state */}
              {videoProcessing && !videoUploadMutation.isPending && (
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <Loader2 size={20} className="animate-spin text-teal-500" />
                    <span className="text-sm font-medium text-gray-700">Processing video...</span>
                  </div>
                  {videoJobResult?.progress && (
                    <>
                      <div className="mb-2 flex justify-between text-xs text-gray-500">
                        <span>
                          Processing frame {videoJobResult.progress.current_frame}/{videoJobResult.progress.total_frames}
                        </span>
                        <span>{videoJobResult.progress.detection_count} detections</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-teal-500 transition-all duration-300"
                          style={{
                            width: `${videoJobResult.progress.total_frames > 0
                              ? (videoJobResult.progress.current_frame / videoJobResult.progress.total_frames) * 100
                              : 0}%`,
                          }}
                        />
                      </div>
                    </>
                  )}
                  {!videoJobResult?.progress && (
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full w-1/4 animate-pulse rounded-full bg-teal-300" />
                    </div>
                  )}
                </div>
              )}

              {/* Completed: Video Player + Canvas Overlay */}
              {videoComplete && videoBlobUrl && (
                <>
                  {/* Player container */}
                  <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-black">
                    <video
                      ref={videoRef}
                      src={videoBlobUrl}
                      className="w-full block"
                      onPlay={() => setVideoPlaying(true)}
                      onPause={() => setVideoPlaying(false)}
                      onEnded={() => setVideoPlaying(false)}
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute top-0 left-0 w-full h-full pointer-events-none"
                    />
                  </div>

                  {/* Playback controls */}
                  <div className="flex items-center gap-3">
                    <button onClick={togglePlayback}
                      className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-teal-700">
                      {videoPlaying ? <Pause size={14} /> : <Play size={14} />}
                      {videoPlaying ? "Pause" : "Play"}
                    </button>
                    <button onClick={() => setShowAnnotations(!showAnnotations)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${showAnnotations ? "border-teal-500 bg-teal-50 text-teal-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                      {showAnnotations ? <Eye size={14} /> : <EyeOff size={14} />}
                      Annotations
                    </button>
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-400">
                        Filter Conf ({playbackConfFilter.toFixed(2)})
                      </label>
                      <input type="range" min={0} max={1} step={0.05} value={playbackConfFilter}
                        onChange={(e) => setPlaybackConfFilter(Number(e.target.value))}
                        className="w-full accent-teal-600" />
                    </div>
                  </div>

                  {/* Detection Timeline */}
                  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Detection Timeline</h4>
                    <div
                      className="relative h-6 w-full cursor-pointer overflow-hidden rounded-full bg-gray-100"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = (e.clientX - rect.left) / rect.width;
                        seekToMs(pct * (videoJobResult!.result!.duration_ms || 1));
                      }}
                    >
                      {segments.map((seg, i) => {
                        const totalMs = videoJobResult!.result!.duration_ms || 1;
                        const left = (seg.start_ms / totalMs) * 100;
                        const width = ((seg.end_ms - seg.start_ms) / totalMs) * 100;
                        return (
                          <div
                            key={i}
                            className={`absolute top-0 h-full ${seg.is_wet ? "bg-red-400" : "bg-green-400"}`}
                            style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                            title={`${seg.is_wet ? "Wet" : "Dry"}: ${formatMs(seg.start_ms)} - ${formatMs(seg.end_ms)}`}
                          />
                        );
                      })}
                      {/* Playhead */}
                      <VideoPlayhead videoRef={videoRef} durationMs={videoJobResult!.result!.duration_ms || 1} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10px] text-gray-400">
                      <span>0:00</span>
                      <span className="flex items-center gap-3">
                        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" /> Wet</span>
                        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-400" /> Dry</span>
                      </span>
                      <span>{formatMs(videoJobResult!.result!.duration_ms)}</span>
                    </div>
                  </div>

                  {/* Stats Panel */}
                  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Video Analysis Stats</h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl bg-red-50 p-3 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-red-500">Wet Frames</p>
                        <p className="text-lg font-bold text-red-600">{videoJobResult!.result!.wet_frame_count}</p>
                      </div>
                      <div className="rounded-xl bg-green-50 p-3 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-green-500">Dry Frames</p>
                        <p className="text-lg font-bold text-green-600">{videoJobResult!.result!.dry_frame_count}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 p-3 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Max Confidence</p>
                        <p className="text-lg font-bold text-gray-900">{(videoJobResult!.result!.max_confidence * 100).toFixed(1)}%</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 p-3 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Avg Inference</p>
                        <p className="text-lg font-bold text-gray-900">{videoJobResult!.result!.avg_inference_time_ms.toFixed(0)}ms</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                        <p className="text-[10px] text-gray-500">Total Frames</p>
                        <p className="text-sm font-bold text-gray-900">{videoJobResult!.result!.total_frames}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                        <p className="text-[10px] text-gray-500">Duration</p>
                        <p className="text-sm font-bold text-gray-900">{formatMs(videoJobResult!.result!.duration_ms)}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                        <p className="text-[10px] text-gray-500">Detection Segments</p>
                        <p className="text-sm font-bold text-gray-900">{segments.filter(s => s.is_wet).length}</p>
                      </div>
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => videoDeleteMutation.mutate()}
                    disabled={videoDeleteMutation.isPending}
                    className="flex items-center gap-2 rounded-xl border border-red-300 px-5 py-2.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    {videoDeleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete Job &amp; Video
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Playhead Sub-component ───────────────────────────────────────── */

function VideoPlayhead({ videoRef, durationMs }: { videoRef: React.RefObject<HTMLVideoElement | null>; durationMs: number }) {
  const [pct, setPct] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    function tick() {
      const v = videoRef.current;
      if (v && durationMs > 0) {
        setPct(Math.min((v.currentTime * 1000) / durationMs, 1) * 100);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoRef, durationMs]);

  return (
    <div
      className="absolute top-0 h-full w-0.5 bg-gray-800 transition-none"
      style={{ left: `${pct}%` }}
    />
  );
}
