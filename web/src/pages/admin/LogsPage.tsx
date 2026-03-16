import { useState, useCallback } from "react";
import { ScrollText, Loader2 } from "lucide-react";

import { useWebSocket } from "@/hooks/useWebSocket";

interface LogEntry {
  id: string;
  level: string;
  message: string;
  timestamp: string;
  source?: string;
}

const TABS = ["All", "Info", "Warning", "Error", "Audit"] as const;

export default function LogsPage() {
  const [tab, setTab] = useState<string>("All");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);

  const onMessage = useCallback((msg: unknown) => {
    if (paused) return;
    const data = msg as { type: string; level: string; message: string; timestamp: string };
    if (data.type === "log") {
      setLogs((prev) => [
        { id: `${Date.now()}-${Math.random()}`, level: data.level, message: data.message, timestamp: data.timestamp },
        ...prev,
      ].slice(0, 500));
    }
  }, [paused]);

  const { connected } = useWebSocket({ url: "/ws/system-logs", onMessage });

  const filtered = tab === "All" ? logs : logs.filter((l) => (l.level ?? 'info').toLowerCase() === tab.toLowerCase());

  function levelColor(level: string) {
    switch ((level ?? 'info').toLowerCase()) {
      case "error": return "text-[#DC2626] bg-[#FEE2E2]";
      case "warning": return "text-[#D97706] bg-[#FEF3C7]";
      case "info": return "text-[#2563EB] bg-[#DBEAFE]";
      default: return "text-[#78716C] bg-gray-100";
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">System Logs</h1>
          <p className="text-sm text-[#78716C]">
            {connected ? "Live streaming" : "Connecting..."} · {logs.length} entries
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPaused(!paused)}
            className={`rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm ${paused ? "bg-[#FEE2E2] text-[#DC2626]" : "text-[#1C1917] hover:bg-[#F1F0ED]"}`}>
            {paused ? "Paused" : "Pause"}
          </button>
          <button onClick={() => setLogs([])}
            className="rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm text-[#1C1917] hover:bg-[#F1F0ED]">
            Clear
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-[#E7E5E0]">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium ${tab === t ? "border-b-2 border-[#0D9488] text-[#0D9488]" : "text-[#78716C]"}`}>
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
          <ScrollText size={32} className="mb-2 text-[#78716C]" />
          <p className="text-sm text-[#78716C]">
            {logs.length === 0 ? "Waiting for log events..." : "No logs matching this filter"}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#E7E5E0] bg-[#0F172A]">
          <div className="max-h-[600px] overflow-y-auto p-3 font-mono text-xs">
            {filtered.map((log) => (
              <div key={log.id} className="flex gap-3 py-0.5">
                <span className="w-20 shrink-0 text-gray-500">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`w-14 shrink-0 rounded px-1 text-center text-[10px] font-semibold ${levelColor(log.level)}`}>
                  {(log.level ?? 'INFO').toUpperCase()}
                </span>
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
