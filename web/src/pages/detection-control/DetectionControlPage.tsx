import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  Building2,
  Store as StoreIcon,
  Camera,
  Search,
  ChevronRight,
  ChevronDown,
  Save,
  Loader2,
  RotateCcw,
  AlertTriangle,
  Copy,
  X,
} from "lucide-react";

import api from "@/lib/api";
import type { Store, Camera as CameraType, PaginatedResponse } from "@/types";
import { useToast } from "@/components/ui/Toast";

type Scope = "global" | "org" | "store" | "camera";

interface ScopeNode {
  scope: Scope;
  scope_id: string | null;
  label: string;
  hasOverrides?: boolean;
}

export default function DetectionControlPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [selectedScope, setSelectedScope] = useState<Scope>("global");
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("Global Defaults");
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState("");
  const [copyLoading, setCopyLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // Load stores + cameras for tree
  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", { params: { limit: 100 } });
      return res.data.data;
    },
  });

  const { data: cameras } = useQuery({
    queryKey: ["cameras-all-ctrl"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<CameraType>>("/cameras", { params: { limit: 500 } });
      return res.data.data;
    },
  });

  // Load settings for selected scope
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["dc-settings", selectedScope, selectedScopeId],
    queryFn: async () => {
      const params: Record<string, string> = { scope: selectedScope };
      if (selectedScopeId) params.scope_id = selectedScopeId;
      const res = await api.get("/detection-control/settings", { params });
      return res.data.data;
    },
  });

  // Load inheritance for camera scope
  const { data: inheritance } = useQuery({
    queryKey: ["dc-inheritance", selectedScopeId],
    queryFn: async () => {
      const res = await api.get(`/detection-control/inheritance/${selectedScopeId}`);
      return res.data.data;
    },
    enabled: selectedScope === "camera" && !!selectedScopeId,
  });

  // Form state
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formDirty, setFormDirty] = useState(false);

  function selectNode(scope: Scope, scopeId: string | null, label: string) {
    setSelectedScope(scope);
    setSelectedScopeId(scopeId);
    setSelectedLabel(label);
    setFormData({});
    setFormDirty(false);
  }

  function updateField(field: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormDirty(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put("/detection-control/settings", {
        scope: selectedScope,
        scope_id: selectedScopeId,
        ...formData,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["dc-settings"] });
      queryClient.invalidateQueries({ queryKey: ["dc-inheritance"] });
      setFormDirty(false);
      const pushCount = data?.edge_push?.cameras_pushed ?? 0;
      if (pushCount > 0) {
        success(`Settings saved — pushed to ${pushCount} edge camera(s)`);
      } else {
        success("Settings saved");
      }
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to save settings");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const params: Record<string, string> = { scope: selectedScope };
      if (selectedScopeId) params.scope_id = selectedScopeId;
      await api.delete("/detection-control/settings", { params });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dc-settings"] });
      setFormData({});
      setFormDirty(false);
      success("Settings reset to inherited");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to reset settings");
    },
  });

  function getFieldValue(field: string) {
    if (field in formData) return formData[field];
    if (settings && settings[field] !== undefined && settings[field] !== null) return settings[field];
    return undefined;
  }

  function toggleStore(storeId: string) {
    setExpandedStores((prev) => {
      const next = new Set(prev);
      next.has(storeId) ? next.delete(storeId) : next.add(storeId);
      return next;
    });
  }

  const storeList = (stores ?? []).filter(
    (s) => !treeSearch || (s.name ?? '').toLowerCase().includes(treeSearch.toLowerCase())
  );

  const camerasByStore = new Map<string, CameraType[]>();
  for (const cam of cameras ?? []) {
    if (treeSearch && !(cam.name ?? '').toLowerCase().includes(treeSearch.toLowerCase())) continue;
    const list = camerasByStore.get(cam.store_id) ?? [];
    list.push(cam);
    camerasByStore.set(cam.store_id, list);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Detection Control Center</h1>
        <p className="text-sm text-[#78716C]">Configure detection settings with scoped inheritance</p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* ── Left: Scope Tree ── */}
        <div className="col-span-3 rounded-lg border border-[#E7E5E0] bg-white p-3">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#78716C]" />
            <input
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-md border border-[#E7E5E0] pl-8 pr-3 py-1.5 text-xs outline-none focus:border-[#0D9488]"
            />
          </div>

          {/* Global */}
          <button
            onClick={() => selectNode("global", null, "Global Defaults")}
            className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs ${
              selectedScope === "global" && !selectedScopeId
                ? "bg-[#CCFBF1] text-[#0D9488]"
                : "text-[#1C1917] hover:bg-[#F8F7F4]"
            }`}
          >
            <Globe size={12} /> Global Defaults
          </button>

          {/* Stores + Cameras */}
          {storeList.map((store) => (
            <div key={store.id} className="ml-2">
              <div className="flex items-center">
                <button
                  onClick={() => toggleStore(store.id)}
                  className="p-0.5 text-[#78716C]"
                >
                  {expandedStores.has(store.id) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </button>
                <button
                  onClick={() => selectNode("store", store.id, store.name)}
                  className={`flex flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-xs ${
                    selectedScope === "store" && selectedScopeId === store.id
                      ? "bg-[#CCFBF1] text-[#0D9488]"
                      : "text-[#1C1917] hover:bg-[#F8F7F4]"
                  }`}
                >
                  <StoreIcon size={10} />
                  <span className="truncate">{store.name}</span>
                </button>
              </div>

              {expandedStores.has(store.id) && (camerasByStore.get(store.id) ?? []).map((cam) => (
                <button
                  key={cam.id}
                  onClick={() => selectNode("camera", cam.id, `${cam.name} (${store.name})`)}
                  className={`ml-5 flex w-[calc(100%-1.25rem)] items-center gap-1.5 rounded px-1.5 py-1 text-xs ${
                    selectedScope === "camera" && selectedScopeId === cam.id
                      ? "bg-[#CCFBF1] text-[#0D9488]"
                      : "text-[#78716C] hover:bg-[#F8F7F4]"
                  }`}
                >
                  <Camera size={10} />
                  <span className="truncate">{cam.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* ── Center: Settings Form ── */}
        <div className="col-span-6 rounded-lg border border-[#E7E5E0] bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#1C1917]">{selectedLabel}</h2>
              <p className="text-xs text-[#78716C]">Scope: {selectedScope}</p>
            </div>
            <div className="flex gap-2">
              {selectedScope !== "global" && settings && (
                <button
                  onClick={() => {
                    setConfirmDialog({
                      title: "Reset to Inherited",
                      message: `Reset settings for this ${selectedScope}? It will inherit from parent scope.`,
                      confirmLabel: "Reset",
                      onConfirm: () => deleteMutation.mutate(),
                    });
                  }}
                  className="flex items-center gap-1 rounded-md border border-[#E7E5E0] px-3 py-1.5 text-xs text-[#78716C] hover:bg-[#F1F0ED]"
                >
                  <RotateCcw size={12} /> Reset to Inherited
                </button>
              )}
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!formDirty || saveMutation.isPending}
                className="flex items-center gap-1 rounded-md bg-[#0D9488] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
              >
                {saveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save
              </button>
              {selectedScope === "camera" && selectedScopeId && (
                <select
                  disabled={copyLoading}
                  onChange={async (e) => {
                    const srcId = e.target.value;
                    const selectEl = e.target;
                    if (!srcId) return;
                    selectEl.value = "";
                    setCopyLoading(true);
                    try {
                      const res = await api.get(`/detection-control/effective/${srcId}`);
                      const srcSettings = res.data?.data?.settings;
                      if (srcSettings && typeof srcSettings === "object") {
                        const copiedFields: Record<string, unknown> = {};
                        const settingKeys = [
                          "layer1_enabled", "layer1_confidence",
                          "layer2_enabled", "layer2_min_area_percent",
                          "layer3_enabled", "layer3_k", "layer3_m", "layer3_voting_mode",
                          "layer4_enabled", "layer4_delta_threshold", "layer4_auto_refresh", "layer4_stale_warning_days",
                          "detection_enabled", "capture_fps", "detection_interval_seconds", "cooldown_after_alert_seconds",
                          "auto_create_incident", "incident_grouping_window_seconds", "auto_close_after_minutes", "auto_notify_on_create",
                          "min_severity_to_create", "auto_trigger_devices_on_create",
                          "severity_critical_confidence", "severity_critical_area",
                          "severity_high_confidence", "severity_high_area",
                          "severity_medium_confidence", "severity_medium_count",
                          "hybrid_escalation_threshold", "hybrid_max_escalations_per_min", "hybrid_save_escalated_frames",
                        ];
                        for (const key of settingKeys) {
                          if (srcSettings[key] !== undefined && srcSettings[key] !== null) {
                            copiedFields[key] = srcSettings[key];
                          }
                        }
                        setFormData(copiedFields);
                        setFormDirty(true);
                        const srcCam = (cameras ?? []).find((c) => c.id === srcId);
                        success(`Settings loaded from "${srcCam?.name ?? srcId}" — review and click Save`);
                      } else {
                        showError("Source camera has no effective settings");
                      }
                    } catch (err: any) {
                      showError(err?.response?.data?.detail || "Failed to load source settings");
                    } finally {
                      setCopyLoading(false);
                    }
                  }}
                  className="rounded-md border border-[#E7E5E0] px-2 py-1.5 text-[10px] text-[#78716C] outline-none disabled:opacity-50"
                >
                  <option value="">{copyLoading ? "Loading..." : "Copy from camera..."}</option>
                  {(cameras ?? []).filter((c: any) => c.id !== selectedScopeId).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {settingsLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[#0D9488]" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Layer 1 */}
              <SettingsSection title="Layer 1 — Confidence Filter">
                <ToggleField label="Enabled" field="layer1_enabled" value={getFieldValue("layer1_enabled")} onChange={updateField} />
                <SliderField label="Min Confidence" field="layer1_confidence" value={getFieldValue("layer1_confidence")}
                  min={0} max={1} step={0.05} format={(v) => `${(v * 100).toFixed(0)}%`} onChange={updateField} />
              </SettingsSection>

              {/* Layer 2 */}
              <SettingsSection title="Layer 2 — Wet Area Filter">
                <ToggleField label="Enabled" field="layer2_enabled" value={getFieldValue("layer2_enabled")} onChange={updateField} />
                <SliderField label="Min Wet Area %" field="layer2_min_area_percent" value={getFieldValue("layer2_min_area_percent")}
                  min={0} max={10} step={0.1} format={(v) => `${v.toFixed(1)}%`} onChange={updateField} />
              </SettingsSection>

              {/* Layer 3 */}
              <SettingsSection title="Layer 3 — K-of-M Frame Voting">
                <ToggleField label="Enabled" field="layer3_enabled" value={getFieldValue("layer3_enabled")} onChange={updateField} />
                <NumberField label="K (required)" field="layer3_k" value={getFieldValue("layer3_k")} min={1} max={10} onChange={updateField} />
                <NumberField label="M (window)" field="layer3_m" value={getFieldValue("layer3_m")} min={1} max={20} onChange={updateField} />
                <SelectField label="Voting Mode" field="layer3_voting_mode" value={getFieldValue("layer3_voting_mode")}
                  options={["strict", "majority", "relaxed"]} onChange={updateField} />
              </SettingsSection>

              {/* Layer 4 */}
              <SettingsSection title="Layer 4 — Dry Reference Comparison">
                <ToggleField label="Enabled" field="layer4_enabled" value={getFieldValue("layer4_enabled")} onChange={updateField} />
                <SliderField label="Delta Threshold" field="layer4_delta_threshold" value={getFieldValue("layer4_delta_threshold")}
                  min={0.05} max={0.5} step={0.01} format={(v) => v.toFixed(2)} onChange={updateField} />
                <SelectField label="Auto Refresh" field="layer4_auto_refresh" value={getFieldValue("layer4_auto_refresh")}
                  options={["never", "hourly", "daily", "weekly"]} onChange={updateField} />
                <NumberField label="Stale Warning (days)" field="layer4_stale_warning_days" value={getFieldValue("layer4_stale_warning_days")}
                  min={1} max={365} onChange={updateField} />
              </SettingsSection>

              {/* Continuous Detection */}
              <SettingsSection title="Continuous Detection">
                <ToggleField label="Detection Enabled" field="detection_enabled" value={getFieldValue("detection_enabled")} onChange={updateField} />
                <NumberField label="Capture FPS" field="capture_fps" value={getFieldValue("capture_fps")} min={1} max={30} onChange={updateField} />
                <NumberField label="Interval (seconds)" field="detection_interval_seconds" value={getFieldValue("detection_interval_seconds")} min={1} max={60} onChange={updateField} />
                <NumberField label="Cooldown After Alert (s)" field="cooldown_after_alert_seconds" value={getFieldValue("cooldown_after_alert_seconds")} min={0} max={600} onChange={updateField} />
              </SettingsSection>

              {/* Incident Generation */}
              <SettingsSection title="Incident Generation">
                <ToggleField label="Auto-Create Incidents" field="auto_create_incident" value={getFieldValue("auto_create_incident")} onChange={updateField} />
                <SliderField label="Grouping Window" field="incident_grouping_window_seconds" value={getFieldValue("incident_grouping_window_seconds")}
                  min={30} max={3600} step={30} format={(v) => {
                    if (v >= 60) return `${Math.floor(v / 60)}m ${v % 60 ? `${v % 60}s` : ""}`.trim();
                    return `${v}s`;
                  }} onChange={updateField} />
                <SelectField label="Min Severity to Create" field="min_severity_to_create" value={getFieldValue("min_severity_to_create")}
                  options={["low", "medium", "high", "critical"]} onChange={updateField} />
                <SliderField label="Auto-Close Timeout" field="auto_close_after_minutes" value={getFieldValue("auto_close_after_minutes")}
                  min={5} max={1440} step={5} format={(v) => {
                    if (v >= 60) return `${Math.floor(v / 60)}h ${v % 60 ? `${v % 60}m` : ""}`.trim();
                    return `${v}m`;
                  }} onChange={updateField} />
                <ToggleField label="Auto-Notify on Create" field="auto_notify_on_create" value={getFieldValue("auto_notify_on_create")} onChange={updateField} />
                <ToggleField label="Auto-Trigger Devices on Create" field="auto_trigger_devices_on_create" value={getFieldValue("auto_trigger_devices_on_create")} onChange={updateField} />
              </SettingsSection>

              {/* Severity Thresholds */}
              <SettingsSection title="Severity Thresholds">
                <div className="mb-2 text-[10px] text-[#A8A29E]">
                  Define the confidence and wet area thresholds that determine incident severity levels.
                </div>
                <div className="rounded-md border border-[#DC2626]/20 bg-[#FEF2F2] p-2.5">
                  <div className="mb-2 text-xs font-semibold text-[#DC2626]">Critical</div>
                  <SliderField label="Min Confidence" field="severity_critical_confidence" value={getFieldValue("severity_critical_confidence")}
                    min={0} max={1} step={0.05} format={(v) => `${(v * 100).toFixed(0)}%`} onChange={updateField} />
                  <div className="mt-2">
                    <SliderField label="Min Wet Area %" field="severity_critical_area" value={getFieldValue("severity_critical_area")}
                      min={0} max={50} step={0.5} format={(v) => `${v.toFixed(1)}%`} onChange={updateField} />
                  </div>
                </div>
                <div className="rounded-md border border-[#EA580C]/20 bg-[#FFF7ED] p-2.5">
                  <div className="mb-2 text-xs font-semibold text-[#EA580C]">High</div>
                  <SliderField label="Min Confidence" field="severity_high_confidence" value={getFieldValue("severity_high_confidence")}
                    min={0} max={1} step={0.05} format={(v) => `${(v * 100).toFixed(0)}%`} onChange={updateField} />
                  <div className="mt-2">
                    <SliderField label="Min Wet Area %" field="severity_high_area" value={getFieldValue("severity_high_area")}
                      min={0} max={50} step={0.5} format={(v) => `${v.toFixed(1)}%`} onChange={updateField} />
                  </div>
                </div>
                <div className="rounded-md border border-[#D97706]/20 bg-[#FFFBEB] p-2.5">
                  <div className="mb-2 text-xs font-semibold text-[#D97706]">Medium</div>
                  <SliderField label="Min Confidence" field="severity_medium_confidence" value={getFieldValue("severity_medium_confidence")}
                    min={0} max={1} step={0.05} format={(v) => `${(v * 100).toFixed(0)}%`} onChange={updateField} />
                  <div className="mt-2">
                    <NumberField label="Min Detection Count" field="severity_medium_count" value={getFieldValue("severity_medium_count")}
                      min={1} max={100} onChange={updateField} />
                  </div>
                </div>
              </SettingsSection>

              {/* Hybrid */}
              <SettingsSection title="Hybrid Escalation">
                <SliderField label="Escalation Threshold" field="hybrid_escalation_threshold" value={getFieldValue("hybrid_escalation_threshold")}
                  min={0.4} max={0.9} step={0.05} format={(v) => `${(v * 100).toFixed(0)}%`} onChange={updateField} />
                <NumberField label="Max Escalations/min" field="hybrid_max_escalations_per_min" value={getFieldValue("hybrid_max_escalations_per_min")} min={1} max={100} onChange={updateField} />
                <ToggleField label="Save Escalated Frames" field="hybrid_save_escalated_frames" value={getFieldValue("hybrid_save_escalated_frames")} onChange={updateField} />
              </SettingsSection>
            </div>
          )}
        </div>

        {/* ── Right: Inheritance Viewer ── */}
        <div className="col-span-3 rounded-lg border border-[#E7E5E0] bg-white p-3">
          <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">Inheritance</h3>
          {selectedScope === "camera" && inheritance ? (
            <div className="space-y-2 text-xs">
              {Object.entries(inheritance.provenance ?? {}).map(([field, source]) => (
                <div key={field} className="flex items-center justify-between">
                  <span className="truncate text-[#78716C]">{field.replace(/_/g, " ")}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                    source === "camera" ? "bg-[#CCFBF1] text-[#0D9488]" :
                    source === "store" ? "bg-[#DBEAFE] text-[#2563EB]" :
                    source === "org" ? "bg-[#FEF3C7] text-[#D97706]" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {(source as string)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#78716C]">
              {selectedScope === "camera"
                ? "Loading inheritance chain..."
                : "Select a camera to view the full inheritance chain per field."}
            </p>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-[#E7E5E0] bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FEF3C7]">
                <AlertTriangle size={16} className="text-[#D97706]" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-[#1C1917]">{confirmDialog.title}</h3>
                <p className="mt-1 text-xs text-[#78716C]">{confirmDialog.message}</p>
              </div>
              <button
                onClick={() => setConfirmDialog(null)}
                className="shrink-0 text-[#A8A29E] hover:text-[#78716C]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="rounded-md border border-[#E7E5E0] px-3 py-1.5 text-xs text-[#78716C] hover:bg-[#F1F0ED]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="rounded-md bg-[#DC2626] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#B91C1C]"
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Form Field Components ──────────────────────────────────────

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-md border border-[#E7E5E0]">
      <button onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F8F7F4]">
        {title}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="space-y-3 border-t border-[#E7E5E0] px-3 py-3">{children}</div>}
    </div>
  );
}

function ToggleField({ label, field, value, onChange }: {
  label: string; field: string; value: unknown; onChange: (f: string, v: unknown) => void;
}) {
  const checked = value === true;
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-[#1C1917]">{label}</label>
      <button onClick={() => onChange(field, !checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-[#0D9488]" : "bg-gray-300"}`}>
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );
}

function SliderField({ label, field, value, min, max, step, format, onChange }: {
  label: string; field: string; value: unknown; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (f: string, v: unknown) => void;
}) {
  const num = typeof value === "number" ? value : min;
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs text-[#1C1917]">{label}</label>
        <span className="text-xs font-medium text-[#0D9488]">{format(num)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={num}
        onChange={(e) => onChange(field, parseFloat(e.target.value))} className="mt-1 w-full" />
    </div>
  );
}

function NumberField({ label, field, value, min, max, onChange }: {
  label: string; field: string; value: unknown; min: number; max: number;
  onChange: (f: string, v: unknown) => void;
}) {
  const num = typeof value === "number" ? value : min;
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-[#1C1917]">{label}</label>
      <input type="number" min={min} max={max} value={num}
        onChange={(e) => onChange(field, parseInt(e.target.value) || min)}
        className="w-20 rounded-md border border-[#E7E5E0] px-2 py-1 text-xs outline-none focus:border-[#0D9488]" />
    </div>
  );
}

function SelectField({ label, field, value, options, onChange }: {
  label: string; field: string; value: unknown; options: string[];
  onChange: (f: string, v: unknown) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-[#1C1917]">{label}</label>
      <select value={(value as string) ?? options[0]}
        onChange={(e) => onChange(field, e.target.value)}
        className="rounded-md border border-[#E7E5E0] px-2 py-1 text-xs outline-none focus:border-[#0D9488]">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
