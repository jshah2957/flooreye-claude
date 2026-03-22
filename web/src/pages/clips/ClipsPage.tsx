import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Film, Loader2, Trash2, Download, Scissors } from "lucide-react";

import api from "@/lib/api";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

interface Clip {
  id: string;
  camera_id: string;
  store_id: string;
  duration: number;
  file_size_mb: number | null;
  status: string;
  trigger: string;
  file_path: string | null;
  thumbnail_path: string | null;
  created_at: string;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function ClipsPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clips"],
    queryFn: async () => {
      const res = await api.get("/clips", { params: { limit: 50 } });
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/clips/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clips"] });
      setDeleteTarget(null);
      success("Clip deleted");
    },
    onError: () => showError("Failed to delete clip"),
  });

  const clips: Clip[] = data?.data ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recorded Clips</h1>
        <p className="mt-1 text-sm text-gray-500">
          {clips.length} clip{clips.length !== 1 ? "s" : ""} available
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-4 p-4">
                <div className="h-12 w-16 rounded-lg bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-48 rounded bg-gray-200" />
                </div>
                <div className="h-8 w-24 rounded-lg bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      ) : clips.length === 0 ? (
        <EmptyState icon={Film} title="No clips recorded" description="Go to a camera's Live Feed tab and click Record to create clips." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            {clips.map((clip) => (
              <div key={clip.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-gray-50">
                {/* Thumbnail */}
                <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                  <Film size={20} className="text-gray-400" />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatDuration(clip.duration)} clip
                    </p>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      clip.status === "completed" ? "bg-green-50 text-green-700" :
                      clip.status === "recording" ? "bg-amber-50 text-amber-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {clip.status === "recording" && (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                      )}
                      {clip.status}
                    </span>
                    {clip.file_size_mb && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                        {clip.file_size_mb.toFixed(1)} MB
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {new Date(clip.created_at).toLocaleString()}
                    {clip.trigger && ` \u00b7 ${clip.trigger}`}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 gap-1.5">
                  {clip.file_path && (
                    <button
                      title="Download"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      <Download size={12} />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  )}
                  <button
                    title="Extract Frames"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    <Scissors size={12} />
                    <span className="hidden sm:inline">Extract</span>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(clip.id)}
                    title="Delete"
                    className="rounded-lg border border-red-200 p-1.5 text-red-500 transition-colors hover:bg-red-50"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Clip"
        description="Delete this clip permanently?"
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
