import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Cloud, Loader2, Play, CheckCircle2, XCircle } from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/components/ui/Toast";

export default function RoboflowPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [apiUrl, setApiUrl] = useState("https://detect.roboflow.com");

  const { data: integration } = useQuery({
    queryKey: ["integration-roboflow"],
    queryFn: async () => {
      try {
        const res = await api.get("/integrations/roboflow");
        return res.data.data;
      } catch { return null; }
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
      success("Roboflow test passed");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Roboflow test failed");
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Roboflow Integration</h1>
        <p className="text-sm text-[#78716C]">Configure the Roboflow inference API connection</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-[#1C1917]">Connection Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#1C1917]">API Key *</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={integration?.config?.api_key ?? "Enter API key"}
                className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#1C1917]">Model ID *</label>
              <input value={modelId} onChange={(e) => setModelId(e.target.value)}
                placeholder={integration?.config?.model_id ?? "e.g. wet-floor-detection/3"}
                className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#1C1917]">API URL</label>
              <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)}
                className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => saveMutation.mutate()} disabled={!apiKey || !modelId || saveMutation.isPending}
                className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
                {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />} Save
              </button>
              <button onClick={() => testMutation.mutate()} disabled={!integration || testMutation.isPending}
                className="flex items-center gap-2 rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED] disabled:opacity-50">
                {testMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Test
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-[#1C1917]">Status</h2>
          {integration ? (
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-[#78716C]">Status</dt><dd><StatusBadge status={integration.status} /></dd></div>
              {integration.last_tested && (
                <div className="flex justify-between"><dt className="text-[#78716C]">Last Tested</dt><dd className="text-[#1C1917]">{new Date(integration.last_tested).toLocaleString()}</dd></div>
              )}
              {integration.last_test_result && (
                <div className="flex justify-between"><dt className="text-[#78716C]">Result</dt><dd className="flex items-center gap-1">
                  {integration.last_test_result === "success" ? <CheckCircle2 size={14} className="text-[#16A34A]" /> : <XCircle size={14} className="text-[#DC2626]" />}
                  <span className="text-[#1C1917]">{integration.last_test_result}</span>
                </dd></div>
              )}
              {integration.last_test_response_ms && (
                <div className="flex justify-between"><dt className="text-[#78716C]">Latency</dt><dd className="text-[#1C1917]">{integration.last_test_response_ms.toFixed(0)}ms</dd></div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-[#78716C]">Not configured yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
