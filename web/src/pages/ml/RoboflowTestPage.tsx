import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, Play, Loader2, AlertTriangle } from "lucide-react";

import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface Prediction {
  class_name: string;
  confidence: number;
  area_percent: number;
  bbox: { x: number; y: number; w: number; h: number };
  severity?: string;
}

interface InferenceResult {
  predictions: Prediction[];
  inference_time_ms: number;
  model_source: string;
}

export default function RoboflowTestPage() {
  const { error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [modelIdOverride, setModelIdOverride] = useState("");

  const inferMutation = useMutation({
    mutationFn: async () => {
      if (!imageBase64) throw new Error("No image selected");
      const res = await api.post("/roboflow/test-inference", {
        image_base64: imageBase64,
        model_id: modelIdOverride || undefined,
      });
      return res.data.data as InferenceResult;
    },
    onSuccess: (data) => setResult(data),
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Inference failed");
    },
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1] ?? null);
      setResult(null);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1] ?? null);
      setResult(null);
    };
    reader.readAsDataURL(file);
  }

  const isWet = result?.predictions?.some((p) =>
    ["wet_floor", "spill", "puddle", "water", "wet"].includes(p.class_name?.toLowerCase())
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Roboflow Test Inference</h1>
        <p className="text-sm text-[#78716C]">
          Upload an image to test against the Roboflow API. This is the only place Roboflow runs inference.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Upload + Controls */}
        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#E7E5E0] bg-[#FAFAF9] hover:border-[#0D9488]"
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="max-h-[400px] rounded object-contain" />
            ) : (
              <>
                <Upload size={32} className="mb-2 text-[#78716C]" />
                <p className="text-sm text-[#78716C]">Click or drag an image here</p>
                <p className="text-xs text-[#A8A29E]">JPEG, PNG up to 10MB</p>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

          <div>
            <label className="mb-1 block text-xs font-medium text-[#78716C]">
              Model ID Override (optional)
            </label>
            <input
              value={modelIdOverride}
              onChange={(e) => setModelIdOverride(e.target.value)}
              placeholder="e.g. wet-floor-detection/3"
              className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
            />
          </div>

          <button
            onClick={() => inferMutation.mutate()}
            disabled={!imageBase64 || inferMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
          >
            {inferMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            Run Roboflow Inference
          </button>

          <div className="rounded-md bg-[#FFF7ED] p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 text-[#D97706]" />
              <p className="text-xs text-[#92400E]">
                This calls the Roboflow API directly. For production detections, the system uses local ONNX inference.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">Results</h3>

          {!result ? (
            <p className="py-12 text-center text-xs text-[#78716C]">
              Upload an image and run inference to see results
            </p>
          ) : (
            <div className="space-y-4">
              {/* Verdict */}
              <div className={`rounded-md p-3 ${isWet ? "bg-[#FEE2E2]" : "bg-[#DCFCE7]"}`}>
                <span className={`text-lg font-bold ${isWet ? "text-[#DC2626]" : "text-[#16A34A]"}`}>
                  {isWet ? "WET DETECTED" : "DRY"}
                </span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-[#E7E5E0] p-3">
                  <p className="text-[10px] text-[#78716C]">Predictions</p>
                  <p className="text-lg font-semibold text-[#1C1917]">{result.predictions.length}</p>
                </div>
                <div className="rounded-md border border-[#E7E5E0] p-3">
                  <p className="text-[10px] text-[#78716C]">Inference Time</p>
                  <p className="text-lg font-semibold text-[#1C1917]">{result.inference_time_ms.toFixed(0)}ms</p>
                </div>
              </div>

              {/* Predictions Table */}
              {result.predictions.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold text-[#78716C]">Predictions</h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E7E5E0]">
                        <th className="pb-1 text-left text-[#78716C]">Class</th>
                        <th className="pb-1 text-right text-[#78716C]">Confidence</th>
                        <th className="pb-1 text-right text-[#78716C]">Area %</th>
                        <th className="pb-1 text-right text-[#78716C]">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.predictions.map((p, i) => (
                        <tr key={i} className="border-b border-[#F5F5F4]">
                          <td className="py-1.5 font-medium text-[#1C1917]">{p.class_name}</td>
                          <td className="py-1.5 text-right text-[#1C1917]">{(p.confidence * 100).toFixed(1)}%</td>
                          <td className="py-1.5 text-right text-[#1C1917]">{p.area_percent.toFixed(1)}%</td>
                          <td className="py-1.5 text-right">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              p.severity === "critical" ? "bg-[#FEE2E2] text-[#DC2626]" :
                              p.severity === "high" ? "bg-[#FFF7ED] text-[#D97706]" :
                              p.severity === "medium" ? "bg-[#FEF9C3] text-[#CA8A04]" :
                              "bg-[#F1F0ED] text-[#78716C]"
                            }`}>
                              {p.severity ?? "low"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[10px] text-[#A8A29E]">Source: {result.model_source}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
