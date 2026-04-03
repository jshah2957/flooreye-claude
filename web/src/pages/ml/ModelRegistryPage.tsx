import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Box, Loader2, ArrowUpCircle, Trash2, Plus, X, CloudDownload } from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import HelpSection from "@/components/ui/HelpSection";
import { PAGE_HELP } from "@/constants/help";

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

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
  { value: "retired", label: "Retired" },
];

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
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Model Registry</h1>
          <p className="mt-1 text-sm text-gray-500">AI models: Draft → Staging → Production → Retired. Promote to deploy to edge agents.</p>
        <HelpSection title={PAGE_HELP.modelRegistry.title}>
          {PAGE_HELP.modelRegistry.content.map((line, i) => <p key={i}>{line}</p>)}
        </HelpSection>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => pullFromRoboflowMutation.mutate()}
            disabled={pullFromRoboflowMutation.isPending}
            className="flex items-center gap-2 rounded-xl border border-teal-500 px-4 py-2.5 text-sm font-medium text-teal-600 shadow-sm transition hover:bg-teal-50 disabled:opacity-50"
          >
            {pullFromRoboflowMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CloudDownload size={16} />}
            Pull from Roboflow
          </button>
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700">
            <Plus size={16} /> New Model
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`flex-shrink-0 rounded-lg px-4 py-2 text-xs font-medium transition ${
              statusFilter === tab.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Model List */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 size={28} className="animate-spin text-teal-600" />
            </div>
          ) : models.length === 0 ? (
            <EmptyState icon={Box} title="No models" description="Train your first model or create one manually." />
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Version</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Arch</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Frames</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">mAP@50</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">F1</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => (
                      <tr key={m.id} onClick={() => setSelectedModel(m)}
                        className={`cursor-pointer border-b border-gray-50 transition hover:bg-gray-50 ${selectedModel?.id === m.id ? "bg-teal-50" : ""}`}>
                        <td className="px-5 py-3 font-medium text-teal-600">{m.version_str ?? (m as any).name ?? '\u2014'}</td>
                        <td className="px-5 py-3">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{m.architecture ?? 'unknown'}</span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            {m.status === "training" && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" /></span>}
                            <StatusBadge status={m.status} />
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-500">{m.frame_count ?? 0}</td>
                        <td className="px-5 py-3 text-gray-500">{m.map_50 != null ? `${(m.map_50 * 100).toFixed(1)}%` : "\u2014"}</td>
                        <td className="px-5 py-3 text-gray-500">{m.f1 != null ? `${(m.f1 * 100).toFixed(1)}%` : "\u2014"}</td>
                        <td className="px-5 py-3 text-gray-500">{m.created_at ? new Date(m.created_at).toLocaleDateString() : '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="space-y-3 md:hidden">
                {models.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => setSelectedModel(m)}
                    className={`cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition ${
                      selectedModel?.id === m.id ? "border-teal-500 ring-2 ring-teal-500/20" : "border-gray-200"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium text-teal-600">{m.version_str ?? (m as any).name ?? '\u2014'}</span>
                      <div className="flex items-center gap-1.5">
                        {m.status === "training" && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" /></span>}
                        <StatusBadge status={m.status} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">{m.architecture ?? 'unknown'}</span>
                      {m.map_50 != null && <span>mAP: {(m.map_50 * 100).toFixed(1)}%</span>}
                      {m.model_size_mb != null && <span>{m.model_size_mb} MB</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Detail Panel */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {selectedModel ? (
            <>
              <h3 className="mb-4 text-lg font-semibold text-gray-900">{selectedModel.version_str ?? (selectedModel as any).name ?? '\u2014'}</h3>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Architecture</dt><dd><span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">{selectedModel?.architecture ?? 'unknown'}</span></dd></div>
                <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Status</dt><dd><StatusBadge status={selectedModel.status} /></dd></div>
                <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Frames</dt><dd className="font-medium text-gray-900">{selectedModel.frame_count ?? 0}</dd></div>
                {selectedModel.map_50 != null && <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">mAP@50</dt><dd className="font-medium text-gray-900">{(selectedModel.map_50 * 100).toFixed(1)}%</dd></div>}
                {selectedModel.precision != null && <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Precision</dt><dd className="font-medium text-gray-900">{(selectedModel.precision * 100).toFixed(1)}%</dd></div>}
                {selectedModel.recall != null && <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Recall</dt><dd className="font-medium text-gray-900">{(selectedModel.recall * 100).toFixed(1)}%</dd></div>}
                {selectedModel.model_size_mb != null && <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Size</dt><dd className="font-medium text-gray-900">{selectedModel.model_size_mb} MB</dd></div>}
              </dl>
              <div className="mt-5 flex flex-col gap-2.5">
                {selectedModel.status === "draft" && (
                  <button onClick={() => promoteMutation.mutate({ id: selectedModel.id, target: "staging" })}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-amber-600">
                    <ArrowUpCircle size={14} /> Promote to Staging
                  </button>
                )}
                {selectedModel.status === "staging" && (
                  <button onClick={() => promoteMutation.mutate({ id: selectedModel.id, target: "production" })}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-green-700">
                    <ArrowUpCircle size={14} /> Promote to Production
                  </button>
                )}
                <button onClick={() => setDeleteTarget(selectedModel.id)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-medium text-red-500 transition hover:bg-red-50">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Box size={32} className="mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">Select a model to view details</p>
            </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">New Model Version</h3>
              <button onClick={() => setCreateOpen(false)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Version *</label>
                <input value={newVersion} onChange={(e) => setNewVersion(e.target.value)} placeholder="v1.0.0"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Architecture *</label>
                <select value={newArch} onChange={(e) => setNewArch(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20">
                  <option value="yolov8n">YOLOv8n (Nano)</option>
                  <option value="yolov8s">YOLOv8s (Small)</option>
                  <option value="yolov8m">YOLOv8m (Medium)</option>
                </select>
              </div>
              <button onClick={() => createMutation.mutate()} disabled={!newVersion || createMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
