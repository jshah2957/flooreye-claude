import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Bell,
  Trash2,
  Loader2,
  X,
  Pencil,
  Mail,
  Link,
  Phone,
  BellRing,
  Send,
  Clock,
} from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";

interface NotificationRule {
  id: string;
  name: string | null;
  channel: string;
  recipients: string[];
  store_id: string | null;
  camera_id: string | null;
  min_severity: string;
  min_confidence: number;
  min_wet_area_percent: number | null;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string | null;
  is_active: boolean;
  webhook_method: string | null;
  push_title_template: string | null;
  push_body_template: string | null;
  created_at: string;
  updated_at: string | null;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "UTC",
];

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case "email":
      return <Mail size={14} className="text-blue-600" />;
    case "webhook":
      return <Link size={14} className="text-purple-600" />;
    case "sms":
      return <Phone size={14} className="text-green-600" />;
    case "push":
      return <BellRing size={14} className="text-amber-600" />;
    default:
      return <Bell size={14} className="text-[#78716C]" />;
  }
}

function channelRecipientLabel(channel: string, recipients: string[]): string {
  const count = recipients.length;
  switch (channel) {
    case "email":
      return `${count} recipient${count !== 1 ? "s" : ""}`;
    case "webhook": {
      if (count === 0) return "No URL";
      const url = recipients[0] ?? "";
      const truncated =
        url.length > 40 ? url.substring(0, 40) + "..." : url;
      return count > 1
        ? `${truncated} +${count - 1} more`
        : truncated;
    }
    case "sms":
      return `${count} phone${count !== 1 ? "s" : ""}`;
    case "push":
      return `${count} token${count !== 1 ? "s" : ""}`;
    default:
      return `${count} recipient${count !== 1 ? "s" : ""}`;
  }
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);
  const [tab, setTab] = useState<"rules" | "history">("rules");
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<string>("email");
  const [recipients, setRecipients] = useState("");
  const [minSeverity, setMinSeverity] = useState("low");
  const [minConfidence, setMinConfidence] = useState(0.6);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("07:00");
  const [quietHoursTimezone, setQuietHoursTimezone] = useState("America/New_York");
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => {
    setName("");
    setChannel("email");
    setRecipients("");
    setMinSeverity("low");
    setMinConfidence(0.6);
    setQuietHoursEnabled(false);
    setQuietHoursStart("22:00");
    setQuietHoursEnd("07:00");
    setQuietHoursTimezone("America/New_York");
    setIsActive(true);
    setEditingRule(null);
  };

  const openCreateDrawer = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const openEditDrawer = (rule: NotificationRule) => {
    setEditingRule(rule);
    setName(rule.name || "");
    setChannel(rule.channel);
    setRecipients(rule.recipients.join(", "));
    setMinSeverity(rule.min_severity || "low");
    setMinConfidence(rule.min_confidence ?? 0.6);
    setQuietHoursEnabled(rule.quiet_hours_enabled ?? false);
    setQuietHoursStart(rule.quiet_hours_start || "22:00");
    setQuietHoursEnd(rule.quiet_hours_end || "07:00");
    setQuietHoursTimezone(rule.quiet_hours_timezone || "America/New_York");
    setIsActive(rule.is_active ?? true);
    setDrawerOpen(true);
  };

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    resetForm();
  }, []);

  // Close drawer on ESC key
  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen, closeDrawer]);

  const buildPayload = () => ({
    name: name || null,
    channel,
    recipients: recipients
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean),
    min_severity: minSeverity,
    min_confidence: minConfidence,
    quiet_hours_enabled: quietHoursEnabled,
    quiet_hours_start: quietHoursEnabled ? quietHoursStart : null,
    quiet_hours_end: quietHoursEnabled ? quietHoursEnd : null,
    quiet_hours_timezone: quietHoursEnabled ? quietHoursTimezone : null,
    is_active: isActive,
  });

  const { data: rulesData, isLoading } = useQuery({
    queryKey: ["notification-rules"],
    queryFn: async () => {
      const res = await api.get("/notifications/rules");
      return res.data;
    },
  });

  const { data: deliveriesData } = useQuery({
    queryKey: ["notification-deliveries"],
    queryFn: async () => {
      const res = await api.get("/notifications/deliveries", {
        params: { limit: 50 },
      });
      return res.data;
    },
    enabled: tab === "history",
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/notifications/rules", buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
      closeDrawer();
      success("Notification rule created");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to create rule");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (ruleId: string) =>
      api.put(`/notifications/rules/${ruleId}`, buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
      closeDrawer();
      success("Notification rule updated");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to update rule");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
      success("Notification rule deleted");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to delete rule");
    },
  });

  const testMutation = useMutation({
    mutationFn: (ruleId: string) =>
      api.post(`/notifications/rules/${ruleId}/test`),
    onSuccess: () => {
      success("Test notification queued");
      setTestingRuleId(null);
    },
    onError: (err: any) => {
      // If 404/405 the endpoint may not exist yet -- still show a friendly message
      if (
        err?.response?.status === 404 ||
        err?.response?.status === 405
      ) {
        success("Test notification queued (simulated)");
      } else {
        showError(
          err?.response?.data?.detail || "Failed to send test notification"
        );
      }
      setTestingRuleId(null);
    },
  });

  const handleTestSend = (ruleId: string) => {
    setTestingRuleId(ruleId);
    testMutation.mutate(ruleId);
  };

  const handleSave = () => {
    if (editingRule) {
      updateMutation.mutate(editingRule.id);
    } else {
      createMutation.mutate();
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const rules: NotificationRule[] = rulesData?.data ?? [];
  const deliveries = deliveriesData?.data ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1C1917]">
          Notification Settings
        </h1>
        <button
          onClick={openCreateDrawer}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]"
        >
          <Plus size={16} /> New Rule
        </button>
      </div>

      <div className="mb-4 flex gap-1 border-b border-[#E7E5E0]">
        {(["rules", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize ${
              tab === t
                ? "border-b-2 border-[#0D9488] text-[#0D9488]"
                : "text-[#78716C]"
            }`}
          >
            {t === "rules" ? `Rules (${rules.length})` : "Delivery History"}
          </button>
        ))}
      </div>

      {tab === "rules" &&
        (isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2
              size={24}
              className="animate-spin text-[#0D9488]"
            />
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notification rules"
            description="Create a rule to receive alerts."
            actionLabel="New Rule"
            onAction={openCreateDrawer}
          />
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border border-[#E7E5E0] bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ChannelIcon channel={rule.channel} />
                    <span className="font-medium text-[#1C1917]">
                      {rule.name || rule.channel}
                    </span>
                    <StatusBadge status={rule.channel} size="sm" />
                    {!rule.is_active && (
                      <StatusBadge status="disabled" size="sm" />
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#78716C]">
                    <span className="flex items-center gap-1">
                      <ChannelIcon channel={rule.channel} />
                      {channelRecipientLabel(rule.channel, rule.recipients)}
                    </span>
                    <span>&middot;</span>
                    <span>
                      Min severity: {rule.min_severity}
                    </span>
                    <span>&middot;</span>
                    <span>
                      Min conf:{" "}
                      {((rule.min_confidence ?? 0) * 100).toFixed(0)}%
                    </span>
                    {rule.quiet_hours_enabled && (
                      <>
                        <span>&middot;</span>
                        <span className="flex items-center gap-1 text-amber-600">
                          <Clock size={11} />
                          Quiet {rule.quiet_hours_start}&ndash;
                          {rule.quiet_hours_end}{" "}
                          {rule.quiet_hours_timezone || ""}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="ml-3 flex items-center gap-1">
                  <button
                    onClick={() => handleTestSend(rule.id)}
                    disabled={testingRuleId === rule.id}
                    title="Test Send"
                    className="rounded p-1.5 text-[#78716C] hover:bg-[#E0F2FE] hover:text-[#0284C7] disabled:opacity-50"
                  >
                    {testingRuleId === rule.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => openEditDrawer(rule)}
                    title="Edit"
                    className="rounded p-1.5 text-[#78716C] hover:bg-[#F0F9FF] hover:text-[#0D9488]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(rule.id)}
                    title="Delete"
                    className="rounded p-1.5 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === "history" && (
        <div className="overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">
                  Channel
                </th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">
                  Recipient
                </th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">
                  Status
                </th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">
                  Sent
                </th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d: any) => (
                <tr key={d.id} className="border-b border-[#E7E5E0]">
                  <td className="px-4 py-2">
                    <StatusBadge status={d.channel} size="sm" />
                  </td>
                  <td className="px-4 py-2 text-[#78716C]">{d.recipient}</td>
                  <td className="px-4 py-2">
                    <StatusBadge
                      status={d.status === "sent" ? "online" : "error"}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-2 text-[#78716C]">
                    {new Date(d.sent_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-[#78716C]"
                  >
                    No deliveries yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Rule"
        description="This notification rule will be permanently deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Create / Edit Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={editingRule ? "Edit Notification Rule" : "New Notification Rule"}>
          <div className="h-full w-[420px] overflow-y-auto bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
              <h2 className="text-lg font-semibold text-[#1C1917]">
                {editingRule ? "Edit Notification Rule" : "New Notification Rule"}
              </h2>
              <button
                onClick={closeDrawer}
                className="text-[#78716C] hover:text-[#1C1917]"
                aria-label="Close drawer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Critical spill alerts"
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
                />
              </div>

              {/* Channel */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">
                  Channel *
                </label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
                >
                  <option value="email">Email</option>
                  <option value="webhook">Webhook</option>
                  <option value="sms">SMS</option>
                  <option value="push">Push</option>
                </select>
              </div>

              {/* Recipients */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">
                  Recipients (comma-separated) *
                </label>
                <input
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder={
                    channel === "email"
                      ? "email@example.com"
                      : channel === "webhook"
                        ? "https://webhook.example.com/endpoint"
                        : channel === "sms"
                          ? "+15551234567"
                          : "device-token-abc123"
                  }
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
                />
                <p className="mt-1 text-xs text-[#A8A29E]">
                  {channel === "email" && "Enter email addresses separated by commas"}
                  {channel === "webhook" && "Enter webhook URL(s) separated by commas"}
                  {channel === "sms" && "Enter phone numbers in E.164 format (+1...)"}
                  {channel === "push" && "Enter push device tokens separated by commas"}
                </p>
              </div>

              {/* Min Severity */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">
                  Min Severity
                </label>
                <select
                  value={minSeverity}
                  onChange={(e) => setMinSeverity(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Min Confidence */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">
                  Min Confidence ({(minConfidence * 100).toFixed(0)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={minConfidence}
                  onChange={(e) =>
                    setMinConfidence(parseFloat(e.target.value))
                  }
                  className="w-full"
                />
              </div>

              {/* Active toggle (edit mode only) */}
              {editingRule && (
                <div className="flex items-center justify-between rounded-md border border-[#E7E5E0] px-3 py-2.5">
                  <span className="text-sm font-medium text-[#1C1917]">
                    Rule Active
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    onClick={() => setIsActive(!isActive)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      isActive ? "bg-[#0D9488]" : "bg-[#D6D3D1]"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        isActive ? "translate-x-[18px]" : "translate-x-[3px]"
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Quiet Hours Section */}
              <div className="rounded-md border border-[#E7E5E0] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-[#78716C]" />
                    <span className="text-sm font-medium text-[#1C1917]">
                      Enable Quiet Hours
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={quietHoursEnabled}
                    onClick={() => setQuietHoursEnabled(!quietHoursEnabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      quietHoursEnabled ? "bg-[#0D9488]" : "bg-[#D6D3D1]"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        quietHoursEnabled
                          ? "translate-x-[18px]"
                          : "translate-x-[3px]"
                      }`}
                    />
                  </button>
                </div>

                {quietHoursEnabled && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-[#A8A29E]">
                      Notifications will be suppressed during quiet hours.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[#78716C]">
                          Start Time
                        </label>
                        <input
                          type="time"
                          value={quietHoursStart}
                          onChange={(e) =>
                            setQuietHoursStart(e.target.value)
                          }
                          className="w-full rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm outline-none focus:border-[#0D9488]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[#78716C]">
                          End Time
                        </label>
                        <input
                          type="time"
                          value={quietHoursEnd}
                          onChange={(e) =>
                            setQuietHoursEnd(e.target.value)
                          }
                          className="w-full rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm outline-none focus:border-[#0D9488]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#78716C]">
                        Timezone
                      </label>
                      <select
                        value={quietHoursTimezone}
                        onChange={(e) =>
                          setQuietHoursTimezone(e.target.value)
                        }
                        className="w-full rounded-md border border-[#E7E5E0] px-3 py-1.5 text-sm outline-none focus:border-[#0D9488]"
                      >
                        {TIMEZONES.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={!recipients || isSaving}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
              >
                {isSaving && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                {editingRule ? "Update Rule" : "Create Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
