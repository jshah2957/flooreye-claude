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
  const [frameBase64, setFrameBase64] = useState<string | null>(null);
  const [frameLoading, setFrameLoading] = useState(false);

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

  // Fetch frame image separately (frames stored in S3, not inline)
  useEffect(() => {
    if (!detection?.id) return;
    setFrameLoading(true);
    api.get(`/mobile/detections/${detection.id}/frame`)
      .then(res => {
        const b64 = res.data?.data?.frame_base64;
        if (b64) setFrameBase64(b64);
      })
      .catch(() => {}) // Frame fetch failure is non-critical
      .finally(() => setFrameLoading(false));
  }, [detection?.id]);

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
          gap: 12,
        }}
      >
        <ActivityIndicator
          size="large"
          color={BRAND.primary}
          accessibilityLabel="Loading detection detail"
        />
        <Text style={{ fontSize: 14, color: BRAND.textSecondary }}>
          Loading detection...
        </Text>
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
          padding: 24,
        }}
      >
        <ErrorBanner message={error} onRetry={fetchDetection} />
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 16, minHeight: 48, justifyContent: "center" }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={{ color: BRAND.primary, fontSize: 15, fontWeight: "600" }}>
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
        <Text style={{ color: BRAND.danger, fontSize: 15 }}>
          Detection not found
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 16, minHeight: 48, justifyContent: "center" }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={{ color: BRAND.primary, fontSize: 15, fontWeight: "600" }}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const wetDryStyle = detection.is_wet ? DETECTION.wet : DETECTION.dry;
  const wetDryLabel = detection.is_wet ? "WET" : "DRY";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BRAND.background }}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginRight: 12,
            minHeight: 48,
            paddingHorizontal: 8,
            justifyContent: "center",
          }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 24, color: BRAND.primary, fontWeight: "300" }}>
            {"\u2190"}
          </Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: BRAND.textPrimary,
            }}
          >
            Detection Detail
          </Text>
          <Text style={{ fontSize: 12, color: BRAND.textSecondary, marginTop: 2 }}>
            {new Date(detection.timestamp).toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Badges row */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <View
          style={{
            backgroundColor: wetDryStyle.bg,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
          accessibilityLabel={`Detection result: ${wetDryLabel}`}
          accessibilityRole="text"
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
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
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: DETECTION.flagged.border,
            }}
            accessibilityLabel="Flagged for review"
            accessibilityRole="text"
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: DETECTION.flagged.text,
              }}
            >
              FLAGGED
            </Text>
          </View>
        )}
      </View>

      {/* Frame Image */}
      {frameBase64 ? (
        <View
          style={{
            backgroundColor: NEUTRAL.black,
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
            aspectRatio: MEDIA.FRAME_ASPECT_RATIO,
          }}
          accessibilityLabel="Detection frame image"
          accessibilityRole="image"
        >
          <Image
            source={{ uri: `data:image/jpeg;base64,${frameBase64}` }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </View>
      ) : frameLoading ? (
        <View
          style={{
            backgroundColor: "#E5E7EB",
            borderRadius: 12,
            marginBottom: 16,
            aspectRatio: MEDIA.FRAME_ASPECT_RATIO,
            justifyContent: "center",
            alignItems: "center",
          }}
          accessibilityLabel="Loading detection frame"
        >
          <ActivityIndicator size="small" color={BRAND.textSecondary} />
          <Text style={{ fontSize: 12, color: BRAND.textSecondary, marginTop: 8 }}>
            Loading frame...
          </Text>
        </View>
      ) : null}

      {/* Metrics Card */}
      <View
        style={{
          backgroundColor: BRAND.surface,
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
          elevation: 2,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            color: BRAND.textPrimary,
            marginBottom: 12,
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
        <MetricRow label="Camera" value={detection.camera_id.slice(0, 8)} last={!detection.incident_id} />
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
                alignItems: "center",
                minHeight: 44,
                paddingVertical: 10,
              }}
            >
              <Text
                style={{ fontSize: 13, color: "#78716C" }}
              >
                Incident
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
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
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 3,
            elevation: 2,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: BRAND.textPrimary,
              marginBottom: 12,
            }}
          >
            Predictions
          </Text>
          {detection.predictions.map((pred: Prediction, i: number) => (
            <View
              key={i}
              style={{
                paddingVertical: 10,
                borderBottomWidth:
                  i < detection.predictions.length - 1 ? 1 : 0,
                borderBottomColor: "#F3F4F6",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: BRAND.textPrimary,
                  }}
                >
                  {pred.class_name}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "500",
                    color: BRAND.textSecondary,
                  }}
                >
                  {(pred.confidence * 100).toFixed(1)}%
                </Text>
              </View>
              {/* Confidence bar */}
              <View
                style={{
                  height: 8,
                  backgroundColor: "#E5E7EB",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    width: `${Math.min(pred.confidence * 100, 100)}%`,
                    backgroundColor: BRAND.primary,
                    borderRadius: 4,
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 11,
                  color: BRAND.textSecondary,
                  marginTop: 4,
                }}
              >
                Area: {pred.area_percent.toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Flag / Unflag Button */}
      <View style={{ gap: 8, marginBottom: 32 }}>
        <TouchableOpacity
          onPress={handleFlag}
          disabled={flagLoading}
          style={{
            height: 52,
            backgroundColor: detection.is_flagged
              ? DETECTION.unflagged.bg
              : DETECTION.flagged.bg,
            borderRadius: 12,
            justifyContent: "center",
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
                fontSize: 16,
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
function MetricRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        minHeight: 44,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: "#F3F4F6",
      }}
    >
      <Text style={{ fontSize: 13, color: "#78716C" }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: BRAND.textPrimary,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
