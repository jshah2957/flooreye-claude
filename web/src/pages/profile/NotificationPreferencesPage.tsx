import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Loader2, Save } from "lucide-react";

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
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[#E7E5E0] bg-white px-4 py-3">
      <div>
        <p className="text-sm font-medium text-[#1C1917]">{label}</p>
        <p className="text-xs text-[#78716C]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-[#0D9488]" : "bg-[#D6D3D1]"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
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
      <div className="flex h-40 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#0D9488]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Bell size={22} className="text-[#0D9488]" />
        <h1 className="text-xl font-semibold text-[#1C1917]">
          Notification Preferences
        </h1>
      </div>

      <p className="mb-4 text-sm text-[#78716C]">
        Control which notifications you receive. These preferences apply to your
        account across all devices.
      </p>

      <div className="space-y-3">
        <ToggleRow
          label="Incident Alerts"
          description="Receive notifications for wet floor incidents"
          checked={prefs.incident_alerts}
          onChange={(v) => updatePref("incident_alerts", v)}
        />
        <ToggleRow
          label="System Alerts"
          description="Receive system health alerts"
          checked={prefs.system_alerts}
          onChange={(v) => updatePref("system_alerts", v)}
        />
        <ToggleRow
          label="Edge Agent Alerts"
          description="Receive edge agent status alerts"
          checked={prefs.edge_agent_alerts}
          onChange={(v) => updatePref("edge_agent_alerts", v)}
        />
        <ToggleRow
          label="Daily Summary"
          description="Receive daily detection summary"
          checked={prefs.daily_summary}
          onChange={(v) => updatePref("daily_summary", v)}
        />
      </div>

      {/* Channel preference */}
      <div className="mt-6">
        <label className="mb-1 block text-sm font-medium text-[#1C1917]">
          Preferred Channel
        </label>
        <p className="mb-2 text-xs text-[#78716C]">
          Select how you would like to receive notifications.
        </p>
        <select
          value={prefs.channel_preference}
          onChange={(e) => updatePref("channel_preference", e.target.value)}
          className="w-full max-w-xs rounded-md border border-[#E7E5E0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
        >
          <option value="email">Email</option>
          <option value="push">Push</option>
          <option value="both">Both</option>
        </select>
      </div>

      {/* Save */}
      <div className="mt-8">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
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
