import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trophy, RotateCcw, Rocket, BarChart3, Eye } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface TrainedModel {
  id: string;
  architecture: string;
  epochs: number;
  best_map50: number | null;
  best_map50_95: number | null;
  per_class_metrics: { class_name: string; ap50: number; precision: number; recall: number }[];
  dataset_version_id: string | null;
  completed_at: string | null;
  resulting_model_s3_key: string | null;
}

interface Prediction {
  class_name: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
}

interface CompareResult {
  frame_base64: string;
  production_predictions: Prediction[];
  trained_predictions: Prediction[];
}

function drawPredictions(
  canvas: HTMLCanvasElement,
  imgSrc: string,
  predictions: Prediction[],
  color: string,
  label: string,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    // Draw predictions
    predictions.forEach((p) => {
      const { x, y, w, h } = p.bbox;
      // Convert center coords to top-left if needed
      const bx = w <= 1 ? (x - w / 2) * canvas.width : x - w / 2;
      const by = h <= 1 ? (y - h / 2) * canvas.height : y - h / 2;
      const bw = w <= 1 ? w * canvas.width : w;
      const bh = h <= 1 ? h * canvas.height : h;

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(bx, by, bw, bh);

      const txt = `${p.class_name} ${(p.confidence * 100).toFixed(0)}%`;
      ctx.font = "bold 14px sans-serif";
      const tw = ctx.measureText(txt).width + 8;
      ctx.fillStyle = color;
      ctx.fillRect(bx, Math.max(0, by - 22), tw, 22);
      ctx.fillStyle = "white";
      ctx.fillText(txt, bx + 4, Math.max(16, by - 5));
    });

    // Label in corner
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = color;
    ctx.fillRect(8, 8, ctx.measureText(label).width + 16, 28);
    ctx.fillStyle = "white";
    ctx.fillText(label, 16, 28);
  };
  img.src = imgSrc;
}

export default function ModelComparisonPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const prodCanvasRef = useRef<HTMLCanvasElement>(null);
  const trainCanvasRef = useRef<HTMLCanvasElement>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [comparingJobId, setComparingJobId] = useState<string | null>(null);

  const { data: models, isLoading } = useQuery({
    queryKey: ["learning-models"],
    queryFn: async () => { const r = await api.get("/learning/models"); return r.data.data as TrainedModel[]; },
  });

  const { data: currentModels } = useQuery({
    queryKey: ["current-production-model"],
    queryFn: async () => {
      const r = await api.get("/models", { params: { limit: 5 } });
      return r.data.data as { id: string; version_str: string; status: string; map_50: number; architecture: string }[];
    },
  });

  const productionModel = (currentModels ?? []).find((m) => m.status === "production");
  const previousModel = (currentModels ?? []).find((m) => m.status !== "production");

  const deployMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await api.post(`/learning/models/${jobId}/deploy`);
      return res.data.data;
    },
    onSuccess: () => { success("Model deployed to production"); queryClient.invalidateQueries({ queryKey: ["current-production-model"] }); },
    onError: () => showError("Deployment failed"),
  });

  const rollbackMutation = useMutation({
    mutationFn: async (modelId: string) => {
      const res = await api.post(`/models/${modelId}/promote`, { target: "production" });
      return res.data.data;
    },
    onSuccess: () => { success("Rolled back to previous model"); queryClient.invalidateQueries({ queryKey: ["current-production-model"] }); },
    onError: () => showError("Rollback failed"),
  });

  const compareMutation = useMutation({
    mutationFn: async (jobId: string) => {
      setComparingJobId(jobId);
      const res = await api.post(`/learning/models/${jobId}/compare`, {});
      return res.data.data as CompareResult;
    },
    onSuccess: (data) => setCompareResult(data),
    onError: () => { showError("Comparison failed"); setComparingJobId(null); },
  });

  // Draw predictions when compare result changes
  useEffect(() => {
    if (!compareResult) return;
    const imgSrc = `data:image/jpeg;base64,${compareResult.frame_base64}`;
    if (prodCanvasRef.current) {
      drawPredictions(prodCanvasRef.current, imgSrc, compareResult.production_predictions, "#3B82F6", "Production");
    }
    if (trainCanvasRef.current) {
      drawPredictions(trainCanvasRef.current, imgSrc, compareResult.trained_predictions, "#10B981", "Trained");
    }
  }, [compareResult]);

  const sortedModels = [...(models ?? [])].sort((a, b) => (b.best_map50 ?? 0) - (a.best_map50 ?? 0));
  const bestModel = sortedModels[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Model Comparison</h1>
          <p className="mt-1 text-sm text-gray-500">Compare trained models against production — visual side-by-side inference</p>
        </div>
        {previousModel && (
          <button
            onClick={() => { if (confirm("Rollback to previous production model?")) rollbackMutation.mutate(previousModel.id); }}
            disabled={rollbackMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40"
          >
            <RotateCcw size={14} /> Rollback to {previousModel.version_str}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 size={24} className="animate-spin text-teal-600" /></div>
      ) : (models ?? []).length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
          <BarChart3 size={32} className="mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No trained models yet</p>
          <p className="text-xs text-gray-400">Train a model from the Training Jobs page first</p>
        </div>
      ) : (
        <>
          {/* Visual Comparison */}
          {compareResult && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Visual Comparison</h3>
                <button onClick={() => { setCompareResult(null); setComparingJobId(null); }}
                  className="text-xs text-gray-500 hover:text-gray-700">Close</button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-center text-xs font-semibold text-blue-600">
                    Production ({compareResult.production_predictions.length} detections)
                  </div>
                  <canvas ref={prodCanvasRef} className="w-full rounded-lg border border-blue-200" />
                </div>
                <div>
                  <div className="mb-1 text-center text-xs font-semibold text-green-600">
                    Trained ({compareResult.trained_predictions.length} detections)
                  </div>
                  <canvas ref={trainCanvasRef} className="w-full rounded-lg border border-green-200" />
                </div>
              </div>
              <div className="mt-3 flex justify-center">
                <button onClick={() => comparingJobId && compareMutation.mutate(comparingJobId)}
                  disabled={compareMutation.isPending}
                  className="text-xs text-teal-600 hover:underline">
                  {compareMutation.isPending ? "Loading..." : "Try another frame"}
                </button>
              </div>
            </div>
          )}

          {/* Production vs Best */}
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Trophy size={16} /> Current Production Model
              </div>
              {productionModel ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Version</span><span className="font-medium">{productionModel.version_str}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Architecture</span><span className="font-medium">{productionModel.architecture}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">mAP@50</span>
                    <span className="text-lg font-bold text-blue-700">{productionModel.map_50 != null ? `${(productionModel.map_50 * 100).toFixed(1)}%` : "—"}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">No production model deployed</p>
              )}
            </div>

            {bestModel && (
              <div className="rounded-xl border-2 border-teal-200 bg-teal-50/50 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-teal-700">
                  <Rocket size={16} /> Best Trained Model
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Architecture</span><span className="font-medium">{bestModel.architecture}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Epochs</span><span className="font-medium">{bestModel.epochs}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">mAP@50</span>
                    <span className="text-lg font-bold text-teal-700">{bestModel.best_map50 != null ? `${(bestModel.best_map50 * 100).toFixed(1)}%` : "—"}</span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-500">mAP@50-95</span>
                    <span className="font-medium">{bestModel.best_map50_95 != null ? `${(bestModel.best_map50_95 * 100).toFixed(1)}%` : "—"}</span>
                  </div>
                </div>
                {productionModel && bestModel.best_map50 != null && productionModel.map_50 != null && (
                  <div className={`mt-3 rounded-lg p-2 text-center text-sm font-semibold ${
                    bestModel.best_map50 > productionModel.map_50 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {bestModel.best_map50 > productionModel.map_50
                      ? `+${((bestModel.best_map50 - productionModel.map_50) * 100).toFixed(1)}% better`
                      : `${((bestModel.best_map50 - productionModel.map_50) * 100).toFixed(1)}% vs production`}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* All trained models */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-700">All Trained Models</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Architecture</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Epochs</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">mAP@50</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">mAP@50-95</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Trained</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Classes</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedModels.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{m.architecture}</td>
                    <td className="px-5 py-3 text-gray-600">{m.epochs}</td>
                    <td className="px-5 py-3">
                      <span className="font-bold text-teal-700">
                        {m.best_map50 != null ? `${(m.best_map50 * 100).toFixed(1)}%` : "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {m.best_map50_95 != null ? `${(m.best_map50_95 * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {m.completed_at ? new Date(m.completed_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{m.per_class_metrics?.length ?? 0}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                          onClick={() => compareMutation.mutate(m.id)}
                          disabled={compareMutation.isPending}
                        >
                          <Eye size={12} /> Compare
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
                          onClick={() => deployMutation.mutate(m.id)}
                          disabled={deployMutation.isPending}
                        >
                          <Rocket size={12} /> Deploy
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-class comparison for best model */}
          {bestModel?.per_class_metrics && bestModel.per_class_metrics.length > 0 && (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Per-Class Metrics (Best Model)</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="py-2 text-left text-xs font-semibold">Class</th>
                    <th className="py-2 text-right text-xs font-semibold">AP@50</th>
                    <th className="py-2 text-right text-xs font-semibold">Precision</th>
                    <th className="py-2 text-right text-xs font-semibold">Recall</th>
                  </tr>
                </thead>
                <tbody>
                  {bestModel.per_class_metrics.map((c) => (
                    <tr key={c.class_name} className="border-b border-gray-50">
                      <td className="py-2 font-medium">{c.class_name}</td>
                      <td className="py-2 text-right font-bold text-teal-700">{(c.ap50 * 100).toFixed(1)}%</td>
                      <td className="py-2 text-right text-gray-600">{(c.precision * 100).toFixed(1)}%</td>
                      <td className="py-2 text-right text-gray-600">{(c.recall * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
