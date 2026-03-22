import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert as RNAlert,
  TextInput,
} from "react-native";
import {
  SEVERITY_COLORS,
  SEVERITY_BG_COLORS,
  STATUS_COLORS,
  BRAND,
} from "@/constants/colors";
import { NEUTRAL, ACTIONS } from "@/constants/theme";
import api from "@/services/api";

export interface IncidentDetail {
  id: string;
  severity: string;
  status: string;
  max_confidence: number;
  max_wet_area_percent: number;
  detection_count: number;
  start_time: string;
  end_time: string | null;
  camera_id: string;
  store_id: string;
  notes: string | null;
  store_name?: string;
  camera_name?: string;
}

export interface DetectionDetail {
  id: string;
  camera_id: string;
  store_id: string;
  timestamp: string;
  is_wet: boolean;
  confidence: number;
  wet_area_percent: number;
  inference_time_ms: number;
  model_source: string;
  frame_base64?: string;
  predictions: Array<{
    class_name: string;
    confidence: number;
    area_percent: number;
  }>;
  incident_id?: string;
}

interface AlertDetailViewProps {
  incident: IncidentDetail;
  detection?: DetectionDetail | null;
  onBack: () => void;
  onStatusChange?: (newStatus: string) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString();
}

function timelineLabel(start: string, end: string | null): string {
  const startDate = new Date(start);
  if (!end) {
    return `Started ${startDate.toLocaleString()} \u2014 ongoing`;
  }
  const endDate = new Date(end);
  const durationMs = endDate.getTime() - startDate.getTime();
  const minutes = Math.round(durationMs / 60000);
  if (minutes < 60) return `Duration: ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMins = minutes % 60;
  return `Duration: ${hours}h ${remainMins}m`;
}

export default function AlertDetailView({
  incident,
  detection,
  onBack,
  onStatusChange,
}: AlertDetailViewProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showNotesInput, setShowNotesInput] = useState(false);
  const [notes, setNotes] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "resolved" | "false_positive" | null
  >(null);

  const severityColor =
    SEVERITY_COLORS[incident.severity] ?? SEVERITY_COLORS.medium;
  const severityBg =
    SEVERITY_BG_COLORS[incident.severity] ?? SEVERITY_BG_COLORS.medium;
  const statusStyle =
    STATUS_COLORS[incident.status] ?? STATUS_COLORS.new;

  const handleAcknowledge = async () => {
    setActionLoading("acknowledge");
    try {
      await api.put(`/mobile/alerts/${incident.id}/acknowledge`);
      onStatusChange?.("acknowledged");
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
    setShowNotesInput(true);
  };

  const submitResolve = async () => {
    if (!pendingAction) return;
    setActionLoading(pendingAction);
    try {
      await api.put(`/mobile/alerts/${incident.id}/resolve`, {
        status: pendingAction,
        notes: notes.trim() || undefined,
      });
      onStatusChange?.(pendingAction);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ?? "Failed to resolve incident";
      RNAlert.alert("Error", msg);
    } finally {
      setActionLoading(null);
      setShowNotesInput(false);
      setPendingAction(null);
      setNotes("");
    }
  };

  const cancelResolve = () => {
    setShowNotesInput(false);
    setPendingAction(null);
    setNotes("");
  };

  const isActionable =
    incident.status === "new" || incident.status === "acknowledged";

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
          marginBottom: 16,
        }}
      >
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}>
          <Text style={{ fontSize: 24, color: BRAND.primary }}>
            {"\u2190"}
          </Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "600",
              color: BRAND.textPrimary,
            }}
          >
            Incident Detail
          </Text>
          <Text style={{ fontSize: 11, color: BRAND.textSecondary }}>
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
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: severityColor,
              textTransform: "uppercase",
            }}
          >
            {incident.severity}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: statusStyle.bg,
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: statusStyle.text,
              textTransform: "uppercase",
            }}
          >
            {incident.status}
          </Text>
        </View>
      </View>

      {/* Detection Frame Image */}
      {detection?.frame_base64 && (
        <View
          style={{
            backgroundColor: "#000",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 16,
            aspectRatio: 16 / 9,
          }}
        >
          <Image
            source={{
              uri: `data:image/jpeg;base64,${detection.frame_base64}`,
            }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Incident Metrics */}
      <View
        style={{
          backgroundColor: BRAND.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: BRAND.border,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: BRAND.textPrimary,
            marginBottom: 12,
          }}
        >
          Incident Metrics
        </Text>
        <DetailRow
          label="Max Confidence"
          value={`${(incident.max_confidence * 100).toFixed(1)}%`}
        />
        <DetailRow
          label="Wet Area"
          value={`${incident.max_wet_area_percent.toFixed(1)}%`}
        />
        <DetailRow
          label="Detection Count"
          value={String(incident.detection_count)}
        />
        <DetailRow
          label="Store"
          value={
            incident.store_name ?? incident.store_id.slice(0, 8)
          }
        />
        <DetailRow
          label="Camera"
          value={
            incident.camera_name ?? incident.camera_id.slice(0, 8)
          }
        />
        {incident.notes && (
          <DetailRow label="Notes" value={incident.notes} />
        )}
      </View>

      {/* Detection-level metrics (if available) */}
      {detection && (
        <View
          style={{
            backgroundColor: BRAND.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: BRAND.border,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: BRAND.textPrimary,
              marginBottom: 12,
            }}
          >
            Detection Detail
          </Text>
          <DetailRow
            label="Confidence"
            value={`${(detection.confidence * 100).toFixed(1)}%`}
          />
          <DetailRow
            label="Wet Area"
            value={`${detection.wet_area_percent.toFixed(1)}%`}
          />
          <DetailRow
            label="Inference Time"
            value={`${detection.inference_time_ms}ms`}
          />
          <DetailRow label="Model Source" value={detection.model_source} />
        </View>
      )}

      {/* Predictions list */}
      {detection && detection.predictions.length > 0 && (
        <View
          style={{
            backgroundColor: BRAND.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: BRAND.border,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: BRAND.textPrimary,
              marginBottom: 12,
            }}
          >
            Predictions
          </Text>
          {detection.predictions.map((pred, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingVertical: 6,
                borderBottomWidth:
                  i < detection.predictions.length - 1 ? 1 : 0,
                borderColor: NEUTRAL.surface,
              }}
            >
              <Text style={{ fontSize: 13, color: BRAND.textPrimary }}>
                {pred.class_name}
              </Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Text style={{ fontSize: 13, color: BRAND.textSecondary }}>
                  {(pred.confidence * 100).toFixed(1)}%
                </Text>
                <Text style={{ fontSize: 13, color: BRAND.textSecondary }}>
                  {pred.area_percent.toFixed(1)}% area
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Timeline */}
      <View
        style={{
          backgroundColor: BRAND.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: BRAND.border,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: BRAND.textPrimary,
            marginBottom: 12,
          }}
        >
          Timeline
        </Text>
        <TimelineEntry
          label="Started"
          time={formatDate(incident.start_time)}
          isActive
        />
        {incident.status === "acknowledged" && (
          <TimelineEntry label="Acknowledged" time="Acknowledged by user" />
        )}
        {(incident.status === "resolved" ||
          incident.status === "false_positive") && (
          <>
            <TimelineEntry label="Acknowledged" time="Acknowledged by user" />
            <TimelineEntry
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
            />
          </>
        )}
        {incident.end_time && (
          <TimelineEntry
            label="Ended"
            time={formatDate(incident.end_time)}
          />
        )}
        <Text
          style={{
            fontSize: 11,
            color: BRAND.textSecondary,
            marginTop: 8,
          }}
        >
          {timelineLabel(incident.start_time, incident.end_time)}
        </Text>
      </View>

      {/* Notes Input (shown when resolve/false_positive initiated) */}
      {showNotesInput && (
        <View
          style={{
            backgroundColor: BRAND.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: BRAND.border,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: BRAND.textPrimary,
              marginBottom: 8,
            }}
          >
            {pendingAction === "false_positive"
              ? "Why is this a false positive?"
              : "Resolution Notes"}
          </Text>
          <TextInput
            style={{
              backgroundColor: BRAND.background,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: BRAND.border,
              padding: 12,
              fontSize: 14,
              color: BRAND.textPrimary,
              minHeight: 80,
              textAlignVertical: "top",
            }}
            placeholder="Add notes (optional)..."
            placeholderTextColor={BRAND.textSecondary}
            multiline
            value={notes}
            onChangeText={setNotes}
            editable={actionLoading === null}
          />
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              marginTop: 12,
            }}
          >
            <TouchableOpacity
              onPress={cancelResolve}
              disabled={actionLoading !== null}
              style={{
                flex: 1,
                backgroundColor: BRAND.background,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: BRAND.border,
                paddingVertical: 12,
                alignItems: "center",
                opacity: actionLoading ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  color: BRAND.textSecondary,
                  fontSize: 14,
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
                backgroundColor:
                  pendingAction === "false_positive"
                    ? ACTIONS.falsePositive
                    : BRAND.success,
                borderRadius: 8,
                paddingVertical: 12,
                alignItems: "center",
                opacity: actionLoading ? 0.6 : 1,
              }}
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text
                  style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}
                >
                  Confirm
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Action Buttons */}
      {!showNotesInput && (
        <View style={{ gap: 10, marginBottom: 32 }}>
          {incident.status === "new" && (
            <TouchableOpacity
              onPress={handleAcknowledge}
              disabled={actionLoading !== null}
              style={{
                backgroundColor: BRAND.primary,
                borderRadius: 8,
                paddingVertical: 14,
                alignItems: "center",
                opacity: actionLoading ? 0.6 : 1,
              }}
            >
              {actionLoading === "acknowledge" ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text
                  style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}
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
                  backgroundColor: BRAND.success,
                  borderRadius: 8,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: actionLoading ? 0.6 : 1,
                }}
              >
                <Text
                  style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}
                >
                  Resolve
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => initiateResolve("false_positive")}
                disabled={actionLoading !== null}
                style={{
                  backgroundColor: ACTIONS.falsePositive,
                  borderRadius: 8,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: actionLoading ? 0.6 : 1,
                }}
              >
                <Text
                  style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}
                >
                  False Positive
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 5,
        borderBottomWidth: 1,
        borderBottomColor: NEUTRAL.divider,
      }}
    >
      <Text style={{ fontSize: 13, color: BRAND.textSecondary }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "500",
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

function TimelineEntry({
  label,
  time,
  isActive,
}: {
  label: string;
  time: string;
  isActive?: boolean;
}) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: isActive ? BRAND.primary : NEUTRAL.inactive,
          marginRight: 10,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: BRAND.textPrimary,
          }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: 11, color: BRAND.textSecondary }}>
          {time}
        </Text>
      </View>
    </View>
  );
}
