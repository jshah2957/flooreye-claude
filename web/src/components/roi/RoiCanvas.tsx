import { useRef, useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Undo2, Loader2 } from "lucide-react";

import api from "@/lib/api";

interface Point {
  x: number;
  y: number;
}

interface RoiCanvasProps {
  snapshotBase64?: string;
  initialPoints?: Point[];
  initialMaskOutside?: boolean;
  cameraId: string;
  onSave?: (points: Point[], maskOutside: boolean) => void;
}

export default function RoiCanvas({
  snapshotBase64,
  initialPoints,
  initialMaskOutside,
  cameraId,
  onSave,
}: RoiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [points, setPoints] = useState<Point[]>(initialPoints ?? []);
  const [closed, setClosed] = useState(!!(initialPoints && initialPoints.length >= 3));
  const [maskOutside, setMaskOutside] = useState(initialMaskOutside ?? false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 450 });

  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (data: { polygon_points: Point[]; mask_outside: boolean }) =>
      api.post(`/cameras/${cameraId}/roi`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["camera-roi", cameraId] });
      onSave?.(points, maskOutside);
    },
  });

  // Load image
  useEffect(() => {
    if (!snapshotBase64) return;
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const maxW = containerRef.current?.clientWidth ?? 800;
      const scale = Math.min(maxW / img.width, 1);
      setCanvasSize({ w: img.width * scale, h: img.height * scale });
    };
    img.src = `data:image/jpeg;base64,${snapshotBase64}`;
  }, [snapshotBase64]);

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imageRef.current;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image
    if (img) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#F3F4F6";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#78716C";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No snapshot — run a connection test first", canvas.width / 2, canvas.height / 2);
    }

    if (points.length === 0) return;

    const absPoints = points.map((p) => ({
      x: p.x * canvas.width,
      y: p.y * canvas.height,
    }));

    // Mask outside ROI
    if (closed && maskOutside && absPoints.length >= 3) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      absPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Re-draw image inside ROI
      if (img) {
        ctx.save();
        ctx.beginPath();
        absPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    // Draw polygon
    ctx.beginPath();
    absPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    if (closed) ctx.closePath();
    ctx.strokeStyle = "#00FFFF";
    ctx.lineWidth = 2;
    ctx.setLineDash(closed ? [] : [6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (closed) {
      ctx.fillStyle = "rgba(0, 255, 255, 0.15)";
      ctx.fill();
    }

    // Draw vertices
    absPoints.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#00FFFF";
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }, [points, closed, maskOutside, canvasSize]);

  useEffect(() => {
    draw();
  }, [draw]);

  function getCanvasPoint(e: React.MouseEvent): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function findNearVertex(p: Point, threshold = 0.02): number {
    return points.findIndex(
      (v) => Math.abs(v.x - p.x) < threshold && Math.abs(v.y - p.y) < threshold
    );
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (closed) {
      const p = getCanvasPoint(e);
      const idx = findNearVertex(p);
      if (idx >= 0) setDragging(idx);
      return;
    }

    const p = getCanvasPoint(e);

    // Close polygon if clicking near first point
    if (points.length >= 3) {
      const first = points[0]!;
      if (Math.abs(p.x - first.x) < 0.02 && Math.abs(p.y - first.y) < 0.02) {
        setClosed(true);
        return;
      }
    }

    setPoints([...points, p]);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (dragging === null) return;
    const p = getCanvasPoint(e);
    setPoints(points.map((pt, i) => (i === dragging ? p : pt)));
  }

  function handleMouseUp() {
    setDragging(null);
  }

  function handleDoubleClick() {
    if (points.length >= 3 && !closed) {
      setClosed(true);
    }
  }

  function handleReset() {
    setPoints([]);
    setClosed(false);
  }

  function handleUndo() {
    if (closed) {
      setClosed(false);
    } else {
      setPoints(points.slice(0, -1));
    }
  }

  function handleClose() {
    if (points.length >= 3) setClosed(true);
  }

  function handleSave() {
    if (points.length < 3 || !closed) return;
    saveMutation.mutate({ polygon_points: points, mask_outside: maskOutside });
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "r" || e.key === "R") handleReset();
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); handleUndo(); }
      if (e.key === "c" || e.key === "C") handleClose();
      if (e.key === "s" || e.key === "S") { e.preventDefault(); handleSave(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div ref={containerRef}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        className="cursor-crosshair rounded border border-[#E7E5E0]"
        style={{ width: canvasSize.w, height: canvasSize.h }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />

      {/* Instructions */}
      {!closed && points.length === 0 && (
        <p className="mt-2 text-xs text-[#78716C]">
          Click to add points. Double-click or click the first point to close the polygon.
        </p>
      )}

      {/* Toolbar */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm text-[#1C1917] hover:bg-[#F1F0ED]"
        >
          <RotateCcw size={14} />
          Reset (R)
        </button>
        <button
          onClick={handleUndo}
          disabled={points.length === 0}
          className="flex items-center gap-1.5 rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm text-[#1C1917] hover:bg-[#F1F0ED] disabled:opacity-50"
        >
          <Undo2 size={14} />
          Undo (Ctrl+Z)
        </button>
        {!closed && points.length >= 3 && (
          <button
            onClick={handleClose}
            className="rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm text-[#1C1917] hover:bg-[#F1F0ED]"
          >
            Close Polygon (C)
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-[#1C1917]">
          <input
            type="checkbox"
            checked={maskOutside}
            onChange={(e) => setMaskOutside(e.target.checked)}
            className="rounded border-[#E7E5E0]"
          />
          Mask Outside ROI
        </label>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={!closed || points.length < 3 || saveMutation.isPending}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
        >
          {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
          Save ROI (S)
        </button>
      </div>

      {/* Point count */}
      {points.length > 0 && (
        <p className="mt-2 text-xs text-[#78716C]">
          {points.length} point{points.length !== 1 ? "s" : ""} &middot;{" "}
          {closed ? "Polygon closed" : "Drawing..."}
        </p>
      )}
    </div>
  );
}
