import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Cpu, Loader2, Plus, X, XCircle } from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";

interface TrainingJob {
  id: string;
  status: string;
  config: Record<string, unknown>;
  triggered_by: string;
  frames_used: number;
  current_epoch: number | null;
  total_epochs: number | null;
  resulting_model_id: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export default function TrainingJobsPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [arch, setArch] = useState("yolo11n");
  const [epochs, setEpochs] = useState(100);
  const [augmentation, setAugmentation] = useState("standard");

  const { data, isLoading } = useQuery({
    queryKey: ["training-jobs"],
    queryFn: async () => {
      const res = await api.get("/training/jobs", { params: { limit: 50 } });
      return res.data;
    },
    refetchInterval: 5000, // Poll for progress
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/training/jobs", {
      architecture: arch, max_epochs: epochs, augmentation_preset: augmentation,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-jobs"] });
      setCreateOpen(false);
      success("Training job started");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to start training job");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/training/jobs/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-jobs"] });
      success("Training job cancelled");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to cancel training job");
    },
  });

  const jobs = (data?.data ?? []) as TrainingJob[];

  function progressPercent(job: TrainingJob): number {
    if (!job.current_epoch || !job.total_epochs) return 0;
    return Math.round((job.current_epoch / job.total_epochs) * 100);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1C1917]">Training Jobs</h1>
        <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]">
          <Plus size={16} /> New Job
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={Cpu} title="No training jobs" description="Start a distillation training job." actionLabel="New Job" onAction={() => setCreateOpen(true)} />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-lg border border-[#E7E5E0] bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusBadge status={job.status} />
                  <span className="text-sm font-medium text-[#1C1917]">
                    {(job.config as any)?.architecture ?? "yolov8n"} · {job.frames_used ?? 0} frames
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(job.status === "queued" || job.status === "running") && (
                    <button onClick={() => cancelMutation.mutate(job.id)}
                      className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-2 py-1 text-xs text-[#DC2626] hover:bg-[#FEE2E2]">
                      <XCircle size={12} /> Cancel
                    </button>
                  )}
                  <span className="text-xs text-[#78716C]">{new Date(job.created_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Progress Bar */}
              {job.status === "running" && job.current_epoch && job.total_epochs && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-[#78716C]">
                    <span>Epoch {job.current_epoch}/{job.total_epochs}</span>
                    <span>{progressPercent(job)}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                    <div className="h-2 rounded-full bg-[#0D9488] transition-all" style={{ width: `${progressPercent(job)}%` }} />
                  </div>
                </div>
              )}

              {job.error_message && (
                <p className="mt-2 text-xs text-[#DC2626]">{job.error_message}</p>
              )}

              {job.resulting_model_id && (
                <p className="mt-2 text-xs text-[#16A34A]">Model created: {job.resulting_model_id.slice(0, 8)}...</p>
              )}

              <div className="mt-2 text-[10px] text-[#78716C]">
                Augmentation: {(job.config as any)?.augmentation_preset ?? "standard"} ·
                Image size: {(job.config as any)?.image_size ?? 640} ·
                Max epochs: {(job.config as any)?.max_epochs ?? 100}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1C1917]">New Training Job</h3>
              <button onClick={() => setCreateOpen(false)} className="text-[#78716C]"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Architecture</label>
                <select value={arch} onChange={(e) => setArch(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="yolo11n">YOLO11n (Nano - Recommended)</option>
                  <option value="yolo11s">YOLO11s (Small)</option>
                  <option value="yolov8n">YOLOv8n (Legacy Nano)</option>
                  <option value="yolov8s">YOLOv8s (Legacy Small)</option>
                  <option value="yolov8m">YOLOv8m (Legacy Medium)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Max Epochs</label>
                <input type="number" value={epochs} onChange={(e) => setEpochs(parseInt(e.target.value) || 100)} min={1} max={500}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Augmentation</label>
                <select value={augmentation} onChange={(e) => setAugmentation(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="light">Light</option>
                  <option value="standard">Standard</option>
                  <option value="heavy">Heavy</option>
                </select>
              </div>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />} Start Training
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
