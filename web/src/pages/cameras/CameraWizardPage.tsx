import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { isPrivateUrl as isPrivateAddress } from "@/constants/validation";
import {
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Camera,
  Store as StoreIcon,
  Wifi,
  WifiOff,
  Check,
} from "lucide-react";

import api from "@/lib/api";
import type { Store, PaginatedResponse } from "@/types";
import { useToast } from "@/components/ui/Toast";

interface EdgeAgent {
  id: string;
  store_id: string;
  name: string;
  status: string;
}

interface TestCameraResult {
  connected: boolean;
  snapshot_base64: string | null;
  error: string | null;
  resolution: string | null;
}

const STEP_LABELS = ["Select Store", "Camera Details", "Complete"];

export default function CameraWizardPage() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  // Step state (0 = Select Store, 1 = Details + Validate, 2 = Complete)
  const [step, setStep] = useState(0);

  // Inference mode: cloud (direct RTSP) or edge (via edge agent)
  const [inferenceMode, setInferenceMode] = useState<"cloud" | "edge">("cloud");

  // Step 1: Store selection
  const [storeId, setStoreId] = useState("");

  // Step 2: Camera details + validation
  const [camName, setCamName] = useState("");
  const [camUrl, setCamUrl] = useState("");
  const [streamType, setStreamType] = useState("rtsp");
  const [location, setLocation] = useState("");
  const [testResult, setTestResult] = useState<TestCameraResult | null>(null);
  const [testError, setTestError] = useState("");

  // Step 3: Result
  const [createdCameraId, setCreatedCameraId] = useState<string | null>(null);

  // Data queries
  const { data: storesData } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", { params: { limit: 100 } });
      return res.data.data;
    },
  });

  const { data: agentsData } = useQuery({
    queryKey: ["edge-agents-all"],
    queryFn: async () => {
      const res = await api.get("/edge/agents", { params: { limit: 100 } });
      return res.data.data as EdgeAgent[];
    },
  });

  const stores = storesData ?? [];
  const agents = agentsData ?? [];

  // Map store -> agent
  const agentByStore = new Map(agents.map((a) => [a.store_id, a]));

  function storeEdgeStatus(sid: string): "online" | "offline" | "none" {
    const agent = agentByStore.get(sid);
    if (!agent) return "none";
    return agent.status === "online" ? "online" : "offline";
  }

  // Test camera — cloud mode uses direct API, edge mode uses edge proxy
  const testMutation = useMutation({
    mutationFn: async () => {
      setTestResult(null);
      setTestError("");
      if (inferenceMode === "cloud") {
        // Cloud mode: create a temp camera, test directly, then delete
        // Or just test the URL via the backend test endpoint
        const createRes = await api.post("/cameras", {
          store_id: storeId,
          name: `_test_${Date.now()}`,
          stream_url: camUrl,
          stream_type: streamType,
          floor_type: "tile",
          inference_mode: "cloud",
        });
        const tempCamId = createRes.data.data.id;
        try {
          const testRes = await api.post(`/cameras/${tempCamId}/test`);
          return testRes.data.data as TestCameraResult;
        } finally {
          // Clean up temp camera
          try { await api.delete(`/cameras/${tempCamId}`); } catch {}
        }
      } else {
        // Edge mode: test via edge proxy
        const res = await api.post("/edge/proxy/test-camera", {
          store_id: storeId,
          url: camUrl,
          stream_type: streamType,
        });
        return res.data as TestCameraResult;
      }
    },
    onSuccess: (data) => {
      setTestResult(data);
      if (!data.connected) {
        setTestError(data.error || "Camera not reachable");
      }
    },
    onError: (err: any) => {
      setTestError(err?.response?.data?.detail || "Validation failed");
      setTestResult(null);
    },
  });

  // Add camera — cloud mode uses direct API, edge mode uses edge proxy
  const addMutation = useMutation({
    mutationFn: async () => {
      if (inferenceMode === "cloud") {
        // Cloud mode: create camera directly via backend API
        const res = await api.post("/cameras", {
          store_id: storeId,
          name: camName,
          stream_url: camUrl,
          stream_type: streamType,
          floor_type: "tile",
          inference_mode: "cloud",
        });
        return { cloud_camera_id: res.data.data.id };
      } else {
        // Edge mode: create via edge proxy
        const res = await api.post("/edge/proxy/add-camera", {
          store_id: storeId,
          name: camName,
          url: camUrl,
          stream_type: streamType,
          location,
        });
        return res.data.data as { cloud_camera_id: string };
      }
    },
    onSuccess: (data) => {
      setCreatedCameraId(data.cloud_camera_id);
      setStep(2);
      success("Camera added");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to add camera");
    },
  });

  // Reset test when URL or stream type changes
  function handleUrlChange(val: string) {
    setCamUrl(val);
    setTestResult(null);
    setTestError("");
  }

  function handleStreamTypeChange(val: string) {
    setStreamType(val);
    setTestResult(null);
    setTestError("");
  }

  // Reset wizard to step 1
  function resetWizard() {
    setStep(0);
    setStoreId("");
    setInferenceMode("cloud");
    setCamName("");
    setCamUrl("");
    setStreamType("rtsp");
    setLocation("");
    setTestResult(null);
    setTestError("");
    setCreatedCameraId(null);
  }

  // Cloud mode: any store works. Edge mode: requires online edge agent.
  const canProceedStep0 = storeId && (inferenceMode === "cloud" || storeEdgeStatus(storeId) === "online");
  const canProceedStep1 = camName.trim() && camUrl.trim() && testResult?.connected;

  return (
    <div className="mx-auto max-w-2xl pb-12">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate("/cameras")}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-[#0D9488]"
        >
          <ArrowLeft size={14} /> Back to Cameras
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Add Camera</h1>
        <p className="mt-1 text-sm text-gray-500">
          {inferenceMode === "cloud"
            ? "Camera must be accessible via a public RTSP URL. Detection runs on the cloud server."
            : "Camera connectivity is validated through the edge device on the store's local network."}
        </p>

        {/* Inference Mode Selector */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => setInferenceMode("cloud")}
            className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all ${
              inferenceMode === "cloud"
                ? "border-[#0D9488] bg-[#F0FDFA] text-[#0D9488]"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
            Cloud (Public RTSP)
          </button>
          <button
            onClick={() => setInferenceMode("edge")}
            className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all ${
              inferenceMode === "edge"
                ? "border-[#0D9488] bg-[#F0FDFA] text-[#0D9488]"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Edge (Local Network)
          </button>
        </div>
      </div>

      {/* Step indicators */}
      <div className="mb-8">
        <div className="flex items-center">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center">
              {/* Step circle + label */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all ${
                    i === step
                      ? "bg-[#0D9488] text-white shadow-md shadow-[#0D9488]/30"
                      : i < step
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {i < step ? <Check size={16} strokeWidth={3} /> : i + 1}
                </div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    i === step ? "text-[#0D9488]" : i < step ? "text-green-600" : "text-gray-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {/* Connecting line */}
              {i < STEP_LABELS.length - 1 && (
                <div className="flex-1 px-3">
                  <div
                    className={`h-0.5 rounded-full transition-colors ${
                      i < step ? "bg-green-400" : "bg-gray-200"
                    }`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 0: Select Store */}
      {step === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-bold text-gray-900">Select Store</h2>
          <p className="mb-5 text-sm text-gray-500">
            {inferenceMode === "cloud"
              ? "Choose the store where this camera is located."
              : "Choose the store where this camera is located. Only stores with an online edge agent can be selected."}
          </p>
          <div className="space-y-3">
            {stores.map((s) => {
              const edgeStatus = storeEdgeStatus(s.id);
              const agent = agentByStore.get(s.id);
              const isOnline = inferenceMode === "cloud" ? true : edgeStatus === "online";
              const isSelected = storeId === s.id;
              return (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition-all ${
                    isSelected
                      ? "border-[#0D9488] bg-[#F0FDFA] shadow-sm"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
                  } ${!isOnline ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="radio"
                      name="store"
                      value={s.id}
                      checked={isSelected}
                      onChange={() => setStoreId(s.id)}
                      disabled={!isOnline}
                      className="sr-only"
                    />
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      isSelected ? "bg-[#0D9488]/10" : "bg-gray-100"
                    }`}>
                      <StoreIcon size={18} className={isSelected ? "text-[#0D9488]" : "text-gray-400"} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{s.name}</span>
                        {isSelected && (
                          <span className="rounded-full bg-[#0D9488] px-1.5 py-0.5">
                            <Check size={10} className="text-white" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-xs text-gray-400">{s.address || s.city || "--"}</span>
                        {agent && (
                          <>
                            <span className="text-gray-300">&middot;</span>
                            <span className="text-xs text-gray-400">Edge: {agent.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    {edgeStatus === "online" && (
                      <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-600">
                        <Wifi size={12} /> Online
                      </span>
                    )}
                    {edgeStatus === "offline" && (
                      <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
                        <WifiOff size={12} /> Offline
                      </span>
                    )}
                    {edgeStatus === "none" && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">No edge device</span>
                    )}
                  </div>
                </label>
              );
            })}
            {stores.length === 0 && (
              <div className="flex flex-col items-center py-12 text-center">
                <StoreIcon size={32} className="mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No stores found</p>
                <p className="mt-1 text-xs text-gray-400">Create a store first</p>
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setStep(1)}
              disabled={!canProceedStep0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0F766E] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Camera Details + Validate */}
      {step === 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-gray-900">Camera Details</h2>

          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Camera Name <span className="text-red-400">*</span>
              </label>
              <input
                value={camName}
                onChange={(e) => setCamName(e.target.value)}
                placeholder="e.g. Entrance Camera"
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                RTSP URL <span className="text-red-400">*</span>
              </label>
              <input
                value={camUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder={inferenceMode === "cloud" ? "rtsp://user:pass@your-public-ip:554/stream" : "rtsp://admin:pass@192.168.1.100/stream"}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 font-mono text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
              />
              {inferenceMode === "cloud" && camUrl && isPrivateAddress(camUrl) && (
                <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  This looks like a private network address. Cloud detection cannot reach private cameras.
                  Use Edge mode, set up port forwarding, or use a tunnel service.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Stream Type
                </label>
                <select
                  value={streamType}
                  onChange={(e) => handleStreamTypeChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                >
                  <option value="rtsp">RTSP</option>
                  <option value="hls">HLS</option>
                  <option value="mjpeg">MJPEG</option>
                  <option value="http">HTTP</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Main entrance"
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                />
              </div>
            </div>
          </div>

          {/* Validate button */}
          <div className="mt-5">
            <button
              onClick={() => testMutation.mutate()}
              disabled={!camUrl.trim() || testMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-[#0D9488] px-5 py-2.5 text-sm font-semibold text-[#0D9488] transition-all hover:bg-[#F0FDFA] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {testMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Camera size={14} />
              )}
              {testMutation.isPending ? "Testing Connection..." : "Test Connection"}
            </button>
          </div>

          {/* Test result -- success */}
          {testResult && testResult.connected && (
            <div className="mt-5 overflow-hidden rounded-xl border-2 border-green-200 bg-green-50/50">
              <div className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-green-700">
                <CheckCircle size={18} /> Camera connected successfully
                {testResult.resolution && (
                  <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {testResult.resolution}
                  </span>
                )}
              </div>
              {testResult.snapshot_base64 && (
                <img
                  src={`data:image/jpeg;base64,${testResult.snapshot_base64}`}
                  alt="Preview frame"
                  className="w-full border-t border-green-200"
                />
              )}
            </div>
          )}

          {/* Test result -- failure */}
          {testError && (
            <div className="mt-5 flex items-center gap-2.5 rounded-xl border-2 border-red-200 bg-red-50/50 px-4 py-3 text-sm font-medium text-red-700">
              <XCircle size={18} /> {testError}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-6">
            <button
              onClick={() => setStep(0)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={() => addMutation.mutate()}
              disabled={!canProceedStep1 || addMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0F766E] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
            >
              {addMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {addMutation.isPending ? "Adding..." : "Add Camera"}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Complete */}
      {step === 2 && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          {addMutation.isPending ? (
            <div className="flex flex-col items-center">
              <Loader2 size={48} className="mb-4 animate-spin text-[#0D9488]" />
              <h2 className="text-xl font-bold text-gray-900">Adding camera...</h2>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
                <CheckCircle size={48} className="text-green-500" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-gray-900">Camera Added Successfully</h2>
              <p className="mb-8 max-w-sm text-sm text-gray-500">
                Configure ROI and dry reference to start detection.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => navigate(`/cameras/${createdCameraId}`)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0D9488] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0F766E] hover:shadow-md"
                >
                  Go to Camera Detail
                </button>
                <button
                  onClick={resetWizard}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Add Another Camera
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
