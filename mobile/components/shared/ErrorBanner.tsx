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
        padding: 14,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: SPACING.md,
        borderLeftWidth: type === "error" ? 4 : 0,
        borderLeftColor: type === "error" ? colors.text : undefined,
      }}
      accessibilityRole="alert"
      accessibilityLabel={`${type}: ${message}`}
    >
      <View style={{ flex: 1, marginRight: onRetry ? SPACING.md : 0 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 14,
            fontWeight: "500",
            lineHeight: 20,
          }}
        >
          {message}
        </Text>
      </View>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={{
            backgroundColor: colors.button,
            minHeight: 36,
            paddingHorizontal: 14,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 8,
          }}
          accessibilityLabel={retryLabel}
          accessibilityRole="button"
        >
          <Text style={{ color: NEUTRAL.white, fontSize: 13, fontWeight: "600" }}>
            {retryLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
