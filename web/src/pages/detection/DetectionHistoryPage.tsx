import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Grid3X3,
  List,
  Flag,
  X,
  Loader2,
  Eye as EyeIcon,
  Download,
  CheckSquare,
  Square,
  Calendar,
} from "lucide-react";

import api from "@/lib/api";
import { PAGE_SIZES, confidenceColorClass } from "@/constants";
import type { Detection, Store, Camera, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";

type ViewMode = "gallery" | "table";

function toISODate(dateStr: string): string {
  return dateStr ? new Date(dateStr + "T00:00:00").toISOString() : "";
}

function downloadCSV(detections: Detection[], cameraMap: Map<string, string>, storeMap: Map<string, string>) {
  const headers = [
    "ID", "Camera", "Store", "Timestamp", "Is Wet", "Confidence",
    "Wet Area %", "Inference Time (ms)", "Model Source", "Flagged",
  ];
  const rows = detections.map((d) => [
    d.id,
    cameraMap.get(d.camera_id) ?? d.camera_id,
    storeMap.get(d.store_id) ?? d.store_id,
    new Date(d.timestamp).toISOString(),
    d.is_wet ? "Yes" : "No",
    (d.confidence * 100).toFixed(1),
    d.wet_area_percent.toFixed(1),
    d.inference_time_ms.toFixed(0),
    d.model_source,
    d.is_flagged ? "Yes" : "No",
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `detections_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function DetectionHistoryPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [view, setView] = useState<ViewMode>("gallery");
  const [page, setPage] = useState(0);
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null);
  const limit = PAGE_SIZES.DETECTION_HISTORY;

  // Filters
  const [storeFilter, setStoreFilter] = useState("");
  const [cameraFilter, setCameraFilter] = useState("");
  const [wetFilter, setWetFilter] = useState<string>("");
  const [modelFilter, setModelFilter] = useState("");
  const [minConfidence, setMinConfidence] = useState(0);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

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
    queryKey: ["detections", page, storeFilter, cameraFilter, wetFilter, modelFilter, minConfidence, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, unknown> = { offset: page * limit, limit };
      if (storeFilter) params.store_id = storeFilter;
      if (cameraFilter) params.camera_id = cameraFilter;
      if (wetFilter === "wet") params.is_wet = true;
      if (wetFilter === "dry") params.is_wet = false;
      if (modelFilter) params.model_source = modelFilter;
      if (minConfidence > 0) params.min_confidence = minConfidence / 100;
      if (dateFrom) params.date_from = toISODate(dateFrom);
      if (dateTo) params.date_to = toISODate(dateTo);
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

  // Bulk mutations
  const bulkFlagMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.allSettled(ids.map((id) => api.post(`/detection/history/${id}/flag`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detections"] });
      success(`Flagged ${selectedIds.size} detection(s)`);
      clearSelection();
    },
    onError: () => {
      showError("Some detections failed to flag");
    },
  });

  const detections = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const filtered = flaggedOnly ? detections.filter((d) => d.is_flagged) : detections;

  const cameraMap = new Map((cameras ?? []).map((c) => [c.id, c.name]));
  const storeMap = new Map((stores ?? []).map((s) => [s.id, s.name]));

  function confColor(conf: number) {
    return confidenceColorClass(conf);
  }

  function clearFilters() {
    setStoreFilter(""); setCameraFilter(""); setWetFilter(""); setModelFilter("");
    setMinConfidence(0); setFlaggedOnly(false); setDateFrom(""); setDateTo(""); setPage(0);
  }

  const hasFilters = storeFilter || cameraFilter || wetFilter || modelFilter || minConfidence > 0 || flaggedOnly || dateFrom || dateTo;
  const filteredIds = filtered.map((d) => d.id);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Detection History</h1>
          <p className="text-sm text-[#78716C]">{total} detections total</p>
        </div>
        <button
          onClick={() => downloadCSV(filtered, cameraMap, storeMap)}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 rounded-md border border-[#E7E5E0] px-3 py-2 text-sm text-[#1C1917] hover:bg-[#F1F0ED] disabled:opacity-50"
        >
          <Download size={14} /> Export CSV
        </button>
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
      </div>

      {/* Date Range Row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={14} className="text-[#78716C]" />
          <span className="text-[#78716C]">From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="rounded-md border border-[#E7E5E0] px-2 py-1.5 text-sm outline-none focus:border-[#0D9488]"
          />
          <span className="text-[#78716C]">To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="rounded-md border border-[#E7E5E0] px-2 py-1.5 text-sm outline-none focus:border-[#0D9488]"
          />
        </div>
        {hasFilters && (
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

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-[#0D9488] bg-[#F0FDFA] px-4 py-2.5">
          <span className="text-sm font-medium text-[#0D9488]">
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => bulkFlagMutation.mutate(Array.from(selectedIds))}
            disabled={bulkFlagMutation.isPending}
            className="flex items-center gap-1.5 rounded-md bg-[#DC2626] px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Flag size={12} /> Flag Selected ({selectedIds.size})
          </button>
          <button onClick={clearSelection} className="ml-auto text-xs text-[#78716C] hover:text-[#1C1917]">
            Clear selection
          </button>
        </div>
      )}

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
            <div key={d.id}
              className="relative cursor-pointer rounded-lg border border-[#E7E5E0] bg-white overflow-hidden hover:border-[#0D9488] transition-colors">
              {/* Checkbox overlay */}
              <div
                className="absolute left-2 top-2 z-10"
                onClick={(e) => { e.stopPropagation(); toggleSelected(d.id); }}
              >
                {selectedIds.has(d.id) ? (
                  <CheckSquare size={18} className="text-[#0D9488]" />
                ) : (
                  <Square size={18} className="text-white drop-shadow-md hover:text-[#0D9488]" />
                )}
              </div>
              <div onClick={() => setSelectedDetection(d)}>
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
                  </div>
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
                <th className="px-3 py-2 text-left">
                  <button onClick={() => toggleSelectAll(filteredIds)}>
                    {filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id)) ? (
                      <CheckSquare size={16} className="text-[#0D9488]" />
                    ) : (
                      <Square size={16} className="text-[#78716C]" />
                    )}
                  </button>
                </th>
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
                <tr key={d.id}
                  className={`border-b border-[#E7E5E0] hover:bg-[#F8F7F4] cursor-pointer ${selectedIds.has(d.id) ? "bg-[#F0FDFA]" : ""}`}
                  onClick={() => setSelectedDetection(d)}>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleSelected(d.id)}>
                      {selectedIds.has(d.id) ? (
                        <CheckSquare size={16} className="text-[#0D9488]" />
                      ) : (
                        <Square size={16} className="text-[#78716C]" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {d.frame_base64 ? (
                      <img src={`data:image/jpeg;base64,${d.frame_base64}`} className="h-[50px] w-[80px] rounded object-cover" alt="" />
                    ) : <div className="h-[50px] w-[80px] rounded bg-gray-100" />}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={d.is_wet ? "critical" : "online"} /></td>
                  <td className={`px-3 py-2 font-medium ${confColor(d.confidence)}`}>{(d.confidence * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2 text-[#78716C]">{d.wet_area_percent.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-[#78716C]">{cameraMap.get(d.camera_id) ?? "---"}</td>
                  <td className="px-3 py-2 text-[#78716C]">{storeMap.get(d.store_id) ?? "---"}</td>
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
          <span>Showing {page * limit + 1}--{Math.min((page + 1) * limit, total)} of {total}</span>
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
        />
      )}
    </div>
  );
}

function DetectionModal({
  detection: d, onClose, cameraName, storeName, onFlag,
}: {
  detection: Detection; onClose: () => void; cameraName: string; storeName: string;
  onFlag: () => void;
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
