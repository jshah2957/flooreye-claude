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
import HelpSection from "@/components/ui/HelpSection";
import { PAGE_HELP } from "@/constants/help";

/* -- Types -- */

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

/* -- Endpoint Library -- */

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
      { method: "GET", path: "/api/v1/auth/me", label: "Get Current User" },
      { method: "PUT", path: "/api/v1/auth/me", label: "Update Profile" },
      { method: "POST", path: "/api/v1/auth/refresh", label: "Refresh Token" },
      { method: "POST", path: "/api/v1/auth/logout", label: "Logout" },
      { method: "POST", path: "/api/v1/auth/register", label: "Register User" },
      { method: "GET", path: "/api/v1/auth/users", label: "List Users" },
      { method: "POST", path: "/api/v1/auth/forgot-password", label: "Forgot Password" },
      { method: "POST", path: "/api/v1/auth/reset-password", label: "Reset Password" },
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
      { method: "GET", path: "/api/v1/stores/stats", label: "Dashboard Stats" },
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
      { method: "POST", path: "/api/v1/cameras/{id}/test", label: "Test Connection" },
      { method: "POST", path: "/api/v1/cameras/{id}/roi", label: "Set ROI" },
      { method: "GET", path: "/api/v1/cameras/{id}/roi", label: "Get ROI" },
      { method: "POST", path: "/api/v1/cameras/{id}/dry-reference", label: "Capture Dry Reference" },
      { method: "PUT", path: "/api/v1/cameras/{id}/inference-mode", label: "Set Inference Mode" },
    ],
  },
  {
    name: "Detection",
    endpoints: [
      { method: "POST", path: "/api/v1/detection/run/{camera_id}", label: "Run Detection" },
      { method: "GET", path: "/api/v1/detection/history", label: "Detection History" },
      { method: "GET", path: "/api/v1/detection/history/{id}", label: "Get Detection" },
      { method: "POST", path: "/api/v1/detection/history/{id}/flag", label: "Flag Detection" },
      { method: "GET", path: "/api/v1/detection/flagged", label: "List Flagged" },
      { method: "GET", path: "/api/v1/detection/flagged/export", label: "Export Flagged" },
      { method: "GET", path: "/api/v1/continuous/status", label: "Continuous Status" },
      { method: "POST", path: "/api/v1/continuous/start", label: "Start Continuous" },
      { method: "POST", path: "/api/v1/continuous/stop", label: "Stop Continuous" },
    ],
  },
  {
    name: "Events / Incidents",
    endpoints: [
      { method: "GET", path: "/api/v1/events", label: "List Events" },
      { method: "GET", path: "/api/v1/events/{id}", label: "Get Event" },
      { method: "PUT", path: "/api/v1/events/{id}/acknowledge", label: "Acknowledge" },
      { method: "PUT", path: "/api/v1/events/{id}/resolve", label: "Resolve" },
      { method: "PUT", path: "/api/v1/events/{id}/notes", label: "Update Notes" },
      { method: "GET", path: "/api/v1/events/export", label: "Export Events" },
    ],
  },
  {
    name: "Detection Control",
    endpoints: [
      { method: "GET", path: "/api/v1/detection-control/settings?scope=global", label: "Get Global Settings" },
      { method: "PUT", path: "/api/v1/detection-control/settings", label: "Update Settings" },
      { method: "DELETE", path: "/api/v1/detection-control/settings?scope=camera&scope_id={id}", label: "Reset Settings" },
      { method: "GET", path: "/api/v1/detection-control/effective/{camera_id}", label: "Effective Settings" },
      { method: "GET", path: "/api/v1/detection-control/inheritance/{camera_id}", label: "Inheritance Chain" },
      { method: "GET", path: "/api/v1/detection-control/classes", label: "List Classes" },
      { method: "POST", path: "/api/v1/detection-control/classes", label: "Create Class" },
      { method: "GET", path: "/api/v1/detection-control/history", label: "Change History" },
      { method: "GET", path: "/api/v1/detection-control/export?scope=global", label: "Export Config" },
    ],
  },
  {
    name: "Roboflow",
    endpoints: [
      { method: "GET", path: "/api/v1/roboflow/workspace", label: "Browse Workspace" },
      { method: "GET", path: "/api/v1/roboflow/projects/{project_id}/versions", label: "Project Versions" },
      { method: "POST", path: "/api/v1/roboflow/select-model", label: "Select & Deploy Model" },
      { method: "GET", path: "/api/v1/roboflow/classes", label: "Get Classes" },
      { method: "POST", path: "/api/v1/roboflow/pull-model", label: "Pull Model" },
      { method: "POST", path: "/api/v1/roboflow/pull-classes", label: "Pull Classes" },
    ],
  },
  {
    name: "Models",
    endpoints: [
      { method: "GET", path: "/api/v1/models", label: "List Models" },
      { method: "POST", path: "/api/v1/models", label: "Create Model" },
      { method: "GET", path: "/api/v1/models/{id}", label: "Get Model" },
      { method: "POST", path: "/api/v1/models/{id}/promote", label: "Promote Model" },
      { method: "DELETE", path: "/api/v1/models/{id}", label: "Delete Model" },
    ],
  },
  {
    name: "Dataset",
    endpoints: [
      { method: "GET", path: "/api/v1/dataset/frames", label: "List Frames" },
      { method: "GET", path: "/api/v1/dataset/stats", label: "Dataset Stats" },
      { method: "GET", path: "/api/v1/dataset/export/coco", label: "Export COCO" },
      { method: "GET", path: "/api/v1/dataset/sync-settings", label: "Sync Settings" },
    ],
  },
  {
    name: "Edge Agents",
    endpoints: [
      { method: "GET", path: "/api/v1/edge/agents", label: "List Agents" },
      { method: "POST", path: "/api/v1/edge/provision", label: "Provision Agent" },
      { method: "GET", path: "/api/v1/edge/agents/{id}", label: "Get Agent" },
      { method: "DELETE", path: "/api/v1/edge/agents/{id}", label: "Delete Agent" },
      { method: "POST", path: "/api/v1/edge/agents/{id}/command", label: "Send Command" },
      { method: "POST", path: "/api/v1/edge/agents/{id}/push-model", label: "Push Model" },
      { method: "POST", path: "/api/v1/edge/agents/push-classes", label: "Push Classes" },
    ],
  },
  {
    name: "Integrations",
    endpoints: [
      { method: "GET", path: "/api/v1/integrations", label: "List Integrations" },
      { method: "GET", path: "/api/v1/integrations/status", label: "Integration Status" },
      { method: "PUT", path: "/api/v1/integrations/{service}", label: "Update Integration" },
      { method: "POST", path: "/api/v1/integrations/{service}/test", label: "Test Integration" },
      { method: "POST", path: "/api/v1/integrations/test-all", label: "Test All" },
    ],
  },
  {
    name: "Notifications",
    endpoints: [
      { method: "GET", path: "/api/v1/notifications/rules", label: "List Rules" },
      { method: "POST", path: "/api/v1/notifications/rules", label: "Create Rule" },
      { method: "GET", path: "/api/v1/notifications/deliveries", label: "List Deliveries" },
    ],
  },
  {
    name: "Devices",
    endpoints: [
      { method: "GET", path: "/api/v1/devices", label: "List Devices" },
      { method: "POST", path: "/api/v1/devices", label: "Create Device" },
      { method: "GET", path: "/api/v1/devices/{id}", label: "Get Device" },
      { method: "POST", path: "/api/v1/devices/{id}/trigger", label: "Trigger Device" },
    ],
  },
  {
    name: "Mobile",
    endpoints: [
      { method: "GET", path: "/api/v1/mobile/dashboard", label: "Dashboard" },
      { method: "GET", path: "/api/v1/mobile/stores", label: "Stores" },
      { method: "GET", path: "/api/v1/mobile/alerts", label: "Alerts" },
      { method: "GET", path: "/api/v1/mobile/analytics", label: "Analytics" },
      { method: "GET", path: "/api/v1/mobile/analytics/heatmap", label: "Heatmap" },
    ],
  },
  {
    name: "Clips & Live",
    endpoints: [
      { method: "GET", path: "/api/v1/clips", label: "List Clips" },
      { method: "GET", path: "/api/v1/live/stream/{camera_id}/frame", label: "Live Frame" },
    ],
  },
  {
    name: "Organizations",
    endpoints: [
      { method: "GET", path: "/api/v1/organizations", label: "List Organizations" },
      { method: "POST", path: "/api/v1/organizations", label: "Create Organization" },
      { method: "GET", path: "/api/v1/organizations/{id}", label: "Get Organization" },
    ],
  },
  {
    name: "System",
    endpoints: [
      { method: "GET", path: "/api/v1/logs", label: "System Logs" },
      { method: "GET", path: "/api/v1/audit-logs", label: "Audit Logs" },
      { method: "GET", path: "/api/v1/storage/settings", label: "Storage Settings" },
      { method: "POST", path: "/api/v1/storage/test", label: "Test Storage" },
      { method: "GET", path: "/api/v1/validation/health", label: "Validation Health" },
      { method: "GET", path: "/api/v1/reports/compliance", label: "Compliance Report" },
      { method: "GET", path: "/api/v1/health", label: "API Health" },
    ],
  },
  {
    name: "Inference Test",
    endpoints: [
      { method: "POST", path: "/api/v1/inference/test", label: "Test ONNX Inference" },
      { method: "POST", path: "/api/v1/inference/test-upload", label: "Test with Upload" },
      { method: "POST", path: "/api/v1/roboflow/test-inference", label: "Test Roboflow" },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-green-600 text-white",
  POST: "bg-blue-600 text-white",
  PUT: "bg-amber-500 text-white",
  DELETE: "bg-red-600 text-white",
};

const METHOD_DOT: Record<string, string> = {
  GET: "bg-green-500",
  POST: "bg-blue-500",
  PUT: "bg-amber-500",
  DELETE: "bg-red-500",
};

const METHODS = ["GET", "POST", "PUT", "DELETE"] as const;

/* -- LocalStorage helpers -- */

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

/* -- Component -- */

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

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<"endpoints" | "request" | "saved">("request");

  // Sync to localStorage
  useEffect(() => {
    persistTests(savedTests);
  }, [savedTests]);

  function selectEndpoint(ep: EndpointEntry) {
    setMethod(ep.method);
    setUrl(ep.path);
    setMobileTab("request");
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

      // Strip /api/v1 prefix if present -- api client already has baseURL
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
    setMobileTab("request");
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
    if (code >= 200 && code < 300) return "bg-green-600 text-white";
    if (code >= 400 && code < 500) return "bg-amber-500 text-white";
    return "bg-red-600 text-white";
  }

  const filteredLibrary = ENDPOINT_LIBRARY.map((cat) => ({
    ...cat,
    endpoints: cat.endpoints.filter(
      (ep) =>
        !endpointSearch ||
        (ep.label ?? '').toLowerCase().includes(endpointSearch.toLowerCase()) ||
        (ep.path ?? '').toLowerCase().includes(endpointSearch.toLowerCase())
    ),
  })).filter((cat) => cat.endpoints.length > 0);

  /* -- Shared sub-panels -- */

  function renderEndpointLibrary() {
    return (
      <>
        <div className="mb-3 flex items-center gap-2">
          <BookOpen size={15} className="text-teal-600" />
          <span className="text-sm font-semibold text-gray-900">Endpoints</span>
        </div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={endpointSearch}
            onChange={(e) => setEndpointSearch(e.target.value)}
            placeholder="Search endpoints..."
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-xs outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        <div className="max-h-[calc(100vh-16rem)] space-y-0.5 overflow-y-auto">
          {filteredLibrary.length === 0 && (
            <p className="py-4 text-center text-xs text-gray-400">No endpoints match your search</p>
          )}
          {filteredLibrary.map((cat) => (
            <div key={cat.name}>
              <button
                onClick={() => toggleCategory(cat.name)}
                className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                {expandedCategories.has(cat.name) ? (
                  <ChevronDown size={12} className="text-gray-400" />
                ) : (
                  <ChevronRight size={12} className="text-gray-400" />
                )}
                {cat.name}
                <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-500">{cat.endpoints.length}</span>
              </button>
              {expandedCategories.has(cat.name) &&
                cat.endpoints.map((ep) => (
                  <button
                    key={`${ep.method}-${ep.path}`}
                    onClick={() => selectEndpoint(ep)}
                    className="ml-4 flex w-[calc(100%-1rem)] items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                  >
                    <span
                      className={`inline-block w-14 rounded-md px-1.5 py-0.5 text-center text-[9px] font-bold ${METHOD_COLORS[ep.method]}`}
                    >
                      {ep.method}
                    </span>
                    <span className="truncate">{ep.label}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderSavedTests() {
    return (
      <>
        <div className="mb-3 flex items-center gap-2">
          <Save size={15} className="text-teal-600" />
          <span className="text-sm font-semibold text-gray-900">Saved Tests</span>
        </div>

        {savedTests.length === 0 ? (
          <div className="py-6 text-center">
            <Save size={24} className="mx-auto mb-2 text-gray-300" />
            <p className="text-xs text-gray-500">No saved tests yet.</p>
            <p className="text-xs text-gray-400">Build a request and click Save.</p>
          </div>
        ) : (
          <div className="max-h-[calc(100vh-16rem)] space-y-2 overflow-y-auto">
            {savedTests.map((test) => (
              <div key={test.id} className="rounded-xl border border-gray-200 p-3 transition hover:border-gray-300">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold ${METHOD_COLORS[test.method]}`}>
                    {test.method}
                  </span>
                  <span className="truncate text-xs font-medium text-gray-900">{test.name}</span>
                </div>
                <p className="mb-2.5 truncate font-mono text-[10px] text-gray-400">{test.url}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadTest(test)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[10px] font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    <Play size={10} /> Load
                  </button>
                  <button
                    onClick={() => deleteTest(test.id)}
                    className="flex items-center justify-center rounded-lg border border-gray-200 px-2 py-1.5 text-[10px] text-red-500 transition hover:bg-red-50"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">API Testing Console</h1>
        <p className="mt-1 text-sm text-gray-500">Send requests to any FloorEye API endpoint. Your auth token is automatically included.</p>
        <HelpSection title={PAGE_HELP.apiTester.title}>
          {PAGE_HELP.apiTester.content.map((line, i) => <p key={i}>{line}</p>)}
        </HelpSection>
      </div>

      {/* Mobile Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1 lg:hidden">
        {([
          { key: "endpoints", label: "Endpoints" },
          { key: "request", label: "Request" },
          { key: "saved", label: "Saved" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setMobileTab(t.key)}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
              mobileTab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Endpoint Library */}
        <div className={`lg:col-span-3 ${mobileTab !== "endpoints" ? "hidden lg:block" : ""}`}>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            {renderEndpointLibrary()}
          </div>
        </div>

        {/* Center: Request Builder + Response */}
        <div className={`lg:col-span-6 space-y-4 ${mobileTab !== "request" ? "hidden lg:block" : ""}`}>
          {/* URL bar */}
          <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={`rounded-lg px-3 py-2 text-xs font-bold outline-none cursor-pointer ${METHOD_COLORS[method]}`}
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
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
            <div className="flex gap-2">
              <button
                onClick={sendRequest}
                disabled={sending || !url}
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send
              </button>
              <button
                onClick={() => setSaveDialogOpen(true)}
                disabled={!url}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <Save size={13} /> Save
              </button>
            </div>
          </div>

          {/* Headers */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-900">Headers</span>
              <button onClick={addHeader} className="rounded-lg p-1 text-teal-600 transition hover:bg-teal-50">
                <Plus size={15} />
              </button>
            </div>
            <div className="space-y-2">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={h.key}
                    onChange={(e) => updateHeader(i, "key", e.target.value)}
                    placeholder="Header name"
                    className="w-36 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none transition focus:border-teal-500"
                  />
                  <input
                    value={h.value}
                    onChange={(e) => updateHeader(i, "value", e.target.value)}
                    placeholder="Value"
                    className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none transition focus:border-teal-500"
                  />
                  <button onClick={() => removeHeader(i)} className="rounded-lg p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-500">
                    <Minus size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          {(method === "POST" || method === "PUT") && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <span className="mb-2.5 block text-xs font-semibold text-gray-900">Request Body (JSON)</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{ "key": "value" }'
                rows={6}
                className="w-full rounded-lg bg-gray-900 px-4 py-3 font-mono text-xs text-green-400 outline-none placeholder:text-gray-600 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          )}

          {/* Response */}
          {response && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-900">Response</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusColor(response.status)}`}>
                    {response.status} {response.statusText}
                  </span>
                  <span className="text-[10px] text-gray-400">{response.time}ms</span>
                </div>
                <button
                  onClick={copyAsCurl}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-[10px] text-gray-500 transition hover:bg-gray-50"
                >
                  <Copy size={10} /> Copy as cURL
                </button>
              </div>
              <pre className="max-h-96 overflow-auto rounded-lg bg-gray-900 p-4 font-mono text-xs text-green-400">
                {JSON.stringify(response.data, null, 2)}
              </pre>
            </div>
          )}

          {!response && !sending && (
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white text-gray-400">
              <Terminal size={28} className="mb-2" />
              <span className="text-sm">Select an endpoint or enter a URL and click Send</span>
            </div>
          )}
        </div>

        {/* Right: Saved Tests */}
        <div className={`lg:col-span-3 ${mobileTab !== "saved" ? "hidden lg:block" : ""}`}>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            {renderSavedTests()}
          </div>
        </div>
      </div>

      {/* Save Dialog */}
      {saveDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-80 rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Save Test</h3>
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Test name..."
              autoFocus
              className="mb-4 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              onKeyDown={(e) => e.key === "Enter" && saveTest()}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setSaveDialogOpen(false); setSaveName(""); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveTest}
                disabled={!saveName.trim()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
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
