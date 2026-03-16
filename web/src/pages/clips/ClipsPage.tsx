import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Film, Loader2, Trash2, Play } from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";

interface Clip {
  id: string;
  camera_id: string;
  store_id: string;
  duration: number;
  file_size_mb: number | null;
  status: string;
  trigger: string;
  incident_id: string | null;
  created_at: string;
}

export default function ClipsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["clips", page],
    queryFn: async () => {
      const res = await api.get("/clips", { params: { offset: page * limit, limit } });
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/clips/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clips"] }),
  });

  const clips = (data?.data ?? []) as Clip[];
  const total = data?.meta?.total ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Recorded Clips</h1>
        <p className="text-sm text-[#78716C]">{total} clips total</p>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
      ) : clips.length === 0 ? (
        <EmptyState icon={Film} title="No recorded clips" description="Clips are created during live monitoring or incidents." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">ID</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Duration</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Size</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Trigger</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Status</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Created</th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clips.map((c) => (
                <tr key={c.id} className="border-b border-[#E7E5E0] hover:bg-[#F8F7F4]">
                  <td className="px-4 py-2 font-mono text-xs text-[#78716C]">{c.id.slice(0, 8)}</td>
                  <td className="px-4 py-2 text-[#1C1917]">{c.duration}s</td>
                  <td className="px-4 py-2 text-[#78716C]">{c.file_size_mb?.toFixed(1) ?? "—"} MB</td>
                  <td className="px-4 py-2"><StatusBadge status={c.trigger} size="sm" /></td>
                  <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-2 text-[#78716C]">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => deleteMutation.mutate(c.id)}
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
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50">Previous</button>
            <button disabled={(page + 1) * limit >= total} onClick={() => setPage(page + 1)} className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
