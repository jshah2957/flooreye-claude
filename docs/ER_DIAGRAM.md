I have all the data I need. Let me compile the complete ER diagram report.

---

# FloorEye v2.0 -- Complete Database Entity-Relationship Diagram Report

## Summary

**Total collections: 24** (21 from schemas.md + 3 additional discovered in code: `edge_commands`, `token_blacklist`, `integration_test_history`)

Note: `review_decisions` is defined in `docs/schemas.md` but has no implementation code (no `db.review_decisions` usage found in any service or router). `training_jobs` is defined in schemas.md and has a model file (`backend/app/models/training_job.py`) but no direct `db.training_jobs` usage was found in services/routers (likely handled by the Celery training worker outside the main app).

---

## COMPLETE TEXT-BASED ER DIAGRAM

```
┌──────────────────────────────────┐
│ organizations                    │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    name: str                     │
│    slug: str (unique)            │
│    plan: str (pilot/starter/...) │
│    max_stores: int               │
│    max_cameras: int              │
│    max_edge_agents: int          │
│    settings: dict                │
│    billing_email: Optional[str]  │
│    is_active: bool               │
│    created_at: datetime          │
│    updated_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (slug) unique               │
│ IDX: (is_active)                 │
├──────────────────────────────────┤
│ Services: organization_service   │
└──────────────────────────────────┘
        │
        │ 1:N (org has many users)
        │ 1:N (org has many stores)
        ▼

┌──────────────────────────────────┐
│ users                            │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    email: EmailStr (unique)      │
│    password_hash: str            │
│    name: str                     │
│    role: str (enum: super_admin, │
│      org_admin, ml_engineer,     │
│      operator, store_owner,      │
│      viewer)                     │
│    org_id: Optional[str]         │
│    store_access: List[str]       │
│    is_active: bool               │
│    last_login: Optional[datetime]│
│    created_at: datetime          │
│    updated_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (email) unique              │
│ IDX: (org_id)                    │
│ IDX: (role)                      │
├──────────────────────────────────┤
│ Services: auth_service           │
└──────────────────────────────────┘
        │
        │ 1:N
        ▼
┌──────────────────────────────────┐
│ user_devices                     │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│ FK user_id: str → users.id       │
│    org_id: str                   │
│    platform: str (ios|android)   │
│    push_token: str               │
│    app_version: str              │
│    device_model: Optional[str]   │
│    last_seen: datetime           │
│    created_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (user_id)                   │
│ IDX: (user_id, push_token) uniq  │
├──────────────────────────────────┤
│ Services: auth_service           │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ stores                           │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: str                   │
│    name: str                     │
│    address: str                  │
│    city: Optional[str]           │
│    state: Optional[str]          │
│    country: str = "US"           │
│    timezone: str                 │
│    settings: Dict[str, Any]      │
│    is_active: bool               │
│    created_at: datetime          │
│    updated_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (org_id)                    │
│ IDX: (org_id, is_active)         │
├──────────────────────────────────┤
│ Services: store_service,         │
│   camera_service, device_service,│
│   edge_service, mobile_service,  │
│   report_service                 │
└──────────────────────────────────┘
        │
        │ 1:N
        ▼
┌──────────────────────────────────┐
│ cameras                          │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│ FK store_id: str → stores.id     │
│    org_id: str (denormalized)    │
│    name: str                     │
│    stream_type: str (enum)       │
│    stream_url: str (encrypted)   │
│    credentials: Optional[str]    │
│    status: str (enum)            │
│    fps_config: int = 2           │
│    resolution: Optional[str]     │
│    floor_type: str (enum)        │
│    min_wet_area_percent: float   │
│    detection_enabled: bool       │
│    mask_outside_roi: bool        │
│    inference_mode: str (enum)    │
│    hybrid_threshold: float       │
│ FK edge_agent_id: Optional[str]  │
│      → edge_agents.id            │
│    student_model_version: Opt[str│
│    snapshot_base64: Optional[str]│
│    last_seen: Optional[datetime] │
│    created_at: datetime          │
│    updated_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (store_id)                  │
│ IDX: (org_id)                    │
│ IDX: (status)                    │
│ IDX: (inference_mode)            │
├──────────────────────────────────┤
│ Services: camera_service,        │
│   detection_service,             │
│   edge_camera_service,           │
│   mobile_service                 │
└──────────────────────────────────┘
        │
        │ 1:N                    1:N
        ├────────────────────────────────┐
        ▼                                ▼
┌────────────────────────┐  ┌────────────────────────────┐
│ rois                   │  │ dry_references             │
├────────────────────────┤  ├────────────────────────────┤
│ PK id: str (uuid)      │  │ PK id: str (uuid)          │
│ FK camera_id: str      │  │ FK camera_id: str           │
│    → cameras.id        │  │    → cameras.id             │
│    org_id: str         │  │    org_id: str              │
│    version: int        │  │    version: int             │
│    polygon_points:     │  │    frames: List[            │
│     List[ROIPoint]     │  │      DryReferenceFrame]     │
│    mask_outside: bool  │  │      (EMBEDDED docs)        │
│    is_active: bool     │  │    is_active: bool          │
│ FK created_by: str     │  │ FK created_by: str          │
│    → users.id          │  │    → users.id               │
│    created_at: datetime│  │    created_at: datetime     │
├────────────────────────┤  ├────────────────────────────┤
│ IDX: (id) unique       │  │ IDX: (id) unique           │
│ IDX: (camera_id,       │  │ IDX: (camera_id,           │
│       is_active)       │  │       is_active)           │
├────────────────────────┤  ├────────────────────────────┤
│ Services:              │  │ Services:                  │
│   camera_service       │  │   camera_service           │
└────────────────────────┘  └────────────────────────────┘


┌──────────────────────────────────┐
│ edge_agents                      │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: str                   │
│ FK store_id: str → stores.id     │
│    name: str                     │
│    token_hash: str (bcrypt)      │
│    agent_version: Optional[str]  │
│    current_model_version: Opt[str│
│    status: str (enum)            │
│    last_heartbeat: Optional[dt]  │
│    cpu_percent: Optional[float]  │
│    ram_percent: Optional[float]  │
│    disk_percent: Optional[float] │
│    gpu_percent: Optional[float]  │
│    inference_fps: Optional[float]│
│    buffer_frames: int            │
│    buffer_size_mb: float         │
│    tunnel_status: Optional[str]  │
│    tunnel_latency_ms: Opt[float] │
│    camera_count: int             │
│    cf_tunnel_id: Optional[str]   │
│    created_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (org_id)                    │
│ IDX: (store_id)                  │
│ IDX: (status)                    │
├──────────────────────────────────┤
│ Services: edge_service,          │
│   edge_camera_service,           │
│   edge_proxy_service,            │
│   mobile_service                 │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ detection_logs                   │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│ FK camera_id: str → cameras.id   │
│ FK store_id: str → stores.id     │
│    org_id: str                   │
│    timestamp: datetime           │
│    is_wet: bool                  │
│    confidence: float             │
│    wet_area_percent: float       │
│    inference_time_ms: float      │
│    frame_base64: Optional[str]   │
│    frame_s3_path: Optional[str]  │
│    annotated_frame_s3_path: Opt  │
│    predictions: List[Prediction] │
│      (EMBEDDED docs)             │
│    model_source: str (enum)      │
│    model_version_id: Opt[str]    │
│    student_confidence: Opt[float]│
│    escalated: bool               │
│    is_flagged: bool              │
│    idempotency_key: Optional[str]│
│      (sparse unique index)       │
│ FK incident_id: Optional[str]    │
│    → events.id                   │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (camera_id, timestamp DESC) │
│ IDX: (store_id, timestamp DESC)  │
│ IDX: (org_id, timestamp DESC)    │
│ IDX: (is_wet)                    │
│ IDX: (is_flagged)                │
│ IDX: (org_id, is_flagged,        │
│       timestamp DESC)            │
│ IDX: (org_id, is_wet,            │
│       timestamp DESC)            │
│ IDX: (idempotency_key) sparse    │
│       unique                     │
│ TTL: (timestamp) 90 days         │
├──────────────────────────────────┤
│ Services: detection_service,     │
│   mobile_service,                │
│   incident_service               │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ events (incidents)               │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│ FK store_id: str → stores.id     │
│ FK camera_id: str → cameras.id   │
│    org_id: str                   │
│    start_time: datetime          │
│    end_time: Optional[datetime]  │
│    max_confidence: float         │
│    max_wet_area_percent: float   │
│    severity: str (enum)          │
│    status: str (enum)            │
│ FK acknowledged_by: Opt[str]     │
│    → users.id                    │
│    acknowledged_at: Opt[datetime]│
│ FK resolved_by: Optional[str]    │
│    → users.id                    │
│    resolved_at: Opt[datetime]    │
│    detection_count: int          │
│    top_class_name: Opt[str]      │
│    device_trigger_enabled: Opt   │
│    devices_triggered: List[str]  │
│    notes: Optional[str]          │
│    roboflow_sync_status: str     │
│    edge_incident_id: Opt[str]    │
│    created_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (store_id, start_time DESC) │
│ IDX: (camera_id)                 │
│ IDX: (org_id, start_time DESC)   │
│ IDX: (status)                    │
│ IDX: (severity)                  │
│ IDX: (org_id, camera_id, status, │
│       start_time DESC)           │
│ IDX: (edge_incident_id) sparse   │
├──────────────────────────────────┤
│ Services: incident_service,      │
│   mobile_service                 │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ clips                            │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│ FK camera_id: str → cameras.id   │
│ FK store_id: str → stores.id     │
│    org_id: str                   │
│    file_path: str                │
│    thumbnail_path: Optional[str] │
│    duration: int (seconds)       │
│    file_size_mb: Optional[float] │
│    status: str (enum)            │
│    trigger: str (manual|incident)│
│ FK incident_id: Optional[str]    │
│    → events.id                   │
│    created_at: datetime          │
│    completed_at: Optional[dt]    │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (camera_id)                 │
│ IDX: (store_id)                  │
│ IDX: (org_id)                    │
│ IDX: (status)                    │
├──────────────────────────────────┤
│ Services: clips router (direct)  │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ dataset_frames                   │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: str                   │
│ FK camera_id: Optional[str]      │
│    → cameras.id                  │
│ FK store_id: Optional[str]       │
│    → stores.id                   │
│    frame_path: str (S3 URI)      │
│    thumbnail_path: Optional[str] │
│    label_class: Optional[str]    │
│    floor_type: Optional[str]     │
│    label_source: str (enum)      │
│    teacher_logits: Optional[dict]│
│    teacher_confidence: Opt[float]│
│ FK annotations_id: Optional[str] │
│    → annotations.id              │
│    roboflow_sync_status: str     │
│    split: str (enum)             │
│    included: bool                │
│    created_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (org_id)                    │
│ IDX: (camera_id)                 │
│ IDX: (split)                     │
│ IDX: (included)                  │
│ IDX: (label_source)              │
├──────────────────────────────────┤
│ Services: dataset_service        │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ annotations                      │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│ FK frame_id: str                 │
│    → dataset_frames.id           │
│    org_id: str                   │
│    bboxes: List[BBoxAnnotation]  │
│      (EMBEDDED docs)             │
│    annotated_by: str             │
│    source: str = "human"         │
│    created_at: datetime          │
│    updated_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (frame_id)                  │
│ IDX: (org_id)                    │
├──────────────────────────────────┤
│ Services: dataset_service        │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ model_versions                   │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: Optional[str]         │
│    version_str: str              │
│    architecture: str (enum)      │
│    param_count: Optional[int]    │
│    status: str (enum)            │
│ FK training_job_id: Optional[str]│
│    → training_jobs.id            │
│    frame_count: int              │
│    map_50: Optional[float]       │
│    map_50_95: Optional[float]    │
│    precision: Optional[float]    │
│    recall: Optional[float]       │
│    f1: Optional[float]           │
│    per_class_metrics: List[      │
│      PerClassMetric] (EMBEDDED)  │
│    onnx_path: Optional[str]      │
│    pt_path: Optional[str]        │
│    trt_path: Optional[str]       │
│    model_size_mb: Optional[float]│
│    promoted_to_staging_at: Opt   │
│ FK promoted_to_staging_by: Opt   │
│    → users.id                    │
│    promoted_to_production_at: Opt│
│ FK promoted_to_production_by: Opt│
│    → users.id                    │
│    created_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (org_id)                    │
│ IDX: (status)                    │
├──────────────────────────────────┤
│ Services: model_service,         │
│   edge_service,                  │
│   onnx_inference_service,        │
│   roboflow_model_service         │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ training_jobs                    │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: str                   │
│    status: str (enum)            │
│    config: TrainingJobConfig     │
│      (EMBEDDED doc)              │
│ FK triggered_by: str → users.id  │
│    celery_task_id: Optional[str] │
│    frames_used: int              │
│    current_epoch: Optional[int]  │
│    total_epochs: Optional[int]   │
│ FK resulting_model_id: Opt[str]  │
│    → model_versions.id           │
│    error_message: Optional[str]  │
│    log_path: Optional[str]       │
│    started_at: Optional[datetime]│
│    completed_at: Opt[datetime]   │
│    created_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique  [presumed]     │
│ IDX: (org_id, status) [presumed] │
├──────────────────────────────────┤
│ Services: (Celery training       │
│   worker -- not in main app)     │
│ NOTE: No db.training_jobs usage  │
│   found in services/routers      │
└──────────────────────────────────┘


┌──────────────────────────────────────┐
│ detection_control_settings           │
├──────────────────────────────────────┤
│ PK id: str (uuid)                    │
│    org_id: str                       │
│    scope: str (global|org|store|     │
│           camera)                    │
│    scope_id: Optional[str]           │
│    (scope_id references stores.id    │
│     or cameras.id depending on scope)│
│    layer1_enabled: Optional[bool]    │
│    layer1_confidence: Opt[float]     │
│    layer2_enabled: Optional[bool]    │
│    layer2_min_area_percent: Opt[fl]  │
│    layer3_enabled: Optional[bool]    │
│    layer3_k: Optional[int]           │
│    layer3_m: Optional[int]           │
│    layer3_voting_mode: Opt[str]      │
│    layer4_enabled: Optional[bool]    │
│    layer4_delta_threshold: Opt[fl]   │
│    layer4_auto_refresh: Opt[str]     │
│    layer4_refresh_time: Opt[str]     │
│    layer4_stale_warning_days: Opt    │
│    detection_enabled: Opt[bool]      │
│    capture_fps: Optional[int]        │
│    detection_interval_seconds: Opt   │
│    max_concurrent_detections: Opt    │
│    cooldown_after_alert_seconds: Opt │
│    business_hours_enabled: Opt[bool] │
│    business_hours_start: Opt[str]    │
│    business_hours_end: Opt[str]      │
│    business_hours_timezone: Opt[str] │
│    auto_create_incident: Opt[bool]   │
│    incident_grouping_window_seconds  │
│    auto_close_after_minutes: Opt     │
│    min_severity_to_create: Opt[str]  │
│    auto_notify_on_create: Opt[bool]  │
│    trigger_devices_on_create: Opt    │
│    severity_low_min..critical_max    │
│    severity_area_weight: Opt[float]  │
│    severity_confidence_weight: Opt   │
│    active_learning_enabled: Opt[bool]│
│    active_learning_sample_rate: Opt  │
│    active_learning_uncertainty_thr   │
│    active_learning_max_daily: Opt    │
│    hybrid_escalation_threshold: Opt  │
│    hybrid_max_escalations_per_min    │
│    hybrid_escalation_cooldown_sec    │
│    hybrid_save_escalated_frames: Opt │
│ FK updated_by: str → users.id       │
│    updated_at: datetime              │
│    created_at: datetime              │
├──────────────────────────────────────┤
│ IDX: (id) unique                     │
│ IDX: (org_id, scope, scope_id) uniq  │
├──────────────────────────────────────┤
│ Services: detection_control_service  │
└──────────────────────────────────────┘


┌──────────────────────────────────────┐
│ detection_class_overrides            │
├──────────────────────────────────────┤
│ PK id: str (uuid)                    │
│    org_id: str                       │
│    scope: str (global|org|store|     │
│           camera)                    │
│    scope_id: Optional[str]           │
│    class_id: str                     │
│    class_name: str (denormalized)    │
│    enabled: Optional[bool]           │
│    min_confidence: Optional[float]   │
│    min_area_percent: Optional[float] │
│    severity_mapping: Optional[str]   │
│    alert_on_detect: Optional[bool]   │
│    incident_enabled: Optional[bool]  │
│    incident_severity_override: Opt   │
│    incident_grouping_separate: Opt   │
│    device_trigger_enabled: Opt[bool] │
│ FK updated_by: str → users.id       │
│    updated_at: datetime              │
├──────────────────────────────────────┤
│ IDX: (id) unique                     │
│ IDX: (org_id, scope, scope_id,       │
│       class_id) unique               │
│ IDX: (scope, scope_id)              │
│ IDX: (org_id)                        │
├──────────────────────────────────────┤
│ Services: detection_control_service, │
│   validation_pipeline                │
└──────────────────────────────────────┘


┌──────────────────────────────────┐
│ integration_configs              │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: str                   │
│    service: str (enum: roboflow, │
│      smtp, webhook, sms, fcm,   │
│      s3, minio, r2, mqtt,       │
│      cloudflare-tunnel, mongodb, │
│      redis)                      │
│    config_encrypted: str         │
│      (AES-256-GCM)              │
│    status: str (enum)            │
│    last_tested: Optional[dt]     │
│    last_test_result: Opt[str]    │
│    last_test_response_ms: Opt    │
│    last_test_error: Opt[str]     │
│ FK updated_by: str → users.id   │
│    updated_at: datetime          │
│    created_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (org_id, service) unique    │
├──────────────────────────────────┤
│ Services: integration_service    │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ notification_rules               │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: str                   │
│    name: Optional[str]           │
│    channel: str (enum)           │
│    recipients: List[str]         │
│ FK store_id: Optional[str]       │
│    → stores.id                   │
│ FK camera_id: Optional[str]      │
│    → cameras.id                  │
│    min_severity: str (enum)      │
│    min_confidence: float         │
│    min_wet_area_percent: float   │
│    quiet_hours_enabled: bool     │
│    quiet_hours_start: Opt[str]   │
│    quiet_hours_end: Opt[str]     │
│    quiet_hours_timezone: Opt[str]│
│    is_active: bool               │
│    webhook_secret: Opt[str]      │
│    webhook_method: Opt[str]      │
│    push_title_template: Opt[str] │
│    push_body_template: Opt[str]  │
│    created_at: datetime          │
│    updated_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (org_id)                    │
│ IDX: (org_id, is_active,         │
│       min_severity)              │
├──────────────────────────────────┤
│ Services: notification_service   │
└──────────────────────────────────┘
        │
        │ 1:N
        ▼
┌──────────────────────────────────┐
│ notification_deliveries          │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: str                   │
│ FK rule_id: str                  │
│    → notification_rules.id       │
│    channel: str                  │
│    recipient: str                │
│ FK incident_id: Optional[str]    │
│    → events.id                   │
│ FK detection_id: Optional[str]   │
│    → detection_logs.id           │
│    status: str (enum)            │
│    attempts: int                 │
│    http_status_code: Opt[int]    │
│    response_body: Opt[str]       │
│    error_message: Opt[str]       │
│    fcm_message_id: Opt[str]      │
│    sent_at: datetime             │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (rule_id)                   │
│ IDX: (org_id, sent_at DESC)      │
│ IDX: (status)                    │
│ IDX: (org_id, rule_id, status,   │
│       sent_at DESC)              │
│ IDX: (incident_id, rule_id,      │
│       recipient)                 │
├──────────────────────────────────┤
│ Services: notification_service   │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ devices (IoT)                    │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: str                   │
│ FK store_id: str → stores.id     │
│    name: str                     │
│    device_type: str (enum)       │
│    control_method: str           │
│    control_url: Optional[str]    │
│    ip: Optional[str]             │
│    protocol: Optional[str]       │
│    mqtt_topic: Optional[str]     │
│    trigger_payload: Opt[dict]    │
│    reset_payload: Opt[dict]      │
│    status: str (enum)            │
│    last_triggered: Opt[datetime] │
│    is_active: bool               │
│ FK edge_agent_id: Optional[str]  │
│    → edge_agents.id              │
│    edge_device_id: Optional[str] │
│    assigned_cameras: List[str]   │
│    trigger_on_any: bool          │
│    auto_off_seconds: int         │
│    created_at: datetime          │
│    updated_at: datetime          │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (store_id)                  │
│ IDX: (org_id)                    │
├──────────────────────────────────┤
│ Services: device_service,        │
│   edge_device_service,           │
│   incident_service               │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ system_logs                      │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: str                   │
│    level: str (enum)             │
│    source: str                   │
│    message: str                  │
│    details: Dict[str, Any]       │
│    timestamp: datetime           │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (org_id, timestamp DESC)    │
│ IDX: (level)                     │
│ IDX: (source)                    │
│ TTL: (timestamp) 30 days         │
├──────────────────────────────────┤
│ Services: system_log_service,    │
│   mobile_service, logs router    │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ audit_logs                       │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: str                   │
│ FK user_id: str → users.id       │
│    user_email: str (denormalized)│
│    action: str                   │
│    resource_type: str            │
│    resource_id: Optional[str]    │
│    details: Dict[str, Any]       │
│    ip_address: Optional[str]     │
│    user_agent: Optional[str]     │
│    timestamp: datetime           │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (org_id, created_at DESC)   │
│ IDX: (user_id)                   │
│ IDX: (action)                    │
│ IDX: (resource_type)             │
│ TTL: (created_at) 365 days       │
├──────────────────────────────────┤
│ Services: audit_service          │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ review_decisions                 │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│    org_id: str                   │
│ FK detection_id: str             │
│    → detection_logs.id           │
│    decision: str (enum)          │
│ FK reviewed_by: str → users.id   │
│    reviewed_at: datetime         │
│    notes: Optional[str]          │
│    previous_decision: Opt[str]   │
├──────────────────────────────────┤
│ IDX: (org_id, detection_id)      │
│ IDX: (reviewed_by)               │
│ IDX: (decision)                  │
│ [per schemas.md -- no indexes.py │
│  entry; no service implementation│
│  found]                          │
├──────────────────────────────────┤
│ Services: NONE (schema only)     │
└──────────────────────────────────┘


=== ADDITIONAL COLLECTIONS (not in schemas.md, found in code) ===


┌──────────────────────────────────┐
│ edge_commands                    │
├──────────────────────────────────┤
│ PK id: str (uuid)                │
│ FK agent_id: str                 │
│    → edge_agents.id              │
│    status: str                   │
│    (+ other command fields)      │
├──────────────────────────────────┤
│ IDX: (id) unique                 │
│ IDX: (agent_id, status)          │
├──────────────────────────────────┤
│ Services: edge_service,          │
│   model_service,                 │
│   ota_worker                     │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ token_blacklist                  │
├──────────────────────────────────┤
│    jti: str (JWT ID)             │
│ FK user_id: str → users.id       │
│    expires_at: datetime          │
├──────────────────────────────────┤
│ IDX: (jti)                       │
│ IDX: (user_id)                   │
│ TTL: (expires_at) auto-expire    │
├──────────────────────────────────┤
│ Services: auth router,           │
│   dependencies.py                │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ password_reset_tokens            │
├──────────────────────────────────┤
│    token: str (unique)           │
│ FK user_id: str → users.id       │
│    email: str                    │
│    expires_at: datetime          │
│    used: bool                    │
│    created_at: datetime          │
├──────────────────────────────────┤
│ IDX: (token) unique              │
│ IDX: (user_id)                   │
│ TTL: (expires_at) auto-expire    │
├──────────────────────────────────┤
│ Services: auth_service           │
└──────────────────────────────────┘


┌──────────────────────────────────┐
│ integration_test_history         │
├──────────────────────────────────┤
│    org_id: str                   │
│    service: str                  │
│    tested_at: datetime           │
│    (+ test result fields)        │
├──────────────────────────────────┤
│ IDX: none defined in indexes.py  │
├──────────────────────────────────┤
│ Services: integration_service,   │
│   integrations router            │
└──────────────────────────────────┘
```

---

## ALL RELATIONSHIPS (with cardinality)

```
RELATIONSHIP DIAGRAM (arrows show FK direction, cardinality noted)

organizations ─────1:N────→ stores        (org has many stores)
organizations ─────1:N────→ users         (org has many users)
organizations ─────1:N────→ cameras       (org has many cameras, via org_id)
organizations ─────1:N────→ edge_agents   (org has many agents)

users ─────1:N────→ password_reset_tokens (user may have reset tokens)
users ─────1:N────→ user_devices          (user has many mobile devices)
users ─────1:N────→ audit_logs            (user generates many audit entries)
users ─────1:N────→ review_decisions      (user reviews many detections)
users ─────1:N────→ token_blacklist       (user has many blacklisted tokens)

stores ────1:N────→ cameras               (store has many cameras)
stores ────1:N────→ edge_agents           (store has many edge agents)
stores ────1:N────→ devices               (store has many IoT devices)
stores ────1:N────→ events                (store has many incidents)
stores ────1:N────→ detection_logs        (store has many detections)
stores ────1:N────→ clips                 (store has many clips)
stores ────1:N────→ dataset_frames        (store may have many dataset frames)

cameras ───1:N────→ rois                  (camera has many ROI versions)
cameras ───1:N────→ dry_references        (camera has many dry ref versions)
cameras ───1:N────→ detection_logs        (camera generates many detections)
cameras ───1:N────→ events                (camera generates many incidents)
cameras ───1:N────→ clips                 (camera has many clips)
cameras ───1:N────→ dataset_frames        (camera may source many frames)
cameras ───N:1────→ edge_agents           (camera optionally assigned to agent)

edge_agents─1:N───→ edge_commands         (agent has many pending commands)
edge_agents─1:N───→ devices               (agent optionally controls devices)

events ────1:N────→ detection_logs        (incident groups many detections)
events ────1:N────→ clips                 (incident may trigger many clips)
events ────1:N────→ notification_deliveries (incident triggers notifications)

detection_logs─1:N→ review_decisions      (detection has many review decisions)
detection_logs─N:1→ events                (detection belongs to one incident)

notification_rules─1:N→ notification_deliveries (rule generates deliveries)
notification_rules─N:1→ stores            (rule optionally scoped to store)
notification_rules─N:1→ cameras           (rule optionally scoped to camera)

dataset_frames─1:1→ annotations           (frame has one annotation set)
annotations ──N:1──→ dataset_frames       (annotation references one frame)

model_versions─N:1→ training_jobs         (model produced by one training job)
training_jobs ─1:1→ model_versions        (job produces one model, bidirectional)

integration_configs → (standalone, org-scoped)
detection_control_settings → (scope polymorphic: references stores or cameras via scope_id)
detection_class_overrides  → (scope polymorphic: references stores or cameras via scope_id)
```

---

## EMBEDDED DOCUMENTS (not separate collections)

| Parent Collection | Embedded Type | Description |
|---|---|---|
| detection_logs | `Prediction` (list) | Bounding boxes + class predictions per frame |
| detection_logs | `BoundingBox` | Coordinates within Prediction |
| rois | `ROIPoint` (list) | Polygon vertices (normalized x,y) |
| dry_references | `DryReferenceFrame` (list) | 3-10 baseline frames with scores |
| annotations | `BBoxAnnotation` (list) | COCO-format bounding box labels |
| model_versions | `PerClassMetric` (list) | Per-class AP/precision/recall |
| training_jobs | `TrainingJobConfig` (single) | Training hyperparameters |

---

## CASCADE / DELETION BEHAVIOR

There is **no automatic cascade deletion** in MongoDB. The codebase handles related cleanup manually in specific cases:

- **dataset_frames deletion**: `dataset_service.py` explicitly deletes related `annotations` when a frame is deleted (`db.annotations.delete_many({"frame_id": frame_id})`)
- **edge_agents deletion**: `edge_service.py` deletes related `edge_commands` (`db.edge_commands.delete_many({"agent_id": agent_id})`)
- **ROI updates**: `camera_service.py` deactivates old ROIs (sets `is_active: False`) when creating new version -- soft delete pattern
- **Dry reference updates**: Same soft-delete versioning pattern as ROIs
- **token_blacklist**: Auto-expired via MongoDB TTL index on `expires_at`
- **system_logs**: Auto-expired via TTL index (30 days)
- **audit_logs**: Auto-expired via TTL index (365 days)
- **All other deletions**: No cascading -- orphaned references remain (e.g., deleting a store does not auto-delete its cameras)

---

## MULTI-TENANCY PATTERN

Nearly every collection includes an `org_id` field for tenant isolation. The helper `org_query(org_id)` is used throughout services to scope all queries to the current organization. The only exception is `users` where `org_id` is optional (None for super_admin).

---

## KEY SOURCE FILES

- `/docs/schemas.md` -- Official schema definitions (21 collections)
- `/backend/app/db/indexes.py` -- All MongoDB indexes (24 collections including edge_commands, token_blacklist)
- `/backend/app/models/` -- 17 Pydantic model files
- `/backend/app/services/` -- 25 service files with db access
- `/backend/app/routers/` -- 26 router files (some with direct db access)