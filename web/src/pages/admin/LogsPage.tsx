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

function levelColor(level: string) {
  switch ((level ?? "info").toLowerCase()) {
    case "error":
      return "text-[#DC2626] bg-[#FEE2E2]";
    case "warning":
      return "text-[#D97706] bg-[#FEF3C7]";
    case "info":
      return "text-[#2563EB] bg-[#DBEAFE]";
    case "audit":
      return "text-[#7C3AED] bg-[#EDE9FE]";
    default:
      return "text-[#78716C] bg-gray-100";
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
      } catch {
        // Backend may not be available; leave logs empty
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
    // Level tab
    if (tab !== "All" && (l.level ?? "info").toLowerCase() !== tab.toLowerCase()) {
      return false;
    }
    // Source filter
    if (sourceFilter && (l.source ?? "").toLowerCase() !== sourceFilter.toLowerCase()) {
      return false;
    }
    // Text search (client-side)
    if (searchText) {
      const q = searchText.toLowerCase();
      const haystack = `${l.message} ${l.source ?? ""} ${l.level}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    // Date range
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
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">System Logs</h1>
          <p className="text-sm text-[#78716C]">
            {connected ? "Live streaming" : "Connecting..."} &middot;{" "}
            {filtered.length} of {logs.length} entries
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoFollow(!autoFollow)}
            className={`flex items-center gap-1.5 rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm ${
              autoFollow
                ? "bg-[#0D9488] text-white"
                : "text-[#1C1917] hover:bg-[#F1F0ED]"
            }`}
          >
            <ArrowDownToLine size={14} />
            {autoFollow ? "Following" : "Frozen"}
          </button>
          <button
            onClick={() => setPaused(!paused)}
            className={`flex items-center gap-1.5 rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm ${
              paused
                ? "bg-[#FEE2E2] text-[#DC2626]"
                : "text-[#1C1917] hover:bg-[#F1F0ED]"
            }`}
          >
            <Pause size={14} />
            {paused ? "Paused" : "Pause"}
          </button>
          <button
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm text-[#1C1917] hover:bg-[#F1F0ED] disabled:opacity-40"
          >
            <Download size={14} />
            Export CSV
          </button>
          <button
            onClick={() => setLogs([])}
            className="flex items-center gap-1.5 rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm text-[#1C1917] hover:bg-[#F1F0ED]"
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Text search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#78716C]"
          />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-9 rounded-md border border-[#E7E5E0] bg-white pl-8 pr-3 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#0D9488] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
          />
        </div>

        {/* Source dropdown */}
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="h-9 rounded-md border border-[#E7E5E0] bg-white px-3 text-sm text-[#1C1917] focus:border-[#0D9488] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-[#78716C]">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 rounded-md border border-[#E7E5E0] bg-white px-2 text-sm text-[#1C1917] focus:border-[#0D9488] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-[#78716C]">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 rounded-md border border-[#E7E5E0] bg-white px-2 text-sm text-[#1C1917] focus:border-[#0D9488] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
          />
        </div>

        {/* Clear filters */}
        {(searchText || sourceFilter || startDate || endDate) && (
          <button
            onClick={() => {
              setSearchText("");
              setSourceFilter("");
              setStartDate("");
              setEndDate("");
            }}
            className="h-9 rounded-md px-3 text-xs text-[#0D9488] hover:bg-[#F0FDFA]"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Level tabs */}
      <div className="mb-4 flex gap-1 border-b border-[#E7E5E0]">
        {LEVEL_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium ${
              tab === t
                ? "border-b-2 border-[#0D9488] text-[#0D9488]"
                : "text-[#78716C]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Log output */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
          <span className="ml-2 text-sm text-[#78716C]">Loading logs...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
          <ScrollText size={32} className="mb-2 text-[#78716C]" />
          <p className="text-sm text-[#78716C]">
            {logs.length === 0
              ? "Waiting for log events..."
              : "No logs matching current filters"}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#E7E5E0] bg-[#0F172A]">
          <div
            ref={scrollRef}
            className="max-h-[600px] overflow-y-auto p-3 font-mono text-xs"
          >
            {filtered.map((log) => (
              <div key={log.id} className="flex gap-3 py-0.5">
                <span className="w-36 shrink-0 text-gray-500">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <span
                  className={`w-14 shrink-0 rounded px-1 text-center text-[10px] font-semibold ${levelColor(
                    log.level
                  )}`}
                >
                  {(log.level ?? "INFO").toUpperCase()}
                </span>
                {log.source && (
                  <span className="w-20 shrink-0 truncate text-[#5EEAD4]">
                    [{log.source}]
                  </span>
                )}
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
