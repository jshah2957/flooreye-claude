import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import api from "@/services/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import AlertCard from "@/components/alerts/AlertCard";
import ErrorBanner from "@/components/shared/ErrorBanner";
import EmptyState from "@/components/shared/EmptyState";
import {
  BRAND,
  SPACING,
  RADIUS,
  FONT_SIZE,
  NEUTRAL,
  INFO,
} from "@/constants/theme";
import { POLLING, API_LIMITS } from "@/constants/config";
import type { AlertItem, WSMessage, WSIncidentMessage } from "@/types";

type TabKey = "all" | "critical" | "system";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "system", label: "System" },
];

export default function AlertsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newAlertCount, setNewAlertCount] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const knownIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get("/mobile/alerts", {
        params: { limit: API_LIMITS.MAX_ALERTS_FETCH },
      });
      const data: AlertItem[] = res.data.data ?? [];

      if (isInitialLoadRef.current) {
        knownIdsRef.current = new Set(data.map((a) => a.id));
        isInitialLoadRef.current = false;
      } else {
        const incoming = new Set(data.map((a) => a.id));
        let count = 0;
        incoming.forEach((id) => {
          if (!knownIdsRef.current.has(id)) {
            count++;
          }
        });
        if (count > 0) {
          setNewAlertCount((prev) => prev + count);
        }
        knownIdsRef.current = incoming;
      }

      setAlerts(data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        "Failed to load alerts";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // WebSocket: subscribe to incident channel
  const handleWSMessage = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "incident_created" && activeTab === "all") {
        const wsData = msg.data as WSIncidentMessage;
        const newAlert: AlertItem = {
          id: wsData.id,
          severity: wsData.severity,
          status: wsData.status,
          max_confidence: wsData.max_confidence,
          detection_count: wsData.detection_count,
          start_time: wsData.start_time,
          camera_id: wsData.camera_id,
          store_id: wsData.store_id,
        };

        setAlerts((prev) => {
          // Avoid duplicates
          if (prev.some((a) => a.id === newAlert.id)) return prev;
          return [newAlert, ...prev];
        });

        knownIdsRef.current.add(newAlert.id);
        setNewAlertCount((prev) => prev + 1);
      }
    },
    [activeTab],
  );

  useWebSocket({
    channel: "/ws/incidents",
    onMessage: handleWSMessage,
  });

  // Initial fetch
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Polling when focused
  useEffect(() => {
    if (!isFocused) return;

    const interval = setInterval(fetchAlerts, POLLING.ALERT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isFocused, fetchAlerts]);

  // Reset new count on focus
  useEffect(() => {
    if (isFocused) {
      setNewAlertCount(0);
    }
  }, [isFocused]);

  const dismissNewBanner = () => {
    setNewAlertCount(0);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAlerts();
  }, [fetchAlerts]);

  // Filter alerts based on active tab
  const filteredAlerts = (() => {
    if (activeTab === "critical") {
      return alerts.filter(
        (a) => a.severity === "critical" || a.severity === "high",
      );
    }
    return alerts;
  })();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: BRAND.background,
        }}
        accessibilityLabel="Loading alerts"
      >
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BRAND.background }}>
      <Text
        style={{
          fontSize: FONT_SIZE.xxl,
          fontWeight: "600",
          color: BRAND.textPrimary,
          padding: SPACING.lg,
          paddingBottom: SPACING.sm,
        }}
        accessibilityRole="header"
      >
        Alerts
      </Text>

      {/* Segmented Control */}
      <View
        style={{
          flexDirection: "row",
          marginHorizontal: SPACING.lg,
          marginBottom: SPACING.sm,
          backgroundColor: NEUTRAL.surface,
          borderRadius: RADIUS.md,
          borderWidth: 1,
          borderColor: BRAND.border,
          overflow: "hidden",
        }}
        accessibilityRole="tablist"
        accessibilityLabel="Alert filter tabs"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                paddingVertical: SPACING.sm,
                alignItems: "center",
                backgroundColor: isActive ? BRAND.primary : "transparent",
                borderRadius: isActive ? RADIUS.md : 0,
              }}
              accessibilityLabel={`${tab.label} tab${isActive ? ", selected" : ""}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={{
                  fontSize: FONT_SIZE.lg,
                  fontWeight: isActive ? "600" : "400",
                  color: isActive ? NEUTRAL.white : BRAND.textSecondary,
                }}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* New alerts banner */}
      {newAlertCount > 0 && (
        <TouchableOpacity
          onPress={dismissNewBanner}
          style={{
            backgroundColor: INFO.bg,
            marginHorizontal: SPACING.lg,
            marginBottom: SPACING.sm,
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.md,
            borderRadius: RADIUS.md,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
          accessibilityLabel={`${newAlertCount} new alert${newAlertCount !== 1 ? "s" : ""} arrived. Tap to dismiss`}
          accessibilityRole="button"
        >
          <Text
            style={{
              fontSize: FONT_SIZE.lg,
              fontWeight: "600",
              color: INFO.text,
            }}
          >
            {newAlertCount} new alert{newAlertCount !== 1 ? "s" : ""} arrived
          </Text>
          <Text style={{ fontSize: FONT_SIZE.sm, color: INFO.text }}>
            Dismiss
          </Text>
        </TouchableOpacity>
      )}

      {/* Error banner */}
      {error && (
        <View style={{ marginHorizontal: SPACING.lg }}>
          <ErrorBanner
            message={error}
            onRetry={() => {
              setLoading(true);
              fetchAlerts();
            }}
          />
        </View>
      )}

      {/* System tab placeholder */}
      {activeTab === "system" ? (
        <EmptyState
          message="System alerts coming soon"
          icon="gear"
        />
      ) : (
        <FlatList
          data={filteredAlerts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: SPACING.lg,
            paddingTop: 0,
            gap: SPACING.sm,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={BRAND.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              message={
                activeTab === "critical"
                  ? "No critical or high severity alerts"
                  : "No alerts"
              }
            />
          }
          renderItem={({ item }) => (
            <AlertCard
              alert={item}
              onPress={(a) => router.push(`/incident/${a.id}`)}
            />
          )}
          accessibilityLabel="Alerts list"
        />
      )}
    </View>
  );
}
