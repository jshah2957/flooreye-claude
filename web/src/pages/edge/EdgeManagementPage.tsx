import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Server,
  Loader2,
  Cpu,
  HardDrive,
  Activity,
  Wifi,
  Trash2,
  Send,
  X,
  Download,
  Pencil,
  Check,
  XCircle,
} from "lucide-react";

import api from "@/lib/api";
import type { Store, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { INTERVALS } from "@/constants";

interface EdgeAgent {
  id: string;
  org_id: string;
  store_id: string;
  name: string;
  agent_version: string | null;
  current_model_version: string | null;
  status: string;
  last_heartbeat: string | null;
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_percent: number | null;
  gpu_percent: number | null;
  inference_fps: number | null;
  buffer_frames: number;
  buffer_size_mb: number;
  tunnel_status: string | null;
  camera_count: number;
  created_at: string;
}

/* -- Skeleton -- */

function SkeletonAgentCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gray-200" />
          <div className="h-4 w-32 rounded bg-gray-200" />
        </div>
        <div className="h-5 w-16 rounded-full bg-gray-200" />
      </div>
      <div className="mb-3 h-3 w-40 rounded bg-gray-100" />
      <div className="space-y-2">
        <div className="h-2 w-full rounded-full bg-gray-100" />
        <div className="h-2 w-full rounded-full bg-gray-100" />
        <div className="h-2 w-3/4 rounded-full bg-gray-100" />
      </div>
    </div>
  );
}

export default function EdgeManagementPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<EdgeAgent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EdgeAgent | null>(null);
  const [cmdType, setCmdType] = useState("ping");
  const [modelUpdateTarget, setModelUpdateTarget] = useState<EdgeAgent | null>(null);
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
  const [rolloutOpen, setRolloutOpen] = useState(false);
  const [rolloutVersion, setRolloutVersion] = useState("");
  const [devName, setDevName] = useState("");
  const [devIp, setDevIp] = useState("");
  const [devType, setDevType] = useState("tplink");
  const [devProtocol, setDevProtocol] = useState("tcp");
  const [devTestResult, setDevTestResult] = useState<boolean | null>(null);
  const [devTestLatency, setDevTestLatency] = useState<number | null>(null);
  const [devTestError, setDevTestError] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [deploymentStatus, setDeploymentStatus] = useState<Record<string, string>>({});

  // Provision form
  const [provStoreId, setProvStoreId] = useState("");
  const [provName, setProvName] = useState("");
  const [provResult, setProvResult] = useState<{ token: string; docker_compose: string } | null>(null);

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", { params: { limit: 100 } });
      return res.data.data;
    },
  });

  const { data: agentsData, isLoading } = useQuery({
    queryKey: ["edge-agents"],
    queryFn: async () => {
      const res = await api.get("/edge/agents", { params: { limit: 100 } });
      return res.data as { data: EdgeAgent[]; meta: { total: number } };
    },
  });

  const provisionMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/edge/provision", { store_id: provStoreId, name: provName });
      return res.data.data;
    },
    onSuccess: (data) => {
      setProvResult(data);
      queryClient.invalidateQueries({ queryKey: ["edge-agents"] });
      success("Agent provisioned");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to provision agent");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/edge/agents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["edge-agents"] });
      setDeleteTarget(null);
      if (selectedAgent?.id === deleteTarget?.id) setSelectedAgent(null);
      success("Agent removed");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to remove agent");
    },
  });

  const commandMutation = useMutation({
    mutationFn: ({ agentId, type }: { agentId: string; type: string }) =>
      api.post(`/edge/agents/${agentId}/command`, { command_type: type, payload: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["edge-agents"] });
      success("Command sent");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to send command");
    },
  });

  const { data: modelsData } = useQuery({
    queryKey: ["deployable-models"],
    queryFn: async () => {
      const res = await api.get("/models", { params: { status: "production,staging", limit: 20 } });
      return res.data.data as { id: string; version_str: string; model_size_mb: number; status: string; architecture: string | null; map_50: number | null; created_at: string | null }[];
    },
  });

  const pushModelMutation = useMutation({
    mutationFn: async ({ agentId, modelVersionId }: { agentId: string; modelVersionId: string }) => {
      const res = await api.post(`/edge/agents/${agentId}/push-model`, { model_version_id: modelVersionId });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["edge-agents"] });
      setDeploymentStatus((prev) => ({ ...prev, [variables.agentId]: "pending" }));
      setModelUpdateTarget(null);
      setSelectedModelId("");
      success("Model deployment initiated -- tracking status");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to push model");
    },
  });

  const rolloutMutation = useMutation({
    mutationFn: async () => {
      if (!rolloutVersion.trim()) throw new Error("Version required");
      const res = await api.post("/edge/rollout", { target_version: rolloutVersion.trim() });
      return res.data.data;
    },
    onSuccess: (data: { task_id: string; agent_count: number }) => {
      success(`Rollout started: ${data.agent_count} agent(s) → v${rolloutVersion}`);
      setRolloutOpen(false);
      setRolloutVersion("");
    },
    onError: (err: any) => showError(err?.response?.data?.detail || "Rollout failed"),
  });

  const testDeviceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent) throw new Error("No agent");
      const storeId = selectedAgent.store_id;
      const res = await api.post("/edge/proxy/test-device", { store_id: storeId, ip: devIp, type: devType });
      return res.data as { reachable: boolean; latency_ms: number | null; error: string | null };
    },
    onSuccess: (data) => {
      setDevTestResult(data.reachable);
      setDevTestLatency(data.latency_ms ?? null);
      if (!data.reachable) setDevTestError(data.error || "Device unreachable on edge network");
    },
    onError: (err: any) => { setDevTestError(err?.response?.data?.detail || "Test failed"); setDevTestResult(null); setDevTestLatency(null); },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ agentId, name }: { agentId: string; name: string }) => {
      const res = await api.put(`/edge/agents/${agentId}`, { name });
      return res.data.data as EdgeAgent;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["edge-agents"] });
      setSelectedAgent(updated);
      setEditingName(false);
      success("Agent renamed");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to rename agent");
    },
  });

  const addDeviceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent) throw new Error("No agent");
      return api.post("/edge/proxy/add-device", {
        store_id: selectedAgent.store_id, name: devName, ip: devIp, type: devType, protocol: devProtocol,
      });
    },
    onSuccess: () => {
      setAddDeviceOpen(false);
      setDevName(""); setDevIp(""); setDevType("tplink"); setDevProtocol("tcp"); setDevTestResult(null); setDevTestLatency(null); setDevTestError("");
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      success("Device added to edge");
    },
    onError: (err: any) => showError(err?.response?.data?.detail || "Failed to add device"),
  });

  const deployableModels = modelsData ?? [];
  const productionModels = deployableModels.filter((m) => m.status === "production");
  const stagingModels = deployableModels.filter((m) => m.status === "staging");

  // Poll agent status when deployments are pending
  const hasActiveDeployments = Object.values(deploymentStatus).some(
    (s) => s === "pending" || s === "downloading"
  );

  useQuery({
    queryKey: ["edge-agents-poll"],
    queryFn: async () => {
      const res = await api.get("/edge/agents", { params: { limit: 100 } });
      const freshAgents = res.data.data as EdgeAgent[];
      setDeploymentStatus((prev) => {
        const updated = { ...prev };
        for (const agentId of Object.keys(updated)) {
          const agent = freshAgents.find((a) => a.id === agentId);
          if (!agent) continue;
          if (agent.current_model_version && (updated[agentId] === "pending" || updated[agentId] === "downloading")) {
            updated[agentId] = "complete";
          }
        }
        return updated;
      });
      queryClient.setQueryData(["edge-agents"], { data: freshAgents, meta: { total: freshAgents.length } });
      return freshAgents;
    },
    enabled: hasActiveDeployments,
    refetchInterval: hasActiveDeployments ? INTERVALS.EDGE_DEPLOYMENT_POLL_MS : false,
  });

  // Clear completed deployment statuses after 8 seconds
  useEffect(() => {
    const completed = Object.entries(deploymentStatus).filter(([, s]) => s === "complete");
    if (completed.length === 0) return;
    const timer = setTimeout(() => {
      setDeploymentStatus((prev) => {
        const updated = { ...prev };
        for (const [id, s] of Object.entries(updated)) {
          if (s === "complete") delete updated[id];
        }
        return updated;
      });
    }, 8000);
    return () => clearTimeout(timer);
  }, [deploymentStatus]);

  // Fetch all cameras for per-agent camera lists
  const { data: allCamerasData } = useQuery({
    queryKey: ["all-cameras-for-agents"],
    queryFn: async () => {
      const res = await api.get("/cameras", { params: { limit: 200 } });
      return res.data.data as { id: string; name: string; edge_agent_id: string | null; config_status: string | null; detection_enabled: boolean; status: string }[];
    },
  });
  const allCameras = allCamerasData ?? [];

  const agentCamerasMap = useMemo(() => {
    const map = new Map<string, typeof allCameras>();
    for (const cam of allCameras) {
      if (!cam.edge_agent_id) continue;
      if (!map.has(cam.edge_agent_id)) map.set(cam.edge_agent_id, []);
      map.get(cam.edge_agent_id)!.push(cam);
    }
    return map;
  }, [allCameras]);

  function cameraBreakdown(agentId: string) {
    const cams = agentCamerasMap.get(agentId) ?? [];
    let configured = 0, waiting = 0, paused = 0;
    for (const c of cams) {
      if (!c.detection_enabled) { paused++; continue; }
      if (c.config_status === "received") { configured++; }
      else { waiting++; }
    }
    return { configured, waiting, paused, total: cams.length };
  }

  const agentCameras = selectedAgent ? (agentCamerasMap.get(selectedAgent.id) ?? []) : [];

  const agents = agentsData?.data ?? [];
  const storeMap = new Map((stores ?? []).map((s) => [s.id, s.name]));

  function metricBar(value: number | null, label: string) {
    const pct = value ?? 0;
    const color = pct > 80 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-teal-500";
    return (
      <div className="flex items-center gap-2.5">
        <span className="w-10 text-xs text-gray-500">{label}</span>
        <div className="h-2 flex-1 rounded-full bg-gray-200">
          <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-10 text-right text-xs font-medium text-gray-700">{pct.toFixed(0)}%</span>
      </div>
    );
  }

  function relativeTime(dateStr: string | null) {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Edge Agents</h1>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{agents.length}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{agents.length} agent{agents.length !== 1 ? "s" : ""} · On-premise devices for local camera detection + IoT control</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setRolloutOpen(true)}
            disabled={agents.length === 0}
            className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-medium text-teal-700 shadow-sm transition hover:bg-teal-100 disabled:opacity-40"
          >
            Update All Agents
          </button>
          <button
            onClick={() => { setProvisionOpen(true); setProvResult(null); setProvName(""); setProvStoreId(""); }}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
          >
            <Plus size={16} /> Provision Agent
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Agent List */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonAgentCard key={i} />)}
            </div>
          ) : agents.length === 0 ? (
            <EmptyState icon={Server} title="No edge agents" description="Provision your first edge agent to start monitoring." actionLabel="Provision" onAction={() => setProvisionOpen(true)} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {agents.map((agent) => {
                const isOnline = agent.status === "online";
                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className={`cursor-pointer rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${
                      selectedAgent?.id === agent.id ? "border-teal-500 ring-2 ring-teal-500/20" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {/* Header */}
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isOnline ? "bg-teal-50" : "bg-gray-100"}`}>
                          <Server size={16} className={isOnline ? "text-teal-600" : "text-gray-400"} />
                        </div>
                        <div>
                          <span className="block text-sm font-semibold text-gray-900">{agent.name}</span>
                          <span className="block text-[10px] text-gray-400">{storeMap.get(agent.store_id) ?? "Unknown Store"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          {isOnline && (
                            <span className="absolute -left-1 -top-1 flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                            </span>
                          )}
                          <StatusBadge status={agent.status} />
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(agent); }}
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Model + Cameras */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {agent.current_model_version ? (
                        <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-medium text-teal-700">
                          {agent.current_model_version}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-medium text-amber-700">
                          No model
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">{agent.camera_count} cameras</span>
                      {agent.agent_version && <span className="text-[10px] text-gray-400">v{agent.agent_version}</span>}
                    </div>

                    {/* Camera breakdown */}
                    {(() => {
                      const bd = cameraBreakdown(agent.id);
                      if (bd.total === 0) return null;
                      return (
                        <div className="mb-3 flex items-center gap-3 text-[10px]">
                          {bd.configured > 0 && (
                            <span className="flex items-center gap-1 text-green-600">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                              {bd.configured} configured
                            </span>
                          )}
                          {bd.waiting > 0 && (
                            <span className="flex items-center gap-1 text-amber-600">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                              {bd.waiting} waiting
                            </span>
                          )}
                          {bd.paused > 0 && (
                            <span className="flex items-center gap-1 text-gray-500">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
                              {bd.paused} paused
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    {/* Deployment status */}
                    <div className="mb-2 flex items-center justify-between">
                      {deploymentStatus[agent.id] ? (
                        <span className={`flex items-center gap-1.5 text-[10px] font-medium ${
                          deploymentStatus[agent.id] === "complete" ? "text-green-600" :
                          deploymentStatus[agent.id] === "pending" ? "text-amber-600" :
                          "text-teal-600"
                        }`}>
                          {deploymentStatus[agent.id] === "pending" && <><Loader2 size={10} className="animate-spin" /> Deployment pending...</>}
                          {deploymentStatus[agent.id] === "downloading" && <><Loader2 size={10} className="animate-spin" /> Downloading model...</>}
                          {deploymentStatus[agent.id] === "complete" && <><Check size={10} /> Model deployed</>}
                        </span>
                      ) : null}
                      {isOnline && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setModelUpdateTarget(agent); setSelectedModelId(""); }}
                          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-teal-600 transition hover:bg-teal-50"
                        >
                          <Download size={10} /> Update Model
                        </button>
                      )}
                    </div>

                    {/* Metric bars */}
                    {isOnline && (
                      <div className="space-y-1.5">
                        {metricBar(agent.cpu_percent, "CPU")}
                        {metricBar(agent.ram_percent, "RAM")}
                      </div>
                    )}

                    {/* Heartbeat */}
                    <p className="mt-2 text-[10px] text-gray-400">
                      Last heartbeat: {relativeTime(agent.last_heartbeat)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {selectedAgent ? (
            <>
              <div className="mb-4 flex items-center gap-2">
                {editingName ? (
                  <>
                    <input
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editNameValue.trim()) {
                          renameMutation.mutate({ agentId: selectedAgent.id, name: editNameValue.trim() });
                        }
                        if (e.key === "Escape") setEditingName(false);
                      }}
                      autoFocus
                      className="flex-1 rounded-lg border border-teal-500 px-3 py-1.5 text-sm font-semibold text-gray-900 outline-none ring-2 ring-teal-500/20"
                    />
                    <button
                      onClick={() => {
                        if (editNameValue.trim()) {
                          renameMutation.mutate({ agentId: selectedAgent.id, name: editNameValue.trim() });
                        }
                      }}
                      disabled={!editNameValue.trim() || renameMutation.isPending}
                      className="rounded-lg p-1.5 text-teal-600 transition hover:bg-teal-50 disabled:opacity-50"
                    >
                      {renameMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="flex-1 text-base font-semibold text-gray-900">{selectedAgent.name}</h3>
                    <button
                      onClick={() => { setEditNameValue(selectedAgent.name); setEditingName(true); }}
                      className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-teal-600"
                      title="Edit agent name"
                    >
                      <Pencil size={14} />
                    </button>
                  </>
                )}
              </div>

              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Status</dt><dd><StatusBadge status={selectedAgent.status} /></dd></div>
                <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Store</dt><dd className="text-gray-900">{storeMap.get(selectedAgent.store_id) ?? "\u2014"}</dd></div>
                <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Version</dt><dd className="text-gray-900">{selectedAgent.agent_version ?? "\u2014"}</dd></div>
                <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Model</dt><dd className="text-gray-900">{selectedAgent.current_model_version ?? "None"}</dd></div>
                <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Cameras</dt><dd className="text-gray-900">{selectedAgent.camera_count}</dd></div>
                <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">FPS</dt><dd className="text-gray-900">{selectedAgent.inference_fps?.toFixed(1) ?? "\u2014"}</dd></div>
                <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Buffer</dt><dd className="text-gray-900">{selectedAgent.buffer_frames} frames ({selectedAgent.buffer_size_mb.toFixed(1)} MB)</dd></div>
                <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><dt className="text-gray-500">Tunnel</dt><dd>{selectedAgent.tunnel_status ? <StatusBadge status={selectedAgent.tunnel_status} /> : <span className="text-gray-400">\u2014</span>}</dd></div>
              </dl>

              {selectedAgent.status !== "offline" && (
                <div className="mt-5 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Health Metrics</h4>
                  {metricBar(selectedAgent.cpu_percent, "CPU")}
                  {metricBar(selectedAgent.ram_percent, "RAM")}
                  {metricBar(selectedAgent.disk_percent, "Disk")}
                  {selectedAgent.gpu_percent != null && metricBar(selectedAgent.gpu_percent, "GPU")}
                </div>
              )}

              {agentCameras.length > 0 && (
                <div className="mt-5">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Cameras ({agentCameras.length})
                  </h4>
                  {(() => {
                    const bd = cameraBreakdown(selectedAgent.id);
                    return (
                      <div className="mb-2 flex items-center gap-3 text-[10px]">
                        {bd.configured > 0 && <span className="text-green-600">{bd.configured} configured</span>}
                        {bd.waiting > 0 && <span className="text-amber-600">{bd.waiting} waiting</span>}
                        {bd.paused > 0 && <span className="text-gray-500">{bd.paused} paused</span>}
                      </div>
                    );
                  })()}
                  <div className="space-y-1.5">
                    {agentCameras.map((cam: any) => (
                      <div key={cam.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2 w-2 rounded-full ${cam.detection_enabled ? "bg-green-500" : "bg-gray-300"}`} />
                          <span className="text-xs text-gray-900">{cam.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {cam.config_version && (
                            <span className="text-xs text-gray-400 font-mono">v{cam.config_version}</span>
                          )}
                          {cam.config_status === 'sync_failed' && (
                            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">
                              <XCircle size={10} /> Sync failed
                            </span>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                            cam.config_status === "received" ? "bg-green-50 text-green-700" :
                            cam.config_status === "failed" ? "bg-red-50 text-red-600" :
                            !cam.edge_agent_id ? "bg-gray-100 text-gray-500" :
                            "bg-amber-50 text-amber-700"
                          }`}>
                            {cam.config_status || "waiting"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add IoT Device */}
              {selectedAgent.status === "online" && (
                <div className="mt-5">
                  <button
                    onClick={() => setAddDeviceOpen(true)}
                    className="w-full rounded-xl border-2 border-dashed border-teal-300 px-3 py-2.5 text-xs font-medium text-teal-600 transition hover:bg-teal-50"
                  >
                    + Add IoT Device
                  </button>
                </div>
              )}

              <div className="mt-5">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Send Command</h4>
                <div className="flex gap-2">
                  <select value={cmdType} onChange={(e) => setCmdType(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none transition focus:border-teal-500">
                    <option value="ping">Ping</option>
                    <option value="restart_agent">Restart</option>
                    <option value="reload_model">Reload Model</option>
                  </select>
                  <button
                    onClick={() => commandMutation.mutate({ agentId: selectedAgent.id, type: cmdType })}
                    disabled={commandMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
                  >
                    {commandMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Server size={32} className="mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">Select an agent to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Add IoT Device Modal */}
      {addDeviceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Add IoT Device via Edge</h2>
              <button onClick={() => { setAddDeviceOpen(false); setDevName(""); setDevIp(""); setDevType("tplink"); setDevProtocol("tcp"); setDevTestResult(null); setDevTestLatency(null); setDevTestError(""); }} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">Store</label>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900">
                  {storeMap.get(selectedAgent?.store_id ?? "") ?? "Unknown Store"}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">Device Name *</label>
                <input value={devName} onChange={(e) => setDevName(e.target.value)}
                  placeholder="e.g. Caution Sign Plug"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">IP Address *</label>
                <input value={devIp} onChange={(e) => { setDevIp(e.target.value); setDevTestResult(null); setDevTestLatency(null); setDevTestError(""); }}
                  placeholder="192.168.1.50"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500">Device Type</label>
                  <select value={devType} onChange={(e) => setDevType(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500">
                    <option value="tplink">TP-Link Kasa</option>
                    <option value="mqtt">MQTT</option>
                    <option value="http_webhook">HTTP Webhook</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500">Protocol</label>
                  <select value={devProtocol} onChange={(e) => setDevProtocol(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500">
                    <option value="tcp">TCP</option>
                    <option value="mqtt">MQTT</option>
                    <option value="http">HTTP</option>
                  </select>
                </div>
              </div>
              <button
                onClick={() => testDeviceMutation.mutate()}
                disabled={!devIp.trim() || testDeviceMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl border border-teal-500 px-4 py-2 text-xs font-medium text-teal-600 transition hover:bg-teal-50 disabled:opacity-50"
              >
                {testDeviceMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
                Validate via Edge
              </button>
              {devTestResult === true && (
                <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3">
                  <Activity size={14} className="text-green-600" />
                  <span className="text-xs font-medium text-green-700">
                    Reachable{devTestLatency != null && ` -- ${devTestLatency} ms latency`}
                  </span>
                </div>
              )}
              {devTestResult === false && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3">
                  <X size={14} className="text-red-500" />
                  <span className="text-xs font-medium text-red-600">Unreachable</span>
                </div>
              )}
              {devTestError && <p className="text-xs text-red-500">{devTestError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button onClick={() => { setAddDeviceOpen(false); setDevName(""); setDevIp(""); setDevType("tplink"); setDevProtocol("tcp"); setDevTestResult(null); setDevTestLatency(null); setDevTestError(""); }} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => addDeviceMutation.mutate()}
                disabled={!devName.trim() || !devIp.trim() || devTestResult !== true || addDeviceMutation.isPending}
                className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
              >
                {addDeviceMutation.isPending ? "Adding..." : "Add Device"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Model Modal */}
      {modelUpdateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Update Model -- {modelUpdateTarget.name}</h2>
              <button onClick={() => { setModelUpdateTarget(null); setSelectedModelId(""); }} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="p-6">
              <div className="mb-5 rounded-xl bg-gray-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Current Model</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {modelUpdateTarget.current_model_version ?? "No model deployed"}
                </p>
              </div>

              {deployableModels.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-500">No production or staging models available. Train or import a model first.</p>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="mb-1.5 block text-xs font-medium text-gray-500">Select Model to Deploy</label>
                    <select
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                    >
                      <option value="">Choose a model...</option>
                      {productionModels.length > 0 && (
                        <optgroup label="Production">
                          {productionModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.version_str} -- {m.architecture ?? "onnx"} ({m.model_size_mb ? `${m.model_size_mb} MB` : "size unknown"})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {stagingModels.length > 0 && (
                        <optgroup label="Staging">
                          {stagingModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.version_str} -- {m.architecture ?? "onnx"} ({m.model_size_mb ? `${m.model_size_mb} MB` : "size unknown"})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {selectedModelId && (() => {
                    const selected = deployableModels.find((m) => m.id === selectedModelId);
                    if (!selected) return null;
                    return (
                      <div className="mb-4 rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{selected.version_str}</p>
                            <p className="text-[10px] text-gray-500">
                              {selected.architecture ?? "onnx"} &middot; {selected.model_size_mb ? `${selected.model_size_mb} MB` : "size unknown"}
                              {selected.map_50 != null && ` \u00B7 mAP@50: ${(selected.map_50 * 100).toFixed(1)}%`}
                            </p>
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                            selected.status === "production" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                          }`}>
                            {selected.status}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => { setModelUpdateTarget(null); setSelectedModelId(""); }}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedModelId && modelUpdateTarget) {
                    pushModelMutation.mutate({ agentId: modelUpdateTarget.id, modelVersionId: selectedModelId });
                  }
                }}
                disabled={!selectedModelId || pushModelMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2 text-xs font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
              >
                {pushModelMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Deploy to Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provision Drawer */}
      {provisionOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
          <div className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Provision Edge Agent</h2>
              <button onClick={() => setProvisionOpen(false)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-5 p-6">
              {!provResult ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-900">Store *</label>
                    <select value={provStoreId} onChange={(e) => setProvStoreId(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20">
                      <option value="">Select store</option>
                      {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-900">Agent Name *</label>
                    <input value={provName} onChange={(e) => setProvName(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                  <button
                    onClick={() => provisionMutation.mutate()}
                    disabled={!provStoreId || !provName || provisionMutation.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
                  >
                    {provisionMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                    Provision
                  </button>
                </>
              ) : (
                <>
                  <div className="rounded-xl bg-green-50 p-4 text-sm font-medium text-green-700">
                    Agent provisioned successfully!
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-900">Edge Token</label>
                    <textarea readOnly value={provResult.token} rows={3}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 font-mono text-xs" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-900">docker-compose.yml</label>
                    <textarea readOnly value={provResult.docker_compose} rows={12}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 font-mono text-[10px]" />
                  </div>
                  <button onClick={() => setProvisionOpen(false)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Edge Agent"
        description={`Remove "${deleteTarget?.name}"? Cameras linked to this agent will be unlinked.`}
        confirmLabel="Remove"
        confirmText={deleteTarget?.name}
        destructive
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Rollout Modal */}
      {rolloutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-bold text-gray-900">Update All Edge Agents</h3>
            <p className="mb-4 text-sm text-gray-500">
              Agents will be updated one at a time. Each agent is verified before proceeding to the next.
              Detections pause for ~40 seconds per store during restart.
            </p>
            <label className="mb-1 block text-sm font-medium text-gray-700">Target Version</label>
            <input
              type="text"
              placeholder="e.g. 4.9.0"
              value={rolloutVersion}
              onChange={(e) => setRolloutVersion(e.target.value)}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <p className="mb-4 text-xs text-gray-400">
              This will update {agents.length} agent{agents.length !== 1 ? "s" : ""}.
              Current versions: {[...new Set(agents.map(a => a.agent_version || "unknown"))].join(", ")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setRolloutOpen(false); setRolloutVersion(""); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => rolloutMutation.mutate()}
                disabled={!rolloutVersion.trim() || rolloutMutation.isPending}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
              >
                {rolloutMutation.isPending ? "Starting..." : `Update ${agents.length} Agent${agents.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
