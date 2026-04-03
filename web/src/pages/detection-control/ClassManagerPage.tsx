import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  Tag,
} from "lucide-react";

import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import HelpSection from "@/components/ui/HelpSection";
import { PAGE_HELP } from "@/constants/help";

/* -- Types -- */

interface DetectionClass {
  id: string;
  name: string;
  display_label: string;
  color: string;
  enabled: boolean;
  min_confidence: number;
  min_area_percent: number;
  severity: "low" | "medium" | "high" | "critical";
  alert_on_detect: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ClassFormData {
  name: string;
  display_label: string;
  color: string;
  min_confidence: number;
  min_area_percent: number;
  severity: "low" | "medium" | "high" | "critical";
  alert_on_detect: boolean;
  enabled: boolean;
}

const EMPTY_FORM: ClassFormData = {
  name: "",
  display_label: "",
  color: "#0D9488",
  min_confidence: 0.5,
  min_area_percent: 0,
  severity: "medium",
  alert_on_detect: false,
  enabled: true,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-50 text-blue-600",
  medium: "bg-amber-50 text-amber-600",
  high: "bg-orange-50 text-orange-600",
  critical: "bg-red-50 text-red-600",
};

/* -- Component -- */

export default function ClassManagerPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ClassFormData>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<DetectionClass | null>(null);

  // Load classes
  const { data: classes, isLoading } = useQuery({
    queryKey: ["detection-classes"],
    queryFn: async () => {
      const res = await api.get("/detection-control/classes");
      return res.data.data as DetectionClass[];
    },
  });

  // Create / Update
  const saveMutation = useMutation({
    mutationFn: async (data: ClassFormData) => {
      if (editingId) {
        return api.put(`/detection-control/classes/${editingId}`, data);
      }
      return api.post("/detection-control/classes", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detection-classes"] });
      closeDrawer();
      success(editingId ? "Class updated" : "Class created");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to save class");
    },
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!id) throw new Error("Class has no ID");
      return api.delete(`/detection-control/classes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detection-classes"] });
      setDeleteTarget(null);
      success("Class deleted");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to delete class");
    },
  });

  // Toggle enabled
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      return api.put(`/detection-control/classes/${id}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detection-classes"] });
      success("Class toggled");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to toggle class");
    },
  });

  // Toggle alert_on_detect
  const toggleAlertMutation = useMutation({
    mutationFn: async ({ id, alert_on_detect }: { id: string; alert_on_detect: boolean }) => {
      return api.put(`/detection-control/classes/${id}`, { alert_on_detect });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detection-classes"] });
      success("Alert setting updated");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to update alert setting");
    },
  });

  function openCreate() {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setDrawerOpen(true);
  }

  function openEdit(cls: DetectionClass) {
    setEditingId(cls.id);
    setFormData({
      name: cls.name,
      display_label: cls.display_label,
      color: cls.color,
      min_confidence: cls.min_confidence,
      min_area_percent: cls.min_area_percent,
      severity: cls.severity,
      alert_on_detect: cls.alert_on_detect,
      enabled: cls.enabled,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  }

  function updateField<K extends keyof ClassFormData>(key: K, value: ClassFormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    saveMutation.mutate(formData);
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Class Manager</h1>
          <p className="mt-1 text-sm text-gray-500">Configure detection classes, thresholds, and alert behavior</p>
        <HelpSection title={PAGE_HELP.classManager.title}>
          {PAGE_HELP.classManager.content.map((line, i) => <p key={i}>{line}</p>)}
        </HelpSection>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0F766E]"
        >
          <Plus size={16} /> Add Class
        </button>
      </div>

      {isLoading ? (
        /* Loading skeleton */
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-gray-50 px-5 py-4">
              <div className="h-6 w-6 animate-pulse rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
              </div>
              <div className="h-4 w-12 animate-pulse rounded bg-gray-100" />
              <div className="h-5 w-9 animate-pulse rounded-full bg-gray-200" />
              <div className="h-6 w-16 animate-pulse rounded-full bg-gray-100" />
              <div className="flex gap-2">
                <div className="h-8 w-8 animate-pulse rounded-lg bg-gray-100" />
                <div className="h-8 w-8 animate-pulse rounded-lg bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : !classes || classes.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <Tag size={24} className="text-gray-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">No detection classes configured</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by adding your first detection class.</p>
          <button
            onClick={openCreate}
            className="mt-4 text-sm font-medium text-[#0D9488] hover:text-[#0F766E] hover:underline"
          >
            Add your first class
          </button>
        </div>
      ) : (
        /* Class list */
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {classes.map((cls, idx) => (
            <div
              key={cls.id}
              className={`flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50 ${
                idx < classes.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              {/* Color dot */}
              <span
                className="h-6 w-6 shrink-0 rounded-full border-2 border-white shadow"
                style={{ backgroundColor: cls.color }}
              />

              {/* Name + label */}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900">{cls.display_label || cls.name}</div>
                {cls.display_label && cls.display_label !== cls.name && (
                  <div className="text-[10px] text-gray-400 font-mono">{cls.name}</div>
                )}
              </div>

              {/* Confidence */}
              <div className="text-center">
                <div className="text-xs font-bold text-[#0D9488]">{(cls.min_confidence * 100).toFixed(0)}%</div>
                <div className="text-[10px] text-gray-400">confidence</div>
              </div>

              {/* Enabled toggle */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  onClick={() => toggleMutation.mutate({ id: cls.id, enabled: !cls.enabled })}
                  className={`relative h-5 w-9 rounded-full transition-colors ${cls.enabled ? "bg-[#0D9488]" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${cls.enabled ? "translate-x-4" : ""}`} />
                </button>
                <span className="text-[9px] text-gray-400">enabled</span>
              </div>

              {/* Severity badge */}
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${SEVERITY_COLORS[cls.severity]}`}>
                {cls.severity}
              </span>

              {/* Alert toggle */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  onClick={() => toggleAlertMutation.mutate({ id: cls.id, alert_on_detect: !cls.alert_on_detect })}
                  className={`relative h-5 w-9 rounded-full transition-colors ${cls.alert_on_detect ? "bg-[#0D9488]" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${cls.alert_on_detect ? "translate-x-4" : ""}`} />
                </button>
                <span className="text-[9px] text-gray-400">alert</span>
              </div>

              {/* Actions */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => openEdit(cls)}
                  className="rounded-lg border border-gray-200 p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => {
                    if (!cls.id) {
                      showError("Cannot delete: class has no identifier");
                      return;
                    }
                    setDeleteTarget(cls);
                  }}
                  disabled={!cls.id}
                  className="rounded-lg border border-gray-200 p-2 text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={closeDrawer}>
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Edit Class" : "Add Detection Class"}
              </h2>
              <button onClick={closeDrawer} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-900">Name</label>
                <input
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="e.g. wet_floor"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                />
              </div>

              {/* Display Label */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-900">Display Label</label>
                <input
                  value={formData.display_label}
                  onChange={(e) => updateField("display_label", e.target.value)}
                  placeholder="e.g. Wet Floor"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                />
              </div>

              {/* Color */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-900">Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => updateField("color", e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded-lg border border-gray-200"
                  />
                  <input
                    value={formData.color}
                    onChange={(e) => updateField("color", e.target.value)}
                    placeholder="#0D9488"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-mono text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                  />
                </div>
              </div>

              {/* Min Confidence */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-gray-900">Min Confidence</label>
                  <span className="text-xs font-bold text-[#0D9488]">{(formData.min_confidence * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={formData.min_confidence}
                  onChange={(e) => updateField("min_confidence", parseFloat(e.target.value))}
                  className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-[#0D9488]"
                />
              </div>

              {/* Min Area Percent */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-gray-900">Min Area %</label>
                  <span className="text-xs font-bold text-[#0D9488]">{formData.min_area_percent.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={formData.min_area_percent}
                  onChange={(e) => updateField("min_area_percent", parseFloat(e.target.value))}
                  className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-[#0D9488]"
                />
              </div>

              {/* Severity */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-900">Severity</label>
                <select
                  value={formData.severity}
                  onChange={(e) => updateField("severity", e.target.value as ClassFormData["severity"])}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Alert on Detect */}
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                <label className="text-sm font-semibold text-gray-900">Alert on Detect</label>
                <button
                  onClick={() => updateField("alert_on_detect", !formData.alert_on_detect)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${formData.alert_on_detect ? "bg-[#0D9488]" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${formData.alert_on_detect ? "translate-x-5" : ""}`} />
                </button>
              </div>

              {/* Enabled */}
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                <label className="text-sm font-semibold text-gray-900">Enabled</label>
                <button
                  onClick={() => updateField("enabled", !formData.enabled)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${formData.enabled ? "bg-[#0D9488]" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${formData.enabled ? "translate-x-5" : ""}`} />
                </button>
              </div>

              {/* Error */}
              {saveMutation.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Failed to save class. Please try again.
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
                <button
                  onClick={closeDrawer}
                  className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || !formData.name.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0F766E] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {editingId ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Delete Detection Class</h3>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="mb-5 text-sm text-gray-700">
              Are you sure you want to delete <strong>{deleteTarget.display_label || deleteTarget.name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
