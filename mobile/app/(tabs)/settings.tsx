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
        }}
        accessibilityLabel="Loading settings"
      >
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BRAND.background }}
      contentContainerStyle={{ padding: SPACING.lg }}
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
          fontSize: FONT_SIZE.xxl,
          fontWeight: "600",
          color: BRAND.textPrimary,
          marginBottom: SPACING.lg,
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
        <DetailRow label="Role" value={user?.role ?? "\u2014"} />

        {!showPasswordForm ? (
          <TouchableOpacity
            onPress={() => {
              setShowPasswordForm(true);
              setPasswordError(null);
              setPasswordSuccess(false);
            }}
            style={{
              marginTop: SPACING.md,
              paddingVertical: SPACING.sm,
              paddingHorizontal: SPACING.md,
              backgroundColor: BRAND.primary,
              borderRadius: RADIUS.md,
              alignSelf: "flex-start",
            }}
            accessibilityLabel="Change password"
            accessibilityRole="button"
          >
            <Text
              style={{
                color: NEUTRAL.white,
                fontSize: FONT_SIZE.md,
                fontWeight: "600",
              }}
            >
              Change Password
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ marginTop: SPACING.md }}>
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
                borderWidth: 1,
                borderColor: BRAND.border,
                borderRadius: RADIUS.md,
                padding: SPACING.md,
                fontSize: FONT_SIZE.lg,
                color: BRAND.textPrimary,
                backgroundColor: NEUTRAL.white,
                marginBottom: SPACING.sm,
              }}
              accessibilityLabel="Current password"
              accessibilityRole="none"
            />
            <TextInput
              placeholder="New password"
              placeholderTextColor={BRAND.textSecondary}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              style={{
                borderWidth: 1,
                borderColor: BRAND.border,
                borderRadius: RADIUS.md,
                padding: SPACING.md,
                fontSize: FONT_SIZE.lg,
                color: BRAND.textPrimary,
                backgroundColor: NEUTRAL.white,
                marginBottom: SPACING.sm,
              }}
              accessibilityLabel="New password"
              accessibilityRole="none"
            />
            <TextInput
              placeholder="Confirm new password"
              placeholderTextColor={BRAND.textSecondary}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={{
                borderWidth: 1,
                borderColor: BRAND.border,
                borderRadius: RADIUS.md,
                padding: SPACING.md,
                fontSize: FONT_SIZE.lg,
                color: BRAND.textPrimary,
                backgroundColor: NEUTRAL.white,
                marginBottom: SPACING.md,
              }}
              accessibilityLabel="Confirm new password"
              accessibilityRole="none"
            />
            <View style={{ flexDirection: "row", gap: SPACING.sm }}>
              <TouchableOpacity
                onPress={handleChangePassword}
                disabled={passwordSaving}
                style={{
                  flex: 1,
                  backgroundColor: BRAND.primary,
                  borderRadius: RADIUS.md,
                  paddingVertical: SPACING.md,
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
                      fontSize: FONT_SIZE.lg,
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
                  backgroundColor: NEUTRAL.surface,
                  borderRadius: RADIUS.md,
                  paddingVertical: SPACING.md,
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
                    fontSize: FONT_SIZE.lg,
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
          stores.map((s) => (
            <View
              key={s.id}
              style={{
                paddingVertical: SPACING.sm,
                borderBottomWidth: 1,
                borderBottomColor: NEUTRAL.divider,
              }}
              accessibilityLabel={`Store: ${s.name}`}
            >
              <Text style={{ fontSize: FONT_SIZE.lg, color: BRAND.textPrimary }}>
                {s.name}
              </Text>
              {s.city && (
                <Text style={{ fontSize: FONT_SIZE.md, color: BRAND.textSecondary }}>
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
          value={prefs.incident_alerts !== false}
          onToggle={(v) => togglePref("incident_alerts", v)}
        />
        <PrefToggle
          label="System Alerts"
          value={prefs.system_alerts !== false}
          onToggle={(v) => togglePref("system_alerts", v)}
        />
        <PrefToggle
          label="Edge Agent Alerts"
          value={prefs.edge_alerts ?? false}
          onToggle={(v) => togglePref("edge_alerts", v)}
        />
        <PrefToggle
          label="Daily Summary"
          value={prefs.daily_summary ?? false}
          onToggle={(v) => togglePref("daily_summary", v)}
        />
      </SectionCard>

      {/* Logout */}
      <TouchableOpacity
        onPress={handleLogout}
        style={{
          backgroundColor: ACTIONS.danger,
          borderRadius: RADIUS.md,
          paddingVertical: SPACING.lg,
          alignItems: "center",
          marginTop: SPACING.lg,
        }}
        accessibilityLabel="Log out"
        accessibilityRole="button"
      >
        <Text
          style={{
            color: NEUTRAL.white,
            fontSize: FONT_SIZE.xl,
            fontWeight: "600",
          }}
        >
          Log Out
        </Text>
      </TouchableOpacity>

      <Text
        style={{
          textAlign: "center",
          color: BRAND.textSecondary,
          fontSize: FONT_SIZE.sm,
          marginTop: SPACING.lg,
          marginBottom: SPACING.xxl,
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
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: BRAND.border,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
      }}
      accessibilityLabel={`${title} section`}
    >
      <Text
        style={{
          fontSize: FONT_SIZE.lg,
          fontWeight: "600",
          color: BRAND.textPrimary,
          marginBottom: SPACING.sm,
        }}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: SPACING.xs,
      }}
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={{ fontSize: FONT_SIZE.lg, color: BRAND.textSecondary }}>
        {label}
      </Text>
      <Text style={{ fontSize: FONT_SIZE.lg, color: BRAND.textPrimary }}>
        {value}
      </Text>
    </View>
  );
}

function PrefToggle({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: SPACING.sm,
      }}
    >
      <Text style={{ fontSize: FONT_SIZE.lg, color: BRAND.textPrimary }}>
        {label}
      </Text>
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
