import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, SkipForward, Trash2, Loader2, PenTool, ChevronLeft, ChevronRight, Undo2, Redo2 } from "lucide-react";
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

// Resize handle positions: 0-3 corners (TL, TR, BL, BR), 4-7 edges (T, L, R, B)
const HANDLE_SIZE = 8;
const HANDLE_HIT = 6;
const HANDLE_CURSORS = ["nwse-resize", "nesw-resize", "nesw-resize", "nwse-resize", "ns-resize", "ew-resize", "ew-resize", "ns-resize"];

function getHandlePositions(bx: number, by: number, bw: number, bh: number) {
  return [
    { x: bx, y: by },                    // 0: top-left
    { x: bx + bw, y: by },               // 1: top-right
    { x: bx, y: by + bh },               // 2: bottom-left
    { x: bx + bw, y: by + bh },          // 3: bottom-right
    { x: bx + bw / 2, y: by },           // 4: top-mid
    { x: bx, y: by + bh / 2 },           // 5: left-mid
    { x: bx + bw, y: by + bh / 2 },      // 6: right-mid
    { x: bx + bw / 2, y: by + bh },      // 7: bottom-mid
  ];
}

function deepCloneAnnotations(anns: Annotation[]): Annotation[] {
  return anns.map((a) => ({
    ...a,
    bbox: { ...a.bbox },
  }));
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
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const [newClassName, setNewClassName] = useState("detection");
  const [zoom, setZoom] = useState(1);

  // Resize state
  const [resizing, setResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<number | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<number | null>(null);

  // Undo/Redo stacks (per-frame)
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);

  // Load queue of frames needing review
  const { isLoading } = useQuery({
    queryKey: ["learning-annotate-queue"],
    queryFn: async () => {
      const r = await api.get("/learning/frames", {
        params: { label_status: "auto_labeled", limit: 50 },
      });
      const data = r.data.data as LearningFrame[];
      setFrames(data);
      const classes = new Set<string>();
      data.forEach((f) => f.annotations?.forEach((a) => classes.add(a.class_name)));
      setClassList([...classes].sort());
      return data;
    },
  });

  const current = frames[currentIdx] ?? null;

  // Reset undo/redo when switching frames
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    setSelectedBox(null);
    setResizing(false);
    setResizeHandle(null);
  }, [currentIdx]);

  // Helper: convert bbox to pixel coordinates
  function bboxToPixels(ann: Annotation, cw: number, ch: number) {
    const { x, y, w, h } = ann.bbox;
    const bx = x <= 1 ? (x - w / 2) * cw : x;
    const by = y <= 1 ? (y - h / 2) * ch : y;
    const bw = w <= 1 ? w * cw : w;
    const bh = h <= 1 ? h * ch : h;
    return { bx, by, bw, bh };
  }

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
      const { bx, by, bw, bh } = bboxToPixels(ann, canvas.width, canvas.height);

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

      // Resize handles for selected box
      if (isSelected) {
        const handles = getHandlePositions(bx, by, bw, bh);
        handles.forEach((hp, hi) => {
          ctx.fillStyle = hoveredHandle === hi ? "#0D9488" : "white";
          ctx.strokeStyle = "#1F2937";
          ctx.lineWidth = 1;
          ctx.fillRect(hp.x - HANDLE_SIZE / 2, hp.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
          ctx.strokeRect(hp.x - HANDLE_SIZE / 2, hp.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        });
      }
    });
  }, [current, selectedBox, hoveredHandle]);

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

  const saveAnnotationsMutation = useMutation({
    mutationFn: async (annotations: Annotation[]) => {
      if (!current) return;
      await api.put(`/learning/frames/${current.id}`, {
        annotations: annotations.map((a) => ({
          class_name: a.class_name, confidence: a.confidence,
          bbox: a.bbox, source: a.source, is_correct: a.is_correct,
        })),
        label_status: "human_corrected",
      });
    },
    onSuccess: () => success("Annotations saved"),
    onError: () => showError("Save failed"),
  });

  // Push current annotations to undo stack before any mutation
  function pushUndo() {
    if (!current) return;
    setUndoStack((prev) => [...prev, deepCloneAnnotations(current.annotations ?? [])]);
    setRedoStack([]);
  }

  function updateAnnotations(updated: Annotation[], save = true) {
    const updatedFrames = [...frames];
    updatedFrames[currentIdx] = { ...current!, annotations: updated };
    setFrames(updatedFrames);
    if (save) saveAnnotationsMutation.mutate(updated);
  }

  function undo() {
    if (!current || undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, deepCloneAnnotations(current.annotations ?? [])]);
    updateAnnotations(prev);
    setSelectedBox(null);
  }

  function redo() {
    if (!current || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, deepCloneAnnotations(current.annotations ?? [])]);
    updateAnnotations(next);
    setSelectedBox(null);
  }

  function addBox(x: number, y: number, w: number, h: number) {
    if (!current || !canvasRef.current) return;
    pushUndo();
    const cw = canvasRef.current.width;
    const ch = canvasRef.current.height;
    const newAnn: Annotation = {
      class_name: newClassName,
      confidence: 1.0,
      bbox: { x: (x + w / 2) / cw, y: (y + h / 2) / ch, w: w / cw, h: h / ch },
      source: "human",
      is_correct: true,
    };
    const updated = [...(current.annotations ?? []), newAnn];
    updateAnnotations(updated);
    setSelectedBox(updated.length - 1);
  }

  function deleteSelectedBox() {
    if (!current || selectedBox === null) return;
    pushUndo();
    const updated = [...(current.annotations ?? [])];
    updated.splice(selectedBox, 1);
    updateAnnotations(updated);
    setSelectedBox(null);
  }

  function changeBoxClass(newClass: string) {
    if (!current || selectedBox === null) return;
    pushUndo();
    const updated = [...(current.annotations ?? [])];
    updated[selectedBox] = { ...updated[selectedBox], class_name: newClass };
    updateAnnotations(updated);
  }

  function advance() {
    if (currentIdx < frames.length - 1) setCurrentIdx(currentIdx + 1);
    setSelectedBox(null);
    setDrawingMode(false);
  }

  // Get pixel coords from mouse event
  function getCanvasCoords(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { cx: 0, cy: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { cx: (e.clientX - rect.left) * scaleX, cy: (e.clientY - rect.top) * scaleY };
  }

  // Check if point is over a resize handle
  function hitTestHandle(cx: number, cy: number): number | null {
    if (selectedBox === null || !current || !canvasRef.current) return null;
    const ann = current.annotations?.[selectedBox];
    if (!ann) return null;
    const { bx, by, bw, bh } = bboxToPixels(ann, canvasRef.current.width, canvasRef.current.height);
    const handles = getHandlePositions(bx, by, bw, bh);
    for (let i = 0; i < handles.length; i++) {
      if (Math.abs(cx - handles[i].x) <= HANDLE_HIT && Math.abs(cy - handles[i].y) <= HANDLE_HIT) {
        return i;
      }
    }
    return null;
  }

  // Apply resize: given handle index and new mouse position, compute new bbox
  function applyResize(handleIdx: number, cx: number, cy: number) {
    if (selectedBox === null || !current || !canvasRef.current) return;
    const ann = current.annotations![selectedBox];
    const cw = canvasRef.current.width;
    const ch = canvasRef.current.height;
    const { bx, by, bw, bh } = bboxToPixels(ann, cw, ch);

    let newX = bx, newY = by, newW = bw, newH = bh;

    // Corners: move that corner, opposite stays
    if (handleIdx === 0) { newW = bx + bw - cx; newH = by + bh - cy; newX = cx; newY = cy; }       // TL
    else if (handleIdx === 1) { newW = cx - bx; newH = by + bh - cy; newY = cy; }                    // TR
    else if (handleIdx === 2) { newW = bx + bw - cx; newH = cy - by; newX = cx; }                    // BL
    else if (handleIdx === 3) { newW = cx - bx; newH = cy - by; }                                    // BR
    // Edges: move one edge
    else if (handleIdx === 4) { newH = by + bh - cy; newY = cy; }                                    // Top
    else if (handleIdx === 5) { newW = bx + bw - cx; newX = cx; }                                    // Left
    else if (handleIdx === 6) { newW = cx - bx; }                                                    // Right
    else if (handleIdx === 7) { newH = cy - by; }                                                    // Bottom

    // Enforce minimum size
    if (newW < 10) newW = 10;
    if (newH < 10) newH = 10;

    // Convert back to normalized center coords
    const normCx = (newX + newW / 2) / cw;
    const normCy = (newY + newH / 2) / ch;
    const normW = newW / cw;
    const normH = newH / ch;

    const updated = [...(current.annotations ?? [])];
    updated[selectedBox] = { ...updated[selectedBox], bbox: { x: normCx, y: normCy, w: normW, h: normH } };
    // Update in place without saving (save on mouseup)
    const updatedFrames = [...frames];
    updatedFrames[currentIdx] = { ...current, annotations: updated };
    setFrames(updatedFrames);
  }

  // Canvas mouse handlers
  function onCanvasMouseDown(e: React.MouseEvent) {
    const { cx, cy } = getCanvasCoords(e);

    // Check resize handles first
    if (!drawingMode && selectedBox !== null) {
      const handle = hitTestHandle(cx, cy);
      if (handle !== null) {
        pushUndo();
        setResizing(true);
        setResizeHandle(handle);
        return;
      }
    }

    // Drawing mode
    if (drawingMode && canvasRef.current) {
      setDrawStart({ x: cx, y: cy });
      setDrawEnd(null);
      return;
    }

    // Click to select
    if (!drawingMode && current && canvasRef.current) {
      const canvas = canvasRef.current;
      const idx = (current.annotations ?? []).findIndex((a) => {
        const { bx, by, bw, bh } = bboxToPixels(a, canvas.width, canvas.height);
        return cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh;
      });
      setSelectedBox(idx >= 0 ? idx : null);
    }
  }

  function onCanvasMouseMove(e: React.MouseEvent) {
    const { cx, cy } = getCanvasCoords(e);

    // Resizing
    if (resizing && resizeHandle !== null) {
      applyResize(resizeHandle, cx, cy);
      return;
    }

    // Drawing preview
    if (drawingMode && drawStart && canvasRef.current) {
      setDrawEnd({ x: cx, y: cy });
      drawCanvas();
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#F59E0B";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(drawStart.x, drawStart.y, cx - drawStart.x, cy - drawStart.y);
        ctx.setLineDash([]);
      }
      return;
    }

    // Handle hover detection (for cursor)
    if (!drawingMode && selectedBox !== null) {
      const handle = hitTestHandle(cx, cy);
      setHoveredHandle(handle);
    }
  }

  function onCanvasMouseUp() {
    // Finish resize
    if (resizing && current) {
      setResizing(false);
      setResizeHandle(null);
      saveAnnotationsMutation.mutate(current.annotations ?? []);
      return;
    }

    // Finish drawing
    if (drawingMode && drawStart && drawEnd) {
      const x = Math.min(drawStart.x, drawEnd.x);
      const y = Math.min(drawStart.y, drawEnd.y);
      const w = Math.abs(drawEnd.x - drawStart.x);
      const h = Math.abs(drawEnd.y - drawStart.y);
      if (w > 10 && h > 10) addBox(x, y, w, h);
    }
    setDrawStart(null);
    setDrawEnd(null);
  }

  // Determine cursor
  function getCanvasCursor() {
    if (resizing && resizeHandle !== null) return HANDLE_CURSORS[resizeHandle];
    if (hoveredHandle !== null) return HANDLE_CURSORS[hoveredHandle];
    if (drawingMode) return "crosshair";
    return "pointer";
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      // Redo: Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Z") {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === "c" || e.key === "C") confirmMutation.mutate();
      else if (e.key === "s" || e.key === "S") advance();
      else if (e.key === "d" || e.key === "D") deleteMutation.mutate();
      else if (e.key === "f" || e.key === "F") falsePositiveMutation.mutate();
      else if (e.key === "b" || e.key === "B") setDrawingMode(!drawingMode);
      else if (e.key === "Delete" || e.key === "Backspace") deleteSelectedBox();
      else if (e.key === "ArrowRight") { if (currentIdx < frames.length - 1) setCurrentIdx(currentIdx + 1); }
      else if (e.key === "ArrowLeft") { if (currentIdx > 0) setCurrentIdx(currentIdx - 1); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIdx, frames.length, undoStack.length, redoStack.length]);

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
          Keys: <kbd className="rounded bg-gray-100 px-1">C</kbd> Confirm · <kbd className="rounded bg-gray-100 px-1">F</kbd> FP · <kbd className="rounded bg-gray-100 px-1">S</kbd> Skip · <kbd className="rounded bg-gray-100 px-1">D</kbd> Delete · <kbd className="rounded bg-gray-100 px-1">B</kbd> Draw · <kbd className="rounded bg-gray-100 px-1">Del</kbd> Remove Box · <kbd className="rounded bg-gray-100 px-1">Ctrl+Z</kbd> Undo · Scroll = Zoom
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
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-900" style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <canvas
              ref={canvasRef}
              className="w-full"
              style={{ cursor: getCanvasCursor() }}
              onMouseDown={onCanvasMouseDown}
              onMouseMove={onCanvasMouseMove}
              onMouseUp={onCanvasMouseUp}
              onMouseLeave={() => { setHoveredHandle(null); if (resizing) onCanvasMouseUp(); }}
              onWheel={(e) => {
                e.preventDefault();
                setZoom((z) => Math.max(0.5, Math.min(3, z + (e.deltaY < 0 ? 0.1 : -0.1))));
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

            {/* Drawing tools */}
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">Tools</h3>
              <div className="space-y-2">
                <button onClick={() => setDrawingMode(!drawingMode)}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition ${drawingMode ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                  <PenTool size={14} /> {drawingMode ? "Drawing Mode ON" : "Draw Box (B)"}
                </button>
                {drawingMode && (
                  <div>
                    <label className="mb-1 block text-[10px] text-gray-500">Class for new box:</label>
                    <select value={newClassName} onChange={(e) => setNewClassName(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-teal-500 focus:outline-none">
                      {(classList.length > 0 ? classList : ["detection"]).map((c) => <option key={c} value={c}>{c}</option>)}
                      <option value="detection">detection</option>
                    </select>
                  </div>
                )}
                {selectedBox !== null && (
                  <>
                    <div>
                      <label className="mb-1 block text-[10px] text-gray-500">Change class:</label>
                      <select value={current?.annotations?.[selectedBox]?.class_name ?? ""} onChange={(e) => changeBoxClass(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-teal-500 focus:outline-none">
                        {(classList.length > 0 ? classList : ["detection"]).map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <button onClick={deleteSelectedBox}
                      className="flex w-full items-center justify-center gap-1 rounded-lg bg-red-100 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200">
                      <Trash2 size={12} /> Delete Selected Box (Del)
                    </button>
                  </>
                )}

                {/* Undo / Redo */}
                <div className="flex gap-2">
                  <button onClick={undo} disabled={undoStack.length === 0}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gray-100 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-30">
                    <Undo2 size={12} /> Undo{undoStack.length > 0 ? ` (${undoStack.length})` : ""}
                  </button>
                  <button onClick={redo} disabled={redoStack.length === 0}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gray-100 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-30">
                    <Redo2 size={12} /> Redo{redoStack.length > 0 ? ` (${redoStack.length})` : ""}
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
                  <button onClick={() => setZoom(1)} className="text-teal-600 hover:underline">Reset</button>
                </div>
              </div>
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
