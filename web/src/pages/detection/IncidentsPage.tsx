import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

  const { data, isLoading } = useQuery({
    queryKey: ["incidents", page, statusFilter, severityFilter, storeFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = { offset: page * limit, limit };
      if (statusFilter) params.status = statusFilter;
      if (severityFilter) params.severity = severityFilter;
      if (storeFilter) params.store_id = storeFilter;
      const res = await api.get<PaginatedResponse<Incident>>("/events", { params });
      return res.data;
    },
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

  function severityBorder(sev: string) {
    return SEVERITY_BORDER_CLASSES[sev] ?? SEVERITY_BORDER_CLASSES.medium;
  }

  function duration(inc: Incident) {
    const start = new Date(inc.start_time);
    const end = inc.end_time ? new Date(inc.end_time) : new Date();
    const mins = Math.round((end.getTime() - start.getTime()) / 60000);
    if (inc.status === "resolved" || inc.status === "false_positive")
      return `Resolved in ${mins}m`;
    return `${mins}m open`;
  }

  return (
    <div>
      {/* Header row with title, WS status, and sound toggle */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Incident Management</h1>
          <p className="text-sm text-[#78716C]">{total} incidents total</p>
        </div>
        <div className="flex items-center gap-3">
          {/* WebSocket connection indicator */}
          <span
            className="flex items-center gap-1 text-xs"
            title={connected ? "Live updates connected" : "Live updates disconnected"}
          >
            {connected ? (
              <>
                <Wifi size={14} className="text-[#16A34A]" />
                <span className="text-[#16A34A]">Live</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-[#78716C]" />
                <span className="text-[#78716C]">Offline</span>
              </>
            )}
          </span>

          {/* Sound toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? "Mute alert sound" : "Enable alert sound"}
            className={`rounded-md border p-2 transition-colors ${
              soundEnabled
                ? "border-[#0D9488] bg-[#F0FDFA] text-[#0D9488]"
                : "border-[#E7E5E0] bg-white text-[#78716C] hover:bg-[#F1F0ED]"
            }`}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </div>

      {/* New incidents banner */}
      {newIncidentCount > 0 && (
        <button
          onClick={clearBanner}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[#0D9488] bg-[#F0FDFA] px-4 py-2.5 text-sm font-medium text-[#0D9488] transition-colors hover:bg-[#CCFBF1]"
        >
          <ArrowUp size={14} />
          {newIncidentCount} new incident{newIncidentCount > 1 ? "s" : ""} — click to refresh
        </button>
      )}

      {/* Filters + Sort */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
        >
          <option value="">All Status</option>
          <option value="new">New</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => {
            setSeverityFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
        >
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={storeFilter}
          onChange={(e) => {
            setStoreFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
        >
          <option value="">All Stores</option>
          {(stores ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Sort dropdown */}
        <div className="flex items-center gap-2">
          <ArrowDownAZ size={14} className="text-[#78716C]" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#0D9488]" />
        </div>
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No incidents found"
          description="Adjust filters or wait for new detections."
        />
      ) : (
        <div ref={tableRef} className="overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Severity</th>
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Store / Camera</th>
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Detected</th>
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Duration</th>
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Confidence</th>
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Wet Area</th>
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Detections</th>
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Status</th>
                <th className="px-4 py-3 text-right font-medium text-[#78716C]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr
                  key={inc.id}
                  className={`border-b border-[#E7E5E0] hover:bg-[#F8F7F4] ${severityBorder(inc.severity)} ${
                    flashIds.has(inc.id) ? "animate-flash-row" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <StatusBadge status={inc.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[#1C1917]">{storeMap.get(inc.store_id) ?? "---"}</div>
                    <div className="text-xs text-[#78716C]">
                      {cameraMap.get(inc.camera_id) ?? "---"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#78716C]">
                    {new Date(inc.start_time).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[#78716C]">{duration(inc)}</td>
                  <td className="px-4 py-3 font-medium text-[#1C1917]">
                    {(inc.max_confidence * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-[#78716C]">
                    {inc.max_wet_area_percent.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-[#78716C]">{inc.detection_count}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inc.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setSelected(inc)}
                        title="Detail"
                        className="rounded p-1 text-[#78716C] hover:bg-[#F1F0ED]"
                      >
                        <Eye size={14} />
                      </button>
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
                          onClick={() => resolveMutation.mutate({ id: inc.id, status: "resolved" })}
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

      {/* Pagination */}
      {total > limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-[#78716C]">
          <span>
            Showing {page * limit + 1}--{Math.min((page + 1) * limit, total)} of {total}
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

      {/* Detail Panel */}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1C1917]">Incident Detail</h2>
          <button onClick={onClose} className="text-[#78716C] hover:text-[#1C1917]">
            <XCircle size={18} />
          </button>
        </div>

        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-[#78716C]">Severity</dt>
            <dd>
              <StatusBadge status={inc.severity} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#78716C]">Status</dt>
            <dd>
              <StatusBadge status={inc.status} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#78716C]">Camera</dt>
            <dd className="text-[#1C1917]">{cameraName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#78716C]">Store</dt>
            <dd className="text-[#1C1917]">{storeName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#78716C]">Detected</dt>
            <dd className="text-[#1C1917]">{new Date(inc.start_time).toLocaleString()}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#78716C]">Duration</dt>
            <dd className="font-medium text-[#1C1917]">
              {formatDuration(inc.start_time, inc.end_time)}
              {isOngoing && (
                <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-medium text-[#D97706]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D97706]" />
                  Ongoing
                </span>
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#78716C]">Max Confidence</dt>
            <dd className="font-semibold text-[#1C1917]">
              {(inc.max_confidence * 100).toFixed(1)}%
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#78716C]">Max Wet Area</dt>
            <dd className="text-[#1C1917]">{inc.max_wet_area_percent.toFixed(1)}%</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#78716C]">Detections</dt>
            <dd className="text-[#1C1917]">{inc.detection_count}</dd>
          </div>
        </dl>

        {/* Timeline Section */}
        <div className="mt-5">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#78716C]">
            <Activity size={12} /> Detection Timeline ({timelineDetections.length})
          </h4>
          {timelineLoading ? (
            <div className="flex h-16 items-center justify-center">
              <Loader2 size={14} className="animate-spin text-[#0D9488]" />
            </div>
          ) : timelineDetections.length === 0 ? (
            <p className="text-xs text-[#A8A29E]">No detections linked to this incident.</p>
          ) : (
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-[#E7E5E0] p-2">
              {timelineDetections.map((det) => (
                <div
                  key={det.id}
                  className="flex items-center justify-between rounded-md bg-[#F8F7F4] px-2.5 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Clock size={10} className="shrink-0 text-[#78716C]" />
                    <span className="text-[#1C1917]">
                      {new Date(det.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-[#0D9488]">
                      {(det.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="text-[#78716C]">
                      {det.wet_area_percent.toFixed(1)}% wet
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Devices Triggered */}
        {inc.devices_triggered && inc.devices_triggered.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#78716C]">
              <Smartphone size={12} /> Devices Triggered ({inc.devices_triggered.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {inc.devices_triggered.map((deviceId) => (
                <span
                  key={deviceId}
                  className="rounded-full bg-[#F1F0ED] px-2.5 py-1 text-xs text-[#1C1917]"
                >
                  {deviceId}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes Editor */}
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold text-[#78716C]">Notes</h4>
          <textarea
            value={notesText}
            onChange={(e) => { setNotesText(e.target.value); setNotesDirty(true); }}
            placeholder="Add notes about this incident..."
            rows={3}
            className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] resize-y"
          />
          {notesDirty && (
            <button
              onClick={() => notesMutation.mutate(notesText)}
              disabled={notesMutation.isPending}
              className="mt-2 flex items-center gap-1.5 rounded-md bg-[#0D9488] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
            >
              <Save size={12} />
              {notesMutation.isPending ? "Saving..." : "Save Notes"}
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-2">
          {inc.status === "new" && (
            <button
              onClick={onAcknowledge}
              className="flex items-center justify-center gap-2 rounded-md bg-[#D97706] px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              <CheckCircle2 size={14} /> Acknowledge
              <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px]">A</kbd>
            </button>
          )}
          {(inc.status === "new" || inc.status === "acknowledged") && (
            <>
              <button
                onClick={() => onResolve("resolved")}
                className="flex items-center justify-center gap-2 rounded-md bg-[#16A34A] px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <CheckCircle2 size={14} /> Resolve
                <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px]">R</kbd>
              </button>
              <button
                onClick={() => onResolve("false_positive")}
                className="flex items-center justify-center gap-2 rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#78716C] hover:bg-[#F1F0ED]"
              >
                <XCircle size={14} /> Mark False Positive
                <kbd className="ml-1 rounded bg-[#E7E5E0] px-1.5 py-0.5 text-[10px]">F</kbd>
              </button>
            </>
          )}
        </div>

        {/* Keyboard shortcuts hint */}
        <p className="mt-3 text-center text-[10px] text-[#78716C]">
          Keyboard: A = Acknowledge, R = Resolve, F = False Positive, Esc = Close
        </p>
      </div>
    </div>
  );
}
