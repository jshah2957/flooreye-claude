import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import api from "@/services/api";

interface Incident {
  id: string;
  severity: string;
  status: string;
  max_confidence: number;
  max_wet_area_percent: number;
  detection_count: number;
  start_time: string;
  end_time: string | null;
  camera_id: string;
  store_id: string;
  notes: string | null;
}

export default function IncidentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/mobile/incidents/${id}`).then((res) => {
      setIncident(res.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const acknowledge = async () => {
    try {
      await api.put(`/mobile/alerts/${id}/acknowledge`);
      setIncident((prev) => prev ? { ...prev, status: "acknowledged" } : null);
    } catch {}
  };

  if (loading) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F7F4" }}><ActivityIndicator size="large" color="#0D9488" /></View>;
  }

  if (!incident) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F7F4" }}><Text style={{ color: "#78716C" }}>Incident not found</Text></View>;
  }

  const severityColor: Record<string, string> = { critical: "#991B1B", high: "#DC2626", medium: "#D97706", low: "#D97706" };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8F7F4" }} contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
        <Text style={{ color: "#0D9488", fontSize: 14 }}>← Back</Text>
      </TouchableOpacity>

      <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E7E5E0", padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <View style={{ backgroundColor: "#FEE2E2", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: severityColor[incident.severity], textTransform: "uppercase" }}>{incident.severity}</Text>
          </View>
          <View style={{ backgroundColor: "#DBEAFE", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#2563EB", textTransform: "uppercase" }}>{incident.status}</Text>
          </View>
        </View>

        <DetailRow label="Detected" value={new Date(incident.start_time).toLocaleString()} />
        <DetailRow label="Max Confidence" value={`${(incident.max_confidence * 100).toFixed(1)}%`} />
        <DetailRow label="Max Wet Area" value={`${incident.max_wet_area_percent.toFixed(1)}%`} />
        <DetailRow label="Detections" value={String(incident.detection_count)} />
        {incident.end_time && <DetailRow label="Ended" value={new Date(incident.end_time).toLocaleString()} />}
        {incident.notes && <DetailRow label="Notes" value={incident.notes} />}

        {incident.status === "new" && (
          <TouchableOpacity
            onPress={acknowledge}
            style={{ backgroundColor: "#0D9488", borderRadius: 8, paddingVertical: 12, marginTop: 16, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Acknowledge</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F1F0ED" }}>
      <Text style={{ fontSize: 13, color: "#78716C" }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: "500", color: "#1C1917" }}>{value}</Text>
    </View>
  );
}
