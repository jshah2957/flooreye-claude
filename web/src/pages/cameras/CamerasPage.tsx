import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Camera as CameraIcon, Loader2, MoreVertical, Power, Pencil, Eye, EyeOff, X, Server, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import api from "@/lib/api";
import type { Camera, Store, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

interface EdgeAgentBasic {
  id: string;
  name: string;
  store_id: string;
  status: string;
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="aspect-video w-full animate-pulse bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-14 animate-pulse rounded-full bg-gray-200" />
        </div>
        <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
        <div className="flex items-center gap-2">
          <div className="h-5 w-9 animate-pulse rounded-full bg-gray-200" />
          <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

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

  const { data: edgeAgentsData } = useQuery({
    queryKey: ["edge-agents-basic"],
    queryFn: async () => {
      const res = await api.get("/edge/agents", { params: { limit: 100 } });
      return res.data.data as EdgeAgentBasic[];
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
  const agentMap = new Map((edgeAgentsData ?? []).map((a) => [a.id, a]));

  // Group cameras by edge_agent_id
  const groupedCameras = useMemo(() => {
    const groups: { agentId: string | null; agentName: string; cameras: Camera[] }[] = [];
    const agentGroups = new Map<string | null, Camera[]>();
    for (const cam of filtered) {
      const key = cam.edge_agent_id;
      if (!agentGroups.has(key)) agentGroups.set(key, []);
      agentGroups.get(key)!.push(cam);
    }
    // Edge-linked groups first, then unlinked
    for (const [agentId, cams] of agentGroups) {
      if (agentId) {
        const agent = agentMap.get(agentId);
        groups.push({ agentId, agentName: agent?.name ?? `Agent ${agentId.slice(0, 8)}`, cameras: cams });
      }
    }
    const unlinked = agentGroups.get(null);
    if (unlinked && unlinked.length > 0) {
      groups.push({ agentId: null, agentName: "Cloud / Unlinked", cameras: unlinked });
    }
    return groups;
  }, [filtered, agentMap]);

  const hasMultipleGroups = groupedCameras.length > 1 || (groupedCameras.length === 1 && groupedCameras[0]?.agentId !== null);

  function configSummary(cams: Camera[]) {
    let configured = 0, waiting = 0, paused = 0;
    for (const c of cams) {
      if (!c.detection_enabled) { paused++; continue; }
      if (c.config_status === "received") { configured++; }
      else { waiting++; }
    }
    return { configured, waiting, paused };
  }

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

  // Edit modal state
  const [editTarget, setEditTarget] = useState<Camera | null>(null);
  const [editName, setEditName] = useState("");
  const [editStreamUrl, setEditStreamUrl] = useState("");
  const [editFloorType, setEditFloorType] = useState("tile");
  const [editFps, setEditFps] = useState(2);
  const [editShowUrl, setEditShowUrl] = useState(false);

  function openEditModal(cam: Camera) {
    setEditName(cam.name);
    setEditStreamUrl("");
    setEditFloorType(cam.floor_type ?? "tile");
    setEditFps(cam.fps_config ?? 2);
    setEditShowUrl(false);
    setEditTarget(cam);
  }

  const editMutation = useMutation({
    mutationFn: (camId: string) => {
      const payload: Record<string, unknown> = {
        name: editName,
        floor_type: editFloorType,
        fps_config: editFps,
      };
      if (editStreamUrl) payload.stream_url = editStreamUrl;
      return api.put(`/cameras/${camId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      setEditTarget(null);
      success("Camera updated");
    },
    onError: (err: any) => showError(err?.response?.data?.detail || "Update failed"),
  });

  function modeLabel(mode: string) {
    if (mode === "cloud") return "Cloud";
    if (mode === "edge") return "Edge";
    return "Hybrid";
  }

  const hasFilters = search || storeFilter || statusFilter || modeFilter;

  return (
    <div className="min-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Cameras</h1>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {total}
          </span>
        </div>
        <button
          onClick={() => navigate("/cameras/wizard")}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0F766E] hover:shadow-md active:scale-[0.98]"
        >
          <Plus size={16} strokeWidth={2.5} />
          New Camera
        </button>
      </div>

      {/* Filter bar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cameras..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
          />
        </div>
        <select
          value={storeFilter}
          onChange={(e) => { setStoreFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
        >
          <option value="">All Stores</option>
          {(storesData ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
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
          className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
        >
          <option value="">All Modes</option>
          <option value="cloud">Cloud</option>
          <option value="edge">Edge</option>
          <option value="hybrid">Hybrid</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(""); setStoreFilter(""); setStatusFilter(""); setModeFilter(""); setPage(0); }}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-[#0D9488] transition-colors hover:bg-[#0D9488]/5"
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Camera Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CameraIcon}
          title="No cameras found"
          description={hasFilters ? "No cameras match your filters. Try adjusting your search." : "Add your first camera to start monitoring."}
          actionLabel="New Camera"
          onAction={() => navigate("/cameras/wizard")}
        />
      ) : (
        <div className="space-y-8">
          {groupedCameras.map((group) => {
            const summary = configSummary(group.cameras);
            return (
              <div key={group.agentId ?? "__unlinked"}>
                {/* Group header */}
                {hasMultipleGroups && (
                  <div className="mb-4 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-sm">
                        <Server size={14} className="text-gray-500" />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{group.agentName}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 shadow-sm">
                        {group.cameras.length} camera{group.cameras.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {group.agentId && (
                      <div className="flex items-center gap-3 text-[10px]">
                        {summary.configured > 0 && (
                          <span className="flex items-center gap-1.5 text-green-600">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                            {summary.configured} configured
                          </span>
                        )}
                        {summary.waiting > 0 && (
                          <span className="flex items-center gap-1.5 text-amber-600">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {summary.waiting} waiting
                          </span>
                        )}
                        {summary.paused > 0 && (
                          <span className="flex items-center gap-1.5 text-gray-500">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
                            {summary.paused} paused
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.cameras.map((cam) => (
                    <div
                      key={cam.id}
                      className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md cursor-pointer"
                      onClick={() => navigate(`/cameras/${cam.id}`)}
                    >
                      {/* Snapshot */}
                      <div className="relative aspect-video">
                        {cam.snapshot_base64 ? (
                          <img
                            src={`data:image/jpeg;base64,${cam.snapshot_base64}`}
                            alt={cam.name}
                            className="h-full w-full object-cover bg-gray-100"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gray-100">
                            <CameraIcon size={24} className="text-gray-300" />
                          </div>
                        )}
                        {/* Status badge overlay */}
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                          <StatusBadge status={cam.status} />
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setMenuOpen(menuOpen === cam.id ? null : cam.id)}
                              className="rounded-lg bg-black/30 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
                            >
                              <MoreVertical size={14} />
                            </button>
                            {menuOpen === cam.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                                <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                                  <button
                                    onClick={() => { navigate(`/cameras/${cam.id}`); setMenuOpen(null); }}
                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <Eye size={14} /> View Detail
                                  </button>
                                  <button
                                    onClick={() => { setMenuOpen(null); openEditModal(cam); }}
                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <Pencil size={14} /> Edit Camera
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
                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <RotateCcw size={14} /> Test Connection
                                  </button>
                                  <div className="my-1 border-t border-gray-100" />
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setMenuOpen(null);
                                      setDeleteTarget(cam);
                                    }}
                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                                  >
                                    <Power size={14} /> Deactivate
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Config status badge overlay */}
                        <div className="absolute top-2.5 left-2.5">
                          {cam.config_status === "received" ? (
                            <span className="rounded-md bg-green-100/90 px-2 py-0.5 text-[10px] font-semibold text-green-700 backdrop-blur-sm">
                              configured
                            </span>
                          ) : cam.config_status === "failed" ? (
                            <span className="rounded-md bg-red-100/90 px-2 py-0.5 text-[10px] font-semibold text-red-700 backdrop-blur-sm">
                              config failed
                            </span>
                          ) : !cam.edge_agent_id ? (
                            <span className="rounded-md bg-gray-100/90 px-2 py-0.5 text-[10px] font-semibold text-gray-600 backdrop-blur-sm">
                              unlinked
                            </span>
                          ) : (
                            <span className="rounded-md bg-amber-100/90 px-2 py-0.5 text-[10px] font-semibold text-amber-700 backdrop-blur-sm">
                              waiting
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Body */}
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-900 group-hover:text-[#0D9488]">{cam.name}</span>
                          <StatusBadge status={cam.inference_mode} size="sm" />
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                          {storeMap.get(cam.store_id) ?? "Unknown Store"}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {(cam.stream_type ?? 'rtsp').toUpperCase()} &middot; {cam.floor_type ?? 'tile'}
                          {cam.last_seen && ` · Last ${new Date(cam.last_seen).toLocaleTimeString()}`}
                        </p>
                        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                          {/* Detection toggle switch */}
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleDetection(cam.id); }}
                            className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20 focus:ring-offset-1"
                            style={{ backgroundColor: cam.detection_enabled ? "#0D9488" : "#D6D3D1" }}
                            title={cam.detection_enabled ? "Detection ON — click to disable" : "Detection OFF — click to enable"}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                                cam.detection_enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                              }`}
                            />
                          </button>
                          <span className={`text-[10px] font-semibold ${cam.detection_enabled ? "text-[#0D9488]" : "text-gray-400"}`}>
                            {cam.detection_enabled ? "Detection ON" : "Detection OFF"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-3 shadow-sm">
          <p className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-700">{page * limit + 1}</span> to{" "}
            <span className="font-medium text-gray-700">{Math.min((page + 1) * limit, total)}</span> of{" "}
            <span className="font-medium text-gray-700">{total}</span>
          </p>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              disabled={(page + 1) * limit >= total}
              onClick={() => setPage(page + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Inactive Cameras */}
      {inactiveCameras.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-400">
            <Power size={14} />
            Inactive Cameras ({inactiveCameras.length})
          </h3>
          <div className="space-y-2">
            {inactiveCameras.map((cam) => (
              <div key={cam.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                    <CameraIcon size={14} className="text-gray-400" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">{cam.name}</span>
                    <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500">inactive</span>
                  </div>
                </div>
                <button
                  onClick={() => reactivateMutation.mutate(cam.id)}
                  disabled={reactivateMutation.isPending}
                  className="rounded-lg border border-[#0D9488] px-4 py-1.5 text-xs font-semibold text-[#0D9488] transition-colors hover:bg-[#F0FDFA] disabled:opacity-50"
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

      {/* Edit Camera Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Edit Camera</h3>
              <button onClick={() => setEditTarget(null)} className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">RTSP / Stream URL</label>
                <div className="relative">
                  <input
                    type={editShowUrl ? "text" : "password"}
                    value={editStreamUrl}
                    onChange={(e) => setEditStreamUrl(e.target.value)}
                    placeholder="rtsp://..."
                    className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setEditShowUrl(!editShowUrl)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {editShowUrl ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">Leave empty to keep current URL</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Floor Type</label>
                <select
                  value={editFloorType}
                  onChange={(e) => setEditFloorType(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                >
                  {["tile", "wood", "concrete", "carpet", "vinyl", "linoleum"].map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">FPS ({editFps})</label>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={editFps}
                  onChange={(e) => setEditFps(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>1</span>
                  <span>15</span>
                  <span>30</span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditTarget(null)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => editMutation.mutate(editTarget.id)}
                disabled={editMutation.isPending || !editName.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0F766E] disabled:opacity-50"
              >
                {editMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {editMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
