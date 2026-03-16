import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Play, Upload, Loader2 } from "lucide-react";

import api from "@/lib/api";
import type { Camera, Store, PaginatedResponse } from "@/types";
import { useQuery } from "@tanstack/react-query";

export default function TestInferencePage() {
  const [selectedCamera, setSelectedCamera] = useState("");
  const [result, setResult] = useState<any>(null);

  const { data: cameras } = useQuery({
    queryKey: ["cameras-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Camera>>("/cameras", { params: { limit: 100 } });
      return res.data.data;
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/detection/run/${selectedCamera}`);
      return res.data.data;
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Test Inference</h1>
        <p className="text-sm text-[#78716C]">Run a manual detection on any camera to test inference</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Controls */}
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-[#1C1917]">Run Detection</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#1C1917]">Camera *</label>
              <select value={selectedCamera} onChange={(e) => setSelectedCamera(e.target.value)}
                className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                <option value="">Select a camera</option>
                {(cameras ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                ))}
              </select>
            </div>
            <button onClick={() => runMutation.mutate()} disabled={!selectedCamera || runMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-3 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
              {runMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Run Inference
            </button>
            {runMutation.isError && (
              <div className="rounded-md bg-[#FEE2E2] px-3 py-2 text-sm text-[#DC2626]">
                Inference failed. Check camera connection and Roboflow config.
              </div>
            )}
          </div>
        </div>

        {/* Result */}
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-[#1C1917]">Result</h2>
          {result ? (
            <div>
              {result.frame_base64 && (
                <img src={`data:image/jpeg;base64,${result.frame_base64}`} alt="Detection"
                  className="mb-4 w-full rounded border border-[#E7E5E0]" />
              )}
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Result</dt>
                  <dd className={`font-semibold ${result.is_wet ? "text-[#DC2626]" : "text-[#16A34A]"}`}>
                    {result.is_wet ? "WET" : "DRY"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Confidence</dt>
                  <dd className="text-[#1C1917]">{(result.confidence * 100).toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Wet Area</dt>
                  <dd className="text-[#1C1917]">{result.wet_area_percent?.toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Inference Time</dt>
                  <dd className="text-[#1C1917]">{result.inference_time_ms?.toFixed(0)}ms</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Model</dt>
                  <dd className="text-[#1C1917]">{result.model_source}</dd>
                </div>
              </dl>
              {result.predictions?.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 text-xs font-semibold text-[#78716C]">Predictions ({result.predictions.length})</h3>
                  {result.predictions.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded border border-[#E7E5E0] px-2 py-1 mb-1">
                      <span className="text-xs text-[#1C1917]">{p.class_name}</span>
                      <span className="text-xs font-medium">{(p.confidence * 100).toFixed(1)}% · {p.area_percent?.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-[#78716C]">
              Run inference to see results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
