import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Camera as CameraIcon, Loader2, MoreVertical } from "lucide-react";

import api from "@/lib/api";
import type { Camera, Store, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import SkeletonCard from "@/components/shared/SkeletonCard";
import { useToast } from "@/components/ui/Toast";

export default function CamerasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [page, setPage] = useState(0);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const limit = 21; // 3-col grid friendly

  const { data: storesData } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", { params: { limit: 100 } });
      return res.data.data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["cameras", page, storeFilter, statusFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = { offset: page * limit, limit };
      if (storeFilter) params.store_id = storeFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PaginatedResponse<Camera>>("/cameras", { params });
      return res.data;
    },
  });

  const cameras = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const filtered = cameras.filter((c) => {
    if (search && !(c.name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (modeFilter && c.inference_mode !== modeFilter) return false;
    return true;
  });

  const storeMap = new Map((storesData ?? []).map((s) => [s.id, s.name]));

  function modeLabel(mode: string) {
    if (mode === "cloud") return "Cloud";
    if (mode === "edge") return "Edge";
    return "Hybrid";
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Cameras</h1>
          <p className="text-sm text-[#78716C]">{total} cameras total</p>
        </div>
        <button
          onClick={() => navigate("/cameras/wizard")}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]"
        >
          <Plus size={16} />
          New Camera
        </button>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cameras..."
            className="w-full rounded-md border border-[#E7E5E0] pl-9 pr-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
          />
        </div>
        <select
          value={storeFilter}
          onChange={(e) => { setStoreFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
        >
          <option value="">All Stores</option>
          {(storesData ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
        >
          <option value="">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="testing">Testing</option>
          <option value="active">Active</option>
        </select>
        <select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value)}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
        >
          <option value="">All Modes</option>
          <option value="cloud">Cloud</option>
          <option value="edge">Edge</option>
          <option value="hybrid">Hybrid</option>
        </select>
        {(search || storeFilter || statusFilter || modeFilter) && (
          <button
            onClick={() => { setSearch(""); setStoreFilter(""); setStatusFilter(""); setModeFilter(""); setPage(0); }}
            className="text-sm text-[#0D9488] hover:underline"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Camera Grid */}
      {isLoading ? (
        <SkeletonCard count={6} layout="card" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CameraIcon}
          title="No cameras found"
          description="Add your first camera to start monitoring."
          actionLabel="New Camera"
          onAction={() => navigate("/cameras/wizard")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cam) => (
            <div
              key={cam.id}
              className="relative rounded-lg border border-[#E7E5E0] bg-white overflow-hidden hover:border-[#0D9488] transition-colors cursor-pointer"
              onClick={() => navigate(`/cameras/${cam.id}`)}
            >
              {/* Snapshot */}
              <div className="relative">
                {cam.snapshot_base64 ? (
                  <img
                    src={`data:image/jpeg;base64,${cam.snapshot_base64}`}
                    alt={cam.name}
                    className="h-[180px] w-full object-cover bg-gray-100"
                  />
                ) : (
                  <div className="flex h-[180px] items-center justify-center bg-gray-100 text-xs text-[#78716C]">
                    No snapshot
                  </div>
                )}
                <div className="absolute top-2 right-2 flex items-center gap-2">
                  <StatusBadge status={cam.status} />
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setMenuOpen(menuOpen === cam.id ? null : cam.id)}
                      className="rounded bg-black/30 p-1 text-white hover:bg-black/50"
                    >
                      <MoreVertical size={14} />
                    </button>
                    {menuOpen === cam.id && (
                      <div className="absolute right-0 top-8 z-10 w-48 rounded-md border border-[#E7E5E0] bg-white py-1 shadow-lg">
                        <button
                          onClick={() => { navigate(`/cameras/${cam.id}`); setMenuOpen(null); }}
                          className="block w-full px-4 py-2 text-left text-sm hover:bg-[#F8F7F4]"
                        >
                          View Detail
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpen(null);
                            api.post(`/cameras/${cam.id}/test`)
                              .then(() => {
                                queryClient.invalidateQueries({ queryKey: ["cameras"] });
                                success("Connection test successful");
                              })
                              .catch((err: any) => {
                                showError(err?.response?.data?.detail || "Connection test failed");
                              });
                          }}
                          className="block w-full px-4 py-2 text-left text-sm hover:bg-[#F8F7F4]"
                        >
                          Test Connection
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#1C1917]">{cam.name}</span>
                  <StatusBadge status={cam.inference_mode} size="sm" />
                </div>
                <p className="mt-1 text-xs text-[#78716C]">
                  {storeMap.get(cam.store_id) ?? "Unknown Store"}
                </p>
                <p className="mt-1 text-xs text-[#78716C]">
                  {(cam.stream_type ?? 'rtsp').toUpperCase()} &middot; {cam.floor_type ?? 'tile'}
                  {cam.last_seen && ` · Last seen ${new Date(cam.last_seen).toLocaleTimeString()}`}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {cam.detection_enabled ? (
                    <span className="text-xs text-[#16A34A]">Detection ON</span>
                  ) : (
                    <span className="text-xs text-[#78716C]">Detection OFF</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-[#78716C]">
          <span>
            Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={(page + 1) * limit >= total}
              onClick={() => setPage(page + 1)}
              className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
