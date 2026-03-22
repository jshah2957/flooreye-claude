PART G — DATA MODELS (MongoDB Collections)
═══════════════════════════════════════════════════════

G1. COLLECTIONS INDEX
Collection                    Purpose

 users                        User accounts + roles + push tokens

 user_devices                 Mobile push tokens (one per device per user)

 stores                       Physical store locations

 cameras                      IP camera configurations

 rois                         Region of Interest polygons per camera

 dry_references               Dry floor baseline frames per camera

 edge_agents                  Edge agent registry + health state

 detection_logs               Every detection event (the core audit table)

 events                       Incidents (grouped detections)

 clips                        Recorded video clips

 dataset_frames               Training data frames

 annotations                  COCO-format annotations per frame

 model_versions               Custom student model version registry

 training_jobs                Distillation training job runs

 detection_control_settings   Scoped detection config overrides

 detection_class_overrides    Per-class scoped overrides

 integration_configs          Third-party API credential configs (encrypted)

 notification_rules           Alert delivery rules

 notification_deliveries      Delivery attempt logs

 devices                      IoT devices (signs, alarms, lights)

 system_logs                  System event logs (TTL 30d)

 audit_logs                   User action audit trail (TTL 365d)
G2. ALL COLLECTION SCHEMAS
users

 python

 class User(BaseModel):
     id: str                          # UUID, generated on create
     email: EmailStr                  # Unique index
     password_hash: str               # bcrypt hash
     name: str
     role: Literal["super_admin", "org_admin", "ml_engineer",
                    "operator", "store_owner", "viewer"]
     org_id: Optional[str] = None     # None for super_admin
     store_access: List[str] = []     # Store IDs this user can access
     is_active: bool = True
     last_login: Optional[datetime] = None
     created_at: datetime
     updated_at: datetime
     # Mobile push handled via user_devices collection


user_devices

 python

 class UserDevice(BaseModel):
     id: str
     user_id: str                     # FK → users.id
     org_id: str
     platform: Literal["ios", "android"]
     push_token: str                  # FCM/Expo push token
     app_version: str
     device_model: Optional[str]
     last_seen: datetime
     created_at: datetime
     # Index: user_id, unique on (user_id, push_token)


stores

 python
    class Store(BaseModel):
        id: str
        org_id: str                      # Index
        name: str
        address: str
        city: Optional[str]
        state: Optional[str]
        country: str = "US"
        timezone: str = "America/New_York" # IANA tz
        settings: Dict[str, Any] = {}    # Custom key-value settings
        is_active: bool = True
        created_at: datetime
        updated_at: datetime
        # Index: org_id


cameras

    python

    class Camera(BaseModel):
        id: str
        store_id: str                    # FK → stores.id
        org_id: str                      # Denormalized for query efficiency
        name: str
        stream_type: Literal["rtsp", "onvif", "http", "hls", "mjpeg"]
        stream_url: str                  # Encrypted at rest (AES-256-GCM)
        credentials: Optional[str]        # Encrypted credentials
        status: Literal["offline", "online", "testing", "active"] = "offline"
        fps_config: int = 2
        resolution: Optional[str]         # e.g., "1920x1080"
        floor_type: Literal["tile", "wood", "concrete", "carpet", "vinyl", "linoleum"]
        min_wet_area_percent: float = 0.5
        detection_enabled: bool = False
        mask_outside_roi: bool = False
        inference_mode: Literal["cloud", "edge", "hybrid"] = "cloud"
        hybrid_threshold: float = 0.65
        edge_agent_id: Optional[str]      # FK → edge_agents.id
        student_model_version: Optional[str] # Version ID deployed to this cam's edge a
        snapshot_base64: Optional[str]    # Latest snapshot from connection test
        last_seen: Optional[datetime]
        created_at: datetime
        updated_at: datetime
        # Indexes: store_id, org_id, status, inference_mode
                                                                                    




rois

    python
 class ROIPoint(BaseModel):
     x: float # Normalized 0.0–1.0
     y: float # Normalized 0.0–1.0

 class ROI(BaseModel):
     id: str
     camera_id: str
     org_id: str
     version: int = 1                  # Incremented on each update
     polygon_points: List[ROIPoint]    # ≥ 3 points
     mask_outside: bool = False
     is_active: bool = True
     created_by: str                   # User ID
     created_at: datetime
     # Index: camera_id, is_active


dry_references

 python

 class DryReferenceFrame(BaseModel):
     frame_base64: str
     brightness_score: float
     reflection_score: float
     captured_at: datetime

 class DryReference(BaseModel):
     id: str
     camera_id: str
     org_id: str
     version: int = 1
     frames: List[DryReferenceFrame]   # 3–10 frames
     is_active: bool = True
     created_by: str
     created_at: datetime
     # Index: camera_id, is_active


edge_agents

 python
 class EdgeAgent(BaseModel):
     id: str
     org_id: str
     store_id: str
     name: str
     token_hash: str                  # bcrypt hash of edge JWT
     agent_version: Optional[str]
     current_model_version: Optional[str] # Model version ID
     status: Literal["online", "offline", "degraded"] = "offline"
     last_heartbeat: Optional[datetime]
     # Health metrics (updated each heartbeat)
     cpu_percent: Optional[float]
     ram_percent: Optional[float]
     disk_percent: Optional[float]
     gpu_percent: Optional[float]
     inference_fps: Optional[float]
     buffer_frames: int = 0
     buffer_size_mb: float = 0.0
     tunnel_status: Optional[str]     # "connected" | "disconnected" | "none"
     tunnel_latency_ms: Optional[float]
     camera_count: int = 0
     # Cloudflare
     cf_tunnel_id: Optional[str]
     # Provisioning
     created_at: datetime
     # Indexes: org_id, store_id, status


detection_logs

 python
 class BoundingBox(BaseModel):
     x: float; y: float; w: float; h: float

 class Prediction(BaseModel):
     class_name: str
     confidence: float
     area_percent: float
     bbox: BoundingBox
     polygon_points: Optional[List[Dict]]   # Segmentation polygon (simplified)
     severity: Optional[str]
     should_alert: bool = True

 class DetectionLog(BaseModel):
     id: str
     camera_id: str
     store_id: str
     org_id: str
     timestamp: datetime
     is_wet: bool
     confidence: float                # Max confidence across all wet predictions
     wet_area_percent: float
     inference_time_ms: float
     frame_base64: Optional[str]      # Stored in S3, path here OR inline for recent
     frame_s3_path: Optional[str]
     annotated_frame_s3_path: Optional[str]  # S3 path for bbox-annotated frame
     predictions: List[Prediction]
     model_source: Literal["roboflow", "student", "hybrid_escalated"]
     model_version_id: Optional[str]
     roboflow_sync_status: Optional[str]     # "not_sent" | "sent" | "labeled" | "imported"
     is_flagged: bool = False
     in_training_set: bool = False
     incident_id: Optional[str]      # FK → events.id
     # Note: student_confidence and escalated removed — no longer written by detection service
     # Indexes: camera_id, store_id, org_id, timestamp, is_wet, is_flagged


events (incidents)

 python
    class Event(BaseModel):
        id: str
        store_id: str
        camera_id: str
        org_id: str
        start_time: datetime
        end_time: Optional[datetime]
        max_confidence: float
        max_wet_area_percent: float
        severity: Literal["low", "medium", "high", "critical"]
        status: Literal["new", "acknowledged", "resolved", "false_positive", "auto_resolved"] = "new"
        acknowledged_by: Optional[str]   # User ID
        acknowledged_at: Optional[datetime]
        resolved_by: Optional[str]
        resolved_at: Optional[datetime]
        detection_count: int = 1
        top_class_name: Optional[str]           # Highest-confidence class from detections
        device_trigger_enabled: Optional[bool]  # Whether device triggers are enabled for this incident
        devices_triggered: List[str] = []       # Device IDs — auto-populated by incident service
        notes: Optional[str]
        roboflow_sync_status: Literal["not_sent", "sent", "labeled", "imported"] = "not_sent"
        created_at: datetime
        # Indexes: store_id, camera_id, org_id, status, severity, start_time
                                                                                     




clips

    python

    class Clip(BaseModel):
        id: str
        camera_id: str
        store_id: str
        org_id: str
        file_path: str                   # Local path or S3 URI
        thumbnail_path: Optional[str]
        duration: int                    # Seconds
        file_size_mb: Optional[float]
        status: Literal["recording", "completed", "failed"] = "recording"
        trigger: Literal["manual", "incident"] = "manual"
        incident_id: Optional[str]
        created_at: datetime
        completed_at: Optional[datetime]
        # Index: camera_id, store_id, org_id, status


dataset_frames

    python
    class DatasetFrame(BaseModel):
        id: str
        org_id: str
        camera_id: Optional[str]         # None if manually uploaded
        store_id: Optional[str]
        frame_path: str                  # S3 URI
        thumbnail_path: Optional[str]
        label_class: Optional[str]
        floor_type: Optional[str]
        label_source: Literal[
            "teacher_roboflow", "human_validated", "human_corrected",
            "student_pseudolabel", "manual_upload", "unknown"
        ] = "unknown"
        teacher_logits: Optional[Dict]   # Raw logits for distillation training
        teacher_confidence: Optional[float]
        annotations_id: Optional[str]    # FK → annotations.id
        roboflow_sync_status: Literal["not_sent", "sent", "labeled", "imported"] = "not_
        split: Literal["train", "val", "test", "unassigned"] = "unassigned"
        included: bool = True            # Include in next training run
        created_at: datetime
        # Indexes: org_id, camera_id, split, included, label_source
                                                                                     




model_versions

    python
    class PerClassMetric(BaseModel):
        class_name: str
        ap_50: float
        precision: float
        recall: float

    class ModelVersion(BaseModel):
        id: str
        org_id: Optional[str]            # None = universal/pre-trained base
        version_str: str                 # e.g., "v1.4.0"
        architecture: Literal["yolov8n", "yolov8s", "yolov8m"]
        param_count: Optional[int]
        status: Literal["draft", "validating", "staging", "production", "retired"] = "dr
        training_job_id: Optional[str]
        frame_count: int = 0
        # Overall metrics
        map_50: Optional[float]
        map_50_95: Optional[float]
        precision: Optional[float]
        recall: Optional[float]
        f1: Optional[float]
        # Per-class metrics
        per_class_metrics: List[PerClassMetric] = []
        # Storage paths
        onnx_path: Optional[str]         # S3 URI
        pt_path: Optional[str]
        trt_path: Optional[str]          # TensorRT engine
        model_size_mb: Optional[float]
        # Promotion history
        promoted_to_staging_at: Optional[datetime]
        promoted_to_staging_by: Optional[str]
        promoted_to_production_at: Optional[datetime]
        promoted_to_production_by: Optional[str]
        created_at: datetime
        # Index: org_id, status
                                                                                     




training_jobs

    python
    class TrainingJobConfig(BaseModel):
        architecture: str
        date_from: Optional[datetime]
        date_to: Optional[datetime]
        store_ids: List[str] = []
        camera_ids: List[str] = []
        human_only: bool = False
        max_epochs: int = 100
        image_size: int = 640
        augmentation_preset: Literal["light", "standard", "heavy"] = "standard"
        distillation_temperature: float = 4.0
        distillation_alpha: float = 0.3

    class TrainingJob(BaseModel):
        id: str
        org_id: str
        status: Literal["queued", "running", "completed", "failed", "cancelled"] = "queu
        config: TrainingJobConfig
        triggered_by: str                # User ID or "auto_schedule"
        celery_task_id: Optional[str]
        frames_used: int = 0
        current_epoch: Optional[int]
        total_epochs: Optional[int]
        resulting_model_id: Optional[str]
        error_message: Optional[str]
        log_path: Optional[str]
        started_at: Optional[datetime]
        completed_at: Optional[datetime]
        created_at: datetime
        # Index: org_id, status
                                                                                     




detection_control_settings

    python
 class DetectionControlSettings(BaseModel):
     id: str
     org_id: str
     scope: Literal["global", "org", "store", "camera"]
     scope_id: Optional[str]           # None for global, org_id for org, etc.
     # Layer 1
     layer1_enabled: Optional[bool]
     layer1_confidence: Optional[float]        # 0.0–1.0
     # Layer 2
     layer2_enabled: Optional[bool]
     layer2_min_area_percent: Optional[float]
     # Layer 3
     layer3_enabled: Optional[bool]
     layer3_k: Optional[int]
     layer3_m: Optional[int]
     layer3_voting_mode: Optional[Literal["strict", "majority", "relaxed"]]
     # Layer 4
     layer4_enabled: Optional[bool]
     layer4_delta_threshold: Optional[float]
     layer4_auto_refresh: Optional[Literal["never", "hourly", "daily", "weekly"]]
     layer4_refresh_time: Optional[str]        # HH:MM
     layer4_stale_warning_days: Optional[int]
     # Continuous detection
     detection_enabled: Optional[bool]
     capture_fps: Optional[int]
     detection_interval_seconds: Optional[float]
     max_concurrent_detections: Optional[int]
     cooldown_after_alert_seconds: Optional[int]
     business_hours_enabled: Optional[bool]
     business_hours_start: Optional[str]       # HH:MM
     business_hours_end: Optional[str]
     business_hours_timezone: Optional[str]
     # Incident generation
     auto_create_incident: Optional[bool]
     incident_grouping_window_seconds: Optional[int]
     auto_close_after_minutes: Optional[int]
     min_severity_to_create: Optional[str]
     auto_notify_on_create: Optional[bool]
     trigger_devices_on_create: Optional[bool]
     # Severity thresholds (Phase 7 — detection fix plan)
     severity_low_min: Optional[float]           # Min confidence for "low" severity
     severity_low_max: Optional[float]           # Max confidence for "low" severity
     severity_medium_min: Optional[float]
     severity_medium_max: Optional[float]
     severity_high_min: Optional[float]
     severity_high_max: Optional[float]
     severity_critical_min: Optional[float]
     severity_critical_max: Optional[float]
     severity_area_weight: Optional[float]       # Weight for area_percent in severity calc
     severity_confidence_weight: Optional[float] # Weight for confidence in severity calc
     # Active learning
     active_learning_enabled: Optional[bool]
     active_learning_sample_rate: Optional[float]   # 0.0–1.0 — fraction of frames to sample
     active_learning_uncertainty_threshold: Optional[float]  # Flag if confidence below this
     active_learning_max_daily: Optional[int]       # Max frames to auto-flag per day
     # Hybrid
     hybrid_escalation_threshold: Optional[float]
     hybrid_max_escalations_per_min: Optional[int]
     hybrid_escalation_cooldown_seconds: Optional[int]
     hybrid_save_escalated_frames: Optional[bool]
     # Meta
     updated_by: str
     updated_at: datetime
     created_at: datetime
     # Unique index: (org_id, scope, scope_id)


detection_class_overrides
    python

    class DetectionClassOverride(BaseModel):
        id: str
        org_id: str
        scope: Literal["global", "org", "store", "camera"]
        scope_id: Optional[str]
        class_id: str                     # FK → detection_classes.id
        class_name: str                   # Denormalized
        enabled: Optional[bool]
        min_confidence: Optional[float]
        min_area_percent: Optional[float]
        severity_mapping: Optional[Literal["low", "medium", "high", "critical"]]
        alert_on_detect: Optional[bool]
        # Per-class incident overrides (Phase 7 — detection fix plan)
        incident_enabled: Optional[bool]              # Whether this class creates incidents
        incident_severity_override: Optional[Literal["low", "medium", "high", "critical"]]
        incident_grouping_separate: Optional[bool]    # Group this class separately from others
        device_trigger_enabled: Optional[bool]        # Whether this class triggers IoT devices
        updated_by: str
        updated_at: datetime
        # Unique index: (org_id, scope, scope_id, class_id)


integration_configs

    python

    class IntegrationConfig(BaseModel):
        id: str
        org_id: str
        service: Literal["roboflow", "smtp", "webhook", "sms", "fcm",
                          "s3", "minio", "r2", "mqtt",
                          "cloudflare-tunnel", "mongodb", "redis"]
        config_encrypted: str             # AES-256-GCM encrypted JSON blob
        status: Literal["connected", "error", "not_configured", "degraded"] = "not_confi
        last_tested: Optional[datetime]
        last_test_result: Optional[Literal["success", "failure"]]
        last_test_response_ms: Optional[float]
        last_test_error: Optional[str]
        updated_by: str
        updated_at: datetime
        created_at: datetime
        # Unique index: (org_id, service)
                                                                                     




notification_rules

    python
    class NotificationRule(BaseModel):
        id: str
        org_id: str
        name: Optional[str]
        channel: Literal["email", "webhook", "sms", "push"]
        recipients: List[str]             # Emails / URLs / phones / "all_store_owners"
        store_id: Optional[str]           # None = all stores
        camera_id: Optional[str]          # None = all cameras in scope
        min_severity: Literal["low", "medium", "high", "critical"] = "low"
        min_confidence: float = 0.60
        min_wet_area_percent: float = 0.0
        quiet_hours_enabled: bool = False
        quiet_hours_start: Optional[str] # HH:MM
        quiet_hours_end: Optional[str]    # HH:MM
        quiet_hours_timezone: Optional[str]
        is_active: bool = True
        # Webhook specific
        webhook_secret: Optional[str]
        webhook_method: Optional[str] = "POST"
        # Custom push title/body overrides
        push_title_template: Optional[str]
        push_body_template: Optional[str]
        created_at: datetime
        updated_at: datetime


notification_deliveries

    python

    class NotificationDelivery(BaseModel):
        id: str
        org_id: str
        rule_id: str
        channel: str
        recipient: str
        incident_id: Optional[str]
        detection_id: Optional[str]
        status: Literal["sent", "failed", "skipped_quiet_hours", "skipped_prefs"] = "sen
        attempts: int = 1
        http_status_code: Optional[int]
        response_body: Optional[str]
        error_message: Optional[str]
        fcm_message_id: Optional[str]
        sent_at: datetime
        # Index: org_id, rule_id, status, sent_at
                                                                                         


devices

    python

    class Device(BaseModel):
        id: str
        org_id: str
        store_id: str
        name: str
        device_type: Literal["sign", "alarm", "light", "speaker",
                              "tplink", "mqtt", "webhook", "other"]
        ip: Optional[str]                    # Device IP address
        protocol: Optional[str]              # Communication protocol
        edge_agent_id: Optional[str]         # FK -> edge_agents.id
        edge_device_id: Optional[str]        # Device ID on edge agent
        assigned_cameras: List[str] = []     # Camera IDs this device monitors
        trigger_on_any: bool = True          # Trigger on any assigned camera detection
        auto_off_seconds: int = 600          # Auto-deactivate after N seconds
        config: Dict[str, Any] = {}          # Device-specific config (IP, port, etc.)
        status: Literal["online", "offline", "triggered", "error"] = "offline"
        last_triggered: Optional[datetime]
        is_active: bool = True
        created_at: datetime
        updated_at: datetime
        # Indexes: org_id, store_id, device_type, status


system_logs

    python

    class SystemLog(BaseModel):
        id: str                              # UUID
        org_id: str
        level: Literal["info", "warning", "error", "critical"]
        source: str                          # e.g., "edge_agent", "inference", "worker"
        message: str
        details: Dict[str, Any] = {}
        timestamp: datetime
        # TTL: 30 days (configurable via SYSTEM_LOG_RETENTION_DAYS)
        # Indexes: (org_id, timestamp DESC), (level), (source)


audit_logs

    python

    class AuditLog(BaseModel):
        id: str                              # UUID
        org_id: str
        user_id: str                         # FK -> users.id
        user_email: str                      # Denormalized for display
        action: str                          # e.g., "create", "update", "delete", "login"
        resource_type: str                   # e.g., "store", "camera", "user", "model"
        resource_id: Optional[str] = None    # ID of affected resource
        details: Dict[str, Any] = {}         # Action-specific context
        ip_address: Optional[str] = None
        user_agent: Optional[str] = None
        timestamp: datetime
        # TTL: 365 days (configurable via AUDIT_LOG_RETENTION_DAYS)
        # Indexes: (org_id, timestamp DESC), (user_id), (action), (resource_type)



review_decisions

    python

    class ReviewDecision(BaseModel):
        id: str                              # UUID
        org_id: str
        detection_id: str                    # FK → detection_logs.id
        decision: Literal["confirmed", "rejected", "uncertain"]
        reviewed_by: str                     # FK → users.id
        reviewed_at: datetime
        notes: Optional[str] = None
        previous_decision: Optional[str] = None  # Previous decision if re-reviewed
        # Indexes: (org_id, detection_id), (reviewed_by), (decision)

═══════════════════════════════════════════════════════

