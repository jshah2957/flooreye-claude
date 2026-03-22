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

export default function EdgeManagementPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<EdgeAgent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EdgeAgent | null>(null);
  const [cmdType, setCmdType] = useState("ping");
  const [modelUpdateTarget, setModelUpdateTarget] = useState<EdgeAgent | null>(null);
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
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
      success("Model deployment initiated — tracking status");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to push model");
    },
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

  // Poll agent status when deployments are pending to track progress
  const hasActiveDeployments = Object.values(deploymentStatus).some(
    (s) => s === "pending" || s === "downloading"
  );

  useQuery({
    queryKey: ["edge-agents-poll"],
    queryFn: async () => {
      const res = await api.get("/edge/agents", { params: { limit: 100 } });
      const freshAgents = res.data.data as EdgeAgent[];
      // Check deployment status by comparing model versions
      setDeploymentStatus((prev) => {
        const updated = { ...prev };
        for (const agentId of Object.keys(updated)) {
          const agent = freshAgents.find((a) => a.id === agentId);
          if (!agent) continue;
          // If agent has a model version now and status was pending/downloading, mark complete
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

  // Fetch all cameras to build per-agent camera lists and breakdowns
  const { data: allCamerasData } = useQuery({
    queryKey: ["all-cameras-for-agents"],
    queryFn: async () => {
      const res = await api.get("/cameras", { params: { limit: 200 } });
      return res.data.data as { id: string; name: string; edge_agent_id: string | null; config_status: string | null; detection_enabled: boolean; status: string }[];
    },
  });
  const allCameras = allCamerasData ?? [];

  // Per-agent camera lists
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
    const color = pct > 80 ? "bg-[#DC2626]" : pct > 60 ? "bg-[#D97706]" : "bg-[#16A34A]";
    return (
      <div className="flex items-center gap-2">
        <span className="w-8 text-[10px] text-[#78716C]">{label}</span>
        <div className="h-1.5 flex-1 rounded-full bg-gray-200">
          <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-8 text-right text-[10px] text-[#78716C]">{pct.toFixed(0)}%</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Edge Agents</h1>
          <p className="text-sm text-[#78716C]">{agents.length} agents registered</p>
        </div>
        <button
          onClick={() => { setProvisionOpen(true); setProvResult(null); setProvName(""); setProvStoreId(""); }}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]"
        >
          <Plus size={16} /> Provision Agent
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Agent List */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
          ) : agents.length === 0 ? (
            <EmptyState icon={Server} title="No edge agents" description="Provision your first edge agent." actionLabel="Provision" onAction={() => setProvisionOpen(true)} />
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  className={`cursor-pointer rounded-lg border bg-white p-4 transition-colors ${
                    selectedAgent?.id === agent.id ? "border-[#0D9488]" : "border-[#E7E5E0] hover:border-[#0D9488]/50"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server size={16} className="text-[#78716C]" />
                      <span className="font-medium text-[#1C1917]">{agent.name}</span>
                      {agent.current_model_version ? (
                        <span className="rounded-full bg-[#F0FDFA] px-2 py-0.5 text-[10px] font-medium text-[#0D9488]">
                          {agent.current_model_version}
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#FEF9C3] px-2 py-0.5 text-[10px] font-medium text-[#CA8A04]">
                          No model
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={agent.status} />
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(agent); }}
                        className="rounded p-1 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[#78716C]">
                    {storeMap.get(agent.store_id) ?? "Unknown Store"} &middot; {agent.camera_count} cameras
                    {agent.agent_version && ` · v${agent.agent_version}`}
                  </p>
                  {(() => {
                    const bd = cameraBreakdown(agent.id);
                    if (bd.total === 0) return null;
                    return (
                      <div className="mt-1 flex items-center gap-3 text-[10px]">
                        {bd.configured > 0 && (
                          <span className="flex items-center gap-1 text-[#16A34A]">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                            {bd.configured} configured
                          </span>
                        )}
                        {bd.waiting > 0 && (
                          <span className="flex items-center gap-1 text-[#CA8A04]">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#CA8A04]" />
                            {bd.waiting} waiting
                          </span>
                        )}
                        {bd.paused > 0 && (
                          <span className="flex items-center gap-1 text-[#78716C]">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#78716C]" />
                            {bd.paused} paused
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <div className="mt-1 flex items-center justify-between">
                    {deploymentStatus[agent.id] ? (
                      <span className={`flex items-center gap-1 text-[10px] font-medium ${
                        deploymentStatus[agent.id] === "complete" ? "text-[#16A34A]" :
                        deploymentStatus[agent.id] === "pending" ? "text-[#D97706]" :
                        "text-[#0D9488]"
                      }`}>
                        {deploymentStatus[agent.id] === "pending" && <><Loader2 size={10} className="animate-spin" /> Deployment pending...</>}
                        {deploymentStatus[agent.id] === "downloading" && <><Loader2 size={10} className="animate-spin" /> Downloading model...</>}
                        {deploymentStatus[agent.id] === "complete" && <><Check size={10} /> Model deployed</>}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#78716C]">
                        Model: {agent.current_model_version ?? "None"}
                      </span>
                    )}
                    {agent.status === "online" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setModelUpdateTarget(agent); setSelectedModelId(""); }}
                        className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-[#0D9488] hover:bg-[#F0FDFA]"
                      >
                        <Download size={10} /> Update Model
                      </button>
                    )}
                  </div>
                  {agent.status === "online" && (
                    <div className="mt-2 space-y-1">
                      {metricBar(agent.cpu_percent, "CPU")}
                      {metricBar(agent.ram_percent, "RAM")}
                    </div>
                  )}
                  {agent.last_heartbeat && (
                    <p className="mt-1 text-[10px] text-[#78716C]">
                      Last heartbeat: {new Date(agent.last_heartbeat).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
          {selectedAgent ? (
            <>
              <div className="mb-3 flex items-center gap-2">
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
                      className="flex-1 rounded-md border border-[#0D9488] px-2 py-1 text-sm font-semibold text-[#1C1917] outline-none"
                    />
                    <button
                      onClick={() => {
                        if (editNameValue.trim()) {
                          renameMutation.mutate({ agentId: selectedAgent.id, name: editNameValue.trim() });
                        }
                      }}
                      disabled={!editNameValue.trim() || renameMutation.isPending}
                      className="rounded p-1 text-[#0D9488] hover:bg-[#F0FDFA] disabled:opacity-50"
                    >
                      {renameMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="flex-1 text-sm font-semibold text-[#1C1917]">{selectedAgent.name}</h3>
                    <button
                      onClick={() => { setEditNameValue(selectedAgent.name); setEditingName(true); }}
                      className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#0D9488]"
                      title="Edit agent name"
                    >
                      <Pencil size={14} />
                    </button>
                  </>
                )}
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between"><dt className="text-[#78716C]">Status</dt><dd><StatusBadge status={selectedAgent.status} /></dd></div>
                <div className="flex justify-between"><dt className="text-[#78716C]">Store</dt><dd className="text-[#1C1917]">{storeMap.get(selectedAgent.store_id) ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-[#78716C]">Version</dt><dd className="text-[#1C1917]">{selectedAgent.agent_version ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-[#78716C]">Model</dt><dd className="text-[#1C1917]">{selectedAgent.current_model_version ?? "None"}</dd></div>
                <div className="flex justify-between"><dt className="text-[#78716C]">Cameras</dt><dd className="text-[#1C1917]">{selectedAgent.camera_count}</dd></div>
                <div className="flex justify-between"><dt className="text-[#78716C]">FPS</dt><dd className="text-[#1C1917]">{selectedAgent.inference_fps?.toFixed(1) ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-[#78716C]">Buffer</dt><dd className="text-[#1C1917]">{selectedAgent.buffer_frames} frames ({selectedAgent.buffer_size_mb.toFixed(1)} MB)</dd></div>
                <div className="flex justify-between"><dt className="text-[#78716C]">Tunnel</dt><dd>{selectedAgent.tunnel_status ? <StatusBadge status={selectedAgent.tunnel_status} /> : <span className="text-[#78716C]">—</span>}</dd></div>
              </dl>

              {selectedAgent.status !== "offline" && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-xs font-semibold text-[#78716C]">Health</h4>
                  {metricBar(selectedAgent.cpu_percent, "CPU")}
                  {metricBar(selectedAgent.ram_percent, "RAM")}
                  {metricBar(selectedAgent.disk_percent, "Disk")}
                  {selectedAgent.gpu_percent != null && metricBar(selectedAgent.gpu_percent, "GPU")}
                </div>
              )}

              {agentCameras.length > 0 && (
                <div className="mt-4">
                  <h4 className="mb-1 text-xs font-semibold text-[#78716C]">
                    Cameras ({agentCameras.length})
                  </h4>
                  {(() => {
                    const bd = cameraBreakdown(selectedAgent.id);
                    return (
                      <div className="mb-2 flex items-center gap-3 text-[10px]">
                        {bd.configured > 0 && <span className="text-[#16A34A]">{bd.configured} configured</span>}
                        {bd.waiting > 0 && <span className="text-[#CA8A04]">{bd.waiting} waiting</span>}
                        {bd.paused > 0 && <span className="text-[#78716C]">{bd.paused} paused</span>}
                      </div>
                    );
                  })()}
                  <div className="space-y-1">
                    {agentCameras.map((cam: any) => (
                      <div key={cam.id} className="flex items-center justify-between rounded border border-[#F5F5F4] px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${cam.detection_enabled ? "bg-[#16A34A]" : "bg-[#D6D3D1]"}`} />
                          <span className="text-[11px] text-[#1C1917]">{cam.name}</span>
                        </div>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                          cam.config_status === "received" ? "bg-[#DCFCE7] text-[#16A34A]" :
                          cam.config_status === "failed" ? "bg-[#FEE2E2] text-[#DC2626]" :
                          !cam.edge_agent_id ? "bg-[#F1F0ED] text-[#78716C]" :
                          "bg-[#FEF9C3] text-[#CA8A04]"
                        }`}>
                          {cam.config_status || "waiting"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add IoT Device via Cloud */}
              {selectedAgent.status === "online" && (
                <div className="mt-4">
                  <button
                    onClick={() => setAddDeviceOpen(true)}
                    className="w-full rounded-md border border-dashed border-[#0D9488] px-3 py-2 text-xs text-[#0D9488] hover:bg-[#F0FDFA]"
                  >
                    + Add IoT Device
                  </button>
                </div>
              )}

              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold text-[#78716C]">Send Command</h4>
                <div className="flex gap-2">
                  <select value={cmdType} onChange={(e) => setCmdType(e.target.value)}
                    className="flex-1 rounded-md border border-[#E7E5E0] px-2 py-1.5 text-xs outline-none focus:border-[#0D9488]">
                    <option value="ping">Ping</option>
                    <option value="restart_agent">Restart</option>
                    <option value="reload_model">Reload Model</option>
                  </select>
                  <button
                    onClick={() => commandMutation.mutate({ agentId: selectedAgent.id, type: cmdType })}
                    disabled={commandMutation.isPending}
                    className="flex items-center gap-1 rounded-md bg-[#0D9488] px-3 py-1.5 text-xs text-white hover:bg-[#0F766E] disabled:opacity-50"
                  >
                    {commandMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-xs text-[#78716C]">Select an agent to view details</p>
          )}
        </div>
      </div>

      {/* Add IoT Device Modal */}
      {addDeviceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[420px] rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
              <h2 className="text-sm font-semibold text-[#1C1917]">Add IoT Device via Edge</h2>
              <button onClick={() => { setAddDeviceOpen(false); setDevName(""); setDevIp(""); setDevType("tplink"); setDevProtocol("tcp"); setDevTestResult(null); setDevTestLatency(null); setDevTestError(""); }} className="text-[#78716C] hover:text-[#1C1917]"><X size={16} /></button>
            </div>
            <div className="space-y-3 p-4">
              {/* Auto-selected store from agent */}
              <div>
                <label className="mb-1 block text-xs text-[#78716C]">Store</label>
                <div className="rounded-md border border-[#E7E5E0] bg-[#F8F7F4] px-3 py-2 text-sm text-[#1C1917]">
                  {storeMap.get(selectedAgent?.store_id ?? "") ?? "Unknown Store"}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#78716C]">Device Name *</label>
                <input value={devName} onChange={(e) => setDevName(e.target.value)}
                  placeholder="e.g. Caution Sign Plug"
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#78716C]">IP Address *</label>
                <input value={devIp} onChange={(e) => { setDevIp(e.target.value); setDevTestResult(null); setDevTestLatency(null); setDevTestError(""); }}
                  placeholder="192.168.1.50"
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-[#78716C]">Device Type</label>
                  <select value={devType} onChange={(e) => setDevType(e.target.value)}
                    className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                    <option value="tplink">TP-Link Kasa</option>
                    <option value="mqtt">MQTT</option>
                    <option value="http_webhook">HTTP Webhook</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[#78716C]">Protocol</label>
                  <select value={devProtocol} onChange={(e) => setDevProtocol(e.target.value)}
                    className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                    <option value="tcp">TCP</option>
                    <option value="mqtt">MQTT</option>
                    <option value="http">HTTP</option>
                  </select>
                </div>
              </div>
              <button
                onClick={() => testDeviceMutation.mutate()}
                disabled={!devIp.trim() || testDeviceMutation.isPending}
                className="flex items-center gap-1 rounded-md border border-[#0D9488] px-3 py-1.5 text-xs text-[#0D9488] hover:bg-[#F0FDFA] disabled:opacity-50"
              >
                {testDeviceMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : <Wifi size={10} />}
                Validate via Edge
              </button>
              {devTestResult === true && (
                <div className="flex items-center gap-2 rounded-md bg-[#DCFCE7] px-3 py-2">
                  <Activity size={12} className="text-[#16A34A]" />
                  <span className="text-xs font-medium text-[#16A34A]">
                    Reachable{devTestLatency != null && ` — ${devTestLatency} ms latency`}
                  </span>
                </div>
              )}
              {devTestResult === false && (
                <div className="flex items-center gap-2 rounded-md bg-[#FEE2E2] px-3 py-2">
                  <X size={12} className="text-[#DC2626]" />
                  <span className="text-xs font-medium text-[#DC2626]">Unreachable</span>
                </div>
              )}
              {devTestError && <p className="text-xs text-[#DC2626]">{devTestError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#E7E5E0] p-4">
              <button onClick={() => { setAddDeviceOpen(false); setDevName(""); setDevIp(""); setDevType("tplink"); setDevProtocol("tcp"); setDevTestResult(null); setDevTestLatency(null); setDevTestError(""); }} className="rounded-md border border-[#E7E5E0] px-3 py-1.5 text-xs">Cancel</button>
              <button
                onClick={() => addDeviceMutation.mutate()}
                disabled={!devName.trim() || !devIp.trim() || devTestResult !== true || addDeviceMutation.isPending}
                className="rounded-md bg-[#0D9488] px-4 py-1.5 text-xs text-white hover:bg-[#0F766E] disabled:opacity-50"
              >
                {addDeviceMutation.isPending ? "Adding..." : "Add Device"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Model Modal */}
      {modelUpdateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[440px] rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
              <h2 className="text-sm font-semibold text-[#1C1917]">Update Model — {modelUpdateTarget.name}</h2>
              <button onClick={() => { setModelUpdateTarget(null); setSelectedModelId(""); }} className="text-[#78716C] hover:text-[#1C1917]"><X size={16} /></button>
            </div>
            <div className="p-4">
              {/* Current model display */}
              <div className="mb-4 rounded-md bg-[#F8F7F4] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-[#78716C]">Current Model</p>
                <p className="mt-1 text-sm font-semibold text-[#1C1917]">
                  {modelUpdateTarget.current_model_version ?? "No model deployed"}
                </p>
              </div>

              {deployableModels.length === 0 ? (
                <p className="py-4 text-center text-xs text-[#78716C]">No production or staging models available. Train or import a model first.</p>
              ) : (
                <>
                  {/* Model selector dropdown */}
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium text-[#78716C]">Select Model to Deploy</label>
                    <select
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                      className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
                    >
                      <option value="">Choose a model...</option>
                      {productionModels.length > 0 && (
                        <optgroup label="Production">
                          {productionModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.version_str} — {m.architecture ?? "onnx"} ({m.model_size_mb ? `${m.model_size_mb} MB` : "size unknown"})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {stagingModels.length > 0 && (
                        <optgroup label="Staging">
                          {stagingModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.version_str} — {m.architecture ?? "onnx"} ({m.model_size_mb ? `${m.model_size_mb} MB` : "size unknown"})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Selected model detail */}
                  {selectedModelId && (() => {
                    const selected = deployableModels.find((m) => m.id === selectedModelId);
                    if (!selected) return null;
                    return (
                      <div className="mb-3 rounded-md border border-[#E7E5E0] p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-[#1C1917]">{selected.version_str}</p>
                            <p className="text-[10px] text-[#78716C]">
                              {selected.architecture ?? "onnx"} &middot; {selected.model_size_mb ? `${selected.model_size_mb} MB` : "size unknown"}
                              {selected.map_50 != null && ` · mAP@50: ${(selected.map_50 * 100).toFixed(1)}%`}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            selected.status === "production" ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#FEF9C3] text-[#CA8A04]"
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
            <div className="flex justify-end gap-2 border-t border-[#E7E5E0] p-4">
              <button
                onClick={() => { setModelUpdateTarget(null); setSelectedModelId(""); }}
                className="rounded-md border border-[#E7E5E0] px-3 py-1.5 text-xs"
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
                className="flex items-center gap-1 rounded-md bg-[#0D9488] px-4 py-1.5 text-xs text-white hover:bg-[#0F766E] disabled:opacity-50"
              >
                {pushModelMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                Deploy to Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provision Drawer */}
      {provisionOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="h-full w-[384px] overflow-y-auto bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
              <h2 className="text-lg font-semibold text-[#1C1917]">Provision Edge Agent</h2>
              <button onClick={() => setProvisionOpen(false)} className="text-[#78716C] hover:text-[#1C1917]"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-4">
              {!provResult ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#1C1917]">Store *</label>
                    <select value={provStoreId} onChange={(e) => setProvStoreId(e.target.value)}
                      className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                      <option value="">Select store</option>
                      {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#1C1917]">Agent Name *</label>
                    <input value={provName} onChange={(e) => setProvName(e.target.value)}
                      className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]" />
                  </div>
                  <button
                    onClick={() => provisionMutation.mutate()}
                    disabled={!provStoreId || !provName || provisionMutation.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
                  >
                    {provisionMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                    Provision
                  </button>
                </>
              ) : (
                <>
                  <div className="rounded-md bg-[#DCFCE7] p-3 text-sm text-[#16A34A]">
                    Agent provisioned successfully!
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#1C1917]">Edge Token</label>
                    <textarea readOnly value={provResult.token} rows={3}
                      className="w-full rounded-md border border-[#E7E5E0] bg-[#F8F7F4] px-3 py-2 font-mono text-xs" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#1C1917]">docker-compose.yml</label>
                    <textarea readOnly value={provResult.docker_compose} rows={12}
                      className="w-full rounded-md border border-[#E7E5E0] bg-[#F8F7F4] px-3 py-2 font-mono text-[10px]" />
                  </div>
                  <button onClick={() => setProvisionOpen(false)}
                    className="w-full rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]">
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
    </div>
  );
}
