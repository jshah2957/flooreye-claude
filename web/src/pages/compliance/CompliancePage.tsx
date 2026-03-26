import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Sparkles,
  Camera,
  Loader2,
  RefreshCw,
  FileText,
  Download,
} from "lucide-react";

import api from "@/lib/api";

interface ComplianceData {
  total_incidents: number;
  resolved_incidents: number;
  resolution_rate: number;
  avg_response_time_minutes: number;
  avg_cleanup_time_minutes: number;
  incidents_by_store: Array<{
    store_id: string;
    store_name: string;
    count: number;
  }>;
  incidents_by_day: Array<{ date: string; count: number }>;
  camera_uptime_percent: number;
  total_cameras: number;
  active_cameras: number;
}

export default function CompliancePage() {
  const [storeId, setStoreId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const {
    data: reportData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["compliance-report", storeId, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (storeId) params.store_id = storeId;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await api.get<{ data: ComplianceData }>(
        "/reports/compliance",
        { params }
      );
      return res.data.data;
    },
    refetchInterval: 60000,
  });

  const { data: storesData } = useQuery({
    queryKey: ["compliance-stores"],
    queryFn: async () => {
      const res = await api.get("/stores", { params: { limit: 100 } });
      return res.data.data ?? [];
    },
  });

  const stores = storesData ?? [];
  const report = reportData;

  const maxDayCount = report
    ? Math.max(...report.incidents_by_day.map((d) => d.count), 1)
    : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Incident response metrics and compliance reporting</p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Store</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
            >
              <option value="">All Stores</option>
              {stores.map((s: { id: string; name: string }) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.open(`/api/v1/reports/compliance?format=pdf${storeId ? `&store_id=${storeId}` : ""}${dateFrom ? `&date_from=${dateFrom}` : ""}${dateTo ? `&date_to=${dateTo}` : ""}`, "_blank")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              <FileText size={14} /> Generate PDF
            </button>
            <button
              onClick={() => {
                const params = new URLSearchParams();
                if (storeId) params.set("store_id", storeId);
                if (dateFrom) params.set("date_from", dateFrom);
                if (dateTo) params.set("date_to", dateTo);
                const url = `/api/v1/reports/compliance?format=csv${params.toString() ? `&${params}` : ""}`;
                window.open(url, "_blank");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gray-200" />
                  <div className="space-y-2">
                    <div className="h-3 w-20 rounded bg-gray-200" />
                    <div className="h-5 w-16 rounded bg-gray-200" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="mt-4 space-y-3">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-5 rounded bg-gray-200" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !report ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50">
          <AlertTriangle size={32} className="mb-2 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No report data available</p>
          <p className="mt-1 text-xs text-gray-400">Adjust filters or wait for data to be collected</p>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={AlertTriangle}
              label="Total Incidents"
              value={report.total_incidents}
              color="danger"
            />
            <StatCard
              icon={CheckCircle}
              label="Resolution Rate"
              value={`${(report.resolution_rate * 100).toFixed(1)}%`}
              color="success"
            />
            <StatCard
              icon={Clock}
              label="Avg Response Time"
              value={`${report.avg_response_time_minutes} min`}
              color="warning"
            />
            <StatCard
              icon={Sparkles}
              label="Avg Cleanup Time"
              value={`${report.avg_cleanup_time_minutes} min`}
              color="brand"
            />
          </div>

          {/* Camera Uptime */}
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Camera size={16} className="text-[#0D9488]" />
              <h2 className="text-sm font-semibold text-gray-900">
                Camera Uptime
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0D9488] to-[#14b8a6] transition-all"
                  style={{ width: `${report.camera_uptime_percent}%` }}
                />
              </div>
              <span className="text-sm font-bold text-gray-900">
                {report.camera_uptime_percent}%
              </span>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              {report.active_cameras} of {report.total_cameras} cameras active
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Incidents by Store */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">
                Incidents by Store
              </h2>
              {report.incidents_by_store.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">
                  No incidents recorded
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                        <th className="pb-2 font-medium">Store</th>
                        <th className="pb-2 text-right font-medium">Incidents</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {report.incidents_by_store.map((s) => (
                        <tr key={s.store_id}>
                          <td className="py-2.5 text-gray-700">{s.store_name}</td>
                          <td className="py-2.5 text-right font-semibold text-gray-900">{s.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Incidents by Day */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">
                Incidents by Day
              </h2>
              {report.incidents_by_day.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">
                  No daily data available
                </p>
              ) : (
                <div className="space-y-2.5">
                  {report.incidents_by_day.map((d) => (
                    <div key={d.date} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs text-gray-500">
                        {d.date}
                      </span>
                      <div className="h-6 flex-1 overflow-hidden rounded-lg bg-gray-100">
                        <div
                          className="h-full rounded-lg bg-gradient-to-r from-[#0D9488] to-[#14b8a6] transition-all"
                          style={{
                            width: `${(d.count / maxDayCount) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs font-semibold text-gray-900">
                        {d.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: "info" | "success" | "danger" | "warning" | "brand";
}) {
  const colors = {
    info: { bg: "bg-blue-50", text: "text-blue-600" },
    success: { bg: "bg-green-50", text: "text-green-600" },
    danger: { bg: "bg-red-50", text: "text-red-600" },
    warning: { bg: "bg-amber-50", text: "text-amber-600" },
    brand: { bg: "bg-teal-50", text: "text-[#0D9488]" },
  };
  const c = colors[color];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.bg}`}>
          <Icon size={18} className={c.text} />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
