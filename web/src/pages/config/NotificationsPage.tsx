import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Bell, Trash2, Loader2, X } from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";

interface NotificationRule {
  id: string;
  name: string | null;
  channel: string;
  recipients: string[];
  min_severity: string;
  min_confidence: number;
  quiet_hours_enabled: boolean;
  is_active: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<"rules" | "history">("rules");

  // Form
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<string>("email");
  const [recipients, setRecipients] = useState("");
  const [minSeverity, setMinSeverity] = useState("low");
  const [minConfidence, setMinConfidence] = useState(0.6);

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
      const res = await api.get("/notifications/deliveries", { params: { limit: 50 } });
      return res.data;
    },
    enabled: tab === "history",
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/notifications/rules", {
      name: name || null,
      channel,
      recipients: recipients.split(",").map((r) => r.trim()).filter(Boolean),
      min_severity: minSeverity,
      min_confidence: minConfidence,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
      setDrawerOpen(false);
      setName(""); setRecipients("");
      success("Notification rule created");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to create rule");
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

  const rules = rulesData?.data ?? [];
  const deliveries = deliveriesData?.data ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1C1917]">Notification Settings</h1>
        <button onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]">
          <Plus size={16} /> New Rule
        </button>
      </div>

      <div className="mb-4 flex gap-1 border-b border-[#E7E5E0]">
        {(["rules", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize ${tab === t ? "border-b-2 border-[#0D9488] text-[#0D9488]" : "text-[#78716C]"}`}>
            {t === "rules" ? `Rules (${rules.length})` : "Delivery History"}
          </button>
        ))}
      </div>

      {tab === "rules" && (
        isLoading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
        ) : rules.length === 0 ? (
          <EmptyState icon={Bell} title="No notification rules" description="Create a rule to receive alerts." actionLabel="New Rule" onAction={() => setDrawerOpen(true)} />
        ) : (
          <div className="space-y-3">
            {rules.map((rule: NotificationRule) => (
              <div key={rule.id} className="flex items-center justify-between rounded-lg border border-[#E7E5E0] bg-white p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#1C1917]">{rule.name || rule.channel}</span>
                    <StatusBadge status={rule.channel} size="sm" />
                    {!rule.is_active && <StatusBadge status="disabled" size="sm" />}
                  </div>
                  <p className="mt-1 text-xs text-[#78716C]">
                    {rule.recipients.join(", ")} &middot; Min severity: {rule.min_severity} &middot; Min conf: {(rule.min_confidence * 100).toFixed(0)}%
                    {rule.quiet_hours_enabled && " · Quiet hours ON"}
                  </p>
                </div>
                <button onClick={() => deleteMutation.mutate(rule.id)}
                  className="rounded p-1 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "history" && (
        <div className="overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Channel</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Recipient</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Status</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Sent</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d: any) => (
                <tr key={d.id} className="border-b border-[#E7E5E0]">
                  <td className="px-4 py-2"><StatusBadge status={d.channel} size="sm" /></td>
                  <td className="px-4 py-2 text-[#78716C]">{d.recipient}</td>
                  <td className="px-4 py-2"><StatusBadge status={d.status === "sent" ? "online" : "error"} size="sm" /></td>
                  <td className="px-4 py-2 text-[#78716C]">{new Date(d.sent_at).toLocaleString()}</td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-[#78716C]">No deliveries yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="h-full w-[384px] overflow-y-auto bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
              <h2 className="text-lg font-semibold text-[#1C1917]">New Notification Rule</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-[#78716C] hover:text-[#1C1917]"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Channel *</label>
                <select value={channel} onChange={(e) => setChannel(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="email">Email</option>
                  <option value="webhook">Webhook</option>
                  <option value="sms">SMS</option>
                  <option value="push">Push</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Recipients (comma-separated) *</label>
                <input value={recipients} onChange={(e) => setRecipients(e.target.value)}
                  placeholder="email@example.com, https://webhook.url"
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Min Severity</label>
                <select value={minSeverity} onChange={(e) => setMinSeverity(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Min Confidence ({(minConfidence * 100).toFixed(0)}%)</label>
                <input type="range" min={0} max={1} step={0.05} value={minConfidence}
                  onChange={(e) => setMinConfidence(parseFloat(e.target.value))} className="w-full" />
              </div>
              <button onClick={() => createMutation.mutate()} disabled={!recipients || createMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Create Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
