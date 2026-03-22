import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BRAND, NEUTRAL, SPACING, RADIUS, FONT_SIZE } from "@/constants/theme";

interface Props {
  message: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ message, icon, actionLabel, onAction }: Props) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 40,
        paddingHorizontal: SPACING.xxl,
      }}
      accessibilityLabel={message}
    >
      {icon && (
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: "#F3F4F6",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: SPACING.lg,
          }}
        >
          <Text style={{ fontSize: 28, opacity: 0.6 }}>{icon}</Text>
        </View>
      )}
      <Text
        style={{
          color: "#78716C",
          fontSize: 15,
          fontWeight: "500",
          textAlign: "center",
          lineHeight: 22,
          marginBottom: actionLabel ? SPACING.xl : 0,
        }}
      >
        {message}
      </Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          style={{
            backgroundColor: BRAND.primary,
            paddingHorizontal: SPACING.xxl,
            minHeight: 48,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 12,
          }}
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
        >
          <Text style={{ color: NEUTRAL.white, fontSize: 15, fontWeight: "600" }}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
