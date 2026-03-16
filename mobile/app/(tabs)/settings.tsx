import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator } from "react-native";
import { useAuth } from "@/hooks/useAuth";
import api from "@/services/api";

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/mobile/profile/notification-prefs"),
      api.get("/mobile/stores"),
    ]).then(([prefsRes, storesRes]) => {
      setPrefs(prefsRes.data.data ?? {});
      setStores(storesRes.data.data ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const togglePref = async (key: string, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    try {
      await api.put("/mobile/profile/notification-prefs", updated);
    } catch {}
  };

  if (loading) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F7F4" }}><ActivityIndicator size="large" color="#0D9488" /></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8F7F4" }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", color: "#1C1917", marginBottom: 16 }}>Settings</Text>

      {/* Profile */}
      <SectionCard title="Profile">
        <DetailRow label="Name" value={user?.name ?? "—"} />
        <DetailRow label="Email" value={user?.email ?? "—"} />
        <DetailRow label="Role" value={user?.role ?? "—"} />
      </SectionCard>

      {/* Stores */}
      <SectionCard title="My Stores">
        {stores.length === 0 ? (
          <Text style={{ fontSize: 13, color: "#78716C", paddingVertical: 8 }}>No stores assigned</Text>
        ) : (
          stores.map((s) => (
            <View key={s.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F1F0ED" }}>
              <Text style={{ fontSize: 13, color: "#1C1917" }}>{s.name}</Text>
            </View>
          ))
        )}
      </SectionCard>

      {/* Notification Preferences */}
      <SectionCard title="Push Notifications">
        <PrefToggle label="Incident Alerts" value={prefs.incident_alerts !== false} onToggle={(v) => togglePref("incident_alerts", v)} />
        <PrefToggle label="System Alerts" value={prefs.system_alerts !== false} onToggle={(v) => togglePref("system_alerts", v)} />
        <PrefToggle label="Edge Agent Alerts" value={prefs.edge_alerts ?? false} onToggle={(v) => togglePref("edge_alerts", v)} />
        <PrefToggle label="Daily Summary" value={prefs.daily_summary ?? false} onToggle={(v) => togglePref("daily_summary", v)} />
      </SectionCard>

      {/* Logout */}
      <TouchableOpacity
        onPress={logout}
        style={{ backgroundColor: "#DC2626", borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 16 }}
      >
        <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>Log Out</Text>
      </TouchableOpacity>

      <Text style={{ textAlign: "center", color: "#78716C", fontSize: 11, marginTop: 16 }}>FloorEye v2.0</Text>
    </ScrollView>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#E7E5E0", padding: 14, marginBottom: 12 }}>
      <Text style={{ fontSize: 14, fontWeight: "600", color: "#1C1917", marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, color: "#78716C" }}>{label}</Text>
      <Text style={{ fontSize: 13, color: "#1C1917" }}>{value}</Text>
    </View>
  );
}

function PrefToggle({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
      <Text style={{ fontSize: 13, color: "#1C1917" }}>{label}</Text>
      <Switch value={value} onValueChange={onToggle} trackColor={{ false: "#E7E5E0", true: "#0D9488" }} />
    </View>
  );
}
