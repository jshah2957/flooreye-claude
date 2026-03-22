import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Alert as RNAlert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import api from "@/services/api";
import ErrorBanner from "@/components/shared/ErrorBanner";
import { DetectionDetail, Prediction } from "@/types";
import {
  BRAND,
  DETECTION,
  ACTIONS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  NEUTRAL,
} from "@/constants/theme";
import { MEDIA } from "@/constants/config";

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [detection, setDetection] = useState<DetectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flagLoading, setFlagLoading] = useState(false);

  const fetchDetection = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api
      .get(`/detection/history/${id}`)
      .then((res) => setDetection(res.data.data))
      .catch((err: any) => {
        const msg =
          err?.response?.data?.detail ??
          err?.message ??
          "Failed to load detection detail";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchDetection();
  }, [fetchDetection]);

  const handleFlag = async () => {
    if (!detection) return;
    setFlagLoading(true);
    try {
      const res = await api.post(`/detection/history/${detection.id}/flag`);
      const flagged = res.data.data?.is_flagged ?? !detection.is_flagged;
      setDetection((prev) => (prev ? { ...prev, is_flagged: flagged } : null));
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ?? "Failed to flag detection";
      RNAlert.alert("Error", msg);
    } finally {
      setFlagLoading(false);
    }
  };

  // --- Loading state ---
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: BRAND.background,
        }}
      >
        <ActivityIndicator
          size="large"
          color={BRAND.primary}
          accessibilityLabel="Loading detection detail"
        />
      </View>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: BRAND.background,
          padding: SPACING.xxl,
        }}
      >
        <ErrorBanner message={error} onRetry={fetchDetection} />
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: SPACING.md }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={{ color: BRAND.primary, fontSize: FONT_SIZE.lg }}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Not found state ---
  if (!detection) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: BRAND.background,
        }}
      >
        <Text style={{ color: BRAND.danger, fontSize: FONT_SIZE.lg }}>
          Detection not found
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: SPACING.lg }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={{ color: BRAND.primary, fontSize: FONT_SIZE.lg }}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const wetDryStyle = detection.is_wet ? DETECTION.wet : DETECTION.dry;
  const wetDryLabel = detection.is_wet ? "WET" : "DRY";
  const flaggedStyle = detection.is_flagged ? DETECTION.flagged : DETECTION.unflagged;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BRAND.background }}
      contentContainerStyle={{ padding: SPACING.lg }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: SPACING.lg,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: SPACING.md }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={{ fontSize: FONT_SIZE.h1, color: BRAND.primary }}>
            {"\u2190"}
          </Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: FONT_SIZE.xl,
              fontWeight: "600",
              color: BRAND.textPrimary,
            }}
          >
            Detection Detail
          </Text>
          <Text style={{ fontSize: FONT_SIZE.sm, color: BRAND.textSecondary }}>
            {new Date(detection.timestamp).toLocaleString()}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: SPACING.sm }}>
          <View
            style={{
              backgroundColor: wetDryStyle.bg,
              borderRadius: RADIUS.full,
              paddingHorizontal: SPACING.md,
              paddingVertical: SPACING.xs,
            }}
            accessibilityLabel={`Detection result: ${wetDryLabel}`}
            accessibilityRole="text"
          >
            <Text
              style={{
                fontSize: FONT_SIZE.sm,
                fontWeight: "700",
                color: wetDryStyle.text,
              }}
            >
              {wetDryLabel}
            </Text>
          </View>
          {detection.is_flagged && (
            <View
              style={{
                backgroundColor: DETECTION.flagged.bg,
                borderRadius: RADIUS.full,
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.xs,
                borderWidth: 1,
                borderColor: DETECTION.flagged.border,
              }}
              accessibilityLabel="Flagged for review"
              accessibilityRole="text"
            >
              <Text
                style={{
                  fontSize: FONT_SIZE.sm,
                  fontWeight: "700",
                  color: DETECTION.flagged.text,
                }}
              >
                FLAGGED
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Frame Image */}
      {detection.frame_base64 && (
        <View
          style={{
            backgroundColor: NEUTRAL.black,
            borderRadius: RADIUS.md,
            overflow: "hidden",
            marginBottom: SPACING.lg,
            aspectRatio: MEDIA.FRAME_ASPECT_RATIO,
          }}
          accessibilityLabel="Detection frame image"
          accessibilityRole="image"
        >
          <Image
            source={{ uri: `data:image/jpeg;base64,${detection.frame_base64}` }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Metrics Card */}
      <View
        style={{
          backgroundColor: BRAND.surface,
          borderRadius: RADIUS.md,
          borderWidth: 1,
          borderColor: BRAND.border,
          padding: SPACING.lg,
          marginBottom: SPACING.lg,
        }}
      >
        <Text
          style={{
            fontSize: FONT_SIZE.lg,
            fontWeight: "600",
            color: BRAND.textPrimary,
            marginBottom: SPACING.md,
          }}
        >
          Detection Metrics
        </Text>
        <MetricRow
          label="Confidence"
          value={`${(detection.confidence * 100).toFixed(1)}%`}
        />
        <MetricRow
          label="Wet Area"
          value={`${detection.wet_area_percent.toFixed(1)}%`}
        />
        <MetricRow
          label="Inference Time"
          value={`${detection.inference_time_ms}ms`}
        />
        <MetricRow label="Model Source" value={detection.model_source} />
        <MetricRow label="Camera" value={detection.camera_id.slice(0, 8)} />
        {detection.incident_id && (
          <TouchableOpacity
            onPress={() => router.push(`/incident/${detection.incident_id}`)}
            accessibilityLabel="View linked incident"
            accessibilityRole="link"
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingVertical: SPACING.xs,
              }}
            >
              <Text
                style={{ fontSize: FONT_SIZE.md, color: BRAND.textSecondary }}
              >
                Incident
              </Text>
              <Text
                style={{
                  fontSize: FONT_SIZE.md,
                  fontWeight: "500",
                  color: BRAND.primary,
                  textDecorationLine: "underline",
                }}
              >
                {detection.incident_id.slice(0, 8)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Predictions */}
      {detection.predictions.length > 0 && (
        <View
          style={{
            backgroundColor: BRAND.surface,
            borderRadius: RADIUS.md,
            borderWidth: 1,
            borderColor: BRAND.border,
            padding: SPACING.lg,
            marginBottom: SPACING.lg,
          }}
        >
          <Text
            style={{
              fontSize: FONT_SIZE.lg,
              fontWeight: "600",
              color: BRAND.textPrimary,
              marginBottom: SPACING.md,
            }}
          >
            Predictions
          </Text>
          {detection.predictions.map((pred: Prediction, i: number) => (
            <View
              key={i}
              style={{
                paddingVertical: SPACING.sm,
                borderBottomWidth:
                  i < detection.predictions.length - 1 ? 1 : 0,
                borderBottomColor: NEUTRAL.divider,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: SPACING.xs,
                }}
              >
                <Text
                  style={{
                    fontSize: FONT_SIZE.md,
                    fontWeight: "500",
                    color: BRAND.textPrimary,
                  }}
                >
                  {pred.class_name}
                </Text>
                <Text
                  style={{
                    fontSize: FONT_SIZE.md,
                    color: BRAND.textSecondary,
                  }}
                >
                  {(pred.confidence * 100).toFixed(1)}%
                </Text>
              </View>
              {/* Confidence bar */}
              <View
                style={{
                  height: SPACING.sm,
                  backgroundColor: NEUTRAL.surface,
                  borderRadius: RADIUS.sm,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    width: `${Math.min(pred.confidence * 100, 100)}%`,
                    backgroundColor: BRAND.primary,
                    borderRadius: RADIUS.sm,
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: FONT_SIZE.xs,
                  color: BRAND.textSecondary,
                  marginTop: SPACING.xs,
                }}
              >
                Area: {pred.area_percent.toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Flag / Unflag Button */}
      <View style={{ gap: SPACING.md, marginBottom: SPACING.xxl }}>
        <TouchableOpacity
          onPress={handleFlag}
          disabled={flagLoading}
          style={{
            backgroundColor: detection.is_flagged
              ? DETECTION.unflagged.bg
              : DETECTION.flagged.bg,
            borderRadius: RADIUS.md,
            paddingVertical: SPACING.lg,
            alignItems: "center",
            borderWidth: 1,
            borderColor: detection.is_flagged
              ? BRAND.border
              : DETECTION.flagged.border,
            opacity: flagLoading ? 0.6 : 1,
          }}
          accessibilityLabel={
            detection.is_flagged ? "Unflag detection" : "Flag detection for review"
          }
          accessibilityRole="button"
        >
          {flagLoading ? (
            <ActivityIndicator color={ACTIONS.flag} size="small" />
          ) : (
            <Text
              style={{
                color: detection.is_flagged
                  ? DETECTION.unflagged.text
                  : ACTIONS.flag,
                fontSize: FONT_SIZE.xl,
                fontWeight: "600",
              }}
            >
              {detection.is_flagged ? "Unflag Detection" : "Flag for Review"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

/** Reusable metric row for the metrics card */
function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: SPACING.xs,
      }}
    >
      <Text style={{ fontSize: FONT_SIZE.md, color: BRAND.textSecondary }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: FONT_SIZE.md,
          fontWeight: "500",
          color: BRAND.textPrimary,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
