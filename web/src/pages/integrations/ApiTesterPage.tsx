import { useState, useCallback, useEffect } from "react";
import {
  Search,
  Send,
  Loader2,
  Copy,
  Trash2,
  Play,
  Save,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  Terminal,
  BookOpen,
} from "lucide-react";

import api from "@/lib/api";

/* ── Types ── */

interface HeaderPair {
  key: string;
  value: string;
}

interface SavedTest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: HeaderPair[];
  body: string;
  created_at: string;
}

interface ResponseData {
  status: number;
  statusText: string;
  data: unknown;
  time: number;
}

/* ── Endpoint Library ── */

interface EndpointEntry {
  method: string;
  path: string;
  label: string;
}

interface EndpointCategory {
  name: string;
  endpoints: EndpointEntry[];
}

const ENDPOINT_LIBRARY: EndpointCategory[] = [
  {
    name: "Auth",
    endpoints: [
      { method: "POST", path: "/api/v1/auth/login", label: "Login" },
      { method: "POST", path: "/api/v1/auth/register", label: "Register" },
      { method: "GET", path: "/api/v1/auth/me", label: "Get Current User" },
      { method: "POST", path: "/api/v1/auth/refresh", label: "Refresh Token" },
      { method: "POST", path: "/api/v1/auth/logout", label: "Logout" },
    ],
  },
  {
    name: "Stores",
    endpoints: [
      { method: "GET", path: "/api/v1/stores", label: "List Stores" },
      { method: "POST", path: "/api/v1/stores", label: "Create Store" },
      { method: "GET", path: "/api/v1/stores/{id}", label: "Get Store" },
      { method: "PUT", path: "/api/v1/stores/{id}", label: "Update Store" },
      { method: "DELETE", path: "/api/v1/stores/{id}", label: "Delete Store" },
    ],
  },
  {
    name: "Cameras",
    endpoints: [
      { method: "GET", path: "/api/v1/cameras", label: "List Cameras" },
      { method: "POST", path: "/api/v1/cameras", label: "Create Camera" },
      { method: "GET", path: "/api/v1/cameras/{id}", label: "Get Camera" },
      { method: "PUT", path: "/api/v1/cameras/{id}", label: "Update Camera" },
      { method: "DELETE", path: "/api/v1/cameras/{id}", label: "Delete Camera" },
    ],
  },
  {
    name: "Detection",
    endpoints: [
      { method: "POST", path: "/api/v1/detection/infer", label: "Run Inference" },
      { method: "GET", path: "/api/v1/detection/logs", label: "List Logs" },
      { method: "GET", path: "/api/v1/detection/logs/{id}", label: "Get Log" },
    ],
  },
  {
    name: "Events / Incidents",
    endpoints: [
      { method: "GET", path: "/api/v1/events", label: "List Events" },
      { method: "GET", path: "/api/v1/events/{id}", label: "Get Event" },
      { method: "PUT", path: "/api/v1/events/{id}", label: "Update Event" },
    ],
  },
  {
    name: "Detection Control",
    endpoints: [
      { method: "GET", path: "/api/v1/detection-control/settings", label: "Get Settings" },
      { method: "PUT", path: "/api/v1/detection-control/settings", label: "Update Settings" },
      { method: "GET", path: "/api/v1/detection-control/classes", label: "List Classes" },
      { method: "POST", path: "/api/v1/detection-control/classes", label: "Create Class" },
    ],
  },
  {
    name: "Integrations",
    endpoints: [
      { method: "GET", path: "/api/v1/integrations", label: "List Integrations" },
      { method: "PUT", path: "/api/v1/integrations/{service}", label: "Update Integration" },
      { method: "POST", path: "/api/v1/integrations/{service}/test", label: "Test Integration" },
      { method: "POST", path: "/api/v1/integrations/test-all", label: "Test All" },
    ],
  },
  {
    name: "Edge Agents",
    endpoints: [
      { method: "GET", path: "/api/v1/edge-agents", label: "List Agents" },
      { method: "POST", path: "/api/v1/edge-agents", label: "Create Agent" },
      { method: "GET", path: "/api/v1/edge-agents/{id}", label: "Get Agent" },
    ],
  },
  {
    name: "Notifications",
    endpoints: [
      { method: "GET", path: "/api/v1/notifications/rules", label: "List Rules" },
      { method: "POST", path: "/api/v1/notifications/rules", label: "Create Rule" },
      { method: "GET", path: "/api/v1/devices", label: "List Devices" },
    ],
  },
  {
    name: "ML Pipeline",
    endpoints: [
      { method: "GET", path: "/api/v1/ml/datasets", label: "List Datasets" },
      { method: "GET", path: "/api/v1/ml/models", label: "List Models" },
      { method: "GET", path: "/api/v1/ml/training-runs", label: "List Training Runs" },
      { method: "POST", path: "/api/v1/ml/training-runs", label: "Start Training" },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-[#16A34A] text-white",
  POST: "bg-[#2563EB] text-white",
  PUT: "bg-[#D97706] text-white",
  DELETE: "bg-[#DC2626] text-white",
};

const METHODS = ["GET", "POST", "PUT", "DELETE"] as const;

/* ── LocalStorage helpers ── */

const STORAGE_KEY = "flooreye_saved_tests";

function loadSavedTests(): SavedTest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistTests(tests: SavedTest[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tests));
}

/* ── Component ── */

export default function ApiTesterPage() {
  const [method, setMethod] = useState<string>("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<HeaderPair[]>([
    { key: "Content-Type", value: "application/json" },
  ]);
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [sending, setSending] = useState(false);
  const [endpointSearch, setEndpointSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(ENDPOINT_LIBRARY.map((c) => c.name))
  );

  // Saved tests
  const [savedTests, setSavedTests] = useState<SavedTest[]>(loadSavedTests);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  // Sync to localStorage
  useEffect(() => {
    persistTests(savedTests);
  }, [savedTests]);

  function selectEndpoint(ep: EndpointEntry) {
    setMethod(ep.method);
    setUrl(ep.path);
  }

  function toggleCategory(name: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function addHeader() {
    setHeaders([...headers, { key: "", value: "" }]);
  }

  function removeHeader(index: number) {
    setHeaders(headers.filter((_, i) => i !== index));
  }

  function updateHeader(index: number, field: "key" | "value", val: string) {
    const updated = [...headers];
    const existing = updated[index]!;
    updated[index] = { key: existing.key, value: existing.value, [field]: val };
    setHeaders(updated);
  }

  const sendRequest = useCallback(async () => {
    if (!url) return;
    setSending(true);
    setResponse(null);
    const start = performance.now();

    try {
      const customHeaders: Record<string, string> = {};
      for (const h of headers) {
        if (h.key.trim()) customHeaders[h.key.trim()] = h.value;
      }

      let parsedBody: unknown = undefined;
      if (body.trim() && (method === "POST" || method === "PUT")) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          parsedBody = body;
        }
      }

      // Strip /api/v1 prefix if present — api client already has baseURL
      const cleanUrl = url.startsWith("/api/v1") ? url.slice(7) : url;

      const res = await api.request({
        method,
        url: cleanUrl,
        headers: customHeaders,
        data: parsedBody,
      });

      setResponse({
        status: res.status,
        statusText: res.statusText,
        data: res.data,
        time: Math.round(performance.now() - start),
      });
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - start);
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as { response: { status: number; statusText: string; data: unknown } };
        setResponse({
          status: axiosErr.response.status,
          statusText: axiosErr.response.statusText,
          data: axiosErr.response.data,
          time: elapsed,
        });
      } else {
        setResponse({
          status: 0,
          statusText: "Network Error",
          data: { error: String(err) },
          time: elapsed,
        });
      }
    } finally {
      setSending(false);
    }
  }, [url, method, headers, body]);

  function saveTest() {
    if (!saveName.trim() || !url) return;
    const test: SavedTest = {
      id: crypto.randomUUID(),
      name: saveName.trim(),
      method,
      url,
      headers,
      body,
      created_at: new Date().toISOString(),
    };
    setSavedTests((prev) => [test, ...prev]);
    setSaveDialogOpen(false);
    setSaveName("");
  }

  function loadTest(test: SavedTest) {
    setMethod(test.method);
    setUrl(test.url);
    setHeaders(test.headers);
    setBody(test.body);
  }

  function deleteTest(id: string) {
    setSavedTests((prev) => prev.filter((t) => t.id !== id));
  }

  function buildCurl(): string {
    let curl = `curl -X ${method}`;
    for (const h of headers) {
      if (h.key.trim()) curl += ` -H '${h.key}: ${h.value}'`;
    }
    if (body.trim() && (method === "POST" || method === "PUT")) {
      curl += ` -d '${body}'`;
    }
    curl += ` '${window.location.origin}${url}'`;
    return curl;
  }

  function copyAsCurl() {
    navigator.clipboard.writeText(buildCurl());
  }

  function statusColor(code: number) {
    if (code >= 200 && code < 300) return "bg-[#16A34A] text-white";
    if (code >= 400 && code < 500) return "bg-[#D97706] text-white";
    return "bg-[#DC2626] text-white";
  }

  const filteredLibrary = ENDPOINT_LIBRARY.map((cat) => ({
    ...cat,
    endpoints: cat.endpoints.filter(
      (ep) =>
        !endpointSearch ||
        ep.label.toLowerCase().includes(endpointSearch.toLowerCase()) ||
        ep.path.toLowerCase().includes(endpointSearch.toLowerCase())
    ),
  })).filter((cat) => cat.endpoints.length > 0);

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">API Testing Console</h1>
        <p className="text-sm text-[#78716C]">Send requests to any API endpoint and inspect responses</p>
      </div>

      <div className="flex gap-4">
        {/* ── Left: Endpoint Library ── */}
        <div className="w-72 flex-shrink-0 rounded-lg border border-[#E7E5E0] bg-white p-3">
          <div className="mb-3 flex items-center gap-2">
            <BookOpen size={14} className="text-[#0D9488]" />
            <span className="text-sm font-semibold text-[#1C1917]">Endpoints</span>
          </div>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#78716C]" />
            <input
              value={endpointSearch}
              onChange={(e) => setEndpointSearch(e.target.value)}
              placeholder="Search endpoints..."
              className="w-full rounded-md border border-[#E7E5E0] pl-8 pr-3 py-1.5 text-xs outline-none focus:border-[#0D9488]"
            />
          </div>

          <div className="max-h-[calc(100vh-16rem)] space-y-1 overflow-y-auto">
            {filteredLibrary.map((cat) => (
              <div key={cat.name}>
                <button
                  onClick={() => toggleCategory(cat.name)}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-[#1C1917] hover:bg-[#F8F7F4]"
                >
                  {expandedCategories.has(cat.name) ? (
                    <ChevronDown size={10} />
                  ) : (
                    <ChevronRight size={10} />
                  )}
                  {cat.name}
                  <span className="ml-auto text-[9px] text-[#78716C]">{cat.endpoints.length}</span>
                </button>
                {expandedCategories.has(cat.name) &&
                  cat.endpoints.map((ep) => (
                    <button
                      key={`${ep.method}-${ep.path}`}
                      onClick={() => selectEndpoint(ep)}
                      className="ml-3 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#F8F7F4] hover:text-[#1C1917]"
                    >
                      <span
                        className={`inline-block w-12 rounded px-1 py-0.5 text-center text-[9px] font-bold ${METHOD_COLORS[ep.method]}`}
                      >
                        {ep.method}
                      </span>
                      <span className="truncate">{ep.label}</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── Center: Request Builder + Response ── */}
        <div className="flex-1 space-y-4">
          {/* URL bar */}
          <div className="flex gap-2 rounded-lg border border-[#E7E5E0] bg-white p-3">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={`rounded-md px-2 py-1.5 text-xs font-bold outline-none ${METHOD_COLORS[method]} cursor-pointer`}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/api/v1/stores"
              className="flex-1 rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm font-mono outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
            />
            <button
              onClick={sendRequest}
              disabled={sending || !url}
              className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send
            </button>
            <button
              onClick={() => setSaveDialogOpen(true)}
              disabled={!url}
              className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-3 py-1.5 text-xs text-[#78716C] hover:bg-[#F1F0ED] disabled:opacity-50"
            >
              <Save size={12} /> Save
            </button>
          </div>

          {/* Headers */}
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1C1917]">Headers</span>
              <button onClick={addHeader} className="text-[#0D9488] hover:text-[#0F766E]">
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-1.5">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={h.key}
                    onChange={(e) => updateHeader(i, "key", e.target.value)}
                    placeholder="Header name"
                    className="w-40 rounded-md border border-[#E7E5E0] px-2 py-1 text-xs outline-none focus:border-[#0D9488]"
                  />
                  <input
                    value={h.value}
                    onChange={(e) => updateHeader(i, "value", e.target.value)}
                    placeholder="Value"
                    className="flex-1 rounded-md border border-[#E7E5E0] px-2 py-1 text-xs outline-none focus:border-[#0D9488]"
                  />
                  <button onClick={() => removeHeader(i)} className="text-[#78716C] hover:text-[#DC2626]">
                    <Minus size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          {(method === "POST" || method === "PUT") && (
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-3">
              <span className="mb-2 block text-xs font-semibold text-[#1C1917]">Request Body (JSON)</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{ "key": "value" }'
                rows={6}
                className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 font-mono text-xs outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
              />
            </div>
          )}

          {/* Response */}
          {response && (
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-[#1C1917]">Response</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor(response.status)}`}>
                    {response.status} {response.statusText}
                  </span>
                  <span className="text-[10px] text-[#78716C]">{response.time}ms</span>
                </div>
                <button
                  onClick={copyAsCurl}
                  className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-2 py-1 text-[10px] text-[#78716C] hover:bg-[#F1F0ED]"
                >
                  <Copy size={10} /> Copy as cURL
                </button>
              </div>
              <pre className="max-h-96 overflow-auto rounded-md bg-[#F8F7F4] p-3 font-mono text-xs text-[#1C1917]">
                {JSON.stringify(response.data, null, 2)}
              </pre>
            </div>
          )}

          {!response && !sending && (
            <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-[#E7E5E0] bg-white text-[#78716C]">
              <Terminal size={24} className="mb-2" />
              <span className="text-sm">Select an endpoint or enter a URL and click Send</span>
            </div>
          )}
        </div>

        {/* ── Right: Saved Tests ── */}
        <div className="w-64 flex-shrink-0 rounded-lg border border-[#E7E5E0] bg-white p-3">
          <div className="mb-3 flex items-center gap-2">
            <Save size={14} className="text-[#0D9488]" />
            <span className="text-sm font-semibold text-[#1C1917]">Saved Tests</span>
          </div>

          {savedTests.length === 0 ? (
            <p className="text-xs text-[#78716C]">No saved tests yet. Build a request and click Save.</p>
          ) : (
            <div className="max-h-[calc(100vh-16rem)] space-y-2 overflow-y-auto">
              {savedTests.map((test) => (
                <div key={test.id} className="rounded-md border border-[#E7E5E0] p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`inline-block rounded px-1 py-0.5 text-[8px] font-bold ${METHOD_COLORS[test.method]}`}>
                      {test.method}
                    </span>
                    <span className="truncate text-xs font-medium text-[#1C1917]">{test.name}</span>
                  </div>
                  <p className="mb-2 truncate font-mono text-[10px] text-[#78716C]">{test.url}</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => loadTest(test)}
                      className="flex flex-1 items-center justify-center gap-1 rounded border border-[#E7E5E0] px-1.5 py-1 text-[10px] text-[#1C1917] hover:bg-[#F1F0ED]"
                    >
                      <Play size={9} /> Load
                    </button>
                    <button
                      onClick={() => deleteTest(test.id)}
                      className="flex items-center justify-center rounded border border-[#E7E5E0] px-1.5 py-1 text-[10px] text-[#DC2626] hover:bg-[#FEE2E2]"
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Save Dialog */}
      {saveDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-lg bg-white p-4 shadow-lg">
            <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">Save Test</h3>
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Test name..."
              autoFocus
              className="mb-3 w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
              onKeyDown={(e) => e.key === "Enter" && saveTest()}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setSaveDialogOpen(false); setSaveName(""); }}
                className="rounded-md border border-[#E7E5E0] px-3 py-1.5 text-xs font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
              >
                Cancel
              </button>
              <button
                onClick={saveTest}
                disabled={!saveName.trim()}
                className="rounded-md bg-[#0D9488] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
