import { useState, useEffect, useCallback } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import api from "@/services/api";

export default function LiveScreen() {
  const [cameras, setCameras] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshRate, setRefreshRate] = useState(3000);

  useEffect(() => {
    api.get("/mobile/dashboard").then((res) => {
      setCameras(res.data.data.camera_chips ?? []);
    }).catch(() => {});
  }, []);

  const fetchFrame = useCallback(async () => {
    if (!selectedCamera) return;
    setLoading(true);
    try {
      const res = await api.get(`/mobile/cameras/${selectedCamera}/frame`);
      setFrame(res.data.data.base64);
    } catch {
      setFrame(null);
    } finally {
      setLoading(false);
    }
  }, [selectedCamera]);

  useEffect(() => {
    if (!selectedCamera) return;
    fetchFrame();
    const interval = setInterval(fetchFrame, refreshRate);
    return () => clearInterval(interval);
  }, [selectedCamera, refreshRate, fetchFrame]);

  return (
    <View style={{ flex: 1, backgroundColor: "#F8F7F4", padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", color: "#1C1917", marginBottom: 12 }}>Live View</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, maxHeight: 40 }}>
        {cameras.map((cam) => (
          <TouchableOpacity
            key={cam.id}
            onPress={() => setSelectedCamera(cam.id)}
            style={{
              backgroundColor: selectedCamera === cam.id ? "#0D9488" : "#fff",
              borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8,
              borderWidth: 1, borderColor: selectedCamera === cam.id ? "#0D9488" : "#E7E5E0",
            }}
          >
            <Text style={{ fontSize: 12, color: selectedCamera === cam.id ? "#fff" : "#1C1917" }}>{cam.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ flex: 1, backgroundColor: "#000", borderRadius: 8, overflow: "hidden", justifyContent: "center", alignItems: "center" }}>
        {!selectedCamera ? (
          <Text style={{ color: "#78716C", fontSize: 14 }}>Select a camera above</Text>
        ) : loading && !frame ? (
          <ActivityIndicator size="large" color="#0D9488" />
        ) : frame ? (
          <Image source={{ uri: `data:image/jpeg;base64,${frame}` }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
        ) : (
          <Text style={{ color: "#DC2626", fontSize: 13 }}>Unable to connect</Text>
        )}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 12 }}>
        {[1000, 2000, 3000, 5000].map((ms) => (
          <TouchableOpacity
            key={ms}
            onPress={() => setRefreshRate(ms)}
            style={{
              backgroundColor: refreshRate === ms ? "#0D9488" : "#fff",
              borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
              borderWidth: 1, borderColor: refreshRate === ms ? "#0D9488" : "#E7E5E0",
            }}
          >
            <Text style={{ fontSize: 11, color: refreshRate === ms ? "#fff" : "#78716C" }}>{ms / 1000}s</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
