import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ERROR, WARNING, INFO, NEUTRAL, SPACING, RADIUS, FONT_SIZE } from "@/constants/theme";

type BannerType = "error" | "warning" | "info";

interface Props {
  message: string;
  type?: BannerType;
  onRetry?: () => void;
  retryLabel?: string;
}

const BANNER_STYLES: Record<BannerType, { bg: string; text: string; button: string }> = {
  error: { bg: ERROR.bg, text: ERROR.text, button: ERROR.button },
  warning: { bg: WARNING.bg, text: WARNING.text, button: WARNING.text },
  info: { bg: INFO.bg, text: INFO.text, button: INFO.text },
};

export default function ErrorBanner({ message, type = "error", onRetry, retryLabel = "Retry" }: Props) {
  const colors = BANNER_STYLES[type];

  return (
    <View
      style={{
        backgroundColor: colors.bg,
        padding: SPACING.lg,
        borderRadius: RADIUS.md,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: SPACING.md,
      }}
      accessibilityRole="alert"
      accessibilityLabel={`${type}: ${message}`}
    >
      <Text
        style={{ color: colors.text, fontSize: FONT_SIZE.lg, flex: 1, marginRight: SPACING.sm }}
      >
        {message}
      </Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={{
            backgroundColor: colors.button,
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.xs,
            borderRadius: RADIUS.sm,
          }}
          accessibilityLabel={retryLabel}
          accessibilityRole="button"
        >
          <Text style={{ color: NEUTRAL.white, fontSize: FONT_SIZE.md, fontWeight: "600" }}>
            {retryLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
