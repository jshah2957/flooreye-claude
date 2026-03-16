import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, Trash2, Loader2, BarChart3 } from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";

export default function DatasetPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [splitFilter, setSplitFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["dataset-frames", page, splitFilter, sourceFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = { offset: page * limit, limit };
      if (splitFilter) params.split = splitFilter;
      if (sourceFilter) params.label_source = sourceFilter;
      const res = await api.get("/dataset/frames", { params });
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/dataset/frames/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-frames"] });
      queryClient.invalidateQueries({ queryKey: ["dataset-stats"] });
      success("Frame deleted");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to delete frame");
    },
  });

  const frames = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Dataset Management</h1>
        <p className="text-sm text-[#78716C]">{stats?.total_frames ?? 0} frames total</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Object.entries(stats.by_split as Record<string, number>).map(([split, count]) => (
            <div key={split} className="rounded-lg border border-[#E7E5E0] bg-white p-3">
              <p className="text-xs text-[#78716C] capitalize">{split}</p>
              <p className="text-lg font-semibold text-[#1C1917]">{count}</p>
            </div>
          ))}
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-3">
            <p className="text-xs text-[#78716C]">Included</p>
            <p className="text-lg font-semibold text-[#16A34A]">{stats.included}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex gap-3">
        <select value={splitFilter} onChange={(e) => { setSplitFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
          <option value="">All Splits</option>
          <option value="train">Train</option>
          <option value="val">Val</option>
          <option value="test">Test</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
          <option value="">All Sources</option>
          <option value="teacher_roboflow">Roboflow</option>
          <option value="human_validated">Human Validated</option>
          <option value="human_corrected">Human Corrected</option>
          <option value="student_pseudolabel">Student</option>
          <option value="manual_upload">Manual Upload</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
      ) : frames.length === 0 ? (
        <EmptyState icon={Database} title="No frames" description="Add frames to your training dataset." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Path</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Label</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Source</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Split</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Created</th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((f: any) => (
                <tr key={f.id} className="border-b border-[#E7E5E0] hover:bg-[#F8F7F4]">
                  <td className="px-4 py-2 text-[#1C1917] truncate max-w-[200px]">{f.frame_path}</td>
                  <td className="px-4 py-2 text-[#78716C]">{f.label_class ?? "—"}</td>
                  <td className="px-4 py-2"><StatusBadge status={f.label_source} size="sm" /></td>
                  <td className="px-4 py-2"><StatusBadge status={f.split} size="sm" /></td>
                  <td className="px-4 py-2 text-[#78716C]">{new Date(f.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setDeleteTarget(f.id)}
                      className="rounded p-1 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-[#78716C]">
          <span>Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}
              className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50">Previous</button>
            <button disabled={(page + 1) * limit >= total} onClick={() => setPage(page + 1)}
              className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50">Next</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Frame"
        description="This frame will be permanently deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
