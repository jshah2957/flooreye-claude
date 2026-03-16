from enum import StrEnum


class UserRole(StrEnum):
    SUPER_ADMIN = "super_admin"
    ORG_ADMIN = "org_admin"
    ML_ENGINEER = "ml_engineer"
    OPERATOR = "operator"
    STORE_OWNER = "store_owner"
    VIEWER = "viewer"


class CameraStatus(StrEnum):
    OFFLINE = "offline"
    ONLINE = "online"
    TESTING = "testing"
    ACTIVE = "active"


class StreamType(StrEnum):
    RTSP = "rtsp"
    ONVIF = "onvif"
    HTTP = "http"
    HLS = "hls"
    MJPEG = "mjpeg"


class FloorType(StrEnum):
    TILE = "tile"
    WOOD = "wood"
    CONCRETE = "concrete"
    CARPET = "carpet"
    VINYL = "vinyl"
    LINOLEUM = "linoleum"


class InferenceMode(StrEnum):
    CLOUD = "cloud"
    EDGE = "edge"
    HYBRID = "hybrid"


class EdgeAgentStatus(StrEnum):
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"


class ModelSource(StrEnum):
    ROBOFLOW = "roboflow"
    STUDENT = "student"
    HYBRID_ESCALATED = "hybrid_escalated"


class IncidentSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IncidentStatus(StrEnum):
    NEW = "new"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    FALSE_POSITIVE = "false_positive"


class ClipStatus(StrEnum):
    RECORDING = "recording"
    COMPLETED = "completed"
    FAILED = "failed"


class ClipTrigger(StrEnum):
    MANUAL = "manual"
    INCIDENT = "incident"


class DatasetSplit(StrEnum):
    TRAIN = "train"
    VAL = "val"
    TEST = "test"
    UNASSIGNED = "unassigned"


class LabelSource(StrEnum):
    TEACHER_ROBOFLOW = "teacher_roboflow"
    HUMAN_VALIDATED = "human_validated"
    HUMAN_CORRECTED = "human_corrected"
    STUDENT_PSEUDOLABEL = "student_pseudolabel"
    MANUAL_UPLOAD = "manual_upload"
    UNKNOWN = "unknown"


class ModelArchitecture(StrEnum):
    YOLOV8N = "yolov8n"
    YOLOV8S = "yolov8s"
    YOLOV8M = "yolov8m"


class ModelStatus(StrEnum):
    DRAFT = "draft"
    VALIDATING = "validating"
    STAGING = "staging"
    PRODUCTION = "production"
    RETIRED = "retired"


class RoboflowSyncStatus(StrEnum):
    NOT_SENT = "not_sent"
    SENT = "sent"
    LABELED = "labeled"
    IMPORTED = "imported"


class Platform(StrEnum):
    IOS = "ios"
    ANDROID = "android"


class DetectionControlScope(StrEnum):
    GLOBAL = "global"
    ORG = "org"
    STORE = "store"
    CAMERA = "camera"


# Role hierarchy for permission checks (higher index = more permissions)
ROLE_HIERARCHY: list[str] = [
    UserRole.VIEWER,
    UserRole.STORE_OWNER,
    UserRole.OPERATOR,
    UserRole.ML_ENGINEER,
    UserRole.ORG_ADMIN,
    UserRole.SUPER_ADMIN,
]
