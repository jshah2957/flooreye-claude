import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Flag, Loader2, Eye } from "lucide-react";

import api from "@/lib/api";
import type { Detection, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";

export default function ReviewQueuePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"pending" | "flagged">("pending");
  const [page, setPage] = useState(0);
  const limit = 12;

  const { data: flaggedData, isLoading: flaggedLoading } = useQuery({
    queryKey: ["flagged-detections", page],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Detection>>("/detection/flagged", {
        params: { offset: page * limit, limit },
      });
      return res.data;
    },
    enabled: tab === "flagged",
  });

  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ["review-pending", page],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Detection>>("/detection/history", {
        params: { offset: page * limit, limit, is_wet: true },
      });
      return res.data;
    },
    enabled: tab === "pending",
  });

  const flagMutation = useMutation({
    mutationFn: (id: string) => api.post(`/detection/history/${id}/flag`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flagged-detections"] });
      queryClient.invalidateQueries({ queryKey: ["review-pending"] });
    },
  });

  const trainingMutation = useMutation({
    mutationFn: (id: string) => api.post(`/detection/history/${id}/add-to-training`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["review-pending"] }),
  });

  const data = tab === "flagged" ? flaggedData : recentData;
  const isLoading = tab === "flagged" ? flaggedLoading : recentLoading;
  const detections = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Review Queue</h1>
        <p className="text-sm text-[#78716C]">Validate detections and improve model accuracy</p>
      </div>

      <div className="mb-4 flex gap-1 border-b border-[#E7E5E0]">
        <button onClick={() => { setTab("pending"); setPage(0); }}
          className={`px-4 py-2.5 text-sm font-medium ${tab === "pending" ? "border-b-2 border-[#0D9488] text-[#0D9488]" : "text-[#78716C]"}`}>
          Pending Validation
        </button>
        <button onClick={() => { setTab("flagged"); setPage(0); }}
          className={`px-4 py-2.5 text-sm font-medium ${tab === "flagged" ? "border-b-2 border-[#0D9488] text-[#0D9488]" : "text-[#78716C]"}`}>
          Flagged ({flaggedData?.meta?.total ?? 0})
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
      ) : detections.length === 0 ? (
        <EmptyState icon={Eye} title={tab === "flagged" ? "No flagged detections" : "No pending reviews"} description="All caught up!" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {detections.map((d) => (
            <div key={d.id} className="rounded-lg border border-[#E7E5E0] bg-white overflow-hidden">
              {d.frame_base64 ? (
                <img src={`data:image/jpeg;base64,${d.frame_base64}`} alt="" className="h-[175px] w-full object-cover bg-gray-100" />
              ) : (
                <div className="flex h-[175px] items-center justify-center bg-gray-100 text-xs text-[#78716C]">No frame</div>
              )}
              <div className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <StatusBadge status={d.is_wet ? "critical" : "online"} />
                  <span className="text-sm font-semibold text-[#1C1917]">{(d.confidence * 100).toFixed(0)}%</span>
                </div>
                <p className="text-xs text-[#78716C]">{d.model_source.toUpperCase()} · {new Date(d.timestamp).toLocaleString()}</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => trainingMutation.mutate(d.id)} disabled={d.in_training_set}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-[#16A34A] px-2 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-50">
                    <CheckCircle2 size={12} /> {d.in_training_set ? "Added" : "Correct"}
                  </button>
                  <button onClick={() => flagMutation.mutate(d.id)}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs ${
                      d.is_flagged ? "bg-[#FEE2E2] text-[#DC2626]" : "bg-gray-100 text-[#78716C] hover:bg-gray-200"
                    }`}>
                    <Flag size={12} /> {d.is_flagged ? "Flagged" : "Incorrect"}
                  </button>
                </div>
              </div>
            </div>
          ))}
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
