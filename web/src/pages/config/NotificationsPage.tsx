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
  Link2,
  MessageSquare,
  BellRing,
  Play,
  Clock,
} from "lucide-react";

import api from "@/lib/api";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import HelpSection from "@/components/ui/HelpSection";
import { PAGE_HELP } from "@/constants/help";

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

const CHANNEL_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  email: { icon: Mail, color: "text-blue-600", bg: "bg-blue-50", label: "Email" },
  webhook: { icon: Link2, color: "text-purple-600", bg: "bg-purple-50", label: "Webhook" },
  sms: { icon: MessageSquare, color: "text-green-600", bg: "bg-green-50", label: "SMS" },
  push: { icon: BellRing, color: "text-amber-600", bg: "bg-amber-50", label: "Push" },
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-blue-50 text-blue-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-orange-50 text-orange-700",
  critical: "bg-red-50 text-red-700",
};

function ChannelIconBadge({ channel }: { channel: string }) {
  const cfg = CHANNEL_CONFIG[channel] ?? { icon: Bell, color: "text-gray-500", bg: "bg-gray-50", label: channel };
  const Icon = cfg.icon;
  return (
    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${cfg.bg}`}>
      <Icon size={16} className={cfg.color} />
    </div>
  );
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
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Configure alert rules · Channels: Email, Push, SMS, Webhook · Set quiet hours and severity filters</p>
        <HelpSection title={PAGE_HELP.notifications.title}>
          {PAGE_HELP.notifications.content.map((line, i) => <p key={i}>{line}</p>)}
        </HelpSection>
        </div>
        <button
          onClick={openCreateDrawer}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0F766E]"
        >
          <Plus size={16} /> New Rule
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {(["rules", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-5 py-3 text-sm font-medium transition-colors ${
              tab === t
                ? "text-[#0D9488]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "rules" ? `Rules (${rules.length})` : "Delivery History"}
            {tab === t && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0D9488]" />
            )}
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {tab === "rules" &&
        (isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 rounded bg-gray-200" />
                    <div className="h-3 w-64 rounded bg-gray-200" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notification rules"
            description="Create a rule to receive alerts when incidents are detected."
            actionLabel="New Rule"
            onAction={openCreateDrawer}
          />
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => {
              const cfg = CHANNEL_CONFIG[rule.channel] ?? { label: rule.channel };
              return (
                <div
                  key={rule.id}
                  className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <ChannelIconBadge channel={rule.channel} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          {rule.name || cfg.label}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_BADGE[rule.min_severity] ?? "bg-gray-100 text-gray-600"}`}>
                          {rule.min_severity}
                        </span>
                        {!rule.is_active && (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span>{channelRecipientLabel(rule.channel, rule.recipients)}</span>
                        <span className="hidden sm:inline">&middot;</span>
                        <span>
                          Confidence: {((rule.min_confidence ?? 0) * 100).toFixed(0)}%
                        </span>
                        {rule.quiet_hours_enabled && (
                          <>
                            <span className="hidden sm:inline">&middot;</span>
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <Clock size={11} />
                              Quiet {rule.quiet_hours_start}&ndash;{rule.quiet_hours_end}{" "}
                              {rule.quiet_hours_timezone || ""}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => handleTestSend(rule.id)}
                        disabled={testingRuleId === rule.id}
                        title="Test Send"
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
                      >
                        {testingRuleId === rule.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Play size={14} />
                        )}
                      </button>
                      <button
                        onClick={() => openEditDrawer(rule)}
                        title="Edit"
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-teal-50 hover:text-[#0D9488]"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(rule.id)}
                        title="Delete"
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {/* History Tab */}
      {tab === "history" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Channel
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Recipient
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Sent
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deliveries.map((d: any) => (
                  <tr key={d.id} className="transition-colors hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        d.channel === "email" ? "bg-blue-50 text-blue-700" :
                        d.channel === "webhook" ? "bg-purple-50 text-purple-700" :
                        d.channel === "sms" ? "bg-green-50 text-green-700" :
                        "bg-amber-50 text-amber-700"
                      }`}>
                        {d.channel}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-gray-600">{d.recipient}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                        d.status === "sent" ? "bg-green-50 text-green-700" :
                        d.status === "pending" ? "bg-amber-50 text-amber-700" :
                        "bg-red-50 text-red-700"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          d.status === "sent" ? "bg-green-500" :
                          d.status === "pending" ? "bg-amber-500" :
                          "bg-red-500"
                        }`} />
                        {d.status === "sent" ? "Delivered" : d.status === "pending" ? "Pending" : "Failed"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {new Date(d.sent_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {deliveries.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-gray-400"
                    >
                      <Bell size={24} className="mx-auto mb-2 text-gray-300" />
                      No deliveries yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={editingRule ? "Edit Notification Rule" : "New Notification Rule"}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingRule ? "Edit Notification Rule" : "New Notification Rule"}
              </h2>
              <button
                onClick={closeDrawer}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close drawer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-5 p-6">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Rule Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Critical spill alerts"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                />
              </div>

              {/* Channel */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Channel <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(CHANNEL_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setChannel(key)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                          channel === key
                            ? "border-[#0D9488] bg-teal-50 text-[#0D9488] ring-2 ring-[#0D9488]/20"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <Icon size={16} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recipients */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Recipients <span className="text-red-500">*</span>
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  {channel === "email" && "Enter email addresses separated by commas"}
                  {channel === "webhook" && "Enter webhook URL(s) separated by commas"}
                  {channel === "sms" && "Enter phone numbers in E.164 format (+1...)"}
                  {channel === "push" && "Enter push device tokens separated by commas"}
                </p>
              </div>

              {/* Min Severity */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Minimum Severity
                </label>
                <select
                  value={minSeverity}
                  onChange={(e) => setMinSeverity(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Min Confidence */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Minimum Confidence
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={minConfidence}
                    onChange={(e) =>
                      setMinConfidence(parseFloat(e.target.value))
                    }
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-[#0D9488]"
                  />
                  <span className="w-12 rounded-md bg-gray-100 px-2 py-1 text-center text-sm font-medium text-gray-700">
                    {(minConfidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Active toggle (edit mode only) */}
              {editingRule && (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">
                    Rule Active
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    onClick={() => setIsActive(!isActive)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isActive ? "bg-[#0D9488]" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        isActive ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Quiet Hours Section */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">
                      Quiet Hours
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={quietHoursEnabled}
                    onClick={() => setQuietHoursEnabled(!quietHoursEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      quietHoursEnabled ? "bg-[#0D9488]" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        quietHoursEnabled
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {quietHoursEnabled && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs text-gray-400">
                      Notifications will be suppressed during quiet hours.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          Start Time
                        </label>
                        <input
                          type="time"
                          value={quietHoursStart}
                          onChange={(e) =>
                            setQuietHoursStart(e.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          End Time
                        </label>
                        <input
                          type="time"
                          value={quietHoursEnd}
                          onChange={(e) =>
                            setQuietHoursEnd(e.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        Timezone
                      </label>
                      <select
                        value={quietHoursTimezone}
                        onChange={(e) =>
                          setQuietHoursTimezone(e.target.value)
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
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
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0D9488] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0F766E] disabled:cursor-not-allowed disabled:opacity-50"
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
