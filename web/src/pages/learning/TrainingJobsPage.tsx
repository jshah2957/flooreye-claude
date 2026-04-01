import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Loader2, CheckCircle, XCircle, Clock, Ban, BarChart3, Cpu, GitCompare } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import {
  JOBS_REFETCH_MS, TRAINING_DEFAULTS, ARCHITECTURE_OPTIONS,
  IMAGE_SIZE_OPTIONS, AUGMENTATION_OPTIONS, EARLY_STOPPING_PATIENCE_MAX,
  ESTIMATED_SECONDS_PER_BATCH,
} from "@/constants/learning";

interface TrainingJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  architecture: string;
  epochs: number;
  batch_size: number;
  image_size: number;
  augmentation_preset: string;
  current_epoch: number | null;
  total_epochs: number;
  best_map50: number | null;
  best_map50_95: number | null;
  per_class_metrics: { class_name: string; ap50: number; precision: number; recall: number }[];
  training_loss_history: { epoch: number; loss: number }[];
  patience: number;
  error_message: string | null;
  dataset_version_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface DatasetVersion {
  id: string;
  version: string;
  frame_count: number;
  status: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  queued: <Clock size={14} className="text-amber-500" />,
  running: <Loader2 size={14} className="animate-spin text-blue-500" />,
  completed: <CheckCircle size={14} className="text-green-500" />,
  failed: <XCircle size={14} className="text-red-500" />,
  cancelled: <Ban size={14} className="text-gray-400" />,
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-amber-50 text-amber-700 border-amber-200",
  running: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
};

export default function TrainingJobsPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<TrainingJob | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  // Form state
  const [datasetVersionId, setDatasetVersionId] = useState("");
  const [architecture, setArchitecture] = useState<string>(TRAINING_DEFAULTS.architecture);
  const [epochs, setEpochs] = useState<number>(TRAINING_DEFAULTS.epochs);
  const [batchSize, setBatchSize] = useState<number>(TRAINING_DEFAULTS.batchSize);
  const [imageSize, setImageSize] = useState<number>(TRAINING_DEFAULTS.imageSize);
  const [augmentation, setAugmentation] = useState<string>(TRAINING_DEFAULTS.augmentation);
  const [patience, setPatience] = useState<number>(TRAINING_DEFAULTS.patience);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["learning-training"],
    queryFn: async () => { const r = await api.get("/learning/training"); return r.data.data as TrainingJob[]; },
    refetchInterval: JOBS_REFETCH_MS,
  });

  const { data: datasets } = useQuery({
    queryKey: ["learning-datasets"],
    queryFn: async () => { const r = await api.get("/learning/datasets"); return r.data.data as DatasetVersion[]; },
  });

  const { data: statsData } = useQuery({
    queryKey: ["learning-stats-for-estimate"],
    queryFn: async () => {
      const r = await api.get("/learning/stats");
      return r.data.data as { total_frames: number };
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await api.post("/learning/training", {
        dataset_version_id: datasetVersionId || undefined,
        architecture, epochs, batch_size: batchSize, image_size: imageSize, augmentation_preset: augmentation, patience,
      });
      return r.data.data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["learning-training"] }); success("Training job queued"); setShowCreate(false); },
    onError: (e: any) => showError(e?.response?.data?.detail || "Failed to create job"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/learning/training/${id}/cancel`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["learning-training"] }); success("Job cancelled"); },
    onError: () => showError("Cancel failed"),
  });

  const completedJobs = (jobs ?? []).filter((j) => j.status === "completed");

  function toggleCompareSelection(jobId: string) {
    setSelectedForCompare((prev) => {
      if (prev.includes(jobId)) return prev.filter((id) => id !== jobId);
      if (prev.length >= 2) return [prev[1] ?? jobId, jobId];
      return [...prev, jobId];
    });
  }

  const compareJobA = completedJobs.find((j) => j.id === selectedForCompare[0]) ?? null;
  const compareJobB = completedJobs.find((j) => j.id === selectedForCompare[1]) ?? null;

  function betterClass(a: number | null, b: number | null): { aClass: string; bClass: string } {
    if (a == null || b == null) return { aClass: "", bClass: "" };
    if (a > b) return { aClass: "text-green-600 font-bold", bClass: "" };
    if (b > a) return { aClass: "", bClass: "text-green-600 font-bold" };
    return { aClass: "", bClass: "" };
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Jobs</h1>
          <p className="mt-1 text-sm text-gray-500">{(jobs ?? []).length} job{(jobs ?? []).length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedForCompare.length === 2 && (
            <button onClick={() => setShowCompare(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-5 py-2.5 text-sm font-medium text-teal-700 shadow-sm hover:bg-teal-100">
              <GitCompare size={16} /> Compare ({selectedForCompare.length})
            </button>
          )}
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-teal-700">
            <Play size={16} /> Start Training
          </button>
        </div>
      </div>

      {/* Job List */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 size={24} className="animate-spin text-teal-600" /></div>
      ) : (jobs ?? []).length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
          <Cpu size={32} className="mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No training jobs yet</p>
          <p className="text-xs text-gray-400">Click "Start Training" to train a model from your dataset</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(jobs ?? []).map((job) => (
            <div key={job.id} className="flex items-center gap-3">
              {job.status === "completed" && (
                <input
                  type="checkbox"
                  checked={selectedForCompare.includes(job.id)}
                  onChange={() => toggleCompareSelection(job.id)}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
              )}
              <div onClick={() => setDetail(job)}
                className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {STATUS_ICONS[job.status]}
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_COLORS[job.status]}`}>{job.status}</span>
                  <span className="text-sm font-medium text-gray-900">{job.architecture}</span>
                  <span className="text-xs text-gray-500">{job.epochs} epochs · {job.image_size}px · {job.augmentation_preset}</span>
                </div>
                <div className="flex items-center gap-3">
                  {job.best_map50 != null && (
                    <span className="text-sm font-bold text-teal-700">mAP@50: {(job.best_map50 * 100).toFixed(1)}%</span>
                  )}
                  {(job.status === "queued" || job.status === "running") && (
                    <button onClick={(e) => { e.stopPropagation(); cancelMutation.mutate(job.id); }}
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Cancel</button>
                  )}
                </div>
              </div>
              {job.status === "running" && job.current_epoch != null && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Epoch {job.current_epoch} / {job.total_epochs}</span>
                    <span>{Math.round((job.current_epoch / job.total_epochs) * 100)}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-teal-500 transition-all" style={{ width: `${(job.current_epoch / job.total_epochs) * 100}%` }} />
                  </div>
                </div>
              )}
              {job.error_message && (
                <p className="mt-2 text-xs text-red-600">{job.error_message}</p>
              )}
              <p className="mt-2 text-[10px] text-gray-400">Created {new Date(job.created_at).toLocaleString()}</p>
            </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDetail(null)}>
          <div className="mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-gray-900">Training Job Detail</h3>
            <dl className="space-y-2 text-sm">
              {[
                ["Status", detail.status],
                ["Architecture", detail.architecture],
                ["Epochs", `${detail.current_epoch ?? 0} / ${detail.total_epochs}`],
                ["Batch Size", detail.batch_size],
                ["Image Size", `${detail.image_size}px`],
                ["Augmentation", detail.augmentation_preset],
                ["mAP@50", detail.best_map50 != null ? `${(detail.best_map50 * 100).toFixed(1)}%` : "—"],
                ["mAP@50-95", detail.best_map50_95 != null ? `${(detail.best_map50_95 * 100).toFixed(1)}%` : "—"],
                ["Started", detail.started_at ? new Date(detail.started_at).toLocaleString() : "—"],
                ["Completed", detail.completed_at ? new Date(detail.completed_at).toLocaleString() : "—"],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-medium text-gray-900">{String(value)}</dd>
                </div>
              ))}
            </dl>
            {detail.per_class_metrics.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">Per-Class Metrics</h4>
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-gray-500"><th className="py-1 text-left">Class</th><th className="text-right">AP@50</th><th className="text-right">Precision</th><th className="text-right">Recall</th></tr></thead>
                  <tbody>
                    {detail.per_class_metrics.map((m) => (
                      <tr key={m.class_name} className="border-b border-gray-50">
                        <td className="py-1 font-medium">{m.class_name}</td>
                        <td className="text-right">{(m.ap50 * 100).toFixed(1)}%</td>
                        <td className="text-right">{(m.precision * 100).toFixed(1)}%</td>
                        <td className="text-right">{(m.recall * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Loss History Chart */}
            {detail.training_loss_history.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">Training Loss</h4>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={detail.training_loss_history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="epoch" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="loss" stroke="#0D9488" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {detail.error_message && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{detail.error_message}</div>
            )}
            <button onClick={() => setDetail(null)} className="mt-4 w-full rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Close</button>
          </div>
        </div>
      )}

      {/* Compare Modal */}
      {showCompare && compareJobA && compareJobB && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCompare(false)}>
          <div className="mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-gray-900">Compare Training Jobs</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 text-left text-xs font-semibold uppercase text-gray-500">Metric</th>
                  <th className="py-2 text-center text-xs font-semibold uppercase text-gray-500">Job A</th>
                  <th className="py-2 text-center text-xs font-semibold uppercase text-gray-500">Job B</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const map50 = betterClass(compareJobA.best_map50, compareJobB.best_map50);
                  const map5095 = betterClass(compareJobA.best_map50_95, compareJobB.best_map50_95);
                  // For epochs: lower is better only if mAP is similar, show neutral
                  const rows: { label: string; a: string; b: string; aClass: string; bClass: string }[] = [
                    {
                      label: "mAP@50",
                      a: compareJobA.best_map50 != null ? `${(compareJobA.best_map50 * 100).toFixed(1)}%` : "\u2014",
                      b: compareJobB.best_map50 != null ? `${(compareJobB.best_map50 * 100).toFixed(1)}%` : "\u2014",
                      aClass: map50.aClass, bClass: map50.bClass,
                    },
                    {
                      label: "mAP@50-95",
                      a: compareJobA.best_map50_95 != null ? `${(compareJobA.best_map50_95 * 100).toFixed(1)}%` : "\u2014",
                      b: compareJobB.best_map50_95 != null ? `${(compareJobB.best_map50_95 * 100).toFixed(1)}%` : "\u2014",
                      aClass: map5095.aClass, bClass: map5095.bClass,
                    },
                    {
                      label: "Architecture",
                      a: compareJobA.architecture, b: compareJobB.architecture,
                      aClass: "", bClass: "",
                    },
                    {
                      label: "Epochs",
                      a: String(compareJobA.epochs), b: String(compareJobB.epochs),
                      aClass: "", bClass: "",
                    },
                    {
                      label: "Training Time",
                      a: compareJobA.started_at && compareJobA.completed_at
                        ? `${Math.round((new Date(compareJobA.completed_at).getTime() - new Date(compareJobA.started_at).getTime()) / 60000)}m`
                        : "\u2014",
                      b: compareJobB.started_at && compareJobB.completed_at
                        ? `${Math.round((new Date(compareJobB.completed_at).getTime() - new Date(compareJobB.started_at).getTime()) / 60000)}m`
                        : "\u2014",
                      aClass: "", bClass: "",
                    },
                  ];
                  return rows.map((r) => (
                    <tr key={r.label} className="border-b border-gray-50">
                      <td className="py-2 text-gray-600">{r.label}</td>
                      <td className={`py-2 text-center ${r.aClass}`}>{r.a}</td>
                      <td className={`py-2 text-center ${r.bClass}`}>{r.b}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>

            {/* Per-class comparison */}
            {(() => {
              const allClasses = new Set<string>();
              (compareJobA.per_class_metrics ?? []).forEach((m) => allClasses.add(m.class_name));
              (compareJobB.per_class_metrics ?? []).forEach((m) => allClasses.add(m.class_name));
              const classNames = Array.from(allClasses).sort();
              if (classNames.length === 0) return null;

              const aMap = Object.fromEntries((compareJobA.per_class_metrics ?? []).map((m) => [m.class_name, m]));
              const bMap = Object.fromEntries((compareJobB.per_class_metrics ?? []).map((m) => [m.class_name, m]));

              return (
                <div className="mt-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">Per-Class AP@50</h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="py-1 text-left">Class</th>
                        <th className="py-1 text-center">Job A</th>
                        <th className="py-1 text-center">Job B</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classNames.map((cn) => {
                        const aVal = aMap[cn]?.ap50 ?? null;
                        const bVal = bMap[cn]?.ap50 ?? null;
                        const cls = betterClass(aVal, bVal);
                        return (
                          <tr key={cn} className="border-b border-gray-50">
                            <td className="py-1 font-medium">{cn}</td>
                            <td className={`py-1 text-center ${cls.aClass}`}>{aVal != null ? `${(aVal * 100).toFixed(1)}%` : "\u2014"}</td>
                            <td className={`py-1 text-center ${cls.bClass}`}>{bVal != null ? `${(bVal * 100).toFixed(1)}%` : "\u2014"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <button onClick={() => setShowCompare(false)} className="mt-4 w-full rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Close</button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-gray-900">Start Training Job</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Dataset Version (optional)</label>
                <select value={datasetVersionId} onChange={(e) => setDatasetVersionId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none">
                  <option value="">All assigned frames</option>
                  {(datasets ?? []).map((d) => <option key={d.id} value={d.id}>{d.version} ({d.frame_count} frames)</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Architecture</label>
                <select value={architecture} onChange={(e) => setArchitecture(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none">
                  {ARCHITECTURE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Epochs</label>
                  <input type="number" min={10} max={300} value={epochs} onChange={(e) => setEpochs(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Batch Size</label>
                  <input type="number" min={4} max={64} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Image Size</label>
                  <select value={imageSize} onChange={(e) => setImageSize(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none">
                    {IMAGE_SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Augmentation</label>
                  <select value={augmentation} onChange={(e) => setAugmentation(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none">
                    {AUGMENTATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Early Stopping Patience (0 = disabled)</label>
                <input type="number" min={0} max={EARLY_STOPPING_PATIENCE_MAX} value={patience} onChange={(e) => setPatience(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
              </div>
            </div>
            {/* Training Time Estimate */}
            {(() => {
              const totalFrames = statsData?.total_frames ?? 0;
              if (totalFrames === 0 || batchSize === 0) return null;
              const batchesPerEpoch = Math.ceil(totalFrames / batchSize);
              const totalSeconds = epochs * batchesPerEpoch * ESTIMATED_SECONDS_PER_BATCH;
              const minutes = Math.round(totalSeconds / 60);
              return (
                <div className="mt-3 rounded-lg bg-blue-50 px-4 py-3">
                  <p className="text-xs font-medium text-blue-800">
                    Estimated training time: ~{minutes < 60 ? `${minutes} minutes` : `${(minutes / 60).toFixed(1)} hours`}
                  </p>
                  <p className="mt-0.5 text-[10px] text-blue-600">
                    {totalFrames.toLocaleString()} frames x {epochs} epochs x {batchesPerEpoch.toLocaleString()} batches/epoch
                  </p>
                </div>
              );
            })()}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40">
                {createMutation.isPending ? "Starting..." : "Start Training"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
