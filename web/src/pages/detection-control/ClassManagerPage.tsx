import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";

import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

/* ── Types ── */

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
  low: "bg-[#DBEAFE] text-[#2563EB]",
  medium: "bg-[#FEF3C7] text-[#D97706]",
  high: "bg-[#FED7AA] text-[#EA580C]",
  critical: "bg-[#FEE2E2] text-[#DC2626]",
};

/* ── Component ── */

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
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Detection Class Manager</h1>
          <p className="text-sm text-[#78716C]">Configure detection classes, thresholds, and alert behavior</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]"
        >
          <Plus size={14} /> Add Class
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#0D9488]" />
        </div>
      ) : !classes || classes.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-[#E7E5E0] bg-white text-[#78716C]">
          <p className="text-sm">No detection classes configured yet.</p>
          <button onClick={openCreate} className="mt-2 text-sm text-[#0D9488] hover:underline">
            Add your first class
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#E7E5E0] bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                <th className="px-4 py-2.5 text-xs font-medium text-[#78716C]">Color</th>
                <th className="px-4 py-2.5 text-xs font-medium text-[#78716C]">Class Name</th>
                <th className="px-4 py-2.5 text-xs font-medium text-[#78716C]">Enabled</th>
                <th className="px-4 py-2.5 text-xs font-medium text-[#78716C]">Min Confidence</th>
                <th className="px-4 py-2.5 text-xs font-medium text-[#78716C]">Min Area %</th>
                <th className="px-4 py-2.5 text-xs font-medium text-[#78716C]">Severity</th>
                <th className="px-4 py-2.5 text-xs font-medium text-[#78716C]">Alert on Detect</th>
                <th className="px-4 py-2.5 text-xs font-medium text-[#78716C]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((cls) => (
                <tr key={cls.id} className="border-b border-[#E7E5E0] last:border-b-0 hover:bg-[#F8F7F4]">
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-block h-5 w-5 rounded-full border border-[#E7E5E0]"
                      style={{ backgroundColor: cls.color }}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div>
                      <span className="text-sm font-medium text-[#1C1917]">{cls.display_label || cls.name}</span>
                      {cls.display_label && cls.display_label !== cls.name && (
                        <span className="ml-2 text-[10px] text-[#78716C]">{cls.name}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => toggleMutation.mutate({ id: cls.id, enabled: !cls.enabled })}
                      className={`relative h-5 w-9 rounded-full transition-colors ${cls.enabled ? "bg-[#0D9488]" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${cls.enabled ? "translate-x-4" : ""}`} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-medium text-[#0D9488]">{(cls.min_confidence * 100).toFixed(0)}%</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-[#1C1917]">{cls.min_area_percent.toFixed(1)}%</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[cls.severity]}`}>
                      {cls.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => toggleAlertMutation.mutate({ id: cls.id, alert_on_detect: !cls.alert_on_detect })}
                      className={`relative h-5 w-9 rounded-full transition-colors ${cls.alert_on_detect ? "bg-[#0D9488]" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${cls.alert_on_detect ? "translate-x-4" : ""}`} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => openEdit(cls)}
                        className="rounded border border-[#E7E5E0] p-1.5 text-[#78716C] hover:bg-[#F1F0ED] hover:text-[#1C1917]"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(cls)}
                        className="rounded border border-[#E7E5E0] p-1.5 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add/Edit Drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="h-full w-[384px] overflow-y-auto bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
              <h2 className="text-lg font-semibold text-[#1C1917]">
                {editingId ? "Edit Class" : "Add Detection Class"}
              </h2>
              <button onClick={closeDrawer} className="text-[#78716C] hover:text-[#1C1917]">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Name</label>
                <input
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="e.g. wet_floor"
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                />
              </div>

              {/* Display Label */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Display Label</label>
                <input
                  value={formData.display_label}
                  onChange={(e) => updateField("display_label", e.target.value)}
                  placeholder="e.g. Wet Floor"
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                />
              </div>

              {/* Color */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => updateField("color", e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded border border-[#E7E5E0]"
                  />
                  <input
                    value={formData.color}
                    onChange={(e) => updateField("color", e.target.value)}
                    placeholder="#0D9488"
                    className="flex-1 rounded-md border border-[#E7E5E0] px-3 py-2 text-sm font-mono outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                  />
                </div>
              </div>

              {/* Min Confidence */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[#1C1917]">Min Confidence</label>
                  <span className="text-xs font-medium text-[#0D9488]">{(formData.min_confidence * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={formData.min_confidence}
                  onChange={(e) => updateField("min_confidence", parseFloat(e.target.value))}
                  className="mt-1 w-full"
                />
              </div>

              {/* Min Area Percent */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[#1C1917]">Min Area %</label>
                  <span className="text-xs font-medium text-[#0D9488]">{formData.min_area_percent.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={formData.min_area_percent}
                  onChange={(e) => updateField("min_area_percent", parseFloat(e.target.value))}
                  className="mt-1 w-full"
                />
              </div>

              {/* Severity */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Severity</label>
                <select
                  value={formData.severity}
                  onChange={(e) => updateField("severity", e.target.value as ClassFormData["severity"])}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Alert on Detect */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#1C1917]">Alert on Detect</label>
                <button
                  onClick={() => updateField("alert_on_detect", !formData.alert_on_detect)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${formData.alert_on_detect ? "bg-[#0D9488]" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${formData.alert_on_detect ? "translate-x-4" : ""}`} />
                </button>
              </div>

              {/* Enabled */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#1C1917]">Enabled</label>
                <button
                  onClick={() => updateField("enabled", !formData.enabled)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${formData.enabled ? "bg-[#0D9488]" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${formData.enabled ? "translate-x-4" : ""}`} />
                </button>
              </div>

              {/* Error */}
              {saveMutation.isError && (
                <div className="rounded-md bg-[#FEE2E2] px-3 py-2 text-sm text-[#DC2626]">
                  Failed to save class. Please try again.
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 border-t border-[#E7E5E0] pt-4">
                <button
                  onClick={closeDrawer}
                  className="rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || !formData.name.trim()}
                  className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
                >
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {editingId ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-lg bg-white p-5 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FEE2E2]">
                <AlertTriangle size={20} className="text-[#DC2626]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1C1917]">Delete Detection Class</h3>
                <p className="text-xs text-[#78716C]">This action cannot be undone.</p>
              </div>
            </div>
            <p className="mb-4 text-sm text-[#1C1917]">
              Are you sure you want to delete <strong>{deleteTarget.display_label || deleteTarget.name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 rounded-md bg-[#DC2626] px-4 py-2 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50"
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
