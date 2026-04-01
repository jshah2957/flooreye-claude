import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, SkipForward, Trash2, Loader2, PenTool, ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface Annotation {
  class_name: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  source: string;
  is_correct: boolean | null;
}

interface LearningFrame {
  id: string;
  frame_url?: string;
  annotations: Annotation[];
  label_status: string;
  admin_verdict: string | null;
  source: string;
  captured_at: string;
}

export default function AnnotationStudioPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [frames, setFrames] = useState<LearningFrame[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [classList, setClassList] = useState<string[]>([]);

  // Load queue of frames needing review
  const { isLoading } = useQuery({
    queryKey: ["learning-annotate-queue"],
    queryFn: async () => {
      const r = await api.get("/learning/frames", {
        params: { label_status: "auto_labeled", limit: 50 },
      });
      const data = r.data.data as LearningFrame[];
      setFrames(data);
      // Extract unique class names
      const classes = new Set<string>();
      data.forEach((f) => f.annotations?.forEach((a) => classes.add(a.class_name)));
      setClassList([...classes].sort());
      return data;
    },
  });

  const current = frames[currentIdx] ?? null;

  // Draw frame + bounding boxes on canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    // Draw bounding boxes
    (current.annotations ?? []).forEach((ann, i) => {
      const { x, y, w, h } = ann.bbox;
      // Bbox can be normalized (0-1) or pixel
      const bx = x <= 1 ? (x - w / 2) * canvas.width : x;
      const by = y <= 1 ? (y - h / 2) * canvas.height : y;
      const bw = w <= 1 ? w * canvas.width : w;
      const bh = h <= 1 ? h * canvas.height : h;

      const isSelected = selectedBox === i;
      ctx.strokeStyle = isSelected ? "#0D9488" : "#3B82F6";
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeRect(bx, by, bw, bh);

      // Label
      const label = `${ann.class_name} ${(ann.confidence * 100).toFixed(0)}%`;
      ctx.font = "14px sans-serif";
      const textW = ctx.measureText(label).width + 8;
      ctx.fillStyle = isSelected ? "#0D9488" : "#3B82F6";
      ctx.fillRect(bx, Math.max(0, by - 20), textW, 20);
      ctx.fillStyle = "white";
      ctx.fillText(label, bx + 4, Math.max(14, by - 5));
    });
  }, [current, selectedBox]);

  useEffect(() => {
    if (!current?.frame_url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { imgRef.current = img; drawCanvas(); };
    img.src = current.frame_url;
  }, [current?.frame_url, current?.id]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  // Mutations
  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!current) return;
      await api.put(`/learning/frames/${current.id}`, { label_status: "human_reviewed", admin_verdict: "true_positive" });
    },
    onSuccess: () => { success("Confirmed"); advance(); },
    onError: () => showError("Failed"),
  });

  const skipMutation = useMutation({
    mutationFn: async () => advance(),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!current) return;
      await api.delete(`/learning/frames/${current.id}`);
    },
    onSuccess: () => {
      success("Deleted");
      const next = [...frames];
      next.splice(currentIdx, 1);
      setFrames(next);
      if (currentIdx >= next.length) setCurrentIdx(Math.max(0, next.length - 1));
      queryClient.invalidateQueries({ queryKey: ["learning-annotate-queue"] });
    },
    onError: () => showError("Delete failed"),
  });

  const falsePositiveMutation = useMutation({
    mutationFn: async () => {
      if (!current) return;
      await api.put(`/learning/frames/${current.id}`, { label_status: "human_reviewed", admin_verdict: "false_positive" });
    },
    onSuccess: () => { success("Marked false positive"); advance(); },
    onError: () => showError("Failed"),
  });

  function advance() {
    if (currentIdx < frames.length - 1) setCurrentIdx(currentIdx + 1);
    setSelectedBox(null);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "c" || e.key === "C") confirmMutation.mutate();
      else if (e.key === "s" || e.key === "S") advance();
      else if (e.key === "d" || e.key === "D") deleteMutation.mutate();
      else if (e.key === "f" || e.key === "F") falsePositiveMutation.mutate();
      else if (e.key === "ArrowRight") { if (currentIdx < frames.length - 1) setCurrentIdx(currentIdx + 1); }
      else if (e.key === "ArrowLeft") { if (currentIdx > 0) setCurrentIdx(currentIdx - 1); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIdx, frames.length]);

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-teal-600" /></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Annotation Studio</h1>
          <p className="mt-1 text-sm text-gray-500">
            {frames.length > 0 ? `Frame ${currentIdx + 1} of ${frames.length} — review auto-labeled detections` : "No frames to review"}
          </p>
        </div>
        <div className="text-xs text-gray-400">
          Keys: <kbd className="rounded bg-gray-100 px-1">C</kbd> Confirm · <kbd className="rounded bg-gray-100 px-1">F</kbd> False Positive · <kbd className="rounded bg-gray-100 px-1">S</kbd> Skip · <kbd className="rounded bg-gray-100 px-1">D</kbd> Delete
        </div>
      </div>

      {frames.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
          <PenTool size={32} className="mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No frames to annotate</p>
          <p className="text-xs text-gray-400">Auto-labeled detections will appear here for review</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          {/* Canvas */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-900">
            <canvas ref={canvasRef} className="w-full cursor-crosshair"
              onClick={(e) => {
                if (!current || !canvasRef.current) return;
                const rect = canvasRef.current.getBoundingClientRect();
                const scaleX = canvasRef.current.width / rect.width;
                const scaleY = canvasRef.current.height / rect.height;
                const cx = (e.clientX - rect.left) * scaleX;
                const cy = (e.clientY - rect.top) * scaleY;
                // Find clicked box
                const idx = (current.annotations ?? []).findIndex((a) => {
                  const { x, y, w, h } = a.bbox;
                  const bx = x <= 1 ? (x - w / 2) * canvasRef.current!.width : x;
                  const by = y <= 1 ? (y - h / 2) * canvasRef.current!.height : y;
                  const bw = w <= 1 ? w * canvasRef.current!.width : w;
                  const bh = h <= 1 ? h * canvasRef.current!.height : h;
                  return cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh;
                });
                setSelectedBox(idx >= 0 ? idx : null);
              }}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            {/* Navigation */}
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <button disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)}
                className="rounded p-1 hover:bg-gray-200 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <span className="text-xs font-medium text-gray-600">{currentIdx + 1} / {frames.length}</span>
              <button disabled={currentIdx >= frames.length - 1} onClick={() => setCurrentIdx(currentIdx + 1)}
                className="rounded p-1 hover:bg-gray-200 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>

            {/* Annotations list */}
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">Annotations ({current?.annotations?.length ?? 0})</h3>
              {(current?.annotations ?? []).length === 0 ? (
                <p className="text-xs text-gray-400">No annotations on this frame</p>
              ) : (
                <div className="space-y-1.5">
                  {(current?.annotations ?? []).map((a, i) => (
                    <div key={i} onClick={() => setSelectedBox(i)}
                      className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs cursor-pointer transition ${selectedBox === i ? "bg-teal-50 ring-1 ring-teal-300" : "bg-gray-50 hover:bg-gray-100"}`}>
                      <span className="font-medium">{a.class_name}</span>
                      <span className="text-gray-500">{(a.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Source</span><span className="font-medium">{current?.source}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-gray-500">Status</span><span className="font-medium">{current?.label_status}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-gray-500">Captured</span><span className="font-medium">{current?.captured_at ? new Date(current.captured_at).toLocaleDateString() : "—"}</span></div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              <button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40">
                <Check size={16} /> Confirm Correct
              </button>
              <button onClick={() => falsePositiveMutation.mutate()} disabled={falsePositiveMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40">
                False Positive
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => advance()}
                  className="flex items-center justify-center gap-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <SkipForward size={14} /> Skip
                </button>
                <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
                  className="flex items-center justify-center gap-1 rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
