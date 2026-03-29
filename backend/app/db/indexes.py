from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, IndexModel


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create all MongoDB indexes for every collection."""

    # users
    await db.users.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("email", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("role", ASCENDING)]),
    ])

    # user_devices
    await db.user_devices.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("user_id", ASCENDING)]),
        IndexModel([("user_id", ASCENDING), ("push_token", ASCENDING)], unique=True),
    ])

    # stores
    await db.stores.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("is_active", ASCENDING)]),
    ])

    # cameras
    await db.cameras.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("store_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("status", ASCENDING)]),
        IndexModel([("inference_mode", ASCENDING)]),
    ])

    # rois
    await db.rois.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("camera_id", ASCENDING), ("is_active", ASCENDING)]),
    ])

    # dry_references
    await db.dry_references.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("camera_id", ASCENDING), ("is_active", ASCENDING)]),
    ])

    # edge_agents
    await db.edge_agents.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("store_id", ASCENDING)]),
        IndexModel([("status", ASCENDING)]),
    ])

    # detection_logs
    from app.core.config import settings as _dl_settings
    await db.detection_logs.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("camera_id", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("store_id", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("org_id", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("is_wet", ASCENDING)]),
        IndexModel([("is_flagged", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("is_flagged", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("org_id", ASCENDING), ("is_wet", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("timestamp", ASCENDING)], expireAfterSeconds=_dl_settings.DETECTION_LOG_RETENTION_DAYS * 86400, name="ttl_timestamp"),
        IndexModel([("incident_id", ASCENDING)], sparse=True, name="idx_incident_id"),
        IndexModel([("org_id", ASCENDING), ("model_source", ASCENDING), ("timestamp", DESCENDING)], name="idx_org_model_ts"),
        IndexModel([("idempotency_key", ASCENDING)], sparse=True, unique=True, name="idx_idempotency"),
    ])

    # events (incidents)
    await db.events.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("store_id", ASCENDING), ("start_time", DESCENDING)]),
        IndexModel([("camera_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("start_time", DESCENDING)]),
        IndexModel([("status", ASCENDING)]),
        IndexModel([("severity", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("camera_id", ASCENDING), ("status", ASCENDING), ("start_time", DESCENDING)]),
        IndexModel([("edge_incident_id", ASCENDING)], sparse=True),
        IndexModel([("org_id", ASCENDING), ("store_id", ASCENDING), ("status", ASCENDING), ("start_time", DESCENDING)], name="idx_org_store_status_ts"),
    ])

    # clips
    await db.clips.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("camera_id", ASCENDING)]),
        IndexModel([("store_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("status", ASCENDING)]),
    ])

    # dataset_frames
    await db.dataset_frames.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("camera_id", ASCENDING)]),
        IndexModel([("split", ASCENDING)]),
        IndexModel([("included", ASCENDING)]),
        IndexModel([("label_source", ASCENDING)]),
        IndexModel([("folder_id", ASCENDING)]),
        IndexModel([("roboflow_sync_status", ASCENDING)]),
    ])

    # dataset_folders
    await db.dataset_folders.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("parent_folder_id", ASCENDING)]),
        IndexModel([("name", ASCENDING)]),
    ])

    # annotations
    await db.annotations.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("frame_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING)]),
    ])

    # model_versions
    await db.model_versions.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("status", ASCENDING)]),
    ])

    # detection_classes
    await db.detection_classes.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING), ("name", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING)]),
    ])

    # detection_control_settings
    await db.detection_control_settings.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING), ("scope", ASCENDING), ("scope_id", ASCENDING)], unique=True),
    ])

    # detection_class_overrides
    await db.detection_class_overrides.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING), ("scope", ASCENDING), ("scope_id", ASCENDING), ("class_id", ASCENDING)], unique=True),
        IndexModel([("scope", ASCENDING), ("scope_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING)]),
    ])

    # integration_configs
    await db.integration_configs.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING), ("service", ASCENDING)], unique=True),
    ])

    # notification_rules
    await db.notification_rules.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("is_active", ASCENDING), ("min_severity", ASCENDING)]),
    ])

    # notification_deliveries
    await db.notification_deliveries.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("rule_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("sent_at", DESCENDING)]),
        IndexModel([("status", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("rule_id", ASCENDING), ("status", ASCENDING), ("sent_at", DESCENDING)]),
        IndexModel([("incident_id", ASCENDING), ("rule_id", ASCENDING), ("recipient", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("incident_id", ASCENDING), ("status", ASCENDING), ("sent_at", DESCENDING)]),
    ])

    # devices (IoT)
    await db.devices.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("store_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING)]),
    ])

    # audit_logs
    from app.core.config import settings as _settings
    _audit_ttl = _settings.AUDIT_LOG_RETENTION_DAYS * 86400  # days → seconds
    await db.audit_logs.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("user_id", ASCENDING)]),
        IndexModel([("action", ASCENDING)]),
        IndexModel([("resource_type", ASCENDING)]),
        IndexModel([("timestamp", ASCENDING)], expireAfterSeconds=_audit_ttl),
    ])

    # edge_commands
    await db.edge_commands.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("agent_id", ASCENDING), ("status", ASCENDING)]),
    ])

    # system_logs (TTL: auto-remove old entries based on retention setting)
    from app.core.config import settings
    ttl_seconds = settings.SYSTEM_LOG_RETENTION_DAYS * 86400  # days → seconds

    await db.system_logs.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("level", ASCENDING)]),
        IndexModel([("source", ASCENDING)]),
        IndexModel([("source_device", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("device_id", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("timestamp", ASCENDING)], expireAfterSeconds=ttl_seconds),
    ])

    # token_blacklist (TTL: auto-remove expired entries)
    await db.token_blacklist.create_indexes([
        IndexModel([("jti", ASCENDING)]),
        IndexModel([("user_id", ASCENDING)]),
        IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0),
    ])

    # organizations
    await db.organizations.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("slug", ASCENDING)], unique=True),
        IndexModel([("is_active", ASCENDING)]),
    ])

    # password_reset_tokens
    await db.password_reset_tokens.create_indexes([
        IndexModel([("token", ASCENDING)], unique=True),
        IndexModel([("user_id", ASCENDING)]),
        IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0, name="ttl_expires"),
    ])
