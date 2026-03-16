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

interface DashboardData {
  stats: {
    total_stores: number;
    total_cameras: number;
    online_cameras: number;
    active_incidents: number;
  };
  recent_detections: Array<{
    id: string;
    confidence: number;
    wet_area_percent: number;
    timestamp: string;
    camera_id: string;
    severity?: string;
  }>;
  active_incidents: Array<{
    id: string;
    severity: string;
    status: string;
    max_confidence: number;
    detection_count: number;
    start_time: string;
    camera_id: string;
  }>;
  camera_chips: Array<{
    id: string;
    name: string;
    status: string;
    inference_mode: string;
  }>;
}

export default function HomeScreen() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get("/mobile/dashboard");
      setData(res.data.data);
    } catch {
      // Silent fail — show empty state
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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F7F4" }}>
        <ActivityIndicator size="large" color="#0D9488" />
      </View>
    );
  }

  const stats = data?.stats;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8F7F4" }}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D9488" />}
    >
      {/* Stats Row */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <StatCard label="Stores" value={stats?.total_stores ?? 0} color="#2563EB" />
        <StatCard label="Cameras" value={`${stats?.online_cameras ?? 0}/${stats?.total_cameras ?? 0}`} color="#16A34A" />
        <StatCard label="Incidents" value={stats?.active_incidents ?? 0} color="#DC2626" />
      </View>

      {/* Active Incidents */}
      <Text style={{ fontSize: 16, fontWeight: "600", color: "#1C1917", marginBottom: 8 }}>
        Active Incidents
      </Text>
      {(data?.active_incidents ?? []).length === 0 ? (
        <View style={{ padding: 24, alignItems: "center", backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0", marginBottom: 16 }}>
          <Text style={{ color: "#78716C", fontSize: 13 }}>No active incidents</Text>
        </View>
      ) : (
        <View style={{ gap: 8, marginBottom: 16 }}>
          {data!.active_incidents.map((inc) => (
            <TouchableOpacity
              key={inc.id}
              onPress={() => router.push(`/incident/${inc.id}`)}
              style={{ flexDirection: "row", backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0", overflow: "hidden" }}
            >
              <View style={{ width: 4, backgroundColor: inc.severity === "critical" ? "#991B1B" : inc.severity === "high" ? "#DC2626" : "#D97706" }} />
              <View style={{ flex: 1, padding: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <SeverityBadge severity={inc.severity} />
                  <Text style={{ fontSize: 12, color: "#78716C" }}>{inc.detection_count} detections</Text>
                </View>
                <Text style={{ fontSize: 11, color: "#78716C", marginTop: 4 }}>
                  {new Date(inc.start_time).toLocaleTimeString()} · {(inc.max_confidence * 100).toFixed(0)}% confidence
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Camera Status */}
      <Text style={{ fontSize: 16, fontWeight: "600", color: "#1C1917", marginBottom: 8 }}>
        Cameras
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        {(data?.camera_chips ?? []).map((cam) => (
          <TouchableOpacity
            key={cam.id}
            onPress={() => router.push(`/live` as any)}
            style={{ backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0", padding: 10, marginRight: 8, minWidth: 120 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cam.status === "online" || cam.status === "active" ? "#16A34A" : "#DC2626" }} />
              <Text style={{ fontSize: 12, fontWeight: "500", color: "#1C1917" }} numberOfLines={1}>{cam.name}</Text>
            </View>
            <Text style={{ fontSize: 10, color: "#78716C" }}>{cam.inference_mode.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Recent Detections */}
      <Text style={{ fontSize: 16, fontWeight: "600", color: "#1C1917", marginBottom: 8 }}>
        Recent Wet Detections
      </Text>
      {(data?.recent_detections ?? []).length === 0 ? (
        <View style={{ padding: 24, alignItems: "center", backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0" }}>
          <Text style={{ color: "#78716C", fontSize: 13 }}>No recent detections</Text>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {data!.recent_detections.slice(0, 10).map((d) => (
            <View key={d.id} style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0", padding: 10 }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: "500", color: "#DC2626" }}>
                  WET · {(d.confidence * 100).toFixed(0)}%
                </Text>
                <Text style={{ fontSize: 11, color: "#78716C" }}>{d.wet_area_percent.toFixed(1)}% area</Text>
              </View>
              <Text style={{ fontSize: 11, color: "#78716C" }}>{new Date(d.timestamp).toLocaleTimeString()}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={{ flex: 1, minWidth: 100, backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0", padding: 12 }}>
      <Text style={{ fontSize: 11, color: "#78716C" }}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: "700", color }}>{value}</Text>
    </View>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    critical: { bg: "#FEE2E2", text: "#991B1B" },
    high: { bg: "#FEE2E2", text: "#DC2626" },
    medium: { bg: "#FEF3C7", text: "#D97706" },
    low: { bg: "#FEF3C7", text: "#D97706" },
  };
  const c = colors[severity] ?? colors.low;
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: "600", color: c.text, textTransform: "uppercase" }}>{severity}</Text>
    </View>
  );
}
