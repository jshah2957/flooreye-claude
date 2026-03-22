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
        }}
        accessibilityLabel="Loading analytics"
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
          onRefresh={handleRefresh}
          tintColor={BRAND.primary}
        />
      }
    >
      <Text
        style={{
          fontSize: FONT_SIZE.xxl,
          fontWeight: "600",
          color: BRAND.textPrimary,
          marginBottom: SPACING.md,
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
          gap: SPACING.sm,
          marginBottom: SPACING.lg,
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
              backgroundColor: days === d ? BRAND.primary : BRAND.surface,
              borderRadius: RADIUS.full,
              paddingHorizontal: SPACING.lg,
              paddingVertical: SPACING.xs + 2,
              borderWidth: 1,
              borderColor: days === d ? BRAND.primary : BRAND.border,
            }}
          >
            <Text
              style={{
                fontSize: FONT_SIZE.md,
                fontWeight: "600",
                color: days === d ? NEUTRAL.white : BRAND.textPrimary,
              }}
            >
              {d}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stat Cards */}
      {data && (
        <View style={{ gap: SPACING.sm, marginBottom: SPACING.lg }}>
          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
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
          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
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
            borderRadius: RADIUS.md,
            borderWidth: 1,
            borderColor: BRAND.border,
            padding: SPACING.md,
          }}
          accessibilityLabel={`Detection heatmap for ${days} days`}
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
            Detection Heatmap ({days}d)
          </Text>
          <Text
            style={{
              fontSize: FONT_SIZE.xs,
              color: BRAND.textSecondary,
              marginBottom: SPACING.sm,
            }}
          >
            Hour → (0-23) | Day ↓ (Mon-Sun)
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
                  width: 28,
                  fontSize: FONT_SIZE.xs - 1,
                  color: BRAND.textSecondary,
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
                          height: SPACING.md,
                          backgroundColor: bg,
                          marginRight: 1,
                          borderRadius: 1,
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
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: BRAND.border,
        padding: SPACING.md,
      }}
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="summary" as any
    >
      <Text
        style={{
          fontSize: FONT_SIZE.sm,
          color: BRAND.textSecondary,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: FONT_SIZE.h2,
          fontWeight: "700",
          color,
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
