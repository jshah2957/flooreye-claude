from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, IndexModel


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create all MongoDB indexes for every collection."""

    # users
    await db.users.create_indexes([
        IndexModel([("email", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("role", ASCENDING)]),
    ])

    # user_devices
    await db.user_devices.create_indexes([
        IndexModel([("user_id", ASCENDING)]),
        IndexModel([("user_id", ASCENDING), ("push_token", ASCENDING)], unique=True),
    ])

    # stores
    await db.stores.create_indexes([
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("is_active", ASCENDING)]),
    ])

    # cameras
    await db.cameras.create_indexes([
        IndexModel([("store_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("status", ASCENDING)]),
        IndexModel([("inference_mode", ASCENDING)]),
    ])

    # rois
    await db.rois.create_indexes([
        IndexModel([("camera_id", ASCENDING), ("is_active", ASCENDING)]),
    ])

    # dry_references
    await db.dry_references.create_indexes([
        IndexModel([("camera_id", ASCENDING), ("is_active", ASCENDING)]),
    ])

    # edge_agents
    await db.edge_agents.create_indexes([
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("store_id", ASCENDING)]),
        IndexModel([("status", ASCENDING)]),
    ])

    # detection_logs
    await db.detection_logs.create_indexes([
        IndexModel([("camera_id", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("store_id", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("org_id", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("is_wet", ASCENDING)]),
        IndexModel([("is_flagged", ASCENDING)]),
    ])

    # events (incidents)
    await db.events.create_indexes([
        IndexModel([("store_id", ASCENDING), ("start_time", DESCENDING)]),
        IndexModel([("camera_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("start_time", DESCENDING)]),
        IndexModel([("status", ASCENDING)]),
        IndexModel([("severity", ASCENDING)]),
    ])

    # clips
    await db.clips.create_indexes([
        IndexModel([("camera_id", ASCENDING)]),
        IndexModel([("store_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("status", ASCENDING)]),
    ])

    # dataset_frames
    await db.dataset_frames.create_indexes([
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("camera_id", ASCENDING)]),
        IndexModel([("split", ASCENDING)]),
        IndexModel([("included", ASCENDING)]),
        IndexModel([("label_source", ASCENDING)]),
    ])

    # annotations
    await db.annotations.create_indexes([
        IndexModel([("frame_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING)]),
    ])

    # model_versions
    await db.model_versions.create_indexes([
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("status", ASCENDING)]),
    ])

    # training_jobs
    await db.training_jobs.create_indexes([
        IndexModel([("org_id", ASCENDING)]),
        IndexModel([("status", ASCENDING)]),
    ])

    # detection_control_settings
    await db.detection_control_settings.create_indexes([
        IndexModel([("scope", ASCENDING), ("scope_id", ASCENDING)], unique=True),
    ])

    # detection_class_overrides
    await db.detection_class_overrides.create_indexes([
        IndexModel([("scope", ASCENDING), ("scope_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING)]),
    ])

    # integration_configs
    await db.integration_configs.create_indexes([
        IndexModel([("org_id", ASCENDING), ("service", ASCENDING)], unique=True),
    ])

    # notification_rules
    await db.notification_rules.create_indexes([
        IndexModel([("org_id", ASCENDING)]),
    ])

    # notification_deliveries
    await db.notification_deliveries.create_indexes([
        IndexModel([("rule_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("created_at", DESCENDING)]),
    ])

    # devices (IoT)
    await db.devices.create_indexes([
        IndexModel([("store_id", ASCENDING)]),
        IndexModel([("org_id", ASCENDING)]),
    ])

    # audit_logs
    await db.audit_logs.create_indexes([
        IndexModel([("org_id", ASCENDING), ("timestamp", DESCENDING)]),
        IndexModel([("user_id", ASCENDING)]),
        IndexModel([("action", ASCENDING)]),
    ])
