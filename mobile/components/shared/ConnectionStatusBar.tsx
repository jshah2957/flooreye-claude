import React from "react";
import { View, Text } from "react-native";
import { BRAND, SPACING, FONT_SIZE, WARNING, NEUTRAL } from "@/constants/theme";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

interface Props {
  state: ConnectionState;
  systemAlertCount?: number;
}

const STATE_CONFIG: Record<ConnectionState, { color: string; label: string }> = {
  connected: { color: BRAND.success, label: "Connected" },
  connecting: { color: WARNING.text, label: "Reconnecting..." },
  disconnected: { color: BRAND.danger, label: "Offline" },
  error: { color: BRAND.danger, label: "Connection Error" },
};

export default function ConnectionStatusBar({ state, systemAlertCount = 0 }: Props) {
  if (state === "connected" && systemAlertCount === 0) return null;

  const config = STATE_CONFIG[state];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: config.color,
        height: 36,
        paddingHorizontal: SPACING.lg,
        gap: SPACING.sm,
      }}
      accessibilityRole="alert"
      accessibilityLabel={`Connection status: ${config.label}${
        systemAlertCount > 0 ? `, ${systemAlertCount} system alerts` : ""
      }`}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: NEUTRAL.white,
          opacity: 0.9,
        }}
      />
      <Text style={{ color: NEUTRAL.white, fontSize: 12, fontWeight: "500" }}>
        {config.label}
        {systemAlertCount > 0 && state === "connected"
          ? ` \u2022 ${systemAlertCount} system alert${systemAlertCount > 1 ? "s" : ""}`
          : ""}
      </Text>
    </View>
  );
}
