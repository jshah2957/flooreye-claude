import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Camera as CameraIcon, Loader2, MoreVertical, Power } from "lucide-react";

import api from "@/lib/api";
import type { Camera, Store, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import SkeletonCard from "@/components/shared/SkeletonCard";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
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

  const activeCameras = cameras.filter((c) => c.status !== "inactive");
  const inactiveCameras = cameras.filter((c) => c.status === "inactive");

  const filtered = activeCameras.filter((c) => {
    if (search && !(c.name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (modeFilter && c.inference_mode !== modeFilter) return false;
    return true;
  });

  const storeMap = new Map((storesData ?? []).map((s) => [s.id, s.name]));

  const [deleteTarget, setDeleteTarget] = useState<Camera | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (camId: string) => api.delete(`/cameras/${camId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      setDeleteTarget(null);
      success("Camera deactivated");
    },
    onError: () => showError("Failed to deactivate camera"),
  });

  const reactivateMutation = useMutation({
    mutationFn: (camId: string) => api.post(`/cameras/${camId}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      success("Camera reactivated — needs config push");
    },
    onError: () => showError("Failed to reactivate camera"),
  });

  const toggleMutation = useMutation({
    mutationFn: (camId: string) => api.post(`/cameras/${camId}/toggle-detection`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      success("Detection toggled");
    },
    onError: () => showError("Failed to toggle detection"),
  });
  function toggleDetection(camId: string) { toggleMutation.mutate(camId); }

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
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpen(null);
                            setDeleteTarget(cam);
                          }}
                          className="block w-full px-4 py-2 text-left text-sm text-[#DC2626] hover:bg-[#FEE2E2]"
                        >
                          Deactivate
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
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleDetection(cam.id); }}
                    className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${
                      cam.detection_enabled
                        ? "bg-[#DCFCE7] text-[#16A34A]"
                        : "bg-[#F1F0ED] text-[#78716C]"
                    }`}
                  >
                    <Power size={10} />
                    {cam.detection_enabled ? "ON" : "OFF"}
                  </button>
                  {cam.config_status && cam.config_status !== "waiting" ? (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      cam.config_status === "received" ? "bg-[#DCFCE7] text-[#16A34A]" :
                      cam.config_status === "failed" ? "bg-[#FEE2E2] text-[#DC2626]" :
                      "bg-[#FEF9C3] text-[#CA8A04]"
                    }`}>
                      {cam.config_status}
                    </span>
                  ) : cam.edge_agent_id ? (
                    <span className="rounded bg-[#FEF9C3] px-1.5 py-0.5 text-[10px] font-medium text-[#CA8A04]">
                      Needs config
                    </span>
                  ) : null}
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

      {/* Inactive Cameras */}
      {inactiveCameras.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-semibold text-[#78716C]">
            Inactive Cameras ({inactiveCameras.length})
          </h3>
          <div className="space-y-2">
            {inactiveCameras.map((cam) => (
              <div key={cam.id} className="flex items-center justify-between rounded-lg border border-[#E7E5E0] bg-[#FAFAF9] p-3">
                <div>
                  <span className="text-sm text-[#78716C]">{cam.name}</span>
                  <span className="ml-2 rounded bg-[#F1F0ED] px-1.5 py-0.5 text-[10px] text-[#78716C]">inactive</span>
                </div>
                <button
                  onClick={() => reactivateMutation.mutate(cam.id)}
                  disabled={reactivateMutation.isPending}
                  className="rounded-md border border-[#0D9488] px-3 py-1 text-xs text-[#0D9488] hover:bg-[#F0FDFA]"
                >
                  Reactivate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deactivate Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Deactivate Camera"
        description={`Deactivate "${deleteTarget?.name}"? Detection will stop. History is preserved. You can reactivate later.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
