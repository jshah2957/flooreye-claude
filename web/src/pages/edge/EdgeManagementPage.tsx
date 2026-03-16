import { useState } from "react";
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
} from "lucide-react";

import api from "@/lib/api";
import type { Store, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";

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
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<EdgeAgent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EdgeAgent | null>(null);
  const [cmdType, setCmdType] = useState("ping");

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
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/edge/agents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["edge-agents"] });
      setDeleteTarget(null);
      if (selectedAgent?.id === deleteTarget?.id) setSelectedAgent(null);
    },
  });

  const commandMutation = useMutation({
    mutationFn: ({ agentId, type }: { agentId: string; type: string }) =>
      api.post(`/edge/agents/${agentId}/command`, { command_type: type, payload: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["edge-agents"] }),
  });

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
              <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">{selectedAgent.name}</h3>
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
        description={`Remove "${deleteTarget?.name}"? This will delete the agent and all pending commands.`}
        confirmLabel="Remove"
        confirmText={deleteTarget?.name}
        destructive
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
