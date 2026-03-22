import { View, Text, TouchableOpacity } from "react-native";
import {
  BRAND,
  SEVERITY_COLORS,
  SEVERITY_BG_COLORS,
  STATUS_COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
} from "@/constants/theme";
import type { AlertItem } from "@/types";

interface AlertCardProps {
  alert: AlertItem;
  onPress: (alert: AlertItem) => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AlertCard({ alert, onPress }: AlertCardProps) {
  const barColor = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.medium;
  const badgeBg = SEVERITY_BG_COLORS[alert.severity] ?? SEVERITY_BG_COLORS.medium;
  const badgeText = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.medium;
  const statusStyle = STATUS_COLORS[alert.status] ?? STATUS_COLORS.new;

  return (
    <TouchableOpacity
      onPress={() => onPress(alert)}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        backgroundColor: BRAND.surface,
        borderRadius: 12,
        overflow: "hidden",
        minHeight: 80,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
      }}
      accessibilityLabel={`${alert.severity} severity alert, ${alert.status}, ${alert.detection_count} detections, ${(alert.max_confidence * 100).toFixed(1)}% confidence`}
      accessibilityRole="button"
    >
      {/* Severity color bar */}
      <View style={{ width: 4, backgroundColor: barColor, borderRadius: 2 }} />

      <View style={{ flex: 1, padding: 14 }}>
        {/* Top row: severity + status badges + time */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <View
              style={{
                backgroundColor: badgeBg,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: badgeText,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                {alert.severity}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: statusStyle.bg,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: statusStyle.text,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                {alert.status}
              </Text>
            </View>
          </View>

          {/* Time ago */}
          <Text style={{ fontSize: 12, color: BRAND.textSecondary }}>
            {timeAgo(alert.start_time)}
          </Text>
        </View>

        {/* Store / Camera name row */}
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: BRAND.textPrimary,
            marginTop: 8,
          }}
          numberOfLines={1}
        >
          {alert.store_name ?? `Store ${alert.store_id.slice(0, 6)}`}
          {" \u00B7 "}
          {alert.camera_name ?? `Cam ${alert.camera_id.slice(0, 6)}`}
        </Text>

        {/* Metrics row */}
        <View
          style={{
            flexDirection: "row",
            gap: SPACING.md,
            marginTop: 4,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 12, color: BRAND.textSecondary }}>
            {(alert.max_confidence * 100).toFixed(1)}% confidence
          </Text>
          <Text style={{ fontSize: 12, color: BRAND.textSecondary }}>
            {alert.detection_count} detection{alert.detection_count !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
