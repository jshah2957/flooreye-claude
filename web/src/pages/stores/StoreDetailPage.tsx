import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPin, Clock, Calendar, CheckCircle2, Wifi, WifiOff, Settings, FileText, Pencil, Building2, Globe } from "lucide-react";

import api from "@/lib/api";
import type { Store, Camera, Incident, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import StoreDrawer from "./StoreDrawer";

const TABS = ["Overview", "Cameras", "Incidents", "Edge Agent", "Detection Overrides", "Audit Log"] as const;
type Tab = (typeof TABS)[number];

function DetailField({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon size={15} className="mt-0.5 shrink-0 text-gray-400" />}
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
        <dd className="mt-0.5 text-sm text-gray-900">{value || "--"}</dd>
      </div>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-4 animate-pulse rounded bg-gray-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-4 animate-pulse rounded bg-gray-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const { data: store, isLoading } = useQuery({
    queryKey: ["store", id],
    queryFn: async () => {
      const res = await api.get<{ data: Store }>(`/stores/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const { data: camerasData } = useQuery({
    queryKey: ["cameras", { store_id: id }],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Camera>>("/cameras", {
        params: { store_id: id, limit: 100 },
      });
      return res.data;
    },
    enabled: !!id && activeTab === "Cameras",
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ["store-incidents", id],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Incident>>("/events", {
        params: { store_id: id, limit: 10 },
      });
      return res.data;
    },
    enabled: !!id && activeTab === "Incidents",
  });

  const { data: edgeData, isLoading: edgeLoading } = useQuery({
    queryKey: ["store-edge-agents", id],
    queryFn: async () => {
      const res = await api.get<{ data: any[]; meta: any }>("/edge/agents", {
        params: { store_id: id },
      });
      return res.data;
    },
    enabled: !!id && activeTab === "Edge Agent",
  });

  const { data: overridesData, isLoading: overridesLoading } = useQuery({
    queryKey: ["store-detection-overrides", id],
    queryFn: async () => {
      const res = await api.get<{ data: any }>("/detection-control/settings", {
        params: { scope: "store", scope_id: id },
      });
      return res.data;
    },
    enabled: !!id && activeTab === "Detection Overrides",
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["store-audit-logs", id],
    queryFn: async () => {
      const res = await api.get<{ data: any[]; meta: any }>("/logs", {
        params: { source: `store:${id}`, limit: 20 },
      });
      return res.data;
    },
    enabled: !!id && activeTab === "Audit Log",
  });

  const ackMutation = useMutation({
    mutationFn: (eventId: string) => api.put(`/events/${eventId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-incidents", id] });
      success("Incident acknowledged");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to acknowledge");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: string }) =>
      api.put(`/events/${eventId}/resolve`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-incidents", id] });
      success("Incident resolved");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to resolve");
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-[#0D9488]" />
          <p className="text-sm text-gray-400">Loading store details...</p>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <Building2 size={40} className="mb-3 text-gray-300" />
        <p className="text-sm font-medium text-gray-500">Store not found</p>
        <Link to="/stores" className="mt-2 text-sm text-[#0D9488] hover:underline">Back to Stores</Link>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-120px)]">
      {/* Breadcrumbs */}
      <nav className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Link to="/stores" className="flex items-center gap-1 transition-colors hover:text-[#0D9488]">
          <ArrowLeft size={14} />
          Stores
        </Link>
        <span>/</span>
        <span className="font-medium text-gray-700">{store.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
          <StatusBadge status={store.is_active ? "active" : "disabled"} />
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
        >
          <Pencil size={14} />
          Edit Store
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 -mx-1 overflow-x-auto scrollbar-none">
        <div className="flex min-w-max gap-0.5 border-b border-gray-200 px-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-[#0D9488]"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#0D9488]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "Overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Store Info Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
              <Building2 size={14} />
              Store Information
            </h3>
            <dl className="divide-y divide-gray-100">
              <DetailField label="Address" value={store.address} icon={MapPin} />
              <DetailField
                label="City / State"
                value={[store.city, store.state].filter(Boolean).join(", ")}
                icon={MapPin}
              />
              <DetailField label="Timezone" value={store.timezone} icon={Clock} />
              <DetailField
                label="Created"
                value={new Date(store.created_at).toLocaleString()}
                icon={Calendar}
              />
            </dl>
          </div>

          {/* Country & Settings Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
              <Globe size={14} />
              Location & Settings
            </h3>
            <dl className="divide-y divide-gray-100">
              <DetailField label="Country" value={store.country} icon={Globe} />
              <DetailField
                label="Status"
                value={<StatusBadge status={store.is_active ? "active" : "disabled"} />}
              />
            </dl>

            {Object.keys(store.settings).length > 0 && (
              <div className="mt-5 border-t border-gray-100 pt-5">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Custom Settings
                </h4>
                <div className="rounded-lg bg-gray-50 p-4">
                  <dl className="space-y-2 text-sm">
                    {Object.entries(store.settings).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between">
                        <dt className="text-gray-500">{key}</dt>
                        <dd className="font-mono text-xs text-gray-900">{String(val)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "Cameras" && (
        <div>
          {camerasData?.data?.length === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50">
              <div className="mb-3 rounded-full bg-gray-100 p-3">
                <Building2 size={24} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">No cameras in this store yet</p>
              <p className="mt-1 text-xs text-gray-400">Add a camera to start monitoring</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {camerasData?.data?.map((cam) => (
                <Link
                  key={cam.id}
                  to={`/cameras/${cam.id}`}
                  className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-[#0D9488]/40 hover:shadow-md"
                >
                  {cam.snapshot_base64 ? (
                    <img
                      src={`data:image/jpeg;base64,${cam.snapshot_base64}`}
                      alt={cam.name}
                      className="h-44 w-full object-cover bg-gray-100"
                    />
                  ) : (
                    <div className="flex h-44 items-center justify-center bg-gray-100 text-xs text-gray-400">
                      No snapshot
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900 group-hover:text-[#0D9488]">{cam.name}</span>
                      <StatusBadge status={cam.status} />
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {(cam.stream_type ?? 'rtsp').toUpperCase()} &middot; {cam.floor_type ?? 'tile'} &middot; {cam.inference_mode ?? 'cloud'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Incidents Tab */}
      {activeTab === "Incidents" && (
        <div>
          {eventsLoading ? (
            <div className="flex h-52 items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[#0D9488]" />
            </div>
          ) : !eventsData?.data?.length ? (
            <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50">
              <div className="mb-3 rounded-full bg-gray-100 p-3">
                <CheckCircle2 size={24} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">No incidents for this store</p>
              <p className="mt-1 text-xs text-gray-400">All clear!</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50/80">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Severity</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Camera</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Time</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Detections</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {eventsData.data.map((inc: Incident) => (
                      <tr key={inc.id} className="transition-colors hover:bg-gray-50/70">
                        <td className="px-4 py-3 sm:px-6"><StatusBadge status={inc.severity} /></td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 sm:px-6">{inc.camera_id}</td>
                        <td className="px-4 py-3 text-gray-500 sm:px-6">{new Date(inc.start_time).toLocaleString()}</td>
                        <td className="px-4 py-3 sm:px-6">
                          <span className="inline-flex items-center justify-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                            {inc.detection_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 sm:px-6"><StatusBadge status={inc.status} /></td>
                        <td className="px-4 py-3 sm:px-6">
                          <div className="flex items-center gap-1">
                            {inc.status === "new" && (
                              <button
                                onClick={() => ackMutation.mutate(inc.id)}
                                title="Acknowledge"
                                className="rounded-lg p-1.5 text-amber-500 transition-colors hover:bg-amber-50"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                            {(inc.status === "new" || inc.status === "acknowledged") && (
                              <button
                                onClick={() => resolveMutation.mutate({ eventId: inc.id, status: "resolved" })}
                                title="Resolve"
                                className="rounded-lg p-1.5 text-green-500 transition-colors hover:bg-green-50"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edge Agent Tab */}
      {activeTab === "Edge Agent" && (
        <div>
          {edgeLoading ? (
            <TabSkeleton />
          ) : !edgeData?.data?.length ? (
            <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50">
              <div className="mb-3 rounded-full bg-gray-100 p-3">
                <WifiOff size={24} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">No edge agent configured</p>
              <p className="mt-1 text-xs text-gray-400">Set up an edge agent for local processing</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {edgeData.data.map((agent: any) => (
                <div key={agent.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {agent.status === "online" ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
                          <Wifi size={16} className="text-green-500" />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
                          <WifiOff size={16} className="text-red-500" />
                        </div>
                      )}
                      <span className="font-semibold text-gray-900">{agent.name}</span>
                    </div>
                    <StatusBadge status={agent.status} />
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Model Version</dt>
                      <dd className="font-medium text-gray-900">{agent.current_model_version ?? "N/A"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Agent Version</dt>
                      <dd className="font-medium text-gray-900">{agent.agent_version ?? "N/A"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Last Heartbeat</dt>
                      <dd className="font-medium text-gray-900">
                        {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleString() : "Never"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Cameras</dt>
                      <dd className="font-medium text-gray-900">{agent.camera_count}</dd>
                    </div>
                    {agent.cpu_percent != null && (
                      <div className="flex justify-between">
                        <dt className="text-gray-400">CPU / RAM</dt>
                        <dd className="font-medium text-gray-900">{agent.cpu_percent}% / {agent.ram_percent ?? 0}%</dd>
                      </div>
                    )}
                    {agent.inference_fps != null && (
                      <div className="flex justify-between">
                        <dt className="text-gray-400">Inference FPS</dt>
                        <dd className="font-medium text-gray-900">{agent.inference_fps.toFixed(1)}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detection Overrides Tab */}
      {activeTab === "Detection Overrides" && (
        <div>
          {overridesLoading ? (
            <TabSkeleton />
          ) : !overridesData?.data ? (
            <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50">
              <div className="mb-3 rounded-full bg-gray-100 p-3">
                <Settings size={24} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">Using global defaults</p>
              <p className="mt-1 max-w-sm text-center text-xs text-gray-400">
                No store-level detection overrides configured. Settings are inherited from organization or global defaults.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-400">Store Detection Settings</h3>
              <div className="grid gap-8 sm:grid-cols-2">
                {/* Validation Layers */}
                <div>
                  <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Validation Layers</h4>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Layer 1 (Confidence)</dt>
                      <dd className="font-medium text-gray-900">
                        {overridesData.data.layer1_enabled != null
                          ? overridesData.data.layer1_enabled ? `Enabled (${overridesData.data.layer1_confidence ?? "default"})` : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Layer 2 (Area)</dt>
                      <dd className="font-medium text-gray-900">
                        {overridesData.data.layer2_enabled != null
                          ? overridesData.data.layer2_enabled ? `Enabled (${overridesData.data.layer2_min_area_percent ?? "default"}%)` : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Layer 3 (Voting)</dt>
                      <dd className="font-medium text-gray-900">
                        {overridesData.data.layer3_enabled != null
                          ? overridesData.data.layer3_enabled ? `Enabled (${overridesData.data.layer3_voting_mode ?? "default"})` : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Layer 4 (Dry Ref)</dt>
                      <dd className="font-medium text-gray-900">
                        {overridesData.data.layer4_enabled != null
                          ? overridesData.data.layer4_enabled ? "Enabled" : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                  </dl>
                </div>
                {/* Detection Settings */}
                <div>
                  <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Detection Settings</h4>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Detection Enabled</dt>
                      <dd className="font-medium text-gray-900">
                        {overridesData.data.detection_enabled != null
                          ? overridesData.data.detection_enabled ? "Yes" : "No"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Capture FPS</dt>
                      <dd className="font-medium text-gray-900">{overridesData.data.capture_fps ?? "Inherited"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Detection Interval</dt>
                      <dd className="font-medium text-gray-900">
                        {overridesData.data.detection_interval_seconds != null
                          ? `${overridesData.data.detection_interval_seconds}s`
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Auto Create Incident</dt>
                      <dd className="font-medium text-gray-900">
                        {overridesData.data.auto_create_incident != null
                          ? overridesData.data.auto_create_incident ? "Yes" : "No"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Business Hours</dt>
                      <dd className="font-medium text-gray-900">
                        {overridesData.data.business_hours_enabled != null
                          ? overridesData.data.business_hours_enabled
                            ? `${overridesData.data.business_hours_start ?? "?"} - ${overridesData.data.business_hours_end ?? "?"}`
                            : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <p className="mt-5 border-t border-gray-100 pt-4 text-xs text-gray-400">
                Last updated: {new Date(overridesData.data.updated_at).toLocaleString()} by {overridesData.data.updated_by}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === "Audit Log" && (
        <div>
          {logsLoading ? (
            <TabSkeleton />
          ) : !logsData?.data?.length ? (
            <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50">
              <div className="mb-3 rounded-full bg-gray-100 p-3">
                <FileText size={24} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">No audit log entries</p>
              <p className="mt-1 text-xs text-gray-400">Activity will appear here</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50/80">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Timestamp</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">User</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Action</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {logsData.data.map((log: any, idx: number) => (
                      <tr key={log.id ?? idx} className="transition-colors hover:bg-gray-50/70">
                        <td className="whitespace-nowrap px-4 py-3 text-gray-500 sm:px-6">
                          {new Date(log.timestamp ?? log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 sm:px-6">{log.user_email ?? log.source ?? "System"}</td>
                        <td className="px-4 py-3 sm:px-6">
                          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                            {log.action ?? log.level ?? "info"}
                          </span>
                        </td>
                        <td className="max-w-xs truncate px-4 py-3 text-gray-500 sm:px-6">
                          {typeof log.details === "object"
                            ? JSON.stringify(log.details ?? log.message ?? "")
                            : String(log.details ?? log.message ?? "")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Drawer */}
      <StoreDrawer
        open={drawerOpen}
        store={store}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
