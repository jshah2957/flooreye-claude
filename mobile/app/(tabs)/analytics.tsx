import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import api from "@/services/api";
import {
  BRAND,
  SPACING,
  RADIUS,
  FONT_SIZE,
  NEUTRAL,
  STAT_COLORS,
  CHART_COLORS,
} from "@/constants/theme";
import { RETENTION } from "@/constants/config";
import { AnalyticsData } from "@/types";
import ErrorBanner from "@/components/shared/ErrorBanner";

const PERIOD_OPTIONS = [7, 14, 30] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const HEATMAP_COLS = 24;

export default function AnalyticsScreen() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [heatmap, setHeatmap] = useState<number[][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(PERIOD_OPTIONS[0]);

  const fetchAnalytics = useCallback(() => {
    setError(null);
    if (!refreshing) setLoading(true);

    Promise.all([
      api.get("/mobile/analytics", { params: { days } }),
      api.get("/mobile/analytics/heatmap", { params: { days } }),
    ])
      .then(([analyticsRes, heatmapRes]) => {
        setData(analyticsRes.data.data);
        setHeatmap(heatmapRes.data.data);
      })
      .catch((err: any) => {
        const msg =
          err?.response?.data?.detail ??
          err?.message ??
          "Failed to load analytics";
        setError(msg);
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [days, refreshing]);

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Memoize max heatmap value
  const maxVal = useMemo(() => {
    if (!heatmap) return 1;
    let max = 0;
    for (const row of heatmap) {
      for (const v of row) {
        if (v > max) max = v;
      }
    }
    return Math.max(max, 1);
  }, [heatmap]);

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
        accessibilityLabel="Loading analytics"
      >
        <ActivityIndicator size="large" color={BRAND.primary} />
        <Text style={{ fontSize: 14, color: BRAND.textSecondary }}>
          Loading analytics...
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
          onRefresh={handleRefresh}
          tintColor={BRAND.primary}
        />
      }
    >
      <Text
        style={{
          fontSize: 20,
          fontWeight: "700",
          color: BRAND.textPrimary,
          marginBottom: 16,
        }}
        accessibilityRole="header"
        accessibilityLabel="Analytics"
      >
        Analytics
      </Text>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={handleRetry} />}

      {/* Period Selector */}
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          marginBottom: 20,
        }}
        accessibilityLabel="Select time period"
      >
        {PERIOD_OPTIONS.map((d) => (
          <TouchableOpacity
            key={d}
            onPress={() => setDays(d)}
            accessibilityRole="button"
            accessibilityLabel={`${d} days`}
            accessibilityState={{ selected: days === d }}
            style={{
              height: 40,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: days === d ? BRAND.primary : "#F3F4F6",
              borderRadius: 20,
              paddingHorizontal: 20,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: days === d ? NEUTRAL.white : "#78716C",
              }}
            >
              {d}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stat Cards — 2x2 Grid */}
      {data && (
        <View style={{ gap: 12, marginBottom: 20 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatCard
              label="Total Detections"
              value={data.total_detections}
              color={STAT_COLORS.detections}
            />
            <StatCard
              label="Wet Detections"
              value={data.wet_detections}
              color={STAT_COLORS.wetRate}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatCard
              label="Incidents"
              value={data.total_incidents}
              color={STAT_COLORS.incidents}
            />
            <StatCard
              label="Wet Rate"
              value={`${data.wet_rate.toFixed(1)}%`}
              color={STAT_COLORS.cameras}
            />
          </View>
        </View>
      )}

      {/* Heatmap */}
      {heatmap && (
        <View
          style={{
            backgroundColor: BRAND.surface,
            borderRadius: 12,
            padding: 16,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 3,
            elevation: 2,
          }}
          accessibilityLabel={`Detection heatmap for ${days} days`}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: BRAND.textPrimary,
              marginBottom: 8,
            }}
            accessibilityRole="header"
          >
            Detection Heatmap ({days}d)
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: BRAND.textSecondary,
              marginBottom: 10,
            }}
          >
            Hour (0-23) | Day (Mon-Sun)
          </Text>

          {DAY_LABELS.map((day, rowIdx) => (
            <View
              key={day}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 2,
              }}
              accessibilityLabel={`${day} row`}
            >
              <Text
                style={{
                  width: 30,
                  fontSize: 10,
                  color: BRAND.textSecondary,
                  fontWeight: "500",
                }}
              >
                {day}
              </Text>
              <View style={{ flexDirection: "row", flex: 1 }}>
                {(heatmap[rowIdx] ?? Array(HEATMAP_COLS).fill(0)).map(
                  (val, colIdx) => {
                    const intensity = val / maxVal;
                    const bg =
                      intensity === 0
                        ? CHART_COLORS.heatmapEmpty
                        : `rgba(220, 38, 38, ${Math.min(
                            intensity + 0.1,
                            1
                          )})`;
                    return (
                      <View
                        key={colIdx}
                        style={{
                          flex: 1,
                          minWidth: 10,
                          minHeight: 10,
                          backgroundColor: bg,
                          margin: 1,
                          borderRadius: 2,
                        }}
                        accessibilityLabel={`${day} hour ${colIdx}: ${val} detections`}
                      />
                    );
                  }
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: BRAND.surface,
        borderRadius: 16,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
      }}
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          color: "#78716C",
          fontWeight: "500",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 24,
          fontWeight: "700",
          color,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
