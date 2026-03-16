import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle, Loader2, Play, X, XCircle } from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";

interface AutoLabelJob {
  id: string;
  status: string;
  frames_processed: number;
  total_frames: number;
  confidence_threshold: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  error_message: string | null;
}

export default function AutoLabelPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [approveJobId, setApproveJobId] = useState<string | null>(null);

  // Job creation form state
  const [storeId, setStoreId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [maxFrames, setMaxFrames] = useState(500);

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get("/stores", { params: { limit: 200 } });
      return res.data.data ?? [];
    },
  });

  const { data: cameras } = useQuery({
    queryKey: ["cameras-list", storeId],
    queryFn: async () => {
      const params: Record<string, unknown> = { limit: 200 };
      if (storeId) params.store_id = storeId;
      const res = await api.get("/cameras", { params });
      return res.data.data ?? [];
    },
  });

  // Unlabeled frame count
  const { data: unlabeledData } = useQuery({
    queryKey: ["unlabeled-frames"],
    queryFn: async () => {
      const res = await api.get("/dataset/frames", { params: { label_source: "unlabeled", limit: 1 } });
      return res.data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["dataset-stats"],
    queryFn: async () => {
      const res = await api.get("/dataset/stats");
      return res.data.data;
    },
  });

  // Auto-label jobs list (using dataset frames with auto-label source as proxy, or dedicated endpoint)
  const { data: jobsData, isLoading } = useQuery({
    queryKey: ["auto-label-jobs"],
    queryFn: async () => {
      const res = await api.get("/dataset/auto-label/jobs", { params: { limit: 50 } });
      return res.data;
    },
    refetchInterval: 5000,
    retry: false,
  });

  const jobs = (jobsData?.data ?? []) as AutoLabelJob[];
  const unlabeledCount = unlabeledData?.meta?.total ?? 0;

  const lastCompletedJob = jobs.find((j) => j.status === "completed");
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const successRate = completedJobs.length + failedJobs.length > 0
    ? ((completedJobs.length / (completedJobs.length + failedJobs.length)) * 100).toFixed(0)
    : "N/A";

  const startMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        confidence_threshold: confidenceThreshold,
        max_frames: maxFrames,
      };
      if (storeId) body.store_id = storeId;
      if (cameraId) body.camera_id = cameraId;
      if (dateFrom) body.date_from = dateFrom;
      if (dateTo) body.date_to = dateTo;
      return api.post("/dataset/auto-label", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-label-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["unlabeled-frames"] });
      setCreateOpen(false);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (jobId: string) => api.post(`/dataset/auto-label/${jobId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-label-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["dataset-stats"] });
      setApproveJobId(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => api.post(`/dataset/auto-label/${jobId}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auto-label-jobs"] }),
  });

  function progressPercent(job: AutoLabelJob): number {
    if (!job.total_frames || job.total_frames === 0) return 0;
    return Math.round((job.frames_processed / job.total_frames) * 100);
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Auto-Labeling</h1>
          <p className="text-sm text-[#78716C]">Automatically label frames using the teacher model</p>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]">
          <Play size={16} /> Start Auto-Label Job
        </button>
      </div>

      {/* Stats Row */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
          <p className="text-xs text-[#78716C]">Unlabeled Frames</p>
          <p className="text-2xl font-bold text-[#1C1917]">{unlabeledCount}</p>
        </div>
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
          <p className="text-xs text-[#78716C]">Last Job Completed</p>
          <p className="text-lg font-semibold text-[#1C1917]">
            {lastCompletedJob?.completed_at
              ? new Date(lastCompletedJob.completed_at).toLocaleDateString()
              : "Never"}
          </p>
        </div>
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
          <p className="text-xs text-[#78716C]">Success Rate</p>
          <p className="text-2xl font-bold text-[#16A34A]">{successRate}{successRate !== "N/A" ? "%" : ""}</p>
        </div>
      </div>

      {/* Jobs Table */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#0D9488]" />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={Bot} title="No auto-label jobs" description="Start an auto-labeling job to label frames automatically." actionLabel="Start Job" onAction={() => setCreateOpen(true)} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Job ID</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Status</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Processed</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Total</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Progress</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Started</th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-[#E7E5E0] hover:bg-[#F8F7F4]">
                  <td className="px-4 py-2 font-mono text-xs text-[#1C1917]">{job.id.slice(0, 8)}...</td>
                  <td className="px-4 py-2"><StatusBadge status={job.status} size="sm" /></td>
                  <td className="px-4 py-2 text-[#1C1917]">{job.frames_processed}</td>
                  <td className="px-4 py-2 text-[#78716C]">{job.total_frames}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-[#0D9488] transition-all"
                          style={{ width: `${progressPercent(job)}%` }} />
                      </div>
                      <span className="text-xs text-[#78716C]">{progressPercent(job)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-[#78716C]">
                    {job.started_at ? new Date(job.started_at).toLocaleString() : "Pending"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {job.status === "completed" && (
                        <button onClick={() => setApproveJobId(job.id)}
                          className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-2 py-1 text-xs text-[#16A34A] hover:bg-[#DCFCE7]">
                          <CheckCircle size={12} /> Approve
                        </button>
                      )}
                      {(job.status === "queued" || job.status === "running") && (
                        <button onClick={() => cancelMutation.mutate(job.id)}
                          className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-2 py-1 text-xs text-[#DC2626] hover:bg-[#FEE2E2]">
                          <XCircle size={12} /> Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approve Dialog */}
      {approveJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1C1917]">Approve Auto-Labels</h3>
              <button onClick={() => setApproveJobId(null)} className="text-[#78716C]"><X size={18} /></button>
            </div>
            <p className="mb-4 text-sm text-[#78716C]">
              This will approve all auto-generated labels from job <span className="font-mono">{approveJobId.slice(0, 8)}...</span> and
              add them to the training dataset. The labels were generated by the teacher model (Roboflow).
            </p>
            <p className="mb-4 text-xs text-[#78716C]">
              After approval, labels will be marked as teacher-validated and included in future training runs.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setApproveJobId(null)}
                className="flex-1 rounded-md border border-[#E7E5E0] px-4 py-2.5 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]">
                Cancel
              </button>
              <button onClick={() => approveMutation.mutate(approveJobId)} disabled={approveMutation.isPending}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[#16A34A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15803D] disabled:opacity-50">
                {approveMutation.isPending && <Loader2 size={14} className="animate-spin" />} Approve All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start Job Dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1C1917]">Start Auto-Label Job</h3>
              <button onClick={() => setCreateOpen(false)} className="text-[#78716C]"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Store</label>
                <select value={storeId} onChange={(e) => { setStoreId(e.target.value); setCameraId(""); }}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="">All Stores</option>
                  {(stores ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Camera</label>
                <select value={cameraId} onChange={(e) => setCameraId(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="">All Cameras</option>
                  {(cameras ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#1C1917]">From</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#1C1917]">To</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">
                  Confidence Threshold: {confidenceThreshold.toFixed(2)}
                </label>
                <input type="range" min={0.1} max={0.99} step={0.01} value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="w-full accent-[#0D9488]" />
                <div className="flex justify-between text-xs text-[#78716C]">
                  <span>0.10</span><span>0.99</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Max Frames</label>
                <input type="number" value={maxFrames} onChange={(e) => setMaxFrames(parseInt(e.target.value) || 500)}
                  min={1} max={10000}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
                {startMutation.isPending && <Loader2 size={14} className="animate-spin" />} Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
