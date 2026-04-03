import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Radio, Trash2, Loader2, Zap, X, Power, Link2, Clock, History, PlayCircle, Lightbulb, Globe } from "lucide-react";

import api from "@/lib/api";
import { INTERVALS } from "@/constants";
import type { Store, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import HelpSection from "@/components/ui/HelpSection";
import { PAGE_HELP } from "@/constants/help";

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

const DEVICE_TYPE_ICON: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  tplink: { icon: Lightbulb, color: "text-amber-600", bg: "bg-amber-50" },
  mqtt: { icon: Radio, color: "text-purple-600", bg: "bg-purple-50" },
  webhook: { icon: Globe, color: "text-blue-600", bg: "bg-blue-50" },
  light: { icon: Lightbulb, color: "text-yellow-600", bg: "bg-yellow-50" },
  alarm: { icon: Radio, color: "text-red-600", bg: "bg-red-50" },
  speaker: { icon: Radio, color: "text-indigo-600", bg: "bg-indigo-50" },
  sign: { icon: Globe, color: "text-green-600", bg: "bg-green-50" },
  other: { icon: Radio, color: "text-gray-600", bg: "bg-gray-50" },
};

/* -- Auto-off countdown hook -- */
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

/* -- Countdown display component -- */
function AutoOffCountdown({ device }: { device: Device }) {
  const countdown = useCountdown(device);
  if (!countdown) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
      <Clock size={10} /> Auto-off in {countdown}
    </span>
  );
}

/* -- Trigger History Modal -- */
function TriggerHistoryModal({ device, onClose }: { device: Device; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["device-detail", device.id],
    queryFn: async () => {
      const res = await api.get(`/devices/${device.id}`);
      return res.data.data as Device;
    },
  });

  const detail = data ?? device;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Trigger History -- {detail.name}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X size={16} /></button>
        </div>

        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-[#0D9488]" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Current Status</span>
                <StatusBadge status={detail.status} size="sm" />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-500">Type:</span>{" "}
                  <span className="font-medium text-gray-900">{detail.device_type}</span>
                </div>
                <div>
                  <span className="text-gray-500">Control:</span>{" "}
                  <span className="font-medium text-gray-900">{detail.control_method}</span>
                </div>
                {detail.auto_off_seconds && (
                  <div>
                    <span className="text-gray-500">Auto-off:</span>{" "}
                    <span className="font-medium text-gray-900">{detail.auto_off_seconds}s</span>
                  </div>
                )}
                {detail.ip && (
                  <div>
                    <span className="text-gray-500">IP:</span>{" "}
                    <span className="font-medium text-gray-900">{detail.ip}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <span className="mb-2 block text-xs font-medium text-gray-500">Last Trigger Event</span>
              {detail.last_triggered ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap size={12} className="text-amber-500" />
                    <span className="text-sm font-medium text-gray-900">
                      {new Date(detail.last_triggered).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500">
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
                <p className="text-xs text-gray-400">This device has never been triggered.</p>
              )}
            </div>

            <p className="text-[10px] text-gray-400">
              Full trigger history with latency and incident links requires a dedicated history endpoint.
              Showing latest trigger state from the device record.
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
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

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setName("");
    setControlUrl("");
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen, closeDrawer]);

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
      closeDrawer();
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
      tplink: "TP-Link Kasa", mqtt: "MQTT", webhook: "Webhook",
      sign: "Sign", alarm: "Alarm", light: "Light", speaker: "Speaker", other: "Other",
    };
    return map[t] || t;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IoT Devices</h1>
          <p className="mt-1 text-sm text-gray-500">{devices.length} device{devices.length !== 1 ? "s" : ""} · Warning signs, alarms, smart plugs (TP-Link, MQTT, Webhook)</p>
        <HelpSection title={PAGE_HELP.devices.title}>
          {PAGE_HELP.devices.content.map((line, i) => <p key={i}>{line}</p>)}
        </HelpSection>
        </div>
        <button onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0F766E]">
          <Plus size={16} /> Add Device
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-48 rounded bg-gray-200" />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <div className="h-8 flex-1 rounded-lg bg-gray-200" />
                <div className="h-8 w-16 rounded-lg bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      ) : devices.length === 0 ? (
        <EmptyState icon={Radio} title="No devices" description="Add IoT devices from here or the Edge Management page." actionLabel="Add Device" onAction={() => setDrawerOpen(true)} />
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const dtCfg = (DEVICE_TYPE_ICON[d.device_type] ?? DEVICE_TYPE_ICON.other) as { icon: React.ElementType; color: string; bg: string };
            const DevIcon = dtCfg.icon;
            return (
              <div key={d.id} className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${dtCfg.bg}`}>
                      <DevIcon size={18} className={dtCfg.color} />
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900">{d.name}</span>
                      <p className="text-xs text-gray-500">{typeLabel(d.device_type)}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      d.status === "triggered" ? "bg-amber-50 text-amber-700" :
                      d.status === "online" || d.status === "idle" ? "bg-green-50 text-green-700" :
                      d.status === "offline" ? "bg-red-50 text-red-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        d.status === "triggered" ? "bg-amber-500 animate-pulse" :
                        d.status === "online" || d.status === "idle" ? "bg-green-500" :
                        d.status === "offline" ? "bg-red-500" :
                        "bg-gray-400"
                      }`} />
                      {d.status}
                    </span>
                    <AutoOffCountdown device={d} />
                  </div>
                </div>

                <div className="mb-3 space-y-1 text-xs text-gray-500">
                  <p>{storeMap.get(d.store_id) ?? "\u2014"}{d.ip && ` \u00b7 ${d.ip}`}{d.edge_agent_id && " \u00b7 Edge"}</p>
                  {d.last_triggered && (
                    <p>
                      Last triggered: {new Date(d.last_triggered).toLocaleString()}
                      <span className="ml-1 text-gray-400">({formatRelativeTime(d.last_triggered)})</span>
                    </p>
                  )}
                  <p>
                    {d.trigger_on_any ? "Triggers on any camera" : `Assigned to ${d.assigned_cameras?.length ?? 0} camera(s)`}
                    {d.auto_off_seconds ? ` \u00b7 Auto-off: ${d.auto_off_seconds}s` : ""}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => toggleMutation.mutate({ id: d.id, action: d.status === "triggered" ? "off" : "on" })}
                    disabled={toggleMutation.isPending}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
                      d.status === "triggered" ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
                    }`}>
                    <Power size={12} /> {d.status === "triggered" ? "Turn OFF" : "Turn ON"}
                  </button>
                  <button onClick={() => triggerMutation.mutate(d.id)}
                    disabled={triggerMutation.isPending}
                    title="Test trigger"
                    className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-600 transition-colors hover:bg-teal-50 hover:text-[#0D9488] disabled:opacity-50">
                    {triggerMutation.isPending && triggerMutation.variables === d.id
                      ? <Loader2 size={12} className="animate-spin" />
                      : <PlayCircle size={12} />}
                    Test
                  </button>
                  <button onClick={() => setHistoryTarget(d)}
                    title="Trigger history"
                    className="rounded-lg border border-gray-200 p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600">
                    <History size={12} />
                  </button>
                  <button onClick={() => { setAssignTarget(d); setAssignCameras(d.assigned_cameras ?? []); setAssignTriggerAny(d.trigger_on_any ?? true); }}
                    title="Assign cameras"
                    className="rounded-lg border border-gray-200 p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600">
                    <Link2 size={12} />
                  </button>
                  <button onClick={() => setDeleteTarget(d.id)}
                    title="Deactivate"
                    className="rounded-lg border border-gray-200 p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trigger History Modal */}
      {historyTarget && (
        <TriggerHistoryModal device={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}

      {/* Camera Assignment Modal */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Assign Cameras -- {assignTarget.name}</h3>
              <button onClick={() => setAssignTarget(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
            </div>
            <label className="mb-3 flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={assignTriggerAny} onChange={(e) => setAssignTriggerAny(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#0D9488] accent-[#0D9488]" />
              Trigger on ANY camera (all cameras activate this device)
            </label>
            {!assignTriggerAny && (
              <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-3">
                {cameras.filter((c) => c.store_id === assignTarget.store_id).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-1.5 text-sm text-gray-600">
                    <input type="checkbox" checked={assignCameras.includes(c.id)}
                      onChange={(e) => setAssignCameras(e.target.checked
                        ? [...assignCameras, c.id]
                        : assignCameras.filter((x) => x !== c.id)
                      )} className="h-4 w-4 rounded border-gray-300 text-[#0D9488] accent-[#0D9488]" />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setAssignTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}
                className="rounded-lg bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
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
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-md overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Add Device</h2>
              <button onClick={closeDrawer} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-5 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Store <span className="text-red-500">*</span></label>
                <select value={storeId} onChange={(e) => setStoreId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20">
                  <option value="">Select store</option>
                  {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aisle 3 Warning Light"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Type <span className="text-red-500">*</span></label>
                <select value={deviceType} onChange={(e) => setDeviceType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20">
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
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Control Method</label>
                <select value={controlMethod} onChange={(e) => setControlMethod(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20">
                  <option value="http">HTTP</option>
                  <option value="mqtt">MQTT</option>
                </select>
              </div>
              {controlMethod === "http" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Control URL</label>
                  <input value={controlUrl} onChange={(e) => setControlUrl(e.target.value)}
                    placeholder="http://192.168.1.50/trigger"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20" />
                </div>
              )}
              <button onClick={() => createMutation.mutate()} disabled={!storeId || !name || createMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0D9488] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0F766E] disabled:cursor-not-allowed disabled:opacity-50">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />} Add Device
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
