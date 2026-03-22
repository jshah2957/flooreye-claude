import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert as RNAlert,
  TextInput,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import api from "@/services/api";
import ErrorBanner from "@/components/shared/ErrorBanner";
import { IncidentDetail, DetectionListItem } from "@/types";
import {
  BRAND,
  SEVERITY_COLORS,
  SEVERITY_BG_COLORS,
  STATUS_COLORS,
  DETECTION,
  ACTIONS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  NEUTRAL,
} from "@/constants/theme";
import { MEDIA } from "@/constants/config";

/** Format a duration between two timestamps as "Xh Ym" or "ongoing" */
function formatDuration(start: string, end?: string | null): string {
  const startMs = new Date(start).getTime();
  if (!end) {
    const diffMs = Date.now() - startMs;
    const minutes = Math.round(diffMs / 60_000);
    if (minutes < 60) return `${minutes}m (ongoing)`;
    const hours = Math.floor(minutes / 60);
    const remainMins = minutes % 60;
    return `${hours}h ${remainMins}m (ongoing)`;
  }
  const diffMs = new Date(end).getTime() - startMs;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMins = minutes % 60;
  return `${hours}h ${remainMins}m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export default function IncidentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [frameBase64, setFrameBase64] = useState<string | null>(null);
  const [detectionTimeline, setDetectionTimeline] = useState<DetectionListItem[]>([]);
  const [latestDetectionId, setLatestDetectionId] = useState<string | null>(null);
  const [latestDetectionFlagged, setLatestDetectionFlagged] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [flagLoading, setFlagLoading] = useState(false);

  // Notes modal state
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notes, setNotes] = useState("");
  const [pendingAction, setPendingAction] = useState<"resolved" | "false_positive" | null>(null);

  // --- Fetch incident ---
  const fetchIncident = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api
      .get(`/mobile/incidents/${id}`)
      .then(async (res) => {
        const data: IncidentDetail = res.data.data;
        setIncident(data);
        await Promise.all([
          fetchDetectionTimeline(data.id),
          fetchLatestDetectionFrame(data.id),
        ]);
      })
      .catch((err: any) => {
        const msg =
          err?.response?.data?.detail ??
          err?.message ??
          "Failed to load incident";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const fetchDetectionTimeline = async (incidentId: string) => {
    try {
      const res = await api.get("/detection/history", {
        params: { incident_id: incidentId, limit: 50 },
      });
      const detections: DetectionListItem[] = res.data.data ?? [];
      setDetectionTimeline(detections);

      if (detections.length > 0) {
        setLatestDetectionId(detections[0].id);
        setLatestDetectionFlagged(detections[0].is_flagged ?? false);
      }
    } catch {
      // timeline fetch failed silently
    }
  };

  const fetchLatestDetectionFrame = async (incidentId: string) => {
    try {
      // Get the latest detection ID first
      const res = await api.get("/detection/history", {
        params: { incident_id: incidentId, limit: 1 },
      });
      const detections = res.data.data ?? [];
      if (detections.length > 0) {
        const latestDetId = detections[0].id;
        try {
          const frameRes = await api.get(`/mobile/detections/${latestDetId}/frame`);
          const base64 = frameRes.data.data?.frame_base64;
          if (base64) setFrameBase64(base64);
        } catch {
          // no frame available
        }
      }
    } catch {
      // detection fetch failed silently
    }
  };

  useEffect(() => {
    fetchIncident();
  }, [fetchIncident]);

  // --- Actions ---
  const handleAcknowledge = async () => {
    if (!incident) return;
    setActionLoading("acknowledge");
    try {
      await api.put(`/mobile/alerts/${incident.id}/acknowledge`);
      setIncident((prev) =>
        prev ? { ...prev, status: "acknowledged" } : null
      );
      RNAlert.alert("Success", "Incident acknowledged.");
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ?? "Failed to acknowledge incident";
      RNAlert.alert("Error", msg);
    } finally {
      setActionLoading(null);
    }
  };

  const initiateResolve = (resolveStatus: "resolved" | "false_positive") => {
    setPendingAction(resolveStatus);
    setNotes("");
    setShowNotesModal(true);
  };

  const submitResolve = async () => {
    if (!pendingAction || !incident) return;
    setActionLoading(pendingAction);
    try {
      await api.put(`/mobile/alerts/${incident.id}/resolve`, {
        status: pendingAction,
        notes: notes.trim() || undefined,
      });
      // FIX B5: Update local incident state AND show success feedback
      setIncident((prev) =>
        prev
          ? {
              ...prev,
              status: pendingAction,
              notes: notes.trim() || prev.notes,
              end_time: new Date().toISOString(),
            }
          : null
      );
      setShowNotesModal(false);
      setPendingAction(null);
      setNotes("");
      RNAlert.alert(
        "Success",
        pendingAction === "false_positive"
          ? "Marked as false positive."
          : "Incident resolved."
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ?? "Failed to resolve incident";
      RNAlert.alert("Error", msg);
    } finally {
      setActionLoading(null);
    }
  };

  const cancelResolve = () => {
    setShowNotesModal(false);
    setPendingAction(null);
    setNotes("");
  };

  const handleFlagLatestDetection = async () => {
    if (!latestDetectionId) return;
    setFlagLoading(true);
    try {
      const res = await api.post(`/detection/history/${latestDetectionId}/flag`);
      const flagged = res.data.data?.is_flagged ?? !latestDetectionFlagged;
      setLatestDetectionFlagged(flagged);
      // Also update in timeline
      setDetectionTimeline((prev) =>
        prev.map((d) =>
          d.id === latestDetectionId ? { ...d, is_flagged: flagged } : d
        )
      );
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
          accessibilityLabel="Loading incident detail"
        />
        <Text style={{ fontSize: 14, color: BRAND.textSecondary }}>
          Loading incident...
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
        <ErrorBanner message={error} onRetry={fetchIncident} />
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

  // --- Not found ---
  if (!incident) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: BRAND.background,
        }}
      >
        <Text style={{ color: BRAND.textSecondary, fontSize: 15 }}>
          Incident not found
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

  const severityColor =
    SEVERITY_COLORS[incident.severity] ?? SEVERITY_COLORS.medium;
  const severityBg =
    SEVERITY_BG_COLORS[incident.severity] ?? SEVERITY_BG_COLORS.medium;
  const statusStyle =
    STATUS_COLORS[incident.status] ?? STATUS_COLORS.new;
  const isActionable =
    incident.status === "new" || incident.status === "acknowledged";

  return (
    <View style={{ flex: 1, backgroundColor: BRAND.background }}>
      <ScrollView
        style={{ flex: 1 }}
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
              Incident Detail
            </Text>
            <Text
              style={{ fontSize: 12, color: BRAND.textSecondary, marginTop: 2 }}
            >
              {formatDate(incident.start_time)}
            </Text>
          </View>
        </View>

        {/* Severity + Status badges */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              backgroundColor: severityBg,
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 6,
            }}
            accessibilityLabel={`Severity: ${incident.severity}`}
            accessibilityRole="text"
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: severityColor,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              {incident.severity}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: statusStyle.bg,
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 6,
            }}
            accessibilityLabel={`Status: ${incident.status}`}
            accessibilityRole="text"
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: statusStyle.text,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              {incident.status}
            </Text>
          </View>
          {latestDetectionFlagged && (
            <View
              style={{
                backgroundColor: DETECTION.flagged.bg,
                borderRadius: 8,
                paddingHorizontal: 14,
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
                  fontWeight: "700",
                  color: DETECTION.flagged.text,
                  textTransform: "uppercase",
                }}
              >
                FLAGGED
              </Text>
            </View>
          )}
        </View>

        {/* Frame Image */}
        {frameBase64 && (
          <View
            style={{
              backgroundColor: NEUTRAL.black,
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 16,
              aspectRatio: MEDIA.FRAME_ASPECT_RATIO,
            }}
            accessibilityLabel="Latest detection frame"
            accessibilityRole="image"
          >
            <Image
              source={{ uri: `data:image/jpeg;base64,${frameBase64}` }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Incident Metrics Card */}
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
            Incident Metrics
          </Text>
          <MetricRow
            label="Max Confidence"
            value={`${(incident.max_confidence * 100).toFixed(1)}%`}
          />
          <MetricRow
            label="Wet Area"
            value={`${(incident.max_wet_area_percent ?? 0).toFixed(1)}%`}
          />
          <MetricRow
            label="Detection Count"
            value={String(incident.detection_count)}
          />
          <MetricRow
            label="Duration"
            value={formatDuration(incident.start_time, incident.end_time)}
          />
          <MetricRow
            label="Store"
            value={incident.store_name ?? incident.store_id.slice(0, 8)}
          />
          <MetricRow
            label="Camera"
            value={incident.camera_name ?? incident.camera_id.slice(0, 8)}
            last={!incident.notes}
          />
          {incident.notes && (
            <MetricRow label="Notes" value={incident.notes} last />
          )}
        </View>

        {/* Devices Triggered */}
        {incident.devices_triggered && incident.devices_triggered.length > 0 && (
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
              Devices Triggered
            </Text>
            {incident.devices_triggered.map((device, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: 44,
                  paddingVertical: 8,
                  borderBottomWidth:
                    i < (incident.devices_triggered?.length ?? 0) - 1 ? 1 : 0,
                  borderBottomColor: "#F3F4F6",
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: BRAND.primary,
                    marginRight: 12,
                  }}
                />
                <Text
                  style={{ fontSize: 14, color: BRAND.textPrimary }}
                >
                  {device}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Status Timeline */}
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
            Status Timeline
          </Text>
          <TimelineDot
            label="Started"
            time={formatDate(incident.start_time)}
            isActive
            isLast={
              incident.status === "new"
            }
          />
          {(incident.status === "acknowledged" ||
            incident.status === "resolved" ||
            incident.status === "false_positive") && (
            <TimelineDot
              label="Acknowledged"
              time="Acknowledged by user"
              isActive
              isLast={incident.status === "acknowledged"}
            />
          )}
          {(incident.status === "resolved" ||
            incident.status === "false_positive") && (
            <TimelineDot
              label={
                incident.status === "false_positive"
                  ? "False Positive"
                  : "Resolved"
              }
              time={
                incident.end_time
                  ? formatDate(incident.end_time)
                  : "Resolved by user"
              }
              isActive
              isLast
            />
          )}
          <Text
            style={{
              fontSize: 12,
              color: BRAND.textSecondary,
              marginTop: 10,
            }}
          >
            Duration: {formatDuration(incident.start_time, incident.end_time)}
          </Text>
        </View>

        {/* Detection Timeline */}
        {detectionTimeline.length > 0 && (
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
              Detection Timeline ({detectionTimeline.length})
            </Text>
            {detectionTimeline.map((det, i) => {
              const detWetDry = det.is_wet ? DETECTION.wet : DETECTION.dry;
              return (
                <TouchableOpacity
                  key={det.id}
                  onPress={() => router.push(`/alert/${det.id}`)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderRadius: 12,
                    padding: 14,
                    minHeight: 60,
                    marginBottom: i < detectionTimeline.length - 1 ? 6 : 0,
                    backgroundColor: i === 0 ? "#F8F7F4" : "transparent",
                  }}
                  accessibilityLabel={`Detection at ${formatDate(det.timestamp)}, confidence ${(det.confidence * 100).toFixed(1)}%`}
                  accessibilityRole="button"
                >
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor:
                        i === 0 ? BRAND.primary : NEUTRAL.inactive,
                      marginRight: 12,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        color: BRAND.textPrimary,
                        fontWeight: "500",
                      }}
                    >
                      {formatDate(det.timestamp)}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        marginTop: 4,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: BRAND.textSecondary,
                        }}
                      >
                        {(det.confidence * 100).toFixed(1)}%
                      </Text>
                      <View
                        style={{
                          backgroundColor: detWetDry.bg,
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "700",
                            color: detWetDry.text,
                          }}
                        >
                          {det.is_wet ? "WET" : "DRY"}
                        </Text>
                      </View>
                      {det.is_flagged && (
                        <View
                          style={{
                            backgroundColor: DETECTION.flagged.bg,
                            borderRadius: 6,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
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
                  <Text
                    style={{
                      fontSize: 16,
                      color: BRAND.textSecondary,
                    }}
                  >
                    {"\u203A"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Action Buttons */}
        <View style={{ gap: 8, marginBottom: 32 }}>
          {incident.status === "new" && (
            <TouchableOpacity
              onPress={handleAcknowledge}
              disabled={actionLoading !== null}
              style={{
                height: 52,
                backgroundColor: "#0D9488",
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
                opacity: actionLoading ? 0.6 : 1,
              }}
              accessibilityLabel="Acknowledge incident"
              accessibilityRole="button"
            >
              {actionLoading === "acknowledge" ? (
                <ActivityIndicator color={NEUTRAL.white} size="small" />
              ) : (
                <Text
                  style={{
                    color: NEUTRAL.white,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  Acknowledge
                </Text>
              )}
            </TouchableOpacity>
          )}
          {isActionable && (
            <>
              <TouchableOpacity
                onPress={() => initiateResolve("resolved")}
                disabled={actionLoading !== null}
                style={{
                  height: 52,
                  backgroundColor: "#16A34A",
                  borderRadius: 12,
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: actionLoading ? 0.6 : 1,
                }}
                accessibilityLabel="Resolve incident"
                accessibilityRole="button"
              >
                <Text
                  style={{
                    color: NEUTRAL.white,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  Resolve
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => initiateResolve("false_positive")}
                disabled={actionLoading !== null}
                style={{
                  height: 52,
                  backgroundColor: "#F59E0B",
                  borderRadius: 12,
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: actionLoading ? 0.6 : 1,
                }}
                accessibilityLabel="Mark as false positive"
                accessibilityRole="button"
              >
                <Text
                  style={{
                    color: NEUTRAL.white,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  False Positive
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Flag latest detection */}
          {latestDetectionId && (
            <TouchableOpacity
              onPress={handleFlagLatestDetection}
              disabled={flagLoading}
              style={{
                height: 52,
                backgroundColor: latestDetectionFlagged
                  ? DETECTION.unflagged.bg
                  : DETECTION.flagged.bg,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: latestDetectionFlagged
                  ? BRAND.border
                  : DETECTION.flagged.border,
                opacity: flagLoading ? 0.6 : 1,
              }}
              accessibilityLabel={
                latestDetectionFlagged
                  ? "Unflag latest detection"
                  : "Flag latest detection for review"
              }
              accessibilityRole="button"
            >
              {flagLoading ? (
                <ActivityIndicator color={ACTIONS.flag} size="small" />
              ) : (
                <Text
                  style={{
                    color: latestDetectionFlagged
                      ? DETECTION.unflagged.text
                      : ACTIONS.flag,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  {latestDetectionFlagged
                    ? "Unflag Detection"
                    : "Report Issue"}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Notes Input Modal */}
      <Modal
        visible={showNotesModal}
        animationType="slide"
        transparent
        onRequestClose={cancelResolve}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <View
            style={{
              backgroundColor: BRAND.surface,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 20,
              paddingBottom: 40,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: BRAND.textPrimary,
                marginBottom: 16,
              }}
            >
              {pendingAction === "false_positive"
                ? "Why is this a false positive?"
                : "Resolution Notes"}
            </Text>
            <TextInput
              style={{
                backgroundColor: BRAND.background,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: BRAND.border,
                padding: 14,
                fontSize: 15,
                color: BRAND.textPrimary,
                height: 100,
                textAlignVertical: "top",
              }}
              placeholder="Add notes (optional)..."
              placeholderTextColor={BRAND.textSecondary}
              multiline
              value={notes}
              onChangeText={setNotes}
              editable={actionLoading === null}
              accessibilityLabel="Resolution notes input"
              accessibilityRole="text"
            />
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginTop: 16,
              }}
            >
              <TouchableOpacity
                onPress={cancelResolve}
                disabled={actionLoading !== null}
                style={{
                  flex: 1,
                  height: 52,
                  backgroundColor: BRAND.background,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: BRAND.border,
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: actionLoading ? 0.6 : 1,
                }}
                accessibilityLabel="Cancel"
                accessibilityRole="button"
              >
                <Text
                  style={{
                    color: BRAND.textSecondary,
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitResolve}
                disabled={actionLoading !== null}
                style={{
                  flex: 1,
                  height: 52,
                  backgroundColor:
                    pendingAction === "false_positive"
                      ? "#F59E0B"
                      : "#16A34A",
                  borderRadius: 12,
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: actionLoading ? 0.6 : 1,
                }}
                accessibilityLabel="Confirm action"
                accessibilityRole="button"
              >
                {actionLoading ? (
                  <ActivityIndicator color={NEUTRAL.white} size="small" />
                ) : (
                  <Text
                    style={{
                      color: NEUTRAL.white,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    Confirm
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Reusable metric row */
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
          flexShrink: 1,
          textAlign: "right",
          marginLeft: 16,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/** Status timeline dot entry with connecting line */
function TimelineDot({
  label,
  time,
  isActive,
  isLast,
}: {
  label: string;
  time: string;
  isActive?: boolean;
  isLast?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: isLast ? 0 : 4,
      }}
    >
      <View style={{ alignItems: "center", marginRight: 12 }}>
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: isActive ? BRAND.primary : NEUTRAL.inactive,
          }}
        />
        {!isLast && (
          <View
            style={{
              width: 2,
              height: 28,
              backgroundColor: "#E5E7EB",
              marginTop: 2,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, paddingBottom: isLast ? 0 : 8 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: BRAND.textPrimary,
          }}
        >
          {label}
        </Text>
        <Text
          style={{ fontSize: 12, color: BRAND.textSecondary, marginTop: 2 }}
        >
          {time}
        </Text>
      </View>
    </View>
  );
}
