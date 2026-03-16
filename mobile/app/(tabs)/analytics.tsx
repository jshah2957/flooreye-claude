import { useState, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import api from "@/services/api";

interface AnalyticsData {
  period_days: number;
  total_detections: number;
  wet_detections: number;
  dry_detections: number;
  total_incidents: number;
  wet_rate: number;
}

export default function AnalyticsScreen() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [heatmap, setHeatmap] = useState<number[][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/mobile/analytics", { params: { days } }),
      api.get("/mobile/analytics/heatmap", { params: { days: 30 } }),
    ]).then(([analyticsRes, heatmapRes]) => {
      setData(analyticsRes.data.data);
      setHeatmap(heatmapRes.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F7F4" }}><ActivityIndicator size="large" color="#0D9488" /></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8F7F4" }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", color: "#1C1917", marginBottom: 12 }}>Analytics</Text>

      {/* Period Selector */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        {[7, 14, 30].map((d) => (
          <TouchableOpacity
            key={d}
            onPress={() => setDays(d)}
            style={{
              backgroundColor: days === d ? "#0D9488" : "#fff",
              borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6,
              borderWidth: 1, borderColor: days === d ? "#0D9488" : "#E7E5E0",
            }}
          >
            <Text style={{ fontSize: 12, color: days === d ? "#fff" : "#1C1917" }}>{d}d</Text>
          </TouchableOpacity>
        ))}
      </View>

      {data && (
        <View style={{ gap: 8, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <MetricCard label="Total Detections" value={data.total_detections} color="#2563EB" />
            <MetricCard label="Wet Detections" value={data.wet_detections} color="#DC2626" />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <MetricCard label="Incidents" value={data.total_incidents} color="#D97706" />
            <MetricCard label="Wet Rate" value={`${data.wet_rate}%`} color="#0D9488" />
          </View>
        </View>
      )}

      {/* Heatmap */}
      {heatmap && (
        <View style={{ backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0", padding: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#1C1917", marginBottom: 8 }}>Detection Heatmap (30d)</Text>
          <Text style={{ fontSize: 10, color: "#78716C", marginBottom: 8 }}>Hour → (0-23) | Day ↓ (Mon-Sun)</Text>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, rowIdx) => (
            <View key={day} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
              <Text style={{ width: 28, fontSize: 9, color: "#78716C" }}>{day}</Text>
              <View style={{ flexDirection: "row", flex: 1 }}>
                {(heatmap[rowIdx] ?? Array(24).fill(0)).map((val, colIdx) => {
                  const maxVal = Math.max(...heatmap.flat(), 1);
                  const intensity = val / maxVal;
                  const bg = intensity === 0 ? "#F3F4F6" : `rgba(220, 38, 38, ${Math.min(intensity + 0.1, 1)})`;
                  return <View key={colIdx} style={{ flex: 1, height: 12, backgroundColor: bg, marginRight: 1, borderRadius: 1 }} />;
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0", padding: 12 }}>
      <Text style={{ fontSize: 11, color: "#78716C" }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: "700", color, marginTop: 2 }}>{value}</Text>
    </View>
  );
}
