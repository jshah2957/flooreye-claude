import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, ArrowLeft, RotateCcw, Pencil, Trash2, Plus, Merge, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import {
  SETTINGS_RANGES, ARCHITECTURE_OPTIONS, IMAGE_SIZE_OPTIONS, AUGMENTATION_OPTIONS,
  STORAGE_WARN_PCT, STORAGE_DANGER_PCT, classColor,
} from "@/constants/learning";

interface LearningConfig {
  org_id: string;
  enabled: boolean;
  capture_edge_detections: boolean;
  capture_cloud_detections: boolean;
  capture_roboflow_datasets: boolean;
  capture_admin_feedback: boolean;
  capture_rate: number;
  capture_min_confidence: number;
  capture_max_daily: number;
  capture_wet_only: boolean;
  dedup_enabled: boolean;
  dedup_threshold: number;
  storage_quota_mb: number;
  retention_days: number;
  thumbnail_enabled: boolean;
  auto_cleanup_enabled: boolean;
  auto_train_enabled: boolean;
  auto_train_min_frames: number;
  auto_train_schedule: string;
  architecture: string;
  epochs: number;
  batch_size: number;
  image_size: number;
  augmentation_preset: string;
  split_ratio_train: number;
  split_ratio_val: number;
  split_ratio_test: number;
  pretrained_weights: string;
  min_map50_to_deploy: number;
  active_learning_enabled: boolean;
  uncertainty_threshold: number;
  diversity_weight: number;
  max_review_queue: number;
  [key: string]: unknown;
}

function Toggle({ value, onChange, label, description }: { value: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {description && <div className="text-xs text-gray-500">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-teal-600" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

function Slider({ value, onChange, label, min, max, step, description, suffix }: { value: number; onChange: (v: number) => void; label: string; min: number; max: number; step: number; description?: string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <span className="text-sm font-bold text-teal-700">{value}{suffix}</span>
      </div>
      {description && <div className="mt-0.5 text-xs text-gray-500">{description}</div>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-teal-600" />
    </div>
  );
}

function NumberInput({ value, onChange, label, min, max, description }: { value: number; onChange: (v: number) => void; label: string; min: number; max: number; description?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {description && <div className="text-xs text-gray-500">{description}</div>}
      </div>
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm focus:border-teal-500 focus:outline-none" />
    </div>
  );
}

function SelectInput({ value, onChange, label, options, description }: { value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[]; description?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {description && <div className="text-xs text-gray-500">{description}</div>}
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

interface ClassInfo {
  class_name: string;
  frame_count: number;
  annotation_count: number;
}

function ClassManagement() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [newClassName, setNewClassName] = useState("");
  const [editingClass, setEditingClass] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");

  const { data: classes, isLoading } = useQuery({
    queryKey: ["learning-classes"],
    queryFn: async () => {
      const res = await api.get("/learning/classes");
      return res.data.data as ClassInfo[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => { await api.post("/learning/classes", { name }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["learning-classes"] }); success("Class created"); setNewClassName(""); },
    onError: (e: any) => showError(e?.response?.data?.detail || "Create failed"),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      await api.put(`/learning/classes/${encodeURIComponent(oldName)}/rename`, { new_name: newName });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["learning-classes"] }); success("Class renamed"); setEditingClass(null); },
    onError: (e: any) => showError(e?.response?.data?.detail || "Rename failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => { await api.delete(`/learning/classes/${encodeURIComponent(name)}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["learning-classes"] }); success("Class deleted"); },
    onError: (e: any) => showError(e?.response?.data?.detail || "Delete failed"),
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ source, target }: { source: string; target: string }) => {
      await api.post("/learning/classes/merge", { source, target });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["learning-classes"] }); success("Classes merged"); setMergeSource(null); setMergeTarget(""); },
    onError: (e: any) => showError(e?.response?.data?.detail || "Merge failed"),
  });

  const startEdit = (name: string) => {
    setEditingClass(name);
    setEditValue(name);
  };

  const confirmEdit = () => {
    if (!editingClass || !editValue.trim() || editValue === editingClass) { setEditingClass(null); return; }
    renameMutation.mutate({ oldName: editingClass, newName: editValue.trim() });
  };

  return (
    <div>
      {/* Create New Class */}
      <div className="mb-3 flex gap-2">
        <input
          type="text"
          value={newClassName}
          onChange={(e) => setNewClassName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newClassName.trim()) createMutation.mutate(newClassName.trim()); }}
          placeholder="New class name..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
        <button
          onClick={() => { if (newClassName.trim()) createMutation.mutate(newClassName.trim()); }}
          disabled={!newClassName.trim() || createMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {/* Class Table */}
      {isLoading ? (
        <div className="flex h-20 items-center justify-center"><Loader2 size={18} className="animate-spin text-teal-600" /></div>
      ) : !classes || classes.length === 0 ? (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No classes found. Classes appear when frames have annotations.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2">Class</th>
                <th className="px-4 py-2 text-right">Frames</th>
                <th className="px-4 py-2 text-right">Annotations</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {classes.map((cls) => (
                <tr key={cls.class_name} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: classColor(cls.class_name) }} />
                      {editingClass === cls.class_name ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") setEditingClass(null); }}
                            autoFocus
                            className="w-32 rounded border border-teal-400 px-1.5 py-0.5 text-sm focus:outline-none"
                          />
                          <button onClick={confirmEdit} className="text-teal-600 hover:text-teal-800"><Check size={14} /></button>
                          <button onClick={() => setEditingClass(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(cls.class_name)} className="text-gray-900 hover:text-teal-700 hover:underline" title="Click to rename">
                          {cls.class_name}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">{cls.frame_count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{cls.annotation_count.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(cls.class_name)} title="Rename" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-teal-600">
                        <Pencil size={14} />
                      </button>
                      {mergeSource === cls.class_name ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={mergeTarget}
                            onChange={(e) => setMergeTarget(e.target.value)}
                            className="rounded border border-gray-300 px-1 py-0.5 text-xs focus:border-teal-500 focus:outline-none"
                          >
                            <option value="">Merge into...</option>
                            {classes.filter((c) => c.class_name !== cls.class_name).map((c) => (
                              <option key={c.class_name} value={c.class_name}>{c.class_name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => { if (mergeTarget) mergeMutation.mutate({ source: cls.class_name, target: mergeTarget }); }}
                            disabled={!mergeTarget || mergeMutation.isPending}
                            className="text-teal-600 hover:text-teal-800 disabled:opacity-40"
                          ><Check size={14} /></button>
                          <button onClick={() => { setMergeSource(null); setMergeTarget(""); }} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                        </div>
                      ) : (
                        <button onClick={() => { setMergeSource(cls.class_name); setMergeTarget(""); }} title="Merge into another class" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-amber-600">
                          <Merge size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm(`Delete class "${cls.class_name}"? This removes all its annotations from all frames.`)) deleteMutation.mutate(cls.class_name); }}
                        title="Delete"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function LearningSettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [config, setConfig] = useState<LearningConfig | null>(null);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["learning-settings"],
    queryFn: async () => { const res = await api.get("/learning/settings"); return res.data.data as LearningConfig; },
  });

  const { data: statsData } = useQuery({
    queryKey: ["learning-stats-for-settings"],
    queryFn: async () => { const res = await api.get("/learning/stats"); return res.data.data as { storage_usage_mb: number; storage_quota_mb: number; total_frames: number }; },
  });

  useEffect(() => { if (data) setConfig({ ...data }); }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => { if (!config) return; await api.put("/learning/settings", config); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["learning-settings"] }); queryClient.invalidateQueries({ queryKey: ["learning-stats"] }); success("Settings saved"); setDirty(false); },
    onError: (e: any) => showError(e?.response?.data?.detail || "Save failed"),
  });

  const resetMutation = useMutation({
    mutationFn: async () => { await api.post("/learning/settings/reset"); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learning-settings"] });
      queryClient.invalidateQueries({ queryKey: ["learning-stats"] });
      queryClient.invalidateQueries({ queryKey: ["learning-stats-for-settings"] });
      success("Settings reset to defaults");
      setDirty(false);
    },
    onError: () => showError("Reset failed"),
  });

  const set = <K extends keyof LearningConfig>(key: K, val: LearningConfig[K]) => {
    if (!config) return;
    setConfig({ ...config, [key]: val });
    setDirty(true);
  };

  if (isLoading || !config) return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-teal-600" /></div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/learning")} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><ArrowLeft size={18} /></button>
          <h1 className="text-2xl font-bold text-gray-900">Learning Settings</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { if (confirm("Reset all settings to defaults?")) resetMutation.mutate(); }}
            disabled={resetMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            <RotateCcw size={14} /> {resetMutation.isPending ? "Resetting..." : "Reset"}
          </button>
          <button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40">
            <Save size={14} /> {saveMutation.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Class Management */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Class Management</h2>
          <ClassManagement />
        </section>

        {/* Master Switch */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">System</h2>
          <Toggle value={config.enabled} onChange={(v) => set("enabled", v)} label="Learning System Enabled" description="Master switch — disabling stops all data capture" />
        </section>

        {/* Data Capture */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Data Capture</h2>
          <div className="space-y-2">
            <Toggle value={config.capture_edge_detections} onChange={(v) => set("capture_edge_detections", v)} label="Capture Edge Detections" description="Copy frames from edge detection pipeline" />
            <Toggle value={config.capture_cloud_detections} onChange={(v) => set("capture_cloud_detections", v)} label="Capture Cloud Detections" description="Copy frames from cloud (test inference)" />
            <Toggle value={config.capture_roboflow_datasets} onChange={(v) => set("capture_roboflow_datasets", v)} label="Capture Roboflow Datasets" description="Download training data when model deployed" />
            <Toggle value={config.capture_admin_feedback} onChange={(v) => set("capture_admin_feedback", v)} label="Capture Admin Feedback" description="Record true/false positive from incident review" />
            <Toggle value={config.capture_wet_only} onChange={(v) => set("capture_wet_only", v)} label="Wet Detections Only" description="Skip dry/normal detections" />
            <Toggle value={config.dedup_enabled} onChange={(v) => set("dedup_enabled", v)} label="Deduplication" description="Skip near-duplicate frames" />
            <Slider value={config.capture_rate} onChange={(v) => set("capture_rate", v)} label="Capture Rate" min={SETTINGS_RANGES.capture_rate.min} max={SETTINGS_RANGES.capture_rate.max} step={SETTINGS_RANGES.capture_rate.step} description="Percentage of detections to capture" suffix="" />
            <Slider value={config.capture_min_confidence} onChange={(v) => set("capture_min_confidence", v)} label="Min Confidence" min={SETTINGS_RANGES.capture_min_confidence.min} max={SETTINGS_RANGES.capture_min_confidence.max} step={SETTINGS_RANGES.capture_min_confidence.step} description="Only capture above this confidence" />
            <NumberInput value={config.capture_max_daily} onChange={(v) => set("capture_max_daily", v)} label="Max Daily Captures" min={SETTINGS_RANGES.capture_max_daily.min} max={SETTINGS_RANGES.capture_max_daily.max} description="Per org per day" />
          </div>
        </section>

        {/* Storage */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Storage</h2>
          {statsData && (
            <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Current Usage</span>
                <span className="font-medium text-gray-900">
                  {statsData.storage_usage_mb >= 1000
                    ? `${(statsData.storage_usage_mb / 1000).toFixed(1)} GB`
                    : `${statsData.storage_usage_mb.toFixed(0)} MB`}
                  {" / "}
                  {statsData.storage_quota_mb >= 1000
                    ? `${(statsData.storage_quota_mb / 1000).toFixed(0)} GB`
                    : `${statsData.storage_quota_mb} MB`}
                  {` (${statsData.storage_quota_mb > 0 ? ((statsData.storage_usage_mb / statsData.storage_quota_mb) * 100).toFixed(1) : "0"}%)`}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-gray-200">
                <div
                  className={`h-2 rounded-full transition-all ${
                    (statsData.storage_usage_mb / statsData.storage_quota_mb) * 100 > STORAGE_DANGER_PCT ? "bg-red-500" :
                    (statsData.storage_usage_mb / statsData.storage_quota_mb) * 100 > STORAGE_WARN_PCT ? "bg-amber-500" : "bg-teal-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(1, (statsData.storage_usage_mb / statsData.storage_quota_mb) * 100))}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-gray-400">{statsData.total_frames.toLocaleString()} frames stored</div>
            </div>
          )}
          <div className="space-y-2">
            <NumberInput value={config.storage_quota_mb} onChange={(v) => set("storage_quota_mb", v)} label="Storage Quota (MB)" min={SETTINGS_RANGES.storage_quota_mb.min} max={SETTINGS_RANGES.storage_quota_mb.max} description="Max storage per org" />
            <NumberInput value={config.retention_days} onChange={(v) => set("retention_days", v)} label="Retention (days)" min={SETTINGS_RANGES.retention_days.min} max={SETTINGS_RANGES.retention_days.max} description="Auto-delete frames older than this" />
            <Toggle value={config.thumbnail_enabled} onChange={(v) => set("thumbnail_enabled", v)} label="Generate Thumbnails" description="280x175 thumbnails for browsing" />
            <Toggle value={config.auto_cleanup_enabled} onChange={(v) => set("auto_cleanup_enabled", v)} label="Auto Cleanup" description="Delete oldest frames when quota exceeded" />
          </div>
        </section>

        {/* Training */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Training</h2>
          <div className="space-y-2">
            <Toggle value={config.auto_train_enabled} onChange={(v) => set("auto_train_enabled", v)} label="Auto Training" description="Automatically train when dataset reaches threshold" />
            <NumberInput value={config.auto_train_min_frames} onChange={(v) => set("auto_train_min_frames", v)} label="Min Frames to Train" min={SETTINGS_RANGES.auto_train_min_frames.min} max={SETTINGS_RANGES.auto_train_min_frames.max} />
            <SelectInput value={config.auto_train_schedule} onChange={(v) => set("auto_train_schedule", v)} label="Training Schedule" options={[
              { value: "manual", label: "Manual Only" },
              { value: "daily", label: "Daily Check" },
              { value: "weekly", label: "Weekly Check" },
            ]} />
            <SelectInput value={config.architecture} onChange={(v) => set("architecture", v)} label="Model Architecture" options={ARCHITECTURE_OPTIONS} />
            <NumberInput value={config.epochs} onChange={(v) => set("epochs", v)} label="Training Epochs" min={SETTINGS_RANGES.epochs.min} max={SETTINGS_RANGES.epochs.max} />
            <NumberInput value={config.batch_size} onChange={(v) => set("batch_size", v)} label="Batch Size" min={SETTINGS_RANGES.batch_size.min} max={SETTINGS_RANGES.batch_size.max} />
            <SelectInput value={String(config.image_size)} onChange={(v) => set("image_size", Number(v))} label="Image Size" options={IMAGE_SIZE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} />
            <SelectInput value={config.augmentation_preset} onChange={(v) => set("augmentation_preset", v)} label="Augmentation" options={AUGMENTATION_OPTIONS} />
            <Slider value={config.min_map50_to_deploy} onChange={(v) => set("min_map50_to_deploy", v)} label="Min mAP@50 to Deploy" min={SETTINGS_RANGES.min_map50_to_deploy.min} max={SETTINGS_RANGES.min_map50_to_deploy.max} step={SETTINGS_RANGES.min_map50_to_deploy.step} description="Model must exceed this score" />
          </div>
        </section>

        {/* Active Learning */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Active Learning</h2>
          <div className="space-y-2">
            <Toggle value={config.active_learning_enabled} onChange={(v) => set("active_learning_enabled", v)} label="Active Learning" description="Score detections for training value" />
            <Slider value={config.uncertainty_threshold} onChange={(v) => set("uncertainty_threshold", v)} label="Uncertainty Threshold" min={SETTINGS_RANGES.uncertainty_threshold.min} max={SETTINGS_RANGES.uncertainty_threshold.max} step={SETTINGS_RANGES.uncertainty_threshold.step} description="Below this = high value for training" />
            <Slider value={config.diversity_weight} onChange={(v) => set("diversity_weight", v)} label="Diversity Weight" min={SETTINGS_RANGES.diversity_weight.min} max={SETTINGS_RANGES.diversity_weight.max} step={SETTINGS_RANGES.diversity_weight.step} description="Prefer diverse frames over similar ones" />
            <NumberInput value={config.max_review_queue} onChange={(v) => set("max_review_queue", v)} label="Max Review Queue" min={SETTINGS_RANGES.max_review_queue.min} max={SETTINGS_RANGES.max_review_queue.max} />
          </div>
        </section>

        {/* Dataset Splits */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Dataset Splits</h2>
          <div className="space-y-2">
            <Slider value={config.split_ratio_train} onChange={(v) => set("split_ratio_train", v)} label="Training Split" min={SETTINGS_RANGES.split_ratio_train.min} max={SETTINGS_RANGES.split_ratio_train.max} step={SETTINGS_RANGES.split_ratio_train.step} suffix="" />
            <Slider value={config.split_ratio_val} onChange={(v) => set("split_ratio_val", v)} label="Validation Split" min={SETTINGS_RANGES.split_ratio_val.min} max={SETTINGS_RANGES.split_ratio_val.max} step={SETTINGS_RANGES.split_ratio_val.step} suffix="" />
            <Slider value={config.split_ratio_test} onChange={(v) => set("split_ratio_test", v)} label="Test Split" min={SETTINGS_RANGES.split_ratio_test.min} max={SETTINGS_RANGES.split_ratio_test.max} step={SETTINGS_RANGES.split_ratio_test.step} suffix="" />
            {(() => {
              const total = config.split_ratio_train + config.split_ratio_val + config.split_ratio_test;
              const isValid = total >= SETTINGS_RANGES.split_tolerance_low && total <= SETTINGS_RANGES.split_tolerance_high;
              return (
                <div className={`rounded-lg px-3 py-2 text-xs font-medium ${isValid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  Total: {(total * 100).toFixed(0)}% {isValid ? "(valid)" : `— must be 95-105%`}
                </div>
              );
            })()}
          </div>
        </section>
      </div>
    </div>
  );
}
