import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";

interface TrainingJob {
  id: string;
  status: string;
  config: Record<string, unknown>;
  triggered_by: string;
  frames_used: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export default function TrainingJobsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["training-jobs"],
    queryFn: async () => {
      const res = await api.get("/training/jobs", { params: { limit: 50 } });
      return res.data;
    },
  });

  const jobs = (data?.data ?? []) as TrainingJob[];

  return (
    <div>
      {/* Roboflow notice */}
      <div className="mb-6 rounded-lg border border-[#0D9488]/30 bg-[#F0FDFA] p-6">
        <h2 className="mb-2 text-lg font-semibold text-[#0D9488]">
          Model Training via Roboflow
        </h2>
        <p className="mb-4 text-sm text-[#1C1917]">
          Model training is managed through Roboflow. Use the Roboflow
          integration page to manage your training data and models.
        </p>
        <a
          href="/integrations"
          className="inline-flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]"
        >
          <ExternalLink size={16} /> Go to Roboflow Integration
        </a>
      </div>

      {/* Historical jobs (read-only) */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1C1917]">
          Training Job History
        </h1>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#0D9488]" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-[#78716C]">No training jobs on record.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-lg border border-[#E7E5E0] bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusBadge status={job.status} />
                  <span className="text-sm font-medium text-[#1C1917]">
                    {(job.config as any)?.architecture ?? "yolo26n"} ·{" "}
                    {job.frames_used ?? 0} frames
                  </span>
                </div>
                <span className="text-xs text-[#78716C]">
                  {new Date(job.created_at).toLocaleString()}
                </span>
              </div>

              {job.error_message && (
                <p className="mt-2 text-xs text-[#DC2626]">
                  {job.error_message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
