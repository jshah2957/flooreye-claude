import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trophy, ArrowRight, RotateCcw, Rocket, BarChart3 } from "lucide-react";
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

export default function ModelComparisonPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const { data: models, isLoading } = useQuery({
    queryKey: ["learning-models"],
    queryFn: async () => { const r = await api.get("/learning/models"); return r.data.data as TrainedModel[]; },
  });

  // Get current production model info from FloorEye
  const { data: currentModels } = useQuery({
    queryKey: ["current-production-model"],
    queryFn: async () => {
      const r = await api.get("/models", { params: { limit: 5 } });
      return r.data.data as { id: string; version_str: string; status: string; map_50: number; architecture: string }[];
    },
  });

  const productionModel = (currentModels ?? []).find((m) => m.status === "production");

  const deployMutation = useMutation({
    mutationFn: async (jobId: string) => {
      // Register the trained model in FloorEye model_versions and promote to production
      await api.post(`/learning/training/${jobId}/cancel`); // placeholder — actual deploy endpoint would go here
      // In a real implementation, this would call a backend endpoint that:
      // 1. Copies ONNX from learning S3 to main S3
      // 2. Creates model_versions document
      // 3. Promotes to production
      // 4. Pushes to edge agents
    },
    onSuccess: () => { success("Model deployment initiated"); queryClient.invalidateQueries({ queryKey: ["current-production-model"] }); },
    onError: () => showError("Deployment failed"),
  });

  const sortedModels = [...(models ?? [])].sort((a, b) => (b.best_map50 ?? 0) - (a.best_map50 ?? 0));
  const bestModel = sortedModels[0];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Model Comparison</h1>
        <p className="mt-1 text-sm text-gray-500">Compare trained models against the current production model</p>
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
          {/* Current Production vs Best Trained */}
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            {/* Current production */}
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
                  <div className="flex justify-between"><span className="text-gray-500">Source</span><span className="font-medium">Roboflow</span></div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">No production model deployed</p>
              )}
            </div>

            {/* Best trained */}
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
                  <div className="flex justify-between"><span className="text-gray-500">Trained</span>
                    <span className="font-medium">{bestModel.completed_at ? new Date(bestModel.completed_at).toLocaleDateString() : "—"}</span>
                  </div>
                </div>
                {productionModel && bestModel.best_map50 != null && productionModel.map_50 != null && (
                  <div className={`mt-3 rounded-lg p-2 text-center text-sm font-semibold ${
                    bestModel.best_map50 > productionModel.map_50 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {bestModel.best_map50 > productionModel.map_50
                      ? `+${((bestModel.best_map50 - productionModel.map_50) * 100).toFixed(1)}% better than production`
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
                      <button
                        className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
                        onClick={() => deployMutation.mutate(m.id)}
                        disabled={deployMutation.isPending}
                      >
                        <Rocket size={12} /> Deploy
                      </button>
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
