import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Activity,
  Camera,
  HardDrive,
  Cpu,
  Server,
  Database,
  CheckCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

// -- Helpers --
function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const DONUT_COLORS = ["#991B1B", "#DC2626", "#D97706", "#2563EB", "#9CA3AF"];

// -- Stat Card Component --
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  to,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: "red" | "green" | "amber" | "blue" | "teal" | "gray";
  to?: string;
}) {
  const colorMap = {
    red: "bg-red-50 text-red-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    teal: "bg-teal-50 text-teal-600",
    gray: "bg-gray-50 text-gray-600",
  };
  const card = (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
  return to ? <Link to={to}>{card}</Link> : card;
}

// -- Health Row Component --
function HealthRow({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  status: "ok" | "error" | "unknown";
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-gray-400" />
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {detail && <span className="text-xs text-gray-400">{detail}</span>}
        <span
          className={`h-2 w-2 rounded-full ${
            status === "ok"
              ? "bg-green-500"
              : status === "error"
                ? "bg-red-500"
                : "bg-gray-300"
          }`}
        />
      </div>
    </div>
  );
}

// -- Main Dashboard --
export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "org_admin", "ml_engineer"].includes(
    user?.role || ""
  );
  const [healthOpen, setHealthOpen] = useState(true);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const res = await api.get("/dashboard/summary");
      return res.data.data;
    },
    refetchInterval: 30000,
  });

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-gray-100"
            />
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="h-64 animate-pulse rounded-xl bg-gray-100 lg:col-span-3" />
          <div className="h-64 animate-pulse rounded-xl bg-gray-100 lg:col-span-2" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <AlertTriangle size={32} className="text-red-400" />
        <p className="text-sm text-gray-600">Failed to load dashboard</p>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const {
    stores = { total: 0 },
    cameras = { total: 0, online: 0 },
    incidents = { active: 0, by_severity: {} },
    detections = { today: 0, total: 0, trend: [] },
    edge = { online: 0, total: 0, agents: [] },
    model = null,
    dataset = { total_frames: 0 },
    clips = { total: 0 },
    health = { mongodb: "unknown", redis: "unknown", version: "unknown" },
    recent_detections = [],
  } = data;

  // Build chart data from detection trend
  const trendMap: Record<string, { date: string; wet: number; dry: number }> =
    {};
  for (const t of detections.trend || []) {
    if (!trendMap[t.date])
      trendMap[t.date] = { date: t.date, wet: 0, dry: 0 };
    const entry = trendMap[t.date]!;
    if (t.is_wet) entry.wet += t.count;
    else entry.dry += t.count;
  }
  const trendData = Object.values(trendMap).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Severity donut data
  const severityData = Object.entries(incidents.by_severity || {}).map(
    ([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    })
  );

  // Getting started (admin with 0 cameras)
  const showGettingStarted = isAdmin && cameras.total === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Platform overview · Refreshes every 30s
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Getting Started */}
      {showGettingStarted && (
        <div className="mb-6 rounded-xl border border-teal-200 bg-teal-50 p-5">
          <h3 className="font-semibold text-teal-800">Getting Started</h3>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-teal-700">
            <li>
              <Link to="/stores" className="underline">
                Create a store
              </Link>
            </li>
            <li>
              <Link to="/cameras/wizard" className="underline">
                Add a camera
              </Link>
            </li>
            <li>Draw ROI on camera detail page</li>
            <li>
              <Link to="/models" className="underline">
                Deploy AI model
              </Link>
            </li>
            <li>Run your first detection</li>
          </ol>
        </div>
      )}

      {/* Store Owner Alert Banner */}
      {!isAdmin && (
        <div
          className={`mb-6 rounded-xl p-4 text-center ${
            incidents.active > 0
              ? "bg-red-50 border border-red-200"
              : "bg-green-50 border border-green-200"
          }`}
        >
          <p
            className={`text-lg font-bold ${
              incidents.active > 0 ? "text-red-700" : "text-green-700"
            }`}
          >
            {incidents.active > 0
              ? `${incidents.active} ACTIVE INCIDENT${incidents.active > 1 ? "S" : ""}`
              : "ALL CLEAR — No active incidents"}
          </p>
        </div>
      )}

      {/* ROW 1: KPI Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={AlertTriangle}
          label="Active Incidents"
          value={incidents.active}
          color={incidents.active > 0 ? "red" : "green"}
          to="/incidents"
        />
        <StatCard
          icon={Activity}
          label="Detections Today"
          value={detections.today}
          sub={`${detections.total} total`}
          color="amber"
          to="/detection/history"
        />
        <StatCard
          icon={Camera}
          label="Cameras Online"
          value={`${cameras.online}/${cameras.total}`}
          sub={
            cameras.total > 0
              ? `${Math.round((cameras.online / cameras.total) * 100)}%`
              : "—"
          }
          color={cameras.online === cameras.total ? "green" : "amber"}
          to="/cameras"
        />
        <StatCard
          icon={HardDrive}
          label="Edge Devices"
          value={`${edge.online}/${edge.total}`}
          sub={
            edge.total > 0
              ? edge.online === edge.total
                ? "All online"
                : `${edge.total - edge.online} offline`
              : "No agents"
          }
          color={edge.online === edge.total ? "green" : "red"}
          to="/edge"
        />
        <StatCard
          icon={Cpu}
          label="Production Model"
          value={model?.version_str || "None"}
          sub={model?.architecture || "No model deployed"}
          color="teal"
          to="/models"
        />
      </div>

      {/* ROW 2: Charts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Detection Trend */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            Detection Trend (7 days)
          </h3>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="wetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dryGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16A34A" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="wet"
                  stroke="#DC2626"
                  fill="url(#wetGrad)"
                  name="Wet"
                />
                <Area
                  type="monotone"
                  dataKey="dry"
                  stroke="#16A34A"
                  fill="url(#dryGrad)"
                  name="Dry"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-gray-400">
              No detection data this week
            </div>
          )}
        </div>

        {/* Severity Donut */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            Incidents by Severity
          </h3>
          {severityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={severityData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {severityData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconSize={10}
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-gray-400">
              No incidents recorded
            </div>
          )}
        </div>
      </div>

      {/* ROW 3: Health + Active Incidents */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Infrastructure Health */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <button
            onClick={() => setHealthOpen(!healthOpen)}
            className="flex w-full items-center justify-between"
          >
            <h3 className="text-sm font-semibold text-gray-700">
              Infrastructure Health
            </h3>
            {healthOpen ? (
              <ChevronUp size={16} className="text-gray-400" />
            ) : (
              <ChevronDown size={16} className="text-gray-400" />
            )}
          </button>
          {healthOpen && (
            <div className="mt-3 divide-y divide-gray-100">
              <HealthRow
                icon={Server}
                label="Cloud Backend"
                status="ok"
                detail={`v${health?.version || "unknown"}`}
              />
              <HealthRow
                icon={Database}
                label="MongoDB"
                status={health?.mongodb === "ok" ? "ok" : "error"}
              />
              <HealthRow
                icon={Database}
                label="Redis"
                status={health?.redis === "ok" ? "ok" : "error"}
              />
              <HealthRow
                icon={HardDrive}
                label="Edge Fleet"
                status={
                  edge.online === edge.total && edge.total > 0
                    ? "ok"
                    : edge.total === 0
                      ? "unknown"
                      : "error"
                }
                detail={`${edge.online}/${edge.total} online`}
              />
            </div>
          )}
        </div>

        {/* Active Incidents */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Active Incidents
            </h3>
            <Link
              to="/incidents"
              className="text-xs text-teal-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {incidents.active === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2">
              <CheckCircle size={28} className="text-green-400" />
              <p className="text-sm text-gray-400">
                All clear — no active incidents
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-center text-sm text-red-600 font-medium">
                {incidents.active} active incident
                {incidents.active !== 1 ? "s" : ""}
              </p>
              <Link
                to="/incidents"
                className="block rounded-lg border border-red-100 bg-red-50 p-3 text-center text-sm text-red-700 hover:bg-red-100"
              >
                View & Manage Incidents &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ROW 4: Recent Detections + Edge Status */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Recent Detections */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Recent Detections
            </h3>
            <Link
              to="/detection/history"
              className="text-xs text-teal-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {(recent_detections || []).length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400">
              No detections yet
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(recent_detections || []).slice(0, 8).map((d: any) => (
                <div
                  key={d.id}
                  className="overflow-hidden rounded-lg border border-gray-100"
                >
                  <div className="relative aspect-video bg-gray-900">
                    {d.annotated_frame_url || d.frame_url ? (
                      <img
                        src={d.annotated_frame_url || d.frame_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Camera size={20} className="text-gray-600" />
                      </div>
                    )}
                    <span
                      className={`absolute right-1 top-1 rounded px-1 py-0.5 text-[9px] font-bold text-white ${
                        d.is_wet ? "bg-red-600" : "bg-green-600"
                      }`}
                    >
                      {d.is_wet ? "WET" : "DRY"}
                    </span>
                  </div>
                  <div className="px-2 py-1">
                    <p className="text-[10px] font-medium text-gray-600">
                      {Math.round((d.confidence || 0) * 100)}%
                    </p>
                    <p className="text-[9px] text-gray-400">
                      {d.timestamp ? timeAgo(d.timestamp) : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edge Agent Status */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Edge Agents
            </h3>
            <Link
              to="/edge"
              className="text-xs text-teal-600 hover:underline"
            >
              Manage
            </Link>
          </div>
          {(edge.agents || []).length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400">
              No edge agents configured
            </div>
          ) : (
            <div className="space-y-2">
              {(edge.agents || []).map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        a.status === "online"
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                    />
                    <span className="text-sm text-gray-700">
                      {a.name || a.id?.slice(0, 8)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    {a.cpu_percent != null && (
                      <span>CPU {a.cpu_percent}%</span>
                    )}
                    {a.ram_percent != null && (
                      <span>RAM {a.ram_percent}%</span>
                    )}
                    {a.last_heartbeat && (
                      <span>{timeAgo(a.last_heartbeat)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ROW 5: Quick Stats */}
      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-5 py-3">
        <Link
          to="/stores"
          className="text-xs text-gray-500 hover:text-teal-600"
        >
          {stores.total} stores
        </Link>
        <span className="text-gray-300">&middot;</span>
        <Link
          to="/dataset"
          className="text-xs text-gray-500 hover:text-teal-600"
        >
          {dataset.total_frames} dataset frames
        </Link>
        <span className="text-gray-300">&middot;</span>
        <Link
          to="/clips"
          className="text-xs text-gray-500 hover:text-teal-600"
        >
          {clips.total} clips
        </Link>
        <span className="text-gray-300">&middot;</span>
        <span className="text-xs text-gray-400">v{health?.version || "unknown"}</span>
      </div>
    </div>
  );
}
