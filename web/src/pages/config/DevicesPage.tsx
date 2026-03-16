import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Radio, Trash2, Loader2, Zap, X } from "lucide-react";

import api from "@/lib/api";
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
  status: string;
  last_triggered: string | null;
  is_active: boolean;
}

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [deviceType, setDeviceType] = useState("sign");
  const [controlMethod, setControlMethod] = useState("http");
  const [controlUrl, setControlUrl] = useState("");

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", { params: { limit: 100 } });
      return res.data.data;
    },
  });

  const { data: devicesData, isLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await api.get("/devices");
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/devices", {
      store_id: storeId, name, device_type: deviceType,
      control_method: controlMethod, control_url: controlUrl || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setDrawerOpen(false);
      setName(""); setControlUrl("");
      success("Device added");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to add device");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/devices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      success("Device deleted");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to delete device");
    },
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => api.post(`/devices/${id}/trigger`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      success("Device triggered");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to trigger device");
    },
  });

  const devices = devicesData?.data ?? [];
  const storeMap = new Map((stores ?? []).map((s) => [s.id, s.name]));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1C1917]">Device Control</h1>
        <button onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]">
          <Plus size={16} /> Add Device
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
      ) : devices.length === 0 ? (
        <EmptyState icon={Radio} title="No devices" description="Add IoT devices like wet floor signs or alarms." actionLabel="Add Device" onAction={() => setDrawerOpen(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d: Device) => (
            <div key={d.id} className="rounded-lg border border-[#E7E5E0] bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio size={16} className="text-[#78716C]" />
                  <span className="font-medium text-[#1C1917]">{d.name}</span>
                </div>
                <StatusBadge status={d.status} size="sm" />
              </div>
              <p className="text-xs text-[#78716C]">
                {d.device_type} &middot; {d.control_method.toUpperCase()} &middot; {storeMap.get(d.store_id) ?? "—"}
              </p>
              {d.last_triggered && (
                <p className="mt-1 text-[10px] text-[#78716C]">Last triggered: {new Date(d.last_triggered).toLocaleString()}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button onClick={() => triggerMutation.mutate(d.id)} disabled={triggerMutation.isPending}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md bg-[#D97706] px-2 py-1.5 text-xs text-white hover:bg-amber-700 disabled:opacity-50">
                  <Zap size={10} /> Trigger
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Device"
        description="This device will be permanently deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />

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
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Store *</label>
                <select value={storeId} onChange={(e) => setStoreId(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="">Select store</option>
                  {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Type *</label>
                <select value={deviceType} onChange={(e) => setDeviceType(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="sign">Wet Floor Sign</option>
                  <option value="alarm">Alarm</option>
                  <option value="light">Light</option>
                  <option value="speaker">Speaker</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Control Method</label>
                <select value={controlMethod} onChange={(e) => setControlMethod(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="http">HTTP</option>
                  <option value="mqtt">MQTT</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Control URL</label>
                <input value={controlUrl} onChange={(e) => setControlUrl(e.target.value)}
                  placeholder="http://192.168.1.50/trigger"
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <button onClick={() => createMutation.mutate()} disabled={!storeId || !name || createMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Add Device
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
