import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, Play, Loader2, Download, Sliders } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { COLORS, classColor } from "@/constants/learning";

/* ── Constants ──────────────────────────────────────────────── */
const DEFAULT_CONFIDENCE = 0.25;
const CONFIDENCE_STEP = 0.05;
const CONFIDENCE_MIN = 0;
const CONFIDENCE_MAX = 1;

/* ── Types ──────────────────────────────────────────────────── */
interface TrainedModel {
  id: string;
  architecture: string;
  epochs: number;
  best_map50: number | null;
  status: string;
  resulting_model_s3_key: string | null;
}

interface Prediction {
  class_name: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
}

interface TestImageResult {
  predictions: Prediction[];
  inference_time_ms: number;
  frame_base64: string;
}

interface BatchClassBreakdown {
  class_name: string;
  prediction_count: number;
  mean_confidence: number;
}

interface BatchTestResult {
  total_frames: number;
  total_predictions: number;
  total_inference_ms: number;
  avg_inference_ms: number;
  per_class_breakdown: BatchClassBreakdown[];
}

/* ── Canvas Drawing ─────────────────────────────────────────── */
function drawPredictions(
  canvas: HTMLCanvasElement,
  imgSrc: string,
  predictions: Prediction[],
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    predictions.forEach((p) => {
      const { x, y, w, h } = p.bbox;
      const bx = w <= 1 ? (x - w / 2) * canvas.width : x - w / 2;
      const by = h <= 1 ? (y - h / 2) * canvas.height : y - h / 2;
      const bw = w <= 1 ? w * canvas.width : w;
      const bh = h <= 1 ? h * canvas.height : h;

      const color = classColor(p.class_name);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(bx, by, bw, bh);

      // Label background
      const label = `${p.class_name} ${(p.confidence * 100).toFixed(0)}%`;
      ctx.font = "bold 14px sans-serif";
      const metrics = ctx.measureText(label);
      const labelH = 20;
      ctx.fillStyle = color;
      ctx.fillRect(bx, by - labelH, metrics.width + 8, labelH);
      ctx.fillStyle = COLORS.LABEL_TEXT;
      ctx.fillText(label, bx + 4, by - 5);
    });
  };
  img.src = imgSrc;
}

/* ── Component ──────────────────────────────────────────────── */
export default function ModelTestingPage() {
  const { success, error: showError } = useToast();

  /* State */
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [confidence, setConfidence] = useState(DEFAULT_CONFIDENCE);
  const [result, setResult] = useState<TestImageResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchTestResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Queries */
  const { data: models, isLoading: modelsLoading } = useQuery({
    queryKey: ["learning-models"],
    queryFn: async () => {
      const r = await api.get("/learning/models");
      return r.data.data as TrainedModel[];
    },
  });

  const completedModels = (models ?? []).filter(
    (m) => m.status === "completed" && m.resulting_model_s3_key,
  );

  /* Mutations */
  const testImageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedJobId || !selectedFile) return null;
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await api.post(
        `/learning/models/${selectedJobId}/test-image?confidence=${confidence}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return res.data.data as TestImageResult;
    },
    onSuccess: (data) => {
      if (data) {
        setResult(data);
        success(`Inference complete in ${data.inference_time_ms}ms`);
      }
    },
    onError: () => showError("Inference failed"),
  });

  const batchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedJobId) return null;
      const res = await api.post(`/learning/models/${selectedJobId}/test-batch`);
      return res.data.data as BatchTestResult;
    },
    onSuccess: (data) => {
      if (data) {
        setBatchResult(data);
        success(`Batch test complete: ${data.total_frames} frames processed`);
      }
    },
    onError: () => showError("Batch test failed"),
  });

  /* Draw on canvas when result or confidence changes */
  const filteredPredictions = (result?.predictions ?? []).filter(
    (p) => p.confidence >= confidence,
  );

  useEffect(() => {
    if (!result || !canvasRef.current) return;
    const imgSrc = `data:image/jpeg;base64,${result.frame_base64}`;
    drawPredictions(canvasRef.current, imgSrc, filteredPredictions);
  }, [result, filteredPredictions.length, confidence]);

  /* File handling */
  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setResult(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  /* Export JSON */
  const exportJson = useCallback(() => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.predictions, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `predictions_${selectedJobId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, selectedJobId]);

  /* Class breakdown from results */
  const classBreakdown = filteredPredictions.reduce<
    Record<string, number>
  >((acc, p) => {
    acc[p.class_name] = (acc[p.class_name] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Model Testing
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Upload images and test trained models. Visualize predictions and run batch evaluations.
        </p>
      </div>

      {/* Model Selector */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Select Trained Model
        </label>
        {modelsLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" /> Loading models...
          </div>
        ) : completedModels.length === 0 ? (
          <p className="text-sm text-slate-400">No completed models available.</p>
        ) : (
          <select
            value={selectedJobId}
            onChange={(e) => {
              setSelectedJobId(e.target.value);
              setResult(null);
              setBatchResult(null);
            }}
            className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          >
            <option value="">-- Choose a model --</option>
            {completedModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.architecture} — {m.epochs} epochs
                {m.best_map50 != null ? ` — mAP50: ${(m.best_map50 * 100).toFixed(1)}%` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Image Upload & Inference */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Upload & Controls */}
        <div className="space-y-4">
          {/* Drag-and-drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors ${
              dragOver
                ? "border-[#0D9488] bg-teal-50 dark:bg-teal-900/20"
                : "border-slate-300 bg-slate-50 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800/50"
            }`}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Selected"
                className="max-h-[300px] rounded-lg object-contain"
              />
            ) : (
              <>
                <Upload size={32} className="mb-2 text-slate-400" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Drop an image here or click to browse
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  JPG, PNG supported
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
            />
          </div>

          {/* Confidence slider */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <Sliders size={16} />
              Confidence Threshold: {(confidence * 100).toFixed(0)}%
            </div>
            <input
              type="range"
              min={CONFIDENCE_MIN}
              max={CONFIDENCE_MAX}
              step={CONFIDENCE_STEP}
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              className="mt-2 w-full accent-[#0D9488]"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Run Inference Button */}
          <button
            onClick={() => testImageMutation.mutate()}
            disabled={
              !selectedJobId ||
              !selectedFile ||
              testImageMutation.isPending
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0B7C72] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testImageMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            Run Inference
          </button>
        </div>

        {/* Right: Canvas & Results */}
        <div className="space-y-4">
          {/* Canvas */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900">
            {result ? (
              <canvas
                ref={canvasRef}
                className="w-full"
                style={{ maxHeight: 500 }}
              />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">
                Run inference to see detection results
              </div>
            )}
          </div>

          {/* Results panel */}
          {result && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Results
                </h3>
                <button
                  onClick={exportJson}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Download size={14} />
                  Export JSON
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Predictions
                  </p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {filteredPredictions.length}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Inference Time
                  </p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {result.inference_time_ms}ms
                  </p>
                </div>
              </div>

              {/* Per-class breakdown */}
              {Object.keys(classBreakdown).length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Class Breakdown
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(classBreakdown).map(([cls, count]) => (
                      <div
                        key={cls}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: classColor(cls) }}
                          />
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {cls}
                          </span>
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Batch Test Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">
          Batch Test
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Run inference on all test-split frames (up to 100) to evaluate model performance across the dataset.
        </p>

        <button
          onClick={() => batchMutation.mutate()}
          disabled={!selectedJobId || batchMutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
        >
          {batchMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Play size={16} />
          )}
          Run Batch Test
        </button>

        {/* Batch results table */}
        {batchResult && (
          <div className="mt-5 space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Frames Tested
                </p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {batchResult.total_frames}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total Predictions
                </p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {batchResult.total_predictions}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total Time
                </p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {batchResult.total_inference_ms}ms
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Avg per Frame
                </p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {batchResult.avg_inference_ms}ms
                </p>
              </div>
            </div>

            {/* Per-class table */}
            {batchResult.per_class_breakdown.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/50">
                      <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-300">
                        Class
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-300">
                        Predictions
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-300">
                        Mean Confidence
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {batchResult.per_class_breakdown.map((row) => (
                      <tr key={row.class_name}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{
                                backgroundColor: classColor(row.class_name),
                              }}
                            />
                            <span className="font-medium text-slate-900 dark:text-white">
                              {row.class_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-900 dark:text-white">
                          {row.prediction_count}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">
                          {(row.mean_confidence * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
