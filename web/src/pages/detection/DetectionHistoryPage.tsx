import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import HelpSection from "@/components/ui/HelpSection";
import { PAGE_HELP } from "@/constants/help";
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
  Star,
  History,
  ChevronLeft,
  ChevronRight,
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

  const { data, isLoading, isError } = useQuery({
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
    refetchInterval: 10000,
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
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Detection History</h1>
          <p className="mt-1 text-sm text-gray-500">{total.toLocaleString()} detections total · Auto-refreshes every 10s</p>
          <HelpSection title={PAGE_HELP.detectionHistory.title}>
            {PAGE_HELP.detectionHistory.content.map((line, i) => <p key={i}>{line}</p>)}
          </HelpSection>
        </div>
        <button
          onClick={() => downloadCSV(filtered, cameraMap, storeMap)}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Filter Bar */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <select value={storeFilter} onChange={(e) => { setStoreFilter(e.target.value); setPage(0); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]">
            <option value="">All Stores</option>
            {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <select value={cameraFilter} onChange={(e) => { setCameraFilter(e.target.value); setPage(0); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]">
            <option value="">All Cameras</option>
            {(cameras ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Result toggle pills */}
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {[
              { value: "", label: "All" },
              { value: "wet", label: "Wet" },
              { value: "dry", label: "Dry" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setWetFilter(opt.value); setPage(0); }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  wetFilter === opt.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Confidence slider */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="text-xs font-medium">Confidence:</span>
            <input
              type="range"
              min={0}
              max={100}
              value={minConfidence}
              onChange={(e) => { setMinConfidence(parseInt(e.target.value)); setPage(0); }}
              className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-gray-200 accent-[#0D9488]"
            />
            <span className="w-8 text-xs font-semibold text-[#0D9488]">{minConfidence}%</span>
          </div>

          {/* Flagged toggle */}
          <button
            onClick={() => setFlaggedOnly(!flaggedOnly)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              flaggedOnly
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Star size={12} className={flaggedOnly ? "fill-amber-400" : ""} />
            Flagged
          </button>

          {/* Date range */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488]"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488]"
            />
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="text-xs font-medium text-[#0D9488] hover:text-[#0F766E] hover:underline">
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* View Toggle */}
      <div className="mb-4 flex items-center justify-end">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          <button
            onClick={() => setView("gallery")}
            className={`rounded-md p-2 transition-colors ${view === "gallery" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            onClick={() => setView("table")}
            className={`rounded-md p-2 transition-colors ${view === "table" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {/* Error State */}
      {isError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load detections. Please try again.
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="aspect-video bg-gray-200" />
              <div className="p-3 space-y-2">
                <div className="flex justify-between">
                  <div className="h-5 w-14 rounded-full bg-gray-200" />
                  <div className="h-5 w-10 rounded bg-gray-200" />
                </div>
                <div className="h-3 w-3/4 rounded bg-gray-100" />
                <div className="h-3 w-1/2 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <History size={24} className="text-gray-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">No detections found</h3>
          <p className="mt-1 text-sm text-gray-500">Adjust filters or run a detection.</p>
        </div>
      ) : view === "gallery" ? (
        /* Gallery View */
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((d) => (
            <div
              key={d.id}
              className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm transition-all hover:ring-2 hover:ring-[#0D9488]/30 hover:shadow-md"
            >
              {/* Checkbox */}
              <div
                className="absolute left-2.5 top-2.5 z-10"
                onClick={(e) => { e.stopPropagation(); toggleSelected(d.id); }}
              >
                {selectedIds.has(d.id) ? (
                  <CheckSquare size={20} className="text-[#0D9488] drop-shadow" />
                ) : (
                  <Square size={20} className="text-white/80 drop-shadow-md opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </div>

              {/* Wet/Dry Badge */}
              <div className="absolute left-2.5 bottom-[calc(100%-theme(spacing.2)-theme(height.6))] top-auto z-10">
                {/* Positioned via overlay */}
              </div>

              <div onClick={() => setSelectedDetection(d)}>
                {/* Thumbnail */}
                <div className="relative aspect-video bg-gray-100">
                  {(d.annotated_frame_url || d.frame_url || d.frame_base64) ? (
                    <img
                      src={d.annotated_frame_url || d.frame_url || `data:image/jpeg;base64,${d.frame_base64}`}
                      alt="Detection"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400">No frame</div>
                  )}

                  {/* Overlay badges */}
                  <div className="absolute left-2 top-2">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                      d.is_wet
                        ? "bg-red-500/90 text-white"
                        : "bg-green-500/90 text-white"
                    }`}>
                      {d.is_wet ? "WET" : "DRY"}
                    </span>
                  </div>
                  {d.is_flagged && (
                    <div className="absolute right-2 top-2">
                      <Star size={16} className="fill-amber-400 text-amber-400 drop-shadow" />
                    </div>
                  )}
                </div>

                {/* Card content */}
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${confColor(d.confidence)}`}>
                      {(d.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="text-xs text-gray-500">
                      {d.wet_area_percent.toFixed(1)}% wet
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-xs text-gray-500">
                    {cameraMap.get(d.camera_id) ?? "Unknown"}
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <StatusBadge status={d.model_source} size="sm" />
                    <span className="text-[10px] text-gray-400">
                      {new Date(d.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); flagMutation.mutate(d.id); }}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                        d.is_flagged
                          ? "bg-red-50 text-red-600"
                          : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      <Flag size={10} /> {d.is_flagged ? "Flagged" : "Flag"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-3 py-3 text-left">
                  <button onClick={() => toggleSelectAll(filteredIds)}>
                    {filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id)) ? (
                      <CheckSquare size={16} className="text-[#0D9488]" />
                    ) : (
                      <Square size={16} className="text-gray-400" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Frame</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Result</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Confidence</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Wet Area</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Camera</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Store</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Time</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Model</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  className={`cursor-pointer transition-colors hover:bg-gray-50 ${selectedIds.has(d.id) ? "bg-teal-50/50" : ""}`}
                  onClick={() => setSelectedDetection(d)}
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleSelected(d.id)}>
                      {selectedIds.has(d.id) ? (
                        <CheckSquare size={16} className="text-[#0D9488]" />
                      ) : (
                        <Square size={16} className="text-gray-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    {(d.annotated_frame_url || d.frame_url || d.frame_base64) ? (
                      <img src={d.annotated_frame_url || d.frame_url || `data:image/jpeg;base64,${d.frame_base64}`} className="h-[50px] w-[80px] rounded-lg object-cover" alt="" />
                    ) : <div className="h-[50px] w-[80px] rounded-lg bg-gray-100" />}
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={d.is_wet ? "critical" : "online"} /></td>
                  <td className={`px-3 py-3 font-semibold ${confColor(d.confidence)}`}>{(d.confidence * 100).toFixed(1)}%</td>
                  <td className="px-3 py-3 text-gray-500">{d.wet_area_percent.toFixed(1)}%</td>
                  <td className="px-3 py-3 text-gray-700">{cameraMap.get(d.camera_id) ?? "---"}</td>
                  <td className="px-3 py-3 text-gray-500">{storeMap.get(d.store_id) ?? "---"}</td>
                  <td className="px-3 py-3 text-gray-500">{new Date(d.timestamp).toLocaleString()}</td>
                  <td className="px-3 py-3"><StatusBadge status={d.model_source} size="sm" /></td>
                  <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => flagMutation.mutate(d.id)}
                      className={`rounded-lg p-1.5 transition-colors ${d.is_flagged ? "text-red-500 hover:bg-red-50" : "text-gray-400 hover:bg-gray-100 hover:text-red-500"}`}
                    >
                      <Flag size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-lg">
            <span className="text-sm font-semibold text-gray-900">
              {selectedIds.size} selected
            </span>
            <div className="h-5 w-px bg-gray-200" />
            <button
              onClick={() => bulkFlagMutation.mutate(Array.from(selectedIds))}
              disabled={bulkFlagMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              <Flag size={12} /> Flag for Review
            </button>
            <button onClick={clearSelection} className="text-xs font-medium text-gray-500 hover:text-gray-700">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <span className="text-sm text-gray-500">
            Showing {page * limit + 1}&ndash;{Math.min((page + 1) * limit, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            {/* Page numbers */}
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 5 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`h-9 w-9 rounded-lg text-sm font-medium transition-colors ${
                    page === pageNum
                      ? "bg-[#0D9488] text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              disabled={(page + 1) * limit >= total}
              onClick={() => setPage(page + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedDetection && (
        <DetectionModal
          detection={selectedDetection}
          onClose={() => setSelectedDetection(null)}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Detection Detail</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="grid gap-6 p-6 lg:grid-cols-5">
          {/* Frame */}
          <div className="lg:col-span-3">
            {(d.annotated_frame_url || d.frame_url || d.frame_base64) ? (
              <img src={d.annotated_frame_url || d.frame_url || `data:image/jpeg;base64,${d.frame_base64}`} alt="Detection frame" className="w-full rounded-xl" />
            ) : (
              <div className="flex h-[300px] items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">No frame</div>
            )}
          </div>
          {/* Metadata */}
          <div className="lg:col-span-2">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-gray-500">Camera</dt>
                <dd className="font-medium text-gray-900">{cameraName}</dd>
              </div>
              <div className="flex justify-between rounded-lg px-3 py-2">
                <dt className="text-gray-500">Store</dt>
                <dd className="font-medium text-gray-900">{storeName}</dd>
              </div>
              <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-gray-500">Timestamp</dt>
                <dd className="font-medium text-gray-900">{new Date(d.timestamp).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between rounded-lg px-3 py-2">
                <dt className="text-gray-500">Inference Time</dt>
                <dd className="font-medium text-gray-900">{d.inference_time_ms.toFixed(0)}ms</dd>
              </div>
              <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-gray-500">Model</dt>
                <dd><StatusBadge status={d.model_source} /></dd>
              </div>
              <div className="flex justify-between rounded-lg px-3 py-2">
                <dt className="text-gray-500">Confidence</dt>
                <dd className="text-lg font-bold text-gray-900">{(d.confidence * 100).toFixed(1)}%</dd>
              </div>
              <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-gray-500">Wet Area</dt>
                <dd className="font-medium text-gray-900">{d.wet_area_percent.toFixed(1)}%</dd>
              </div>
              <div className="flex justify-between rounded-lg px-3 py-2">
                <dt className="text-gray-500">Result</dt>
                <dd><StatusBadge status={d.is_wet ? "critical" : "online"} /></dd>
              </div>
            </dl>

            {d.predictions.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Predictions</h4>
                <div className="space-y-1.5">
                  {d.predictions.map((p, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <span className="text-xs font-medium text-gray-700">{p.class_name}</span>
                      <span className="text-xs font-bold text-[#0D9488]">{(p.confidence * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              <button
                onClick={onFlag}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Flag size={14} /> {d.is_flagged ? "Unflag" : "Flag as Incorrect"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
