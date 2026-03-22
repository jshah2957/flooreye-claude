import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Play, Loader2, CheckCircle, XCircle, Save, Camera, Image as ImageIcon, Upload } from "lucide-react";

import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { VALIDATION_DEFAULTS } from "@/constants";

interface Prediction {
  class_name: string;
  confidence: number;
  area_percent: number;
  bbox: { x: number; y: number; w: number; h: number };
  severity?: string;
}

interface ValidationResult {
  passed: boolean;
  is_wet: boolean;
  failed_at_layer: number | null;
  reason: string;
}

interface TestResult {
  annotated_frame_base64: string | null;
  raw_frame_base64: string | null;
  predictions: Prediction[];
  is_wet: boolean;
  confidence: number;
  inference_time_ms: number;
  model_source: string;
  validation: ValidationResult | null;
  prediction_count: number;
}

export default function TestInferencePage() {
  const { success, error: showError } = useToast();
  const [tab, setTab] = useState<"camera" | "image">("camera");
  const [cameraId, setCameraId] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [modelSource, setModelSource] = useState("local_onnx");
  const [confidence, setConfidence] = useState(VALIDATION_DEFAULTS.CONFIDENCE);
  const [runValidation, setRunValidation] = useState(false);
  const [l1Conf, setL1Conf] = useState(VALIDATION_DEFAULTS.LAYER1_CONFIDENCE);
  const [l1On, setL1On] = useState(true);
  const [l2Area, setL2Area] = useState(VALIDATION_DEFAULTS.LAYER2_MIN_AREA);
  const [l2On, setL2On] = useState(true);
  const [l3K, setL3K] = useState(VALIDATION_DEFAULTS.LAYER3_K);
  const [l3M, setL3M] = useState(VALIDATION_DEFAULTS.LAYER3_M);
  const [l3On, setL3On] = useState(true);
  const [l4Delta, setL4Delta] = useState(VALIDATION_DEFAULTS.LAYER4_DELTA);
  const [l4On, setL4On] = useState(true);
  const [result, setResult] = useState<TestResult | null>(null);

  const { data: cameras } = useQuery({
    queryKey: ["cameras-test"],
    queryFn: async () => {
      const res = await api.get("/cameras", { params: { limit: 100 } });
      return res.data.data as { id: string; name: string; status: string }[];
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { model_source: modelSource, confidence, run_validation: runValidation };
      if (runValidation) {
        payload.validation_overrides = {
          layer1_confidence: l1Conf, layer1_enabled: l1On,
          layer2_min_area: l2Area, layer2_enabled: l2On,
          layer3_k: l3K, layer3_m: l3M, layer3_enabled: l3On,
          layer4_delta: l4Delta, layer4_enabled: l4On,
        };
      }
      if (tab === "camera") payload.camera_id = cameraId;
      else if (imageBase64) payload.image_base64 = imageBase64;
      const res = await api.post("/inference/test", payload);
      return res.data.data as TestResult;
    },
    onSuccess: (d) => setResult(d),
    onError: (e: any) => showError(e?.response?.data?.detail || "Inference failed"),
  });

  const saveMutation = useMutation({
    mutationFn: () => api.post("/dataset/frames", {
      frame_path: `test_${Date.now()}.jpg`, label_class: result?.is_wet ? "wet" : "dry",
      label_source: "manual_upload", split: "unassigned",
    }),
    onSuccess: () => success("Saved to dataset"),
    onError: () => showError("Save failed"),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const d = r.result as string; setImagePreview(d); setImageBase64(d.split(",")[1] ?? null); setResult(null); };
    r.readAsDataURL(f);
  }

  const canTest = tab === "camera" ? !!cameraId : !!imageBase64;

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Test Inference</h1>
        <p className="mt-1 text-sm text-gray-500">Run model inference with custom settings. See annotated results with bounding boxes.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Upload + Controls */}
        <div className="space-y-4">
          {/* Source Tabs */}
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {(["camera", "image"] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setResult(null); }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {t === "camera" ? <Camera size={13} /> : <ImageIcon size={13} />}
                {t === "camera" ? "Camera" : "Image"}
              </button>
            ))}
          </div>

          {tab === "camera" && (
            <select value={cameraId} onChange={(e) => setCameraId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20">
              <option value="">Select camera</option>
              {(cameras ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {tab === "image" && (
            <div>
              <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-teal-500 hover:bg-teal-50/30">
                <input type="file" accept="image/*" onChange={onFile} className="hidden" />
                {imagePreview ? (
                  <img src={imagePreview} alt="" className="max-h-32 rounded-lg object-contain" />
                ) : (
                  <>
                    <Upload size={24} className="mb-1.5 text-gray-400" />
                    <span className="text-xs text-gray-500">Click to upload or drag an image</span>
                  </>
                )}
              </label>
            </div>
          )}

          {/* Model settings */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Model Settings</h4>
            <select value={modelSource} onChange={(e) => setModelSource(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none transition focus:border-teal-500">
              <option value="local_onnx">Local ONNX</option>
              <option value="roboflow">Roboflow API</option>
            </select>
            <label className="block text-xs text-gray-500">
              Confidence Threshold ({confidence.toFixed(2)})
              <input type="range" min={0.1} max={1} step={0.05} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="mt-1.5 w-full accent-teal-600" />
            </label>
          </div>

          {/* Validation */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <label className="mb-3 flex items-center gap-2 text-xs font-semibold text-gray-700">
              <input type="checkbox" checked={runValidation} onChange={(e) => setRunValidation(e.target.checked)} className="rounded accent-teal-600" />
              4-Layer Validation Pipeline
            </label>
            {runValidation && (
              <div className="space-y-2 text-xs">
                {[
                  { label: "L1 Conf", on: l1On, setOn: setL1On, val: l1Conf, setVal: setL1Conf, min: 0.1, max: 1, step: 0.05, fmt: (v: number) => v.toFixed(2) },
                  { label: "L2 Area%", on: l2On, setOn: setL2On, val: l2Area, setVal: setL2Area, min: 0.01, max: 10, step: 0.1, fmt: (v: number) => v.toFixed(1) },
                  { label: "L4 Delta", on: l4On, setOn: setL4On, val: l4Delta, setVal: setL4Delta, min: 0.01, max: 0.5, step: 0.01, fmt: (v: number) => v.toFixed(2) },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <input type="checkbox" checked={s.on} onChange={(e) => s.setOn(e.target.checked)} className="rounded accent-teal-600" />
                    <span className="w-16 text-gray-600">{s.label}</span>
                    <span className="w-10 text-right font-mono text-gray-900">{s.fmt(s.val)}</span>
                    <input type="range" min={s.min} max={s.max} step={s.step} value={s.val} onChange={(e) => s.setVal(Number(e.target.value))} className="flex-1 accent-teal-600" />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={l3On} onChange={(e) => setL3On(e.target.checked)} className="rounded accent-teal-600" />
                  <span className="text-gray-600">L3 K={l3K} of M={l3M}</span>
                </div>
              </div>
            )}
          </div>

          {/* Run button */}
          <button onClick={() => testMutation.mutate()} disabled={!canTest || testMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50">
            {testMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Run Inference
          </button>
        </div>

        {/* Right: Results */}
        <div>
          {!result ? (
            <div className="flex h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white">
              <Upload size={36} className="mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">Upload an image to test</p>
              <p className="mt-1 text-xs text-gray-400">Select source and run inference to see results</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Annotated frame */}
              {result.annotated_frame_base64 && (
                <img src={`data:image/jpeg;base64,${result.annotated_frame_base64}`} alt="Annotated" className="w-full rounded-xl border border-gray-200 shadow-sm" />
              )}

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className={`rounded-xl p-4 text-center ${result.is_wet ? "bg-red-50" : "bg-green-50"}`}>
                  <p className={`text-lg font-bold ${result.is_wet ? "text-red-600" : "text-green-600"}`}>{result.is_wet ? "WET" : "DRY"}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Confidence</p>
                  <p className="text-lg font-bold text-gray-900">{(result.confidence * 100).toFixed(1)}%</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Time</p>
                  <p className="text-lg font-bold text-gray-900">{result.inference_time_ms.toFixed(0)}ms</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Model</p>
                  <p className="text-sm font-bold text-gray-900">{result.model_source}</p>
                </div>
              </div>

              {/* Validation pipeline */}
              {result.validation && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Validation Pipeline</h4>
                  <div className="flex gap-2.5">
                    {[1, 2, 3, 4].map((l) => {
                      const fl = result.validation!.failed_at_layer;
                      const ok = fl === null || l < fl;
                      return (
                        <div key={l} className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl p-3 text-xs font-medium ${fl === l ? "bg-red-50 text-red-600" : ok ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-400"}`}>
                          {ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
                          L{l}
                        </div>
                      );
                    })}
                  </div>
                  {result.validation.reason && <p className="mt-2.5 text-xs text-gray-500">{result.validation.reason}</p>}
                </div>
              )}

              {/* Predictions table */}
              {result.predictions.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Predictions</h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="pb-2 text-left text-gray-500">Class</th>
                        <th className="pb-2 text-right text-gray-500">Conf</th>
                        <th className="pb-2 text-right text-gray-500">Area%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.predictions.map((p, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 font-medium text-gray-900">{p.class_name}</td>
                          <td className="py-2 text-right text-gray-600">{(p.confidence * 100).toFixed(1)}%</td>
                          <td className="py-2 text-right text-gray-600">{p.area_percent?.toFixed(1) ?? "\u2014"}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Save button */}
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                className="flex items-center gap-2 rounded-xl border border-teal-500 px-5 py-2.5 text-xs font-medium text-teal-600 transition hover:bg-teal-50 disabled:opacity-50">
                <Save size={14} /> Save to Dataset
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
