import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useAuth } from "@/hooks/useAuth";
import api from "@/services/api";
import {
  BRAND,
  SPACING,
  RADIUS,
  FONT_SIZE,
  NEUTRAL,
  WARNING,
  ACTIONS,
} from "@/constants/theme";
import { APP } from "@/constants/config";
import type { StoreInfo, NotificationPrefs } from "@/types";
import ErrorBanner from "@/components/shared/ErrorBanner";
import EmptyState from "@/components/shared/EmptyState";

const PASSWORD_MIN_LENGTH = 8;

function validatePassword(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (!/[A-Z]/.test(pw)) return "Must contain an uppercase letter";
  if (!/[a-z]/.test(pw)) return "Must contain a lowercase letter";
  if (!/[0-9]/.test(pw)) return "Must contain a digit";
  return null;
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    incident_alerts: true,
    system_alerts: true,
    edge_alerts: false,
    daily_summary: false,
  });
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [prefsRes, storesRes] = await Promise.all([
        api.get("/mobile/profile/notification-prefs"),
        api.get("/mobile/stores"),
      ]);
      setPrefs(prefsRes.data.data ?? {});
      setStores(storesRes.data.data ?? []);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        "Failed to load settings";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const togglePref = async (key: keyof NotificationPrefs, value: boolean) => {
    const previous = { ...prefs };
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSaveError(null);
    try {
      await api.put("/mobile/profile/notification-prefs", updated);
    } catch (err: any) {
      setPrefs(previous);
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        "Failed to save preference";
      setSaveError(msg);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!currentPassword) {
      setPasswordError("Current password is required");
      return;
    }

    const validationErr = validatePassword(newPassword);
    if (validationErr) {
      setPasswordError(validationErr);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setPasswordSaving(true);
    try {
      await api.put("/auth/me", {
        password: newPassword,
        current_password: currentPassword,
      });
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        "Failed to change password";
      setPasswordError(msg);
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: logout },
      ],
      { cancelable: true },
    );
  };

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
        accessibilityLabel="Loading settings"
      >
        <ActivityIndicator size="large" color={BRAND.primary} />
        <Text style={{ fontSize: 14, color: BRAND.textSecondary }}>
          Loading settings...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BRAND.background }}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={BRAND.primary}
        />
      }
      accessibilityLabel="Settings screen"
    >
      <Text
        style={{
          fontSize: 20,
          fontWeight: "700",
          color: BRAND.textPrimary,
          marginBottom: 20,
        }}
        accessibilityRole="header"
      >
        Settings
      </Text>

      {error && (
        <ErrorBanner
          message={error}
          onRetry={() => {
            setLoading(true);
            fetchData();
          }}
        />
      )}

      {saveError && (
        <ErrorBanner message={saveError} type="warning" />
      )}

      {passwordSuccess && (
        <ErrorBanner message="Password changed successfully" type="info" />
      )}

      {/* Profile Section */}
      <SectionCard title="Profile">
        <DetailRow label="Name" value={user?.name ?? "\u2014"} />
        <DetailRow label="Email" value={user?.email ?? "\u2014"} />
        <DetailRow label="Role" value={user?.role ?? "\u2014"} last />

        {!showPasswordForm ? (
          <TouchableOpacity
            onPress={() => {
              setShowPasswordForm(true);
              setPasswordError(null);
              setPasswordSuccess(false);
            }}
            style={{
              marginTop: 16,
              height: 48,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: BRAND.primary,
              borderRadius: 12,
            }}
            accessibilityLabel="Change password"
            accessibilityRole="button"
          >
            <Text
              style={{
                color: NEUTRAL.white,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              Change Password
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ marginTop: 16 }}>
            {passwordError && (
              <ErrorBanner message={passwordError} type="warning" />
            )}

            <TextInput
              placeholder="Current password"
              placeholderTextColor={BRAND.textSecondary}
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              style={{
                height: 48,
                borderWidth: 1,
                borderColor: BRAND.border,
                borderRadius: 12,
                paddingHorizontal: 14,
                fontSize: 15,
                color: BRAND.textPrimary,
                backgroundColor: NEUTRAL.white,
                marginBottom: 10,
              }}
              accessibilityLabel="Current password"
            />
            <TextInput
              placeholder="New password"
              placeholderTextColor={BRAND.textSecondary}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              style={{
                height: 48,
                borderWidth: 1,
                borderColor: BRAND.border,
                borderRadius: 12,
                paddingHorizontal: 14,
                fontSize: 15,
                color: BRAND.textPrimary,
                backgroundColor: NEUTRAL.white,
                marginBottom: 10,
              }}
              accessibilityLabel="New password"
            />
            <TextInput
              placeholder="Confirm new password"
              placeholderTextColor={BRAND.textSecondary}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={{
                height: 48,
                borderWidth: 1,
                borderColor: BRAND.border,
                borderRadius: 12,
                paddingHorizontal: 14,
                fontSize: 15,
                color: BRAND.textPrimary,
                backgroundColor: NEUTRAL.white,
                marginBottom: 14,
              }}
              accessibilityLabel="Confirm new password"
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={handleChangePassword}
                disabled={passwordSaving}
                style={{
                  flex: 1,
                  height: 48,
                  backgroundColor: BRAND.primary,
                  borderRadius: 12,
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: passwordSaving ? 0.6 : 1,
                }}
                accessibilityLabel="Save new password"
                accessibilityRole="button"
              >
                {passwordSaving ? (
                  <ActivityIndicator size="small" color={NEUTRAL.white} />
                ) : (
                  <Text
                    style={{
                      color: NEUTRAL.white,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    Save
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowPasswordForm(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setPasswordError(null);
                }}
                style={{
                  flex: 1,
                  height: 48,
                  backgroundColor: NEUTRAL.white,
                  borderRadius: 12,
                  justifyContent: "center",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: BRAND.border,
                }}
                accessibilityLabel="Cancel password change"
                accessibilityRole="button"
              >
                <Text
                  style={{
                    color: BRAND.textPrimary,
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SectionCard>

      {/* My Stores Section */}
      <SectionCard title="My Stores">
        {stores.length === 0 ? (
          <EmptyState message="No stores assigned" />
        ) : (
          stores.map((s, i) => (
            <View
              key={s.id}
              style={{
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: "#E7E5E0",
                marginBottom: i < stores.length - 1 ? 8 : 0,
                backgroundColor: "#FAFAF9",
              }}
              accessibilityLabel={`Store: ${s.name}`}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: BRAND.textPrimary }}>
                {s.name}
              </Text>
              {s.city && (
                <Text style={{ fontSize: 13, color: BRAND.textSecondary, marginTop: 2 }}>
                  {s.city}{s.state ? `, ${s.state}` : ""}
                </Text>
              )}
            </View>
          ))
        )}
      </SectionCard>

      {/* Notification Preferences */}
      <SectionCard title="Notification Preferences">
        <PrefToggle
          label="Incident Alerts"
          description="Get notified about new incidents"
          value={prefs.incident_alerts !== false}
          onToggle={(v) => togglePref("incident_alerts", v)}
        />
        <PrefToggle
          label="System Alerts"
          description="Camera offline, edge agent issues"
          value={prefs.system_alerts !== false}
          onToggle={(v) => togglePref("system_alerts", v)}
        />
        <PrefToggle
          label="Edge Agent Alerts"
          description="Agent connectivity warnings"
          value={prefs.edge_alerts ?? false}
          onToggle={(v) => togglePref("edge_alerts", v)}
        />
        <PrefToggle
          label="Daily Summary"
          description="Daily detection summary email"
          value={prefs.daily_summary ?? false}
          onToggle={(v) => togglePref("daily_summary", v)}
          last
        />
      </SectionCard>

      {/* Logout */}
      <TouchableOpacity
        onPress={handleLogout}
        style={{
          height: 52,
          backgroundColor: "#DC2626",
          borderRadius: 12,
          justifyContent: "center",
          alignItems: "center",
          marginTop: 8,
        }}
        accessibilityLabel="Log out"
        accessibilityRole="button"
      >
        <Text
          style={{
            color: NEUTRAL.white,
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          Log Out
        </Text>
      </TouchableOpacity>

      <Text
        style={{
          textAlign: "center",
          color: "#A3A3A3",
          fontSize: 12,
          marginTop: 24,
          marginBottom: 32,
        }}
        accessibilityLabel={`App version ${APP.VERSION}`}
      >
        {APP.NAME} v{APP.VERSION}
      </Text>
    </ScrollView>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: BRAND.surface,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
      }}
      accessibilityLabel={`${title} section`}
    >
      <Text
        style={{
          fontSize: 17,
          fontWeight: "700",
          color: BRAND.textPrimary,
          marginBottom: 16,
        }}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        minHeight: 48,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: "#F3F4F6",
      }}
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={{ fontSize: 14, color: "#78716C" }}>
        {label}
      </Text>
      <Text style={{ fontSize: 14, fontWeight: "500", color: "#1C1917" }}>
        {value}
      </Text>
    </View>
  );
}

function PrefToggle({
  label,
  description,
  value,
  onToggle,
  last,
}: {
  label: string;
  description?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        minHeight: 52,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: "#F3F4F6",
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "500", color: BRAND.textPrimary }}>
          {label}
        </Text>
        {description && (
          <Text style={{ fontSize: 12, color: BRAND.textSecondary, marginTop: 2 }}>
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: BRAND.border, true: BRAND.primary }}
        accessibilityLabel={`${label} toggle, currently ${value ? "on" : "off"}`}
        accessibilityRole="switch"
      />
    </View>
  );
}
