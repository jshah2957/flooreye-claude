import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { HardDrive, Loader2, Cloud, Server, Globe, CheckCircle, XCircle, Database, Image, Film } from "lucide-react";

import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

const PROVIDER_OPTIONS = [
  { key: "s3", label: "Amazon S3", description: "AWS S3 cloud storage", icon: Cloud, color: "text-orange-600", bg: "bg-orange-50" },
  { key: "minio", label: "MinIO", description: "Self-hosted S3-compatible", icon: Server, color: "text-purple-600", bg: "bg-purple-50" },
  { key: "r2", label: "Cloudflare R2", description: "Zero egress fees", icon: Globe, color: "text-blue-600", bg: "bg-blue-50" },
];

export default function StoragePage() {
  const { success, error: showError } = useToast();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: integrations, isLoading } = useQuery({
    queryKey: ["storage-integrations"],
    queryFn: async () => {
      const res = await api.get("/integrations/status");
      return (res.data.data ?? []).filter((i: any) => ["s3", "minio", "r2"].includes(i.service));
    },
  });

  const testMutation = useMutation({
    mutationFn: async (service: string) => {
      const res = await api.post(`/integrations/${service}/test`);
      return res.data;
    },
    onSuccess: () => {
      setTestResult({ ok: true, message: "Connection successful" });
      success("Storage connection test passed");
    },
    onError: (err: any) => {
      setTestResult({ ok: false, message: err?.response?.data?.detail || "Connection test failed" });
      showError("Storage connection test failed");
    },
  });

  const activeProviders = integrations ?? [];
  const configuredProvider = activeProviders.find((i: any) => i.status === "connected" || i.status === "ok");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Storage Configuration</h1>
        <p className="mt-1 text-sm text-gray-500">Configure S3-compatible object storage for frames, clips, and models</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 rounded bg-gray-200" />
                    <div className="h-3 w-36 rounded bg-gray-200" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Provider Selection */}
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Storage Provider</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {PROVIDER_OPTIONS.map((provider) => {
                const Icon = provider.icon;
                const activeIntg = activeProviders.find((i: any) => i.service === provider.key);
                const isConfigured = activeIntg && (activeIntg.status === "connected" || activeIntg.status === "ok");
                const isSelected = selectedProvider === provider.key;

                return (
                  <button
                    key={provider.key}
                    type="button"
                    onClick={() => { setSelectedProvider(provider.key); setTestResult(null); }}
                    className={`relative rounded-xl border-2 p-5 text-left transition-all ${
                      isSelected
                        ? "border-[#0D9488] bg-teal-50 ring-2 ring-[#0D9488]/20"
                        : isConfigured
                          ? "border-green-300 bg-green-50/50"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                    }`}
                  >
                    {isConfigured && (
                      <span className="absolute right-3 top-3">
                        <CheckCircle size={16} className="text-green-500" />
                      </span>
                    )}
                    <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${provider.bg}`}>
                      <Icon size={20} className={provider.color} />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">{provider.label}</h3>
                    <p className="mt-1 text-xs text-gray-500">{provider.description}</p>
                    {activeIntg?.last_tested && (
                      <p className="mt-2 text-[10px] text-gray-400">
                        Last tested: {new Date(activeIntg.last_tested).toLocaleString()}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuration Section */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <HardDrive size={18} className="text-[#0D9488]" />
              <h2 className="text-base font-semibold text-gray-900">Provider Configuration</h2>
            </div>

            {selectedProvider ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  Storage providers are configured through the{" "}
                  <Link to="/integrations/api-manager" className="font-medium text-[#0D9488] hover:underline">
                    API Integration Manager
                  </Link>
                  . Use the test button below to verify your connection.
                </p>

                {/* Test Connection */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => testMutation.mutate(selectedProvider)}
                    disabled={testMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0F766E] disabled:opacity-50"
                  >
                    {testMutation.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <HardDrive size={14} />
                    )}
                    Test Connection
                  </button>
                  {testResult && (
                    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${testResult.ok ? "text-green-600" : "text-red-600"}`}>
                      {testResult.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
                      {testResult.message}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="py-4 text-sm text-gray-400">Select a storage provider above to view configuration options.</p>
            )}
          </div>

          {/* Usage Stats */}
          {configuredProvider && (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-gray-900">Storage Usage</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <Database size={16} className="text-[#0D9488]" />
                    <span className="text-xs font-medium text-gray-500">Total Size</span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-gray-900">--</p>
                  <p className="text-[10px] text-gray-400">Requires storage metrics endpoint</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <Image size={16} className="text-blue-500" />
                    <span className="text-xs font-medium text-gray-500">Frames</span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-gray-900">--</p>
                  <p className="text-[10px] text-gray-400">Detection frames stored</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <Film size={16} className="text-purple-500" />
                    <span className="text-xs font-medium text-gray-500">Clips</span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-gray-900">--</p>
                  <p className="text-[10px] text-gray-400">Recorded video clips</p>
                </div>
              </div>
            </div>
          )}

          {activeProviders.length === 0 && !selectedProvider && (
            <div className="mt-6 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
              <HardDrive size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No storage providers configured</p>
              <p className="mt-1 text-xs text-gray-400">
                Set up S3, MinIO, or R2 in the{" "}
                <Link to="/integrations/api-manager" className="text-[#0D9488] hover:underline">Integration Manager</Link>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
