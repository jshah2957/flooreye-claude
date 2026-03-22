import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import api from "@/services/api";
import {
  BRAND,
  SEVERITY_COLORS,
  SEVERITY_BG_COLORS,
  STAT_COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
} from "@/constants/theme";
import { API_LIMITS } from "@/constants/config";
import { useWebSocket } from "@/hooks/useWebSocket";
import ErrorBanner from "@/components/shared/ErrorBanner";
import ConnectionStatusBar from "@/components/shared/ConnectionStatusBar";
import type { DashboardData, WSMessage } from "@/types";

export default function HomeScreen() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WebSocket for real-time incident updates
  const { state: wsState } = useWebSocket({
    channel: "/ws/incidents",
    onMessage: (msg: WSMessage) => {
      if (msg.type === "incident_created" || msg.type === "incident_updated") {
        // Refresh dashboard on new/updated incidents
        fetchDashboard();
      }
    },
  });

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get("/mobile/dashboard");
      setData(res.data.data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ?? err?.message ?? "Failed to load dashboard";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: BRAND.background,
        }}
      >
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

  const stats = data?.stats;

  return (
    <View style={{ flex: 1, backgroundColor: BRAND.background }}>
      <ConnectionStatusBar state={wsState} />
      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={BRAND.primary}
          />
        }
      >
        {error && (
          <ErrorBanner
            message={error}
            onRetry={() => {
              setLoading(true);
              fetchDashboard();
            }}
          />
        )}

        {/* Stats Row */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: SPACING.sm,
            marginBottom: SPACING.lg,
          }}
        >
          <StatCard
            label="Stores"
            value={stats?.total_stores ?? 0}
            color={STAT_COLORS.stores}
          />
          <StatCard
            label="Cameras"
            value={`${stats?.online_cameras ?? 0}/${stats?.total_cameras ?? 0}`}
            color={STAT_COLORS.cameras}
          />
          <StatCard
            label="Incidents"
            value={stats?.active_incidents ?? 0}
            color={STAT_COLORS.incidents}
          />
        </View>

        {/* System Status */}
        <SectionHeader title="System Status" />
        <View
          style={{
            flexDirection: "row",
            gap: SPACING.sm,
            marginBottom: SPACING.lg,
          }}
        >
          <StatusChip
            label="Edge Agents"
            count={data?.camera_chips?.filter(
              (c) => c.status === "online" || c.status === "active"
            ).length ?? 0}
            total={data?.camera_chips?.length ?? 0}
            healthy
          />
          <StatusChip
            label="Detection"
            count={stats?.online_cameras ?? 0}
            total={stats?.total_cameras ?? 0}
            healthy={(stats?.online_cameras ?? 0) > 0}
          />
        </View>

        {/* Active Incidents */}
        <SectionHeader title="Active Incidents" />
        {(data?.active_incidents ?? []).length === 0 ? (
          <EmptyCard message="No active incidents" />
        ) : (
          <View style={{ gap: SPACING.sm, marginBottom: SPACING.lg }}>
            {data!.active_incidents.map((inc) => (
              <TouchableOpacity
                key={inc.id}
                onPress={() => router.push(`/incident/${inc.id}`)}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  backgroundColor: BRAND.surface,
                  borderRadius: RADIUS.md,
                  borderWidth: 1,
                  borderColor: BRAND.border,
                  overflow: "hidden",
                }}
                accessibilityLabel={`${inc.severity} severity incident, ${inc.detection_count} detections, ${(inc.max_confidence * 100).toFixed(0)}% confidence`}
                accessibilityRole="button"
              >
                <View
                  style={{
                    width: 4,
                    backgroundColor:
                      SEVERITY_COLORS[inc.severity] ?? SEVERITY_COLORS.medium,
                  }}
                />
                <View style={{ flex: 1, padding: SPACING.md }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: SPACING.xs + 2,
                    }}
                  >
                    <SeverityBadge severity={inc.severity} />
                    <Text style={{ fontSize: FONT_SIZE.md, color: BRAND.textSecondary }}>
                      {inc.detection_count} detections
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: FONT_SIZE.sm,
                      color: BRAND.textSecondary,
                      marginTop: SPACING.xs,
                    }}
                  >
                    {new Date(inc.start_time).toLocaleTimeString()} ·{" "}
                    {(inc.max_confidence * 100).toFixed(1)}% confidence
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recent Wet Detections */}
        <SectionHeader title="Recent Wet Detections" />
        {(data?.recent_detections ?? []).length === 0 ? (
          <EmptyCard message="No recent detections" />
        ) : (
          <View style={{ gap: SPACING.xs + 2 }}>
            {data!.recent_detections
              .slice(0, API_LIMITS.MAX_DASHBOARD_DETECTIONS)
              .map((d) => (
                <View
                  key={d.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    backgroundColor: BRAND.surface,
                    borderRadius: RADIUS.md,
                    borderWidth: 1,
                    borderColor: BRAND.border,
                    padding: SPACING.md - 2,
                  }}
                  accessibilityLabel={`Wet detection at ${(d.confidence * 100).toFixed(1)}% confidence, ${d.wet_area_percent.toFixed(1)}% area`}
                >
                  <View>
                    <Text
                      style={{
                        fontSize: FONT_SIZE.lg - 1,
                        fontWeight: "500",
                        color: BRAND.danger,
                      }}
                    >
                      WET · {(d.confidence * 100).toFixed(1)}%
                    </Text>
                    <Text style={{ fontSize: FONT_SIZE.sm, color: BRAND.textSecondary }}>
                      {d.wet_area_percent.toFixed(1)}% area
                    </Text>
                  </View>
                  <Text style={{ fontSize: FONT_SIZE.sm, color: BRAND.textSecondary }}>
                    {new Date(d.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
              ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// --- Local components (use theme constants) ---

function SectionHeader({ title }: { title: string }) {
  return (
    <Text
      style={{
        fontSize: FONT_SIZE.xl,
        fontWeight: "600",
        color: BRAND.textPrimary,
        marginBottom: SPACING.sm,
      }}
      accessibilityRole="header"
    >
      {title}
    </Text>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <View
      style={{
        padding: SPACING.xxl,
        alignItems: "center",
        backgroundColor: BRAND.surface,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: BRAND.border,
        marginBottom: SPACING.lg,
      }}
    >
      <Text style={{ color: BRAND.textSecondary, fontSize: FONT_SIZE.lg - 1 }}>
        {message}
      </Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 100,
        backgroundColor: BRAND.surface,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: BRAND.border,
        padding: SPACING.md,
      }}
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={{ fontSize: FONT_SIZE.sm, color: BRAND.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: FONT_SIZE.h2 - 2, fontWeight: "700", color }}>{value}</Text>
    </View>
  );
}

function StatusChip({
  label,
  count,
  total,
  healthy,
}: {
  label: string;
  count: number;
  total: number;
  healthy: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: BRAND.surface,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: BRAND.border,
        padding: SPACING.md,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
      }}
      accessibilityLabel={`${label}: ${count} of ${total} ${healthy ? "healthy" : "issues detected"}`}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: healthy ? BRAND.success : BRAND.danger,
        }}
      />
      <View>
        <Text style={{ fontSize: FONT_SIZE.sm, color: BRAND.textSecondary }}>{label}</Text>
        <Text style={{ fontSize: FONT_SIZE.lg, fontWeight: "600", color: BRAND.textPrimary }}>
          {count}/{total}
        </Text>
      </View>
    </View>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const bg = SEVERITY_BG_COLORS[severity] ?? SEVERITY_BG_COLORS.low;
  const text = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.low;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: RADIUS.lg,
        paddingHorizontal: SPACING.xs + 2,
        paddingVertical: 2,
      }}
    >
      <Text
        style={{
          fontSize: FONT_SIZE.xs,
          fontWeight: "600",
          color: text,
          textTransform: "uppercase",
        }}
      >
        {severity}
      </Text>
    </View>
  );
}
