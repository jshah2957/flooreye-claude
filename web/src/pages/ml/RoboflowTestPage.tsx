import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, Play, Loader2, AlertTriangle, Save } from "lucide-react";
import AnnotatedFrame from "@/components/shared/AnnotatedFrame";

import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { VALIDATION_DEFAULTS, WET_CLASS_NAMES } from "@/constants";

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
  const [confidence, setConfidence] = useState(VALIDATION_DEFAULTS.CONFIDENCE);

  const inferMutation = useMutation({
    mutationFn: async () => {
      if (!imageBase64) throw new Error("No image selected");
      const res = await api.post("/roboflow/test-inference", {
        image_base64: imageBase64,
        model_id: modelIdOverride || undefined,
        confidence,
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
    (WET_CLASS_NAMES as readonly string[]).includes(p.class_name?.toLowerCase())
  );

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Roboflow Test Inference</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload an image to test against the Roboflow API. This is the only place Roboflow runs inference.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Upload + Controls */}
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-teal-500 hover:bg-teal-50/30"
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="max-h-[400px] rounded-lg object-contain" />
            ) : (
              <>
                <Upload size={36} className="mb-3 text-gray-400" />
                <p className="text-sm font-medium text-gray-600">Click or drag an image here</p>
                <p className="mt-1 text-xs text-gray-400">JPEG, PNG up to 10MB</p>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

          {/* Controls */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">
                  Model ID Override (optional)
                </label>
                <input
                  value={modelIdOverride}
                  onChange={(e) => setModelIdOverride(e.target.value)}
                  placeholder="e.g. wet-floor-detection/3"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">
                  Confidence Threshold: {confidence.toFixed(2)}
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={confidence}
                  onChange={(e) => setConfidence(parseFloat(e.target.value))}
                  className="w-full accent-teal-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>0.10</span>
                  <span>0.50</span>
                  <span>1.00</span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => inferMutation.mutate()}
            disabled={!imageBase64 || inferMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
          >
            {inferMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            Run Roboflow Inference
          </button>

          <div className="rounded-xl bg-amber-50 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed text-amber-800">
                This calls the Roboflow API directly. For production detections, the system uses local ONNX inference.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-900">Results</h3>

          {!result ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Upload size={36} className="mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">Upload an image to test</p>
              <p className="mt-1 text-xs text-gray-400">Run inference to see results here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Annotated frame overlay */}
              {imageBase64 && result.predictions.length > 0 && (
                <AnnotatedFrame rawBase64={imageBase64} predictions={result.predictions} />
              )}

              {/* Verdict */}
              <div className={`rounded-xl p-4 ${isWet ? "bg-red-50" : "bg-green-50"}`}>
                <span className={`text-lg font-bold ${isWet ? "text-red-600" : "text-green-600"}`}>
                  {isWet ? "WET DETECTED" : "DRY"}
                </span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Predictions</p>
                  <p className="text-xl font-bold text-gray-900">{result.predictions.length}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Inference Time</p>
                  <p className="text-xl font-bold text-gray-900">{result.inference_time_ms.toFixed(0)}ms</p>
                </div>
              </div>

              {/* Predictions Table */}
              {result.predictions.length > 0 && (
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Predictions</h4>
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="px-4 py-2.5 text-left text-gray-500">Class</th>
                          <th className="px-4 py-2.5 text-right text-gray-500">Confidence</th>
                          <th className="px-4 py-2.5 text-right text-gray-500">Area %</th>
                          <th className="px-4 py-2.5 text-right text-gray-500">Severity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.predictions.map((p, i) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-900">{p.class_name}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{(p.confidence * 100).toFixed(1)}%</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{p.area_percent.toFixed(1)}%</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                p.severity === "critical" ? "bg-red-50 text-red-600" :
                                p.severity === "high" ? "bg-orange-50 text-orange-600" :
                                p.severity === "medium" ? "bg-amber-50 text-amber-600" :
                                "bg-gray-100 text-gray-500"
                              }`}>
                                {p.severity ?? "low"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-gray-400">Source: {result.model_source}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
