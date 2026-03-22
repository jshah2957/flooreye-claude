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
        padding: SPACING.xxl,
      }}
      accessibilityLabel={message}
    >
      {icon && (
        <Text style={{ fontSize: 48, marginBottom: SPACING.lg }}>{icon}</Text>
      )}
      <Text
        style={{
          color: BRAND.textSecondary,
          fontSize: FONT_SIZE.xl,
          textAlign: "center",
          marginBottom: actionLabel ? SPACING.lg : 0,
        }}
      >
        {message}
      </Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          style={{
            backgroundColor: BRAND.primary,
            paddingHorizontal: SPACING.xl,
            paddingVertical: SPACING.sm,
            borderRadius: RADIUS.md,
          }}
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
        >
          <Text style={{ color: NEUTRAL.white, fontSize: FONT_SIZE.lg, fontWeight: "600" }}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
