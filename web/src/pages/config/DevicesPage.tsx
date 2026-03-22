import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Radio, Trash2, Loader2, Zap, X, Power, Link2, Clock, History, PlayCircle } from "lucide-react";

import api from "@/lib/api";
import { INTERVALS } from "@/constants";
import type { Store, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";

interface Device {
  id: string;
  store_id: string;
  name: string;
  device_type: string;
  control_method: string;
  ip?: string;
  status: string;
  last_triggered: string | null;
  is_active: boolean;
  edge_agent_id?: string;
  assigned_cameras?: string[];
  trigger_on_any?: boolean;
  auto_off_seconds?: number;
}

/* ── Auto-off countdown hook ── */
function useCountdown(device: Device): string | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (device.status !== "triggered" || !device.auto_off_seconds || !device.last_triggered) {
      setRemaining(null);
      return;
    }

    const calculate = () => {
      const triggeredAt = new Date(device.last_triggered!).getTime();
      const offAt = triggeredAt + device.auto_off_seconds! * 1000;
      const left = Math.max(0, Math.floor((offAt - Date.now()) / 1000));
      setRemaining(left);
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [device.status, device.auto_off_seconds, device.last_triggered]);

  if (remaining === null || remaining <= 0) return null;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/* ── Countdown display component ── */
function AutoOffCountdown({ device }: { device: Device }) {
  const countdown = useCountdown(device);
  if (!countdown) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
      <Clock size={10} /> Auto-off in {countdown}
    </span>
  );
}

/* ── Trigger History Modal ── */
function TriggerHistoryModal({ device, onClose }: { device: Device; onClose: () => void }) {
  // Fetch device detail for latest info
  const { data, isLoading } = useQuery({
    queryKey: ["device-detail", device.id],
    queryFn: async () => {
      const res = await api.get(`/devices/${device.id}`);
      return res.data.data as Device;
    },
  });

  const detail = data ?? device;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[440px] rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1C1917]">Trigger History -- {detail.name}</h3>
          <button onClick={onClose} className="text-[#78716C] hover:text-[#1C1917]"><X size={16} /></button>
        </div>

        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-[#0D9488]" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-[#E7E5E0] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-[#78716C]">Current Status</span>
                <StatusBadge status={detail.status} size="sm" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[#78716C]">Type:</span>{" "}
                  <span className="font-medium text-[#1C1917]">{detail.device_type}</span>
                </div>
                <div>
                  <span className="text-[#78716C]">Control:</span>{" "}
                  <span className="font-medium text-[#1C1917]">{detail.control_method}</span>
                </div>
                {detail.auto_off_seconds && (
                  <div>
                    <span className="text-[#78716C]">Auto-off:</span>{" "}
                    <span className="font-medium text-[#1C1917]">{detail.auto_off_seconds}s</span>
                  </div>
                )}
                {detail.ip && (
                  <div>
                    <span className="text-[#78716C]">IP:</span>{" "}
                    <span className="font-medium text-[#1C1917]">{detail.ip}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#E7E5E0] p-3">
              <span className="mb-2 block text-xs font-medium text-[#78716C]">Last Trigger Event</span>
              {detail.last_triggered ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap size={12} className="text-amber-500" />
                    <span className="text-sm font-medium text-[#1C1917]">
                      {new Date(detail.last_triggered).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#78716C]">
                    Relative: {formatRelativeTime(detail.last_triggered)}
                  </p>
                  {detail.status === "triggered" && detail.auto_off_seconds && (
                    <p className="text-[10px] text-amber-600">
                      Expected auto-off at:{" "}
                      {new Date(new Date(detail.last_triggered).getTime() + detail.auto_off_seconds * 1000).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#A8A29E]">This device has never been triggered.</p>
              )}
            </div>

            <p className="text-[10px] text-[#A8A29E]">
              Full trigger history with latency and incident links requires a dedicated history endpoint.
              Showing latest trigger state from the device record.
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={onClose}
            className="rounded-md border border-[#E7E5E0] px-3 py-1.5 text-xs text-[#78716C] hover:bg-[#F5F5F4]">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Device | null>(null);
  const [assignCameras, setAssignCameras] = useState<string[]>([]);
  const [assignTriggerAny, setAssignTriggerAny] = useState(true);
  const [historyTarget, setHistoryTarget] = useState<Device | null>(null);
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [deviceType, setDeviceType] = useState("tplink");
  const [controlMethod, setControlMethod] = useState("http");
  const [controlUrl, setControlUrl] = useState("");

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", { params: { limit: 100 } });
      return res.data.data;
    },
  });

  const { data: camerasData } = useQuery({
    queryKey: ["cameras-all-devices"],
    queryFn: async () => {
      const res = await api.get("/cameras", { params: { limit: 200 } });
      return res.data.data as { id: string; name: string; store_id: string }[];
    },
  });

  /* Polling every 30s for real-time device status */
  const { data: devicesData, isLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await api.get("/devices", { params: { limit: 200 } });
      return res.data;
    },
    refetchInterval: INTERVALS.DEVICE_STATUS_POLL_MS,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/devices", {
      store_id: storeId, name, device_type: deviceType,
      control_method: controlMethod, control_url: controlUrl || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setDrawerOpen(false); setName(""); setControlUrl("");
      success("Device added");
    },
    onError: (err: any) => showError(err?.response?.data?.detail || "Failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/devices/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["devices"] }); success("Device deactivated"); },
    onError: (err: any) => showError(err?.response?.data?.detail || "Failed"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.post(`/devices/${id}/toggle`, { action }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["devices"] }); success("Device toggled"); },
    onError: (err: any) => showError(err?.response?.data?.detail || "Toggle failed"),
  });

  const assignMutation = useMutation({
    mutationFn: () => api.put(`/devices/${assignTarget?.id}/assign`, {
      assigned_cameras: assignCameras,
      trigger_on_any: assignTriggerAny,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setAssignTarget(null);
      success("Camera assignment saved");
    },
    onError: (err: any) => showError(err?.response?.data?.detail || "Failed"),
  });

  /* Test Device trigger mutation */
  const triggerMutation = useMutation({
    mutationFn: (id: string) => api.post(`/devices/${id}/trigger`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      success("Device triggered successfully");
    },
    onError: (err: any) => showError(err?.response?.data?.detail || "Trigger failed"),
  });

  const devices: Device[] = devicesData?.data ?? [];
  const cameras = camerasData ?? [];
  const storeMap = new Map((stores ?? []).map((s) => [s.id, s.name]));

  function typeLabel(t: string) {
    const map: Record<string, string> = {
      tplink: "TP-Link", mqtt: "MQTT", webhook: "Webhook",
      sign: "Sign", alarm: "Alarm", light: "Light", speaker: "Speaker", other: "Other",
    };
    return map[t] || t;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Device Control</h1>
          <p className="text-sm text-[#78716C]">{devices.length} devices (edge + cloud)</p>
        </div>
        <button onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]">
          <Plus size={16} /> Add Device
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
      ) : devices.length === 0 ? (
        <EmptyState icon={Radio} title="No devices" description="Add IoT devices from here or the Edge Management page." actionLabel="Add Device" onAction={() => setDrawerOpen(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => (
            <div key={d.id} className="rounded-lg border border-[#E7E5E0] bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio size={16} className="text-[#78716C]" />
                  <span className="font-medium text-[#1C1917]">{d.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <StatusBadge status={d.status} size="sm" />
                  <AutoOffCountdown device={d} />
                </div>
              </div>
              <p className="text-xs text-[#78716C]">
                {typeLabel(d.device_type)} &middot; {storeMap.get(d.store_id) ?? "\u2014"}
                {d.ip && ` \u00b7 ${d.ip}`}
                {d.edge_agent_id && " \u00b7 Edge"}
              </p>
              {d.last_triggered && (
                <p className="mt-1 text-[10px] text-[#78716C]">
                  Last triggered: {new Date(d.last_triggered).toLocaleString()}
                  <span className="ml-1 text-[#A8A29E]">({formatRelativeTime(d.last_triggered)})</span>
                </p>
              )}
              <p className="mt-1 text-[10px] text-[#78716C]">
                {d.trigger_on_any ? "Triggers on any camera" : `Assigned to ${d.assigned_cameras?.length ?? 0} camera(s)`}
                {d.auto_off_seconds ? ` \u00b7 Auto-off: ${d.auto_off_seconds}s` : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => toggleMutation.mutate({ id: d.id, action: d.status === "triggered" ? "off" : "on" })}
                  disabled={toggleMutation.isPending}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-white disabled:opacity-50 ${
                    d.status === "triggered" ? "bg-[#DC2626] hover:bg-red-700" : "bg-[#16A34A] hover:bg-green-700"
                  }`}>
                  <Power size={10} /> {d.status === "triggered" ? "Turn OFF" : "Turn ON"}
                </button>
                <button onClick={() => triggerMutation.mutate(d.id)}
                  disabled={triggerMutation.isPending}
                  title="Test device trigger"
                  className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-2 py-1.5 text-xs text-[#78716C] hover:bg-[#F0FDFA] disabled:opacity-50">
                  {triggerMutation.isPending && triggerMutation.variables === d.id
                    ? <Loader2 size={10} className="animate-spin" />
                    : <PlayCircle size={10} />}
                  Test
                </button>
                <button onClick={() => setHistoryTarget(d)}
                  title="Trigger history"
                  className="rounded-md border border-[#E7E5E0] px-2 py-1.5 text-xs text-[#78716C] hover:bg-[#F0FDFA]">
                  <History size={10} />
                </button>
                <button onClick={() => { setAssignTarget(d); setAssignCameras(d.assigned_cameras ?? []); setAssignTriggerAny(d.trigger_on_any ?? true); }}
                  className="rounded-md border border-[#E7E5E0] px-2 py-1.5 text-xs text-[#78716C] hover:bg-[#F0FDFA]">
                  <Link2 size={10} />
                </button>
                <button onClick={() => setDeleteTarget(d.id)}
                  className="rounded-md border border-[#E7E5E0] px-2 py-1.5 text-xs text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]">
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trigger History Modal */}
      {historyTarget && (
        <TriggerHistoryModal device={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}

      {/* Camera Assignment Modal */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[420px] rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Assign Cameras -- {assignTarget.name}</h3>
              <button onClick={() => setAssignTarget(null)} className="text-[#78716C]"><X size={16} /></button>
            </div>
            <label className="mb-3 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={assignTriggerAny} onChange={(e) => setAssignTriggerAny(e.target.checked)} className="accent-[#0D9488]" />
              Trigger on ANY camera (all cameras activate this device)
            </label>
            {!assignTriggerAny && (
              <div className="mb-3 max-h-48 overflow-y-auto rounded border border-[#E7E5E0] p-2">
                {cameras.filter((c) => c.store_id === assignTarget.store_id).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-1 text-xs">
                    <input type="checkbox" checked={assignCameras.includes(c.id)}
                      onChange={(e) => setAssignCameras(e.target.checked
                        ? [...assignCameras, c.id]
                        : assignCameras.filter((x) => x !== c.id)
                      )} className="accent-[#0D9488]" />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setAssignTarget(null)} className="rounded-md border border-[#E7E5E0] px-3 py-1.5 text-xs">Cancel</button>
              <button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}
                className="rounded-md bg-[#0D9488] px-4 py-1.5 text-xs text-white hover:bg-[#0F766E] disabled:opacity-50">
                {assignMutation.isPending ? "Saving..." : "Save Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteTarget} title="Deactivate Device"
        description="This device will be deactivated. You can reactivate it later."
        confirmLabel="Deactivate" destructive
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)} />

      {/* Create Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="h-full w-[384px] overflow-y-auto bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
              <h2 className="text-lg font-semibold text-[#1C1917]">Add Device</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-[#78716C] hover:text-[#1C1917]"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Store *</label>
                <select value={storeId} onChange={(e) => setStoreId(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="">Select store</option>
                  {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Type *</label>
                <select value={deviceType} onChange={(e) => setDeviceType(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="tplink">TP-Link Kasa Plug</option>
                  <option value="mqtt">MQTT Device</option>
                  <option value="webhook">HTTP Webhook</option>
                  <option value="sign">Wet Floor Sign</option>
                  <option value="alarm">Alarm</option>
                  <option value="light">Warning Light</option>
                  <option value="speaker">Speaker</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Control Method</label>
                <select value={controlMethod} onChange={(e) => setControlMethod(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="http">HTTP</option>
                  <option value="mqtt">MQTT</option>
                </select>
              </div>
              {controlMethod === "http" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Control URL</label>
                  <input value={controlUrl} onChange={(e) => setControlUrl(e.target.value)}
                    placeholder="http://192.168.1.50/trigger"
                    className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
                </div>
              )}
              <button onClick={() => createMutation.mutate()} disabled={!storeId || !name || createMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />} Add Device
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
