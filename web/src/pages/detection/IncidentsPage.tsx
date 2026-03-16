import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, CheckCircle2, XCircle, Eye } from "lucide-react";

import api from "@/lib/api";
import type { Incident, Store, Camera, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";

export default function IncidentsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [selected, setSelected] = useState<Incident | null>(null);
  const limit = 20;

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
      const res = await api.get<PaginatedResponse<Camera>>("/cameras", { params: { limit: 100 } });
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
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/events/${id}/resolve`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setSelected(null);
    },
  });

  const incidents = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const cameraMap = new Map((cameras ?? []).map((c) => [c.id, c.name]));
  const storeMap = new Map((stores ?? []).map((s) => [s.id, s.name]));

  function severityBorder(sev: string) {
    if (sev === "critical") return "border-l-4 border-l-[#991B1B]";
    if (sev === "high") return "border-l-4 border-l-[#DC2626]";
    if (sev === "medium") return "border-l-4 border-l-[#D97706]";
    return "border-l-4 border-l-[#D97706]";
  }

  function duration(inc: Incident) {
    const start = new Date(inc.start_time);
    const end = inc.end_time ? new Date(inc.end_time) : new Date();
    const mins = Math.round((end.getTime() - start.getTime()) / 60000);
    if (inc.status === "resolved" || inc.status === "false_positive") return `Resolved in ${mins}m`;
    return `${mins}m open`;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Incident Management</h1>
        <p className="text-sm text-[#78716C]">{total} incidents total</p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
          <option value="">All Status</option>
          <option value="new">New</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>
        <select value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={storeFilter} onChange={(e) => { setStoreFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
          <option value="">All Stores</option>
          {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#0D9488]" />
        </div>
      ) : incidents.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No incidents found" description="Adjust filters or wait for new detections." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
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
                <tr key={inc.id} className={`border-b border-[#E7E5E0] hover:bg-[#F8F7F4] ${severityBorder(inc.severity)}`}>
                  <td className="px-4 py-3"><StatusBadge status={inc.severity} /></td>
                  <td className="px-4 py-3">
                    <div className="text-[#1C1917]">{storeMap.get(inc.store_id) ?? "—"}</div>
                    <div className="text-xs text-[#78716C]">{cameraMap.get(inc.camera_id) ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-[#78716C]">{new Date(inc.start_time).toLocaleString()}</td>
                  <td className="px-4 py-3 text-[#78716C]">{duration(inc)}</td>
                  <td className="px-4 py-3 font-medium text-[#1C1917]">{(inc.max_confidence * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-[#78716C]">{inc.max_wet_area_percent.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-[#78716C]">{inc.detection_count}</td>
                  <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setSelected(inc)} title="Detail"
                        className="rounded p-1 text-[#78716C] hover:bg-[#F1F0ED]"><Eye size={14} /></button>
                      {inc.status === "new" && (
                        <button onClick={() => ackMutation.mutate(inc.id)} title="Acknowledge"
                          className="rounded p-1 text-[#D97706] hover:bg-[#FEF3C7]"><CheckCircle2 size={14} /></button>
                      )}
                      {(inc.status === "new" || inc.status === "acknowledged") && (
                        <button onClick={() => resolveMutation.mutate({ id: inc.id, status: "resolved" })} title="Resolve"
                          className="rounded p-1 text-[#16A34A] hover:bg-[#DCFCE7]"><CheckCircle2 size={14} /></button>
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
          <span>Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}
              className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50">Previous</button>
            <button disabled={(page + 1) * limit >= total} onClick={() => setPage(page + 1)}
              className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50">Next</button>
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

function IncidentDetail({
  incident: inc, cameraName, storeName, onClose, onAcknowledge, onResolve,
}: {
  incident: Incident; cameraName: string; storeName: string;
  onClose: () => void; onAcknowledge: () => void; onResolve: (s: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1C1917]">Incident Detail</h2>
          <button onClick={onClose} className="text-[#78716C] hover:text-[#1C1917]"><XCircle size={18} /></button>
        </div>

        <dl className="space-y-3 text-sm">
          <div className="flex justify-between"><dt className="text-[#78716C]">Severity</dt><dd><StatusBadge status={inc.severity} /></dd></div>
          <div className="flex justify-between"><dt className="text-[#78716C]">Status</dt><dd><StatusBadge status={inc.status} /></dd></div>
          <div className="flex justify-between"><dt className="text-[#78716C]">Camera</dt><dd className="text-[#1C1917]">{cameraName}</dd></div>
          <div className="flex justify-between"><dt className="text-[#78716C]">Store</dt><dd className="text-[#1C1917]">{storeName}</dd></div>
          <div className="flex justify-between"><dt className="text-[#78716C]">Detected</dt><dd className="text-[#1C1917]">{new Date(inc.start_time).toLocaleString()}</dd></div>
          <div className="flex justify-between"><dt className="text-[#78716C]">Max Confidence</dt><dd className="font-semibold text-[#1C1917]">{(inc.max_confidence * 100).toFixed(1)}%</dd></div>
          <div className="flex justify-between"><dt className="text-[#78716C]">Max Wet Area</dt><dd className="text-[#1C1917]">{inc.max_wet_area_percent.toFixed(1)}%</dd></div>
          <div className="flex justify-between"><dt className="text-[#78716C]">Detections</dt><dd className="text-[#1C1917]">{inc.detection_count}</dd></div>
          {inc.notes && <div><dt className="text-[#78716C]">Notes</dt><dd className="mt-1 text-[#1C1917]">{inc.notes}</dd></div>}
        </dl>

        <div className="mt-6 flex flex-col gap-2">
          {inc.status === "new" && (
            <button onClick={onAcknowledge}
              className="flex items-center justify-center gap-2 rounded-md bg-[#D97706] px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
              <CheckCircle2 size={14} /> Acknowledge
            </button>
          )}
          {(inc.status === "new" || inc.status === "acknowledged") && (
            <>
              <button onClick={() => onResolve("resolved")}
                className="flex items-center justify-center gap-2 rounded-md bg-[#16A34A] px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                <CheckCircle2 size={14} /> Resolve
              </button>
              <button onClick={() => onResolve("false_positive")}
                className="flex items-center justify-center gap-2 rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#78716C] hover:bg-[#F1F0ED]">
                <XCircle size={14} /> Mark False Positive
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
