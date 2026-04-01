import { useQuery } from "@tanstack/react-query";
import { Brain, Database, Image, CheckCircle, XCircle, Loader2, BarChart3, Settings2, HardDrive } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import api from "@/lib/api";

interface LearningStats {
  total_frames: number;
  by_source: Record<string, number>;
  by_label_status: Record<string, number>;
  by_admin_verdict: Record<string, number>;
  class_distribution: Record<string, number>;
  dataset_versions: number;
  training_jobs: number;
  config: Record<string, unknown>;
  storage_usage_mb: number;
  storage_quota_mb: number;
}

interface CaptureDay {
  date: string;
  count: number;
}

export default function LearningDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["learning-stats"],
    queryFn: async () => {
      const res = await api.get("/learning/stats");
      return res.data.data as LearningStats;
    },
    refetchInterval: 30_000,
  });

  const { data: chartData } = useQuery({
    queryKey: ["learning-captures-chart"],
    queryFn: async () => {
      const res = await api.get("/learning/analytics/captures-by-day");
      return res.data.data as CaptureDay[];
    },
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-teal-600" />
      </div>
    );
  }

  const enabled = data.config?.enabled !== false;
  const sources = data.by_source;
  const verdicts = data.by_admin_verdict;
  const classes = data.class_distribution;
  const topClasses = Object.entries(classes).sort(([, a], [, b]) => b - a).slice(0, 10);
  const maxClassCount = topClasses.length > 0 ? topClasses[0][1] : 1;

  const storagePct = data.storage_quota_mb > 0 ? Math.min(100, (data.storage_usage_mb / data.storage_quota_mb) * 100) : 0;
  const storageColor = storagePct > 90 ? "bg-red-500" : storagePct > 70 ? "bg-amber-500" : "bg-teal-500";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Learning System</h1>
          <p className="mt-1 text-sm text-gray-500">
            {enabled ? (
              <span className="text-green-600">Active — capturing data from detections and admin feedback</span>
            ) : (
              <span className="text-amber-600">Disabled — enable in settings to start capturing</span>
            )}
          </p>
        </div>
        <button
          onClick={() => navigate("/learning/settings")}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Settings2 size={14} /> Settings
        </button>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500"><Image size={14} /> Total Frames</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{data.total_frames.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500"><Database size={14} /> Dataset Versions</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{data.dataset_versions}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500"><Brain size={14} /> Training Jobs</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{data.training_jobs}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500"><BarChart3 size={14} /> Classes</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{Object.keys(classes).length}</div>
        </div>
      </div>

      {/* Storage Usage Bar */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-gray-600"><HardDrive size={14} /> Storage</div>
          <span className="font-medium text-gray-700">
            {data.storage_usage_mb >= 1000
              ? `${(data.storage_usage_mb / 1000).toFixed(1)} GB`
              : `${data.storage_usage_mb.toFixed(0)} MB`}
            {" / "}
            {data.storage_quota_mb >= 1000
              ? `${(data.storage_quota_mb / 1000).toFixed(0)} GB`
              : `${data.storage_quota_mb} MB`}
            {` (${storagePct.toFixed(1)}%)`}
          </span>
        </div>
        <div className="mt-2 h-3 rounded-full bg-gray-100">
          <div className={`h-3 rounded-full transition-all ${storageColor}`} style={{ width: `${Math.max(1, storagePct)}%` }} />
        </div>
      </div>

      {/* Captures Over Time Chart */}
      {(chartData ?? []).length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Captures Per Day (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorCaptures" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0D9488" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                labelFormatter={(d) => `Date: ${d}`}
              />
              <Area type="monotone" dataKey="count" stroke="#0D9488" fill="url(#colorCaptures)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Source Breakdown + Feedback */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Frames by Source</h3>
          <div className="space-y-2">
            {[
              { key: "edge_detection", label: "Edge Detections", color: "bg-green-500" },
              { key: "cloud_detection", label: "Cloud Detections", color: "bg-blue-500" },
              { key: "roboflow_training", label: "Roboflow Training", color: "bg-purple-500" },
              { key: "manual_upload", label: "Manual Upload", color: "bg-amber-500" },
            ].map(({ key, label, color }) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
                  <span className="text-gray-600">{label}</span>
                </div>
                <span className="font-semibold text-gray-900">{(sources[key] ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Admin Feedback</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className="text-green-500" />
                <span className="text-gray-600">True Positives</span>
              </div>
              <span className="font-semibold text-green-700">{(verdicts.true_positive ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <XCircle size={14} className="text-red-500" />
                <span className="text-gray-600">False Positives</span>
              </div>
              <span className="font-semibold text-red-700">{(verdicts.false_positive ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="text-gray-400" />
                <span className="text-gray-600">Pending Review</span>
              </div>
              <span className="font-semibold text-gray-500">
                {(data.total_frames - (verdicts.true_positive ?? 0) - (verdicts.false_positive ?? 0) - (verdicts.uncertain ?? 0)).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Class Distribution */}
      {topClasses.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Class Distribution (Top 10)</h3>
          <div className="space-y-2">
            {topClasses.map(([name, count]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-32 truncate text-xs font-medium text-gray-600">{name}</span>
                <div className="flex-1">
                  <div className="h-5 rounded-full bg-gray-100">
                    <div
                      className="h-5 rounded-full bg-teal-500 transition-all"
                      style={{ width: `${Math.max(2, (count / maxClassCount) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="w-16 text-right text-xs font-semibold text-gray-700">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
