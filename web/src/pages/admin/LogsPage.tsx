import { useState, useCallback, useEffect, useRef } from "react";
import {
  ScrollText,
  Download,
  Search,
  ArrowDownToLine,
  Pause,
  Trash2,
} from "lucide-react";

import api from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { UI_LIMITS } from "@/constants";

interface LogEntry {
  id: string;
  level: string;
  message: string;
  timestamp: string;
  source?: string;
}

const LEVEL_TABS = ["All", "Info", "Warning", "Error", "Audit"] as const;

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "detection", label: "Detection" },
  { value: "incident", label: "Incident" },
  { value: "edge", label: "Edge" },
  { value: "auth", label: "Auth" },
  { value: "notification", label: "Notification" },
  { value: "model", label: "Model" },
] as const;

function levelBadge(level: string) {
  switch ((level ?? "info").toLowerCase()) {
    case "error":
      return "bg-red-50 text-red-700 border-red-200";
    case "critical":
      return "bg-red-100 text-red-800 border-red-300 font-bold";
    case "warning":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "info":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "audit":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

function toCSV(logs: LogEntry[]): string {
  const header = "timestamp,level,source,message";
  const rows = logs.map((l) => {
    const ts = new Date(l.timestamp).toISOString();
    const msg = `"${(l.message ?? "").replace(/"/g, '""')}"`;
    return `${ts},${l.level ?? "info"},${l.source ?? ""},${msg}`;
  });
  return [header, ...rows].join("\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LogsPage() {
  const [tab, setTab] = useState<string>("All");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoFollow, setAutoFollow] = useState(true);
  const [paused, setPaused] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch historical logs on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchLogs() {
      try {
        setLoading(true);
        const params: Record<string, string | number> = { limit: 100 };
        if (sourceFilter) params.source = sourceFilter;
        const { data: resp } = await api.get("/logs", { params });
        if (cancelled) return;
        const fetched: LogEntry[] = (resp.data ?? []).map(
          (l: Record<string, unknown>, i: number) => ({
            id: (l.log_id as string) ?? `hist-${i}-${Date.now()}`,
            level: (l.level as string) ?? "info",
            message: (l.message as string) ?? "",
            timestamp: (l.timestamp as string) ?? new Date().toISOString(),
            source: (l.source as string) ?? "",
          })
        );
        setLogs(fetched);
      } catch (e) {
        console.error("Failed to fetch logs:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [sourceFilter]);

  // WebSocket streaming for new logs
  const onMessage = useCallback(
    (msg: unknown) => {
      if (paused) return;
      const data = msg as {
        type: string;
        level: string;
        message: string;
        timestamp: string;
        source?: string;
      };
      if (data.type === "log") {
        const entry: LogEntry = {
          id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          level: data.level ?? "info",
          message: data.message ?? "",
          timestamp: data.timestamp ?? new Date().toISOString(),
          source: data.source,
        };
        setLogs((prev) => [entry, ...prev].slice(0, UI_LIMITS.MAX_LOGS_IN_MEMORY));
      }
    },
    [paused]
  );

  const { connected } = useWebSocket({ url: "/ws/system-logs", onMessage });

  // Auto-scroll when following
  useEffect(() => {
    if (autoFollow && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoFollow]);

  // Apply all filters
  const filtered = logs.filter((l) => {
    if (tab !== "All" && (l.level ?? "info").toLowerCase() !== tab.toLowerCase()) {
      return false;
    }
    if (sourceFilter && (l.source ?? "").toLowerCase() !== sourceFilter.toLowerCase()) {
      return false;
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      const haystack = `${l.message} ${l.source ?? ""} ${l.level}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (startDate) {
      const logDate = new Date(l.timestamp);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (logDate < start) return false;
    }
    if (endDate) {
      const logDate = new Date(l.timestamp);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (logDate > end) return false;
    }
    return true;
  });

  function handleExportCSV() {
    const csv = toCSV(filtered);
    const ts = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `flooreye-logs-${ts}.csv`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Logs</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            <span className={`inline-flex items-center gap-1.5 ${connected ? "text-green-600" : "text-amber-600"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-amber-500"}`} />
              {connected ? "Live streaming" : "Connecting..."}
            </span>
            <span>&middot;</span>
            <span>{filtered.length} of {logs.length} entries</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAutoFollow(!autoFollow)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              autoFollow
                ? "border-[#0D9488] bg-[#0D9488] text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <ArrowDownToLine size={14} />
            {autoFollow ? "Following" : "Frozen"}
          </button>
          <button
            onClick={() => setPaused(!paused)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              paused
                ? "border-red-200 bg-red-50 text-red-600"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Pause size={14} />
            {paused ? "Paused" : "Pause"}
          </button>
          <button
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={14} />
            Export
          </button>
          <button
            onClick={() => setLogs([])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-10 w-56 rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20"
          />
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20"
          />
        </div>

        {(searchText || sourceFilter || startDate || endDate) && (
          <button
            onClick={() => {
              setSearchText("");
              setSourceFilter("");
              setStartDate("");
              setEndDate("");
            }}
            className="h-10 rounded-lg px-3 text-sm font-medium text-[#0D9488] hover:bg-teal-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Level tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {LEVEL_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-4 py-3 text-sm font-medium transition-colors ${
              tab === t
                ? "text-[#0D9488]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
            {tab === t && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0D9488]" />
            )}
          </button>
        ))}
      </div>

      {/* Log output */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3">
                <div className="h-3 w-36 rounded bg-gray-200" />
                <div className="h-5 w-14 rounded bg-gray-200" />
                <div className="h-3 w-16 rounded bg-gray-200" />
                <div className="h-3 flex-1 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50">
          <ScrollText size={32} className="mb-2 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">
            {logs.length === 0
              ? "Waiting for log events..."
              : "No logs matching current filters"}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {logs.length === 0 ? "Logs will appear here as they stream in" : "Try adjusting your filters"}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Level</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Message</th>
                </tr>
              </thead>
            </table>
          </div>
          <div
            ref={scrollRef}
            className="max-h-[600px] overflow-y-auto"
          >
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {filtered.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                      className="cursor-pointer transition-colors hover:bg-gray-50"
                    >
                      <td className="w-40 whitespace-nowrap px-4 py-2.5 font-mono text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="w-20 whitespace-nowrap px-4 py-2.5">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${levelBadge(log.level)}`}
                        >
                          {(log.level ?? "INFO").toUpperCase()}
                        </span>
                      </td>
                      <td className="w-24 whitespace-nowrap px-4 py-2.5 text-xs font-medium text-[#0D9488]">
                        {log.source || "\u2014"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">
                        <span className="line-clamp-1">{log.message}</span>
                      </td>
                    </tr>
                    {expandedLog === log.id && (
                      <tr key={`${log.id}-detail`}>
                        <td colSpan={4} className="bg-gray-50 px-6 py-3">
                          <pre className="whitespace-pre-wrap font-mono text-xs text-gray-600">
                            {log.message}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
