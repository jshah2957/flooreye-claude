import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
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

export default function CameraWizardPage() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  // Step state
  const [step, setStep] = useState(0);

  // Step 1: Store selection
  const [storeId, setStoreId] = useState("");

  // Step 2: Camera details + validation
  const [camName, setCamName] = useState("");
  const [camUrl, setCamUrl] = useState("");
  const [streamType, setStreamType] = useState("rtsp");
  const [location, setLocation] = useState("");
  const [testResult, setTestResult] = useState<{ connected: boolean; snapshot: string | null } | null>(null);
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

  // Map store → agent
  const agentByStore = new Map(agents.map((a) => [a.store_id, a]));
  const selectedAgent = agentByStore.get(storeId);

  function storeEdgeStatus(sid: string): "online" | "offline" | "none" {
    const agent = agentByStore.get(sid);
    if (!agent) return "none";
    return agent.status === "online" ? "online" : "offline";
  }

  // Test camera via edge
  const testMutation = useMutation({
    mutationFn: async () => {
      setTestResult(null);
      setTestError("");
      const res = await api.post("/edge/proxy/test-camera", {
        store_id: storeId,
        url: camUrl,
        stream_type: streamType,
      });
      return res.data.data as { connected: boolean; snapshot: string | null };
    },
    onSuccess: (data) => {
      setTestResult(data);
      if (!data.connected) setTestError("Camera not reachable on edge network");
    },
    onError: (err: any) => {
      setTestError(err?.response?.data?.detail || "Validation failed");
      setTestResult(null);
    },
  });

  // Add camera via edge proxy
  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/edge/proxy/add-camera", {
        store_id: storeId,
        name: camName,
        url: camUrl,
        stream_type: streamType,
        location,
      });
      return res.data.data as { cloud_camera_id: string };
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

  // Reset test when URL changes
  function handleUrlChange(val: string) {
    setCamUrl(val);
    setTestResult(null);
    setTestError("");
  }

  const canProceedStep0 = storeId && storeEdgeStatus(storeId) === "online";
  const canProceedStep1 = camName.trim() && camUrl.trim() && testResult?.connected;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => navigate("/cameras")} className="mb-2 flex items-center gap-1 text-sm text-[#78716C] hover:text-[#0D9488]">
          <ArrowLeft size={14} /> Back to Cameras
        </button>
        <h1 className="text-xl font-semibold text-[#1C1917]">Add Camera</h1>
        <p className="text-sm text-[#78716C]">Camera connectivity is tested through the edge device on the store's local network.</p>
      </div>

      {/* Step indicators */}
      <div className="mb-6 flex gap-2">
        {["Select Store", "Camera Details", "Done"].map((label, i) => (
          <div key={label} className={`flex-1 rounded-full py-1.5 text-center text-xs font-medium ${
            i === step ? "bg-[#0D9488] text-white" : i < step ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F1F0ED] text-[#78716C]"
          }`}>
            {label}
          </div>
        ))}
      </div>

      {/* Step 0: Select Store */}
      {step === 0 && (
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-[#1C1917]">Select Store</h2>
          <p className="mb-4 text-xs text-[#78716C]">
            Choose the store where this camera is located. The store must have an online edge device.
          </p>
          <div className="space-y-2">
            {stores.map((s) => {
              const edgeStatus = storeEdgeStatus(s.id);
              const agent = agentByStore.get(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors ${
                    storeId === s.id ? "border-[#0D9488] bg-[#F0FDFA]" : "border-[#E7E5E0] hover:border-[#0D9488]/50"
                  } ${edgeStatus !== "online" ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="store"
                      value={s.id}
                      checked={storeId === s.id}
                      onChange={() => setStoreId(s.id)}
                      disabled={edgeStatus !== "online"}
                      className="accent-[#0D9488]"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <StoreIcon size={14} className="text-[#78716C]" />
                        <span className="text-sm font-medium text-[#1C1917]">{s.name}</span>
                      </div>
                      {agent && (
                        <span className="text-[10px] text-[#78716C]">Edge: {agent.name}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    {edgeStatus === "online" && (
                      <span className="flex items-center gap-1 text-xs text-[#16A34A]"><Wifi size={12} /> Online</span>
                    )}
                    {edgeStatus === "offline" && (
                      <span className="flex items-center gap-1 text-xs text-[#DC2626]"><WifiOff size={12} /> Offline</span>
                    )}
                    {edgeStatus === "none" && (
                      <span className="text-xs text-[#78716C]">No edge device</span>
                    )}
                  </div>
                </label>
              );
            })}
            {stores.length === 0 && (
              <p className="py-8 text-center text-sm text-[#78716C]">No stores found. Create a store first.</p>
            )}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setStep(1)}
              disabled={!canProceedStep0}
              className="flex items-center gap-2 rounded-md bg-[#0D9488] px-5 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
            >
              Next <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Camera Details + Validate */}
      {step === 1 && (
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-[#1C1917]">Camera Details</h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#78716C]">Camera Name *</label>
              <input value={camName} onChange={(e) => setCamName(e.target.value)}
                placeholder="e.g. Entrance Camera"
                className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#78716C]">RTSP URL *</label>
              <input value={camUrl} onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="rtsp://admin:pass@192.168.1.100/stream"
                className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 font-mono text-sm outline-none focus:border-[#0D9488]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">Stream Type</label>
                <select value={streamType} onChange={(e) => setStreamType(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="rtsp">RTSP</option>
                  <option value="hls">HLS</option>
                  <option value="mjpeg">MJPEG</option>
                  <option value="http">HTTP</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">Location</label>
                <input value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Main entrance"
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
            </div>
          </div>

          {/* Validate button */}
          <div className="mt-4">
            <button
              onClick={() => testMutation.mutate()}
              disabled={!camUrl.trim() || testMutation.isPending}
              className="flex items-center gap-2 rounded-md border border-[#0D9488] px-4 py-2 text-sm font-medium text-[#0D9488] hover:bg-[#F0FDFA] disabled:opacity-50"
            >
              {testMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              Validate via Edge
            </button>
          </div>

          {/* Test result */}
          {testResult && testResult.connected && (
            <div className="mt-4 rounded-lg border border-[#DCFCE7] bg-[#F0FDF4] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#16A34A]">
                <CheckCircle size={16} /> Camera connected successfully
              </div>
              {testResult.snapshot && (
                <img
                  src={`data:image/jpeg;base64,${testResult.snapshot}`}
                  alt="Preview"
                  className="mt-2 max-h-[300px] rounded-md border border-[#E7E5E0]"
                />
              )}
            </div>
          )}
          {testError && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-sm text-[#DC2626]">
              <XCircle size={16} /> {testError}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex justify-between">
            <button onClick={() => setStep(0)}
              className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-4 py-2 text-sm text-[#78716C] hover:bg-[#F1F0ED]">
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={() => addMutation.mutate()}
              disabled={!canProceedStep1 || addMutation.isPending}
              className="flex items-center gap-2 rounded-md bg-[#0D9488] px-5 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
            >
              {addMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Add Camera
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Done */}
      {step === 2 && (
        <div className="rounded-lg border border-[#E7E5E0] bg-white p-6 text-center">
          <CheckCircle size={48} className="mx-auto mb-4 text-[#16A34A]" />
          <h2 className="mb-2 text-lg font-semibold text-[#1C1917]">Camera Added</h2>
          <p className="mb-1 text-sm text-[#78716C]">
            "{camName}" has been added to the cloud and edge device.
          </p>
          <p className="mb-6 text-sm text-[#D97706]">
            Next: Configure ROI (floor boundary) and capture dry reference images to start detection.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => navigate(`/cameras/${createdCameraId}`)}
              className="rounded-md bg-[#0D9488] px-5 py-2 text-sm font-medium text-white hover:bg-[#0F766E]"
            >
              Configure Camera
            </button>
            <button
              onClick={() => { setStep(0); setCamName(""); setCamUrl(""); setLocation(""); setTestResult(null); setTestError(""); setCreatedCameraId(null); }}
              className="rounded-md border border-[#E7E5E0] px-5 py-2 text-sm text-[#78716C] hover:bg-[#F1F0ED]"
            >
              Add Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
