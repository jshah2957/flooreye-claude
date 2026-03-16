import { useQuery } from "@tanstack/react-query";
import { HardDrive, Loader2 } from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";

export default function StoragePage() {
  const { data: integrations, isLoading } = useQuery({
    queryKey: ["storage-integrations"],
    queryFn: async () => {
      const res = await api.get("/integrations/status");
      return (res.data.data ?? []).filter((i: any) => ["s3", "minio", "r2"].includes(i.service));
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Storage Settings</h1>
        <p className="text-sm text-[#78716C]">Configure S3-compatible object storage for frames and models</p>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {(integrations ?? []).map((intg: any) => (
            <div key={intg.service} className="rounded-lg border border-[#E7E5E0] bg-white p-6">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive size={18} className="text-[#D97706]" />
                  <span className="text-sm font-medium text-[#1C1917]">{intg.service.toUpperCase()}</span>
                </div>
                <StatusBadge status={intg.status} size="sm" />
              </div>
              {intg.last_tested && (
                <p className="text-xs text-[#78716C]">Tested: {new Date(intg.last_tested).toLocaleString()}</p>
              )}
              <p className="mt-2 text-xs text-[#78716C]">
                Configure in <a href="/integrations/api-manager" className="text-[#0D9488] hover:underline">API Integration Manager</a>
              </p>
            </div>
          ))}
          {(integrations ?? []).length === 0 && (
            <div className="col-span-3 flex h-40 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
              <p className="text-sm text-[#78716C]">No storage providers configured. Set up S3, MinIO, or R2 in the Integration Manager.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
