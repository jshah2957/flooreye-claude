import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Wifi,
  Cloud,
  Zap,
  ArrowLeftRight,
} from "lucide-react";

import api from "@/lib/api";
import type { Store, PaginatedResponse } from "@/types";
import RoiCanvas from "@/components/roi/RoiCanvas";

type InferenceMode = "cloud" | "edge" | "hybrid";

interface WizardState {
  // Step 1
  streamUrl: string;
  streamType: string;
  // Step 2
  cameraName: string;
  fpsConfig: number;
  resolution: string;
  floorType: string;
  minWetAreaPercent: number;
  storeId: string;
  // Step 3
  inferenceMode: InferenceMode;
  hybridThreshold: number;
  // Step 4
  roiPoints: { x: number; y: number }[];
  maskOutside: boolean;
  // Step 5
  dryRefFrames: { frame_base64: string; brightness_score: number; reflection_score: number }[];
  // Step 6
  enableDetection: boolean;
}

const INITIAL: WizardState = {
  streamUrl: "",
  streamType: "rtsp",
  cameraName: "",
  fpsConfig: 2,
  resolution: "",
  floorType: "tile",
  minWetAreaPercent: 0.5,
  storeId: "",
  inferenceMode: "cloud",
  hybridThreshold: 0.65,
  roiPoints: [],
  maskOutside: false,
  dryRefFrames: [],
  enableDetection: true,
};

const STEPS = ["Connect", "Configure", "Inference", "ROI", "Reference", "Confirm"] as const;

export default function CameraWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL);
  const [testResult, setTestResult] = useState<{
    connected: boolean;
    resolution?: string;
    snapshot_base64?: string;
    error?: string;
  } | null>(null);
  const [snapshotBase64, setSnapshotBase64] = useState<string | null>(null);

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", { params: { limit: 100 } });
      return res.data.data;
    },
  });

  // Step 1 — Test connection (creates temp camera, tests, deletes)
  const testMutation = useMutation({
    mutationFn: async () => {
      // Create temp camera
      const createRes = await api.post("/cameras", {
        store_id: stores?.[0]?.id ?? state.storeId,
        name: "__wizard_test__",
        stream_type: state.streamType,
        stream_url: state.streamUrl,
        floor_type: "tile",
      });
      const camId = createRes.data.data.id;
      try {
        const testRes = await api.post(`/cameras/${camId}/test`);
        return { ...testRes.data.data, camId };
      } catch (err: any) {
        // Clean up on failure
        await api.delete(`/cameras/${camId}`).catch(() => {});
        throw err;
      }
    },
    onSuccess: (data) => {
      setTestResult({ connected: true, resolution: data.resolution, snapshot_base64: data.snapshot_base64 });
      setSnapshotBase64(data.snapshot_base64);
      setState((s) => ({ ...s, resolution: data.resolution ?? "" }));
      // Delete temp camera
      api.delete(`/cameras/${data.camId}`).catch(() => {});
    },
    onError: (err: any) => {
      setTestResult({
        connected: false,
        error: err?.response?.data?.detail ?? "Connection failed",
      });
    },
  });

  // Step 6 — Create camera
  const createMutation = useMutation({
    mutationFn: async () => {
      // Create camera
      const camRes = await api.post("/cameras", {
        store_id: state.storeId,
        name: state.cameraName,
        stream_type: state.streamType,
        stream_url: state.streamUrl,
        fps_config: state.fpsConfig,
        floor_type: state.floorType,
        min_wet_area_percent: state.minWetAreaPercent,
      });
      const camId = camRes.data.data.id;

      // Test connection to set status + snapshot
      await api.post(`/cameras/${camId}/test`).catch(() => {});

      // Save inference mode
      if (state.inferenceMode !== "cloud") {
        await api.put(`/cameras/${camId}/inference-mode`, {
          inference_mode: state.inferenceMode,
          hybrid_threshold: state.hybridThreshold,
        });
      }

      // Save ROI if drawn
      if (state.roiPoints.length >= 3) {
        await api.post(`/cameras/${camId}/roi`, {
          polygon_points: state.roiPoints,
          mask_outside: state.maskOutside,
        });
      }

      // Enable detection
      if (state.enableDetection) {
        await api.put(`/cameras/${camId}`, { detection_enabled: true });
      }

      return camId;
    },
    onSuccess: (camId) => {
      navigate(`/cameras/${camId}`);
    },
  });

  function canNext(): boolean {
    switch (step) {
      case 0: return !!testResult?.connected;
      case 1: return !!state.cameraName && !!state.storeId && !!state.floorType;
      case 2: return true;
      case 3: return true; // ROI optional
      case 4: return true; // Dry ref optional (captured via wizard later)
      case 5: return true;
      default: return false;
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                    i < step
                      ? "bg-[#0D9488] text-white"
                      : i === step
                        ? "border-2 border-[#0D9488] text-[#0D9488]"
                        : "border-2 border-[#E7E5E0] text-[#78716C]"
                  }`}
                >
                  {i < step ? <CheckCircle2 size={16} /> : i + 1}
                </div>
                <span className={`mt-1 text-xs ${i <= step ? "text-[#0D9488]" : "text-[#78716C]"}`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mx-2 h-0.5 flex-1 ${i < step ? "bg-[#0D9488]" : "bg-[#E7E5E0]"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
        {/* Step 1 — Connection Test */}
        {step === 0 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-[#1C1917]">Step 1 — Connection Test</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Stream URL *</label>
                <input
                  value={state.streamUrl}
                  onChange={(e) => setState({ ...state, streamUrl: e.target.value })}
                  placeholder="rtsp://192.168.1.100:554/stream"
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Stream Type</label>
                <select
                  value={state.streamType}
                  onChange={(e) => setState({ ...state, streamType: e.target.value })}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
                >
                  <option value="rtsp">RTSP</option>
                  <option value="hls">HLS</option>
                  <option value="mjpeg">MJPEG</option>
                  <option value="onvif">ONVIF</option>
                  <option value="http">HTTP</option>
                </select>
              </div>
              <button
                onClick={() => testMutation.mutate()}
                disabled={!state.streamUrl || testMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-3 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
              >
                {testMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Connecting to camera...
                  </>
                ) : (
                  <>
                    <Wifi size={16} />
                    Test Connection
                  </>
                )}
              </button>

              {testResult && (
                <div
                  className={`rounded-md p-4 ${
                    testResult.connected ? "bg-[#DCFCE7]" : "bg-[#FEE2E2]"
                  }`}
                >
                  {testResult.connected ? (
                    <div>
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#16A34A]">
                        <CheckCircle2 size={16} /> Connected successfully
                      </div>
                      {testResult.snapshot_base64 && (
                        <img
                          src={`data:image/jpeg;base64,${testResult.snapshot_base64}`}
                          alt="Snapshot"
                          className="mt-2 max-h-[180px] rounded"
                        />
                      )}
                      <p className="mt-2 text-xs text-[#16A34A]">
                        Detected: {state.streamType.toUpperCase()} | {testResult.resolution}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-[#DC2626]">
                      <XCircle size={16} />
                      {testResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2 — Configuration */}
        {step === 1 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-[#1C1917]">Step 2 — Preview & Configuration</h2>
            {snapshotBase64 && (
              <img
                src={`data:image/jpeg;base64,${snapshotBase64}`}
                alt="Preview"
                className="mb-4 max-h-[240px] rounded border border-[#E7E5E0]"
              />
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Store *</label>
                <select
                  value={state.storeId}
                  onChange={(e) => setState({ ...state, storeId: e.target.value })}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
                >
                  <option value="">Select a store</option>
                  {(stores ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Camera Name *</label>
                <input
                  value={state.cameraName}
                  onChange={(e) => setState({ ...state, cameraName: e.target.value })}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#1C1917]">FPS</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={30}
                      value={state.fpsConfig}
                      onChange={(e) => setState({ ...state, fpsConfig: parseInt(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="w-8 text-sm text-[#1C1917]">{state.fpsConfig}</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#1C1917]">Resolution</label>
                  <select
                    value={state.resolution}
                    onChange={(e) => setState({ ...state, resolution: e.target.value })}
                    className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
                  >
                    <option value="">Auto-detect</option>
                    <option value="640x480">480p</option>
                    <option value="1280x720">720p</option>
                    <option value="1920x1080">1080p</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Floor Type *</label>
                <select
                  value={state.floorType}
                  onChange={(e) => setState({ ...state, floorType: e.target.value })}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
                >
                  <option value="tile">Tile</option>
                  <option value="concrete">Concrete</option>
                  <option value="wood">Wood</option>
                  <option value="carpet">Carpet</option>
                  <option value="vinyl">Vinyl</option>
                  <option value="linoleum">Linoleum</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">
                  Min Wet Area % (threshold: {state.minWetAreaPercent}%)
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={state.minWetAreaPercent}
                  onChange={(e) => setState({ ...state, minWetAreaPercent: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <p className="mt-1 text-xs text-[#78716C]">
                  Only trigger alerts if wet area exceeds this % of the frame
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Inference Mode */}
        {step === 2 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-[#1C1917]">Step 3 — Inference Mode</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {([
                { mode: "cloud" as InferenceMode, icon: Cloud, label: "Cloud", desc: "All inference via Roboflow API. Highest accuracy. No edge hardware required." },
                { mode: "edge" as InferenceMode, icon: Zap, label: "Edge", desc: "100% local inference. Zero API cost. Requires edge agent + model." },
                { mode: "hybrid" as InferenceMode, icon: ArrowLeftRight, label: "Hybrid", desc: "Edge first, cloud fallback. Best cost/accuracy balance. Recommended." },
              ]).map(({ mode, icon: Icon, label, desc }) => (
                <button
                  key={mode}
                  onClick={() => setState({ ...state, inferenceMode: mode })}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    state.inferenceMode === mode
                      ? "border-[#0D9488] bg-[#CCFBF1]"
                      : "border-[#E7E5E0] hover:border-[#0D9488]/50"
                  }`}
                >
                  <Icon size={24} className={state.inferenceMode === mode ? "text-[#0D9488]" : "text-[#78716C]"} />
                  <h3 className="mt-2 font-semibold text-[#1C1917]">{label}</h3>
                  <p className="mt-1 text-xs text-[#78716C]">{desc}</p>
                </button>
              ))}
            </div>

            {state.inferenceMode === "hybrid" && (
              <div className="mt-6 space-y-4 rounded-lg border border-[#E7E5E0] p-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#1C1917]">
                    Escalation Threshold ({state.hybridThreshold})
                  </label>
                  <input
                    type="range"
                    min={0.4}
                    max={0.9}
                    step={0.05}
                    value={state.hybridThreshold}
                    onChange={(e) => setState({ ...state, hybridThreshold: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <p className="mt-1 text-xs text-[#78716C]">
                    Detections below {(state.hybridThreshold * 100).toFixed(0)}% confidence will be sent to Roboflow for a second opinion.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4 — ROI Drawing */}
        {step === 3 && (
          <div>
            <h2 className="mb-2 text-lg font-semibold text-[#1C1917]">Step 4 — ROI Drawing</h2>
            <p className="mb-4 text-sm text-[#78716C]">
              Draw a polygon around the area to monitor. Click to add points, double-click to close. Skip if you want to monitor the full frame.
            </p>
            <RoiCanvas
              snapshotBase64={snapshotBase64 ?? undefined}
              cameraId="__wizard__"
              onSave={(points, mask) => setState({ ...state, roiPoints: points, maskOutside: mask })}
            />
            {state.roiPoints.length >= 3 && (
              <p className="mt-2 text-xs text-[#16A34A]">
                ROI set with {state.roiPoints.length} points
              </p>
            )}
          </div>
        )}

        {/* Step 5 — Dry Reference */}
        {step === 4 && (
          <div>
            <h2 className="mb-2 text-lg font-semibold text-[#1C1917]">Step 5 — Dry Reference Capture</h2>
            <div className="mb-4 rounded-md bg-[#DBEAFE] p-3 text-sm text-[#2563EB]">
              Ensure the floor is completely dry and clear of people or objects. The system will use these frames as a baseline to detect changes.
            </div>
            {snapshotBase64 && (
              <img
                src={`data:image/jpeg;base64,${snapshotBase64}`}
                alt="Live preview"
                className="mb-4 max-h-[270px] rounded border border-[#E7E5E0]"
              />
            )}
            <p className="mb-4 text-sm text-[#78716C]">
              Dry reference frames will be captured automatically when the camera is created. You can recapture them later from the camera detail page.
            </p>
          </div>
        )}

        {/* Step 6 — Confirm */}
        {step === 5 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-[#1C1917]">Step 6 — Confirm & Enable</h2>
            <div className="rounded-lg border border-[#E7E5E0] p-4">
              <h3 className="mb-3 text-sm font-semibold text-[#78716C]">Camera Configuration Summary</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Name</dt>
                  <dd className="font-medium text-[#1C1917]">{state.cameraName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Store</dt>
                  <dd className="text-[#1C1917]">{stores?.find((s) => s.id === state.storeId)?.name ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Stream</dt>
                  <dd className="text-[#1C1917]">
                    {state.streamType.toUpperCase()} &middot; {state.resolution || "Auto"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Floor Type</dt>
                  <dd className="text-[#1C1917] capitalize">{state.floorType}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">FPS</dt>
                  <dd className="text-[#1C1917]">{state.fpsConfig} frames/second</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Min Wet Area</dt>
                  <dd className="text-[#1C1917]">{state.minWetAreaPercent}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">Inference</dt>
                  <dd><StatusBadgeInline mode={state.inferenceMode} threshold={state.hybridThreshold} /></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78716C]">ROI</dt>
                  <dd className="text-[#1C1917]">
                    {state.roiPoints.length >= 3
                      ? `${state.roiPoints.length} points${state.maskOutside ? " (masked)" : ""}`
                      : "Full frame"}
                  </dd>
                </div>
              </dl>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-[#1C1917]">
              <input
                type="checkbox"
                checked={state.enableDetection}
                onChange={(e) => setState({ ...state, enableDetection: e.target.checked })}
                className="rounded border-[#E7E5E0]"
              />
              Enable continuous detection immediately
            </label>

            {createMutation.isError && (
              <div className="mt-4 rounded-md bg-[#FEE2E2] px-3 py-2 text-sm text-[#DC2626]">
                Failed to create camera. Please try again.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => navigate("/cameras")}
          className="rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
        >
          Cancel
        </button>
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
              className="rounded-md bg-[#0D9488] px-6 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="flex items-center gap-2 rounded-md bg-[#0D9488] px-6 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
            >
              {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Finish Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadgeInline({ mode, threshold }: { mode: InferenceMode; threshold: number }) {
  const colors: Record<string, string> = {
    cloud: "text-[#2563EB]",
    edge: "text-[#7C3AED]",
    hybrid: "text-[#0891B2]",
  };
  return (
    <span className={`font-medium capitalize ${colors[mode]}`}>
      {mode}
      {mode === "hybrid" && ` (threshold: ${threshold})`}
    </span>
  );
}
