import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bell,
  Loader2,
  CheckCheck,
  AlertTriangle,
  Mail,
  Webhook,
  MessageSquare,
  Smartphone,
  ExternalLink,
} from "lucide-react";

import api from "@/lib/api";
import { PAGE_SIZES, NOTIFICATION_SEVERITY_BG } from "@/constants";
import type { Incident, Store, Camera, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";

type FilterTab = "all" | "incidents" | "push" | "email" | "webhook" | "sms";

interface NotificationDelivery {
  id: string;
  rule_id: string;
  event_id: string;
  channel: string;
  recipient: string;
  status: string;
  sent_at: string;
  error_message?: string | null;
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  email: Mail,
  webhook: Webhook,
  sms: MessageSquare,
  push: Smartphone,
};

const SEVERITY_COLORS = NOTIFICATION_SEVERITY_BG;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationCenterPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [tab, setTab] = useState<FilterTab>("all");

  // Fetch unread/new incidents
  const { data: incidentsData, isLoading: incidentsLoading } = useQuery({
    queryKey: ["notification-center-incidents"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Incident>>("/events", {
        params: { status: "new", limit: PAGE_SIZES.INCIDENTS },
      });
      return res.data;
    },
  });

  // Fetch recent notification deliveries
  const { data: deliveriesData, isLoading: deliveriesLoading } = useQuery({
    queryKey: ["notification-center-deliveries"],
    queryFn: async () => {
      const res = await api.get("/notifications/deliveries", {
        params: { limit: PAGE_SIZES.DELIVERIES },
      });
      return res.data;
    },
  });

  // Fetch stores and cameras for display names
  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", {
        params: { limit: 100 },
      });
      return res.data.data;
    },
  });

  const { data: cameras } = useQuery({
    queryKey: ["cameras-list"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Camera>>("/cameras", {
        params: { limit: 100 },
      });
      return res.data.data;
    },
  });

  // Acknowledge all new incidents
  const ackAllMutation = useMutation({
    mutationFn: async () => {
      const incidents = incidentsData?.data ?? [];
      await Promise.all(
        incidents.map((inc: Incident) =>
          api.put(`/events/${inc.id}/acknowledge`)
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-center-incidents"] });
      success("All incidents marked as read");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to acknowledge incidents");
    },
  });

  const incidents: Incident[] = incidentsData?.data ?? [];
  const deliveries: NotificationDelivery[] = deliveriesData?.data ?? [];

  const storeMap = new Map((stores ?? []).map((s: Store) => [s.id, s.name]));
  const cameraMap = new Map((cameras ?? []).map((c: Camera) => [c.id, c.name]));

  const isLoading = incidentsLoading || deliveriesLoading;

  // Filter deliveries based on tab
  const filteredDeliveries =
    tab === "all" || tab === "incidents"
      ? deliveries
      : deliveries.filter((d) => d.channel === tab);

  const showIncidents = tab === "all" || tab === "incidents";
  const showDeliveries = tab !== "incidents";

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "incidents", label: `Incidents (${incidents.length})` },
    { key: "push", label: "Push" },
    { key: "email", label: "Email" },
    { key: "webhook", label: "Webhook" },
    { key: "sms", label: "SMS" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell size={22} className="text-[#0D9488]" />
          <h1 className="text-xl font-semibold text-[#1C1917]">
            Notification Center
          </h1>
          {incidents.length > 0 && (
            <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#DC2626] px-2 text-xs font-bold text-white">
              {incidents.length}
            </span>
          )}
        </div>
        {incidents.length > 0 && (
          <button
            onClick={() => ackAllMutation.mutate()}
            disabled={ackAllMutation.isPending}
            className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
            aria-label="Mark all incidents as read"
          >
            {ackAllMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCheck size={16} />
            )}
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="mb-4 flex gap-1 border-b border-[#E7E5E0]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium ${
              tab === t.key
                ? "border-b-2 border-[#0D9488] text-[#0D9488]"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#0D9488]" />
        </div>
      ) : incidents.length === 0 && deliveries.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="When incidents occur or notifications are sent, they will appear here."
        />
      ) : (
        <div className="space-y-2">
          {/* Unread Incidents Section */}
          {showIncidents && incidents.length > 0 && (
            <>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#78716C]">
                Unread Incidents ({incidents.length})
              </h2>
              <div className="space-y-2">
                {incidents.map((inc) => {
                  const storeName = storeMap.get(inc.store_id) ?? "Unknown Store";
                  const cameraName = cameraMap.get(inc.camera_id) ?? "Unknown Camera";
                  const SeverityDot = SEVERITY_COLORS[inc.severity] ?? SEVERITY_COLORS.low;

                  return (
                    <Link
                      key={inc.id}
                      to={`/incidents/${inc.id}`}
                      className="flex items-center gap-4 rounded-lg border border-[#E7E5E0] bg-white p-4 transition-colors hover:border-[#0D9488]/30 hover:bg-[#F0FDFA]"
                    >
                      {/* Severity indicator */}
                      <div className="flex flex-col items-center gap-1">
                        <AlertTriangle
                          size={18}
                          className={
                            inc.severity === "critical"
                              ? "text-[#DC2626]"
                              : inc.severity === "high"
                              ? "text-[#EA580C]"
                              : inc.severity === "medium"
                              ? "text-[#D97706]"
                              : "text-[#2563EB]"
                          }
                        />
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${SeverityDot}`}
                        />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#1C1917]">
                            Spill Detected
                          </span>
                          <StatusBadge status={inc.severity} size="sm" />
                          <StatusBadge status={inc.status} size="sm" />
                        </div>
                        <p className="mt-0.5 text-xs text-[#78716C]">
                          {cameraName} &middot; {storeName} &middot;{" "}
                          Confidence: {(inc.max_confidence * 100).toFixed(0)}%
                          &middot; {inc.detection_count} detection
                          {inc.detection_count !== 1 ? "s" : ""}
                        </p>
                      </div>

                      {/* Time + link */}
                      <div className="flex items-center gap-3 text-xs text-[#78716C]">
                        <span>{timeAgo(inc.start_time)}</span>
                        <ExternalLink size={14} className="text-[#0D9488]" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}

          {/* Notification Deliveries Section */}
          {showDeliveries && (
            <>
              {showIncidents && incidents.length > 0 && (
                <div className="my-4 border-t border-[#E7E5E0]" />
              )}
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#78716C]">
                Recent Deliveries ({filteredDeliveries.length})
              </h2>
              {filteredDeliveries.length === 0 ? (
                <div className="rounded-lg border border-[#E7E5E0] bg-white p-8 text-center text-sm text-[#78716C]">
                  No deliveries for this filter.
                </div>
              ) : (
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
                      {filteredDeliveries.map((d) => {
                        const ChannelIcon =
                          CHANNEL_ICONS[d.channel] ?? Bell;
                        return (
                          <tr
                            key={d.id}
                            className="border-b border-[#E7E5E0] last:border-0"
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <ChannelIcon
                                  size={14}
                                  className="text-[#78716C]"
                                />
                                <StatusBadge
                                  status={d.channel}
                                  size="sm"
                                />
                              </div>
                            </td>
                            <td className="max-w-[200px] truncate px-4 py-2.5 text-[#78716C]">
                              {d.recipient}
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusBadge
                                status={
                                  d.status === "sent"
                                    ? "online"
                                    : d.status === "pending"
                                    ? "staging"
                                    : "error"
                                }
                                size="sm"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-xs text-[#78716C]">
                              {timeAgo(d.sent_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
