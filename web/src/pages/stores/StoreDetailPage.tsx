import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPin, Clock, Calendar, CheckCircle2, Wifi, WifiOff, Settings, FileText } from "lucide-react";

import api from "@/lib/api";
import type { Store, Camera, Incident, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import StoreDrawer from "./StoreDrawer";

const TABS = ["Overview", "Cameras", "Incidents", "Edge Agent", "Detection Overrides", "Audit Log"] as const;
type Tab = (typeof TABS)[number];

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
        <Loader2 size={24} className="animate-spin text-[#0D9488]" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[#78716C]">
        Store not found
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/stores" className="mb-2 inline-flex items-center gap-1 text-sm text-[#78716C] hover:text-[#0D9488]">
          <ArrowLeft size={14} /> Back to Stores
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#1C1917]">{store.name}</h1>
            <p className="text-sm text-[#78716C]">{store.address}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={store.is_active ? "active" : "disabled"} />
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
            >
              Edit Store
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-[#E7E5E0]">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-[#0D9488] text-[#0D9488]"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
            <h3 className="mb-4 text-base font-semibold text-[#1C1917]">Store Details</h3>
            <dl className="space-y-3">
              <div className="flex items-start gap-3">
                <MapPin size={16} className="mt-0.5 text-[#78716C]" />
                <div>
                  <dt className="text-xs font-medium text-[#78716C]">Address</dt>
                  <dd className="text-sm text-[#1C1917]">
                    {store.address}
                    {store.city && `, ${store.city}`}
                    {store.state && `, ${store.state}`}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock size={16} className="mt-0.5 text-[#78716C]" />
                <div>
                  <dt className="text-xs font-medium text-[#78716C]">Timezone</dt>
                  <dd className="text-sm text-[#1C1917]">{store.timezone}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar size={16} className="mt-0.5 text-[#78716C]" />
                <div>
                  <dt className="text-xs font-medium text-[#78716C]">Created</dt>
                  <dd className="text-sm text-[#1C1917]">
                    {new Date(store.created_at).toLocaleString()}
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
            <h3 className="mb-4 text-base font-semibold text-[#1C1917]">Country</h3>
            <p className="text-sm text-[#1C1917]">{store.country}</p>

            {Object.keys(store.settings).length > 0 && (
              <>
                <h3 className="mb-2 mt-6 text-base font-semibold text-[#1C1917]">Settings</h3>
                <pre className="overflow-auto rounded bg-[#F8F7F4] p-3 text-xs text-[#1C1917]">
                  {JSON.stringify(store.settings, null, 2)}
                </pre>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === "Cameras" && (
        <div>
          {camerasData?.data?.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0] text-sm text-[#78716C]">
              No cameras in this store yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {camerasData?.data?.map((cam) => (
                <Link
                  key={cam.id}
                  to={`/cameras/${cam.id}`}
                  className="rounded-lg border border-[#E7E5E0] bg-white p-4 hover:border-[#0D9488] transition-colors"
                >
                  {cam.snapshot_base64 ? (
                    <img
                      src={`data:image/jpeg;base64,${cam.snapshot_base64}`}
                      alt={cam.name}
                      className="mb-3 h-[180px] w-full rounded object-cover bg-gray-100"
                    />
                  ) : (
                    <div className="mb-3 flex h-[180px] items-center justify-center rounded bg-gray-100 text-xs text-[#78716C]">
                      No snapshot
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#1C1917]">{cam.name}</span>
                    <StatusBadge status={cam.status} />
                  </div>
                  <p className="mt-1 text-xs text-[#78716C]">
                    {(cam.stream_type ?? 'rtsp').toUpperCase()} &middot; {cam.floor_type ?? 'tile'} &middot; {cam.inference_mode ?? 'cloud'}
                  </p>
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
            <div className="flex h-48 items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[#0D9488]" />
            </div>
          ) : !eventsData?.data?.length ? (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0] text-sm text-[#78716C]">
              No incidents for this store yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#E7E5E0]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8F7F4] text-xs font-medium text-[#78716C]">
                  <tr>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Camera</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Detections</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E0] bg-white">
                  {eventsData.data.map((inc: Incident) => (
                    <tr key={inc.id} className="hover:bg-[#F8F7F4]">
                      <td className="px-4 py-3"><StatusBadge status={inc.severity} /></td>
                      <td className="px-4 py-3 text-[#1C1917]">{inc.camera_id}</td>
                      <td className="px-4 py-3 text-[#78716C]">{new Date(inc.start_time).toLocaleString()}</td>
                      <td className="px-4 py-3 text-[#1C1917]">{inc.detection_count}</td>
                      <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {inc.status === "new" && (
                            <button
                              onClick={() => ackMutation.mutate(inc.id)}
                              title="Acknowledge"
                              className="rounded p-1 text-[#D97706] hover:bg-[#FEF3C7]"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          )}
                          {(inc.status === "new" || inc.status === "acknowledged") && (
                            <button
                              onClick={() => resolveMutation.mutate({ eventId: inc.id, status: "resolved" })}
                              title="Resolve"
                              className="rounded p-1 text-[#16A34A] hover:bg-[#DCFCE7]"
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
          )}
        </div>
      )}

      {/* Edge Agent Tab */}
      {activeTab === "Edge Agent" && (
        <div>
          {edgeLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[#0D9488]" />
            </div>
          ) : !edgeData?.data?.length ? (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0] text-sm text-[#78716C]">
              No edge agent configured for this store.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {edgeData.data.map((agent: any) => (
                <div key={agent.id} className="rounded-lg border border-[#E7E5E0] bg-white p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {agent.status === "online" ? (
                        <Wifi size={16} className="text-[#16A34A]" />
                      ) : (
                        <WifiOff size={16} className="text-[#DC2626]" />
                      )}
                      <span className="font-medium text-[#1C1917]">{agent.name}</span>
                    </div>
                    <StatusBadge status={agent.status} />
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Model Version</dt>
                      <dd className="text-[#1C1917]">{agent.current_model_version ?? "N/A"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Agent Version</dt>
                      <dd className="text-[#1C1917]">{agent.agent_version ?? "N/A"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Last Heartbeat</dt>
                      <dd className="text-[#1C1917]">
                        {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleString() : "Never"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Cameras</dt>
                      <dd className="text-[#1C1917]">{agent.camera_count}</dd>
                    </div>
                    {agent.cpu_percent != null && (
                      <div className="flex justify-between">
                        <dt className="text-[#78716C]">CPU / RAM</dt>
                        <dd className="text-[#1C1917]">{agent.cpu_percent}% / {agent.ram_percent ?? 0}%</dd>
                      </div>
                    )}
                    {agent.inference_fps != null && (
                      <div className="flex justify-between">
                        <dt className="text-[#78716C]">Inference FPS</dt>
                        <dd className="text-[#1C1917]">{agent.inference_fps.toFixed(1)}</dd>
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
            <div className="flex h-48 items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[#0D9488]" />
            </div>
          ) : !overridesData?.data ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
              <Settings size={24} className="mb-2 text-[#78716C]" />
              <p className="text-sm text-[#78716C]">Using global defaults</p>
              <p className="mt-1 text-xs text-[#78716C]">
                No store-level detection overrides configured. Settings are inherited from organization or global defaults.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
              <h3 className="mb-4 text-base font-semibold text-[#1C1917]">Store Detection Settings</h3>
              <div className="grid gap-6 sm:grid-cols-2">
                {/* Validation Layers */}
                <div>
                  <h4 className="mb-3 text-sm font-medium text-[#78716C]">Validation Layers</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Layer 1 (Confidence)</dt>
                      <dd className="text-[#1C1917]">
                        {overridesData.data.layer1_enabled != null
                          ? overridesData.data.layer1_enabled ? `Enabled (${overridesData.data.layer1_confidence ?? "default"})` : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Layer 2 (Area)</dt>
                      <dd className="text-[#1C1917]">
                        {overridesData.data.layer2_enabled != null
                          ? overridesData.data.layer2_enabled ? `Enabled (${overridesData.data.layer2_min_area_percent ?? "default"}%)` : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Layer 3 (Voting)</dt>
                      <dd className="text-[#1C1917]">
                        {overridesData.data.layer3_enabled != null
                          ? overridesData.data.layer3_enabled ? `Enabled (${overridesData.data.layer3_voting_mode ?? "default"})` : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Layer 4 (Dry Ref)</dt>
                      <dd className="text-[#1C1917]">
                        {overridesData.data.layer4_enabled != null
                          ? overridesData.data.layer4_enabled ? "Enabled" : "Disabled"
                          : "Inherited"}
                      </dd>
                    </div>
                  </dl>
                </div>
                {/* Detection Settings */}
                <div>
                  <h4 className="mb-3 text-sm font-medium text-[#78716C]">Detection Settings</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Detection Enabled</dt>
                      <dd className="text-[#1C1917]">
                        {overridesData.data.detection_enabled != null
                          ? overridesData.data.detection_enabled ? "Yes" : "No"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Capture FPS</dt>
                      <dd className="text-[#1C1917]">{overridesData.data.capture_fps ?? "Inherited"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Detection Interval</dt>
                      <dd className="text-[#1C1917]">
                        {overridesData.data.detection_interval_seconds != null
                          ? `${overridesData.data.detection_interval_seconds}s`
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Auto Create Incident</dt>
                      <dd className="text-[#1C1917]">
                        {overridesData.data.auto_create_incident != null
                          ? overridesData.data.auto_create_incident ? "Yes" : "No"
                          : "Inherited"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#78716C]">Business Hours</dt>
                      <dd className="text-[#1C1917]">
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
              <p className="mt-4 text-xs text-[#78716C]">
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
            <div className="flex h-48 items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[#0D9488]" />
            </div>
          ) : !logsData?.data?.length ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
              <FileText size={24} className="mb-2 text-[#78716C]" />
              <p className="text-sm text-[#78716C]">No audit log entries for this store.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#E7E5E0]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8F7F4] text-xs font-medium text-[#78716C]">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E0] bg-white">
                  {logsData.data.map((log: any, idx: number) => (
                    <tr key={log.id ?? idx} className="hover:bg-[#F8F7F4]">
                      <td className="whitespace-nowrap px-4 py-3 text-[#78716C]">
                        {new Date(log.timestamp ?? log.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-[#1C1917]">{log.user_email ?? log.source ?? "System"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-[#F1F0ED] px-2 py-0.5 text-xs font-medium text-[#1C1917]">
                          {log.action ?? log.level ?? "info"}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-[#78716C]">
                        {typeof log.details === "object"
                          ? JSON.stringify(log.details ?? log.message ?? "")
                          : String(log.details ?? log.message ?? "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
