import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Play, Loader2, CheckCircle, XCircle, Save, Camera, Image as ImageIcon } from "lucide-react";

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
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Test Inference</h1>
        <p className="text-sm text-[#78716C]">Run model inference with custom settings. See annotated results with bounding boxes.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Controls */}
        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg bg-[#F1F0ED] p-1">
            {(["camera", "image"] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setResult(null); }}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium ${tab === t ? "bg-white text-[#1C1917] shadow-sm" : "text-[#78716C]"}`}>
                {t === "camera" ? <><Camera size={12} className="mr-1 inline" /> Camera</> : <><ImageIcon size={12} className="mr-1 inline" /> Image</>}
              </button>
            ))}
          </div>

          {tab === "camera" && (
            <select value={cameraId} onChange={(e) => setCameraId(e.target.value)}
              className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
              <option value="">Select camera</option>
              {(cameras ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {tab === "image" && (
            <div>
              <input type="file" accept="image/*" onChange={onFile} className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm" />
              {imagePreview && <img src={imagePreview} alt="" className="mt-2 max-h-28 rounded border" />}
            </div>
          )}

          <div className="rounded-lg border border-[#E7E5E0] p-3">
            <h4 className="mb-2 text-xs font-semibold text-[#78716C]">Model</h4>
            <select value={modelSource} onChange={(e) => setModelSource(e.target.value)}
              className="mb-2 w-full rounded border border-[#E7E5E0] px-2 py-1 text-xs">
              <option value="local_onnx">Local ONNX</option>
              <option value="roboflow">Roboflow API</option>
            </select>
            <label className="block text-[10px] text-[#78716C]">Confidence ({confidence.toFixed(2)})
              <input type="range" min={0.1} max={1} step={0.05} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="mt-1 w-full" />
            </label>
          </div>

          <div className="rounded-lg border border-[#E7E5E0] p-3">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#78716C]">
              <input type="checkbox" checked={runValidation} onChange={(e) => setRunValidation(e.target.checked)} className="accent-[#0D9488]" />
              4-Layer Validation
            </label>
            {runValidation && (
              <div className="space-y-1.5 text-[10px]">
                {[
                  { label: "L1 Conf", on: l1On, setOn: setL1On, val: l1Conf, setVal: setL1Conf, min: 0.1, max: 1, step: 0.05, fmt: (v: number) => v.toFixed(2) },
                  { label: "L2 Area%", on: l2On, setOn: setL2On, val: l2Area, setVal: setL2Area, min: 0.01, max: 10, step: 0.1, fmt: (v: number) => v.toFixed(1) },
                  { label: "L4 Delta", on: l4On, setOn: setL4On, val: l4Delta, setVal: setL4Delta, min: 0.01, max: 0.5, step: 0.01, fmt: (v: number) => v.toFixed(2) },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <input type="checkbox" checked={s.on} onChange={(e) => s.setOn(e.target.checked)} />
                    <span className="w-14">{s.label}</span>
                    <span className="w-8 text-right">{s.fmt(s.val)}</span>
                    <input type="range" min={s.min} max={s.max} step={s.step} value={s.val} onChange={(e) => s.setVal(Number(e.target.value))} className="flex-1" />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={l3On} onChange={(e) => setL3On(e.target.checked)} />
                  <span>L3 K={l3K} of M={l3M}</span>
                </div>
              </div>
            )}
          </div>

          <button onClick={() => testMutation.mutate()} disabled={!canTest || testMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
            {testMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Run Inference
          </button>
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          {!result ? (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0] text-sm text-[#78716C]">
              Select source and run inference
            </div>
          ) : (
            <div className="space-y-4">
              {result.annotated_frame_base64 && (
                <img src={`data:image/jpeg;base64,${result.annotated_frame_base64}`} alt="Annotated" className="w-full rounded-lg border border-[#E7E5E0]" />
              )}
              <div className="grid grid-cols-4 gap-3">
                <div className={`rounded-lg p-3 text-center ${result.is_wet ? "bg-[#FEE2E2]" : "bg-[#DCFCE7]"}`}>
                  <p className={`text-lg font-bold ${result.is_wet ? "text-[#DC2626]" : "text-[#16A34A]"}`}>{result.is_wet ? "WET" : "DRY"}</p>
                </div>
                <div className="rounded-lg border border-[#E7E5E0] p-3 text-center">
                  <p className="text-[10px] text-[#78716C]">Confidence</p>
                  <p className="text-lg font-semibold">{(result.confidence * 100).toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border border-[#E7E5E0] p-3 text-center">
                  <p className="text-[10px] text-[#78716C]">Time</p>
                  <p className="text-lg font-semibold">{result.inference_time_ms.toFixed(0)}ms</p>
                </div>
                <div className="rounded-lg border border-[#E7E5E0] p-3 text-center">
                  <p className="text-[10px] text-[#78716C]">Model</p>
                  <p className="text-sm font-semibold">{result.model_source}</p>
                </div>
              </div>
              {result.validation && (
                <div className="rounded-lg border border-[#E7E5E0] p-3">
                  <h4 className="mb-2 text-xs font-semibold text-[#78716C]">Validation Pipeline</h4>
                  <div className="flex gap-3">
                    {[1, 2, 3, 4].map((l) => {
                      const fl = result.validation!.failed_at_layer;
                      const ok = fl === null || l < fl;
                      return (
                        <div key={l} className={`flex-1 rounded p-2 text-center text-xs font-medium ${fl === l ? "bg-[#FEE2E2] text-[#DC2626]" : ok ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F1F0ED] text-[#78716C]"}`}>
                          {ok ? <CheckCircle size={14} className="mx-auto mb-1" /> : <XCircle size={14} className="mx-auto mb-1" />}
                          L{l}
                        </div>
                      );
                    })}
                  </div>
                  {result.validation.reason && <p className="mt-2 text-[10px] text-[#78716C]">{result.validation.reason}</p>}
                </div>
              )}
              {result.predictions.length > 0 && (
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-[#E7E5E0]"><th className="pb-1 text-left text-[#78716C]">Class</th><th className="pb-1 text-right text-[#78716C]">Conf</th><th className="pb-1 text-right text-[#78716C]">Area%</th></tr></thead>
                  <tbody>{result.predictions.map((p, i) => (
                    <tr key={i} className="border-b border-[#F5F5F4]"><td className="py-1 font-medium">{p.class_name}</td><td className="py-1 text-right">{(p.confidence * 100).toFixed(1)}%</td><td className="py-1 text-right">{p.area_percent?.toFixed(1) ?? "—"}%</td></tr>
                  ))}</tbody>
                </table>
              )}
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                className="flex items-center gap-2 rounded-md border border-[#0D9488] px-4 py-2 text-xs text-[#0D9488] hover:bg-[#F0FDFA] disabled:opacity-50">
                <Save size={14} /> Save to Dataset
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
