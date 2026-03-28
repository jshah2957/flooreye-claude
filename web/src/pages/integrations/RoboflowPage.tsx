import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Cloud, Loader2, Play, CheckCircle2, XCircle, Eye, EyeOff, Layers } from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/components/ui/Toast";

export default function RoboflowPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [testSucceeded, setTestSucceeded] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const { data: modelsData } = useQuery({
    queryKey: ["production-model"],
    queryFn: async () => {
      const res = await api.get("/models", { params: { status: "production", limit: 1 } });
      return res.data;
    },
  });
  const prodModel = modelsData?.data?.[0] ?? null;

  const { data: integration, isLoading } = useQuery({
    queryKey: ["integration-roboflow"],
    queryFn: async () => {
      try {
        const res = await api.get("/integrations/roboflow");
        return res.data.data;
      } catch (e) { console.error("Failed to load Roboflow config:", e); return null; }
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => api.put("/integrations/roboflow", {
      config: { api_key: apiKey, model_id: modelId, api_url: apiUrl },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-roboflow"] });
      success("Roboflow config saved");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to save Roboflow config");
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.post("/integrations/roboflow/test"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-roboflow"] });
      setTestSucceeded(true);
      success("Roboflow test passed");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Roboflow test failed");
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={28} className="animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Roboflow Integration</h1>
          <p className="mt-1 text-sm text-gray-500">Configure the Roboflow inference API connection</p>
        </div>
        {(integration || testSucceeded) && (
          <button
            onClick={() => navigate("/integrations/roboflow/browse")}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
          >
            <Layers size={16} />
            Browse Models
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Connection Settings */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-gray-900">Connection Settings</h2>
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-900">API Key *</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={integration?.config?.api_key ? "********" : "Enter API key"}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 pr-10 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-900">Model ID</label>
              <input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder={integration?.config?.model_id ?? "e.g. wet-floor-detection/3"}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-900">API URL</label>
              <input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!apiKey || saveMutation.isPending}
                className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
              >
                {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Save
              </button>
              <button
                onClick={() => testMutation.mutate()}
                disabled={(!integration && !apiKey) || testMutation.isPending}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {testMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Test Connection
              </button>
            </div>
          </div>
        </div>

        {/* Right: Status */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-gray-900">Status</h2>
          {integration ? (
            <div className="space-y-5">
              {/* Large status indicator */}
              <div className="flex items-center gap-4">
                <div className={`relative flex h-14 w-14 items-center justify-center rounded-2xl ${
                  integration.status === "active" || integration.status === "connected"
                    ? "bg-green-50"
                    : integration.status === "error"
                    ? "bg-red-50"
                    : "bg-gray-50"
                }`}>
                  <Cloud size={24} className={
                    integration.status === "active" || integration.status === "connected"
                      ? "text-green-600"
                      : integration.status === "error"
                      ? "text-red-500"
                      : "text-gray-400"
                  } />
                  {(integration.status === "active" || integration.status === "connected") && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-4 w-4 rounded-full bg-green-500" />
                    </span>
                  )}
                </div>
                <div>
                  <StatusBadge status={integration.status} />
                  {integration.last_tested && (
                    <p className="mt-1 text-xs text-gray-500">
                      Last tested {new Date(integration.last_tested).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Details */}
              <dl className="space-y-3 text-sm">
                {integration.last_test_result && (
                  <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                    <dt className="text-gray-500">Test Result</dt>
                    <dd className="flex items-center gap-1.5 font-medium">
                      {integration.last_test_result === "success" ? (
                        <CheckCircle2 size={16} className="text-green-500" />
                      ) : (
                        <XCircle size={16} className="text-red-500" />
                      )}
                      <span className={integration.last_test_result === "success" ? "text-green-700" : "text-red-600"}>
                        {integration.last_test_result}
                      </span>
                    </dd>
                  </div>
                )}
                {integration.last_test_response_ms && (
                  <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                    <dt className="text-gray-500">Latency</dt>
                    <dd className="font-semibold text-gray-900">{integration.last_test_response_ms.toFixed(0)}ms</dd>
                  </div>
                )}
                {integration?.last_test_result === "success" && (
                  <p className="text-xs text-green-600">Connected to workspace</p>
                )}
              </dl>
              {prodModel && (
                <div className="mt-3 rounded-lg bg-teal-50 p-3">
                  <p className="text-xs font-medium text-teal-700">Current Model</p>
                  <p className="text-sm font-bold text-teal-900">{prodModel.version_str}</p>
                  <p className="text-[10px] text-teal-600">{prodModel.architecture} · {prodModel.model_size_mb}MB</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Cloud size={36} className="mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">Not configured yet</p>
              <p className="mt-1 text-xs text-gray-400">Enter your credentials on the left to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
