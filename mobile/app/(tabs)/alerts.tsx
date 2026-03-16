import { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import api from "@/services/api";

interface Alert {
  id: string;
  severity: string;
  status: string;
  max_confidence: number;
  detection_count: number;
  start_time: string;
  camera_id: string;
  store_id: string;
}

export default function AlertsScreen() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get("/mobile/alerts", { params: { limit: 50 } });
      setAlerts(res.data.data ?? []);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const acknowledge = async (id: string) => {
    try {
      await api.put(`/mobile/alerts/${id}/acknowledge`);
      fetchAlerts();
    } catch {}
  };

  const severityColor: Record<string, string> = { critical: "#991B1B", high: "#DC2626", medium: "#D97706", low: "#D97706" };

  if (loading) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F7F4" }}><ActivityIndicator size="large" color="#0D9488" /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F8F7F4" }}>
      <Text style={{ fontSize: 18, fontWeight: "600", color: "#1C1917", padding: 16, paddingBottom: 8 }}>Alerts</Text>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAlerts(); }} tintColor="#0D9488" />}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: "#78716C", fontSize: 14 }}>No alerts</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/incident/${item.id}`)}
            style={{ flexDirection: "row", backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0", overflow: "hidden" }}
          >
            <View style={{ width: 4, backgroundColor: severityColor[item.severity] ?? "#D97706" }} />
            <View style={{ flex: 1, padding: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  <View style={{ backgroundColor: item.severity === "critical" || item.severity === "high" ? "#FEE2E2" : "#FEF3C7", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: severityColor[item.severity], textTransform: "uppercase" }}>{item.severity}</Text>
                  </View>
                  <View style={{ backgroundColor: item.status === "new" ? "#DBEAFE" : "#DCFCE7", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: item.status === "new" ? "#2563EB" : "#16A34A", textTransform: "uppercase" }}>{item.status}</Text>
                  </View>
                </View>
                {item.status === "new" && (
                  <TouchableOpacity
                    onPress={() => acknowledge(item.id)}
                    style={{ backgroundColor: "#0D9488", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "600", color: "#fff" }}>ACK</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={{ fontSize: 12, color: "#78716C", marginTop: 4 }}>
                {item.detection_count} detections · {(item.max_confidence * 100).toFixed(0)}% · {new Date(item.start_time).toLocaleString()}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
