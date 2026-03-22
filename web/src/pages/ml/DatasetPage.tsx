import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Database,
  Trash2,
  Loader2,
  Download,
  Upload,
  ClipboardCheck,
  ImageIcon,
  Layers,
  FlaskConical,
  TestTube,
  HelpCircle,
} from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useAuth } from "@/hooks/useAuth";

const ADMIN_ROLES = ["super_admin", "org_admin"];

/** Map label_source to a human-readable status */
function labelStatusFromSource(
  source: string
): { label: string; color: string } {
  switch (source) {
    case "manual_upload":
      return { label: "Manual Upload", color: "text-blue-600" };
    default:
      return { label: "Unknown", color: "text-gray-500" };
  }
}

const STAT_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  train: { icon: Layers, color: "text-blue-600", bg: "bg-blue-50" },
  val: { icon: FlaskConical, color: "text-violet-600", bg: "bg-violet-50" },
  test: { icon: TestTube, color: "text-amber-600", bg: "bg-amber-50" },
  unassigned: { icon: HelpCircle, color: "text-gray-500", bg: "bg-gray-50" },
};

export default function DatasetPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { user } = useAuth();
  const isAdmin = user ? ADMIN_ROLES.includes(user.role) : false;

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [splitFilter, setSplitFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [exportingCoco, setExportingCoco] = useState(false);
  const [uploadingRoboflow, setUploadingRoboflow] = useState(false);
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

  async function handleExportCoco() {
    setExportingCoco(true);
    try {
      const res = await api.get("/dataset/export/coco", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "dataset_coco.zip");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      success("COCO export downloaded");
    } catch (err: any) {
      showError(err?.response?.data?.detail || "Failed to export COCO");
    } finally {
      setExportingCoco(false);
    }
  }

  async function handleUploadRoboflow() {
    setUploadingRoboflow(true);
    try {
      await api.post("/dataset/upload-to-roboflow");
      success("Frames uploaded to Roboflow");
    } catch (err: any) {
      showError(
        err?.response?.data?.detail || "Failed to upload to Roboflow"
      );
    } finally {
      setUploadingRoboflow(false);
    }
  }

  const frames = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Dataset Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {stats?.total_frames ?? 0} frames total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate("/review")}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <ClipboardCheck size={15} />
            Review Queue
          </button>
          <button
            onClick={handleExportCoco}
            disabled={exportingCoco}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
          >
            {exportingCoco ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            Export COCO
          </button>
          {isAdmin && (
            <button
              onClick={handleUploadRoboflow}
              disabled={uploadingRoboflow}
              className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
            >
              {uploadingRoboflow ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Upload size={15} />
              )}
              Upload to Roboflow
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
              <Database size={16} className="text-teal-600" />
            </div>
            <p className="text-xs text-gray-500">Total Frames</p>
            <p className="text-xl font-bold text-gray-900">{stats.total_frames ?? 0}</p>
          </div>
          {Object.entries(stats.by_split as Record<string, number>).map(
            ([split, count]) => {
              const cfg = STAT_CONFIG[split] ?? { icon: Database, color: "text-gray-500", bg: "bg-gray-50" };
              const Icon = cfg.icon;
              return (
                <div key={split} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${cfg.bg}`}>
                    <Icon size={16} className={cfg.color} />
                  </div>
                  <p className="text-xs capitalize text-gray-500">{split}</p>
                  <p className="text-xl font-bold text-gray-900">{count}</p>
                </div>
              );
            }
          )}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
              <ImageIcon size={16} className="text-green-600" />
            </div>
            <p className="text-xs text-gray-500">Included</p>
            <p className="text-xl font-bold text-green-600">{stats.included}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={splitFilter}
          onChange={(e) => {
            setSplitFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        >
          <option value="">All Splits</option>
          <option value="train">Train</option>
          <option value="val">Val</option>
          <option value="test">Test</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        >
          <option value="">All Sources</option>
          <option value="manual_upload">Manual Upload</option>
        </select>
      </div>

      {/* Table / Cards */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 size={28} className="animate-spin text-teal-600" />
        </div>
      ) : frames.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No frames"
          description="Dataset frames appear here once detections are processed and reviewed."
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Path
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Label
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Source
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Review Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Split
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Created
                  </th>
                  {isAdmin && (
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {frames.map((f: any) => {
                  const review = labelStatusFromSource(f.label_source);
                  return (
                    <tr
                      key={f.id}
                      className="border-b border-gray-50 transition hover:bg-gray-50"
                    >
                      <td className="max-w-[200px] truncate px-5 py-3 font-mono text-xs text-gray-900">
                        {f.frame_path}
                      </td>
                      <td className="px-5 py-3">
                        {f.label_class ? (
                          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">{f.label_class}</span>
                        ) : (
                          <span className="text-gray-400">\u2014</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={f.label_source} size="sm" />
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium ${review.color}`}>
                          {review.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={f.split} size="sm" />
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {new Date(f.created_at).toLocaleDateString()}
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => setDeleteTarget(f.id)}
                            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {frames.map((f: any) => {
              const review = labelStatusFromSource(f.label_source);
              return (
                <div key={f.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="truncate font-mono text-xs text-gray-900">{f.frame_path}</span>
                    {isAdmin && (
                      <button
                        onClick={() => setDeleteTarget(f.id)}
                        className="ml-2 rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {f.label_class && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">{f.label_class}</span>}
                    <StatusBadge status={f.split} size="sm" />
                    <span className={`text-[10px] font-medium ${review.color}`}>{review.label}</span>
                  </div>
                  <p className="mt-1.5 text-[10px] text-gray-400">{new Date(f.created_at).toLocaleDateString()}</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {total > limit && (
        <div className="mt-5 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {page * limit + 1}&ndash;
            {Math.min((page + 1) * limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium transition hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={(page + 1) * limit >= total}
              onClick={() => setPage(page + 1)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium transition hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Frame"
        description="This frame will be permanently deleted from the dataset."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
