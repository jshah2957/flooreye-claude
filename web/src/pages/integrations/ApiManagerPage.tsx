import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cloud,
  Mail,
  Webhook,
  MessageSquare,
  Bell,
  HardDrive,
  Database,
  Radio,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  Play,
  Settings2,
} from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";

interface Integration {
  service: string;
  status: string;
  config?: Record<string, unknown>;
  last_tested?: string;
  last_test_result?: string;
  last_test_response_ms?: number;
  last_test_error?: string;
  id?: string;
  updated_at?: string;
}

const SERVICE_META: Record<string, { label: string; icon: React.ElementType; color: string; fields: { key: string; label: string; type: string }[] }> = {
  roboflow: { label: "Roboflow", icon: Cloud, color: "text-[#7C3AED]", fields: [
    { key: "api_key", label: "API Key", type: "password" },
    { key: "model_id", label: "Model ID", type: "text" },
    { key: "api_url", label: "API URL", type: "text" },
  ]},
  smtp: { label: "SMTP Email", icon: Mail, color: "text-[#2563EB]", fields: [
    { key: "host", label: "Host", type: "text" },
    { key: "port", label: "Port", type: "number" },
    { key: "username", label: "Username", type: "text" },
    { key: "password", label: "Password", type: "password" },
    { key: "from_email", label: "From Email", type: "text" },
  ]},
  webhook: { label: "Webhook", icon: Webhook, color: "text-[#D97706]", fields: [
    { key: "url", label: "URL", type: "text" },
    { key: "secret", label: "Secret", type: "password" },
  ]},
  sms: { label: "SMS (Twilio)", icon: MessageSquare, color: "text-[#16A34A]", fields: [
    { key: "account_sid", label: "Account SID", type: "text" },
    { key: "auth_token", label: "Auth Token", type: "password" },
    { key: "from_number", label: "From Number", type: "text" },
  ]},
  fcm: { label: "Firebase FCM", icon: Bell, color: "text-[#D97706]", fields: [
    { key: "credentials_json", label: "Credentials JSON", type: "textarea" },
  ]},
  s3: { label: "AWS S3", icon: HardDrive, color: "text-[#D97706]", fields: [
    { key: "endpoint_url", label: "Endpoint URL", type: "text" },
    { key: "access_key_id", label: "Access Key", type: "text" },
    { key: "secret_access_key", label: "Secret Key", type: "password" },
    { key: "bucket_name", label: "Bucket", type: "text" },
    { key: "region", label: "Region", type: "text" },
  ]},
  minio: { label: "MinIO", icon: HardDrive, color: "text-[#0D9488]", fields: [
    { key: "endpoint_url", label: "Endpoint URL", type: "text" },
    { key: "access_key_id", label: "Access Key", type: "text" },
    { key: "secret_access_key", label: "Secret Key", type: "password" },
    { key: "bucket_name", label: "Bucket", type: "text" },
  ]},
  r2: { label: "Cloudflare R2", icon: HardDrive, color: "text-[#2563EB]", fields: [
    { key: "endpoint_url", label: "Endpoint URL", type: "text" },
    { key: "access_key_id", label: "Access Key", type: "text" },
    { key: "secret_access_key", label: "Secret Key", type: "password" },
    { key: "bucket_name", label: "Bucket", type: "text" },
  ]},
  mqtt: { label: "MQTT", icon: Radio, color: "text-[#7C3AED]", fields: [
    { key: "host", label: "Host", type: "text" },
    { key: "port", label: "Port", type: "number" },
    { key: "username", label: "Username", type: "text" },
    { key: "password", label: "Password", type: "password" },
  ]},
  "cloudflare-tunnel": { label: "CF Tunnel", icon: Cloud, color: "text-[#2563EB]", fields: [
    { key: "account_id", label: "Account ID", type: "text" },
    { key: "api_token", label: "API Token", type: "password" },
  ]},
  mongodb: { label: "MongoDB", icon: Database, color: "text-[#16A34A]", fields: [
    { key: "uri", label: "Connection URI", type: "password" },
  ]},
  redis: { label: "Redis", icon: Database, color: "text-[#DC2626]", fields: [
    { key: "url", label: "Redis URL", type: "password" },
  ]},
};

export default function ApiManagerPage() {
  const queryClient = useQueryClient();
  const [drawerService, setDrawerService] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const { data: integrations, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const res = await api.get("/integrations");
      return res.data.data as Integration[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ service, config }: { service: string; config: Record<string, string> }) =>
      api.put(`/integrations/${service}`, { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setDrawerService(null);
      setError("");
    },
    onError: () => setError("Failed to save config"),
  });

  const testMutation = useMutation({
    mutationFn: (service: string) => api.post(`/integrations/${service}/test`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const testAllMutation = useMutation({
    mutationFn: () => api.post("/integrations/test-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  function openDrawer(service: string) {
    setDrawerService(service);
    setFormData({});
    setError("");
  }

  function handleSave() {
    if (!drawerService) return;
    saveMutation.mutate({ service: drawerService, config: formData });
  }

  const meta = drawerService ? SERVICE_META[drawerService] : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">API Integration Manager</h1>
          <p className="text-sm text-[#78716C]">Configure and test third-party service connections</p>
        </div>
        <button
          onClick={() => testAllMutation.mutate()}
          disabled={testAllMutation.isPending}
          className="flex items-center gap-2 rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED] disabled:opacity-50"
        >
          {testAllMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Test All
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#0D9488]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(integrations ?? []).map((intg) => {
            const svc = SERVICE_META[intg.service];
            if (!svc) return null;
            const Icon = svc.icon;
            return (
              <div key={intg.service} className="rounded-lg border border-[#E7E5E0] bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon size={18} className={svc.color} />
                    <span className="text-sm font-medium text-[#1C1917]">{svc.label}</span>
                  </div>
                  <StatusBadge status={intg.status} size="sm" />
                </div>

                {intg.last_tested && (
                  <div className="mb-3 text-[10px] text-[#78716C]">
                    Last tested: {new Date(intg.last_tested).toLocaleString()}
                    {intg.last_test_response_ms != null && ` (${intg.last_test_response_ms.toFixed(0)}ms)`}
                    {intg.last_test_result === "success" && <CheckCircle2 size={10} className="ml-1 inline text-[#16A34A]" />}
                    {intg.last_test_result === "failure" && <XCircle size={10} className="ml-1 inline text-[#DC2626]" />}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => openDrawer(intg.service)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[#E7E5E0] px-2 py-1.5 text-xs text-[#1C1917] hover:bg-[#F1F0ED]"
                  >
                    <Settings2 size={12} /> Configure
                  </button>
                  <button
                    onClick={() => testMutation.mutate(intg.service)}
                    disabled={intg.status === "not_configured" || testMutation.isPending}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-[#0D9488] px-2 py-1.5 text-xs text-white hover:bg-[#0F766E] disabled:opacity-50"
                  >
                    {testMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    Test
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Config Drawer */}
      {drawerService && meta && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="h-full w-[384px] overflow-y-auto bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
              <h2 className="text-lg font-semibold text-[#1C1917]">Configure {meta.label}</h2>
              <button onClick={() => setDrawerService(null)} className="text-[#78716C] hover:text-[#1C1917]">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-4">
              {meta.fields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-sm font-medium text-[#1C1917]">{field.label}</label>
                  {field.type === "textarea" ? (
                    <textarea
                      value={formData[field.key] ?? ""}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      rows={4}
                      className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={formData[field.key] ?? ""}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                    />
                  )}
                </div>
              ))}

              {error && (
                <div className="rounded-md bg-[#FEE2E2] px-3 py-2 text-sm text-[#DC2626]">{error}</div>
              )}

              <div className="flex justify-end gap-3 border-t border-[#E7E5E0] pt-4">
                <button
                  onClick={() => setDrawerService(null)}
                  className="rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
                >
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Save & Encrypt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
