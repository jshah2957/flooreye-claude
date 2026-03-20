import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Box, Loader2, ArrowUpCircle, Trash2, Plus, X, CloudDownload } from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";

interface ModelVersion {
  id: string;
  version_str: string;
  architecture: string;
  status: string;
  frame_count: number;
  map_50: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  model_size_mb: number | null;
  training_job_id: string | null;
  created_at: string;
}

export default function ModelRegistryPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelVersion | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newVersion, setNewVersion] = useState("");
  const [newArch, setNewArch] = useState("yolov8n");

  const { data, isLoading } = useQuery({
    queryKey: ["models", statusFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = { limit: 100 };
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/models", { params });
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/models", { version_str: newVersion, architecture: newArch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
      setCreateOpen(false); setNewVersion("");
      success("Model created");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to create model");
    },
  });

  const pullFromRoboflowMutation = useMutation({
    mutationFn: () => api.post("/roboflow/pull-model", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
      success("Model pulled from Roboflow");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to pull model from Roboflow");
    },
  });

  const promoteMutation = useMutation({
    mutationFn: ({ id, target }: { id: string; target: string }) =>
      api.post(`/models/${id}/promote`, { target }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
      setSelectedModel(null);
      success("Model promoted");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to promote model");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/models/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
      setSelectedModel(null);
      success("Model deleted");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to delete model");
    },
  });

  const models = (data?.data ?? []) as ModelVersion[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1C1917]">Model Registry</h1>
        <div className="flex gap-2">
          <button
            onClick={() => pullFromRoboflowMutation.mutate()}
            disabled={pullFromRoboflowMutation.isPending}
            className="flex items-center gap-2 rounded-md border border-[#0D9488] px-4 py-2 text-sm font-medium text-[#0D9488] hover:bg-[#F0FDFA] disabled:opacity-50"
          >
            {pullFromRoboflowMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CloudDownload size={16} />}
            Pull from Roboflow
          </button>
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]">
            <Plus size={16} /> New Model
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
          ) : models.length === 0 ? (
            <EmptyState icon={Box} title="No models" description="Train your first model or create one manually." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                    <th className="px-4 py-2 text-left font-medium text-[#78716C]">Version</th>
                    <th className="px-4 py-2 text-left font-medium text-[#78716C]">Arch</th>
                    <th className="px-4 py-2 text-left font-medium text-[#78716C]">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-[#78716C]">Frames</th>
                    <th className="px-4 py-2 text-left font-medium text-[#78716C]">mAP@50</th>
                    <th className="px-4 py-2 text-left font-medium text-[#78716C]">F1</th>
                    <th className="px-4 py-2 text-left font-medium text-[#78716C]">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.id} onClick={() => setSelectedModel(m)}
                      className={`border-b border-[#E7E5E0] cursor-pointer hover:bg-[#F8F7F4] ${selectedModel?.id === m.id ? "bg-[#CCFBF1]" : ""}`}>
                      <td className="px-4 py-2 font-medium text-[#0D9488]">{m.version_str ?? (m as any).name ?? '—'}</td>
                      <td className="px-4 py-2 text-[#78716C]">{m.architecture ?? 'unknown'}</td>
                      <td className="px-4 py-2"><StatusBadge status={m.status} /></td>
                      <td className="px-4 py-2 text-[#78716C]">{m.frame_count ?? 0}</td>
                      <td className="px-4 py-2 text-[#78716C]">{m.map_50 != null ? `${(m.map_50 * 100).toFixed(1)}%` : "—"}</td>
                      <td className="px-4 py-2 text-[#78716C]">{m.f1 != null ? `${(m.f1 * 100).toFixed(1)}%` : "—"}</td>
                      <td className="px-4 py-2 text-[#78716C]">{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
          {selectedModel ? (
            <>
              <h3 className="mb-3 text-base font-semibold text-[#1C1917]">{selectedModel.version_str ?? (selectedModel as any).name ?? '—'}</h3>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between"><dt className="text-[#78716C]">Architecture</dt><dd className="text-[#1C1917]">{selectedModel?.architecture ?? 'unknown'}</dd></div>
                <div className="flex justify-between"><dt className="text-[#78716C]">Status</dt><dd><StatusBadge status={selectedModel.status} /></dd></div>
                <div className="flex justify-between"><dt className="text-[#78716C]">Frames</dt><dd className="text-[#1C1917]">{selectedModel.frame_count ?? 0}</dd></div>
                {selectedModel.map_50 != null && <div className="flex justify-between"><dt className="text-[#78716C]">mAP@50</dt><dd className="text-[#1C1917]">{(selectedModel.map_50 * 100).toFixed(1)}%</dd></div>}
                {selectedModel.precision != null && <div className="flex justify-between"><dt className="text-[#78716C]">Precision</dt><dd className="text-[#1C1917]">{(selectedModel.precision * 100).toFixed(1)}%</dd></div>}
                {selectedModel.recall != null && <div className="flex justify-between"><dt className="text-[#78716C]">Recall</dt><dd className="text-[#1C1917]">{(selectedModel.recall * 100).toFixed(1)}%</dd></div>}
                {selectedModel.model_size_mb != null && <div className="flex justify-between"><dt className="text-[#78716C]">Size</dt><dd className="text-[#1C1917]">{selectedModel.model_size_mb} MB</dd></div>}
              </dl>
              <div className="mt-4 flex flex-col gap-2">
                {selectedModel.status === "draft" && (
                  <button onClick={() => promoteMutation.mutate({ id: selectedModel.id, target: "staging" })}
                    className="flex items-center justify-center gap-1 rounded-md bg-[#D97706] px-3 py-2 text-xs text-white hover:bg-amber-700">
                    <ArrowUpCircle size={12} /> Promote to Staging
                  </button>
                )}
                {selectedModel.status === "staging" && (
                  <button onClick={() => promoteMutation.mutate({ id: selectedModel.id, target: "production" })}
                    className="flex items-center justify-center gap-1 rounded-md bg-[#16A34A] px-3 py-2 text-xs text-white hover:bg-green-700">
                    <ArrowUpCircle size={12} /> Promote to Production
                  </button>
                )}
                <button onClick={() => setDeleteTarget(selectedModel.id)}
                  className="flex items-center justify-center gap-1 rounded-md border border-[#E7E5E0] px-3 py-2 text-xs text-[#DC2626] hover:bg-[#FEE2E2]">
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-xs text-[#78716C]">Select a model to view details</p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Model"
        description="This model will be permanently deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Create Dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1C1917]">New Model Version</h3>
              <button onClick={() => setCreateOpen(false)} className="text-[#78716C]"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Version *</label>
                <input value={newVersion} onChange={(e) => setNewVersion(e.target.value)} placeholder="v1.0.0"
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Architecture *</label>
                <select value={newArch} onChange={(e) => setNewArch(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="yolov8n">YOLOv8n (Nano)</option>
                  <option value="yolov8s">YOLOv8s (Small)</option>
                  <option value="yolov8m">YOLOv8m (Medium)</option>
                </select>
              </div>
              <button onClick={() => createMutation.mutate()} disabled={!newVersion || createMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
