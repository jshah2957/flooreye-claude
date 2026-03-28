/**
 * AnnotatedFrame — Reusable component that renders an image with bounding box overlays.
 * Used across TestInference, RoboflowTest, Dataset, Clips pages.
 *
 * If annotated_base64 is provided, renders that directly (server-drawn boxes).
 * If only raw_base64 + predictions, draws boxes on HTML5 Canvas (client-side).
 */

import { useEffect, useRef } from "react";
import { getClassColor } from "@/constants/detection";

interface Prediction {
  class_name?: string;
  confidence?: number;
  bbox?: { x: number; y: number; w: number; h: number };
}

interface Props {
  /** Pre-annotated frame from server (preferred) */
  annotatedBase64?: string | null;
  /** Raw frame (used for client-side drawing if no annotated version) */
  rawBase64?: string | null;
  /** Predictions to draw client-side (only if annotatedBase64 not provided) */
  predictions?: Prediction[];
  /** Max height CSS class */
  maxHeight?: string;
}

export default function AnnotatedFrame({ annotatedBase64, rawBase64, predictions, maxHeight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const src = annotatedBase64 || rawBase64;

  // Client-side drawing when we have raw + predictions but no annotated
  useEffect(() => {
    if (annotatedBase64 || !rawBase64 || !predictions?.length || !canvasRef.current) return;

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      for (const pred of predictions) {
        if (!pred.bbox) continue;
        const { x, y, w, h } = pred.bbox;
        // Auto-detect normalized vs pixel
        const px = x <= 1 ? x * img.width : x;
        const py = y <= 1 ? y * img.height : y;
        const pw = w <= 1 ? w * img.width : w;
        const ph = h <= 1 ? h * img.height : h;

        const color = getClassColor(pred.class_name ?? "");
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(px - pw / 2, py - ph / 2, pw, ph);

        // Label
        const label = `${pred.class_name ?? "?"} ${((pred.confidence ?? 0) * 100).toFixed(0)}%`;
        ctx.fillStyle = "black";
        ctx.fillRect(px - pw / 2, py - ph / 2 - 16, label.length * 7 + 8, 16);
        ctx.fillStyle = color;
        ctx.font = "12px sans-serif";
        ctx.fillText(label, px - pw / 2 + 4, py - ph / 2 - 3);
      }
    };
    img.src = `data:image/jpeg;base64,${rawBase64}`;
  }, [annotatedBase64, rawBase64, predictions]);

  if (!src) return null;

  // If we have server-annotated frame, just render as img
  if (annotatedBase64) {
    return (
      <img
        src={`data:image/jpeg;base64,${annotatedBase64}`}
        alt="Annotated detection frame"
        className={`w-full rounded-lg border border-[#E7E5E0] ${maxHeight ?? ""}`}
      />
    );
  }

  // Client-side canvas rendering
  if (rawBase64 && predictions?.length) {
    return (
      <canvas
        ref={canvasRef}
        className={`w-full rounded-lg border border-[#E7E5E0] ${maxHeight ?? ""}`}
      />
    );
  }

  // Raw frame only, no predictions
  return (
    <img
      src={`data:image/jpeg;base64,${rawBase64}`}
      alt="Camera frame"
      className={`w-full rounded-lg border border-[#E7E5E0] ${maxHeight ?? ""}`}
    />
  );
}
