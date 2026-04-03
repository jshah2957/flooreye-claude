import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import HelpSection from "@/components/ui/HelpSection";
import { PAGE_HELP } from "@/constants/help";
import {
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  Volume2,
  VolumeX,
  ArrowUp,
  Wifi,
  WifiOff,
  ArrowDownAZ,
  Save,
  Smartphone,
  Clock,
  Activity,
  Shield,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import api from "@/lib/api";
import { PAGE_SIZES, ALERT_SOUND, SEVERITY_BORDER_CLASSES } from "@/constants";
import type { Incident, Detection, Store, Camera, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useWebSocket } from "@/hooks/useWebSocket";

const SOUND_PREF_KEY = "flooreye_incident_sound_enabled";

type SortOption = "newest" | "severity" | "detections";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest First" },
  { value: "severity", label: "Severity (High\u2192Low)" },
  { value: "detections", label: "Most Detections" },
];

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const SEVERITY_BAR_COLORS: Record<string, string> = {
  critical: "bg-[#DC2626]",
  high: "bg-[#F97316]",
  medium: "bg-[#EAB308]",
  low: "bg-[#22C55E]",
};

function getStoredSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_PREF_KEY) === "true";
  } catch {
    return false;
  }
}

function playAlertBeep() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.value = ALERT_SOUND.FREQUENCY;
    gain.gain.setValueAtTime(ALERT_SOUND.GAIN, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ALERT_SOUND.DURATION);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + ALERT_SOUND.DURATION);
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Web Audio API not available — silently ignore
  }
}

interface WsIncidentMessage {
  type: "incident_created" | "incident_updated";
  incident: Incident;
}

function sortIncidents(incidents: Incident[], sort: SortOption): Incident[] {
  const sorted = [...incidents];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    case "severity":
      return sorted.sort((a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0));
    case "detections":
      return sorted.sort((a, b) => b.detection_count - a.detection_count);
    default:
      return sorted;
  }
}

export default function IncidentsPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [cameraFilter, setCameraFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [selected, setSelected] = useState<Incident | null>(null);
  const limit = PAGE_SIZES.INCIDENTS;

  // --- Sound toggle ---
  const [soundEnabled, setSoundEnabled] = useState(getStoredSoundPref);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem(SOUND_PREF_KEY, String(next));
    } catch {
      // localStorage unavailable
    }
  }

  // --- New-incidents banner ---
  const [newIncidentCount, setNewIncidentCount] = useState(0);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const tableRef = useRef<HTMLDivElement>(null);

  const clearBanner = useCallback(() => {
    setNewIncidentCount(0);
    queryClient.invalidateQueries({ queryKey: ["incidents"] });
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [queryClient]);

  // --- WebSocket ---
  const { connected } = useWebSocket({
    url: "/ws/incidents",
    onMessage: useCallback(
      (raw: unknown) => {
        const msg = raw as WsIncidentMessage;
        if (!msg || !msg.type) return;

        if (msg.type === "incident_created") {
          // Play sound for critical/high severity
          if (
            soundEnabled &&
            (msg.incident.severity === "critical" || msg.incident.severity === "high")
          ) {
            playAlertBeep();
          }

          // If user is on first page with no filters, prepend for instant UI
          if (page === 0 && !statusFilter && !severityFilter && !storeFilter) {
            queryClient.setQueryData<PaginatedResponse<Incident>>(
              ["incidents", page, statusFilter, severityFilter, storeFilter],
              (old) => {
                if (!old) return old;
                const exists = old.data.some((i) => i.id === msg.incident.id);
                if (exists) return old;
                return {
                  ...old,
                  data: [msg.incident, ...old.data.slice(0, limit - 1)],
                  meta: { ...old.meta, total: (old.meta?.total ?? 0) + 1 },
                };
              },
            );
            // Flash animation on the new row
            setFlashIds((prev) => new Set(prev).add(msg.incident.id));
            setTimeout(() => {
              setFlashIds((prev) => {
                const next = new Set(prev);
                next.delete(msg.incident.id);
                return next;
              });
            }, 2000);
          } else {
            // User is on a different page or has filters — show banner
            setNewIncidentCount((c) => c + 1);
          }
        }

        if (msg.type === "incident_updated") {
          // Update in-place in React Query cache
          queryClient.setQueriesData<PaginatedResponse<Incident>>(
            { queryKey: ["incidents"] },
            (old) => {
              if (!old) return old;
              const idx = old.data.findIndex((i) => i.id === msg.incident.id);
              if (idx === -1) return old;
              const updated = [...old.data];
              updated[idx] = { ...updated[idx], ...msg.incident };
              return { ...old, data: updated };
            },
          );
          // Also update the selected detail panel if it's the same incident
          setSelected((prev) =>
            prev && prev.id === msg.incident.id ? { ...prev, ...msg.incident } : prev,
          );
        }
      },
      [soundEnabled, page, statusFilter, severityFilter, storeFilter, queryClient],
    ),
  });

  // Clear flash IDs on unmount
  useEffect(() => {
    return () => setFlashIds(new Set());
  }, []);

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", { params: { limit: 100 } });
      return res.data.data;
    },
  });

  const { data: cameras } = useQuery({
    queryKey: ["cameras-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Camera>>("/cameras", {
        params: { limit: 100 },
      });
      return res.data.data;
    },
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["incidents", page, statusFilter, severityFilter, storeFilter, cameraFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, unknown> = { offset: page * limit, limit };
      if (statusFilter) params.status = statusFilter;
      if (severityFilter) params.severity = severityFilter;
      if (storeFilter) params.store_id = storeFilter;
      if (cameraFilter) params.camera_id = cameraFilter;
      if (dateFrom) params.date_from = new Date(dateFrom + "T00:00:00").toISOString();
      if (dateTo) params.date_to = new Date(dateTo + "T23:59:59").toISOString();
      const res = await api.get<PaginatedResponse<Incident>>("/events", { params });
      return res.data;
    },
    refetchInterval: 30000, // Polling fallback for WebSocket disconnects
  });

  const ackMutation = useMutation({
    mutationFn: (id: string) => api.put(`/events/${id}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setSelected(null);
      success("Incident acknowledged");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to acknowledge incident");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/events/${id}/resolve`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setSelected(null);
      success("Incident resolved");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to resolve incident");
    },
  });

  const rawIncidents = data?.data ?? [];
  const incidents = sortIncidents(rawIncidents, sortBy);
  const total = data?.meta?.total ?? 0;
  const cameraMap = new Map((cameras ?? []).map((c) => [c.id, c.name]));
  const storeMap = new Map((stores ?? []).map((s) => [s.id, s.name]));

  function duration(inc: Incident) {
    const start = new Date(inc.start_time);
    const end = inc.end_time ? new Date(inc.end_time) : new Date();
    const mins = Math.round((end.getTime() - start.getTime()) / 60000);
    if (inc.status === "resolved" || inc.status === "false_positive")
      return `Resolved in ${mins}m`;
    return `${mins}m open`;
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incident Management</h1>
          <p className="mt-1 text-sm text-gray-500">{total} incidents · Lifecycle: NEW → ACKNOWLEDGED → RESOLVED · Auto-refreshes</p>
          <HelpSection title={PAGE_HELP.incidents.title}>
            {PAGE_HELP.incidents.content.map((line, i) => <p key={i}>{line}</p>)}
          </HelpSection>
        </div>
        <div className="flex items-center gap-3">
          {/* WebSocket status */}
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            title={connected ? "Live updates connected" : "Live updates disconnected"}
          >
            {connected ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                </span>
                <span className="text-green-600">Live</span>
              </>
            ) : (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="text-red-500">Disconnected</span>
              </>
            )}
          </span>

          {/* Sound toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? "Mute alert sound" : "Enable alert sound"}
            className={`rounded-lg border p-2.5 transition-colors ${
              soundEnabled
                ? "border-[#0D9488] bg-teal-50 text-[#0D9488]"
                : "border-gray-200 bg-white text-gray-400 hover:bg-gray-50"
            }`}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </div>

      {/* New incidents banner */}
      {newIncidentCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
            <ArrowUp size={14} />
            {newIncidentCount} new incident{newIncidentCount > 1 ? "s" : ""}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={clearBanner}
              className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
            >
              Click to refresh
            </button>
            <button
              onClick={() => setNewIncidentCount(0)}
              className="rounded p-0.5 text-blue-400 hover:bg-blue-100 hover:text-blue-600"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
        >
          <option value="">All Status</option>
          <option value="new">New</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>

        <select
          value={severityFilter}
          onChange={(e) => { setSeverityFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
        >
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={storeFilter}
          onChange={(e) => { setStoreFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
        >
          <option value="">All Stores</option>
          {(stores ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={cameraFilter}
          onChange={(e) => { setCameraFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
        >
          <option value="">All Cameras</option>
          {(cameras ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]" />
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]" />

        <div className="flex-1" />

        {/* Sort dropdown */}
        <div className="flex items-center gap-2">
          <ArrowDownAZ size={14} className="text-gray-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load incidents. Please try again.
        </div>
      )}

      {/* Main content area with side panel */}
      <div className="flex gap-0 lg:gap-6">
        {/* Table area */}
        <div className={`min-w-0 flex-1 ${selected ? "hidden lg:block" : ""}`}>
          {isLoading ? (
            /* Loading Skeleton */
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3">
                <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b border-gray-50 px-4 py-4">
                  <div className="h-6 w-16 animate-pulse rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
                  </div>
                  <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
                  <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
                  <div className="h-6 w-20 animate-pulse rounded-full bg-gray-200" />
                </div>
              ))}
            </div>
          ) : incidents.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                <Shield size={28} className="text-green-500" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">No incidents</h3>
              <p className="mt-1 text-sm text-green-600 font-medium">All clear</p>
              <p className="mt-1 text-sm text-gray-500">Adjust filters or wait for new detections.</p>
            </div>
          ) : (
            /* Incident Table */
            <div ref={tableRef} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="hidden px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Frame</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Severity</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Store / Camera</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">Detected</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">Duration</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">Confidence</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">Wet Area</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">Detections</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {incidents.map((inc) => (
                    <tr
                      key={inc.id}
                      onClick={() => setSelected(inc)}
                      className={`relative cursor-pointer transition-colors hover:bg-gray-50 ${
                        flashIds.has(inc.id) ? "animate-flash-row" : ""
                      } ${selected?.id === inc.id ? "bg-teal-50/50" : ""}`}
                    >
                      {/* Frame thumbnail */}
                      <td className="hidden px-3 py-2 sm:table-cell">
                        {inc.annotated_frame_url ? (
                          <img
                            src={inc.annotated_frame_url}
                            alt="Detection frame"
                            className="h-12 w-20 rounded object-cover bg-gray-100"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-12 w-20 items-center justify-center rounded bg-gray-100 text-gray-300">
                            <Eye size={14} />
                          </div>
                        )}
                      </td>
                      {/* Severity bar */}
                      <td className="relative px-4 py-3.5">
                        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l ${SEVERITY_BAR_COLORS[inc.severity] ?? SEVERITY_BAR_COLORS.medium}`} />
                        <StatusBadge status={inc.severity} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-gray-900">{storeMap.get(inc.store_id) ?? "---"}</div>
                        <div className="text-xs text-gray-500">{cameraMap.get(inc.camera_id) ?? "---"}</div>
                      </td>
                      <td className="hidden px-4 py-3.5 text-gray-500 md:table-cell">
                        {new Date(inc.start_time).toLocaleString()}
                      </td>
                      <td className="hidden px-4 py-3.5 text-gray-500 lg:table-cell">{duration(inc)}</td>
                      <td className="hidden px-4 py-3.5 font-semibold text-gray-900 md:table-cell">
                        {(inc.max_confidence * 100).toFixed(0)}%
                      </td>
                      <td className="hidden px-4 py-3.5 text-gray-500 lg:table-cell">
                        {inc.max_wet_area_percent.toFixed(1)}%
                      </td>
                      <td className="hidden px-4 py-3.5 text-gray-500 md:table-cell">{inc.detection_count}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={inc.status} />
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {inc.status === "new" && (
                            <button
                              onClick={() => ackMutation.mutate(inc.id)}
                              title="Acknowledge"
                              className="rounded-md px-2.5 py-1 text-xs font-medium text-[#0D9488] transition-colors hover:bg-teal-50"
                            >
                              Ack
                            </button>
                          )}
                          {(inc.status === "new" || inc.status === "acknowledged") && (
                            <>
                              <button
                                onClick={() => resolveMutation.mutate({ id: inc.id, status: "resolved" })}
                                title="Resolve"
                                className="rounded-md px-2.5 py-1 text-xs font-medium text-green-600 transition-colors hover:bg-green-50"
                              >
                                Resolve
                              </button>
                              <button
                                onClick={() => resolveMutation.mutate({ id: inc.id, status: "false_positive" })}
                                title="False Positive"
                                className="rounded-md px-2.5 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50"
                              >
                                FP
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <span className="text-sm text-gray-500">
                Showing {page * limit + 1}&ndash;{Math.min((page + 1) * limit, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  disabled={(page + 1) * limit >= total}
                  onClick={() => setPage(page + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Detail Side Panel */}
        {selected && (
          <IncidentDetail
            incident={selected}
            cameraName={cameraMap.get(selected.camera_id) ?? "Unknown"}
            storeName={storeMap.get(selected.store_id) ?? "Unknown"}
            onClose={() => setSelected(null)}
            onAcknowledge={() => ackMutation.mutate(selected.id)}
            onResolve={(s) => resolveMutation.mutate({ id: selected.id, status: s })}
          />
        )}
      </div>
    </div>
  );
}

function formatDuration(startTime: string, endTime: string | null): string {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const totalMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (totalMinutes < 1) return "< 1 minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function IncidentDetail({
  incident: inc,
  cameraName,
  storeName,
  onClose,
  onAcknowledge,
  onResolve,
}: {
  incident: Incident;
  cameraName: string;
  storeName: string;
  onClose: () => void;
  onAcknowledge: () => void;
  onResolve: (s: string) => void;
}) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [notesText, setNotesText] = useState(inc.notes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);

  // Sync notes when incident changes
  useEffect(() => {
    setNotesText(inc.notes ?? "");
    setNotesDirty(false);
  }, [inc.id, inc.notes]);

  // Fetch timeline detections for this incident
  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ["incident-timeline", inc.id],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Detection>>("/detection/history", {
        params: { incident_id: inc.id, limit: 100 },
      });
      return res.data;
    },
  });

  const timelineDetections = timelineData?.data ?? [];
  const isOngoing = inc.status === "new" || inc.status === "acknowledged";

  const notesMutation = useMutation({
    mutationFn: (notes: string) => api.put(`/events/${inc.id}/notes`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      success("Notes saved");
      setNotesDirty(false);
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to save notes");
    },
  });

  // Keyboard shortcuts: A=Acknowledge, R=Resolve, F=False Positive
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in a textarea or input
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "textarea" || tag === "input" || tag === "select") return;

      if (e.key === "a" || e.key === "A") {
        if (inc.status === "new") {
          e.preventDefault();
          onAcknowledge();
        }
      } else if (e.key === "r" || e.key === "R") {
        if (inc.status === "new" || inc.status === "acknowledged") {
          e.preventDefault();
          onResolve("resolved");
        }
      } else if (e.key === "f" || e.key === "F") {
        if (inc.status === "new" || inc.status === "acknowledged") {
          e.preventDefault();
          onResolve("false_positive");
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [inc.id, inc.status, onAcknowledge, onResolve, onClose]);

  return (
    <>
      {/* Mobile: full-screen overlay */}
      <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full bg-white shadow-2xl sm:w-[480px] lg:relative lg:inset-auto lg:z-auto lg:w-[40%] lg:min-w-[380px] lg:rounded-xl lg:border lg:border-gray-200 lg:shadow-lg">
        <div className="flex h-full flex-col overflow-y-auto">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-bold text-gray-900">Incident Detail</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {/* Detection Frame */}
            {inc.annotated_frame_url ? (
              <div className="mb-5 overflow-hidden rounded-lg border border-gray-200 bg-gray-900">
                <img
                  src={inc.annotated_frame_url}
                  alt="Detection frame with annotations"
                  className="w-full object-contain"
                  style={{ maxHeight: 280 }}
                />
              </div>
            ) : (
              <div className="mb-5 flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50">
                <div className="text-center">
                  <Eye size={20} className="mx-auto mb-1 text-gray-300" />
                  <p className="text-xs text-gray-400">No frame captured</p>
                </div>
              </div>
            )}

            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
                <dt className="text-gray-500">Severity</dt>
                <dd><StatusBadge status={inc.severity} /></dd>
              </div>
              <div className="flex items-center justify-between rounded-lg px-3 py-2.5">
                <dt className="text-gray-500">Status</dt>
                <dd><StatusBadge status={inc.status} /></dd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
                <dt className="text-gray-500">Camera</dt>
                <dd className="font-medium text-gray-900">{cameraName}</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg px-3 py-2.5">
                <dt className="text-gray-500">Store</dt>
                <dd className="font-medium text-gray-900">{storeName}</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
                <dt className="text-gray-500">Detected</dt>
                <dd className="font-medium text-gray-900">{new Date(inc.start_time).toLocaleString()}</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg px-3 py-2.5">
                <dt className="text-gray-500">Duration</dt>
                <dd className="font-medium text-gray-900">
                  {formatDuration(inc.start_time, inc.end_time)}
                  {isOngoing && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                      Ongoing
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
                <dt className="text-gray-500">Max Confidence</dt>
                <dd className="text-lg font-bold text-gray-900">{(inc.max_confidence * 100).toFixed(1)}%</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg px-3 py-2.5">
                <dt className="text-gray-500">Max Wet Area</dt>
                <dd className="font-medium text-gray-900">{inc.max_wet_area_percent.toFixed(1)}%</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
                <dt className="text-gray-500">Detections</dt>
                <dd className="font-medium text-gray-900">{inc.detection_count}</dd>
              </div>
            </dl>

            {/* Detection Timeline */}
            <div className="mt-6">
              <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <Activity size={12} /> Detection Timeline ({timelineDetections.length})
              </h4>
              {timelineLoading ? (
                <div className="flex h-16 items-center justify-center">
                  <Loader2 size={14} className="animate-spin text-[#0D9488]" />
                </div>
              ) : timelineDetections.length === 0 ? (
                <p className="text-xs text-gray-400">No detections linked to this incident.</p>
              ) : (
                <div className="relative max-h-52 overflow-y-auto rounded-lg border border-gray-100 p-3">
                  <div className="absolute left-6 top-3 bottom-3 w-px bg-gray-200" />
                  <div className="space-y-2">
                    {timelineDetections.map((det) => (
                      <div
                        key={det.id}
                        className="relative flex items-center gap-3 pl-5"
                      >
                        <div className="absolute left-[18px] h-2.5 w-2.5 rounded-full border-2 border-white bg-[#0D9488]" />
                        <div className="flex flex-1 items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <Clock size={10} className="shrink-0 text-gray-400" />
                            <span className="font-medium text-gray-700">
                              {new Date(det.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-[#0D9488]">
                              {(det.confidence * 100).toFixed(0)}%
                            </span>
                            <span className="text-gray-500">
                              {det.wet_area_percent.toFixed(1)}% wet
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Devices Triggered */}
            {inc.devices_triggered && inc.devices_triggered.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <Smartphone size={12} /> Devices Triggered ({inc.devices_triggered.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {inc.devices_triggered.map((deviceId) => (
                    <span
                      key={deviceId}
                      className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                    >
                      {deviceId}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Incident Timeline (from timeline[] array added in v4.7) */}
            {inc.timeline && inc.timeline.length > 0 && (
              <div className="mt-5">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Incident Timeline
                </label>
                <div className="space-y-2">
                  {inc.timeline.map((evt: { event: string; timestamp: string; details?: Record<string, unknown> }, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                        evt.event === "created" ? "bg-blue-500" :
                        evt.event === "severity_upgraded" ? "bg-red-500" :
                        evt.event === "acknowledged" ? "bg-amber-500" :
                        evt.event === "resolved" ? "bg-green-500" :
                        evt.event === "device_triggered" ? "bg-purple-500" :
                        "bg-gray-400"
                      }`} />
                      <div>
                        <span className="font-medium text-gray-700">{evt.event.replace(/_/g, " ")}</span>
                        <span className="ml-2 text-gray-400">{new Date(evt.timestamp).toLocaleString()}</span>
                        {evt.details && Object.keys(evt.details).length > 0 && (
                          <span className="ml-1 text-gray-400">
                            ({Object.entries(evt.details).filter(([,v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(", ")})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="mt-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Notes
              </label>
              <textarea
                value={notesText}
                onChange={(e) => { setNotesText(e.target.value); setNotesDirty(true); }}
                placeholder="Add notes about this incident..."
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] resize-y"
              />
              {notesDirty && (
                <button
                  onClick={() => notesMutation.mutate(notesText)}
                  disabled={notesMutation.isPending}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#0F766E] disabled:opacity-50"
                >
                  <Save size={12} />
                  {notesMutation.isPending ? "Saving..." : "Save Notes"}
                </button>
              )}
            </div>
          </div>

          {/* Action buttons at bottom */}
          <div className="border-t border-gray-100 px-5 py-4 space-y-2">
            {inc.status === "new" && (
              <button
                onClick={onAcknowledge}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0D9488] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0F766E]"
              >
                <CheckCircle2 size={16} /> Acknowledge
                <kbd className="ml-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium">A</kbd>
              </button>
            )}
            {(inc.status === "new" || inc.status === "acknowledged") && (
              <>
                <button
                  onClick={() => onResolve("resolved")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                >
                  <CheckCircle2 size={16} /> Resolve
                  <kbd className="ml-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium">R</kbd>
                </button>
                <button
                  onClick={() => onResolve("false_positive")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <XCircle size={16} /> Mark False Positive
                  <kbd className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium">F</kbd>
                </button>
              </>
            )}
            <p className="text-center text-[10px] text-gray-400">
              Keyboard: A = Acknowledge, R = Resolve, F = False Positive, Esc = Close
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
