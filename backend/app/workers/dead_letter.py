"""Dead letter queue for permanently failed Celery tasks."""
import json
import traceback
import logging
from datetime import datetime, timezone
from celery import Task
from redis import Redis
from app.core.config import settings

log = logging.getLogger(__name__)
DLQ_KEY = "celery:dead_letter_queue"
DLQ_MAX_SIZE = 1000


class DeadLetterTask(Task):
    """Base task class that captures permanently failed tasks in a Redis DLQ."""
    abstract = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        try:
            redis_client = Redis.from_url(settings.CELERY_RESULT_BACKEND, socket_timeout=2)
            dead_letter = {
                "task_id": task_id,
                "task_name": self.name,
                "args": json.dumps(args, default=str),
                "kwargs": json.dumps(kwargs, default=str),
                "exception": str(exc),
                "traceback": traceback.format_exc()[:2000],
                "failed_at": datetime.now(timezone.utc).isoformat(),
            }
            pipe = redis_client.pipeline()
            pipe.lpush(DLQ_KEY, json.dumps(dead_letter))
            pipe.ltrim(DLQ_KEY, 0, DLQ_MAX_SIZE - 1)
            pipe.execute()
            log.warning("Task %s (%s) moved to dead letter queue", task_id, self.name)
        except Exception as e:
            log.error("Failed to write to DLQ: %s", e)
        super().on_failure(exc, task_id, args, kwargs, einfo)


def get_dead_letters(count: int = 50) -> list[dict]:
    """Fetch dead letters for review."""
    try:
        r = Redis.from_url(settings.CELERY_RESULT_BACKEND, socket_timeout=2)
        items = r.lrange(DLQ_KEY, 0, count - 1)
        return [json.loads(item) for item in items]
    except Exception:
        return []


def replay_dead_letter() -> dict | None:
    """Pop one dead letter and re-queue the task."""
    from app.workers.celery_app import celery_app
    try:
        r = Redis.from_url(settings.CELERY_RESULT_BACKEND, socket_timeout=2)
        raw = r.rpop(DLQ_KEY)
        if not raw:
            return None
        item = json.loads(raw)
        celery_app.send_task(
            item["task_name"],
            args=json.loads(item["args"]),
            kwargs=json.loads(item["kwargs"]),
        )
        return item
    except Exception:
        return None
