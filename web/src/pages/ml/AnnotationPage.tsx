import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Square,
  Pentagon,
  Undo2,
  Redo2,
  Save,
  SkipForward,
  Trash2,
  Loader2,
  Sparkles,
} from "lucide-react";

import api from "@/lib/api";

const CLASSES = [
  { id: "wet_floor", name: "wet_floor", color: "#DC2626" },
  { id: "dry_floor", name: "dry_floor", color: "#16A34A" },
  { id: "spill", name: "spill", color: "#F59E0B" },
  { id: "puddle", name: "puddle", color: "#3B82F6" },
];

interface Annotation {
  class_id: string;
  class_name: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

interface DrawState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export default function AnnotationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [selectedClass, setSelectedClass] = useState(CLASSES[0].id);
  const [tool, setTool] = useState<"rect" | "polygon">("rect");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);
  const [drawing, setDrawing] = useState<DrawState | null>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });

  // Load frame data
  const { data: frame, isLoading } = useQuery({
    queryKey: ["frame-detail", id],
    queryFn: async () => {
      const res = await api.get(`/dataset/frames/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  // Load existing annotations / predictions
  const { data: existingAnnotations } = useQuery({
    queryKey: ["frame-annotations", id],
    queryFn: async () => {
      const res = await api.get(`/annotations/frames/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  // Populate existing annotations on load
  useEffect(() => {
    if (existingAnnotations?.annotations?.length) {
      setAnnotations(existingAnnotations.annotations);
    }
  }, [existingAnnotations]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/annotations/frames/${id}/annotate`, {
        annotations,
      });
      return res.data;
    },
  });

  // Image load handler
  const handleImageLoad = useCallback(() => {
    if (imgRef.current) {
      setImgSize({
        width: imgRef.current.naturalWidth,
        height: imgRef.current.naturalHeight,
      });
    }
  }, []);

  // Undo / Redo
  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev, annotations]);
    setRedoStack([]);
  }, [annotations]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, annotations]);
    setUndoStack((u) => u.slice(0, -1));
    setAnnotations(prev);
  }, [undoStack, annotations]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, annotations]);
    setRedoStack((r) => r.slice(0, -1));
    setAnnotations(next);
  }, [redoStack, annotations]);

  // Mouse events for bounding box drawing
  const getRelativeCoords = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (tool !== "rect") return;
      const { x, y } = getRelativeCoords(e);
      setDrawing({ startX: x, startY: y, currentX: x, currentY: y });
    },
    [tool, getRelativeCoords]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing) return;
      const { x, y } = getRelativeCoords(e);
      setDrawing((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null));
    },
    [drawing, getRelativeCoords]
  );

  const handleMouseUp = useCallback(() => {
    if (!drawing) return;
    const { startX, startY, currentX, currentY } = drawing;
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);

    // Ignore tiny accidental clicks
    if (w > 0.005 && h > 0.005) {
      const cx = Math.min(startX, currentX) + w / 2;
      const cy = Math.min(startY, currentY) + h / 2;
      const cls = CLASSES.find((c) => c.id === selectedClass) ?? CLASSES[0];

      pushUndo();
      setAnnotations((prev) => [
        ...prev,
        { class_id: cls.id, class_name: cls.name, cx, cy, w, h },
      ]);
    }

    setDrawing(null);
  }, [drawing, selectedClass, pushUndo]);

  const handleDelete = useCallback(
    (index: number) => {
      pushUndo();
      setAnnotations((prev) => prev.filter((_, i) => i !== index));
    },
    [pushUndo]
  );

  // Add predictions as annotations
  const handleAddPredictions = useCallback(() => {
    if (!frame?.predictions?.length) return;
    pushUndo();
    const preds: Annotation[] = frame.predictions.map((p: any) => ({
      class_id: p.class_name,
      class_name: p.class_name,
      cx: p.bbox ? (p.bbox.x + p.bbox.w / 2) / (imgSize.width || 1) : 0.5,
      cy: p.bbox ? (p.bbox.y + p.bbox.h / 2) / (imgSize.height || 1) : 0.5,
      w: p.bbox ? p.bbox.w / (imgSize.width || 1) : 0.1,
      h: p.bbox ? p.bbox.h / (imgSize.height || 1) : 0.1,
    }));
    setAnnotations((prev) => [...prev, ...preds]);
  }, [frame, pushUndo, imgSize]);

  const getClassColor = (classId: string) => {
    return CLASSES.find((c) => c.id === classId)?.color ?? "#78716C";
  };

  const frameSrc = frame?.frame_base64
    ? `data:image/jpeg;base64,${frame.frame_base64}`
    : frame?.frame_path ?? "";

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#0D9488]" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#E7E5E0] bg-white px-4 py-2">
        <button
          onClick={() => navigate("/dataset")}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[#78716C] hover:bg-[#F1F0ED]"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="h-5 w-px bg-[#E7E5E0]" />

        {/* Frame info */}
        <div className="flex items-center gap-2 text-xs text-[#78716C]">
          <span className="font-mono">{id?.slice(0, 8)}</span>
          {frame?.camera_id && <span>Camera: {frame.camera_id.slice(0, 8)}</span>}
          {frame?.store_id && <span>Store: {frame.store_id.slice(0, 8)}</span>}
          {frame?.created_at && (
            <span>{new Date(frame.created_at).toLocaleString()}</span>
          )}
        </div>

        <div className="h-5 w-px bg-[#E7E5E0]" />

        {/* Class selector */}
        <div>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="rounded-md border border-[#E7E5E0] px-2 py-1 text-sm outline-none focus:border-[#0D9488]"
          >
            {CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tool selector */}
        <div className="flex rounded-md border border-[#E7E5E0]">
          <button
            onClick={() => setTool("rect")}
            className={`flex items-center gap-1 px-2 py-1 text-sm ${
              tool === "rect"
                ? "bg-[#0D9488] text-white"
                : "text-[#78716C] hover:bg-[#F1F0ED]"
            } rounded-l-md`}
          >
            <Square size={14} />
            Rect
          </button>
          <button
            onClick={() => setTool("polygon")}
            className={`flex items-center gap-1 px-2 py-1 text-sm ${
              tool === "polygon"
                ? "bg-[#0D9488] text-white"
                : "text-[#78716C] hover:bg-[#F1F0ED]"
            } rounded-r-md`}
            disabled
            title="Polygon tool — coming soon"
          >
            <Pentagon size={14} />
            Poly
          </button>
        </div>

        <div className="h-5 w-px bg-[#E7E5E0]" />

        {/* Undo / Redo */}
        <button
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          className="rounded-md p-1 text-[#78716C] hover:bg-[#F1F0ED] disabled:opacity-30"
          title="Undo"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className="rounded-md p-1 text-[#78716C] hover:bg-[#F1F0ED] disabled:opacity-30"
          title="Redo"
        >
          <Redo2 size={16} />
        </button>

        <div className="flex-1" />

        {/* Save / Skip */}
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-1 rounded-md bg-[#0D9488] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
        >
          {saveMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Save
        </button>
        <button
          onClick={() => navigate("/dataset")}
          className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm text-[#78716C] hover:bg-[#F1F0ED]"
        >
          <SkipForward size={14} />
          Skip
        </button>
      </div>

      {/* Save feedback */}
      {saveMutation.isSuccess && (
        <div className="bg-[#DCFCE7] px-4 py-1.5 text-sm text-[#16A34A]">
          Annotations saved successfully.
        </div>
      )}
      {saveMutation.isError && (
        <div className="bg-[#FEE2E2] px-4 py-1.5 text-sm text-[#DC2626]">
          Failed to save annotations.
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-[#1C1917] p-4">
          <div
            ref={canvasRef}
            className="relative mx-auto inline-block cursor-crosshair select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setDrawing(null)}
          >
            {frameSrc ? (
              <img
                ref={imgRef}
                src={frameSrc}
                alt="Frame"
                className="max-h-[calc(100vh-10rem)] max-w-full"
                onLoad={handleImageLoad}
                draggable={false}
              />
            ) : (
              <div className="flex h-96 w-[640px] items-center justify-center bg-[#292524] text-sm text-[#78716C]">
                No frame image available
              </div>
            )}

            {/* Existing annotations */}
            {annotations.map((ann, i) => {
              const left = (ann.cx - ann.w / 2) * 100;
              const top = (ann.cy - ann.h / 2) * 100;
              const width = ann.w * 100;
              const height = ann.h * 100;
              const color = getClassColor(ann.class_id);

              return (
                <div
                  key={i}
                  className="pointer-events-none absolute"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    border: `2px solid ${color}`,
                    backgroundColor: `${color}20`,
                  }}
                >
                  <span
                    className="absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[10px] font-medium text-white"
                    style={{ backgroundColor: color }}
                  >
                    {ann.class_name}
                  </span>
                </div>
              );
            })}

            {/* Drawing preview */}
            {drawing && (
              <div
                className="pointer-events-none absolute border-2 border-dashed"
                style={{
                  left: `${Math.min(drawing.startX, drawing.currentX) * 100}%`,
                  top: `${Math.min(drawing.startY, drawing.currentY) * 100}%`,
                  width: `${Math.abs(drawing.currentX - drawing.startX) * 100}%`,
                  height: `${Math.abs(drawing.currentY - drawing.startY) * 100}%`,
                  borderColor: getClassColor(selectedClass),
                  backgroundColor: `${getClassColor(selectedClass)}15`,
                }}
              />
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-64 flex-shrink-0 overflow-y-auto border-l border-[#E7E5E0] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">
            Annotations ({annotations.length})
          </h3>

          {annotations.length === 0 ? (
            <p className="text-xs text-[#78716C]">
              Draw bounding boxes on the image to create annotations.
            </p>
          ) : (
            <div className="space-y-2">
              {annotations.map((ann, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border border-[#E7E5E0] px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: getClassColor(ann.class_id) }}
                    />
                    <span className="text-xs font-medium text-[#1C1917]">
                      {ann.class_name}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(i)}
                    className="rounded p-0.5 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 border-t border-[#E7E5E0] pt-4">
            <button
              onClick={handleAddPredictions}
              disabled={!frame?.predictions?.length}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#E7E5E0] px-3 py-2 text-sm text-[#78716C] hover:bg-[#F1F0ED] disabled:opacity-40"
            >
              <Sparkles size={14} />
              Add from Predictions
            </button>
          </div>

          {/* Legend */}
          <div className="mt-4 border-t border-[#E7E5E0] pt-4">
            <h4 className="mb-2 text-xs font-semibold text-[#78716C]">Legend</h4>
            <div className="space-y-1">
              {CLASSES.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs text-[#78716C]">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
