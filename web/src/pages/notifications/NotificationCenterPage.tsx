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

  const { data: incidentsData, isLoading: incidentsLoading } = useQuery({
    queryKey: ["notification-center-incidents"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Incident>>("/events", {
        params: { status: "new", limit: PAGE_SIZES.INCIDENTS },
      });
      return res.data;
    },
  });

  const { data: deliveriesData, isLoading: deliveriesLoading } = useQuery({
    queryKey: ["notification-center-deliveries"],
    queryFn: async () => {
      const res = await api.get("/notifications/deliveries", {
        params: { limit: PAGE_SIZES.DELIVERIES },
      });
      return res.data;
    },
  });

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
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
            <Bell size={20} className="text-[#0D9488]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
              {incidents.length > 0 && (
                <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white">
                  {incidents.length}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-gray-500">Incidents and delivery notifications</p>
          </div>
        </div>
        {incidents.length > 0 && (
          <button
            onClick={() => ackAllMutation.mutate()}
            disabled={ackAllMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0F766E] disabled:opacity-50"
            aria-label="Mark all incidents as read"
          >
            {ackAllMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCheck size={16} />
            )}
            Mark All Read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors ${
              tab === t.key
                ? "text-[#0D9488]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0D9488]" />
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-4 p-4">
                <div className="h-10 w-10 rounded-lg bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-64 rounded bg-gray-200" />
                </div>
                <div className="h-3 w-12 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      ) : incidents.length === 0 && deliveries.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="When incidents occur or notifications are sent, they will appear here."
        />
      ) : (
        <div className="space-y-4">
          {/* Unread Incidents Section */}
          {showIncidents && incidents.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Unread Incidents ({incidents.length})
              </h2>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="divide-y divide-gray-100">
                  {incidents.map((inc) => {
                    const storeName = storeMap.get(inc.store_id) ?? "Unknown Store";
                    const cameraName = cameraMap.get(inc.camera_id) ?? "Unknown Camera";
                    const SeverityDot = SEVERITY_COLORS[inc.severity] ?? SEVERITY_COLORS.low;

                    return (
                      <Link
                        key={inc.id}
                        to={`/incidents/${inc.id}`}
                        className="flex items-center gap-4 border-l-2 border-[#0D9488] bg-teal-50/30 p-4 transition-colors hover:bg-teal-50/60"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50">
                          <AlertTriangle
                            size={18}
                            className={
                              inc.severity === "critical"
                                ? "text-red-600"
                                : inc.severity === "high"
                                ? "text-orange-600"
                                : inc.severity === "medium"
                                ? "text-amber-600"
                                : "text-blue-600"
                            }
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-900">
                              Spill Detected
                            </span>
                            <StatusBadge status={inc.severity} size="sm" />
                            <StatusBadge status={inc.status} size="sm" />
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                            {cameraName} &middot; {storeName} &middot;{" "}
                            Confidence: {(inc.max_confidence * 100).toFixed(0)}%
                            &middot; {inc.detection_count} detection
                            {inc.detection_count !== 1 ? "s" : ""}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 text-xs text-gray-400">
                          <span>{timeAgo(inc.start_time)}</span>
                          <ExternalLink size={14} className="text-[#0D9488]" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Notification Deliveries Section */}
          {showDeliveries && (
            <div>
              {showIncidents && incidents.length > 0 && <div className="h-2" />}
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Recent Deliveries ({filteredDeliveries.length})
              </h2>
              {filteredDeliveries.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
                  <Bell size={24} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-500">No deliveries for this filter.</p>
                </div>
              ) : (
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
                        {filteredDeliveries.map((d) => {
                          const ChannelIcon =
                            CHANNEL_ICONS[d.channel] ?? Bell;
                          return (
                            <tr
                              key={d.id}
                              className="transition-colors hover:bg-gray-50"
                            >
                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <ChannelIcon
                                    size={14}
                                    className="text-gray-400"
                                  />
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                    d.channel === "email" ? "bg-blue-50 text-blue-700" :
                                    d.channel === "webhook" ? "bg-purple-50 text-purple-700" :
                                    d.channel === "sms" ? "bg-green-50 text-green-700" :
                                    "bg-amber-50 text-amber-700"
                                  }`}>
                                    {d.channel}
                                  </span>
                                </div>
                              </td>
                              <td className="max-w-[200px] truncate px-4 py-3 text-gray-600">
                                {d.recipient}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                  d.status === "sent"
                                    ? "bg-green-50 text-green-700"
                                    : d.status === "pending"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-red-50 text-red-700"
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
                                {timeAgo(d.sent_at)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
