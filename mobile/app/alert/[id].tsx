import { useState, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import api from "@/services/api";

interface AlertDetail {
  id: string;
  camera_id: string;
  store_id: string;
  timestamp: string;
  is_wet: boolean;
  confidence: number;
  wet_area_percent: number;
  inference_time_ms: number;
  model_source: string;
  frame_base64?: string;
  predictions: Array<{ class_name: string; confidence: number; area_percent: number }>;
  incident_id?: string;
}

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [alert, setAlert] = useState<AlertDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/detection/history/${id}`)
      .then((res) => setAlert(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F7F4" }}>
        <ActivityIndicator size="large" color="#0D9488" />
      </View>
    );
  }

  if (!alert) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F7F4" }}>
        <Text style={{ color: "#DC2626", fontSize: 14 }}>Alert not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "#0D9488", fontSize: 14 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const severityColor = alert.is_wet ? "#DC2626" : "#16A34A";
  const severityLabel = alert.is_wet ? "WET" : "DRY";

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8F7F4" }} contentContainerStyle={{ padding: 16 }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Text style={{ fontSize: 24, color: "#0D9488" }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#1C1917" }}>Detection Detail</Text>
          <Text style={{ fontSize: 11, color: "#78716C" }}>{new Date(alert.timestamp).toLocaleString()}</Text>
        </View>
        <View style={{ backgroundColor: severityColor, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#fff" }}>{severityLabel}</Text>
        </View>
      </View>

      {/* Frame Image */}
      {alert.frame_base64 && (
        <View style={{ backgroundColor: "#000", borderRadius: 8, overflow: "hidden", marginBottom: 16, aspectRatio: 16 / 9 }}>
          <Image
            source={{ uri: `data:image/jpeg;base64,${alert.frame_base64}` }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Metrics */}
      <View style={{ backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0", padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#1C1917", marginBottom: 12 }}>Detection Metrics</Text>
        <DetailRow label="Confidence" value={`${(alert.confidence * 100).toFixed(1)}%`} />
        <DetailRow label="Wet Area" value={`${alert.wet_area_percent.toFixed(1)}%`} />
        <DetailRow label="Inference Time" value={`${alert.inference_time_ms}ms`} />
        <DetailRow label="Model Source" value={alert.model_source} />
        <DetailRow label="Camera" value={alert.camera_id.slice(0, 8)} />
        {alert.incident_id && <DetailRow label="Incident" value={alert.incident_id.slice(0, 8)} />}
      </View>

      {/* Predictions */}
      {alert.predictions.length > 0 && (
        <View style={{ backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0", padding: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#1C1917", marginBottom: 12 }}>Predictions</Text>
          {alert.predictions.map((pred, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: i < alert.predictions.length - 1 ? 1 : 0, borderColor: "#F3F4F6" }}>
              <Text style={{ fontSize: 13, color: "#1C1917" }}>{pred.class_name}</Text>
              <Text style={{ fontSize: 13, color: "#78716C" }}>{(pred.confidence * 100).toFixed(1)}%</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, color: "#78716C" }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: "500", color: "#1C1917" }}>{value}</Text>
    </View>
  );
}
