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

  // Find max count for bar chart scaling
  const maxDayCount = report
    ? Math.max(...report.incidents_by_day.map((d) => d.count), 1)
    : 1;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1C1917]">
          Compliance Report
        </h1>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-2 py-1 text-xs text-[#78716C] hover:bg-[#F1F0ED]"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs text-[#78716C]">Store</label>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
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
          <label className="mb-1 block text-xs text-[#78716C]">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#78716C]">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 size={32} className="animate-spin text-[#0D9488]" />
        </div>
      ) : !report ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
          <p className="text-sm text-[#78716C]">No report data available</p>
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
          <div className="mb-6 rounded-lg border border-[#E7E5E0] bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Camera size={16} className="text-[#0D9488]" />
              <h2 className="text-sm font-semibold text-[#1C1917]">
                Camera Uptime
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#F1F0ED]">
                <div
                  className="h-full rounded-full bg-[#0D9488] transition-all"
                  style={{ width: `${report.camera_uptime_percent}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-[#1C1917]">
                {report.camera_uptime_percent}%
              </span>
            </div>
            <p className="mt-1 text-xs text-[#78716C]">
              {report.active_cameras} of {report.total_cameras} cameras active
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Incidents by Store */}
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-[#1C1917]">
                Incidents by Store
              </h2>
              {report.incidents_by_store.length === 0 ? (
                <p className="py-4 text-center text-xs text-[#78716C]">
                  No incidents recorded
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E7E5E0] text-left text-xs text-[#78716C]">
                        <th className="pb-2 font-medium">Store</th>
                        <th className="pb-2 text-right font-medium">
                          Incidents
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.incidents_by_store.map((s) => (
                        <tr
                          key={s.store_id}
                          className="border-b border-[#E7E5E0] last:border-0"
                        >
                          <td className="py-2 text-[#1C1917]">
                            {s.store_name}
                          </td>
                          <td className="py-2 text-right font-medium text-[#1C1917]">
                            {s.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Incidents by Day */}
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-[#1C1917]">
                Incidents by Day
              </h2>
              {report.incidents_by_day.length === 0 ? (
                <p className="py-4 text-center text-xs text-[#78716C]">
                  No daily data available
                </p>
              ) : (
                <div className="space-y-2">
                  {report.incidents_by_day.map((d) => (
                    <div key={d.date} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs text-[#78716C]">
                        {d.date}
                      </span>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-[#F1F0ED]">
                        <div
                          className="h-full rounded bg-[#0D9488] transition-all"
                          style={{
                            width: `${(d.count / maxDayCount) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs font-medium text-[#1C1917]">
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
    info: { bg: "bg-[#DBEAFE]", text: "text-[#2563EB]" },
    success: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]" },
    danger: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]" },
    warning: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
    brand: { bg: "bg-[#CCFBF1]", text: "text-[#0D9488]" },
  };
  const c = colors[color];

  return (
    <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${c.bg}`}>
          <Icon size={18} className={c.text} />
        </div>
        <div>
          <p className="text-xs text-[#78716C]">{label}</p>
          <p className="text-lg font-semibold text-[#1C1917]">{value}</p>
        </div>
      </div>
    </div>
  );
}
