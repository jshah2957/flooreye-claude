import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Camera as CameraIcon, Loader2, MoreVertical, Power, Pencil, Eye, EyeOff, X, Server } from "lucide-react";

import api from "@/lib/api";
import type { Camera, Store, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import SkeletonCard from "@/components/shared/SkeletonCard";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

interface EdgeAgentBasic {
  id: string;
  name: string;
  store_id: string;
  status: string;
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
        <div className="space-y-6">
          {groupedCameras.map((group) => {
            const summary = configSummary(group.cameras);
            return (
              <div key={group.agentId ?? "__unlinked"}>
                {/* Group header — only show when there are multiple groups */}
                {hasMultipleGroups && (
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server size={14} className="text-[#78716C]" />
                      <span className="text-sm font-semibold text-[#1C1917]">{group.agentName}</span>
                      <span className="rounded-full bg-[#F1F0ED] px-2 py-0.5 text-[10px] text-[#78716C]">
                        {group.cameras.length} camera{group.cameras.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {group.agentId && (
                      <div className="flex items-center gap-3 text-[10px]">
                        {summary.configured > 0 && (
                          <span className="flex items-center gap-1 text-[#16A34A]">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                            {summary.configured} configured
                          </span>
                        )}
                        {summary.waiting > 0 && (
                          <span className="flex items-center gap-1 text-[#CA8A04]">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#CA8A04]" />
                            {summary.waiting} waiting
                          </span>
                        )}
                        {summary.paused > 0 && (
                          <span className="flex items-center gap-1 text-[#78716C]">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#78716C]" />
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
                                  onClick={() => { setMenuOpen(null); openEditModal(cam); }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-[#F8F7F4]"
                                >
                                  <Pencil size={12} /> Edit Camera
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
                        {/* Config status badge overlay */}
                        <div className="absolute top-2 left-2">
                          {cam.config_status === "received" ? (
                            <span className="rounded bg-[#DCFCE7]/90 px-1.5 py-0.5 text-[10px] font-medium text-[#16A34A]">
                              configured
                            </span>
                          ) : cam.config_status === "failed" ? (
                            <span className="rounded bg-[#FEE2E2]/90 px-1.5 py-0.5 text-[10px] font-medium text-[#DC2626]">
                              config failed
                            </span>
                          ) : !cam.edge_agent_id ? (
                            <span className="rounded bg-[#F1F0ED]/90 px-1.5 py-0.5 text-[10px] font-medium text-[#78716C]">
                              unlinked
                            </span>
                          ) : (
                            <span className="rounded bg-[#FEF9C3]/90 px-1.5 py-0.5 text-[10px] font-medium text-[#CA8A04]">
                              waiting
                            </span>
                          )}
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
                          {/* Detection toggle switch */}
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleDetection(cam.id); }}
                            className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none"
                            style={{ backgroundColor: cam.detection_enabled ? "#0D9488" : "#D6D3D1" }}
                            title={cam.detection_enabled ? "Detection ON — click to disable" : "Detection OFF — click to enable"}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                                cam.detection_enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                              }`}
                            />
                          </button>
                          <span className={`text-[10px] font-medium ${cam.detection_enabled ? "text-[#0D9488]" : "text-[#78716C]"}`}>
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

      {/* Edit Camera Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[440px] rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1C1917]">Edit Camera</h3>
              <button onClick={() => setEditTarget(null)} className="text-[#78716C] hover:text-[#1C1917]">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#78716C]">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#78716C]">RTSP / Stream URL</label>
                <div className="relative">
                  <input
                    type={editShowUrl ? "text" : "password"}
                    value={editStreamUrl}
                    onChange={(e) => setEditStreamUrl(e.target.value)}
                    placeholder="rtsp://..."
                    className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 pr-9 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                  />
                  <button
                    type="button"
                    onClick={() => setEditShowUrl(!editShowUrl)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917]"
                  >
                    {editShowUrl ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-[#A8A29E]">Leave empty to keep current URL</p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#78716C]">Floor Type</label>
                <select
                  value={editFloorType}
                  onChange={(e) => setEditFloorType(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                >
                  {["tile", "wood", "concrete", "carpet", "vinyl", "linoleum"].map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#78716C]">FPS ({editFps})</label>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={editFps}
                  onChange={(e) => setEditFps(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
                <div className="flex justify-between text-[10px] text-[#A8A29E]">
                  <span>1</span>
                  <span>15</span>
                  <span>30</span>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditTarget(null)}
                className="rounded-md border border-[#E7E5E0] px-3 py-1.5 text-xs text-[#78716C] hover:bg-[#F1F0ED]"
              >
                Cancel
              </button>
              <button
                onClick={() => editMutation.mutate(editTarget.id)}
                disabled={editMutation.isPending || !editName.trim()}
                className="rounded-md bg-[#0D9488] px-4 py-1.5 text-xs text-white hover:bg-[#0F766E] disabled:opacity-50"
              >
                {editMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
