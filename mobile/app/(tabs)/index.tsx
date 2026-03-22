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
          gap: 12,
        }}
      >
        <ActivityIndicator size="large" color={BRAND.primary} />
        <Text style={{ fontSize: 14, color: BRAND.textSecondary }}>
          Loading dashboard...
        </Text>
      </View>
    );
  }

  const stats = data?.stats;

  return (
    <View style={{ flex: 1, backgroundColor: BRAND.background }}>
      <ConnectionStatusBar state={wsState} />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
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
            gap: 10,
            marginBottom: 20,
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
            gap: 10,
            marginBottom: 20,
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
          <View style={{ gap: 8, marginBottom: 20 }}>
            {data!.active_incidents.map((inc) => (
              <TouchableOpacity
                key={inc.id}
                onPress={() => router.push(`/incident/${inc.id}`)}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  backgroundColor: BRAND.surface,
                  borderRadius: 12,
                  overflow: "hidden",
                  minHeight: 80,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 3,
                  elevation: 2,
                }}
                accessibilityLabel={`${inc.severity} severity incident, ${inc.detection_count} detections, ${(inc.max_confidence * 100).toFixed(0)}% confidence`}
                accessibilityRole="button"
              >
                <View
                  style={{
                    width: 4,
                    backgroundColor:
                      SEVERITY_COLORS[inc.severity] ?? SEVERITY_COLORS.medium,
                    borderRadius: 2,
                  }}
                />
                <View style={{ flex: 1, padding: 16 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <SeverityBadge severity={inc.severity} />
                    <Text style={{ fontSize: 13, color: BRAND.textSecondary }}>
                      {inc.detection_count} detections
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: BRAND.textSecondary,
                      marginTop: 6,
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
          <View style={{ gap: 8 }}>
            {data!.recent_detections
              .slice(0, API_LIMITS.MAX_DASHBOARD_DETECTIONS)
              .map((d) => (
                <View
                  key={d.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: BRAND.surface,
                    borderRadius: 12,
                    padding: 14,
                    minHeight: 60,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.04,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                  accessibilityLabel={`Wet detection at ${(d.confidence * 100).toFixed(1)}% confidence, ${d.wet_area_percent.toFixed(1)}% area`}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View
                      style={{
                        backgroundColor: "#FEE2E2",
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "600",
                          color: "#DC2626",
                        }}
                      >
                        WET
                      </Text>
                    </View>
                    <View>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: BRAND.textPrimary,
                        }}
                      >
                        {(d.confidence * 100).toFixed(1)}%
                      </Text>
                      <Text style={{ fontSize: 11, color: BRAND.textSecondary }}>
                        {d.wet_area_percent.toFixed(1)}% area
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: BRAND.textSecondary }}>
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

// --- Local components ---

function SectionHeader({ title }: { title: string }) {
  return (
    <Text
      style={{
        fontSize: 16,
        fontWeight: "700",
        color: BRAND.textPrimary,
        marginBottom: 12,
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
        paddingVertical: 32,
        paddingHorizontal: 20,
        alignItems: "center",
        backgroundColor: BRAND.surface,
        borderRadius: 12,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      <Text style={{ color: BRAND.textSecondary, fontSize: 14 }}>
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
        borderRadius: 16,
        borderLeftWidth: 4,
        borderLeftColor: color,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      }}
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          color: "#78716C",
          fontWeight: "500",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 28, fontWeight: "700", color }}>{value}</Text>
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
        borderRadius: 12,
        height: 48,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
        elevation: 1,
      }}
      accessibilityLabel={`${label}: ${count} of ${total} ${healthy ? "healthy" : "issues detected"}`}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: healthy ? BRAND.success : BRAND.danger,
        }}
      />
      <View>
        <Text style={{ fontSize: 11, color: BRAND.textSecondary }}>{label}</Text>
        <Text style={{ fontSize: 15, fontWeight: "700", color: BRAND.textPrimary }}>
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
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: text,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {severity}
      </Text>
    </View>
  );
}
