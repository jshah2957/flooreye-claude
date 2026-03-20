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
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Recorded Clips</h1>
        <p className="text-sm text-[#78716C]">{clips.length} clips available. Record clips from the Camera Detail live feed tab.</p>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
      ) : clips.length === 0 ? (
        <EmptyState icon={Film} title="No clips recorded" description="Go to a camera's Live Feed tab and click Record to create clips." />
      ) : (
        <div className="space-y-3">
          {clips.map((clip) => (
            <div key={clip.id} className="flex items-center justify-between rounded-lg border border-[#E7E5E0] bg-white p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-16 items-center justify-center rounded bg-[#F1F0ED]">
                  <Film size={20} className="text-[#78716C]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1C1917]">
                    {clip.duration}s clip
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      clip.status === "completed" ? "bg-[#DCFCE7] text-[#16A34A]" :
                      clip.status === "recording" ? "bg-[#FEF9C3] text-[#CA8A04]" :
                      "bg-[#F1F0ED] text-[#78716C]"
                    }`}>
                      {clip.status}
                    </span>
                  </p>
                  <p className="text-xs text-[#78716C]">
                    {new Date(clip.created_at).toLocaleString()}
                    {clip.file_size_mb && ` · ${clip.file_size_mb.toFixed(1)} MB`}
                    {` · ${clip.trigger}`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {clip.file_path && (
                  <button className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-2 py-1 text-xs text-[#78716C] hover:bg-[#F1F0ED]">
                    <Download size={12} /> Download
                  </button>
                )}
                <button className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-2 py-1 text-xs text-[#78716C] hover:bg-[#F1F0ED]">
                  <Scissors size={12} /> Extract Frames
                </button>
                <button
                  onClick={() => setDeleteTarget(clip.id)}
                  className="rounded-md border border-[#FCA5A5] px-2 py-1 text-xs text-[#DC2626] hover:bg-[#FEE2E2]">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
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
