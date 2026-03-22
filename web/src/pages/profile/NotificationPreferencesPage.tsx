import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Loader2, Save, AlertTriangle, Server, BarChart3, Shield } from "lucide-react";

import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface NotificationPrefs {
  incident_alerts: boolean;
  system_alerts: boolean;
  edge_agent_alerts: boolean;
  daily_summary: boolean;
  channel_preference: string;
}

const DEFAULT_PREFS: NotificationPrefs = {
  incident_alerts: true,
  system_alerts: true,
  edge_agent_alerts: false,
  daily_summary: false,
  channel_preference: "email",
};

interface ToggleRowProps {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ icon: Icon, iconColor, iconBg, label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-4 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon size={16} className={iconColor} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-[#0D9488]" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export default function NotificationPreferencesPage() {
  const { success, error: showError } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  const { data, isLoading } = useQuery({
    queryKey: ["notification-prefs"],
    queryFn: async () => {
      const res = await api.get("/mobile/profile/notification-prefs");
      return res.data as NotificationPrefs;
    },
  });

  useEffect(() => {
    if (data) {
      setPrefs({
        incident_alerts: data.incident_alerts ?? DEFAULT_PREFS.incident_alerts,
        system_alerts: data.system_alerts ?? DEFAULT_PREFS.system_alerts,
        edge_agent_alerts: data.edge_agent_alerts ?? DEFAULT_PREFS.edge_agent_alerts,
        daily_summary: data.daily_summary ?? DEFAULT_PREFS.daily_summary,
        channel_preference: data.channel_preference ?? DEFAULT_PREFS.channel_preference,
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.put("/mobile/profile/notification-prefs", prefs),
    onSuccess: () => {
      success("Notification preferences saved");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to save preferences");
    },
  });

  const updatePref = <K extends keyof NotificationPrefs>(
    key: K,
    value: NotificationPrefs[K],
  ) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="space-y-4">
          <div className="animate-pulse">
            <div className="mb-6 h-8 w-48 rounded bg-gray-200" />
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-gray-200" />
                      <div className="space-y-1">
                        <div className="h-4 w-28 rounded bg-gray-200" />
                        <div className="h-3 w-44 rounded bg-gray-200" />
                      </div>
                    </div>
                    <div className="h-6 w-11 rounded-full bg-gray-200" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
          <Bell size={20} className="text-[#0D9488]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Notification Preferences
          </h1>
          <p className="text-sm text-gray-500">
            Control which notifications you receive across all devices
          </p>
        </div>
      </div>

      {/* Alert Types */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Alert Types</h2>
        <p className="mb-4 text-xs text-gray-500">Choose which alerts you want to receive</p>

        <div>
          <ToggleRow
            icon={AlertTriangle}
            iconColor="text-red-600"
            iconBg="bg-red-50"
            label="Incident Alerts"
            description="Receive notifications for wet floor incidents"
            checked={prefs.incident_alerts}
            onChange={(v) => updatePref("incident_alerts", v)}
          />
          <ToggleRow
            icon={Shield}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
            label="System Alerts"
            description="Receive system health and status alerts"
            checked={prefs.system_alerts}
            onChange={(v) => updatePref("system_alerts", v)}
          />
          <ToggleRow
            icon={Server}
            iconColor="text-purple-600"
            iconBg="bg-purple-50"
            label="Edge Agent Alerts"
            description="Receive edge agent connection and status alerts"
            checked={prefs.edge_agent_alerts}
            onChange={(v) => updatePref("edge_agent_alerts", v)}
          />
          <ToggleRow
            icon={BarChart3}
            iconColor="text-[#0D9488]"
            iconBg="bg-teal-50"
            label="Daily Summary"
            description="Receive a daily summary of all detection activity"
            checked={prefs.daily_summary}
            onChange={(v) => updatePref("daily_summary", v)}
          />
        </div>
      </div>

      {/* Channel preference */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Delivery Channel</h2>
        <p className="mb-4 text-xs text-gray-500">Select how you would like to receive notifications</p>

        <div className="grid grid-cols-3 gap-3">
          {[
            { value: "email", label: "Email" },
            { value: "push", label: "Push" },
            { value: "both", label: "Both" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updatePref("channel_preference", opt.value)}
              className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                prefs.channel_preference === opt.value
                  ? "border-[#0D9488] bg-teal-50 text-[#0D9488] ring-2 ring-[#0D9488]/20"
                  : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0F766E] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Save Preferences
        </button>
      </div>
    </div>
  );
}
