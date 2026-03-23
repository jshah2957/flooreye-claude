from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "flooreye",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    task_routes={
        "app.workers.detection_worker.*": {"queue": "detection"},
        "app.workers.notification_worker.*": {"queue": "notifications"},
    },
    beat_schedule={
        "auto-close-stale-incidents": {
            "task": "app.workers.incident_worker.auto_close_stale_incidents",
            "schedule": settings.AUTO_CLOSE_CHECK_INTERVAL_MINUTES * 60,  # convert to seconds
        },
        "daily-backup": {
            "task": "app.workers.backup_worker.run_backup",
            "schedule": crontab(hour=3, minute=0),
        },
    },
)

# Auto-discover tasks in workers package
celery_app.autodiscover_tasks(["app.workers"])
