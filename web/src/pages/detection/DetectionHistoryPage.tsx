import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Grid3X3,
  List,
  Flag,
  Star,
  X,
  Loader2,
  Eye as EyeIcon,
} from "lucide-react";

import api from "@/lib/api";
import type { Detection, Store, Camera, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";

type ViewMode = "gallery" | "table";

export default function DetectionHistoryPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [view, setView] = useState<ViewMode>("gallery");
  const [page, setPage] = useState(0);
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null);
  const limit = 20;

  // Filters
  const [storeFilter, setStoreFilter] = useState("");
  const [cameraFilter, setCameraFilter] = useState("");
  const [wetFilter, setWetFilter] = useState<string>("");
  const [modelFilter, setModelFilter] = useState("");
  const [minConfidence, setMinConfidence] = useState(0);
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", { params: { limit: 100 } });
      return res.data.data;
    },
  });

  const { data: cameras } = useQuery({
    queryKey: ["cameras-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Camera>>("/cameras", { params: { limit: 100 } });
      return res.data.data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["detections", page, storeFilter, cameraFilter, wetFilter, modelFilter, minConfidence],
    queryFn: async () => {
      const params: Record<string, unknown> = { offset: page * limit, limit };
      if (storeFilter) params.store_id = storeFilter;
      if (cameraFilter) params.camera_id = cameraFilter;
      if (wetFilter === "wet") params.is_wet = true;
      if (wetFilter === "dry") params.is_wet = false;
      if (modelFilter) params.model_source = modelFilter;
      if (minConfidence > 0) params.min_confidence = minConfidence / 100;
      const res = await api.get<PaginatedResponse<Detection>>("/detection/history", { params });
      return res.data;
    },
  });

  const flagMutation = useMutation({
    mutationFn: (id: string) => api.post(`/detection/history/${id}/flag`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detections"] });
      success("Detection flagged");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to flag detection");
    },
  });

  const trainingMutation = useMutation({
    mutationFn: (id: string) => api.post(`/detection/history/${id}/add-to-training`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detections"] });
      success("Added to training set");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to add to training set");
    },
  });

  const detections = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const filtered = flaggedOnly ? detections.filter((d) => d.is_flagged) : detections;

  const cameraMap = new Map((cameras ?? []).map((c) => [c.id, c.name]));
  const storeMap = new Map((stores ?? []).map((s) => [s.id, s.name]));

  function confColor(conf: number) {
    if (conf >= 0.7) return "text-[#16A34A]";
    if (conf >= 0.5) return "text-[#D97706]";
    return "text-[#DC2626]";
  }

  function clearFilters() {
    setStoreFilter(""); setCameraFilter(""); setWetFilter(""); setModelFilter("");
    setMinConfidence(0); setFlaggedOnly(false); setPage(0);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Detection History</h1>
        <p className="text-sm text-[#78716C]">{total} detections total</p>
      </div>

      {/* Filter Bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={storeFilter} onChange={(e) => { setStoreFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
          <option value="">All Stores</option>
          {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={cameraFilter} onChange={(e) => { setCameraFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
          <option value="">All Cameras</option>
          {(cameras ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={wetFilter} onChange={(e) => { setWetFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
          <option value="">All Results</option>
          <option value="wet">Wet Only</option>
          <option value="dry">Dry Only</option>
        </select>
        <select value={modelFilter} onChange={(e) => { setModelFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
          <option value="">All Models</option>
          <option value="roboflow">Roboflow</option>
          <option value="student">Student</option>
          <option value="hybrid_escalated">Hybrid</option>
        </select>
        <div className="flex items-center gap-2 text-sm text-[#78716C]">
          <span>Min conf:</span>
          <input type="range" min={0} max={100} value={minConfidence}
            onChange={(e) => { setMinConfidence(parseInt(e.target.value)); setPage(0); }} className="w-20" />
          <span className="w-8">{minConfidence}%</span>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-[#1C1917]">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)}
            className="rounded border-[#E7E5E0]" />
          Flagged
        </label>
        {(storeFilter || cameraFilter || wetFilter || modelFilter || minConfidence > 0 || flaggedOnly) && (
          <button onClick={clearFilters} className="text-sm text-[#0D9488] hover:underline">Clear Filters</button>
        )}
        <div className="flex-1" />
        <div className="flex gap-1 rounded-md border border-[#E7E5E0]">
          <button onClick={() => setView("gallery")}
            className={`p-2 ${view === "gallery" ? "bg-[#0D9488] text-white" : "text-[#78716C]"} rounded-l-md`}>
            <Grid3X3 size={14} />
          </button>
          <button onClick={() => setView("table")}
            className={`p-2 ${view === "table" ? "bg-[#0D9488] text-white" : "text-[#78716C]"} rounded-r-md`}>
            <List size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#0D9488]" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={EyeIcon} title="No detections found" description="Adjust filters or run a detection." />
      ) : view === "gallery" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((d) => (
            <div key={d.id} onClick={() => setSelectedDetection(d)}
              className="cursor-pointer rounded-lg border border-[#E7E5E0] bg-white overflow-hidden hover:border-[#0D9488] transition-colors">
              {d.frame_base64 ? (
                <img src={`data:image/jpeg;base64,${d.frame_base64}`} alt="Detection"
                  className="h-[175px] w-full object-cover bg-gray-100" />
              ) : (
                <div className="flex h-[175px] items-center justify-center bg-gray-100 text-xs text-[#78716C]">No frame</div>
              )}
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <StatusBadge status={d.is_wet ? "critical" : "online"} />
                  <span className={`text-sm font-semibold ${confColor(d.confidence)}`}>
                    {(d.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#78716C]">
                  {cameraMap.get(d.camera_id) ?? "Unknown"} &middot; {storeMap.get(d.store_id) ?? ""}
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <StatusBadge status={d.model_source} size="sm" />
                  <span className="text-[10px] text-[#78716C]">
                    {new Date(d.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); flagMutation.mutate(d.id); }}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] ${d.is_flagged ? "bg-[#FEE2E2] text-[#DC2626]" : "bg-gray-50 text-[#78716C] hover:bg-gray-100"}`}>
                    <Flag size={10} /> {d.is_flagged ? "Flagged" : "Flag"}
                  </button>
                  {!d.in_training_set && (
                    <button onClick={(e) => { e.stopPropagation(); trainingMutation.mutate(d.id); }}
                      className="flex items-center gap-1 rounded bg-gray-50 px-2 py-1 text-[10px] text-[#78716C] hover:bg-gray-100">
                      <Star size={10} /> Training
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                <th className="px-3 py-2 text-left font-medium text-[#78716C]">Frame</th>
                <th className="px-3 py-2 text-left font-medium text-[#78716C]">Result</th>
                <th className="px-3 py-2 text-left font-medium text-[#78716C]">Confidence</th>
                <th className="px-3 py-2 text-left font-medium text-[#78716C]">Wet Area</th>
                <th className="px-3 py-2 text-left font-medium text-[#78716C]">Camera</th>
                <th className="px-3 py-2 text-left font-medium text-[#78716C]">Store</th>
                <th className="px-3 py-2 text-left font-medium text-[#78716C]">Time</th>
                <th className="px-3 py-2 text-left font-medium text-[#78716C]">Model</th>
                <th className="px-3 py-2 text-right font-medium text-[#78716C]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-[#E7E5E0] hover:bg-[#F8F7F4] cursor-pointer"
                  onClick={() => setSelectedDetection(d)}>
                  <td className="px-3 py-2">
                    {d.frame_base64 ? (
                      <img src={`data:image/jpeg;base64,${d.frame_base64}`} className="h-[50px] w-[80px] rounded object-cover" alt="" />
                    ) : <div className="h-[50px] w-[80px] rounded bg-gray-100" />}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={d.is_wet ? "critical" : "online"} /></td>
                  <td className={`px-3 py-2 font-medium ${confColor(d.confidence)}`}>{(d.confidence * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2 text-[#78716C]">{d.wet_area_percent.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-[#78716C]">{cameraMap.get(d.camera_id) ?? "—"}</td>
                  <td className="px-3 py-2 text-[#78716C]">{storeMap.get(d.store_id) ?? "—"}</td>
                  <td className="px-3 py-2 text-[#78716C]">{new Date(d.timestamp).toLocaleString()}</td>
                  <td className="px-3 py-2"><StatusBadge status={d.model_source} size="sm" /></td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => flagMutation.mutate(d.id)}
                      className={`mr-1 rounded p-1 ${d.is_flagged ? "text-[#DC2626]" : "text-[#78716C] hover:text-[#DC2626]"}`}>
                      <Flag size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
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

      {/* Detail Modal */}
      {selectedDetection && (
        <DetectionModal detection={selectedDetection} onClose={() => setSelectedDetection(null)}
          cameraName={cameraMap.get(selectedDetection.camera_id) ?? "Unknown"}
          storeName={storeMap.get(selectedDetection.store_id) ?? "Unknown"}
          onFlag={() => { flagMutation.mutate(selectedDetection.id); setSelectedDetection(null); }}
          onTraining={() => { trainingMutation.mutate(selectedDetection.id); setSelectedDetection(null); }}
        />
      )}
    </div>
  );
}

function DetectionModal({
  detection: d, onClose, cameraName, storeName, onFlag, onTraining,
}: {
  detection: Detection; onClose: () => void; cameraName: string; storeName: string;
  onFlag: () => void; onTraining: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
          <h2 className="text-lg font-semibold text-[#1C1917]">Detection Detail</h2>
          <button onClick={onClose} className="text-[#78716C] hover:text-[#1C1917]"><X size={18} /></button>
        </div>
        <div className="grid gap-6 p-6 lg:grid-cols-5">
          {/* Frame */}
          <div className="lg:col-span-3">
            {d.frame_base64 ? (
              <img src={`data:image/jpeg;base64,${d.frame_base64}`} alt="Detection frame" className="w-full rounded" />
            ) : (
              <div className="flex h-[300px] items-center justify-center rounded bg-gray-100 text-sm text-[#78716C]">No frame</div>
            )}
          </div>
          {/* Metadata */}
          <div className="lg:col-span-2">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-[#78716C]">Camera</dt><dd className="text-[#1C1917]">{cameraName}</dd></div>
              <div className="flex justify-between"><dt className="text-[#78716C]">Store</dt><dd className="text-[#1C1917]">{storeName}</dd></div>
              <div className="flex justify-between"><dt className="text-[#78716C]">Timestamp</dt><dd className="text-[#1C1917]">{new Date(d.timestamp).toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt className="text-[#78716C]">Inference Time</dt><dd className="text-[#1C1917]">{d.inference_time_ms.toFixed(0)}ms</dd></div>
              <div className="flex justify-between"><dt className="text-[#78716C]">Model</dt><dd><StatusBadge status={d.model_source} /></dd></div>
              <div className="flex justify-between"><dt className="text-[#78716C]">Confidence</dt><dd className="font-semibold text-[#1C1917]">{(d.confidence * 100).toFixed(1)}%</dd></div>
              <div className="flex justify-between"><dt className="text-[#78716C]">Wet Area</dt><dd className="text-[#1C1917]">{d.wet_area_percent.toFixed(1)}%</dd></div>
              <div className="flex justify-between"><dt className="text-[#78716C]">Result</dt><dd><StatusBadge status={d.is_wet ? "critical" : "online"} /></dd></div>
            </dl>

            {d.predictions.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold text-[#78716C]">Predictions</h4>
                {d.predictions.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded border border-[#E7E5E0] px-2 py-1 mb-1">
                    <span className="text-xs text-[#1C1917]">{p.class_name}</span>
                    <span className="text-xs font-medium text-[#1C1917]">{(p.confidence * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              <button onClick={onFlag}
                className="flex items-center justify-center gap-2 rounded-md border border-[#E7E5E0] px-4 py-2 text-sm hover:bg-[#F1F0ED]">
                <Flag size={14} /> {d.is_flagged ? "Unflag" : "Flag as Incorrect"}
              </button>
              {!d.in_training_set && (
                <button onClick={onTraining}
                  className="flex items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm text-white hover:bg-[#0F766E]">
                  <Star size={14} /> Add to Training Set
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
